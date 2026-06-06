import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

/**
 * Background email sender (SMTP or Amazon SES).
 *
 * Inbox delivery without SendGrid:
 *  - Google Workspace: noreply@yourdomain.com via smtp.gmail.com + App Password
 *  - Amazon SES: MAIL_PROVIDER=ses + verified domain (uses existing AWS keys)
 */

let transporter: Transporter | null = null;
let sesClient: SESClient | null = null;

function mailProvider(): "smtp" | "ses" {
  return env.MAIL_PROVIDER === "ses" ? "ses" : "smtp";
}

function mailUser(): string {
  return env.APP_USER_EMAIL || env.SMTP_USER;
}

function mailPass(): string {
  return env.APP_PASSWORD || env.SMTP_PASS;
}

function senderEmail(): string {
  return env.MAIL_FROM || mailUser();
}

function isPersonalGmail(address: string): boolean {
  return /@(gmail|googlemail)\.com$/i.test(address);
}

function usePlainOnly(): boolean {
  if (mailProvider() === "ses") return Boolean(env.MAIL_PLAIN_ONLY);
  if (env.MAIL_PLAIN_ONLY) return true;
  return isPersonalGmail(senderEmail());
}

export function isMailConfigured(): boolean {
  if (mailProvider() === "ses") {
    return Boolean(senderEmail());
  }
  return Boolean(env.SMTP_HOST && mailUser() && mailPass());
}

export function getMailHealth(): {
  configured: boolean;
  provider: "smtp" | "ses" | null;
  from: string | null;
  frontendUrl: string;
  plainOnly: boolean;
} {
  const configured = isMailConfigured();
  return {
    configured,
    provider: configured ? mailProvider() : null,
    from: configured ? senderEmail() : null,
    frontendUrl: env.FRONTEND_URL,
    plainOnly: configured ? usePlainOnly() : false,
  };
}

function getTransporter(): Transporter | null {
  if (mailProvider() !== "smtp" || !isMailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: mailUser(), pass: mailPass() },
    });
  }
  return transporter;
}

function getSesClient(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return sesClient;
}

function fromAddress(): string {
  const address = senderEmail();
  if (isPersonalGmail(address)) {
    return address;
  }
  const name = env.MAIL_FROM_NAME?.trim();
  return name ? `"${name}" <${address}>` : address;
}

interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface MailJob extends MailInput {
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const queue: MailJob[] = [];
let processing = false;

async function sendJob(job: MailJob): Promise<void> {
  const senderAddress = senderEmail();
  const plainOnly = usePlainOnly();

  if (mailProvider() === "ses") {
    await getSesClient().send(
      new SendEmailCommand({
        Source: fromAddress(),
        Destination: { ToAddresses: [job.to] },
        ReplyToAddresses: [senderAddress],
        Message: {
          Subject: { Charset: "UTF-8", Data: job.subject },
          Body: {
            Text: { Charset: "UTF-8", Data: job.text },
            ...(plainOnly || !job.html
              ? {}
              : { Html: { Charset: "UTF-8", Data: job.html } }),
          },
        },
      }),
    );
    return;
  }

  const tx = getTransporter();
  if (!tx) throw new Error("SMTP transporter not configured");

  await tx.sendMail({
    from: fromAddress(),
    to: job.to,
    subject: job.subject,
    text: job.text,
    ...(plainOnly ? {} : { html: job.html }),
    replyTo: senderAddress,
    envelope: { from: senderAddress, to: job.to },
  });
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const job = queue[0];

    if (!isMailConfigured()) {
      console.warn(
        `[mail] not configured — skipped "${job.subject}" to ${job.to}`,
      );
      queue.shift();
      continue;
    }

    try {
      await sendJob(job);
      console.log(
        `[mail] sent "${job.subject}" to ${job.to} via ${mailProvider()}`,
      );
      queue.shift();
    } catch (err) {
      job.attempts += 1;
      console.error(
        `[mail] send failed (attempt ${job.attempts}/${MAX_ATTEMPTS}) to ${job.to}:`,
        err instanceof Error ? err.message : err,
      );
      if (job.attempts >= MAX_ATTEMPTS) {
        queue.shift();
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * job.attempts),
        );
      }
    }
  }

  processing = false;
}

export function queueMail(mail: MailInput): void {
  queue.push({ ...mail, attempts: 0 });
  setImmediate(() => {
    void processQueue();
  });
}

function deliverabilityWarnings(): void {
  const from = senderEmail().toLowerCase();
  const brand = env.MAIL_FROM_NAME?.trim();

  if (/localhost|127\.0\.0\.1/i.test(env.FRONTEND_URL)) {
    console.warn(
      `[mail] FRONTEND_URL is "${env.FRONTEND_URL}" — set it to your public app URL.`,
    );
  }

  if (isPersonalGmail(from)) {
    console.warn(
      `[mail] Personal Gmail (${from}) often lands in spam. Use Google Workspace (noreply@yourdomain.com) or MAIL_PROVIDER=ses with a verified domain.`,
    );
  }

  if (brand && isPersonalGmail(from)) {
    console.warn(
      `[mail] MAIL_FROM_NAME ignored for personal Gmail — sends as ${from} only.`,
    );
  }

  if (
    mailProvider() === "smtp" &&
    env.MAIL_FROM &&
    mailUser() &&
    env.MAIL_FROM.toLowerCase() !== mailUser().toLowerCase()
  ) {
    console.warn(
      `[mail] MAIL_FROM (${env.MAIL_FROM}) differs from SMTP user (${mailUser()}) — SPF alignment will fail.`,
    );
  }

  if (mailProvider() === "ses" && !env.MAIL_FROM) {
    console.warn(
      "[mail] MAIL_PROVIDER=ses requires MAIL_FROM to a verified SES identity (domain or email).",
    );
  }
}

export function logMailStartupStatus(): void {
  if (!isMailConfigured()) {
    console.warn(
      "[mail] not configured — set SMTP_* or MAIL_PROVIDER=ses + MAIL_FROM.",
    );
    return;
  }
  deliverabilityWarnings();

  if (mailProvider() === "ses") {
    console.log(
      `[mail] Amazon SES ready in ${env.AWS_REGION} (from ${fromAddress()})`,
    );
    return;
  }

  getTransporter()
    ?.verify()
    .then(() =>
      console.log(
        `[mail] SMTP via ${env.SMTP_HOST} ready (from ${fromAddress()}, plainOnly=${usePlainOnly()})`,
      ),
    )
    .catch((err) =>
      console.error(
        "[mail] SMTP verify failed:",
        err instanceof Error ? err.message : err,
      ),
    );
}
