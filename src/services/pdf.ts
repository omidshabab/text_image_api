import { PDFDocument } from "pdf-lib";

export async function createPdfFromImages(
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

