import { PDFDocument } from "pdf-lib";

export async function mergePdfBuffers(buffers: Buffer[]) {
  if (buffers.length === 0) {
    throw new Error("Za združevanje ni podan noben PDF dokument.");
  }

  const merged = await PDFDocument.create();
  for (const buffer of buffers) {
    const source = await PDFDocument.load(buffer);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  return Buffer.from(await merged.save());
}
