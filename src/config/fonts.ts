import { GlobalFonts } from "@napi-rs/canvas";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { FONT_FALLBACK_STACK } from "./constants.js";

const ROOT_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

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

export type FontWeightKey = keyof typeof FONT_WEIGHT_FILES;

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

export type FontName = "Estedad";

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

export const DEFAULT_FONT_NAME: FontName = "Estedad";

const registeredFontFamilies = new Set<string>();

function resolveAliasPath(alias: string): string {
  const mapped =
    FONT_PATH_ALIASES[alias as keyof typeof FONT_PATH_ALIASES] ?? alias;
  return join(ROOT_DIR, mapped);
}

export function normalizeFontWeight(input: unknown): FontWeightKey | null {
  if (typeof input === "string" || typeof input === "number") {
    const value = String(input).toLowerCase().replace(/[^a-z0-9]/g, "");
    const mapped = FONT_WEIGHT_ALIASES[value];
    if (mapped) return mapped;
  }
  return null;
}

export function isFontName(value: string): value is FontName {
  return Object.prototype.hasOwnProperty.call(FONT_LIBRARY, value as FontName);
}

export function registerFont(fontName: FontName, weight: FontWeightKey): string {
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

type FontResolutionSuccess = {
  ok: true;
  fontName: FontName;
  fontWeight: FontWeightKey;
  fontFamily: string;
  fontCssWeight: string;
};

type FontResolutionFailure = {
  ok: false;
  error: string;
};

export type FontResolutionResult = FontResolutionSuccess | FontResolutionFailure;

export function resolveFontRequest(
  fontNameInput: unknown,
  fontWeightInput: unknown
): FontResolutionResult {
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
        error: `Unsupported 'fontName'. Available options: ${Object.keys(
          FONT_LIBRARY
        ).join(", ")}.`,
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

export function buildFontStack(
  fontCssWeight: string,
  fontSize: number,
  fontFamily: string
) {
  return `${fontCssWeight} ${fontSize}px ${fontFamily}, ${FONT_FALLBACK_STACK}`;
}

