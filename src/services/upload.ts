import "../config/env.js";
import express from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { UTApi } from "uploadthing/server";
import { UploadError } from "../errors.js";

// Polyfill File class for Node.js if not available
let FileClass: typeof File;
try {
  FileClass = File;
} catch {
  FileClass = class FilePolyfill extends Blob {
    name: string;
    lastModified: number;
    constructor(parts: any[], filename: string, options: any = {}) {
      super(parts, options);
      this.name = filename;
      this.lastModified = options.lastModified || Date.now();
    }
  } as any;
}

const liaraS3Client = new S3Client({
  endpoint: process.env.LIARA_ENDPOINT || "https://storage.iran.liara.space",
  region: process.env.LIARA_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.LIARA_ACCESS_KEY || "",
    secretAccessKey: process.env.LIARA_SECRET_KEY || "",
  },
  forcePathStyle: true,
});

const LIARA_BUCKET = process.env.LIARA_BUCKET || "";
const LIARA_PUBLIC_URL = process.env.LIARA_PUBLIC_URL || "";

async function uploadToLiara(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: LIARA_BUCKET,
    Key: filename,
    Body: buffer,
    ContentType: contentType,
    ACL: "public-read",
  });

  await liaraS3Client.send(command);

  const publicUrl = LIARA_PUBLIC_URL
    ? `${LIARA_PUBLIC_URL}/${filename}`
    : `${process.env.LIARA_ENDPOINT || "https://storage.iran.liara.space"}/${LIARA_BUCKET}/${filename}`;

  return publicUrl;
}

async function uploadToUploadThing(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const uploadthingToken = process.env.UPLOADTHING_TOKEN;
  if (!uploadthingToken) {
    throw new Error("UploadThing token not set in .env");
  }
  const utapi = new UTApi({ token: uploadthingToken });
  const file = new FileClass([buffer], filename, { type: contentType });
  const uploadRes = await utapi.uploadFiles(file as any);
  if (!uploadRes || !uploadRes.data || !uploadRes.data.url) {
    throw new Error("Failed to upload image to UploadThing");
  }
  return uploadRes.data.url;
}

export async function uploadWithFallback(
  buffer: Buffer,
  filename: string,
  contentType: string,
  options?: { forceUploadThing?: boolean }
): Promise<string> {
  const forceUploadThing = options?.forceUploadThing === true;
  let liaraError: Error | null = null;
  let url: string | null = null;

  const canUseLiara =
    !forceUploadThing &&
    LIARA_BUCKET &&
    process.env.LIARA_ACCESS_KEY &&
    process.env.LIARA_SECRET_KEY;

  if (canUseLiara) {
    try {
      url = await uploadToLiara(buffer, filename, contentType);
    } catch (error) {
      liaraError = error as Error;
      console.error("Liara upload failed, falling back to UploadThing:", error);
    }
  } else if (!forceUploadThing && !canUseLiara) {
    liaraError = new Error("Liara configuration is missing");
  }

  if (!url) {
    try {
      url = await uploadToUploadThing(buffer, filename, contentType);
    } catch (error) {
      const uploadThingError = error as Error;
      const details = liaraError
        ? `Liara error: ${liaraError.message}, UploadThing error: ${uploadThingError.message}`
        : uploadThingError.message;
      throw new UploadError(details);
    }
  }

  if (!url) {
    throw new UploadError("Upload destination returned no URL");
  }

  return url;
}

export function respondUploadError(res: express.Response, error: unknown) {
  if (error instanceof UploadError) {
    res
      .status(500)
      .json({ error: error.message, details: error.details });
    return;
  }
  res.status(500).json({ error: "Failed to upload file." });
}

