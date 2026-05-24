import path from "path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetBucketLocationCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";
import { env } from "./env";
import { AppError } from "../utils/AppError";

let resolvedRegion: string | null = null;

function createS3Client(region: string) {
  return new S3Client({
    region,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
    followRegionRedirects: true,
  });
}

let s3 = createS3Client(env.AWS_REGION);

async function resolveBucketRegion(): Promise<string> {
  if (resolvedRegion) return resolvedRegion;

  try {
    const client = createS3Client(env.AWS_REGION);
    const result = await client.send(
      new GetBucketLocationCommand({ Bucket: env.AWS_BUCKET_NAME })
    );

    const location = result.LocationConstraint;
    resolvedRegion =
      !location || String(location) === "US" ? "us-east-1" : String(location);
  } catch {
    resolvedRegion = env.AWS_REGION;
  }

  s3 = createS3Client(resolvedRegion);
  return resolvedRegion;
}

export function getPublicUrl(key: string, region?: string): string {
  const bucketRegion = region || resolvedRegion || env.AWS_REGION;
  return `https://${env.AWS_BUCKET_NAME}.s3.${bucketRegion}.amazonaws.com/${key}`;
}

async function getAccessDeniedHint(): Promise<string> {
  try {
    const client = createS3Client("us-east-1");
    const { Buckets } = await client.send(new ListBucketsCommand({}));
    const names = Buckets?.map((b) => b.Name).filter(Boolean) as string[];

    if (!names.includes(env.AWS_BUCKET_NAME)) {
      const visible = names.length ? names.join(", ") : "none";
      return (
        `Bucket "${env.AWS_BUCKET_NAME}" is not in the AWS account for these credentials. ` +
        `Your key can only access: ${visible}. ` +
        `Create new access keys on the account that owns "${env.AWS_BUCKET_NAME}", ` +
        `or add a bucket policy granting s3:PutObject to this IAM user.`
      );
    }
  } catch {
    // ignore — fall back to generic hint
  }

  return (
    "S3 denied PutObject on this bucket. Ensure the IAM user has s3:PutObject and s3:PutObjectAcl " +
    `(if needed) on arn:aws:s3:::${env.AWS_BUCKET_NAME}/*`
  );
}

export function resolveImageUrl(stored?: string): string {
  if (!stored) return "";
  if (stored.startsWith("http://") || stored.startsWith("https://")) return stored;
  if (stored.startsWith("/uploads/")) return stored;
  return getPublicUrl(stored);
}

export async function uploadAudioToS3(
  file: Express.Multer.File,
  folder: "messages"
): Promise<string> {
  if (!file?.buffer?.length) {
    throw new AppError(400, "No audio file provided");
  }

  const bucketRegion = await resolveBucketRegion();
  const ext = path.extname(file.originalname).toLowerCase() || ".webm";
  const key = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const contentType = file.mimetype || "audio/webm";

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: contentType,
        ContentLength: file.buffer.length,
      })
    );

    return getPublicUrl(key, bucketRegion);
  } catch (err: unknown) {
    const awsErr = err as {
      name?: string;
      Code?: string;
      message?: string;
      Endpoint?: string;
    };
    console.error("S3 audio upload failed:", awsErr.name || awsErr.Code, awsErr.message);

    const isAccessDenied =
      awsErr.Code === "AccessDenied" || awsErr.name === "AccessDenied";

    const message = isAccessDenied
      ? await getAccessDeniedHint()
      : awsErr.message || "Failed to upload audio to S3";

    throw new AppError(500, message);
  }
}

export async function uploadImageToS3(
  file: Express.Multer.File,
  folder: "avatars" | "posts" | "messages"
): Promise<string> {
  if (!file?.buffer?.length) {
    throw new AppError(400, "No image file provided");
  }

  const bucketRegion = await resolveBucketRegion();
  const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
  const key = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "image/jpeg",
        ContentLength: file.buffer.length,
      })
    );

    return getPublicUrl(key, bucketRegion);
  } catch (err: unknown) {
    const awsErr = err as {
      name?: string;
      Code?: string;
      message?: string;
      Endpoint?: string;
    };
    console.error("S3 upload failed:", awsErr.name || awsErr.Code, awsErr.message);

    if (awsErr.Code === "PermanentRedirect" && awsErr.Endpoint) {
      const match = awsErr.Endpoint.match(/\.s3\.([^.]+)\.amazonaws\.com/);
      if (match) {
        resolvedRegion = match[1];
        s3 = createS3Client(resolvedRegion);
        await s3.send(
          new PutObjectCommand({
            Bucket: env.AWS_BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype || "image/jpeg",
            ContentLength: file.buffer.length,
          })
        );
        return getPublicUrl(key, resolvedRegion);
      }
    }

    const isAccessDenied =
      awsErr.Code === "AccessDenied" || awsErr.name === "AccessDenied";

    const message = isAccessDenied
      ? await getAccessDeniedHint()
      : awsErr.message || "Failed to upload image to S3";

    throw new AppError(500, message);
  }
}

export async function deleteFromS3ByUrl(url: string): Promise<void> {
  if (!url.includes(env.AWS_BUCKET_NAME)) return;

  try {
    const region = resolvedRegion || env.AWS_REGION;
    const prefix = `${env.AWS_BUCKET_NAME}.s3.${region}.amazonaws.com/`;
    const key = url.split(prefix)[1];
    if (!key) return;
    await s3.send(
      new DeleteObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: decodeURIComponent(key),
      })
    );
  } catch {
    // ignore cleanup errors
  }
}
