import { cache } from "./cache.service";
import { keys } from "./keys";

export const cacheInvalidate = {
  chatList(userId: string) {
    return cache.del(keys.chatList(userId));
  },

  chatLists(...userIds: string[]) {
    const unique = [...new Set(userIds)];
    return cache.del(...unique.map(keys.chatList));
  },

  friends(userId: string) {
    return cache.del(keys.friends(userId));
  },

  friendsBoth(userId1: string, userId2: string) {
    return cache.del(keys.friends(userId1), keys.friends(userId2));
  },

  friendship(userId1: string, userId2: string) {
    return cache.del(keys.friendship(userId1, userId2));
  },

  relation(currentUserId: string, otherUserId: string) {
    return cache.del(
      keys.relation(currentUserId, otherUserId),
      keys.relation(otherUserId, currentUserId)
    );
  },

  friendRequests(userId: string) {
    return cache.del(
      keys.friendReqReceived(userId),
      keys.friendReqSent(userId)
    );
  },

  authMe(userId: string) {
    return cache.del(keys.authMe(userId));
  },

  user(userId: string) {
    return cache.del(keys.user(userId));
  },

  userProfile(userId: string) {
    return cache.del(keys.authMe(userId), keys.user(userId));
  },

  messages(userId1: string, userId2: string) {
    return cache.del(
      keys.messagesLatest(userId1, userId2),
      keys.messages(userId1, userId2, 1),
      keys.messages(userId1, userId2, 2),
      keys.messages(userId1, userId2, 3)
    );
  },

  unread(receiverId: string, senderId: string) {
    return cache.del(keys.unread(receiverId, senderId));
  },

  comments(postId: string) {
    return cache.del(
      keys.comments(postId, 1),
      keys.comments(postId, 2),
      keys.comments(postId, 3)
    );
  },

  async feedAll() {
    await cache.incr(keys.feedGlobalVersion());
  },

  onNewMessage(senderId: string, receiverId: string) {
    return Promise.all([
      cacheInvalidate.chatLists(senderId, receiverId),
      cacheInvalidate.messages(senderId, receiverId),
      cache.incr(keys.unread(receiverId, senderId)),
    ]);
  },

  onMarkRead(readerId: string, senderId: string) {
    return Promise.all([
      cacheInvalidate.chatList(readerId),
      cacheInvalidate.unread(readerId, senderId),
      cache.setCounter(
        keys.unread(readerId, senderId),
        0
      ),
    ]);
  },

  onFriendChange(userId1: string, userId2: string) {
    return Promise.all([
      cacheInvalidate.friendsBoth(userId1, userId2),
      cacheInvalidate.friendship(userId1, userId2),
      cacheInvalidate.relation(userId1, userId2),
      cacheInvalidate.chatLists(userId1, userId2),
      cacheInvalidate.friendRequests(userId1),
      cacheInvalidate.friendRequests(userId2),
    ]);
  },

  onUserProfileUpdate(userId: string) {
    return cacheInvalidate.userProfile(userId);
  },
};
