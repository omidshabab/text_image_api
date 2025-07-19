import express from "express";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { join } from "path";
// @ts-ignore
import reshaper from "arabic-persian-reshaper";
import { UTApi } from "uploadthing/server";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
dotenv.config();

const app = express();
app.use(express.json());

const fontPath = join(__dirname, "assets/fonts/fa/Estedad-FD-Medium.woff2");
console.log("Font path:", fontPath);
const fontRegistered = GlobalFonts.registerFromPath(fontPath, "Estedad");
console.log("Font registered:", fontRegistered);
console.log("Font families:", GlobalFonts.families);

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

app.post("/image", async (req, res) => {
  try {
    let text = String(req.body.text);
    if (typeof text !== "string" || !text.trim()) {
      return res
        .status(400)
        .json({ error: "Missing or invalid 'text' field." });
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
      return res.status(400).json({ error: "The text is more than 5 lines." });
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

    // Upload to UploadThing using UTApi
    const uploadthingToken = process.env.UPLOADTHING_TOKEN;
    if (!uploadthingToken) {
      return res
        .status(500)
        .json({ error: "UploadThing token not set in .env" });
    }
    const utapi = new UTApi({ token: uploadthingToken });
    // Use File class (polyfilled if needed) with unique filename
    const uniqueName = uuidv4() + ".png";
    const file = new FileClass([png], uniqueName, { type: "image/png" });
    const uploadRes = await utapi.uploadFiles(file);
    if (!uploadRes || !uploadRes.data || !uploadRes.data.url) {
      return res
        .status(500)
        .json({ error: "Failed to upload image to UploadThing" });
    }
    return res.status(200).json({ url: uploadRes.data.url });
  } catch (e) {
    console.error("Error generating image:", e);
    res.status(500).json({ error: "Invalid request or server error." });
  }
});

app.listen(3000, () => {
  console.log("Express server listening on port 3000");
});
