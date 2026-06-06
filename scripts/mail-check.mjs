#!/usr/bin/env node
/**
 * Check mail configuration and (for SES) list verified identities.
 * Usage: npm run mail:check
 */
import "dotenv/config";
import { SESClient, ListIdentitiesCommand, GetIdentityVerificationAttributesCommand } from "@aws-sdk/client-ses";

const provider = (process.env.MAIL_PROVIDER || "smtp").toLowerCase();
const mailFrom = (process.env.MAIL_FROM || process.env.APP_USER_EMAIL || process.env.SMTP_USER || "").trim();
const frontendUrl = (process.env.FRONTEND_URL || "").trim();

console.log("=== Connectify mail check ===\n");
console.log("MAIL_PROVIDER:", provider);
console.log("MAIL_FROM:", mailFrom || "(not set)");
console.log("FRONTEND_URL:", frontendUrl || "(not set — falls back to CLIENT_URL)");

if (/@(gmail|googlemail)\.com$/i.test(mailFrom)) {
  console.warn("\n⚠ Personal Gmail often lands in spam.");
  console.warn("  Fix: Google Workspace noreply@yourdomain.com OR MAIL_PROVIDER=ses");
}

if (/localhost|127\.0\.0\.1/i.test(frontendUrl)) {
  console.warn("\n⚠ FRONTEND_URL points to localhost — reset links look suspicious.");
}

if (provider === "smtp") {
  const host = process.env.SMTP_HOST;
  const user = process.env.APP_USER_EMAIL || process.env.SMTP_USER;
  const pass = process.env.APP_PASSWORD || process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.error("\n✗ SMTP incomplete — set SMTP_HOST, SMTP_USER/APP_USER_EMAIL, SMTP_PASS/APP_PASSWORD");
    process.exit(1);
  }
  console.log("\n✓ SMTP env present:", host, "as", user);
  console.log("\nGoogle Workspace setup (no SendGrid):");
  console.log("  1. Workspace admin → verify yourdomain.com");
  console.log("  2. Create noreply@yourdomain.com + App Password");
  console.log("  3. MAIL_FROM=noreply@yourdomain.com, MAIL_FROM_NAME=Connectify");
  process.exit(0);
}

if (!mailFrom) {
  console.error("\n✗ MAIL_PROVIDER=ses requires MAIL_FROM (verified identity)");
  process.exit(1);
}

const region = process.env.AWS_REGION || "us-east-1";
const client = new SESClient({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

try {
  const list = await client.send(new ListIdentitiesCommand({ MaxItems: 50 }));
  const identities = list.Identities || [];
  console.log(`\nSES region: ${region}`);
  console.log("Verified identities:", identities.length ? identities.join(", ") : "(none)");

  if (identities.length > 0) {
    const attrs = await client.send(
      new GetIdentityVerificationAttributesCommand({ Identities: identities }),
    );
    for (const id of identities) {
      const v = attrs.VerificationAttributes?.[id];
      console.log(`  ${id}: ${v?.VerificationStatus || "unknown"}`);
    }
  }

  const domain = mailFrom.includes("@") ? mailFrom.split("@")[1] : mailFrom;
  const ok =
    identities.includes(mailFrom) ||
    identities.includes(domain) ||
    identities.some((id) => mailFrom.endsWith(`@${id}`));

  if (!ok) {
    console.error(`\n✗ MAIL_FROM "${mailFrom}" is not a verified SES identity.`);
    console.error("  SES console → Verified identities → Create identity (domain recommended)");
    process.exit(1);
  }

  console.log(`\n✓ MAIL_FROM appears verified in SES`);
  console.log("\nAlso ensure SES is out of sandbox (can send to any recipient).");
} catch (err) {
  console.error("\n✗ SES check failed:", err.message);
  console.error("  Add IAM permission: ses:SendEmail, ses:ListIdentities");
  process.exit(1);
}
