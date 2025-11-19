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

// Default values
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_BG_COLOR = "#181A20";
const DEFAULT_TEXT_COLOR = "#fff";
const DEFAULT_FONT_SIZE = 64;
const DEFAULT_LETTER_SPACING = -5; // px
const FONT_FAMILY = fontRegistered ? "Estedad" : "sans-serif";
const DEFAULT_PADDING = 80;

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

// Calculate how many lines can fit on a page
function calculateMaxLines(
  height: number,
  padding: number,
  fontSize: number,
  lineHeightMultiplier: number = 1.5
): number {
  const availableHeight = height - 2 * padding;
  const lineHeight = fontSize * lineHeightMultiplier;
  return Math.floor(availableHeight / lineHeight);
}

// Split text into pages based on available space
function paginateText(
  ctx: any,
  text: string,
  maxWidth: number,
  maxLines: number,
  letterSpacing: number
): string[][] {
  const allLines = wrapTextRTL(ctx, text, maxWidth, letterSpacing);
  const pages: string[][] = [];
  let currentPage: string[] = [];
  
  for (const line of allLines) {
    if (currentPage.length >= maxLines) {
      pages.push(currentPage);
      currentPage = [line];
    } else {
      currentPage.push(line);
    }
  }
  
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }
  
  return pages;
}

// Generate a single image from lines
async function generateImage(
  lines: string[],
  width: number,
  height: number,
  bgColor: string,
  textColor: string,
  fontSize: number,
  letterSpacing: number,
  padding: number
): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  // Draw background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  
  // Set font and text properties
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  
  // Calculate positioning
  const lineHeight = fontSize * 1.5;
  const totalTextHeight = lines.length * lineHeight;
  let y = height / 2 - totalTextHeight / 2 + lineHeight / 2;
  const maxTextWidth = width - 2 * padding;
  
  // Draw each line
  for (const line of lines) {
    const safeLine = String(line);
    const lineWidth = getTextWidthWithLetterSpacing(
      ctx,
      safeLine,
      letterSpacing
    );
    const x = width - padding - (maxTextWidth - lineWidth) / 2;
    drawTextWithLetterSpacing(ctx, safeLine, x, y, letterSpacing);
    y += lineHeight;
  }
  
  return await canvas.encode("png");
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
    // Validate and get text
    let text = String(req.body.text);
    if (typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Missing or invalid 'text' field." });
      return;
    }
    text = reshaper.PersianShaper.convertArabic(text);

    // Get configuration from request body or use defaults
    const width = req.body.width ? parseInt(String(req.body.width)) : DEFAULT_WIDTH;
    const height = req.body.height ? parseInt(String(req.body.height)) : DEFAULT_HEIGHT;
    const bgColor = req.body.bgColor || DEFAULT_BG_COLOR;
    const textColor = req.body.textColor || DEFAULT_TEXT_COLOR;
    const fontSize = req.body.fontSize ? parseInt(String(req.body.fontSize)) : DEFAULT_FONT_SIZE;
    const letterSpacing = req.body.letterSpacing !== undefined 
      ? parseInt(String(req.body.letterSpacing)) 
      : DEFAULT_LETTER_SPACING;
    const padding = req.body.padding ? parseInt(String(req.body.padding)) : DEFAULT_PADDING;
    const useUploadThing = req.body.useUploadThing === true;

    // Validate dimensions
    if (width < 100 || width > 10000 || height < 100 || height > 10000) {
      res.status(400).json({ 
        error: "Width and height must be between 100 and 10000 pixels." 
      });
      return;
    }

    // Validate padding
    if (padding < 0 || padding >= Math.min(width, height) / 2) {
      res.status(400).json({ 
        error: "Padding must be non-negative and less than half of the smallest dimension." 
      });
      return;
    }

    // Create a temporary canvas to calculate text layout
    const tempCanvas = createCanvas(width, height);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.font = `${fontSize}px ${FONT_FAMILY}`;
    
    // Calculate maximum lines per page
    const maxLinesPerPage = calculateMaxLines(height, padding, fontSize);
    if (maxLinesPerPage < 1) {
      res.status(400).json({ 
        error: "Image dimensions are too small to fit any text. Increase height or decrease padding/fontSize." 
      });
      return;
    }

    // Paginate text
    const maxTextWidth = width - 2 * padding;
    const pages = paginateText(tempCtx, text, maxTextWidth, maxLinesPerPage, letterSpacing);

    // Generate images for each page
    const imageUrls: string[] = [];
    let uploadError: Error | null = null;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const pageLines = pages[pageIndex];
      if (!pageLines || pageLines.length === 0) continue;
      
      // Generate image for this page
      const png = await generateImage(
        pageLines,
        width,
        height,
        bgColor,
        textColor,
        fontSize,
        letterSpacing,
        padding
      );

      const uniqueName = `${uuidv4()}-page-${pageIndex + 1}.png`;
      let imageUrl: string | null = null;

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

      imageUrls.push(imageUrl);
    }

    // Return single URL if one page, array if multiple pages
    if (imageUrls.length === 1) {
      res.status(200).json({ url: imageUrls[0] });
    } else {
      res.status(200).json({ 
        urls: imageUrls,
        pageCount: imageUrls.length,
        message: `Text was split into ${imageUrls.length} pages`
      });
    }
  } catch (e) {
    console.error("Error generating image:", e);
    res.status(500).json({ error: "Invalid request or server error." });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});
