import { getSettings } from '../../settings/settings.service';
import { ProjectModel } from '../schemas/project';
import { resolveProjectClient } from './project.service';

export type RouteDistanceReliability = 'visoka' | 'nizka';

export interface RouteDistanceResult {
  razdaljaEnosmerno: number;
  razdaljaSkupaj: number;
  zanesljivost: RouteDistanceReliability;
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
  };
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

async function geocode(address: string, apiKey: string) {
  const url = new URL('https://api.openrouteservice.org/geocode/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('text', address);
  url.searchParams.set('boundary.country', 'SI');
  url.searchParams.set('size', '3');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding ni uspel (${response.status}).`);
  }
  const payload = await response.json() as { features?: GeocodeFeature[] };
  const features = Array.isArray(payload.features) ? payload.features : [];
  const best = features[0];
  const coordinates = best?.geometry?.coordinates;
  if (!best || !Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  return {
    coordinates,
    label: normalize(best.properties?.label) || address,
    confidence: typeof best.properties?.confidence === 'number' ? best.properties.confidence : null,
    ambiguous: features.slice(1).some((feature) => {
      const confidence = typeof feature.properties?.confidence === 'number' ? feature.properties.confidence : 0;
      const bestConfidence = typeof best.properties?.confidence === 'number' ? best.properties.confidence : 1;
      return confidence >= 0.8 || confidence >= bestConfidence - 0.05;
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

  if (!hasPostalCode(companyAddress) || !hasCity(companyAddress)) {
    reasons.push('naslov podjetja je nepopoln');
  }
  if (!hasPostalCode(projectAddress) || !hasCity(projectAddress)) {
    reasons.push('naslov projekta je nepopoln');
  }
  if (companyGeo.ambiguous || projectGeo.ambiguous) {
    reasons.push('geocoder je vrnil več možnih zadetkov');
  }
  if ((companyGeo.confidence ?? 1) < 0.8 || (projectGeo.confidence ?? 1) < 0.8) {
    reasons.push('geocoder confidence je nizek');
  }

  const result: RouteDistanceResult = {
    razdaljaEnosmerno,
    razdaljaSkupaj,
    zanesljivost: reasons.length > 0 ? 'nizka' : 'visoka',
    razlog: reasons.length > 0 ? reasons.join(', ') : undefined,
    naslovPodjetje: companyGeo.label,
    naslovProjekt: projectGeo.label,
  };

  cache.set(cacheKey, result);
  return result;
}
