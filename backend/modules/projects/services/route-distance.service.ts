import { getSettings } from '../../settings/settings.service';
import { ProjectModel } from '../schemas/project';
import { resolveProjectClient } from './project.service';

export type RouteDistanceReliability = 'visoka' | 'nizka';

export interface RouteDistanceResult {
  razdaljaEnosmerno: number;
  razdaljaSkupaj: number;
  zanesljivost: RouteDistanceReliability;
  zanesljivostProcent: number;
  razlog?: string;
  naslovPodjetje: string;
  naslovProjekt: string;
}

interface GeocodeFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    label?: string;
    confidence?: number;
    housenumber?: string;
    street?: string;
    locality?: string;
    localadmin?: string;
    postalcode?: string;
  };
}

interface AddressParts {
  original: string;
  streetLine: string;
  streetName: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  cityCore: string;
}

const cache = new Map<string, RouteDistanceResult>();

function normalize(value?: string | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasPostalCode(value: string) {
  return /\b\d{4}\b/.test(value);
}

function hasCity(value: string) {
  const withoutPostal = value.replace(/\b\d{4}\b/g, ' ');
  return /[A-Za-zČŠŽčšž]{3,}/.test(withoutPostal);
}

function buildClientAddress(client: Awaited<ReturnType<typeof resolveProjectClient>>, fallback?: string | null) {
  const street = normalize(client?.street);
  const postal = [normalize(client?.postalCode), normalize(client?.postalCity)].filter(Boolean).join(' ');
  const parts = [street, postal].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(', ');
  }
  return normalize(client?.address) || normalize(fallback);
}

function buildCacheKey(projectId: string, companyAddress: string, projectAddress: string) {
  return [projectId, companyAddress, projectAddress]
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|');
}

function roundKm(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeSearchText(value?: string | null) {
  return normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAddressParts(address: string): AddressParts {
  const original = normalize(address);
  const postalMatch = original.match(/\b(\d{4})\b\s*([^,]*)/);
  const postalCode = postalMatch?.[1] ?? '';
  const city = normalize(postalMatch?.[2]?.replace(/\b(slovenija|slovenia)\b/gi, '')) ||
    normalize(original.split(',').slice(1).join(' ').replace(/\b\d{4}\b/g, ''));
  const cityCore = normalize(city.match(/\bljubljana\b/i)?.[0] ?? city.split(/\s+/)[0] ?? '');
  const beforePostal = postalMatch?.index != null ? original.slice(0, postalMatch.index) : original.split(',')[0] ?? original;
  const streetLine = normalize(beforePostal.replace(/,+$/g, ''));
  const houseNumber = streetLine.match(/\b\d+[a-z]?\b/i)?.[0] ?? '';
  const streetName = normalize(streetLine.replace(/\b\d+[a-z]?\b/gi, ''));

  return {
    original,
    streetLine,
    streetName,
    houseNumber,
    postalCode,
    city,
    cityCore,
  };
}

function withoutLeadingStreetType(streetName: string) {
  return normalize(streetName.replace(/^(cesta|ulica|pot|trg)\s+/i, ''));
}

function buildGeocodeQueries(address: string) {
  const parts = parseAddressParts(address);
  const queries = new Set<string>();
  const add = (value: string) => {
    const cleaned = normalize(value);
    if (cleaned) {
      queries.add(cleaned);
    }
  };

  add(parts.original);

  const city = parts.cityCore || parts.city;
  if (parts.streetLine && city) {
    add(`${parts.streetLine}, ${city}, Slovenija`);
  }
  if (parts.streetLine && parts.postalCode && city) {
    add(`${parts.streetLine}, ${parts.postalCode} ${city}, Slovenija`);
  }

  const withoutPrefix = withoutLeadingStreetType(parts.streetName);
  if (withoutPrefix && withoutPrefix !== parts.streetName && parts.houseNumber && city) {
    add(`${withoutPrefix} ${parts.houseNumber}, ${city}, Slovenija`);
  }

  return { parts, queries: Array.from(queries) };
}

function scoreGeocodeFeature(feature: GeocodeFeature, parts: AddressParts) {
  const properties = feature.properties ?? {};
  const label = normalizeSearchText(properties.label);
  const street = normalizeSearchText(properties.street);
  const locality = normalizeSearchText(properties.locality || properties.localadmin);
  const house = normalizeSearchText(properties.housenumber);
  const expectedStreet = normalizeSearchText(withoutLeadingStreetType(parts.streetName));
  const expectedCity = normalizeSearchText(parts.cityCore || parts.city);
  const expectedHouse = normalizeSearchText(parts.houseNumber);
  const confidence = typeof properties.confidence === 'number' ? properties.confidence : 0;

  let score = confidence;
  if (expectedHouse && (house === expectedHouse || label.includes(expectedHouse))) {
    score += 2;
  }
  if (expectedStreet) {
    const streetWords = expectedStreet.split(' ').filter((word) => word.length > 2 && !['cesta', 'ulica', 'pot', 'trg'].includes(word));
    const matchedWords = streetWords.filter((word) => street.includes(word) || label.includes(word));
    score += matchedWords.length;
    if (streetWords.length > 0 && matchedWords.length === streetWords.length) {
      score += 2;
    }
  }
  if (expectedCity && (locality.includes(expectedCity) || label.includes(expectedCity))) {
    score += 1;
  }
  if (parts.postalCode && normalizeSearchText(properties.postalcode) === parts.postalCode) {
    score += 0.5;
  }

  return score;
}

async function fetchGeocodeFeatures(query: string, apiKey: string) {
  const url = new URL('https://api.openrouteservice.org/geocode/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('text', query);
  url.searchParams.set('boundary.country', 'SI');
  url.searchParams.set('size', '5');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding ni uspel (${response.status}).`);
  }
  const payload = await response.json() as { features?: GeocodeFeature[] };
  return Array.isArray(payload.features) ? payload.features : [];
}

async function geocode(address: string, apiKey: string) {
  const { parts, queries } = buildGeocodeQueries(address);
  const candidates: Array<{ feature: GeocodeFeature; score: number }> = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const features = await fetchGeocodeFeatures(query, apiKey);
    for (const feature of features) {
      const coordinates = feature.geometry?.coordinates;
      const label = normalize(feature.properties?.label);
      if (!Array.isArray(coordinates) || coordinates.length < 2 || !label) {
        continue;
      }
      const key = `${label}|${coordinates.join(',')}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      candidates.push({ feature, score: scoreGeocodeFeature(feature, parts) });
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  const features = candidates.map((candidate) => candidate.feature);
  const best = features[0];
  const coordinates = best?.geometry?.coordinates;
  if (!best || !Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  return {
    coordinates,
    label: normalize(best.properties?.label) || address,
    confidence: typeof best.properties?.confidence === 'number' ? best.properties.confidence : null,
    ambiguous: candidates.slice(1).some((candidate) => {
      const bestScore = candidates[0]?.score ?? 0;
      return candidate.score >= bestScore - 0.25;
    }),
  };
}

async function routeDistanceMeters(from: [number, number], to: [number, number], apiKey: string) {
  const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ coordinates: [from, to] }),
  });
  if (!response.ok) {
    throw new Error(`Izračun poti ni uspel (${response.status}).`);
  }
  const payload = await response.json() as { routes?: Array<{ summary?: { distance?: number } }> };
  const distance = payload.routes?.[0]?.summary?.distance;
  if (typeof distance !== 'number' || !Number.isFinite(distance)) {
    throw new Error('Izračun poti ni vrnil razdalje.');
  }
  return distance;
}

export async function calculateProjectRouteDistance(projectId: string): Promise<RouteDistanceResult> {
  const apiKey = process.env.ORS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('ORS_API_KEY ni nastavljen.');
  }

  const settings = await getSettings();
  const companyAddress = normalize(settings.routeCalculationAddress) || [
    normalize(settings.address),
    [normalize(settings.postalCode), normalize(settings.city)].filter(Boolean).join(' '),
    normalize(settings.country),
  ].filter(Boolean).join(', ');

  if (!companyAddress) {
    throw new Error('Naslov podjetja za izračun poti ni nastavljen.');
  }

  const project = await ProjectModel.findOne({ id: projectId });
  if (!project) {
    throw new Error(`Projekt ${projectId} ni najden.`);
  }

  const client = await resolveProjectClient(project);
  const projectAddress = buildClientAddress(client, project.customer?.address);
  if (!projectAddress) {
    throw new Error('Naslova projekta ni bilo mogoče najti. Vnesi km ročno.');
  }

  const cacheKey = buildCacheKey(projectId, companyAddress, projectAddress);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const [companyGeo, projectGeo] = await Promise.all([
    geocode(companyAddress, apiKey),
    geocode(projectAddress, apiKey),
  ]);

  if (!companyGeo || !projectGeo) {
    throw new Error('Naslova ni bilo mogoče najti. Vnesi km ročno.');
  }

  const distanceMeters = await routeDistanceMeters(companyGeo.coordinates, projectGeo.coordinates, apiKey);
  const razdaljaEnosmerno = roundKm(distanceMeters / 1000);
  const razdaljaSkupaj = roundKm(razdaljaEnosmerno * 2);
  const reasons: string[] = [];
  let zanesljivostProcent = Math.round(
    Math.min(companyGeo.confidence ?? 0.6, projectGeo.confidence ?? 0.6) * 100
  );

  if (!hasPostalCode(companyAddress) || !hasCity(companyAddress)) {
    reasons.push('naslov podjetja je nepopoln');
  }
  if (!hasPostalCode(projectAddress) || !hasCity(projectAddress)) {
    reasons.push('naslov projekta je nepopoln');
  }
  if (companyGeo.ambiguous || projectGeo.ambiguous) {
    reasons.push('geocoder je vrnil več možnih zadetkov');
    zanesljivostProcent = Math.min(zanesljivostProcent, 75);
  }
  if ((companyGeo.confidence ?? 1) < 0.8 || (projectGeo.confidence ?? 1) < 0.8) {
    reasons.push('geocoder confidence je nizek');
  }
  if (reasons.length > 0) {
    zanesljivostProcent = Math.min(zanesljivostProcent, 70);
  }

  const result: RouteDistanceResult = {
    razdaljaEnosmerno,
    razdaljaSkupaj,
    zanesljivost: reasons.length > 0 ? 'nizka' : 'visoka',
    zanesljivostProcent,
    razlog: reasons.length > 0 ? reasons.join(', ') : undefined,
    naslovPodjetje: companyGeo.label,
    naslovProjekt: projectGeo.label,
  };

  cache.set(cacheKey, result);
  return result;
}
