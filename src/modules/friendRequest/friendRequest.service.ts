import mongoose from "mongoose";
import { FriendRequest } from "./friendRequest.model";
import { User } from "../auth/auth.model";
import { AppError } from "../../utils/AppError";
import {
  isPopulatedUser,
  formatPopulatedUser,
  PopulatedUser,
} from "../../utils/populatedUser";
import {
  FRIEND_REQUEST_SELECT,
  USER_EXISTS_SELECT,
} from "../../constants/queryFields";
import { cache } from "../../cache/cache.service";
import { cacheInvalidate } from "../../cache/invalidate";
import { keys, TTL } from "../../cache/keys";

const POPULATE_USER_FIELDS = "name email profilePicture isOnline lastSeen";

export class FriendRequestService {
  async sendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) {
      throw new AppError(400, "Cannot send request to yourself");
    }

    const receiver = await User.findById(receiverId)
      .select(USER_EXISTS_SELECT)
      .lean();
    if (!receiver) {
      throw new AppError(404, "User not found");
    }

    const existing = await FriendRequest.findOne({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    })
      .select(FRIEND_REQUEST_SELECT)
      .lean();

    if (existing) {
      if (existing.status === "accepted") {
        throw new AppError(409, "You are already friends");
      }
      if (existing.status === "pending") {
        throw new AppError(409, "Friend request already pending");
      }
      if (existing.status === "rejected") {
        if (existing.senderId.toString() === senderId) {
          await FriendRequest.findByIdAndUpdate(existing._id, { status: "pending" });
          await cacheInvalidate.relation(senderId, receiverId);
          await cacheInvalidate.friendRequests(senderId);
          await cacheInvalidate.friendRequests(receiverId);
          return this.populateRequest(existing._id.toString());
        }
        throw new AppError(409, "Previous request was rejected");
      }
    }

    const request = await FriendRequest.create({ senderId, receiverId });
    await cacheInvalidate.relation(senderId, receiverId);
    await cacheInvalidate.friendRequests(senderId);
    await cacheInvalidate.friendRequests(receiverId);
    return this.populateRequest(request._id.toString());
  }

  async respondToRequest(
    requestId: string,
    receiverId: string,
    action: "accept" | "reject"
  ) {
    const request = await FriendRequest.findById(requestId)
      .select(FRIEND_REQUEST_SELECT)
      .lean();
    if (!request) {
      throw new AppError(404, "Friend request not found");
    }

    if (request.receiverId.toString() !== receiverId) {
      throw new AppError(403, "Not authorized to respond to this request");
    }

    if (request.status !== "pending") {
      throw new AppError(400, "Request already processed");
    }

    await FriendRequest.findByIdAndUpdate(requestId, {
      status: action === "accept" ? "accepted" : "rejected",
    });

    const otherUserId =
      request.senderId.toString() === receiverId
        ? request.receiverId.toString()
        : request.senderId.toString();
    await cacheInvalidate.onFriendChange(receiverId, otherUserId);

    return this.populateRequest(requestId);
  }

  async cancelRequest(requestId: string, senderId: string) {
    const request = await FriendRequest.findById(requestId)
      .select(FRIEND_REQUEST_SELECT)
      .lean();
    if (!request) {
      throw new AppError(404, "Friend request not found");
    }

    if (request.senderId.toString() !== senderId) {
      throw new AppError(403, "Not authorized to cancel this request");
    }

    if (request.status !== "pending") {
      throw new AppError(400, "Only pending requests can be cancelled");
    }

    const receiverId = request.receiverId.toString();
    await FriendRequest.findByIdAndDelete(requestId);
    await cacheInvalidate.relation(senderId, receiverId);
    await cacheInvalidate.friendRequests(senderId);
    await cacheInvalidate.friendRequests(receiverId);

    return { id: requestId, cancelled: true };
  }

  async getPendingReceived(userId: string) {
    return cache.getOrSet(
      keys.friendReqReceived(userId),
      TTL.FRIENDREQ,
      () => this.fetchPendingReceived(userId)
    );
  }

  private async fetchPendingReceived(userId: string) {
    const requests = await FriendRequest.find({
      receiverId: userId,
      status: "pending",
    })
      .select(FRIEND_REQUEST_SELECT)
      .populate("senderId", POPULATE_USER_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    return requests.map((r) => {
      if (!isPopulatedUser(r.senderId)) {
        throw new AppError(500, "Failed to populate sender");
      }
      return {
        id: r._id.toString(),
        sender: formatPopulatedUser(r.senderId),
        status: r.status,
        createdAt: r.createdAt,
      };
    });
  }

  async getPendingSent(userId: string) {
    return cache.getOrSet(
      keys.friendReqSent(userId),
      TTL.FRIENDREQ,
      () => this.fetchPendingSent(userId)
    );
  }

  private async fetchPendingSent(userId: string) {
    const requests = await FriendRequest.find({
      senderId: userId,
      status: "pending",
    })
      .select(FRIEND_REQUEST_SELECT)
      .populate("receiverId", POPULATE_USER_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    return requests.map((r) => {
      if (!isPopulatedUser(r.receiverId)) {
        throw new AppError(500, "Failed to populate receiver");
      }
      return {
        id: r._id.toString(),
        receiver: formatPopulatedUser(r.receiverId),
        status: r.status,
        createdAt: r.createdAt,
      };
    });
  }

  async getFriends(userId: string) {
    return cache.getOrSet(keys.friends(userId), TTL.FRIENDS, () =>
      this.fetchFriends(userId)
    );
  }

  /** Friend user IDs only — used for presence broadcasts. */
  async getFriendIds(userId: string): Promise<string[]> {
    const friendships = await FriendRequest.find({
      status: "accepted",
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .select("senderId receiverId")
      .lean();

    return friendships.map((f) =>
      f.senderId.toString() === userId
        ? f.receiverId.toString()
        : f.senderId.toString(),
    );
  }

  private async fetchFriends(userId: string) {
    const friendships = await FriendRequest.find({
      status: "accepted",
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .select(FRIEND_REQUEST_SELECT)
      .populate("senderId", POPULATE_USER_FIELDS)
      .populate("receiverId", POPULATE_USER_FIELDS)
      .lean();

    return friendships.map((f) => {
      if (!isPopulatedUser(f.senderId) || !isPopulatedUser(f.receiverId)) {
        throw new AppError(500, "Failed to populate friends");
      }
      const sender = f.senderId;
      const receiver = f.receiverId;
      const friend: PopulatedUser =
        sender._id.toString() === userId ? receiver : sender;

      return {
        friendshipId: f._id.toString(),
        ...formatPopulatedUser(friend),
      };
    });
  }

  async getRelationshipStatus(currentUserId: string, otherUserId: string) {
    if (currentUserId === otherUserId) {
      return { status: "self" as const };
    }

    return cache.getOrSet(
      keys.relation(currentUserId, otherUserId),
      TTL.RELATION,
      () => this.fetchRelationshipStatus(currentUserId, otherUserId)
    );
  }

  private async fetchRelationshipStatus(
    currentUserId: string,
    otherUserId: string
  ) {
    const request = await FriendRequest.findOne({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    })
      .select("_id senderId receiverId status")
      .lean();

    return this.relationshipFromRequest(currentUserId, request);
  }

  private relationshipFromRequest(
    currentUserId: string,
    request: {
      _id: { toString(): string };
      senderId: { toString(): string };
      status: string;
    } | null
  ) {
    if (!request) {
      return { status: "none" as const };
    }

    if (request.status === "accepted") {
      return { status: "friends" as const, requestId: request._id.toString() };
    }

    if (request.status === "pending") {
      if (request.senderId.toString() === currentUserId) {
        return {
          status: "pending_sent" as const,
          requestId: request._id.toString(),
        };
      }
      return {
        status: "pending_received" as const,
        requestId: request._id.toString(),
      };
    }

    return { status: "none" as const };
  }

  async getRelationshipStatusesForUsers(
    currentUserId: string,
    otherUserIds: string[]
  ) {
    if (otherUserIds.length === 0) {
      return new Map<string, ReturnType<typeof this.relationshipFromRequest>>();
    }

    const objectIds = otherUserIds.map((id) => new mongoose.Types.ObjectId(id));
    const requests = await FriendRequest.find({
      $or: [
        { senderId: currentUserId, receiverId: { $in: objectIds } },
        { senderId: { $in: objectIds }, receiverId: currentUserId },
      ],
    })
      .select("_id senderId receiverId status")
      .lean();

    const requestByOtherId = new Map<
      string,
      {
        _id: { toString(): string };
        senderId: { toString(): string };
        status: string;
      }
    >();

    for (const request of requests) {
      const otherId =
        request.senderId.toString() === currentUserId
          ? request.receiverId.toString()
          : request.senderId.toString();
      requestByOtherId.set(otherId, request);
    }

    const relationships = new Map<
      string,
      ReturnType<typeof this.relationshipFromRequest>
    >();

    for (const otherUserId of otherUserIds) {
      relationships.set(
        otherUserId,
        this.relationshipFromRequest(
          currentUserId,
          requestByOtherId.get(otherUserId) ?? null
        )
      );
    }

    return relationships;
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    const cacheKey = keys.friendship(userId1, userId2);
    const cached = await cache.get<boolean>(cacheKey);
    if (cached !== null) return cached;

    const friendship = await FriendRequest.findOne({
      status: "accepted",
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
    })
      .select("_id")
      .lean();
    const result = !!friendship;
    await cache.set(cacheKey, result, TTL.FRIENDSHIP);
    return result;
  }

  private async populateRequest(requestId: string) {
    const request = await FriendRequest.findById(requestId)
      .select(FRIEND_REQUEST_SELECT)
      .populate("senderId", "name email profilePicture")
      .populate("receiverId", "name email profilePicture")
      .lean();

    if (!request) {
      throw new AppError(404, "Request not found");
    }

    if (!isPopulatedUser(request.senderId) || !isPopulatedUser(request.receiverId)) {
      throw new AppError(500, "Failed to populate request");
    }

    return {
      id: request._id.toString(),
      sender: formatPopulatedUser(request.senderId),
      receiver: formatPopulatedUser(request.receiverId),
      status: request.status,
      createdAt: request.createdAt,
    };
  }
}

export const friendRequestService = new FriendRequestService();
