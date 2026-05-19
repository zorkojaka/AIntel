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
};

const SCENARIO_LABELS: Record<ExecutionScenario["type"], string> = {
  posiljanje: "Pošiljanje",
  izvedba: "Izvedba",
  izvedba_napeljava: "Izvedba + napeljava",
};

function selectedMaterial(sistem: ZahtevaSistem) {
  const result: Array<{ productId: string; quantity: number }> = [];
  const v = sistem.tip === "videonadzor" ? sistem.videonadzor : null;
  if (!v) return result;

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
        lines.push({ key: rule.id, serviceProductId: rule.serviceProductId, name: service.ime, quantity, price: service.prodajnaCena, source: "Pravilo projekta" });
      }
      continue;
    }
    for (const item of material) {
      const product = productById.get(item.productId);
      if (!ruleMatches(rule, product, projectTypes)) continue;
      const service = productById.get(rule.serviceProductId);
      const quantity = quantityFromRule(rule, item.quantity, product);
      if (service && quantity > 0) {
        lines.push({ key: `${rule.id}-${item.productId}`, serviceProductId: rule.serviceProductId, name: service.ime, quantity, price: service.prodajnaCena, source: product?.ime ?? "Izdelek" });
      }
    }
  }

  const scenario = settings.scenarios.find((entry) => entry.type === execution.scenarioType);
  const estimates = execution.estimates ?? { napeljavaUr: 0, utpKabelMetrov: 0, kanalMetrov: 0 };
  const cameras = Math.max(1, cameraCount(sistem, productById));
  for (const serviceRule of scenario?.storitve ?? []) {
    const service = productById.get(serviceRule.serviceProductId);
    const quantity = quantityFromRule(serviceRule, cameras, undefined, estimates);
    if (service && quantity > 0) {
      lines.push({ key: serviceRule.id, serviceProductId: serviceRule.serviceProductId, name: service.ime, quantity, price: service.prodajnaCena, source: scenario?.ime ?? "Scenarij" });
    }
  }
  return lines;
}

export function SekcijaIzvedba({ sistem, settings, productById, onChange }: Props) {
  const scenarioType = sistem.execution?.scenarioType ?? "posiljanje";
  const cameras = cameraCount(sistem, productById);
  const scenario = settings?.scenarios.find((entry) => entry.type === scenarioType);
  const estimates = sistem.execution?.estimates ?? {
    napeljavaUr: cameras * (scenario?.defaultEstimates?.napeljavaUrPerKamera ?? 2),
    utpKabelMetrov: cameras * (scenario?.defaultEstimates?.utpKabelMetrovPerKamera ?? 20),
    kanalMetrov: cameras * (scenario?.defaultEstimates?.kanalMetrovPerKamera ?? 4),
  };
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
      },
    });
  };

  const setEstimate = (key: "napeljavaUr" | "utpKabelMetrov" | "kanalMetrov", value: number) => {
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

      {scenarioType === "izvedba_napeljava" ? (
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span>Ur napeljave</span>
            <Input type="number" value={estimates.napeljavaUr} onChange={(event) => setEstimate("napeljavaUr", Number(event.target.value))} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Metrov UTP kabla</span>
            <Input type="number" value={estimates.utpKabelMetrov} onChange={(event) => setEstimate("utpKabelMetrov", Number(event.target.value))} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Metrov zaščitnega kanala</span>
            <Input type="number" value={estimates.kanalMetrov} onChange={(event) => setEstimate("kanalMetrov", Number(event.target.value))} />
          </label>
        </div>
      ) : null}

      <div className="rounded-md border border-border">
        <div className="grid grid-cols-[1fr_90px_110px] gap-2 border-b border-border bg-muted px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
          <span>Storitev</span>
          <span>Količina</span>
          <span className="text-right">Cena</span>
        </div>
        {preview.length ? (
          preview.map((line) => (
            <div key={line.key} className="grid grid-cols-[1fr_90px_110px] gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0">
              <span>
                {line.name}
                <small className="block text-muted-foreground">{line.source}</small>
              </span>
              <span>{line.quantity}</span>
              <span className="text-right">{formatPrice(line.quantity * line.price)}</span>
            </div>
          ))
        ) : (
          <div className="px-3 py-3 text-sm text-muted-foreground">Ni predvidenih storitev.</div>
        )}
      </div>
      <div className="mt-3 text-right text-sm">
        Ocena cene izvedbe: <strong>{formatPrice(total)}</strong>
      </div>
    </Card>
  );
}
