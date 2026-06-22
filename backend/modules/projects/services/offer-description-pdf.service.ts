import fs from "node:fs/promises";
import http from "http";
import https from "https";
import path from "node:path";
import type { OfferVersion } from "../../../../shared/types/offers";
import { ProductModel } from "../../cenik/product.model";
import { PhotoModel } from "../../photos/schemas/photo";
import { ZahtevaModel } from "../../zahteve/zahteva.model";
import { ProjectModel } from "../schemas/project";
import { renderHtmlToPdf } from "./html-pdf.service";
import { renderProductDescriptionsHtml, type ProductDescriptionEntry } from "./document-renderers";
import { getCompanySettings, getPdfDocumentSettings } from "./pdf-settings.service";

const PHOTO_UPLOAD_BASE_DIR = "/var/www/aintel/uploads";

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

function absolutePhotoPath(uploadUrl?: string | null) {
  if (!uploadUrl || !uploadUrl.startsWith("/uploads/")) return null;
  const resolvedBase = path.resolve(PHOTO_UPLOAD_BASE_DIR);
  const filePath = path.resolve(resolvedBase, uploadUrl.replace(/^\/uploads\//, ""));
  const relative = path.relative(resolvedBase, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}

async function readPhotoDataUrl(photo: { url?: string | null; thumbnailUrl?: string | null; mimeType?: string | null }) {
  const filePath = absolutePhotoPath(photo.thumbnailUrl ?? photo.url);
  if (!filePath) return undefined;
  try {
    const buffer = await fs.readFile(filePath);
    return `data:${photo.mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function supportsLocationDescriptions(product: any) {
  const productType = product?.classification?.productType;
  return productType === "kamera" || productType === "alarm_komponenta";
}

function buildZahtevaLocationPhotoItemId(zahtevaId: string, sistemId: string, lokacijaId: string) {
  return `zahteva-location:${zahtevaId}:${sistemId}:${lokacijaId}`;
}

function buildAlarmLocationPhotoItemId(zahtevaId: string, sistemId: string, lokacijaId: string) {
  return `zahteva-alarm-location:${zahtevaId}:${sistemId}:${lokacijaId}`;
}

function isDefaultLocationName(value: string) {
  const normalized = value.trim();
  return /^Lokacija\s+\d+$/i.test(normalized) || /^loc-\d+$/i.test(normalized);
}

function buildRequirementLocationUnitsFromRequest(zahteva: any) {
  const unitsByProductId = new Map<string, Array<{ locationId: string; locationName: string; sourcePhotoItemId: string }>>();
  const zahtevaId = String(zahteva?._id ?? "");
  if (!zahtevaId) return unitsByProductId;

  const appendUnit = (
    productId: unknown,
    unit: { locationId: string; locationName: string; sourcePhotoItemId: string },
  ) => {
    const key = productId ? String(productId) : "";
    if (!key || !unit.locationId) return;
    const existing = unitsByProductId.get(key) ?? [];
    existing.push(unit);
    unitsByProductId.set(key, existing);
  };

  for (const sistem of zahteva?.sistemi ?? []) {
    if (sistem?.tip === "videonadzor" && sistem?.videonadzor) {
      const variantById = new Map<string, any>((sistem.videonadzor.asortima ?? []).map((variant: any) => [String(variant.id), variant]));

      for (const lokacija of sistem.videonadzor.lokacije ?? []) {
        const assignedVariant = lokacija?.asortimaIdAssigned ? variantById.get(String(lokacija.asortimaIdAssigned)) : null;
        const locationId = typeof lokacija?.id === "string" ? lokacija.id : "";
        appendUnit(assignedVariant?.kameraProductId, {
          locationId,
          locationName: typeof lokacija?.ime === "string" && lokacija.ime.trim() ? lokacija.ime.trim() : locationId,
          sourcePhotoItemId: buildZahtevaLocationPhotoItemId(zahtevaId, String(sistem.id), locationId),
        });
      }
    }

    if (sistem?.tip === "alarm" && sistem?.alarm) {
      const sensorById = new Map<string, any>((sistem.alarm.senzorji ?? []).map((sensor: any) => [String(sensor.id), sensor]));

      for (const lokacija of sistem.alarm.lokacije ?? []) {
        const assignedSensor = lokacija?.senzorIdAssigned ? sensorById.get(String(lokacija.senzorIdAssigned)) : null;
        const locationId = typeof lokacija?.id === "string" ? lokacija.id : "";
        appendUnit(assignedSensor?.senzorProductId, {
          locationId,
          locationName: typeof lokacija?.ime === "string" && lokacija.ime.trim() ? lokacija.ime.trim() : locationId,
          sourcePhotoItemId: buildAlarmLocationPhotoItemId(zahtevaId, String(sistem.id), locationId),
        });
      }
    }
  }

  return unitsByProductId;
}

async function resolveRequirementLocationPhotos(
  projectObjectId: unknown,
  item: any,
  fallbackUnits: Array<{ locationId: string; locationName: string; sourcePhotoItemId: string }> = [],
) {
  const units = Array.isArray(item?.requirementsLocationUnits) ? item.requirementsLocationUnits : [];
  const resolvedUnits = units.length > 0 ? units : fallbackUnits;
  if (!projectObjectId || resolvedUnits.length === 0) return [];

  const locations: NonNullable<ProductDescriptionEntry["locations"]> = [];
  for (const unit of resolvedUnits) {
    const sourcePhotoItemId = typeof unit?.sourcePhotoItemId === "string" ? unit.sourcePhotoItemId.trim() : "";
    const locationName = typeof unit?.locationName === "string" && unit.locationName.trim()
      ? unit.locationName.trim()
      : typeof unit?.locationId === "string"
        ? unit.locationId
        : "Lokacija";

    const photos = sourcePhotoItemId
      ? await PhotoModel.find({
          projectId: projectObjectId,
          phase: "requirements",
          itemId: sourcePhotoItemId,
          deletedAt: { $exists: false },
        })
          .sort({ uploadedAt: 1 })
          .lean()
      : [];

    const photoDataUrls = (
      await Promise.all(photos.map((photo) => readPhotoDataUrl({
        url: photo.url,
        thumbnailUrl: photo.thumbnailUrl,
        mimeType: photo.mimeType,
      })))
    ).filter((value): value is string => Boolean(value));

    if (photos.length === 0 && isDefaultLocationName(locationName)) {
      continue;
    }

    locations.push({ name: locationName, photos: photoDataUrls });
  }

  return locations;
}

async function resolveProjectExecutionDefinitionLocations(
  projectObjectId: unknown,
  item: any,
  definition: any,
) {
  if (!projectObjectId || !definition?.executionSpec || typeof definition.executionSpec !== "object") return [];
  const units = Array.isArray(definition.executionSpec.executionUnits) ? definition.executionSpec.executionUnits : [];
  if (units.length === 0) return [];

  const itemId = String(definition.offerItemId ?? definition.id ?? item.id ?? "");
  if (!itemId) return [];

  const locations: NonNullable<ProductDescriptionEntry["locations"]> = [];
  for (const [unitIndex, unit] of units.entries()) {
    const locationName =
      typeof unit?.location === "string" && unit.location.trim()
        ? unit.location.trim()
        : typeof unit?.label === "string" && unit.label.trim()
          ? unit.label.trim()
          : `Lokacija ${unitIndex + 1}`;
    const note = typeof unit?.instructions === "string" && unit.instructions.trim()
      ? unit.instructions.trim()
      : "";

    const photos = await PhotoModel.find({
      projectId: projectObjectId,
      phase: "preparation",
      itemId,
      unitIndex,
      deletedAt: { $exists: false },
    })
      .sort({ uploadedAt: 1 })
      .lean();

    const photoDataUrls = (
      await Promise.all(photos.map((photo) => readPhotoDataUrl({
        url: photo.url,
        thumbnailUrl: photo.thumbnailUrl,
        mimeType: photo.mimeType,
      })))
    ).filter((value): value is string => Boolean(value));

    if (photoDataUrls.length === 0 && isDefaultLocationName(locationName)) {
      continue;
    }

    locations.push({ name: locationName, note: note || undefined, photos: photoDataUrls });
  }

  return locations;
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
  const [project, zahteva] = await Promise.all([
    ProjectModel.findOne({ id: offer.projectId }).select({ _id: 1, executionDefinitions: 1 }).lean(),
    offer.requestId ? ZahtevaModel.findById(offer.requestId).lean() : Promise.resolve(null),
  ]);
  const fallbackUnitsByProductId = buildRequirementLocationUnitsFromRequest(zahteva);
  const executionDefinitionByItemKey = new Map<string, any>();
  for (const definition of (project as any)?.executionDefinitions ?? []) {
    if (String(definition?.offerVersionId ?? "") !== String(offer._id ?? "")) continue;
    const itemKey = String(definition?.offerItemId ?? definition?.id ?? "");
    if (itemKey) executionDefinitionByItemKey.set(itemKey, definition);
  }

  const entries: ProductDescriptionEntry[] = [];

  for (const item of items) {
    const productId = item.productId ? String(item.productId) : null;
    const product = productId ? productMap.get(productId) : null;
    const title = product?.ime || item.name;
    const description = sanitizeDescriptionForHtml(String(product?.dolgOpis ?? ""));
    const imageUrl = typeof product?.povezavaDoSlike === "string" ? product.povezavaDoSlike.trim() : "";
    const fallbackUnits = productId ? fallbackUnitsByProductId.get(productId) ?? [] : [];
    const definition = executionDefinitionByItemKey.get(String(item.id));
    const definitionLocations = await resolveProjectExecutionDefinitionLocations(project?._id, item, definition);
    const shouldResolveRequirementLocations =
      supportsLocationDescriptions(product) || definitionLocations.length > 0 || fallbackUnits.length > 0;
    const locations = definitionLocations.length > 0
      ? definitionLocations
      : shouldResolveRequirementLocations
        ? await resolveRequirementLocationPhotos(project?._id, item, fallbackUnits)
        : [];
    if (!imageUrl && !description && locations.length === 0) {
      continue;
    }

    const imageDataUrl = imageUrl ? await fetchImageDataUrl(imageUrl) : undefined;
    if (!imageDataUrl && !description && locations.length === 0) {
      continue;
    }

    entries.push({
      title,
      description: description || undefined,
      imageUrl: imageDataUrl,
      locations: locations.length > 0 ? locations : undefined,
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
    projectTitle: offer.baseTitle ?? offer.title ?? offer.documentNumber ?? project?.title ?? offer.projectId,
    headerText: documentSettings.appearance?.headerText ?? "",
    footerText: documentSettings.appearance?.footerText ?? "",
  });
  return renderHtmlToPdf(html);
}
