/**
 * Transactional email templates.
 *
 * Deliverability notes (why these are kept simple):
 *  - Light, mostly-text HTML with one clear call-to-action lands in the inbox
 *    far more reliably than heavy "marketing" layouts.
 *  - No external images (so nothing is blocked, and there's no image-heavy ratio
 *    that filters dislike). The logo is a CSS monogram, not an <img>.
 *  - Every email ships with a real plain-text alternative (set in mail.service).
 *  - Layout is table-based with inline styles for cross-client rendering.
 */

const BRAND = "#008069";
const INK = "#1a1a1a";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

function layout(opts: {
  preview: string;
  heading: string;
  bodyHtml: string;
}): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <title>${opts.heading}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <!-- Brand row -->
          <tr>
            <td style="padding:8px 4px 20px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="display:inline-block;width:32px;height:32px;border-radius:8px;background:${BRAND};color:#ffffff;text-align:center;line-height:32px;font-size:16px;font-weight:700;">C</span>
                  </td>
                  <td style="vertical-align:middle;padding-left:10px;">
                    <span style="font-size:17px;font-weight:700;color:${INK};">Connectify</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="border:1px solid ${BORDER};border-radius:12px;padding:32px 28px;">
              <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:${INK};">${opts.heading}</h1>
              ${opts.bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 8px;color:${MUTED};font-size:12px;line-height:1.6;">
              <p style="margin:0 0 6px 0;">This is an automated message from Connectify regarding your account.</p>
              <p style="margin:0;">© ${year} Connectify</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
    <tr>
      <td bgcolor="${BRAND}" style="border-radius:8px;">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

export function passwordResetEmail(opts: {
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}): BuiltEmail {
  const firstName = opts.name?.trim().split(" ")[0] || "there";
  const bodyHtml = `
    <p style="margin:0 0 14px 0;color:${INK};">Hi ${firstName},</p>
    <p style="margin:0 0 6px 0;color:${INK};">
      You asked to reset your Connectify password. Click the button below to set a new one.
    </p>
    ${button("Reset password", opts.resetUrl)}
    <p style="margin:0 0 14px 0;color:${MUTED};font-size:13px;">
      This link expires in ${opts.expiresMinutes} minutes and can be used once.
    </p>
    <p style="margin:0 0 6px 0;color:${MUTED};font-size:13px;">Or paste this link into your browser:</p>
    <p style="margin:0 0 16px 0;word-break:break-all;">
      <a href="${opts.resetUrl}" target="_blank" style="color:${BRAND};font-size:13px;">${opts.resetUrl}</a>
    </p>
    <p style="margin:0;color:${MUTED};font-size:13px;">
      If you didn't request this, you can ignore this email — your password won't change.
    </p>`;

  const text = `Hi ${firstName},

You asked to reset your Connectify password. Open this link to set a new one (expires in ${opts.expiresMinutes} minutes):

${opts.resetUrl}

If you didn't request this, you can ignore this email — your password won't change.

Connectify`;

  return {
    subject: "Reset your Connectify password",
    html: layout({
      preview: `Reset your password — link expires in ${opts.expiresMinutes} minutes.`,
      heading: "Reset your password",
      bodyHtml,
    }),
    text,
  };
}

export function passwordChangedEmail(opts: { name: string }): BuiltEmail {
  const firstName = opts.name?.trim().split(" ")[0] || "there";
  const bodyHtml = `
    <p style="margin:0 0 14px 0;color:${INK};">Hi ${firstName},</p>
    <p style="margin:0 0 14px 0;color:${INK};">
      Your Connectify password was just changed. You can now sign in with your new password.
    </p>
    <p style="margin:0;color:${MUTED};font-size:13px;">
      If this wasn't you, reset your password again right away to secure your account.
    </p>`;

  const text = `Hi ${firstName},

Your Connectify password was just changed. You can now sign in with your new password.

If this wasn't you, reset your password again right away to secure your account.

Connectify`;

  return {
    subject: "Your Connectify password was changed",
    html: layout({
      preview: "Your Connectify password was just changed.",
      heading: "Password changed",
      bodyHtml,
    }),
    text,
  };
}
