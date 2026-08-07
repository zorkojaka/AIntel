import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import { buildOfferFileCore } from "../modules/communication/services/attachment-resolver.service";
import { mergePdfBuffers } from "../modules/communication/services/pdf-merge.service";

async function createPdf(widths: number[]) {
  const document = await PDFDocument.create();
  widths.forEach((width) => document.addPage([width, 200]));
  return Buffer.from(await document.save());
}

test("mergePdfBuffers preserves document and page order", async () => {
  const merged = await mergePdfBuffers([
    await createPdf([100, 110]),
    await createPdf([200]),
  ]);
  const document = await PDFDocument.load(merged);

  assert.equal(document.getPageCount(), 3);
  assert.deepEqual(document.getPages().map((page) => page.getWidth()), [100, 110, 200]);
});

test("offer attachment label combines project and version numbers before the offer title", () => {
  const core = buildOfferFileCore(
    { versionNumber: 3, baseTitle: "Ajax videonadzor", projectId: "PRJ-237" },
    { projectNumber: 237, customer: { name: "Testna stranka" } },
    "offer-id",
  );

  assert.equal(core.projectIdentifier, "237_3");
  assert.equal(core.suffix, "Ajax videonadzor");
});
