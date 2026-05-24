import { User } from "../auth/auth.model";
import { AppError } from "../../utils/AppError";
import { uploadImageToS3, resolveImageUrl } from "../../config/s3";
import { USER_LIST_SELECT, USER_PROFILE_SELECT } from "../../constants/queryFields";
import { cache } from "../../cache/cache.service";
import { cacheInvalidate } from "../../cache/invalidate";
import { keys, TTL } from "../../cache/keys";

export interface UpdateProfileData {
  name?: string;
  address?: string;
  professional?: string;
  religious?: string;
  hobby?: string;
  relationStatus?: string;
  dateOfBirth?: string;
  profilePictureUrl?: string;
  imageFile?: Express.Multer.File;
}

type UserDoc = {
  _id: { toString(): string };
  name: string;
  email: string;
  profilePicture?: string;
  address?: string;
  professional?: string;
  religious?: string;
  hobby?: string;
  relationStatus?: string;
  dateOfBirth?: Date;
  isOnline?: boolean;
  lastSeen?: Date;
};

function formatDateOfBirth(date?: Date): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

function formatUserDoc(u: UserDoc) {
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    profilePicture: resolveImageUrl(u.profilePicture),
    address: u.address ?? "",
    professional: u.professional ?? "",
    religious: u.religious ?? "",
    hobby: u.hobby ?? "",
    relationStatus: u.relationStatus ?? "",
    dateOfBirth: formatDateOfBirth(u.dateOfBirth),
    isOnline: u.isOnline,
    lastSeen: u.lastSeen,
  };
}

export class UserService {
  async getProfile(userId: string) {
    return cache.getOrSet(keys.authMe(userId), TTL.AUTH_ME, () =>
      this.fetchProfile(userId)
    );
  }

  private async fetchProfile(userId: string) {
    const user = await User.findById(userId).select(USER_PROFILE_SELECT).lean();
    if (!user) {
      throw new AppError(404, "User not found");
    }
    return formatUserDoc(user as UserDoc);
  }

  async updateProfile(userId: string, data: UpdateProfileData) {
    const update: Record<string, unknown> = {};

    if (data.name !== undefined) update.name = data.name;
    if (data.address !== undefined) update.address = data.address;
    if (data.professional !== undefined) update.professional = data.professional;
    if (data.religious !== undefined) update.religious = data.religious;
    if (data.hobby !== undefined) update.hobby = data.hobby;
    if (data.relationStatus !== undefined) update.relationStatus = data.relationStatus;
    if (data.dateOfBirth !== undefined) {
      update.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    }
    if (data.profilePictureUrl) update.profilePicture = data.profilePictureUrl;
    if (data.imageFile) {
      update.profilePicture = await uploadImageToS3(data.imageFile, "avatars");
    }

    const user = await User.findByIdAndUpdate(userId, update, {
      new: true,
      runValidators: true,
    })
      .select(USER_LIST_SELECT)
      .lean();

    if (!user) {
      throw new AppError(404, "User not found");
    }

    await cacheInvalidate.onUserProfileUpdate(userId);

    return formatUserDoc(user as UserDoc);
  }

  async listUsers(currentUserId: string, search?: string, page = 1, limit = 20) {
    const filter: Record<string, unknown> = {
      _id: { $ne: currentUserId },
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(USER_LIST_SELECT)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return {
      users: users.map((u) => formatUserDoc(u as UserDoc)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(userId: string) {
    return cache.getOrSet(keys.user(userId), TTL.USER, () =>
      this.fetchUserById(userId)
    );
  }

  private async fetchUserById(userId: string) {
    const user = await User.findById(userId).select(USER_LIST_SELECT).lean();
    if (!user) {
      throw new AppError(404, "User not found");
    }
    return formatUserDoc(user as UserDoc);
  }

  async setOnlineStatus(userId: string, isOnline: boolean) {
    await User.findByIdAndUpdate(
      userId,
      { isOnline, lastSeen: new Date() },
      { select: "_id" }
    );
  }
}

export const userService = new UserService();
