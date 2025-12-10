import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_LETTER_SPACING,
  DEFAULT_TEXT_COLOR,
} from "../config/constants.js";
import { buildFontStack, resolveFontRequest } from "../config/fonts.js";
import { SceneValidationError } from "../errors.js";
import {
  type CounterAxisAlign,
  type DimensionSpec,
  type LayoutConstraints,
  type LayoutMode,
  type LayoutNodeResult,
  type NormalizedSceneNode,
  type Padding,
  type PrimaryAxisAlign,
  type SceneNodeInput,
  type SerializableLayoutNode,
} from "./types.js";
import {
  detectTextDirection,
  getTextWidthWithLetterSpacing,
  wrapTextLTR,
  wrapTextRTL,
} from "./text.js";

const DEFAULT_RECT_SIZE = 100;
const AUTO_DIMENSION: DimensionSpec = { mode: "AUTO" };
let autoNodeCounter = 0;

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
  const type = (input.type ?? "FRAME").toUpperCase() as NormalizedSceneNode["type"];
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

export function computeSceneLayout(
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

export function serializeLayoutNode(
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

