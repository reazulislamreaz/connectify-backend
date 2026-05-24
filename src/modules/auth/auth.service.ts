import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User } from "./auth.model";
import { signToken } from "../../utils/jwt";
import { AppError } from "../../utils/AppError";
import { resolveImageUrl, deleteFromS3ByUrl } from "../../config/s3";
import { USER_PROFILE_SELECT, USER_EXISTS_SELECT } from "../../constants/queryFields";
import { Message } from "../message/message.model";
import { Post, PostLike, Comment } from "../post/post.model";
import { FriendRequest } from "../friendRequest/friendRequest.model";
import { cache } from "../../cache/cache.service";
import { cacheInvalidate } from "../../cache/invalidate";
import { keys, TTL } from "../../cache/keys";

const SALT_ROUNDS = 12;

export class AuthService {
  async register(name: string, email: string, password: string) {
    const existing = await User.findOne({ email })
      .select(USER_EXISTS_SELECT)
      .lean();
    if (existing) {
      throw new AppError(409, "Email already registered");
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ name, email, password: hashedPassword });

    const token = signToken({ userId: user._id.toString(), email: user.email });

    return {
      token,
      user: this.formatUser(user),
    };
  }

  async login(email: string, password: string) {
    const user = await User.findOne({ email })
      .select(`+password ${USER_PROFILE_SELECT}`)
      .lean();
    if (!user) {
      throw new AppError(401, "Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError(401, "Invalid email or password");
    }

    const token = signToken({ userId: user._id.toString(), email: user.email });

    return {
      token,
      user: this.formatUser(user),
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const user = await User.findById(userId).select("+password").lean();
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new AppError(401, "Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });
    await cacheInvalidate.authMe(userId);

    return { message: "Password changed successfully" };
  }

  async deleteAccount(userId: string, password: string) {
    const user = await User.findById(userId).select("+password profilePicture").lean();
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError(401, "Password is incorrect");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [userMessages, userPosts] = await Promise.all([
      Message.find({
        $and: [
          {
            $or: [{ senderId: userObjectId }, { receiverId: userObjectId }],
          },
          { $or: [{ imageUrl: { $ne: "" } }, { voiceUrl: { $ne: "" } }] },
        ],
      })
        .select("imageUrl voiceUrl")
        .lean(),
      Post.find({ authorId: userObjectId, imageUrl: { $ne: "" } })
        .select("imageUrl")
        .lean(),
    ]);

    const s3Urls = [
      user.profilePicture,
      ...userMessages.flatMap((m) => [m.imageUrl, m.voiceUrl].filter(Boolean)),
      ...userPosts.map((p) => p.imageUrl),
    ].filter(Boolean) as string[];

    const userPostIds = await Post.find({ authorId: userObjectId }).distinct("_id");

    await Promise.all([
      Message.deleteMany({
        $or: [{ senderId: userObjectId }, { receiverId: userObjectId }],
      }),
      PostLike.deleteMany({ userId: userObjectId }),
      PostLike.deleteMany({ postId: { $in: userPostIds } }),
      Comment.deleteMany({ authorId: userObjectId }),
      Comment.deleteMany({ postId: { $in: userPostIds } }),
      Post.deleteMany({ authorId: userObjectId }),
      FriendRequest.deleteMany({
        $or: [{ senderId: userObjectId }, { receiverId: userObjectId }],
      }),
      User.findByIdAndDelete(userId),
    ]);

    await Promise.all(
      s3Urls.map((url) => deleteFromS3ByUrl(resolveImageUrl(url)))
    );

    await cacheInvalidate.userProfile(userId);
    await cacheInvalidate.friends(userId);
    await cacheInvalidate.chatList(userId);

    return { message: "Account deleted successfully" };
  }

  async getMe(userId: string) {
    return cache.getOrSet(keys.authMe(userId), TTL.AUTH_ME, () =>
      this.fetchMe(userId)
    );
  }

  private async fetchMe(userId: string) {
    const user = await User.findById(userId)
      .select(USER_PROFILE_SELECT)
      .lean();
    if (!user) {
      throw new AppError(404, "User not found");
    }

    const dateOfBirth = user.dateOfBirth
      ? new Date(user.dateOfBirth).toISOString().split("T")[0]
      : "";

    return {
      ...this.formatUser(user),
      address: user.address ?? "",
      professional: user.professional ?? "",
      religious: user.religious ?? "",
      hobby: user.hobby ?? "",
      relationStatus: user.relationStatus ?? "",
      dateOfBirth,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
    };
  }

  private formatUser(user: {
    _id: { toString(): string };
    name: string;
    email: string;
    profilePicture?: string;
    address?: string;
    professional?: string;
    religious?: string;
    hobby?: string;
    dateOfBirth?: Date;
  }) {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      profilePicture: resolveImageUrl(user.profilePicture),
    };
  }
}

export const authService = new AuthService();
