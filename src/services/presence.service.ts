import { getRedis, isRedisEnabled } from "../config/redis";
import { userService } from "../modules/user/user.service";

const ONLINE_KEY = (userId: string) => `presence:online:${userId}`;
const ONLINE_TTL_SEC = 120;

/**
 * Tracks online users in Mongo (for API responses) and Redis (fast lookup + TTL).
 */
export const presenceService = {
  async markOnline(userId: string): Promise<void> {
    if (isRedisEnabled()) {
      await getRedis().setex(ONLINE_KEY(userId), ONLINE_TTL_SEC, "1");
    }
    await userService.setOnlineStatus(userId, true);
  },

  async markOffline(userId: string): Promise<void> {
    if (isRedisEnabled()) {
      await getRedis().del(ONLINE_KEY(userId));
    }
    await userService.setOnlineStatus(userId, false);
  },

  async refreshOnline(userId: string): Promise<void> {
    if (!isRedisEnabled()) return;
    await getRedis().expire(ONLINE_KEY(userId), ONLINE_TTL_SEC);
  },

  async isOnline(userId: string): Promise<boolean> {
    if (!isRedisEnabled()) return false;
    const val = await getRedis().get(ONLINE_KEY(userId));
    return val === "1";
  },
};
