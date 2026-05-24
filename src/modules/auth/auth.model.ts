import mongoose, { Document, Schema } from "mongoose";

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
  },
  { timestamps: true }
);

userSchema.index({ name: 1 });
userSchema.index({ isOnline: 1, lastSeen: -1 });
userSchema.index({ name: "text", email: "text" });

export const User = mongoose.model<IUser>("User", userSchema);
