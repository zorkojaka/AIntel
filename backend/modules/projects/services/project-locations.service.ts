import { ProjectModel } from '../schemas/project';
import { WorkOrderModel } from '../schemas/work-order';
import { ZahtevaModel } from '../../zahteve/zahteva.model';

export type CanonicalProjectLocation = {
  id: string;
  name: string;
  note: string;
  sourcePhotoItemId: string | null;
};

function clean(value: unknown) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function videoPhotoItemId(zahtevaId: string, sistemId: string, lokacija: any) {
  return clean(lokacija?.sourcePhotoItemId) || `zahteva-location:${zahtevaId}:${sistemId}:${clean(lokacija?.id)}`;
}

function alarmPhotoItemId(zahtevaId: string, sistemId: string, lokacija: any) {
  return clean(lokacija?.sourcePhotoItemId) || `zahteva-alarm-location:${zahtevaId}:${sistemId}:${clean(lokacija?.id)}`;
}

export function sanitizeCanonicalProjectLocations(input: unknown): CanonicalProjectLocation[] {
  const byId = new Map<string, CanonicalProjectLocation>();
  for (const raw of Array.isArray(input) ? input : []) {
    const id = clean((raw as any)?.id);
    if (!id) continue;
    byId.set(id, {
      id,
      name: typeof (raw as any)?.name === 'string' ? (raw as any).name : '',
      note: typeof (raw as any)?.note === 'string' ? (raw as any).note : '',
      sourcePhotoItemId: clean((raw as any)?.sourcePhotoItemId) || (id.startsWith('zahteva-') ? id : null),
    });
  }
  return Array.from(byId.values());
}

export function buildCanonicalLocationsFromZahteva(zahteva: any): CanonicalProjectLocation[] {
  const zahtevaId = clean(zahteva?._id);
  if (!zahtevaId) return [];
  const locations: CanonicalProjectLocation[] = [];
  for (const sistem of zahteva?.sistemi ?? []) {
    const sistemId = clean(sistem?.id);
    if ((sistem?.tip === 'videonadzor' || sistem?.tip === 'wifi_kamere') && sistem?.videonadzor) {
      for (const lokacija of sistem.videonadzor.lokacije ?? []) {
        const itemId = videoPhotoItemId(zahtevaId, sistemId, lokacija);
        locations.push({
          id: clean(lokacija?.projectLocationId) || itemId,
          name: clean(lokacija?.ime),
          note: clean(lokacija?.opomba),
          sourcePhotoItemId: itemId,
        });
      }
    }
    if (sistem?.tip === 'alarm' && sistem?.alarm) {
      for (const lokacija of sistem.alarm.lokacije ?? []) {
        const itemId = alarmPhotoItemId(zahtevaId, sistemId, lokacija);
        locations.push({
          id: clean(lokacija?.projectLocationId) || itemId,
          name: clean(lokacija?.ime),
          note: clean(lokacija?.opomba),
          sourcePhotoItemId: itemId,
        });
      }
    }
  }
  return sanitizeCanonicalProjectLocations(locations);
}

function locationKey(unit: any) {
  return clean(unit?.projectLocationId) || clean(unit?.sourcePhotoItemId);
}

function applyLocationsToSpec(spec: any, locationById: Map<string, CanonicalProjectLocation>) {
  if (!spec || !Array.isArray(spec.executionUnits)) return spec;
  let changed = false;
  const executionUnits = spec.executionUnits.map((unit: any) => {
    const canonical = locationById.get(locationKey(unit));
    if (!canonical) return unit;
    if (unit.location === canonical.name && unit.instructions === canonical.note) return unit;
    changed = true;
    return { ...unit, location: canonical.name, instructions: canonical.note };
  });
  return changed
    ? { ...spec, locationSummary: executionUnits.map((unit: any) => clean(unit.location)).filter(Boolean).join(', '), executionUnits }
    : spec;
}

function applyLocationsToItems(items: any[], locationById: Map<string, CanonicalProjectLocation>) {
  return (items ?? []).map((item: any) => ({
    ...(item?.toObject ? item.toObject() : item),
    executionSpec: applyLocationsToSpec(item?.executionSpec, locationById),
  }));
}

async function syncZahteveFromCanonicalLocations(projectObjectId: unknown, locations: CanonicalProjectLocation[], definitions: any[]) {
  const bySourceId = new Map<string, CanonicalProjectLocation>();
  for (const location of locations) {
    bySourceId.set(location.id, location);
    if (location.sourcePhotoItemId) bySourceId.set(location.sourcePhotoItemId, location);
  }
  const productIdsByLocation = new Map<string, string[]>();
  for (const definition of definitions ?? []) {
    const productId = clean(definition?.productId);
    if (!productId) continue;
    for (const unit of definition?.executionSpec?.executionUnits ?? []) {
      const key = locationKey(unit);
      if (!key) continue;
      const current = productIdsByLocation.get(key) ?? [];
      if (!current.includes(productId)) current.push(productId);
      productIdsByLocation.set(key, current);
    }
  }
  const zahteve = await ZahtevaModel.find({ projectId: projectObjectId });
  for (const zahteva of zahteve) {
    let changed = false;
    const matchedLocationIds = new Set<string>();
    const zahtevaId = String(zahteva._id);
    for (const sistem of zahteva.sistemi as any[]) {
      const sistemId = clean(sistem?.id);
      const locationGroups = [
        { list: sistem?.videonadzor?.lokacije, buildId: videoPhotoItemId },
        { list: sistem?.alarm?.lokacije, buildId: alarmPhotoItemId },
      ];
      for (const group of locationGroups) {
        if (!Array.isArray(group.list)) continue;
        // Locations created by the project workflow have a stable projectLocationId.
        // If one is removed in preparation, remove its mirrored request row too.
        for (let index = group.list.length - 1; index >= 0; index -= 1) {
          const lokacija = group.list[index];
          const projectLocationId = clean(lokacija?.projectLocationId);
          if (projectLocationId && !bySourceId.has(projectLocationId)) {
            group.list.splice(index, 1);
            changed = true;
          }
        }
        for (const lokacija of group.list) {
          const sourceId = group.buildId(zahtevaId, sistemId, lokacija);
          const canonical = bySourceId.get(sourceId) ?? bySourceId.get(clean(lokacija?.projectLocationId));
          if (!canonical) continue;
          matchedLocationIds.add(canonical.id);
          if (lokacija.ime !== canonical.name) {
            lokacija.ime = canonical.name;
            changed = true;
          }
          if (clean(lokacija.opomba) !== canonical.note) {
            lokacija.opomba = canonical.note;
            changed = true;
          }
          if (clean(lokacija.sourcePhotoItemId) !== (canonical.sourcePhotoItemId || canonical.id)) {
            lokacija.sourcePhotoItemId = canonical.sourcePhotoItemId || canonical.id;
            changed = true;
          }
          if (clean(lokacija.projectLocationId) !== canonical.id) {
            lokacija.projectLocationId = canonical.id;
            changed = true;
          }
        }
      }
    }

    for (const canonical of locations) {
      if (matchedLocationIds.has(canonical.id)) continue;
      const productIds = productIdsByLocation.get(canonical.id) ?? productIdsByLocation.get(canonical.sourcePhotoItemId || '') ?? [];
      let appended = false;
      for (const sistem of zahteva.sistemi as any[]) {
        if ((sistem?.tip === 'videonadzor' || sistem?.tip === 'wifi_kamere') && sistem?.videonadzor) {
          const variant = (sistem.videonadzor.asortima ?? []).find((entry: any) => productIds.includes(clean(entry?.kameraProductId)));
          if (variant) {
            sistem.videonadzor.lokacije.push({
              id: canonical.id,
              ime: canonical.name,
              opomba: canonical.note,
              projectLocationId: canonical.id,
              sourcePhotoItemId: canonical.sourcePhotoItemId || canonical.id,
              asortimaIdAssigned: variant.id,
              slike: [],
            });
            sistem.steviloLokacij = sistem.videonadzor.lokacije.length;
            appended = true;
          }
        }
        if (!appended && sistem?.tip === 'alarm' && sistem?.alarm) {
          const sensor = (sistem.alarm.senzorji ?? []).find((entry: any) => productIds.includes(clean(entry?.senzorProductId)));
          if (sensor) {
            sistem.alarm.lokacije.push({
              id: canonical.id,
              ime: canonical.name,
              opomba: canonical.note,
              projectLocationId: canonical.id,
              sourcePhotoItemId: canonical.sourcePhotoItemId || canonical.id,
              senzorIdAssigned: sensor.id,
              slike: [],
            });
            sistem.steviloLokacij = sistem.alarm.lokacije.length;
            appended = true;
          }
        }
        if (appended) break;
      }
      if (appended) changed = true;
    }
    if (changed) {
      zahteva.markModified('sistemi');
      await zahteva.save();
    }
  }
}

export async function propagateCanonicalProjectLocations(project: any) {
  const locations = sanitizeCanonicalProjectLocations(project?.executionLocations);
  const byId = new Map(locations.map((location) => [location.id, location]));
  for (const location of locations) {
    if (location.sourcePhotoItemId) byId.set(location.sourcePhotoItemId, location);
  }

  project.executionLocations = locations;
  project.executionDefinitions = (project.executionDefinitions ?? []).map((definition: any) => ({
    ...definition,
    executionSpec: applyLocationsToSpec(definition?.executionSpec, byId),
  }));
  await project.save();

  const workOrders = await WorkOrderModel.find({ projectId: project.id, cancelledAt: null });
  for (const workOrder of workOrders) {
    workOrder.items = applyLocationsToItems(workOrder.items as any[], byId) as any;
    await workOrder.save();
  }
  await syncZahteveFromCanonicalLocations(project._id, locations, project.executionDefinitions ?? []);
  return locations;
}

export async function syncCanonicalLocationsFromZahteva(zahteva: any) {
  const project = await ProjectModel.findById(zahteva?.projectId);
  if (!project) return [];
  const incoming = buildCanonicalLocationsFromZahteva(zahteva);
  const requestPrefix = `zahteva-location:${String(zahteva._id)}:`;
  const alarmPrefix = `zahteva-alarm-location:${String(zahteva._id)}:`;
  const retained = sanitizeCanonicalProjectLocations(project.executionLocations).filter((location) => {
    const sourceId = location.sourcePhotoItemId || location.id;
    return !sourceId.startsWith(requestPrefix) && !sourceId.startsWith(alarmPrefix);
  });
  project.executionLocations = [
    ...retained,
    ...incoming.map((location) => {
      const previous = sanitizeCanonicalProjectLocations(project.executionLocations).find((entry) => entry.id === location.id);
      return { ...location, note: location.note || previous?.note || '' };
    }),
  ];
  return propagateCanonicalProjectLocations(project);
}

export async function syncCanonicalLocationsFromExecutionItems(projectId: string, items: any[]) {
  const project = await ProjectModel.findOne({ id: projectId });
  if (!project) return [];
  const current = sanitizeCanonicalProjectLocations(project.executionLocations);
  const byId = new Map(current.map((location) => [location.id, location]));
  for (const item of items ?? []) {
    for (const unit of item?.executionSpec?.executionUnits ?? []) {
      const id = locationKey(unit);
      if (!id) continue;
      const existing = byId.get(id);
      byId.set(id, {
        id,
        name: typeof unit?.location === 'string' ? unit.location : existing?.name ?? '',
        note: typeof unit?.instructions === 'string' ? unit.instructions : existing?.note ?? '',
        sourcePhotoItemId: clean(unit?.sourcePhotoItemId) || existing?.sourcePhotoItemId || (id.startsWith('zahteva-') ? id : null),
      });
    }
  }
  project.executionLocations = Array.from(byId.values());
  return propagateCanonicalProjectLocations(project);
}
