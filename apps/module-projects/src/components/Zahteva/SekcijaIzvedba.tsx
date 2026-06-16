import { AlertTriangle } from "lucide-react";
import type { CenikProduct, ExecutionRuleSettings, ExecutionScenario, ProductServiceExecutionRule } from "../../api";
import type { ZahtevaExecution } from "../../types";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import type { ZahtevaSistem } from "./utils";
import { formatPrice, normalizedSelectedItems } from "./utils";

type Props = {
  sistem: ZahtevaSistem;
  settings: ExecutionRuleSettings | null;
  productById: Map<string, CenikProduct>;
  onChange: (next: ZahtevaExecution) => void;
};

type PreviewLine = {
  key: string;
  serviceProductId: string;
  name: string;
  quantity: number;
  price: number;
  source: string;
  estimateField?: "napeljavaUr" | "utpKabelMetrov" | "kanalMetrov" | "kilometrinaKm";
  unit: string;
};

const SCENARIO_LABELS: Record<ExecutionScenario["type"], string> = {
  posiljanje: "Pošiljanje",
  izvedba: "Izvedba",
  izvedba_napeljava: "Izvedba + napeljava",
};

function selectedMaterial(sistem: ZahtevaSistem) {
  const result: Array<{ productId: string; quantity: number }> = [];
  const v = sistem.tip === "videonadzor" ? sistem.videonadzor : null;
  if (v) {
    for (const variant of v.asortima ?? []) {
      const quantity = (v.lokacije ?? []).filter((lokacija) => lokacija.asortimaIdAssigned === variant.id).length;
      if (quantity > 0) {
        result.push({ productId: variant.kameraProductId, quantity });
        if (variant.nosilecProductId) result.push({ productId: variant.nosilecProductId, quantity });
      }
    }
    if (v.snemalnik?.productId) result.push({ productId: v.snemalnik.productId, quantity: 1 });
    for (const item of normalizedSelectedItems(v.poeSwitch)) result.push({ productId: item.productId, quantity: item.kolicina });
    for (const item of normalizedSelectedItems(v.disk)) result.push({ productId: item.productId, quantity: item.kolicina });
    for (const item of v.dodatnaOprema ?? []) result.push({ productId: item.productId, quantity: item.kolicina });
    return result;
  }

  const alarm = sistem.tip === "alarm" ? sistem.alarm : null;
  if (!alarm) return result;
  for (const senzor of alarm.senzorji ?? []) {
    const quantity = (alarm.lokacije ?? []).filter((lokacija) => lokacija.senzorIdAssigned === senzor.id).length;
    if (quantity > 0) result.push({ productId: senzor.senzorProductId, quantity });
  }
  if (alarm.centrala?.productId) result.push({ productId: alarm.centrala.productId, quantity: 1 });
  for (const item of [...(alarm.upravljanje ?? []), ...(alarm.sirene ?? []), ...(alarm.pozarPoplava ?? []), ...(alarm.dodatnaOprema ?? [])]) {
    result.push({ productId: item.productId, quantity: item.kolicina });
  }
  return result;
}

function getByPath(source: any, path?: string) {
  const cleanPath = path?.trim();
  if (!cleanPath) return undefined;
  return cleanPath.split(".").reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function quantityFromRule(rule: { quantityRule: any }, baseQuantity: number, product?: CenikProduct, estimates?: Record<string, number>) {
  if (rule.quantityRule?.type === "per_unit") return Math.max(0, Number(baseQuantity) || 0);
  if (rule.quantityRule?.type === "per_classification_field") {
    const fieldValue = product ? getByPath(product.classification, rule.quantityRule.field) : getByPath(estimates, rule.quantityRule.field);
    const qty = Number(fieldValue);
    if (!product && estimates) return Number.isFinite(qty) && qty > 0 ? qty : 0;
    return Number.isFinite(qty) && qty > 0 ? qty * Math.max(1, baseQuantity) : 0;
  }
  return Math.max(0, Number(rule.quantityRule?.value ?? 1) || 0);
}

function estimateFieldFromRule(rule: { quantityRule: any }) {
  const field = rule.quantityRule?.type === "per_classification_field" ? rule.quantityRule.field : "";
  return ["napeljavaUr", "utpKabelMetrov", "kanalMetrov", "kilometrinaKm"].includes(field) ? field as PreviewLine["estimateField"] : undefined;
}

function unitForLine(line: Pick<PreviewLine, "estimateField" | "name">) {
  if (line.estimateField === "napeljavaUr") return "h";
  if (line.estimateField === "utpKabelMetrov" || line.estimateField === "kanalMetrov") return "m";
  if (line.estimateField === "kilometrinaKm") return "km";
  const name = line.name.toLowerCase();
  if (name.includes("[km]") || name.includes("kilometr")) return "km";
  if (name.includes("[m]") || /\bkabel\b/.test(name) || /\bkanal\b/.test(name) || /\bcev\b/.test(name)) return "m";
  if (/\b(ura|ure|ur)\b/.test(name)) return "h";
  return "kos";
}

function ruleMatches(rule: ProductServiceExecutionRule, product: CenikProduct | undefined, projectTypes: Set<string>) {
  if (rule.triggerType === "project") return projectTypes.has(rule.triggerValue);
  if (!product) return false;
  if (rule.triggerType === "product") return product._id === rule.triggerValue;
  if (rule.triggerType === "category") return (product.categorySlugs ?? []).includes(rule.triggerValue);
  if (rule.triggerType === "classification") {
    if (product.classification?.productType !== rule.triggerValue) return false;
    if (!rule.triggerField?.trim()) return true;
    const value = getByPath(product.classification, rule.triggerField);
    return rule.triggerFieldValue?.trim() ? String(value) === rule.triggerFieldValue.trim() : value !== undefined && value !== null && value !== "";
  }
  return false;
}

function cameraCount(sistem: ZahtevaSistem, productById: Map<string, CenikProduct>) {
  return selectedMaterial(sistem).reduce((sum, item) => {
    const product = productById.get(item.productId);
    return product?.classification?.productType === "kamera" ? sum + item.quantity : sum;
  }, 0);
}

function buildPreview(
  sistem: ZahtevaSistem,
  execution: ZahtevaExecution,
  settings: ExecutionRuleSettings | null,
  productById: Map<string, CenikProduct>,
): PreviewLine[] {
  if (!settings?.isConfigured) return [];
  const lines: PreviewLine[] = [];
  const material = selectedMaterial(sistem);
  const projectTypes = new Set([sistem.tip]);

  for (const rule of settings.productServiceRules.filter((entry) => entry.isActive)) {
    if (rule.triggerType === "project") {
      if (!ruleMatches(rule, undefined, projectTypes)) continue;
      const service = productById.get(rule.serviceProductId);
      const quantity = quantityFromRule(rule, 1);
      if (service && quantity > 0) {
        lines.push({ key: rule.id, serviceProductId: rule.serviceProductId, name: service.ime, quantity, price: service.prodajnaCena, source: "Pravilo projekta", unit: unitForLine({ name: service.ime }) });
      }
      continue;
    }
    for (const item of material) {
      const product = productById.get(item.productId);
      if (!ruleMatches(rule, product, projectTypes)) continue;
      const service = productById.get(rule.serviceProductId);
      const quantity = quantityFromRule(rule, item.quantity, product);
      if (service && quantity > 0) {
        lines.push({ key: `${rule.id}-${item.productId}`, serviceProductId: rule.serviceProductId, name: service.ime, quantity, price: service.prodajnaCena, source: product?.ime ?? "Izdelek", unit: unitForLine({ name: service.ime }) });
      }
    }
  }

  const scenario = settings.scenarios.find((entry) => entry.type === execution.scenarioType);
  const estimates = execution.estimates ?? { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0 };
  const cameras = Math.max(1, cameraCount(sistem, productById));
  for (const serviceRule of scenario?.storitve ?? []) {
    const service = productById.get(serviceRule.serviceProductId);
    const quantity = quantityFromRule(serviceRule, cameras, undefined, estimates);
    const estimateField = estimateFieldFromRule(serviceRule);
    if (service && (quantity > 0 || estimateField)) {
      lines.push({ key: serviceRule.id, serviceProductId: serviceRule.serviceProductId, name: service.ime, quantity, price: service.prodajnaCena, source: scenario?.ime ?? "Scenarij", estimateField, unit: unitForLine({ name: service.ime, estimateField }) });
    }
  }
  return lines;
}

export function SekcijaIzvedba({ sistem, settings, productById, onChange }: Props) {
  const scenarioType = sistem.execution?.scenarioType ?? "posiljanje";
  const cameras = cameraCount(sistem, productById);
  const scenario = settings?.scenarios.find((entry) => entry.type === scenarioType);
  const defaultEstimates = {
    napeljavaUr: cameras * (scenario?.defaultEstimates?.napeljavaUrPerKamera ?? 2),
    utpKabelMetrov: cameras * (scenario?.defaultEstimates?.utpKabelMetrovPerKamera ?? 20),
    kanalMetrov: cameras * (scenario?.defaultEstimates?.kanalMetrovPerKamera ?? 4),
    kilometrinaKm: scenario?.defaultEstimates?.kilometrinaKm ?? 0,
  };
  const estimates = { ...defaultEstimates, ...(sistem.execution?.estimates ?? {}) };
  const execution: ZahtevaExecution = { scenarioType, estimates };
  const preview = buildPreview(sistem, execution, settings, productById);
  const total = preview.reduce((sum, line) => sum + line.quantity * line.price, 0);

  const setScenario = (nextType: ExecutionScenario["type"]) => {
    const nextScenario = settings?.scenarios.find((entry) => entry.type === nextType);
    onChange({
      scenarioType: nextType,
      estimates: {
        napeljavaUr: cameras * (nextScenario?.defaultEstimates?.napeljavaUrPerKamera ?? 2),
        utpKabelMetrov: cameras * (nextScenario?.defaultEstimates?.utpKabelMetrovPerKamera ?? 20),
        kanalMetrov: cameras * (nextScenario?.defaultEstimates?.kanalMetrovPerKamera ?? 4),
        kilometrinaKm: nextScenario?.defaultEstimates?.kilometrinaKm ?? 0,
      },
    });
  };

  const setEstimate = (key: "napeljavaUr" | "utpKabelMetrov" | "kanalMetrov" | "kilometrinaKm", value: number) => {
    onChange({ scenarioType, estimates: { ...estimates, [key]: Math.max(0, value) } });
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Izvedba</h3>
          <p className="text-sm text-muted-foreground">Izberi scenarij izvedbe za ponudbo.</p>
        </div>
      </div>

      {!settings?.isConfigured ? (
        <div className="mb-4 flex gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Pravila izvedbe niso nastavljena.{" "}
            <a className="underline" href="/nastavitve?section=sales">
              Pojdi v Nastavitve.
            </a>
          </span>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["posiljanje", "izvedba", "izvedba_napeljava"] as const).map((type) => (
          <label key={type} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${scenarioType === type ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
            <input type="radio" name={`executionScenario-${sistem.id}`} checked={scenarioType === type} onChange={() => setScenario(type)} />
            {SCENARIO_LABELS[type]}
          </label>
        ))}
      </div>

      <div className="rounded-md border border-border">
        <div className="grid grid-cols-[1fr_130px_110px] gap-2 border-b border-border bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
          <span>Storitev</span>
          <span>Količina</span>
          <span className="text-right">Cena</span>
        </div>
        {preview.length ? (
          preview.map((line) => (
            <div key={line.key} className="grid grid-cols-[1fr_130px_110px] items-center gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0">
              <span>
                {line.name}
                <small className="block text-muted-foreground">{line.source}</small>
              </span>
              <span>
                {line.estimateField ? (
                  <label className="flex items-center gap-2">
                    <Input
                      className="h-8 w-20"
                      type="number"
                      min={0}
                      value={estimates[line.estimateField] ?? 0}
                      onChange={(event) => setEstimate(line.estimateField!, Number(event.target.value))}
                    />
                    <span>{line.unit}</span>
                  </label>
                ) : (
                  `${line.quantity} ${line.unit}`
                )}
              </span>
              <span className="text-right">{formatPrice(line.quantity * line.price)}</span>
            </div>
          ))
        ) : (
          <div className="px-3 py-3 text-sm text-muted-foreground">Ni predvidenih storitev.</div>
        )}
      </div>
      <div className="mt-3 text-right text-sm">
        Ocena izvedbe: <strong>{formatPrice(total)}</strong>
      </div>
    </Card>
  );
}
