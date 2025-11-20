import express from "express";
import {
  createCanvas,
  GlobalFonts,
  loadImage,
  type SKRSContext2D,
} from "@napi-rs/canvas";
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
const FONT_FALLBACK_STACK =
  '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","sans-serif"';

class UploadError extends Error {
  details: string;
  constructor(details: string) {
    super("Failed to upload file to both Liara and UploadThing");
    this.name = "UploadError";
    this.details = details;
  }
}

class SceneValidationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "SceneValidationError";
    this.statusCode = statusCode;
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

function getTextWidthWithLetterSpacing(
  ctx: any,
  text: string,
  letterSpacing: number,
  _direction: "LTR" | "RTL" = "RTL"
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

function wrapTextLTR(
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

function reshapeTextContent(text: string): string {
  try {
    return reshaper.PersianShaper.convertArabic(text);
  } catch {
    return text;
  }
}

function preprocessSceneText(node: SceneNodeInput) {
  if (typeof node.text === "string") {
    node.text = reshapeTextContent(node.text);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(preprocessSceneText);
  }
}

function detectTextDirection(text?: string): "LTR" | "RTL" {
  if (text && RTL_CHAR_PATTERN.test(text)) {
    return "RTL";
  }
  return "LTR";
}

type SceneNodeType = "FRAME" | "GROUP" | "RECT" | "TEXT" | "IMAGE";
type LayoutMode = "NONE" | "HORIZONTAL" | "VERTICAL";
type PrimaryAxisAlign = "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
type CounterAxisAlign = "MIN" | "CENTER" | "MAX" | "STRETCH";

type DimensionSpec =
  | { mode: "AUTO" }
  | { mode: "FIXED"; value: number }
  | { mode: "PERCENT"; value: number }
  | { mode: "FILL" };

interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface SceneNodeInput {
  id?: string;
  type?: SceneNodeType;
  layoutMode?: LayoutMode;
  children?: SceneNodeInput[];
  width?: number | string;
  height?: number | string;
  padding?: number | Partial<Padding>;
  itemSpacing?: number;
  primaryAxisAlign?: PrimaryAxisAlign;
  counterAxisAlign?: CounterAxisAlign;
  grow?: number;
  shrink?: number;
  basis?: number | string;
  x?: number;
  y?: number;
  absolute?: boolean;
  backgroundColor?: string;
  cornerRadius?: number;
  clipsContent?: boolean;
  opacity?: number;
  text?: string;
  textColor?: string;
  fontSize?: number;
  fontName?: unknown;
  fontWeight?: unknown;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "LEFT" | "CENTER" | "RIGHT";
  textDirection?: "LTR" | "RTL";
  wrap?: boolean;
  maxLines?: number;
  imageUrl?: string;
}

interface NormalizedSceneNode extends SceneNodeInput {
  id: string;
  type: SceneNodeType;
  layoutMode: LayoutMode;
  children: NormalizedSceneNode[];
  padding: Padding;
  itemSpacing: number;
  primaryAxisAlign: PrimaryAxisAlign;
  counterAxisAlign: CounterAxisAlign;
  widthSpec: DimensionSpec;
  heightSpec: DimensionSpec;
  basisSpec: DimensionSpec;
  grow: number;
  shrink: number;
  x: number;
  y: number;
  absolute: boolean;
  clipsContent: boolean;
  opacity: number;
  textAlign: "LEFT" | "CENTER" | "RIGHT";
  textDirection: "LTR" | "RTL";
  wrap: boolean;
  letterSpacing: number;
}

interface LayoutNodeResult {
  node: NormalizedSceneNode;
  width: number;
  height: number;
  localX: number;
  localY: number;
  absX: number;
  absY: number;
  children: LayoutNodeResult[];
  textLayout?: TextLayoutMetadata;
}

interface SerializableLayoutNode {
  id: string;
  type: SceneNodeType;
  layoutMode: LayoutMode;
  x: number;
  y: number;
  width: number;
  height: number;
  children: SerializableLayoutNode[];
}

interface TextLayoutMetadata {
  lines: string[];
  font: string;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  direction: "LTR" | "RTL";
  textAlign: CanvasTextAlign;
}

interface LayoutConstraints {
  availableWidth?: number;
  availableHeight?: number;
  allowFill?: boolean;
}

const DEFAULT_RECT_SIZE = 100;
const AUTO_DIMENSION: DimensionSpec = { mode: "AUTO" };
let autoNodeCounter = 0;
const RTL_CHAR_PATTERN =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function toFiniteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function nextNodeId() {
  autoNodeCounter += 1;
  return `node-${autoNodeCounter}`;
}

function parseDimension(value: unknown): DimensionSpec {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { mode: "FIXED", value };
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return AUTO_DIMENSION;
    if (trimmed === "auto" || trimmed === "hug") return AUTO_DIMENSION;
    if (trimmed === "fill") return { mode: "FILL" };
    if (trimmed.endsWith("%")) {
      const parsed = parseFloat(trimmed.slice(0, -1));
      if (!Number.isNaN(parsed)) {
        return { mode: "PERCENT", value: Math.max(0, parsed) / 100 };
      }
    }
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return { mode: "FIXED", value: numeric };
    }
  }
  return AUTO_DIMENSION;
}

function resolveDimensionValue(
  spec: DimensionSpec,
  available?: number,
  allowFill: boolean = true
): number | undefined {
  switch (spec.mode) {
    case "FIXED":
      return spec.value;
    case "PERCENT":
      if (available === undefined) return undefined;
      return available * spec.value;
    case "FILL":
      return allowFill ? available : undefined;
    default:
      return undefined;
  }
}

function normalizePadding(padding?: number | Partial<Padding>): Padding {
  if (typeof padding === "number") {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  return {
    top: padding?.top ?? 0,
    right: padding?.right ?? 0,
    bottom: padding?.bottom ?? 0,
    left: padding?.left ?? 0,
  };
}

function normalizeLayoutMode(input?: string): LayoutMode {
  const value = input?.toUpperCase();
  if (value === "HORIZONTAL" || value === "VERTICAL") return value;
  return "NONE";
}

function normalizePrimaryAxisAlign(input?: string): PrimaryAxisAlign {
  const value = input?.toUpperCase();
  if (value === "CENTER" || value === "MAX" || value === "SPACE_BETWEEN")
    return value;
  return "MIN";
}

function normalizeCounterAxisAlign(input?: string): CounterAxisAlign {
  const value = input?.toUpperCase();
  if (value === "CENTER" || value === "MAX" || value === "STRETCH")
    return value;
  return "MIN";
}

function normalizeSceneNode(
  input: SceneNodeInput,
  path: string = "node"
): NormalizedSceneNode {
  const assignedId =
    typeof input.id === "string" && input.id.trim()
      ? input.id.trim()
      : `${path}-${nextNodeId()}`;
  const type = (input.type ?? "FRAME").toUpperCase() as SceneNodeType;
  const layoutMode =
    input.layoutMode !== undefined
      ? normalizeLayoutMode(input.layoutMode)
      : type === "GROUP"
      ? "NONE"
      : normalizeLayoutMode(undefined);

  const normalizedChildren = (input.children ?? []).map((child, index) =>
    normalizeSceneNode(child, `${assignedId}-${index}`)
  );

  const padding = normalizePadding(input.padding);
  const itemSpacing =
    typeof input.itemSpacing === "number" && Number.isFinite(input.itemSpacing)
      ? Math.max(0, input.itemSpacing)
      : 0;
  const primaryAxisAlign = normalizePrimaryAxisAlign(input.primaryAxisAlign);
  const counterAxisAlign = normalizeCounterAxisAlign(input.counterAxisAlign);

  const widthSpec = parseDimension(input.width);
  const heightSpec = parseDimension(input.height);
  const basisSpec = parseDimension(input.basis ?? input.width);

  const grow =
    typeof input.grow === "number" && input.grow > 0 ? input.grow : 0;
  const shrink =
    typeof input.shrink === "number" && input.shrink >= 0 ? input.shrink : 1;
  const x = typeof input.x === "number" ? input.x : 0;
  const y = typeof input.y === "number" ? input.y : 0;
  const absolute = input.absolute === true;
  const clipsContent = input.clipsContent === true;
  const opacity =
    typeof input.opacity === "number"
      ? Math.min(1, Math.max(0, input.opacity))
      : 1;

  const textDirection =
    input.textDirection === "RTL"
      ? "RTL"
      : input.textDirection === "LTR"
      ? "LTR"
      : detectTextDirection(
          typeof input.text === "string" ? input.text : undefined
        );
  const alignValue =
    typeof input.textAlign === "string"
      ? input.textAlign.toUpperCase()
      : undefined;
  const textAlign =
    alignValue === "LEFT" || alignValue === "CENTER" || alignValue === "RIGHT"
      ? alignValue
      : textDirection === "RTL"
      ? "RIGHT"
      : "LEFT";
  const fontSize =
    typeof input.fontSize === "number" && input.fontSize > 0
      ? input.fontSize
      : 32;
  const parsedLetterSpacing = toFiniteNumber(input.letterSpacing);
  const letterSpacing =
    parsedLetterSpacing !== undefined
      ? parsedLetterSpacing
      : DEFAULT_LETTER_SPACING;
  const wrap = input.wrap !== false;
  const imageUrl =
    typeof input.imageUrl === "string" ? input.imageUrl : undefined;

  return {
    ...input,
    id: assignedId,
    type,
    layoutMode,
    children: normalizedChildren,
    padding,
    itemSpacing,
    primaryAxisAlign,
    counterAxisAlign,
    widthSpec,
    heightSpec,
    basisSpec,
    grow,
    shrink,
    x,
    y,
    absolute,
    clipsContent,
    opacity,
    textAlign,
    textDirection,
    wrap,
    letterSpacing,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function createConstraints(
  width?: number,
  height?: number,
  allowFill?: boolean
): LayoutConstraints {
  const constraints: LayoutConstraints = {};
  if (width !== undefined) {
    constraints.availableWidth = width;
  }
  if (height !== undefined) {
    constraints.availableHeight = height;
  }
  if (allowFill !== undefined) {
    constraints.allowFill = allowFill;
  }
  return constraints;
}

function buildFontStack(
  fontCssWeight: string,
  fontSize: number,
  fontFamily: string
) {
  return `${fontCssWeight} ${fontSize}px ${fontFamily}, ${FONT_FALLBACK_STACK}`;
}

function computeSceneLayout(
  scene: SceneNodeInput
): LayoutNodeResult {
  autoNodeCounter = 0;
  const normalized = normalizeSceneNode(scene, "root");
  if (normalized.widthSpec.mode !== "FIXED") {
    throw new SceneValidationError(
      "Root scene frame must define a numeric width."
    );
  }
  if (normalized.heightSpec.mode !== "FIXED") {
    throw new SceneValidationError(
      "Root scene frame must define a numeric height."
    );
  }

  const measurementCanvas = createCanvas(1, 1);
  const measurementCtx = measurementCanvas.getContext(
    "2d"
  ) as SKRSContext2D;

  const rootLayout = layoutNode(normalized, measurementCtx, {
    availableWidth: normalized.widthSpec.value,
    availableHeight: normalized.heightSpec.value,
    allowFill: true,
  });
  assignAbsolutePosition(rootLayout, 0, 0);
  return rootLayout;
}

function layoutNode(
  node: NormalizedSceneNode,
  ctx: SKRSContext2D,
  constraints: LayoutConstraints
): LayoutNodeResult {
  if (node.type === "TEXT") {
    return layoutTextNode(node, ctx, constraints);
  }

  if (node.children.length > 0) {
    return layoutContainerNode(node, ctx, constraints);
  }

  return layoutLeafNode(node, constraints);
}

function layoutLeafNode(
  node: NormalizedSceneNode,
  constraints: LayoutConstraints
): LayoutNodeResult {
  const shouldDefault =
    node.type === "RECT" || node.type === "IMAGE";
  let width =
    resolveDimensionValue(
      node.widthSpec,
      constraints.availableWidth,
      constraints.allowFill ?? true
    ) ??
    (shouldDefault ? DEFAULT_RECT_SIZE : 0);
  let height =
    resolveDimensionValue(
      node.heightSpec,
      constraints.availableHeight,
      constraints.allowFill ?? true
    ) ??
    (shouldDefault ? DEFAULT_RECT_SIZE : 0);

  width = Math.max(0, width);
  height = Math.max(0, height);

  return {
    node,
    width,
    height,
    localX: 0,
    localY: 0,
    absX: 0,
    absY: 0,
    children: [],
  };
}

function layoutTextNode(
  node: NormalizedSceneNode,
  ctx: SKRSContext2D,
  constraints: LayoutConstraints
): LayoutNodeResult {
  const fontResolution = resolveFontRequest(node.fontName, node.fontWeight);
  if (!fontResolution.ok) {
    throw new SceneValidationError(fontResolution.error);
  }

  const fontSize =
    typeof node.fontSize === "number" && node.fontSize > 0
      ? node.fontSize
      : DEFAULT_FONT_SIZE;
  const lineHeight =
    typeof node.lineHeight === "number" && node.lineHeight > 0
      ? node.lineHeight
      : fontSize * 1.4;

  const letterSpacing = node.letterSpacing ?? 0;
  const text = typeof node.text === "string" ? node.text : "";
  const lines: string[] = [];

  const font = buildFontStack(
    fontResolution.fontCssWeight,
    fontSize,
    fontResolution.fontFamily
  );
  ctx.font = font;
  ctx.textAlign = node.textDirection === "RTL" ? "right" : "left";
  (ctx as any).direction =
    node.textDirection === "RTL" ? "rtl" : "ltr";

  const maxWidth =
    resolveDimensionValue(
      node.widthSpec,
      constraints.availableWidth,
      constraints.allowFill ?? true
    ) ??
    undefined;

  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    if (!node.wrap || !maxWidth || maxWidth <= 0) {
      lines.push(paragraph);
      continue;
    }
    const wrapped =
      node.textDirection === "RTL"
        ? wrapTextRTL(ctx, paragraph, maxWidth, letterSpacing)
        : wrapTextLTR(ctx, paragraph, maxWidth, letterSpacing);
    lines.push(...wrapped);
  }

  if (lines.length === 0) {
    lines.push("");
  }

  const textWidth = lines.reduce((max, line) => {
    const width = getTextWidthWithLetterSpacing(
      ctx,
      line,
      letterSpacing,
      node.textDirection
    );
    return Math.max(max, width);
  }, 0);

  if (node.maxLines && lines.length > node.maxLines) {
    lines.length = node.maxLines;
  }

  let width =
    resolveDimensionValue(
      node.widthSpec,
      constraints.availableWidth,
      constraints.allowFill ?? true
    ) ??
    textWidth;
  let height =
    resolveDimensionValue(
      node.heightSpec,
      constraints.availableHeight,
      constraints.allowFill ?? true
    ) ??
    lineHeight * lines.length;

  width = Math.max(0, width);
  height = Math.max(0, height);

  return {
    node,
    width,
    height,
    localX: 0,
    localY: 0,
    absX: 0,
    absY: 0,
    children: [],
    textLayout: {
      lines,
      font,
      color: node.textColor ?? DEFAULT_TEXT_COLOR,
      letterSpacing,
      lineHeight,
      direction: node.textDirection,
      textAlign:
        node.textAlign === "CENTER"
          ? "center"
          : node.textAlign === "RIGHT"
          ? "right"
          : "left",
    },
  };
}

function layoutContainerNode(
  node: NormalizedSceneNode,
  ctx: SKRSContext2D,
  constraints: LayoutConstraints
): LayoutNodeResult {
  if (node.layoutMode === "NONE") {
    return layoutAbsoluteContainer(node, ctx, constraints);
  }
  return layoutAutoLayoutContainer(node, ctx, constraints);
}

function layoutAbsoluteContainer(
  node: NormalizedSceneNode,
  ctx: SKRSContext2D,
  constraints: LayoutConstraints
): LayoutNodeResult {
  const padding = node.padding;
  const childLayouts: LayoutNodeResult[] = [];

  let contentWidth = 0;
  let contentHeight = 0;

  for (const child of node.children) {
    const childLayout = layoutNode(child, ctx, { allowFill: true });
    const childX = padding.left + child.x;
    const childY = padding.top + child.y;
    childLayout.localX = childX;
    childLayout.localY = childY;
    contentWidth = Math.max(contentWidth, childX + childLayout.width);
    contentHeight = Math.max(contentHeight, childY + childLayout.height);
    childLayouts.push(childLayout);
  }

  let width =
    resolveDimensionValue(
      node.widthSpec,
      constraints.availableWidth,
      constraints.allowFill ?? true
    ) ??
    contentWidth + Math.max(0, padding.right);
  let height =
    resolveDimensionValue(
      node.heightSpec,
      constraints.availableHeight,
      constraints.allowFill ?? true
    ) ??
    contentHeight + Math.max(0, padding.bottom);

  width = Math.max(width, padding.left + padding.right);
  height = Math.max(height, padding.top + padding.bottom);

  return {
    node,
    width,
    height,
    localX: 0,
    localY: 0,
    absX: 0,
    absY: 0,
    children: childLayouts,
  };
}

function layoutAutoLayoutContainer(
  node: NormalizedSceneNode,
  ctx: SKRSContext2D,
  constraints: LayoutConstraints
): LayoutNodeResult {
  const isHorizontal = node.layoutMode === "HORIZONTAL";
  const padding = node.padding;

  let resolvedWidth = resolveDimensionValue(
    node.widthSpec,
    constraints.availableWidth,
    constraints.allowFill ?? true
  );
  let resolvedHeight = resolveDimensionValue(
    node.heightSpec,
    constraints.availableHeight,
    constraints.allowFill ?? true
  );

  let innerWidth =
    resolvedWidth !== undefined
      ? Math.max(0, resolvedWidth - (padding.left + padding.right))
      : undefined;
  let innerHeight =
    resolvedHeight !== undefined
      ? Math.max(0, resolvedHeight - (padding.top + padding.bottom))
      : undefined;

  const flowChildren = node.children.filter((child) => !child.absolute);
  const absoluteChildren = node.children.filter((child) => child.absolute);

  const flowLayouts = new Map<string, LayoutNodeResult>();
  const deferredFill: { child: NormalizedSceneNode; index: number }[] = [];

  const axisSize = (layout: LayoutNodeResult) =>
    isHorizontal ? layout.width : layout.height;
  const crossSize = (layout: LayoutNodeResult) =>
    isHorizontal ? layout.height : layout.width;

  let totalAxis = 0;
  let maxCross = 0;

  flowChildren.forEach((child, index) => {
    const axisSpec = isHorizontal ? child.widthSpec : child.heightSpec;
    const shouldFill =
      axisSpec.mode === "FILL" &&
      ((isHorizontal ? innerWidth : innerHeight) ?? 0) > 0;
    if (shouldFill) {
      deferredFill.push({ child, index });
      return;
    }

    const percentWidth =
      child.widthSpec.mode === "PERCENT" && innerWidth !== undefined
        ? innerWidth * child.widthSpec.value
        : undefined;
    const percentHeight =
      child.heightSpec.mode === "PERCENT" && innerHeight !== undefined
        ? innerHeight * child.heightSpec.value
        : undefined;
    const childLayout = layoutNode(
      child,
      ctx,
      createConstraints(
        percentWidth ?? innerWidth,
        percentHeight ?? innerHeight,
        false
      )
    );
    flowLayouts.set(child.id, childLayout);
    totalAxis += axisSize(childLayout);
    maxCross = Math.max(maxCross, crossSize(childLayout));
  });

  const spacingCount = Math.max(flowChildren.length - 1, 0);
  const spacingTotal = node.itemSpacing * spacingCount;

  const axisSpaceForFill = isHorizontal ? innerWidth : innerHeight;

  if (deferredFill.length && axisSpaceForFill !== undefined) {
    const usedSpace = totalAxis + spacingTotal;
    const remaining = Math.max(axisSpaceForFill - usedSpace, 0);
    const totalGrow =
      deferredFill.reduce((sum, item) => sum + (item.child.grow || 1), 0) ||
      deferredFill.length;

    for (const entry of deferredFill) {
      const portion =
        (remaining * (entry.child.grow || 1)) / totalGrow || 0;
      const childLayout = layoutNode(
        entry.child,
        ctx,
        createConstraints(
          isHorizontal ? portion : innerWidth,
          isHorizontal ? innerHeight : portion,
          true
        )
      );
      if (isHorizontal && portion) {
        childLayout.width = portion;
      } else if (!isHorizontal && portion) {
        childLayout.height = portion;
      }
      flowLayouts.set(entry.child.id, childLayout);
      totalAxis += axisSize(childLayout);
      maxCross = Math.max(maxCross, crossSize(childLayout));
    }
  } else if (deferredFill.length) {
    for (const entry of deferredFill) {
      const childLayout = layoutNode(
        entry.child,
        ctx,
        createConstraints(innerWidth, innerHeight, false)
      );
      flowLayouts.set(entry.child.id, childLayout);
      totalAxis += axisSize(childLayout);
      maxCross = Math.max(maxCross, crossSize(childLayout));
    }
  }

  if (resolvedWidth === undefined) {
    resolvedWidth = isHorizontal
      ? padding.left + padding.right + totalAxis + spacingTotal
      : padding.left + padding.right + maxCross;
    innerWidth = Math.max(0, resolvedWidth - (padding.left + padding.right));
  }
  if (resolvedHeight === undefined) {
    resolvedHeight = isHorizontal
      ? padding.top + padding.bottom + maxCross
      : padding.top + padding.bottom + totalAxis + spacingTotal;
    innerHeight = Math.max(0, resolvedHeight - (padding.top + padding.bottom));
  }

  const totalChildren = flowChildren.length;
  let cursor = isHorizontal ? padding.left : padding.top;
  const axisInner = isHorizontal
    ? innerWidth ?? totalAxis + spacingTotal
    : innerHeight ?? totalAxis + spacingTotal;
  const crossInner = isHorizontal
    ? innerHeight ?? maxCross
    : innerWidth ?? maxCross;

  let gap = node.itemSpacing;
  if (
    node.primaryAxisAlign === "SPACE_BETWEEN" &&
    totalChildren > 1 &&
    (isHorizontal ? innerWidth : innerHeight) !== undefined
  ) {
    const axisAvailable = (isHorizontal ? innerWidth : innerHeight) as number;
    const extra = axisAvailable - totalAxis;
    gap = extra > 0 ? extra / (totalChildren - 1) : 0;
  }

  const occupied =
    totalAxis + (totalChildren > 1 ? gap * (totalChildren - 1) : 0);

  let startOffset = isHorizontal ? padding.left : padding.top;
  if (isHorizontal) {
    switch (node.primaryAxisAlign) {
      case "CENTER":
        startOffset =
          padding.left + Math.max(0, (axisInner - occupied) / 2);
        break;
      case "MAX":
        startOffset =
          padding.left + Math.max(0, axisInner - occupied);
        break;
      case "SPACE_BETWEEN":
        startOffset = padding.left;
        break;
      default:
        startOffset = padding.left;
    }
  } else {
    switch (node.primaryAxisAlign) {
      case "CENTER":
        startOffset =
          padding.top + Math.max(0, (axisInner - occupied) / 2);
        break;
      case "MAX":
        startOffset =
          padding.top + Math.max(0, axisInner - occupied);
        break;
      case "SPACE_BETWEEN":
        startOffset = padding.top;
        break;
      default:
        startOffset = padding.top;
    }
  }

  cursor = startOffset;

  const positionedFlow = new Map<string, LayoutNodeResult>();

  for (const child of flowChildren) {
    const childLayout = flowLayouts.get(child.id);
    if (!childLayout) continue;

    if (node.counterAxisAlign === "STRETCH") {
      if (isHorizontal && innerHeight !== undefined) {
        childLayout.height = innerHeight;
      } else if (!isHorizontal && innerWidth !== undefined) {
        childLayout.width = innerWidth;
      }
    }

    let crossOffset = isHorizontal ? padding.top : padding.left;
    const crossAvailable = crossInner;
    const childCrossSize = crossSize(childLayout);

    switch (node.counterAxisAlign) {
      case "CENTER":
        if (crossAvailable !== undefined) {
          crossOffset += Math.max(0, (crossAvailable - childCrossSize) / 2);
        }
        break;
      case "MAX":
        if (crossAvailable !== undefined) {
          crossOffset += Math.max(0, crossAvailable - childCrossSize);
        }
        break;
      case "STRETCH":
        crossOffset += 0;
        break;
      default:
        crossOffset += 0;
    }

    if (isHorizontal) {
      childLayout.localX = cursor;
      childLayout.localY = crossOffset;
      cursor +=
        childLayout.width +
        (node.primaryAxisAlign === "SPACE_BETWEEN" ? gap : node.itemSpacing);
    } else {
      childLayout.localX = crossOffset;
      childLayout.localY = cursor;
      cursor +=
        childLayout.height +
        (node.primaryAxisAlign === "SPACE_BETWEEN" ? gap : node.itemSpacing);
    }

    positionedFlow.set(child.id, childLayout);
  }

  const absoluteLayouts = new Map<string, LayoutNodeResult>();
  for (const child of absoluteChildren) {
    const childLayout = layoutNode(
      child,
      ctx,
      createConstraints(innerWidth, innerHeight, true)
    );
    childLayout.localX = padding.left + child.x;
    childLayout.localY = padding.top + child.y;
    absoluteLayouts.set(child.id, childLayout);
  }

  const orderedChildren: LayoutNodeResult[] = [];
  for (const child of node.children) {
    const layout =
      positionedFlow.get(child.id) ?? absoluteLayouts.get(child.id);
    if (layout) {
      orderedChildren.push(layout);
    }
  }

  return {
    node,
    width: resolvedWidth ?? 0,
    height: resolvedHeight ?? 0,
    localX: 0,
    localY: 0,
    absX: 0,
    absY: 0,
    children: orderedChildren,
  };
}

function assignAbsolutePosition(
  layout: LayoutNodeResult,
  parentX: number,
  parentY: number
) {
  layout.absX = parentX + layout.localX;
  layout.absY = parentY + layout.localY;
  for (const child of layout.children) {
    assignAbsolutePosition(child, layout.absX, layout.absY);
  }
}

function serializeLayoutNode(
  layout: LayoutNodeResult
): SerializableLayoutNode {
  return {
    id: layout.node.id,
    type: layout.node.type,
    layoutMode: layout.node.layoutMode,
    x: layout.absX,
    y: layout.absY,
    width: layout.width,
    height: layout.height,
    children: layout.children.map(serializeLayoutNode),
  };
}

async function renderLayoutToImage(
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

async function paintLayoutNode(ctx: SKRSContext2D, layout: LayoutNodeResult) {
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

function drawRoundedRect(
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

async function uploadWithFallback(
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

function respondUploadError(res: express.Response, error: unknown) {
  if (error instanceof UploadError) {
    res
      .status(500)
      .json({ error: error.message, details: error.details });
    return;
  }
  res.status(500).json({ error: "Failed to upload file." });
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

app.post("/scene", async (req, res): Promise<void> => {
  try {
    const scenePayload = req.body?.scene;
    if (!scenePayload || typeof scenePayload !== "object") {
      res.status(400).json({ error: "Missing 'scene' definition in body." });
      return;
    }

    const sceneConfig: SceneNodeInput = JSON.parse(
      JSON.stringify(scenePayload)
    );

    if (req.body.width !== undefined) {
      const parsedWidth = Number(req.body.width);
      if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
        res
          .status(400)
          .json({ error: "'width' override must be a positive number." });
        return;
      }
      sceneConfig.width = parsedWidth;
    }

    if (req.body.height !== undefined) {
      const parsedHeight = Number(req.body.height);
      if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
        res
          .status(400)
          .json({ error: "'height' override must be a positive number." });
        return;
      }
      sceneConfig.height = parsedHeight;
    }

    const useUploadThing = req.body.useUploadThing === true;
    const outputFormat =
      typeof req.body.outputFormat === "string" &&
      req.body.outputFormat.toLowerCase() === "pdf"
        ? "pdf"
        : "image";

    preprocessSceneText(sceneConfig);

    const layout = computeSceneLayout(sceneConfig);
    const backgroundColor =
      typeof req.body.backgroundColor === "string"
        ? req.body.backgroundColor
        : sceneConfig.backgroundColor ?? DEFAULT_BG_COLOR;

    const pngBuffer = await renderLayoutToImage(layout, backgroundColor);
    const filenameBase = uuidv4();

    if (outputFormat === "pdf") {
      const pdfBuffer = await createPdfFromImages(
        [pngBuffer],
        Math.ceil(layout.width),
        Math.ceil(layout.height)
      );
      try {
        const url = await uploadWithFallback(
          pdfBuffer,
          `${filenameBase}.pdf`,
          "application/pdf",
          { forceUploadThing: useUploadThing }
        );
        res.status(200).json({
          url,
          format: "pdf",
          dimensions: {
            width: Math.ceil(layout.width),
            height: Math.ceil(layout.height),
          },
          layout: serializeLayoutNode(layout),
        });
        return;
      } catch (error) {
        respondUploadError(res, error);
        return;
      }
    }

    try {
      const url = await uploadWithFallback(
        pngBuffer,
        `${filenameBase}.png`,
        "image/png",
        { forceUploadThing: useUploadThing }
      );
      res.status(200).json({
        url,
        format: "image",
        dimensions: {
          width: Math.ceil(layout.width),
          height: Math.ceil(layout.height),
        },
        layout: serializeLayoutNode(layout),
      });
    } catch (error) {
      respondUploadError(res, error);
    }
  } catch (error) {
    if (error instanceof SceneValidationError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error("Error rendering scene:", error);
    res.status(500).json({ error: "Failed to render scene." });
  }
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
    tempCtx.font = buildFontStack(fontCssWeight, fontSize, fontFamily);
    
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
            "application/pdf",
            { forceUploadThing: useUploadThing }
          );
          pdfUrls.push(url);
        } catch (error) {
          respondUploadError(res, error);
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
          "image/png",
          { forceUploadThing: useUploadThing }
        );
        imageUrls.push(url);
      } catch (error) {
        respondUploadError(res, error);
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
