import http from "http";
import https from "https";
import type { OfferVersion } from "../../../../shared/types/offers";
import { ProductModel } from "../../cenik/product.model";
import { ProjectModel } from "../schemas/project";
import { renderHtmlToPdf } from "./html-pdf.service";
import { renderProductDescriptionsHtml, type ProductDescriptionEntry } from "./document-renderers";
import { getCompanySettings, getPdfDocumentSettings } from "./pdf-settings.service";

function sanitizeDescriptionForHtml(value: string) {
  const withoutControls = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const withoutTags = withoutControls.replace(/<[^>]+>/g, "");
  const normalized = withoutTags.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
  let result = lines.join("\n").trim();
  const limit = 1800;
  if (result.length > limit) {
    result = `${result.slice(0, limit).trim()}…`;
  }
  return result;
}

async function fetchImageDataUrl(url: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith("https") ? https : http;
      client
        .get(url, (response) => {
          if (!response.statusCode || response.statusCode >= 400) {
            response.resume();
            resolve(undefined);
            return;
          }
          const data: Buffer[] = [];
          response.on("data", (chunk) => data.push(chunk as Buffer));
          response.on("end", () => {
            const buffer = Buffer.concat(data);
            const contentType = response.headers["content-type"] ?? "image/jpeg";
            resolve(`data:${contentType};base64,${buffer.toString("base64")}`);
          });
        })
        .on("error", () => resolve(undefined));
    } catch {
      resolve(undefined);
    }
  });
}

export async function buildOfferDescriptionEntries(offer: OfferVersion): Promise<ProductDescriptionEntry[]> {
  const items = Array.isArray(offer.items) ? offer.items : [];
  const uniqueIds = Array.from(
    new Set(
      items
        .map((item) => (item.productId ? String(item.productId) : null))
        .filter((value): value is string => !!value)
    )
  );

  let productMap = new Map<string, any>();
  if (uniqueIds.length > 0) {
    const products = await ProductModel.find({ _id: { $in: uniqueIds } }).lean();
    productMap = new Map(products.map((product) => [product._id.toString(), product]));
  }

  const entries: ProductDescriptionEntry[] = [];

  for (const item of items) {
    const productId = item.productId ? String(item.productId) : null;
    const product = productId ? productMap.get(productId) : null;
    const title = product?.ime || item.name;
    const description = sanitizeDescriptionForHtml(String(product?.dolgOpis ?? ""));
    const imageUrl = typeof product?.povezavaDoSlike === "string" ? product.povezavaDoSlike.trim() : "";
    if (!imageUrl && !description) {
      continue;
    }

    const imageDataUrl = imageUrl ? await fetchImageDataUrl(imageUrl) : undefined;
    if (!imageDataUrl && !description) {
      continue;
    }

    entries.push({
      title,
      description: description || undefined,
      imageUrl: imageDataUrl,
    });
  }

  return entries;
}

export async function generateOfferDescriptionsPdf(offer: OfferVersion) {
  const [entries, companySettings, documentSettings, project] = await Promise.all([
    buildOfferDescriptionEntries(offer),
    getCompanySettings(),
    getPdfDocumentSettings("PROJECT"),
    ProjectModel.findOne({ id: offer.projectId }).lean(),
  ]);
  const html = renderProductDescriptionsHtml(entries, {
    companyName: companySettings.companyName,
    projectTitle: project?.title ?? offer.title ?? offer.baseTitle ?? offer.documentNumber ?? offer.projectId,
    headerText: documentSettings.appearance?.headerText ?? "",
    footerText: documentSettings.appearance?.footerText ?? "",
  });
  return renderHtmlToPdf(html);
}
