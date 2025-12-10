import { createCanvas } from "@napi-rs/canvas";
import { buildFontStack } from "../config/fonts.js";
import {
  drawTextWithLetterSpacing,
  getTextWidthWithLetterSpacing,
  wrapTextRTL,
} from "./text.js";

export function calculateMaxLines(
  height: number,
  padding: number,
  fontSize: number,
  lineHeightMultiplier: number = 1.5
): number {
  const availableHeight = height - 2 * padding;
  const lineHeight = fontSize * lineHeightMultiplier;
  return Math.floor(availableHeight / lineHeight);
}

export function paginateText(
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

export async function generateImage(
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
  ctx.font = buildFontStack(fontCssWeight, fontSize, fontFamily);
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

