import { getRedis, isRedisEnabled } from "../config/redis";

export const cache = {
  isEnabled(): boolean {
    return isRedisEnabled();
  },

  async get<T>(key: string): Promise<T | null> {
    if (!isRedisEnabled()) return null;
    try {
      const redis = getRedis();
      const raw = await redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.error(`[cache] GET ${key} failed:`, err);
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!isRedisEnabled()) return;
    try {
      const redis = getRedis();
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      console.error(`[cache] SET ${key} failed:`, err);
    }
  },

  async del(...cacheKeys: string[]): Promise<void> {
    if (!isRedisEnabled() || cacheKeys.length === 0) return;
    try {
      const redis = getRedis();
      await redis.del(...cacheKeys);
    } catch (err) {
      console.error(`[cache] DEL failed:`, err);
    }
  },

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await fetcher();
    await this.set(key, value, ttlSeconds);
    return value;
  },

  async incr(key: string): Promise<number> {
    if (!isRedisEnabled()) return 0;
    try {
      const redis = getRedis();
      return redis.incr(key);
    } catch (err) {
      console.error(`[cache] INCR ${key} failed:`, err);
      return 0;
    }
  },

  async getCounter(key: string): Promise<number | null> {
    if (!isRedisEnabled()) return null;
    try {
      const redis = getRedis();
      const raw = await redis.get(key);
      if (raw === null) return null;
      return parseInt(raw, 10);
    } catch (err) {
      console.error(`[cache] getCounter ${key} failed:`, err);
      return null;
    }
  },

  async setCounter(key: string, value: number): Promise<void> {
    if (!isRedisEnabled()) return;
    try {
      const redis = getRedis();
      await redis.set(key, String(value));
    } catch (err) {
      console.error(`[cache] setCounter ${key} failed:`, err);
    }
  },

  async ping(): Promise<boolean> {
    if (!isRedisEnabled()) return false;
    try {
      const redis = getRedis();
      const result = await redis.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  },
};
