import express from "express";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
// @ts-ignore
import reshaper from "arabic-persian-reshaper";
import { UTApi } from "uploadthing/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
dotenv.config();

const app = express();
app.use(express.json());

// Handle __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fontPath = join(__dirname, "assets/fonts/fa/Estedad-FD-Medium.woff2");
const fontRegistered = GlobalFonts.registerFromPath(fontPath, "Estedad");

const WIDTH = 1080;
const HEIGHT = 1080;
const BG_COLOR = "#181A20";
const TEXT_COLOR = "#fff";
const FONT_SIZE = 64;
const LETTER_SPACING = -5; // px
const FONT_FAMILY = fontRegistered ? "Estedad" : "sans-serif";
const PADDING = 80;

function drawTextWithLetterSpacing(
  ctx: any,
  text: string,
  x: number,
  y: number,
  letterSpacing: number
) {
  let currentX = x;
  for (const char of text) {
    ctx.fillText(char, currentX, y);
    const metrics = ctx.measureText(char);
    currentX -= metrics.width + letterSpacing;
  }
}

function getTextWidthWithLetterSpacing(
  ctx: any,
  text: string,
  letterSpacing: number
) {
  let width = 0;
  for (const char of text) {
    width += ctx.measureText(char).width + letterSpacing;
  }
  return width - letterSpacing;
}

function wrapTextRTL(
  ctx: any,
  text: string,
  maxWidth: number,
  letterSpacing: number
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const testLine = line ? line + " " + String(words[i]) : String(words[i]);
    const testWidth = getTextWidthWithLetterSpacing(
      ctx,
      testLine,
      letterSpacing
    );
    if (testWidth > maxWidth && line) {
      lines.push(line);
      line = String(words[i]);
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Liara S3 Configuration
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

// Upload to Liara S3
async function uploadToLiara(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: LIARA_BUCKET,
    Key: filename,
    Body: buffer,
    ContentType: "image/png",
    ACL: "public-read",
  });

  await liaraS3Client.send(command);
  
  // Construct public URL
  const publicUrl = LIARA_PUBLIC_URL
    ? `${LIARA_PUBLIC_URL}/${filename}`
    : `${process.env.LIARA_ENDPOINT || "https://storage.iran.liara.space"}/${LIARA_BUCKET}/${filename}`;
  
  return publicUrl;
}

// Upload to UploadThing
async function uploadToUploadThing(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const uploadthingToken = process.env.UPLOADTHING_TOKEN;
  if (!uploadthingToken) {
    throw new Error("UploadThing token not set in .env");
  }
  const utapi = new UTApi({ token: uploadthingToken });
  const file = new FileClass([buffer], filename, { type: "image/png" });
  const uploadRes = await utapi.uploadFiles(file);
  if (!uploadRes || !uploadRes.data || !uploadRes.data.url) {
    throw new Error("Failed to upload image to UploadThing");
  }
  return uploadRes.data.url;
}

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

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Text Image API is running",
    timestamp: new Date().toISOString(),
  });
});

app.post("/image", async (req, res): Promise<void> => {
  try {
    let text = String(req.body.text);
    if (typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Missing or invalid 'text' field." });
      return;
    }
    text = reshaper.PersianShaper.convertArabic(text);

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    const maxTextWidth = WIDTH - 2 * PADDING;
    const lines = wrapTextRTL(ctx, text, maxTextWidth, LETTER_SPACING);
    if (lines.length > 5) {
      res.status(400).json({ error: "The text is more than 5 lines." });
      return;
    }
    const lineHeight = FONT_SIZE * 1.5;
    const totalTextHeight = lines.length * lineHeight;
    let y = HEIGHT / 2 - totalTextHeight / 2 + lineHeight / 2;
    for (const line of lines) {
      const safeLine = String(line);
      const lineWidth = getTextWidthWithLetterSpacing(
        ctx,
        safeLine,
        LETTER_SPACING
      );
      const x = WIDTH - PADDING - (maxTextWidth - lineWidth) / 2;
      drawTextWithLetterSpacing(ctx, safeLine, x, y, LETTER_SPACING);
      y += lineHeight;
    }
    const png = await canvas.encode("png");
    const uniqueName = uuidv4() + ".png";

    // Check if UploadThing is explicitly requested in the request body
    const useUploadThing = req.body.useUploadThing === true;

    let imageUrl: string | null = null;
    let uploadError: Error | null = null;

    // Try Liara first (unless UploadThing is explicitly requested)
    if (!useUploadThing) {
      try {
        // Check if Liara is configured
        if (!LIARA_BUCKET || !process.env.LIARA_ACCESS_KEY || !process.env.LIARA_SECRET_KEY) {
          throw new Error("Liara configuration is missing");
        }
        imageUrl = await uploadToLiara(png, uniqueName);
      } catch (error) {
        console.error("Liara upload failed, falling back to UploadThing:", error);
        uploadError = error as Error;
        // Fall through to UploadThing fallback
      }
    }

    // Fallback to UploadThing if Liara failed or was explicitly requested
    if (useUploadThing || !imageUrl) {
      try {
        imageUrl = await uploadToUploadThing(png, uniqueName);
      } catch (error) {
        console.error("UploadThing upload failed:", error);
        res.status(500).json({
          error: "Failed to upload image to both Liara and UploadThing",
          details: uploadError
            ? `Liara error: ${uploadError.message}, UploadThing error: ${(error as Error).message}`
            : (error as Error).message,
        });
        return;
      }
    }

    if (!imageUrl) {
      res.status(500).json({ error: "Failed to upload image" });
      return;
    }

    res.status(200).json({ url: imageUrl });
  } catch (e) {
    console.error("Error generating image:", e);
    res.status(500).json({ error: "Invalid request or server error." });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});
