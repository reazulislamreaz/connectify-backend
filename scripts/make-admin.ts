/**
 * Promote (or demote) a user by email. Seeds the first admin since there is no
 * public endpoint that can grant a role.
 *
 *   npx tsx scripts/make-admin.ts someone@example.com            # -> admin
 *   npx tsx scripts/make-admin.ts someone@example.com moderator
 *   npx tsx scripts/make-admin.ts someone@example.com user       # demote
 */
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database";
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
  const res = await User.updateOne({ email }, { $set: { role } });

  if (res.matchedCount === 0) {
    console.error(`No user found with email ${email}`);
  } else {
    console.log(`✓ ${email} is now "${role}"`);
  }

  await mongoose.disconnect();
  process.exit(res.matchedCount === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
