import type { AAAttribute, AAProductRaw, Classification } from './types';

export function getAttribute(attrs: AAAttribute[] | undefined, key: string): string | undefined {
  const normalizedKey = key.trim().toLowerCase();
  const found = (attrs ?? []).find((item) => item.attribute.trim().toLowerCase() === normalizedKey);
  return found?.term?.trim() || undefined;
}

export function classifyProduct(product: AAProductRaw): Classification {
  const manufacturer = getAttribute(product.attributes, 'Manufacturer');
  const productType = detectProductType(product);
  const classification: Classification = {
    productType,
    manufacturer,
    confidence: 'high',
    needsReview: false,
  };

  if (productType === 'kamera') {
    classification.cameraHousing = normalizeHousing(getAttribute(product.attributes, 'Housing'));
    classification.cameraTechnology = normalizeTechnology(getAttribute(product.attributes, 'Technology'));
    classification.maxResolutionMP = parseResolution(
      getAttribute(product.attributes, 'Max resolution') ?? getAttribute(product.attributes, 'Resolution'),
    );
    classification.hasPoE = parseHasPoE(getAttribute(product.attributes, 'Power supply'));
    classification.lensType = parseLensType(getAttribute(product.attributes, 'Lens'));
    classification.lensFocalLength = parseFocalLength(getAttribute(product.attributes, 'Lens'));
    classification.irRangeM = parseIRRange(getAttribute(product.attributes, 'IR') ?? product.description);
    classification.compatibleBracketCodes = parseCompatibleBrackets(product.description);
  } else if (productType === 'snemalnik') {
    classification.nvrChannels = parseNvrChannels(product);
    classification.nvrHasPoE = parseNvrHasPoE(product);
    classification.nvrHddSlots = parseNvrHddSlots(product);
    classification.nvrMaxResolutionMP = parseResolution(getAttribute(product.attributes, 'Max resolution'));
  } else if (productType === 'switch') {
    classification.poePortCount = parsePoePorts(product);
    classification.switchSpeed = parseSwitchSpeed(product);
  } else if (productType === 'disk') {
    classification.diskCapacityTB = parseDiskCapacity(product);
    classification.isSurveillanceDisk = isSurveillanceDisk(product);
  } else if (productType === 'nosilec') {
    classification.bracketCodeOwn = parseBracketCode(product.name);
  }

  classification.confidence = determineConfidence(classification);
  classification.needsReview =
    classification.confidence === 'low' ||
    classification.productType === 'drugo' ||
    (classification.productType === 'kamera' && (!classification.cameraHousing || !classification.maxResolutionMP)) ||
    (classification.productType === 'snemalnik' && !classification.nvrChannels);

  return classification;
}

function fullText(product: AAProductRaw) {
  return `${product.category ?? ''} ${product.name ?? ''} ${product.description ?? ''}`.toLowerCase();
}

function detectProductType(product: AAProductRaw): Classification['productType'] {
  const text = fullText(product);
  const name = product.name.toLowerCase();
  const category = (product.category ?? '').toLowerCase();

  if (category.includes('kamere') || category.includes('camera')) return 'kamera';
  if (category.includes('snemalnik') || category.includes('recorder') || /^(drn|dvr|nvr)-/i.test(product.name)) return 'snemalnik';
  if (category.includes('switch') || (name.includes('poe') && name.includes('switch'))) return 'switch';
  if (category.includes('disk') || category.includes('hdd') || /\d+\s*tb/i.test(text)) return 'disk';
  if (category.includes('nosilec') || category.includes('mount') || /\b(DAJ|DAM|DBR|DAP)-\d+\b/i.test(product.name)) return 'nosilec';
  if (category.includes('kabel') || category.includes('cable')) return 'kabel';
  if (category.includes('programska oprema') || category.includes('software')) return 'pribor';
  if (category.includes('alarm') || text.includes('ajax')) return 'alarm_komponenta';
  return 'drugo';
}

function parseResolution(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const mpMatch = value.match(/(\d+(?:[.,]\d+)?)\s*M(?:px|P)?/i);
  if (mpMatch) return Number(mpMatch[1].replace(',', '.'));
  if (/1080p/i.test(value)) return 2;
  if (/720p/i.test(value)) return 1;
  if (/4K|2160p/i.test(value)) return 8;
  return undefined;
}

function parseHasPoE(value: string | undefined) {
  return Boolean(value && /poe/i.test(value));
}

function normalizeHousing(value: string | undefined): Classification['cameraHousing'] {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('bullet')) return 'Bullet';
  if (normalized.includes('turret')) return 'Turret';
  if (normalized.includes('dome')) return 'Dome';
  if (normalized.includes('ptz')) return 'PTZ';
  if (normalized.includes('panoramic')) return 'Panoramic';
  if (normalized.includes('fisheye')) return 'Fisheye';
  if (normalized.includes('thermal')) return 'Thermal';
  return undefined;
}

function normalizeTechnology(value: string | undefined): Classification['cameraTechnology'] {
  if (!value) return undefined;
  if (/ip\s*video/i.test(value)) return 'IP video';
  if (/ahd/i.test(value)) return 'AHD';
  if (/analog/i.test(value)) return 'Analog';
  return undefined;
}

function parseLensType(value: string | undefined): Classification['lensType'] {
  if (!value) return undefined;
  if (/zoom|motor/i.test(value)) return 'motor';
  if (/[\d.]+\s*-\s*[\d.]+\s*mm/i.test(value)) return 'varifocal';
  if (/[\d.]+\s*mm/i.test(value)) return 'fixed';
  return undefined;
}

function parseFocalLength(value: string | undefined) {
  if (!value) return undefined;
  const match = value.match(/([\d.]+(?:\s*-\s*[\d.]+)?)\s*mm/i);
  return match ? `${match[1].replace(/\s+/g, '')}mm` : undefined;
}

function parseIRRange(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const range = value.match(/(\d+)\s*-\s*(\d+)\s*m/i);
  if (range) return Number(range[2]);
  const upTo = value.match(/up\s*to\s*(\d+)\s*m/i);
  if (upTo) return Number(upTo[1]);
  const simple = value.match(/(\d+)\s*m/i);
  return simple ? Number(simple[1]) : undefined;
}

function parseCompatibleBrackets(description: string) {
  const matches = description.match(/\b(DAJ|DAM|DBR|DAP)-\d+\b/gi);
  return matches ? Array.from(new Set(matches.map((value) => value.toUpperCase()))) : [];
}

function parseNvrChannels(product: AAProductRaw): number | undefined {
  const cameras = getAttribute(product.attributes, 'Number of cameras');
  if (cameras) {
    const parsed = Number.parseInt(cameras, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  const drnMatch = product.name.match(/DRN-(\d{2})/i);
  if (drnMatch) return Number.parseInt(drnMatch[1], 10);
  const codeMatch = product.name.match(/^(\d{2})\d+/);
  if (codeMatch) return Number.parseInt(codeMatch[1], 10);
  const text = product.description;
  const channelMatch = text.match(/(\d+)[\s-]*(?:kanal|channel|ch)\b/i);
  return channelMatch ? Number.parseInt(channelMatch[1], 10) : undefined;
}

function parseNvrHasPoE(product: AAProductRaw) {
  const codeCandidates = [product.name, product.id].map((value) => value.trim()).filter(Boolean);
  for (const value of codeCandidates) {
    const drnCode = value.match(/\bDRN-\d+R?P?\b/i)?.[0];
    if (drnCode) return /P$/i.test(drnCode);
  }
  if (codeCandidates.some((value) => /P$/i.test(value))) return true;
  return /poe/i.test(product.description) || Boolean(getAttribute(product.attributes, 'PoE switch'));
}

function parseNvrHddSlots(product: AAProductRaw): number | undefined {
  const hdd = getAttribute(product.attributes, 'HDD');
  if (!hdd) return 1;
  const match = hdd.match(/(\d+)\s*[xXx]\s*SATA/i);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function parsePoePorts(product: AAProductRaw): number | undefined {
  const attr = getAttribute(product.attributes, 'PoE ports') ?? getAttribute(product.attributes, 'PoE Out port') ?? getAttribute(product.attributes, 'PoE switch');
  const match = (attr ?? product.description).match(/(\d+)\s*(?:x\s*)?PoE\b/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function parseSwitchSpeed(product: AAProductRaw): Classification['switchSpeed'] {
  const text = `${product.name} ${product.description}`;
  if (/1000\s*mbps|gigabit|1\s*gbe/i.test(text)) return 'gigabit';
  if (/100\s*mbps|fast\s*ethernet/i.test(text)) return 'megabit';
  return undefined;
}

function parseDiskCapacity(product: AAProductRaw): number | undefined {
  const match = `${product.name} ${product.description}`.match(/(\d+)\s*TB/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function isSurveillanceDisk(product: AAProductRaw) {
  return /surveillance|skyhawk|purple|videonadzor/i.test(`${product.name} ${product.description}`);
}

function parseBracketCode(name: string) {
  const match = name.match(/\b(DAJ|DAM|DBR|DAP)-\d+\b/i);
  return match ? match[0].toUpperCase() : undefined;
}

function determineConfidence(classification: Classification): Classification['confidence'] {
  if (!classification.productType || classification.productType === 'drugo') return 'low';
  if (classification.productType === 'kamera') {
    if (classification.cameraHousing && classification.maxResolutionMP) return 'high';
    if (classification.cameraHousing || classification.maxResolutionMP) return 'medium';
    return 'low';
  }
  if (classification.productType === 'snemalnik') return classification.nvrChannels ? 'high' : 'low';
  if (classification.productType === 'switch') return classification.poePortCount ? 'high' : 'medium';
  return 'medium';
}
