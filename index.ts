import { serve } from "bun";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { join } from "path";
// @ts-ignore
// Fix for missing types for arabic-persian-reshaper
// If you want, you can move this to a .d.ts file
// declare module 'arabic-persian-reshaper';
// @ts-ignore
import reshaper from "arabic-persian-reshaper";
console.log("reshaper export:", reshaper);

// Register Estedad font
const fontPath = join(
  import.meta.dir,
  "assets/fonts/fa/Estedad-FD-Medium.woff2"
);
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
  // Draw each character manually with custom spacing (RTL)
  let currentX = x;
  for (const char of text) {
    ctx.fillText(char, currentX, y);
    const metrics = ctx.measureText(char);
    currentX -= metrics.width + letterSpacing; // Move left for RTL
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
  // Remove last letterSpacing
  return width - letterSpacing;
}

function wrapTextRTL(
  ctx: any,
  text: string,
  maxWidth: number,
  letterSpacing: number
) {
  // Split by space, build lines from right to left
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

serve({
  port: 3000,
  async fetch(req) {
    if (req.method === "POST" && new URL(req.url).pathname === "/image") {
      try {
        const body = (await req.json()) as { text: string };
        let text = String(body.text);
        if (typeof text !== "string" || !text.trim()) {
          return new Response(
            JSON.stringify({ error: "Missing or invalid 'text' field." }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        // Reshape for correct joining and RTL
        text = reshaper.PersianShaper.convertArabic(text);

        const canvas = createCanvas(WIDTH, HEIGHT);
        const ctx = canvas.getContext("2d");
        // Background
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        // Font
        ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
        ctx.fillStyle = TEXT_COLOR;
        ctx.textBaseline = "middle";
        ctx.textAlign = "right";
        // Word wrap
        const maxTextWidth = WIDTH - 2 * PADDING;
        const lines = wrapTextRTL(ctx, text, maxTextWidth, LETTER_SPACING);
        // Calculate vertical centering
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
          const x = WIDTH - PADDING - (maxTextWidth - lineWidth) / 2; // Centered RTL
          drawTextWithLetterSpacing(ctx, safeLine, x, y, LETTER_SPACING);
          y += lineHeight;
        }
        // Output image
        console.log("Encoding PNG...");
        const png = await canvas.encode("png");
        console.log("PNG encoded, size:", png.length);
        return new Response(png, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Disposition": `attachment; filename=persian_text.png`,
          },
        });
      } catch (e) {
        console.error("Error generating image:", e);
        return new Response(
          JSON.stringify({ error: "Invalid request or server error." }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }
    // Not found
    return new Response("Not found", { status: 404 });
  },
});
