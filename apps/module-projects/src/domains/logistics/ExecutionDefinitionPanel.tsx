import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type {
  ProjectExecutionDefinitionItem,
  WorkOrderExecutionSpec,
  WorkOrderExecutionUnit,
} from "@aintel/shared/types/logistics";
import { PhotoManager, usePhotoCount, type PhotoContext } from "@aintel/ui";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

type ExecutionDefinitionPanelProps = {
  projectId: string;
  offerVersionId?: string | null;
};

function normalizeExecutionSpec(spec?: WorkOrderExecutionSpec | null): WorkOrderExecutionSpec {
  return {
    mode: spec?.mode === "per_unit" || spec?.mode === "measured" ? spec.mode : "simple",
    locationSummary: spec?.locationSummary ?? "",
    instructions: spec?.instructions ?? "",
    trackingUnitLabel: spec?.trackingUnitLabel ?? "",
    executionUnits: Array.isArray(spec?.executionUnits)
      ? spec.executionUnits.map((unit) => ({
          id: unit.id,
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
  const normalized = (unit ?? "").trim().toLowerCase();
  return ["km", "h", "ura", "ur", "min", "m", "m2", "m3", "kg", "g", "l"].includes(normalized);
}

function canDefineLocations(item: ProjectExecutionDefinitionItem) {
  return item.isService !== true && !isMeasurementLikeUnit(item.unit);
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

function UnitPhotoButton({
  projectId,
  itemId,
  unitIndex,
  refreshKey,
  onOpen,
}: {
  projectId: string;
  itemId: string;
  unitIndex: number;
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
    <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => onOpen(context)}>
      <Camera className="h-4 w-4" />
      <span>Fotografija{count > 0 ? ` (${count})` : ""}</span>
    </Button>
  );
}

export function ExecutionDefinitionPanel({ projectId, offerVersionId }: ExecutionDefinitionPanelProps) {
  const [items, setItems] = useState<ProjectExecutionDefinitionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [photoContext, setPhotoContext] = useState<PhotoContext | null>(null);
  const [photoRefreshKey, setPhotoRefreshKey] = useState(0);

  const loadDefinition = useCallback(async () => {
    if (!projectId || !offerVersionId) {
      setItems([]);
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
      setItems(Array.isArray(payload.data?.items) ? payload.data.items : []);
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

  const saveDefinition = async () => {
    if (!projectId || !offerVersionId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/execution-definition`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerVersionId, items }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Definicije izvedbe ni bilo mogoče shraniti.");
        return;
      }
      setItems(Array.isArray(payload.data?.items) ? payload.data.items : items);
      toast.success("Definicija izvedbe shranjena.");
    } catch (error) {
      console.error(error);
      toast.error("Definicije izvedbe ni bilo mogoče shraniti.");
    } finally {
      setSaving(false);
    }
  };

  const prioritizedItems = [...items].sort((a, b) => {
    const aService = a.isService ? 1 : 0;
    const bService = b.isService ? 1 : 0;
    return aService === bService ? 0 : aService - bService;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Definicija izvedbe</h3>
          <p className="text-sm text-muted-foreground">Lokacije in fotografije so skupne za ponudbo, pripravo in delovni nalog.</p>
        </div>
        <Badge variant="outline">{prioritizedItems.length} postavk</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {!offerVersionId ? (
          <p className="text-sm text-muted-foreground">Najprej izberi ali shrani verzijo ponudbe.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Nalagam definicijo izvedbe...
          </div>
        ) : prioritizedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ni postavk za definicijo izvedbe.</p>
        ) : (
          <div className="space-y-3">
            {prioritizedItems.map((item) => {
              const locationsAllowed = canDefineLocations(item);
              const units = locationsAllowed ? buildLocationUnits(item) : [];
              const isExpanded = item.isService ? !!expanded[item.id] : expanded[item.id] !== false;
              return (
                <div key={item.id} className="rounded-lg border border-border/70 bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{item.name}</p>
                        {item.isService ? <Badge variant="outline">Storitev</Badge> : <Badge variant="outline">Produkt</Badge>}
                        {locationsAllowed ? <Badge variant="outline">Enote: {units.length}/{desiredUnitCount(item)}</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Količina: {item.quantity ?? 0} {item.unit || ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => setExpanded((current) => ({ ...current, [item.id]: !isExpanded }))}
                    >
                      {isExpanded ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
                      Detajli izvedbe
                    </Button>
                  </div>
                  {isExpanded ? (
                    <div className="mt-3 space-y-2">
                      {locationsAllowed ? (
                        units.map((unit, index) => (
                          <div key={unit.id} className="rounded-md border border-border/70 bg-muted/10 p-2">
                            <div className="grid gap-2 md:grid-cols-[120px_minmax(240px,1.8fr)_minmax(180px,1.2fr)_140px]">
                              <div className="flex items-center text-sm font-medium">{unit.label}</div>
                              <Input
                                value={unit.location ?? ""}
                                onChange={(event) => updateUnit(item.id, index, { location: event.target.value })}
                                placeholder="Lokacija"
                              />
                              <Input
                                value={unit.instructions ?? ""}
                                onChange={(event) => updateUnit(item.id, index, { instructions: event.target.value })}
                                placeholder="Opomba"
                              />
                              <UnitPhotoButton
                                projectId={projectId}
                                itemId={item.offerItemId ?? item.id}
                                unitIndex={index}
                                refreshKey={photoRefreshKey}
                                onOpen={setPhotoContext}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                          Lokacije se definirajo pri povezanih produktih.
                        </div>
                      )}
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
