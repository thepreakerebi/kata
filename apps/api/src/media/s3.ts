import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";

const s3 = new S3Client({ region: env.AWS_REGION });

/**
 * Store a media payload privately in S3 and return its object key.
 * Returns null when no bucket is configured (local dev without AWS).
 */
export async function uploadMedia(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<string | null> {
  if (!env.S3_BUCKET) return null;
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
  return input.key;
}
