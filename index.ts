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
import { PDFDocument } from "pdf-lib";
dotenv.config();

const app = express();
app.use(express.json());

// Handle __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FONT_PATH_ALIASES: Record<string, string> = {
  "@Estedad": "assets/fonts/fa/Estedad",
};

const FONT_WEIGHT_FILES = {
  Thin: "Estedad-FD-Thin.woff2",
  ExtraLight: "Estedad-FD-ExtraLight.woff2",
  Light: "Estedad-FD-Light.woff2",
  Regular: "Estedad-FD-Regular.woff2",
  Medium: "Estedad-FD-Medium.woff2",
  SemiBold: "Estedad-FD-SemiBold.woff2",
  Bold: "Estedad-FD-Bold.woff2",
  ExtraBold: "Estedad-FD-ExtraBold.woff2",
  Black: "Estedad-FD-Black.woff2",
} as const;

type FontWeightKey = keyof typeof FONT_WEIGHT_FILES;

const FONT_WEIGHT_CSS: Record<FontWeightKey, string> = {
  Thin: "100",
  ExtraLight: "200",
  Light: "300",
  Regular: "400",
  Medium: "500",
  SemiBold: "600",
  Bold: "700",
  ExtraBold: "800",
  Black: "900",
};

const FONT_WEIGHT_ALIASES: Record<string, FontWeightKey> = {
  thin: "Thin",
  "100": "Thin",
  extralight: "ExtraLight",
  ultralight: "ExtraLight",
  "200": "ExtraLight",
  light: "Light",
  "300": "Light",
  regular: "Regular",
  normal: "Regular",
  "400": "Regular",
  medium: "Medium",
  "500": "Medium",
  semibold: "SemiBold",
  demibold: "SemiBold",
  "600": "SemiBold",
  bold: "Bold",
  "700": "Bold",
  extrabold: "ExtraBold",
  ultrabold: "ExtraBold",
  "800": "ExtraBold",
  black: "Black",
  heavy: "Black",
  "900": "Black",
};

type FontName = "Estedad";

const FONT_LIBRARY: Record<
  FontName,
  {
    basePathAlias: keyof typeof FONT_PATH_ALIASES;
    defaultWeight: FontWeightKey;
    weights: Record<FontWeightKey, string>;
  }
> = {
  Estedad: {
    basePathAlias: "@Estedad",
    defaultWeight: "Medium",
    weights: FONT_WEIGHT_FILES,
  },
};

const DEFAULT_FONT_NAME: FontName = "Estedad";
const registeredFontFamilies = new Set<string>();

// Default values
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_BG_COLOR = "#181A20";
const DEFAULT_TEXT_COLOR = "#fff";
const DEFAULT_FONT_SIZE = 64;
const DEFAULT_LETTER_SPACING = -5; // px
const DEFAULT_PADDING = 80;

class UploadError extends Error {
  details: string;
  constructor(details: string) {
    super("Failed to upload file to both Liara and UploadThing");
    this.name = "UploadError";
    this.details = details;
  }
}

function resolveAliasPath(alias: string): string {
  const mapped =
    FONT_PATH_ALIASES[alias as keyof typeof FONT_PATH_ALIASES] ?? alias;
  return join(__dirname, mapped);
}

function normalizeFontWeight(input: unknown): FontWeightKey | null {
  if (typeof input === "string" || typeof input === "number") {
    const value = String(input).toLowerCase().replace(/[^a-z0-9]/g, "");
    const mapped = FONT_WEIGHT_ALIASES[value];
    if (mapped) return mapped;
  }
  return null;
}

function isFontName(value: string): value is FontName {
  return Object.prototype.hasOwnProperty.call(FONT_LIBRARY, value as FontName);
}

function registerFont(fontName: FontName, weight: FontWeightKey): string {
  const fontKey = `${fontName}-${weight}`;
  if (registeredFontFamilies.has(fontKey)) {
    return fontKey;
  }

  const fontConfig = FONT_LIBRARY[fontName];
  const fontFile = fontConfig.weights[weight];
  const basePath = resolveAliasPath(fontConfig.basePathAlias);
  const fontPath = join(basePath, fontFile);

  const isRegistered = GlobalFonts.registerFromPath(fontPath, fontKey);
  if (!isRegistered) {
    throw new Error(`Failed to register font ${fontName} with weight ${weight}`);
  }
  registeredFontFamilies.add(fontKey);
  return fontKey;
}

function resolveFontRequest(
  fontNameInput: unknown,
  fontWeightInput: unknown
):
  | {
      ok: true;
      fontName: FontName;
      fontWeight: FontWeightKey;
      fontFamily: string;
      fontCssWeight: string;
    }
  | {
      ok: false;
      error: string;
    } {
  let fontName: FontName = DEFAULT_FONT_NAME;

  if (fontNameInput !== undefined) {
    if (typeof fontNameInput !== "string") {
      return { ok: false, error: "'fontName' must be a string value." };
    }
    const trimmed = fontNameInput.trim();
    if (!trimmed) {
      return { ok: false, error: "'fontName' cannot be empty." };
    }
    if (!isFontName(trimmed)) {
      return {
        ok: false,
        error: `Unsupported 'fontName'. Available options: ${Object.keys(FONT_LIBRARY).join(
          ", "
        )}.`,
      };
    }
    fontName = trimmed;
  }

  let fontWeight: FontWeightKey = FONT_LIBRARY[fontName].defaultWeight;

  if (fontWeightInput !== undefined) {
    const normalizedWeight = normalizeFontWeight(fontWeightInput);
    if (!normalizedWeight) {
      return {
        ok: false,
        error: `Unsupported 'fontWeight'. Available options: ${Object.keys(
          FONT_WEIGHT_FILES
        ).join(", ")}.`,
      };
    }

    if (!FONT_LIBRARY[fontName].weights[normalizedWeight]) {
      return {
        ok: false,
        error: `'${fontName}' does not provide the '${normalizedWeight}' weight.`,
      };
    }

    fontWeight = normalizedWeight;
  }

  try {
    const fontFamily = registerFont(fontName, fontWeight);
    return {
      ok: true,
      fontName,
      fontWeight,
      fontFamily,
      fontCssWeight: FONT_WEIGHT_CSS[fontWeight],
    };
  } catch (error) {
    console.error("Font registration failed:", error);
    return {
      ok: false,
      error:
        "Unable to register the requested font. Ensure the font files are accessible.",
    };
  }
}

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
  padding: number,
  fontFamily: string,
  fontCssWeight: string
): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  // Draw background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  
  // Set font and text properties
  ctx.font = `${fontCssWeight} ${fontSize}px ${fontFamily}`;
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

async function createPdfFromImages(
  images: Buffer[],
  width: number,
  height: number
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  for (const imageBuffer of images) {
    const pngImage = await pdfDoc.embedPng(imageBuffer);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
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
  
  // Construct public URL
  const publicUrl = LIARA_PUBLIC_URL
    ? `${LIARA_PUBLIC_URL}/${filename}`
    : `${process.env.LIARA_ENDPOINT || "https://storage.iran.liara.space"}/${LIARA_BUCKET}/${filename}`;
  
  return publicUrl;
}

// Upload to UploadThing
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
    const outputFormat =
      typeof req.body.outputFormat === "string" &&
      req.body.outputFormat.toLowerCase() === "pdf"
        ? "pdf"
        : "image";
    const pdfLayout =
      typeof req.body.pdfLayout === "string" &&
      req.body.pdfLayout.toLowerCase() === "separate"
        ? "separate"
        : "combined";

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
    const fontResolution = resolveFontRequest(
      req.body.fontName,
      req.body.fontWeight
    );
    if (!fontResolution.ok) {
      res.status(400).json({ error: fontResolution.error });
      return;
    }
    const { fontFamily, fontCssWeight } = fontResolution;

    const tempCanvas = createCanvas(width, height);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.font = `${fontCssWeight} ${fontSize}px ${fontFamily}`;
    
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

    const uploadWithFallback = async (
      buffer: Buffer,
      filename: string,
      contentType: string
    ): Promise<string> => {
      let liaraError: Error | null = null;
      let url: string | null = null;

      if (!useUploadThing) {
        try {
          if (
            !LIARA_BUCKET ||
            !process.env.LIARA_ACCESS_KEY ||
            !process.env.LIARA_SECRET_KEY
          ) {
            throw new Error("Liara configuration is missing");
          }
          url = await uploadToLiara(buffer, filename, contentType);
        } catch (error) {
          liaraError = error as Error;
          console.error(
            "Liara upload failed, falling back to UploadThing:",
            error
          );
        }
      }

      if (useUploadThing || !url) {
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
    };

    const handleUploadFailure = (error: unknown) => {
      if (error instanceof UploadError) {
        res
          .status(500)
          .json({ error: error.message, details: error.details });
      } else {
        res.status(500).json({ error: "Failed to upload file." });
      }
    };

    const pageBuffers: Buffer[] = [];

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const pageLines = pages[pageIndex];
      if (!pageLines || pageLines.length === 0) continue;

      const png = await generateImage(
        pageLines,
        width,
        height,
        bgColor,
        textColor,
        fontSize,
        letterSpacing,
        padding,
        fontFamily,
        fontCssWeight
      );
      pageBuffers.push(png);
    }

    if (pageBuffers.length === 0) {
      res.status(500).json({ error: "No pages were generated." });
      return;
    }

    if (outputFormat === "pdf") {
      const shouldCombine =
        pdfLayout === "combined" || pageBuffers.length === 1;
      const pdfBuffers: Buffer[] = [];

      if (shouldCombine) {
        pdfBuffers.push(
          await createPdfFromImages(pageBuffers, width, height)
        );
      } else {
        for (const buffer of pageBuffers) {
          pdfBuffers.push(
            await createPdfFromImages([buffer], width, height)
          );
        }
      }

      const pdfUrls: string[] = [];

      for (let i = 0; i < pdfBuffers.length; i++) {
        const pdfBuffer = pdfBuffers[i];
        if (!pdfBuffer) continue;
        const filename =
          pdfBuffers.length === 1
            ? `${uuidv4()}.pdf`
            : `${uuidv4()}-part-${i + 1}.pdf`;
        try {
          const url = await uploadWithFallback(
            pdfBuffer,
            filename,
            "application/pdf"
          );
          pdfUrls.push(url);
        } catch (error) {
          handleUploadFailure(error);
          return;
        }
      }

      if (pdfUrls.length === 1) {
        res.status(200).json({
          url: pdfUrls[0],
          format: "pdf",
          pageCount: pageBuffers.length,
          layout: shouldCombine ? "combined" : "separate",
        });
      } else {
        res.status(200).json({
          urls: pdfUrls,
          format: "pdf",
          pageCount: pageBuffers.length,
          layout: "separate",
          message: `Generated ${pdfUrls.length} separate PDF files covering ${pageBuffers.length} pages.`,
        });
      }
      return;
    }

    const imageUrls: string[] = [];

    for (let pageIndex = 0; pageIndex < pageBuffers.length; pageIndex++) {
      const buffer = pageBuffers[pageIndex];
      if (!buffer) continue;
      const uniqueName = `${uuidv4()}-page-${pageIndex + 1}.png`;
      try {
        const url = await uploadWithFallback(
          buffer,
          uniqueName,
          "image/png"
        );
        imageUrls.push(url);
      } catch (error) {
        handleUploadFailure(error);
        return;
      }
    }

    if (imageUrls.length === 1) {
      res.status(200).json({ url: imageUrls[0] });
    } else {
      res.status(200).json({
        urls: imageUrls,
        pageCount: imageUrls.length,
        message: `Text was split into ${imageUrls.length} pages`,
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
