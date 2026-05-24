import mongoose, { Document, Schema } from "mongoose";
import { CALL_LOG_STATUS, type CallLogStatus } from "../../constants/call";

export type MessageType = "text" | "call";

export interface IMessage extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  messageType: MessageType;
  content: string;
  imageUrl: string;
  voiceUrl: string;
  voiceDuration: number;
  callStatus?: CallLogStatus;
  callDuration: number;
  read: boolean;
  readAt?: Date;
  isDeleted: boolean;
  editedAt?: Date;
  replyToId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    messageType: { type: String, enum: ["text", "call"], default: "text" },
    content: { type: String, default: "", trim: true, maxlength: 5000 },
    callStatus: { type: String, enum: CALL_LOG_STATUS },
    callDuration: { type: Number, default: 0, min: 0 },
    imageUrl: { type: String, default: "" },
    voiceUrl: { type: String, default: "" },
    voiceDuration: { type: Number, default: 0, min: 0, max: 60 },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    editedAt: { type: Date },
    replyToId: { type: Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true }
);

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, read: 1 });
messageSchema.index({ receiverId: 1, read: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, receiverId: 1, read: 1 });

export const Message = mongoose.model<IMessage>("Message", messageSchema);
