/**
 * Email HTML templates. Styles are inlined and the layout is table-based so it
 * renders consistently across email clients (Gmail, Outlook, Apple Mail, etc.).
 */

const BRAND = "#00a884";
const BRAND_DARK = "#008069";
const INK = "#0b141a";
const MUTED = "#667781";
const BG = "#eef1f3";
const CARD = "#ffffff";

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
  <title>${opts.heading}</title>
</head>
<body style="margin:0;padding:0;background:${BG};-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${opts.preview}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:${CARD};border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(11,20,26,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND} 0%,${BRAND_DARK} 100%);padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="display:inline-block;width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,0.18);text-align:center;line-height:40px;font-size:20px;">💬</span>
                  </td>
                  <td style="vertical-align:middle;padding-left:12px;">
                    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.2px;">Connectify</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 8px 32px;">
              <h1 style="margin:0 0 14px 0;color:${INK};font-size:22px;font-weight:700;line-height:1.3;">${opts.heading}</h1>
              ${opts.bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:28px 32px 32px 32px;">
              <hr style="border:none;border-top:1px solid #e9edef;margin:0 0 18px 0;" />
              <p style="margin:0;color:${MUTED};font-size:12px;line-height:1.6;">
                You're receiving this email because a request was made for your Connectify account.
                If this wasn't you, you can safely ignore it.
              </p>
              <p style="margin:14px 0 0 0;color:${MUTED};font-size:12px;">© ${year} Connectify. All rights reserved.</p>
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
    <tr>
      <td align="center" bgcolor="${BRAND}" style="border-radius:12px;">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;background:${BRAND};">
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
    <p style="margin:0 0 16px 0;color:${INK};font-size:15px;line-height:1.65;">Hi ${firstName},</p>
    <p style="margin:0 0 8px 0;color:${INK};font-size:15px;line-height:1.65;">
      We received a request to reset the password for your Connectify account.
      Click the button below to choose a new password.
    </p>
    ${button("Reset my password", opts.resetUrl)}
    <p style="margin:0 0 6px 0;color:${MUTED};font-size:13px;line-height:1.6;">
      This link expires in <strong style="color:${INK};">${opts.expiresMinutes} minutes</strong> and can be used only once.
    </p>
    <p style="margin:18px 0 6px 0;color:${MUTED};font-size:13px;line-height:1.6;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:0;word-break:break-all;">
      <a href="${opts.resetUrl}" target="_blank" style="color:${BRAND_DARK};font-size:13px;text-decoration:underline;">${opts.resetUrl}</a>
    </p>
    <p style="margin:22px 0 0 0;color:${MUTED};font-size:13px;line-height:1.6;">
      Didn't request this? Your password is still safe — just ignore this email.
    </p>`;

  const text = `Hi ${firstName},

We received a request to reset the password for your Connectify account.
Reset it here (expires in ${opts.expiresMinutes} minutes):
${opts.resetUrl}

If you didn't request this, you can safely ignore this email.

— Connectify`;

  return {
    subject: "Reset your Connectify password",
    html: layout({
      preview: "Reset your Connectify password",
      heading: "Reset your password",
      bodyHtml,
    }),
    text,
  };
}

export function passwordChangedEmail(opts: { name: string }): BuiltEmail {
  const firstName = opts.name?.trim().split(" ")[0] || "there";
  const bodyHtml = `
    <p style="margin:0 0 16px 0;color:${INK};font-size:15px;line-height:1.65;">Hi ${firstName},</p>
    <p style="margin:0 0 8px 0;color:${INK};font-size:15px;line-height:1.65;">
      Your Connectify password was just changed successfully. You can now sign in with your new password.
    </p>
    <p style="margin:18px 0 0 0;color:${MUTED};font-size:13px;line-height:1.6;">
      If you didn't make this change, please reset your password again right away to secure your account.
    </p>`;

  const text = `Hi ${firstName},

Your Connectify password was just changed successfully.
If you didn't make this change, please reset your password again right away.

— Connectify`;

  return {
    subject: "Your Connectify password was changed",
    html: layout({
      preview: "Your Connectify password was changed",
      heading: "Password changed",
      bodyHtml,
    }),
    text,
  };
}
