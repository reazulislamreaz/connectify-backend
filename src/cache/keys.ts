export const TTL = {
  CHAT_LIST: 45,
  FRIENDS: 600,
  FRIENDSHIP: 3600,
  RELATION: 300,
  AUTH_ME: 300,
  USER: 900,
  MESSAGES_PAGE: 60,
  FRIENDREQ: 120,
  FEED: 90,
  COMMENTS: 120,
} as const;

function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// Bump when the cached user / auth-me shape changes, so entries written by an
// older deploy are bypassed instead of served stale. v2 added `role` + `status`
// — without it, /auth/me returns a pre-role payload after reload and the admin
// nav disappears even for admins (login bypasses the cache, so it worked there).
const USER_CACHE_VERSION = "v2";

export const keys = {
  chatList: (userId: string) => `chatlist:${userId}`,
  friends: (userId: string) => `friends:${userId}`,
  friendship: (a: string, b: string) => {
    const [x, y] = sortedPair(a, b);
    return `friendship:${x}:${y}`;
  },
  relation: (currentUserId: string, otherUserId: string) =>
    `relation:${currentUserId}:${otherUserId}`,
  friendReqReceived: (userId: string) => `friendreq:received:${userId}`,
  friendReqSent: (userId: string) => `friendreq:sent:${userId}`,
  authMe: (userId: string) => `auth:me:${USER_CACHE_VERSION}:${userId}`,
  user: (userId: string) => `user:${USER_CACHE_VERSION}:${userId}`,
  messages: (a: string, b: string, page: number) => {
    const [x, y] = sortedPair(a, b);
    return `messages:${x}:${y}:p${page}`;
  },
  messagesLatest: (a: string, b: string) => {
    const [x, y] = sortedPair(a, b);
    return `messages:${x}:${y}:latest`;
  },
  unread: (receiverId: string, senderId: string) =>
    `unread:${receiverId}:${senderId}`,
  feedGlobalVersion: () => "feed:global:v",
  feed: (userId: string, globalVersion: number, page: number) =>
    `feed:${userId}:g${globalVersion}:p${page}`,
  comments: (postId: string, page: number) => `comments:${postId}:p${page}`,
};
