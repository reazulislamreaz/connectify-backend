/**
 * Plain transactional email templates.
 * Text-first layout — no buttons, images, hidden preview text, or marketing HTML.
 */

interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

function plainHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;">
<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;word-wrap:break-word;">${escaped}</pre>
</body>
</html>`;
}

export function passwordResetEmail(opts: {
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}): BuiltEmail {
  const firstName = opts.name?.trim().split(" ")[0] || "there";
  const text = `Hi ${firstName},

We received a request to reset your password.

Open this link to choose a new password (expires in ${opts.expiresMinutes} minutes):

${opts.resetUrl}

If you did not request this, you can ignore this email. Your password will not change.

— Connectify`;

  return {
    subject: "Password reset",
    text,
    html: plainHtml(text),
  };
}

export function passwordChangedEmail(opts: { name: string }): BuiltEmail {
  const firstName = opts.name?.trim().split(" ")[0] || "there";
  const text = `Hi ${firstName},

Your password was changed successfully.

If you did not make this change, reset your password again immediately.

— Connectify`;

  return {
    subject: "Password changed",
    text,
    html: plainHtml(text),
  };
}
