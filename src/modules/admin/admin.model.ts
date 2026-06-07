import mongoose, { Document, Schema } from "mongoose";

export type ReportTargetType = "post" | "comment" | "user" | "message";
export type ReportStatus = "open" | "resolved" | "dismissed";

export const REPORT_TARGET_TYPES: ReportTargetType[] = [
  "post",
  "comment",
  "user",
  "message",
];
export const REPORT_STATUSES: ReportStatus[] = [
  "open",
  "resolved",
  "dismissed",
];

/**
 * A user-submitted report. This is the privacy-safe path for acting on private
 * content: staff review reports rather than browsing inboxes. For `message`
 * targets we store only the id — never the message body.
 */
export interface IReport extends Document {
  reporterId: mongoose.Types.ObjectId;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  note?: string;
  status: ReportStatus;
  resolvedBy?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  /** Action taken when resolving, e.g. "content_removed", "user_banned". */
  action?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, enum: REPORT_TARGET_TYPES, required: true },
    targetId: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    note: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: REPORT_STATUSES, default: "open", index: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    action: { type: String, trim: true, maxlength: 100 },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });

export const Report = mongoose.model<IReport>("Report", reportSchema);

/**
 * Append-only record of every privileged action. Never updated or deleted —
 * the trust/compliance trail for who did what.
 */
export interface IAuditLog extends Document {
  actorId: mongoose.Types.ObjectId;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
