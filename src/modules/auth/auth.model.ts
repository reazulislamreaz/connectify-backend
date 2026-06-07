import mongoose, { Document, Schema } from "mongoose";

export type UserRole = "user" | "moderator" | "admin";
export type AccountStatus = "active" | "suspended" | "banned";

export const USER_ROLES: UserRole[] = ["user", "moderator", "admin"];
export const ACCOUNT_STATUSES: AccountStatus[] = [
  "active",
  "suspended",
  "banned",
];

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  profilePicture?: string;
  address?: string;
  professional?: string;
  religious?: string;
  hobby?: string;
  relationStatus?: string;
  dateOfBirth?: Date;
  isOnline: boolean;
  lastSeen: Date;
  /** Staff role. Set server-side only — never from registration input. */
  role: UserRole;
  /** Moderation state. "suspended"/"banned" block sign-in. */
  status: AccountStatus;
  /** When a suspension auto-expires (optional). */
  suspendedUntil?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    profilePicture: { type: String, default: "" },
    address: { type: String, default: "", trim: true, maxlength: 500 },
    professional: { type: String, default: "", trim: true, maxlength: 200 },
    religious: { type: String, default: "", trim: true, maxlength: 100 },
    hobby: { type: String, default: "", trim: true, maxlength: 300 },
    relationStatus: { type: String, default: "", trim: true, maxlength: 100 },
    dateOfBirth: { type: Date },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "user",
      index: true,
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "active",
      index: true,
    },
    suspendedUntil: { type: Date },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.index({ name: 1 });
userSchema.index({ isOnline: 1, lastSeen: -1 });
userSchema.index({ name: "text", email: "text" });
userSchema.index({ passwordResetToken: 1 });
userSchema.index({ createdAt: -1 });

export const User = mongoose.model<IUser>("User", userSchema);
