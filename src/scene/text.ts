// @ts-ignore
import reshaper from "arabic-persian-reshaper";
import { SceneNodeInput } from "./types.js";

const RTL_CHAR_PATTERN =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function drawTextWithLetterSpacing(
  ctx: any,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
  direction: "LTR" | "RTL" = "RTL"
) {
  let currentX = x;
  for (const char of text) {
    ctx.fillText(char, currentX, y);
    const metrics = ctx.measureText(char);
    const advance = metrics.width + letterSpacing;
    currentX += direction === "RTL" ? -advance : advance;
  }
}

export function getTextWidthWithLetterSpacing(
  ctx: any,
  text: string,
  letterSpacing: number,
  direction: "LTR" | "RTL" = "RTL"
) {
  let width = 0;
  for (const char of text) {
    width += ctx.measureText(char).width + letterSpacing;
  }
  return width - letterSpacing;
}

export function wrapTextRTL(
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

export function wrapTextLTR(
  ctx: any,
  text: string,
  maxWidth: number,
  letterSpacing: number
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${String(words[i])}` : String(words[i]);
    const testWidth = getTextWidthWithLetterSpacing(
      ctx,
      testLine,
      letterSpacing,
      "LTR"
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

export function reshapeTextContent(text: string): string {
  try {
    return reshaper.PersianShaper.convertArabic(text);
  } catch {
    return text;
  }
}

export function preprocessSceneText(node: SceneNodeInput) {
  if (typeof node.text === "string") {
    node.text = reshapeTextContent(node.text);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(preprocessSceneText);
  }
}

export function detectTextDirection(text?: string): "LTR" | "RTL" {
  if (text && RTL_CHAR_PATTERN.test(text)) {
    return "RTL";
  }
  return "LTR";
}

