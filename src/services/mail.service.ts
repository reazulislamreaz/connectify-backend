import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

/**
 * Background email sender.
 *
 * `queueMail()` returns immediately and never blocks the HTTP request — jobs are
 * processed off the request path with automatic retries and backoff. When SMTP
 * isn't configured, emails are skipped (and logged in development) so the rest of
 * the app keeps working.
 */

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function getTransporter(): Transporter | null {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true for 465, false for 587 (STARTTLS)
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

function fromAddress(): string {
  const address = env.MAIL_FROM || env.SMTP_USER;
  return env.MAIL_FROM_NAME ? `"${env.MAIL_FROM_NAME}" <${address}>` : address;
}

interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface MailJob extends MailInput {
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const queue: MailJob[] = [];
let processing = false;

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const job = queue[0];
    const tx = getTransporter();

    if (!tx) {
      if (env.NODE_ENV !== "production") {
        console.warn(
          `[mail] SMTP not configured — skipped "${job.subject}" to ${job.to}`,
        );
      }
      queue.shift();
      continue;
    }

    try {
      await tx.sendMail({
        from: fromAddress(),
        to: job.to,
        subject: job.subject,
        html: job.html,
        text: job.text,
      });
      queue.shift();
    } catch (err) {
      job.attempts += 1;
      console.error(
        `[mail] send failed (attempt ${job.attempts}/${MAX_ATTEMPTS}) to ${job.to}:`,
        err instanceof Error ? err.message : err,
      );
      if (job.attempts >= MAX_ATTEMPTS) {
        queue.shift(); // give up on this job
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000 * job.attempts));
      }
    }
  }

  processing = false;
}

/** Enqueue an email for background delivery. Never throws; never blocks. */
export function queueMail(mail: MailInput): void {
  queue.push({ ...mail, attempts: 0 });
  setImmediate(() => {
    void processQueue();
  });
}

/** Optional startup probe — logs whether outbound email is wired up. */
export function logMailStartupStatus(): void {
  if (!isMailConfigured()) {
    console.warn(
      "[mail] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS) — password-reset emails will be skipped.",
    );
    return;
  }
  const tx = getTransporter();
  tx?.verify()
    .then(() => console.log(`[mail] SMTP ready via ${env.SMTP_HOST}`))
    .catch((err) =>
      console.error(
        "[mail] SMTP verify failed:",
        err instanceof Error ? err.message : err,
      ),
    );
}
