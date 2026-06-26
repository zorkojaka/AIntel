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
const PROJECT_PLAN_PHOTO_ITEM_ID = "project-plan";

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

function isCameraInstallationServiceName(value: unknown) {
  const normalized = typeof value === "string" ? value.toLocaleLowerCase("sl-SI") : "";
  return normalized.includes("monta") && normalized.includes("konfiguracija") && normalized.includes("kamere");
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
  const unitsByProductId = new Map<string, Array<{ locationId: string; locationName: string; sourcePhotoItemId: string; note?: string }>>();
  const zahtevaId = String(zahteva?._id ?? "");
  if (!zahtevaId) return unitsByProductId;

  const appendUnit = (
    productId: unknown,
    unit: { locationId: string; locationName: string; sourcePhotoItemId: string; note?: string },
  ) => {
    const key = productId ? String(productId) : "";
    if (!key || !unit.locationId) return;
    const existing = unitsByProductId.get(key) ?? [];
    existing.push(unit);
    unitsByProductId.set(key, existing);
  };

  for (const sistem of zahteva?.sistemi ?? []) {
    if ((sistem?.tip === "videonadzor" || sistem?.tip === "wifi_kamere") && sistem?.videonadzor) {
      const variantById = new Map<string, any>((sistem.videonadzor.asortima ?? []).map((variant: any) => [String(variant.id), variant]));

      for (const lokacija of sistem.videonadzor.lokacije ?? []) {
        const assignedVariant = lokacija?.asortimaIdAssigned ? variantById.get(String(lokacija.asortimaIdAssigned)) : null;
        const locationId = typeof lokacija?.id === "string" ? lokacija.id : "";
        appendUnit(assignedVariant?.kameraProductId, {
          locationId,
          locationName: typeof lokacija?.ime === "string" && lokacija.ime.trim() ? lokacija.ime.trim() : locationId,
          sourcePhotoItemId: buildZahtevaLocationPhotoItemId(zahtevaId, String(sistem.id), locationId),
          note: typeof lokacija?.opomba === "string" && lokacija.opomba.trim() ? lokacija.opomba.trim() : undefined,
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
          note: typeof lokacija?.opomba === "string" && lokacija.opomba.trim() ? lokacija.opomba.trim() : undefined,
        });
      }
    }
  }

  return unitsByProductId;
}

async function resolveRequirementLocationPhotos(
  projectObjectId: unknown,
  item: any,
  fallbackUnits: Array<{ locationId: string; locationName: string; sourcePhotoItemId: string; note?: string }> = [],
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

    const note = typeof unit?.note === "string" && unit.note.trim() ? unit.note.trim() : undefined;
    locations.push({ name: locationName, note, photos: photoDataUrls });
  }

  return locations;
}

async function resolveProjectExecutionDefinitionLocations(
  projectObjectId: unknown,
  item: any,
  definition: any,
  projectLocations: any[] = [],
) {
  if (!projectObjectId || !definition?.executionSpec || typeof definition.executionSpec !== "object") return [];
  const units = Array.isArray(definition.executionSpec.executionUnits) ? definition.executionSpec.executionUnits : [];
  if (units.length === 0) return [];

  const itemId = String(definition.offerItemId ?? definition.id ?? item.id ?? "");
  if (!itemId) return [];

  const locations: NonNullable<ProductDescriptionEntry["locations"]> = [];
  const projectLocationByKey = new Map<string, any>();
  for (const location of projectLocations) {
    const keys = [
      typeof location?.id === "string" ? location.id.trim() : "",
      typeof location?.sourcePhotoItemId === "string" ? location.sourcePhotoItemId.trim() : "",
    ].filter(Boolean);
    for (const key of keys) {
      if (!projectLocationByKey.has(key)) projectLocationByKey.set(key, location);
    }
  }
  for (const [unitIndex, unit] of units.entries()) {
    const locationKey =
      typeof unit?.projectLocationId === "string" && unit.projectLocationId.trim()
        ? unit.projectLocationId.trim()
        : typeof unit?.sourcePhotoItemId === "string" && unit.sourcePhotoItemId.trim()
          ? unit.sourcePhotoItemId.trim()
          : "";
    const projectLocation = locationKey ? projectLocationByKey.get(locationKey) : null;
    const locationName =
      typeof projectLocation?.name === "string" && projectLocation.name.trim()
        ? projectLocation.name.trim()
        : typeof unit?.location === "string" && unit.location.trim()
          ? unit.location.trim()
        : typeof unit?.label === "string" && unit.label.trim()
          ? unit.label.trim()
          : `Lokacija ${unitIndex + 1}`;
    const note = typeof projectLocation?.note === "string" && projectLocation.note.trim()
      ? projectLocation.note.trim()
      : typeof unit?.instructions === "string" && unit.instructions.trim()
        ? unit.instructions.trim()
        : typeof unit?.note === "string" && unit.note.trim()
          ? unit.note.trim()
          : "";
    const sourcePhotoItemId = typeof unit?.sourcePhotoItemId === "string" && unit.sourcePhotoItemId.trim()
      ? unit.sourcePhotoItemId.trim()
      : "";

    const photoFilters = sourcePhotoItemId
      ? [
          { projectId: projectObjectId, phase: "requirements", itemId: sourcePhotoItemId, deletedAt: { $exists: false } },
          { projectId: projectObjectId, phase: "preparation", itemId: sourcePhotoItemId, deletedAt: { $exists: false } },
        ]
      : [
          { projectId: projectObjectId, phase: "preparation", itemId, unitIndex, deletedAt: { $exists: false } },
        ];
    const photoGroups = await Promise.all(
      photoFilters.map((filter) => PhotoModel.find(filter).sort({ uploadedAt: 1 }).lean()),
    );
    const photosByUrl = new Map<string, (typeof photoGroups)[number][number]>();
    for (const photo of photoGroups.flat()) {
      const key = typeof photo.url === "string" && photo.url ? photo.url : String(photo._id);
      if (!photosByUrl.has(key)) photosByUrl.set(key, photo);
    }
    const photos = Array.from(photosByUrl.values());

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

async function resolveProjectPlanPhotos(projectObjectId: unknown) {
  if (!projectObjectId) return [];

  const photos = await PhotoModel.find({
    projectId: projectObjectId,
    phase: "preparation",
    itemId: PROJECT_PLAN_PHOTO_ITEM_ID,
    deletedAt: { $exists: false },
  }).sort({ uploadedAt: 1 }).lean();

  return (
    await Promise.all(photos.map((photo) => readPhotoDataUrl({
      url: photo.url,
      thumbnailUrl: null,
      mimeType: photo.mimeType,
    })))
  ).filter((value): value is string => Boolean(value));
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
    ProjectModel.findOne({ id: offer.projectId }).select({ _id: 1, executionDefinitions: 1, executionLocations: 1 }).lean(),
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
    const description = sanitizeDescriptionForHtml(String(product?.dolgOpis ?? ""));
    const imageUrl = typeof product?.povezavaDoSlike === "string" ? product.povezavaDoSlike.trim() : "";
    const fallbackUnits = productId ? fallbackUnitsByProductId.get(productId) ?? [] : [];
    const definition = executionDefinitionByItemKey.get(String(item.id));
    const definitionLocations = await resolveProjectExecutionDefinitionLocations(
      project?._id,
      item,
      definition,
      Array.isArray((project as any)?.executionLocations) ? (project as any).executionLocations : [],
    );
    const title = isCameraInstallationServiceName(item.name) && definitionLocations.length > 0
      ? "Predlog izvedbe"
      : product?.ime || item.name;
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

  const projectPlanPhotos = await resolveProjectPlanPhotos(project?._id);
  if (projectPlanPhotos.length > 0) {
    entries.push({
      title: "Načrt projekta",
      projectPlanPhotos,
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
