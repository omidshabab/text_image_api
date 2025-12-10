import { createCanvas } from "@napi-rs/canvas";
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  DEFAULT_BG_COLOR,
  DEFAULT_FONT_SIZE,
  DEFAULT_HEIGHT,
  DEFAULT_LETTER_SPACING,
  DEFAULT_PADDING,
  DEFAULT_TEXT_COLOR,
  DEFAULT_WIDTH,
} from "../config/constants.js";
import { buildFontStack, resolveFontRequest } from "../config/fonts.js";
import { createPdfFromImages } from "../services/pdf.js";
import {
  respondUploadError,
  uploadWithFallback,
} from "../services/upload.js";
import {
  calculateMaxLines,
  generateImage,
  paginateText,
} from "../scene/pagination.js";
import { reshapeTextContent } from "../scene/text.js";

export const imageRouter = Router();

imageRouter.post("/image", async (req, res): Promise<void> => {
  try {
    let text = String(req.body.text);
    if (typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Missing or invalid 'text' field." });
      return;
    }
    text = reshapeTextContent(text);

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

    if (width < 100 || width > 10000 || height < 100 || height > 10000) {
      res.status(400).json({ 
        error: "Width and height must be between 100 and 10000 pixels." 
      });
      return;
    }

    if (padding < 0 || padding >= Math.min(width, height) / 2) {
      res.status(400).json({ 
        error: "Padding must be non-negative and less than half of the smallest dimension." 
      });
      return;
    }

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
    
    const maxLinesPerPage = calculateMaxLines(height, padding, fontSize);
    if (maxLinesPerPage < 1) {
      res.status(400).json({ 
        error: "Image dimensions are too small to fit any text. Increase height or decrease padding/fontSize." 
      });
      return;
    }

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

