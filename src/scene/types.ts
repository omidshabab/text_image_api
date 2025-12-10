export type SceneNodeType = "FRAME" | "GROUP" | "RECT" | "TEXT" | "IMAGE";
export type LayoutMode = "NONE" | "HORIZONTAL" | "VERTICAL";
export type PrimaryAxisAlign = "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
export type CounterAxisAlign = "MIN" | "CENTER" | "MAX" | "STRETCH";

export type DimensionSpec =
  | { mode: "AUTO" }
  | { mode: "FIXED"; value: number }
  | { mode: "PERCENT"; value: number }
  | { mode: "FILL" };

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SceneNodeInput {
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

export interface NormalizedSceneNode extends SceneNodeInput {
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

export interface LayoutNodeResult {
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

export interface SerializableLayoutNode {
  id: string;
  type: SceneNodeType;
  layoutMode: LayoutMode;
  x: number;
  y: number;
  width: number;
  height: number;
  children: SerializableLayoutNode[];
}

export interface TextLayoutMetadata {
  lines: string[];
  font: string;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  direction: "LTR" | "RTL";
  textAlign: CanvasTextAlign;
}

export interface LayoutConstraints {
  availableWidth?: number;
  availableHeight?: number;
  allowFill?: boolean;
}

