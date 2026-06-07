/**
 * Promote (or demote) a user by email. Seeds the first admin since there is no
 * public endpoint that can grant a role.
 *
 *   npx tsx scripts/make-admin.ts someone@example.com            # -> admin
 *   npx tsx scripts/make-admin.ts someone@example.com moderator
 *   npx tsx scripts/make-admin.ts someone@example.com user       # demote
 *
 * It also clears the cached /auth/me for that user, so the new role takes effect
 * on their next page reload instead of after the 5-minute cache TTL. (Login
 * bypasses the cache, which is why a promotion appears to work after login but
 * vanishes on reload until the cache is busted.)
 */
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database";
import {
  connectRedis,
  disconnectRedis,
  isRedisEnabled,
} from "../src/config/redis";
import { cache } from "../src/cache/cache.service";
import { User, USER_ROLES, type UserRole } from "../src/modules/auth/auth.model";

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  const role = (process.argv[3] ?? "admin") as UserRole;

  if (!email) {
    console.error("Usage: npx tsx scripts/make-admin.ts <email> [role]");
    process.exit(1);
  }
  if (!USER_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". One of: ${USER_ROLES.join(", ")}`);
    process.exit(1);
  }

  await connectDatabase();

  const user = await User.findOneAndUpdate(
    { email },
    { $set: { role } },
    { new: true },
  )
    .select("_id")
    .lean();

  if (!user) {
    console.error(`No user found with email ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Bust the cached /auth/me (and user) so the role is live immediately. Delete
  // both the current and legacy key shapes so it works whether or not the
  // running server has been redeployed with the versioned cache keys.
  if (isRedisEnabled()) {
    try {
      await connectRedis();
      const id = user._id.toString();
      await cache.del(
        `auth:me:${id}`,
        `auth:me:v2:${id}`,
        `user:${id}`,
        `user:v2:${id}`,
      );
      await disconnectRedis();
      console.log("  cleared cached /auth/me");
    } catch (err) {
      console.warn(
        "  could not clear cache (role still set; it will apply within ~5 min):",
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`✓ ${email} is now "${role}"`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
