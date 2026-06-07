import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import { User, type UserRole, type AccountStatus } from "./auth.model";
import { signToken } from "../../utils/jwt";
import { AppError } from "../../utils/AppError";
import { env } from "../../config/env";
import { queueMail } from "../../services/mail.service";
import {
  passwordResetEmail,
  passwordChangedEmail,
} from "../../services/email.templates";
import { resolveImageUrl, deleteFromS3ByUrl } from "../../config/s3";
import { USER_PROFILE_SELECT, USER_EXISTS_SELECT } from "../../constants/queryFields";
import { Message } from "../message/message.model";
import { Post, PostLike, Comment } from "../post/post.model";
import { FriendRequest } from "../friendRequest/friendRequest.model";
import { cache } from "../../cache/cache.service";
import { cacheInvalidate } from "../../cache/invalidate";
import { keys, TTL } from "../../cache/keys";

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MINUTES = 60;
const RESET_TOKEN_TTL_MS = RESET_TOKEN_TTL_MINUTES * 60 * 1000;

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

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

    if (user.status === "banned") {
      throw new AppError(403, "This account has been banned.");
    }
    if (user.status === "suspended") {
      throw new AppError(403, "This account is suspended. Contact support.");
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

  /**
   * Start the password-reset flow. Always resolves with the same generic message
   * (even for unknown emails) to avoid leaking which addresses are registered.
   * The email is sent in the background — this never blocks on SMTP.
   */
  async requestPasswordReset(email: string) {
    const genericResponse = {
      message:
        "If an account exists for that email, we've sent a password reset link.",
    };

    const user = await User.findOne({ email }).select("name email").lean();
    if (!user) {
      return genericResponse;
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    await User.findByIdAndUpdate(user._id, {
      passwordResetToken: hashResetToken(rawToken),
      passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    const base = env.FRONTEND_URL.replace(/\/$/, "");
    const resetUrl = `${base}/reset-password?token=${rawToken}`;

    const mail = passwordResetEmail({
      name: user.name,
      resetUrl,
      expiresMinutes: RESET_TOKEN_TTL_MINUTES,
    });
    queueMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    if (env.NODE_ENV !== "production") {
      console.log(`[auth] password reset link for ${user.email}: ${resetUrl}`);
    }

    return genericResponse;
  }

  /** Complete the reset using the token from the emailed link. */
  async resetPassword(token: string, newPassword: string) {
    const user = await User.findOne({
      passwordResetToken: hashResetToken(token),
      passwordResetExpires: { $gt: new Date() },
    })
      .select("name email")
      .lean();

    if (!user) {
      throw new AppError(
        400,
        "This password reset link is invalid or has expired. Please request a new one."
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword,
      $unset: { passwordResetToken: "", passwordResetExpires: "" },
    });
    await cacheInvalidate.authMe(user._id.toString());

    const mail = passwordChangedEmail({ name: user.name });
    queueMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    return {
      message:
        "Your password has been reset successfully. You can now sign in with your new password.",
    };
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
    role?: UserRole;
    status?: AccountStatus;
  }) {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      profilePicture: resolveImageUrl(user.profilePicture),
      role: user.role ?? "user",
      status: user.status ?? "active",
    };
  }
}

export const authService = new AuthService();
