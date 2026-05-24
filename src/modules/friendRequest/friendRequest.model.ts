import mongoose, { Document, Schema } from "mongoose";

export type FriendRequestStatus = "pending" | "accepted" | "rejected";

export interface IFriendRequest extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  status: FriendRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const friendRequestSchema = new Schema<IFriendRequest>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

friendRequestSchema.index({ senderId: 1, receiverId: 1 }, { unique: true });
friendRequestSchema.index({ receiverId: 1, status: 1, createdAt: -1 });
friendRequestSchema.index({ senderId: 1, status: 1, createdAt: -1 });
friendRequestSchema.index({ status: 1, senderId: 1, receiverId: 1 });
friendRequestSchema.index(
  { status: 1, senderId: 1 },
  { partialFilterExpression: { status: "accepted" } }
);
friendRequestSchema.index(
  { status: 1, receiverId: 1 },
  { partialFilterExpression: { status: "accepted" } }
);

export const FriendRequest = mongoose.model<IFriendRequest>(
  "FriendRequest",
  friendRequestSchema
);
