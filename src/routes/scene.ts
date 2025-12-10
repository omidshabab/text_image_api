import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { DEFAULT_BG_COLOR } from "../config/constants.js";
import { SceneValidationError } from "../errors.js";
import { computeSceneLayout, serializeLayoutNode } from "../scene/layout.js";
import { preprocessSceneText } from "../scene/text.js";
import { renderLayoutToImage } from "../scene/render.js";
import { createPdfFromImages } from "../services/pdf.js";
import {
  respondUploadError,
  uploadWithFallback,
} from "../services/upload.js";
import { type SceneNodeInput } from "../scene/types.js";

export const sceneRouter = Router();

sceneRouter.post("/scene", async (req, res): Promise<void> => {
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

