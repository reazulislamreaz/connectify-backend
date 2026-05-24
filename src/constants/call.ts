export const CALL_LOG_STATUS = [
  "completed",
  "rejected",
  "cancelled",
  "missed",
  "busy",
  "disconnected",
] as const;

export type CallLogStatus = (typeof CALL_LOG_STATUS)[number];
