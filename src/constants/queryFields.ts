export const USER_PUBLIC_SELECT =
  "name email profilePicture address professional religious hobby relationStatus dateOfBirth isOnline lastSeen";
export const USER_PROFILE_SELECT =
  "name email profilePicture address professional religious hobby relationStatus dateOfBirth isOnline lastSeen createdAt";
export const USER_LIST_SELECT =
  "name email profilePicture address professional religious hobby relationStatus dateOfBirth isOnline lastSeen";
export const USER_EXISTS_SELECT = "_id";
export const FRIEND_REQUEST_SELECT = "senderId receiverId status createdAt";
export const MESSAGE_LIST_SELECT =
  "senderId receiverId messageType content imageUrl voiceUrl voiceDuration callStatus callDuration read readAt isDeleted editedAt replyToId createdAt";
export const MESSAGE_PREVIEW_SELECT =
  "messageType content imageUrl voiceUrl voiceDuration callStatus callDuration senderId createdAt read";
