import mongoose from "mongoose";
import { resolveImageUrl } from "../config/s3";

export interface PopulatedUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  profilePicture?: string;
  isOnline?: boolean;
  lastSeen?: Date;
}

export function isPopulatedUser(value: unknown): value is PopulatedUser {
  return (
    typeof value === "object" &&
    value !== null &&
    "_id" in value &&
    "name" in value
  );
}

export function formatPopulatedUser(user: PopulatedUser) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email ?? "",
    profilePicture: resolveImageUrl(user.profilePicture),
    isOnline: user.isOnline,
    lastSeen: user.lastSeen,
  };
}
