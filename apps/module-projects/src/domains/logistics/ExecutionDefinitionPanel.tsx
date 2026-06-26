import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronDown, ChevronRight, Image as ImageIcon, Loader2 } from "lucide-react";
import type {
  ProjectExecutionDefinitionItem,
  WorkOrderExecutionSpec,
  WorkOrderExecutionUnit,
} from "@aintel/shared/types/logistics";
import { PhotoManager, usePhotoCount, type PhotoContext } from "@aintel/ui";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";

type ExecutionDefinitionPanelProps = {
  projectId: string;
  offerVersionId?: string | null;
};

type PreparationPhoto = {
  _id: string;
  id?: string;
  url: string;
  thumbnailUrl?: string;
  originalName?: string;
};

type PhotosResponse = {
  success: boolean;
  data?: {
    photos?: PreparationPhoto[];
  };
};

type ProjectExecutionLocation = {
  id: string;
  name: string;
  note?: string | null;
  sourcePhotoItemId?: string | null;
};

type UnitAssignment = {
  item: ProjectExecutionDefinitionItem;
  unit: WorkOrderExecutionUnit;
  unitIndex: number;
};

function buildPhotoQuery(context: PhotoContext) {
  const params = new URLSearchParams();
  params.set("projectId", context.projectId);
  params.set("phase", context.phase);
  if (context.itemId) params.set("itemId", context.itemId);
  if (typeof context.unitIndex === "number") params.set("unitIndex", String(context.unitIndex));
  if (context.tag) params.set("tag", context.tag);
  return params.toString();
}

function getUnitLocationPhotoItemId(
  fallbackItemId: string,
  unit: Pick<WorkOrderExecutionUnit, "projectLocationId" | "sourcePhotoItemId">,
) {
  return unit.projectLocationId?.trim() || unit.sourcePhotoItemId?.trim() || fallbackItemId;
}

function getUnitLocationPhotoIndex(unit: Pick<WorkOrderExecutionUnit, "projectLocationId" | "sourcePhotoItemId">, fallbackIndex: number) {
  return unit.projectLocationId?.trim() || unit.sourcePhotoItemId?.trim() ? undefined : fallbackIndex;
}

function getPhotoKey(photo: PreparationPhoto) {
  return photo.id || photo._id || photo.url;
}

function getPhotoSrc(photo: PreparationPhoto, variant: "thumbnail" | "full" = "thumbnail") {
  return variant === "thumbnail" ? photo.thumbnailUrl || photo.url : photo.url || photo.thumbnailUrl || "";
}

function dedupePhotos(photos: PreparationPhoto[]) {
  const seen = new Set<string>();
  return photos.filter((photo) => {
    const key = getPhotoKey(photo);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeExecutionSpec(spec?: WorkOrderExecutionSpec | null): WorkOrderExecutionSpec {
  return {
    mode: spec?.mode === "per_unit" || spec?.mode === "measured" ? spec.mode : "simple",
    locationSummary: spec?.locationSummary ?? "",
    instructions: spec?.instructions ?? "",
    trackingUnitLabel: spec?.trackingUnitLabel ?? "",
    executionUnits: Array.isArray(spec?.executionUnits)
      ? spec.executionUnits.map((unit) => ({
          id: unit.id,
          projectLocationId: unit.projectLocationId ?? null,
          sourcePhotoItemId: unit.sourcePhotoItemId ?? null,
          label: unit.label ?? "",
          location: unit.location ?? "",
          instructions: unit.instructions ?? "",
          isCompleted: !!unit.isCompleted,
          completedBy: unit.completedBy ?? null,
          completedAt: unit.completedAt ?? null,
          completedByEmployeeId: unit.completedByEmployeeId ?? null,
          executedBy: unit.executedBy ?? null,
          executedByEmployeeId: unit.executedByEmployeeId ?? null,
          markedDoneBy: unit.markedDoneBy ?? null,
          markedDoneByEmployeeId: unit.markedDoneByEmployeeId ?? null,
          doneBy: unit.doneBy ?? null,
          doneByEmployeeId: unit.doneByEmployeeId ?? null,
          note: unit.note ?? "",
        }))
      : [],
  };
}

function isMeasurementLikeUnit(unit?: string | null) {
  const normalized = (unit ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\[\]\*]/g, "")
    .replace(/\s+/g, "")
    .replace("²", "2")
    .replace("³", "3");
  return [
    "km",
    "kilometer",
    "kilometri",
    "kilometrov",
    "h",
    "ura",
    "ure",
    "ur",
    "min",
    "m",
    "meter",
    "metri",
    "metrov",
    "m2",
    "m3",
    "kg",
    "g",
    "l",
  ].includes(normalized);
}

function hasMeasurementLikeName(name?: string | null) {
  const match = (name ?? "").toLowerCase().match(/\[([^\]]+)\]\s*\*?/);
  return match ? isMeasurementLikeUnit(match[1]) : false;
}

function canDefineLocations(item: ProjectExecutionDefinitionItem) {
  return item.isService !== true && !isMeasurementLikeUnit(item.unit) && !hasMeasurementLikeName(item.name);
}

function desiredUnitCount(item: ProjectExecutionDefinitionItem) {
  if (!canDefineLocations(item)) return 0;
  const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0;
  if (quantity <= 1) return 1;
  return Number.isInteger(quantity) ? quantity : 1;
}

function buildLocationUnits(item: ProjectExecutionDefinitionItem) {
  const spec = normalizeExecutionSpec(item.executionSpec);
  return Array.from({ length: desiredUnitCount(item) }, (_, index) => {
    const existing = spec.executionUnits?.[index];
    return {
      id: existing?.id ?? `draft-${item.id}-${index}`,
      projectLocationId: existing?.projectLocationId ?? null,
      sourcePhotoItemId: existing?.sourcePhotoItemId ?? null,
      label: String(index + 1),
      location: existing?.location ?? "",
      instructions: existing?.instructions ?? "",
      isCompleted: !!existing?.isCompleted,
      completedBy: existing?.completedBy ?? null,
      completedAt: existing?.completedAt ?? null,
      completedByEmployeeId: existing?.completedByEmployeeId ?? null,
      executedBy: existing?.executedBy ?? null,
      executedByEmployeeId: existing?.executedByEmployeeId ?? null,
      markedDoneBy: existing?.markedDoneBy ?? null,
      markedDoneByEmployeeId: existing?.markedDoneByEmployeeId ?? null,
      doneBy: existing?.doneBy ?? null,
      doneByEmployeeId: existing?.doneByEmployeeId ?? null,
      note: existing?.note ?? "",
    };
  });
}

function getLocationKey(unit: Pick<WorkOrderExecutionUnit, "projectLocationId" | "sourcePhotoItemId">) {
  return unit.projectLocationId?.trim() || unit.sourcePhotoItemId?.trim() || "";
}

function buildLocationRows(items: ProjectExecutionDefinitionItem[], savedLocations: ProjectExecutionLocation[]) {
  const byId = new Map<string, ProjectExecutionLocation>();
  for (const location of savedLocations) {
    if (location.id?.trim()) {
      byId.set(location.id, {
        id: location.id,
        name: location.name ?? "",
        note: location.note ?? "",
        sourcePhotoItemId: location.sourcePhotoItemId ?? null,
      });
    }
  }

  for (const item of items) {
    if (!canDefineLocations(item)) continue;
    for (const unit of buildLocationUnits(item)) {
      const key = getLocationKey(unit);
      if (!key || byId.has(key)) continue;
      byId.set(key, {
        id: key,
        name: unit.location ?? "",
        note: unit.instructions ?? "",
        sourcePhotoItemId: unit.sourcePhotoItemId ?? (key.startsWith("zahteva-") ? key : null),
      });
    }
  }

  return Array.from(byId.values());
}

function buildUnitAssignments(items: ProjectExecutionDefinitionItem[]) {
  const assignments: UnitAssignment[] = [];
  for (const item of items) {
    if (!canDefineLocations(item)) continue;
    buildLocationUnits(item).forEach((unit, unitIndex) => {
      assignments.push({ item, unit, unitIndex });
    });
  }
  return assignments;
}

function UnitPhotoButton({
  projectId,
  itemId,
  unitIndex,
  refreshKey,
  onOpen,
}: {
  projectId: string;
  itemId: string;
  unitIndex?: number;
  refreshKey: number;
  onOpen: (context: PhotoContext) => void;
}) {
  const context = useMemo<PhotoContext>(
    () => ({ projectId, phase: "preparation", itemId, unitIndex }),
    [itemId, projectId, unitIndex],
  );
  const { count, refresh } = usePhotoCount(context);

  useEffect(() => {
    if (refreshKey > 0) refresh();
  }, [refresh, refreshKey]);

  return (
    <Button type="button" variant="outline" size="sm" className="h-9 w-full gap-1.5 px-2" onClick={() => onOpen(context)}>
      <Camera className="h-4 w-4" />
      <span>Slike{count > 0 ? ` (${count})` : ""}</span>
    </Button>
  );
}

export function PreparationPhotoThumbnails({
  projectId,
  itemId,
  unitIndex,
  refreshKey,
}: {
  projectId: string;
  itemId: string;
  unitIndex?: number;
  refreshKey: number;
}) {
  const [photos, setPhotos] = useState<PreparationPhoto[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<PreparationPhoto | null>(null);
  const context = useMemo<PhotoContext>(
    () => ({ projectId, phase: "preparation", itemId, unitIndex }),
    [itemId, projectId, unitIndex],
  );
  const queryString = useMemo(() => buildPhotoQuery(context), [context]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    async function loadPhotos() {
      try {
        const queries = [queryString];
        if (itemId.startsWith("zahteva-")) {
          const requirementContext: PhotoContext = { projectId, phase: "requirements", itemId };
          queries.push(buildPhotoQuery(requirementContext));
        }
        const payloads = await Promise.all(
          queries.map(async (query) => {
            const response = await fetch(`/api/photos?${query}`, {
              credentials: "same-origin",
              signal: controller.signal,
            });
            const payload = (await response.json()) as PhotosResponse;
            return response.ok && payload.success ? payload.data?.photos ?? [] : [];
          }),
        );
        if (!alive) return;
        setPhotos(dedupePhotos(payloads.flat()));
      } catch (error: any) {
        if (!alive || error?.name === "AbortError") return;
        setPhotos([]);
      }
    }

    void loadPhotos();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [queryString, refreshKey]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5">
        {photos.map((photo) => {
          const src = getPhotoSrc(photo);
          return (
            <button
              key={getPhotoKey(photo)}
              type="button"
              className="h-9 w-9 overflow-hidden rounded-md border border-border/70 bg-muted/30 transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              onClick={() => setPreviewPhoto(photo)}
              aria-label="Odpri fotografijo definicije izvedbe"
              title={photo.originalName || "Fotografija definicije izvedbe"}
            >
              {src ? (
                <img src={src} alt={photo.originalName || "Fotografija definicije izvedbe"} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Dialog open={Boolean(previewPhoto)} onOpenChange={(open) => !open && setPreviewPhoto(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Fotografija definicije izvedbe</DialogTitle>
            {previewPhoto?.originalName ? <DialogDescription>{previewPhoto.originalName}</DialogDescription> : null}
          </DialogHeader>
          {previewPhoto ? (
            <div className="flex justify-center rounded-md bg-black/5 p-2">
              <img
                src={getPhotoSrc(previewPhoto, "full")}
                alt={previewPhoto.originalName || "Fotografija definicije izvedbe"}
                className="max-h-[72vh] max-w-full rounded-md object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ExecutionDefinitionPanel({ projectId, offerVersionId }: ExecutionDefinitionPanelProps) {
  const [items, setItems] = useState<ProjectExecutionDefinitionItem[]>([]);
  const [locations, setLocations] = useState<ProjectExecutionLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [photoContext, setPhotoContext] = useState<PhotoContext | null>(null);
  const [photoRefreshKey, setPhotoRefreshKey] = useState(0);

  const loadDefinition = useCallback(async () => {
    if (!projectId || !offerVersionId) {
      setItems([]);
      setLocations([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ offerVersionId });
      const response = await fetch(`/api/projects/${projectId}/execution-definition?${params.toString()}`);
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Definicije izvedbe ni bilo mogoče naložiti.");
        return;
      }
      const nextItems = Array.isArray(payload.data?.items) ? payload.data.items : [];
      const nextLocations = Array.isArray(payload.data?.locations) ? payload.data.locations : [];
      setItems(nextItems);
      setLocations(buildLocationRows(nextItems, nextLocations));
    } catch (error) {
      console.error(error);
      toast.error("Definicije izvedbe ni bilo mogoče naložiti.");
    } finally {
      setLoading(false);
    }
  }, [offerVersionId, projectId]);

  useEffect(() => {
    void loadDefinition();
  }, [loadDefinition]);

  const updateUnit = (itemId: string, index: number, changes: Partial<WorkOrderExecutionUnit>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        const units = buildLocationUnits(item).map((unit, unitIndex) =>
          unitIndex === index ? { ...unit, ...changes } : unit,
        );
        return {
          ...item,
          executionSpec: {
            ...normalizeExecutionSpec(item.executionSpec),
            mode: "per_unit",
            trackingUnitLabel: normalizeExecutionSpec(item.executionSpec).trackingUnitLabel || "Kamera",
            locationSummary: units.map((unit) => unit.location).filter(Boolean).join(", "),
            executionUnits: units,
          },
        };
      }),
    );
  };

  const updateLocation = (locationId: string, changes: Partial<ProjectExecutionLocation>) => {
    setLocations((current) =>
      current.map((location) => (location.id === locationId ? { ...location, ...changes } : location)),
    );
    setItems((current) =>
      current.map((item) => {
        if (!canDefineLocations(item)) return item;
        const units = buildLocationUnits(item);
        let changed = false;
        const nextUnits = units.map((unit) => {
          if (getLocationKey(unit) !== locationId) return unit;
          changed = true;
          return {
            ...unit,
            location: changes.name !== undefined ? changes.name ?? "" : unit.location,
            instructions: changes.note !== undefined ? changes.note ?? "" : unit.instructions,
          };
        });
        if (!changed) return item;
        return {
          ...item,
          executionSpec: {
            ...normalizeExecutionSpec(item.executionSpec),
            mode: "per_unit",
            trackingUnitLabel: normalizeExecutionSpec(item.executionSpec).trackingUnitLabel || "Kamera",
            locationSummary: nextUnits.map((unit) => unit.location).filter(Boolean).join(", "),
            executionUnits: nextUnits,
          },
        };
      }),
    );
  };

  const addLocation = () => {
    const id = `project-location-${Date.now().toString(36)}`;
    setLocations((current) => [...current, { id, name: "", note: "", sourcePhotoItemId: null }]);
    setExpanded((current) => ({ ...current, [id]: true }));
  };

  const assignUnitToLocation = (location: ProjectExecutionLocation, assignment: UnitAssignment) => {
    updateUnit(assignment.item.id, assignment.unitIndex, {
      projectLocationId: location.id,
      sourcePhotoItemId: location.sourcePhotoItemId ?? (location.id.startsWith("zahteva-") ? location.id : null),
      location: location.name ?? "",
      instructions: location.note ?? "",
    });
  };

  const removeUnitFromLocation = (assignment: UnitAssignment) => {
    updateUnit(assignment.item.id, assignment.unitIndex, {
      projectLocationId: null,
      sourcePhotoItemId: null,
      location: "",
      instructions: "",
    });
  };

  const removeLocation = (location: ProjectExecutionLocation) => {
    assignments
      .filter((assignment) => getLocationKey(assignment.unit) === location.id)
      .forEach((assignment) => removeUnitFromLocation(assignment));
    setLocations((current) => current.filter((entry) => entry.id !== location.id));
  };

  const saveDefinition = async () => {
    if (!projectId || !offerVersionId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/execution-definition`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerVersionId, locations, items }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Definicije izvedbe ni bilo mogoče shraniti.");
        return;
      }
      const nextItems = Array.isArray(payload.data?.items) ? payload.data.items : items;
      const nextLocations = Array.isArray(payload.data?.locations) ? payload.data.locations : locations;
      setItems(nextItems);
      setLocations(buildLocationRows(nextItems, nextLocations));
      toast.success("Definicija izvedbe shranjena.");
    } catch (error) {
      console.error(error);
      toast.error("Definicije izvedbe ni bilo mogoče shraniti.");
    } finally {
      setSaving(false);
    }
  };

  const locationRows = buildLocationRows(items, locations);
  const assignments = buildUnitAssignments(items);
  const assignedLocationIds = new Set(locationRows.map((location) => location.id));
  const unassignedAssignments = assignments.filter((assignment) => !assignedLocationIds.has(getLocationKey(assignment.unit)));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Definicija izvedbe</h3>
          <p className="text-sm text-muted-foreground">Lokacije in fotografije so skupne za ponudbo, pripravo in delovni nalog.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline">{locationRows.length} lokacij</Badge>
          <Button type="button" variant="outline" size="sm" onClick={addLocation} disabled={!offerVersionId || loading}>
            Dodaj lokacijo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!offerVersionId ? (
          <p className="text-sm text-muted-foreground">Najprej izberi ali shrani verzijo ponudbe.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Nalagam definicijo izvedbe...
          </div>
        ) : locationRows.length === 0 ? (
          <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
            Ni lokacij za definicijo izvedbe.
          </div>
        ) : (
          <div className="space-y-3">
            {locationRows.map((location) => {
              const linkedAssignments = assignments.filter((assignment) => getLocationKey(assignment.unit) === location.id);
              const isExpanded = expanded[location.id] !== false;
              const photoItemId = location.sourcePhotoItemId || location.id;
              return (
                <div key={location.id} className="rounded-lg border border-border/70 bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{location.name?.trim() || "Neimenovana lokacija"}</p>
                        <Badge variant="outline">{linkedAssignments.length} povezav</Badge>
                      </div>
                      {location.note?.trim() ? <p className="text-xs text-muted-foreground">{location.note}</p> : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => removeLocation(location)}
                      >
                        Odstrani
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setExpanded((current) => ({ ...current, [location.id]: !isExpanded }))}
                      >
                        {isExpanded ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
                        Detajli lokacije
                      </Button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="mt-3 space-y-4">
                      <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_120px]">
                        <Input
                          value={location.name ?? ""}
                          onChange={(event) => updateLocation(location.id, { name: event.target.value })}
                          placeholder="Ime lokacije"
                        />
                        <Input
                          value={location.note ?? ""}
                          onChange={(event) => updateLocation(location.id, { note: event.target.value })}
                          placeholder="Opomba lokacije"
                        />
                        <UnitPhotoButton projectId={projectId} itemId={photoItemId} refreshKey={photoRefreshKey} onOpen={setPhotoContext} />
                      </div>
                      <PreparationPhotoThumbnails projectId={projectId} itemId={photoItemId} refreshKey={photoRefreshKey} />

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Povezani produkti</p>
                        {linkedAssignments.length === 0 ? (
                          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                            Ni povezanih produktov.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {linkedAssignments.map((assignment) => (
                              <div
                                key={`${assignment.item.id}-${assignment.unitIndex}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/10 px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{assignment.item.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {assignment.unit.label || `Enota ${assignment.unitIndex + 1}`} - {assignment.item.quantity} {assignment.item.unit}
                                  </p>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeUnitFromLocation(assignment)}>
                                  Odstrani
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {unassignedAssignments.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Dodaj produkt na lokacijo</p>
                          <div className="flex flex-wrap gap-2">
                            {unassignedAssignments.map((assignment) => (
                              <Button
                                key={`${assignment.item.id}-${assignment.unitIndex}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-auto min-h-8 max-w-full justify-start whitespace-normal text-left"
                                onClick={() => assignUnitToLocation(location, assignment)}
                              >
                                {assignment.item.name} - {assignment.unit.label || `Enota ${assignment.unitIndex + 1}`}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end border-t border-border/60 pt-4">
          <Button variant="outline" size="sm" onClick={() => void saveDefinition()} disabled={saving || loading || !offerVersionId}>
            {saving ? "Shranjujem definicijo..." : "Shrani definicijo izvedbe"}
          </Button>
        </div>
      </CardContent>
      {photoContext ? (
        <PhotoManager
          open={!!photoContext}
          context={photoContext}
          title="Fotografije priprave"
          canDelete={true}
          onPhotoCountChange={() => setPhotoRefreshKey((key) => key + 1)}
          onOpenChange={(open) => {
            if (!open) {
              setPhotoContext(null);
              setPhotoRefreshKey((key) => key + 1);
            }
          }}
        />
      ) : null}
    </Card>
  );
}
