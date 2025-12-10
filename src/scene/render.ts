import {
  createCanvas,
  loadImage,
  type SKRSContext2D,
} from "@napi-rs/canvas";
import { drawTextWithLetterSpacing } from "./text.js";
import { type LayoutNodeResult } from "./types.js";

export async function renderLayoutToImage(
  layout: LayoutNodeResult,
  backgroundColor?: string
): Promise<Buffer> {
  const width = Math.ceil(layout.width);
  const height = Math.ceil(layout.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = backgroundColor ?? "#ffffff";
  ctx.fillRect(0, 0, width, height);
  await paintLayoutNode(ctx, layout);
  return canvas.encode("png");
}

export async function paintLayoutNode(
  ctx: SKRSContext2D,
  layout: LayoutNodeResult
) {
  const node = layout.node;
  ctx.save();
  ctx.globalAlpha *= node.opacity ?? 1;

  const drawRect = () => {
    if (!node.backgroundColor) return;
    ctx.fillStyle = node.backgroundColor;
    if (node.cornerRadius && node.cornerRadius > 0) {
      drawRoundedRect(
        ctx,
        layout.absX,
        layout.absY,
        layout.width,
        layout.height,
        node.cornerRadius
      );
      ctx.fill();
    } else {
      ctx.fillRect(layout.absX, layout.absY, layout.width, layout.height);
    }
  };

  if (node.type === "RECT" || node.type === "FRAME") {
    drawRect();
  }

  if (layout.textLayout && node.type === "TEXT") {
    ctx.font = layout.textLayout.font;
    ctx.fillStyle = layout.textLayout.color;
    ctx.textAlign = layout.textLayout.textAlign;
    ctx.textBaseline = "top";
    (ctx as any).direction = layout.textLayout.direction.toLowerCase();
    let textX = layout.absX;
    if (layout.textLayout.textAlign === "center") {
      textX = layout.absX + layout.width / 2;
    } else if (layout.textLayout.textAlign === "right") {
      textX = layout.absX + layout.width;
    }
    let textY = layout.absY;
    for (const line of layout.textLayout.lines) {
      drawTextWithLetterSpacing(
        ctx,
        line,
        textX,
        textY,
        layout.textLayout.letterSpacing,
        layout.textLayout.direction
      );
      textY += layout.textLayout.lineHeight;
    }
  }

  if (node.imageUrl && node.type === "IMAGE") {
    const image = await loadImage(node.imageUrl);
    ctx.drawImage(image, layout.absX, layout.absY, layout.width, layout.height);
  }

  if (node.clipsContent) {
    ctx.save();
    if (node.cornerRadius && node.cornerRadius > 0) {
      drawRoundedRect(
        ctx,
        layout.absX,
        layout.absY,
        layout.width,
        layout.height,
        node.cornerRadius
      );
      ctx.clip();
    } else {
      ctx.beginPath();
      ctx.rect(layout.absX, layout.absY, layout.width, layout.height);
      ctx.clip();
    }
    for (const child of layout.children) {
      await paintLayoutNode(ctx, child);
    }
    ctx.restore();
  } else {
    for (const child of layout.children) {
      await paintLayoutNode(ctx, child);
    }
  }

  ctx.restore();
}

export function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

