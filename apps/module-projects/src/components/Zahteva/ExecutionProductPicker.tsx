import { useEffect, useMemo, useState } from "react";
import { parseApiEnvelope } from "@aintel/shared/utils/api-client";
import type { PriceListSearchItem } from "@aintel/shared/types/price-list";
import { fetchCenikProducts, type CenikProduct } from "../../api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SekcijaKameraNosilec } from "./SekcijaKameraNosilec";
import { SekcijaSnemalnik } from "./SekcijaSnemalnik";
import { SekcijaPoESwitch } from "./SekcijaPoESwitch";
import { SekcijaDisk } from "./SekcijaDisk";
import { SekcijaAlarmOprema } from "./SekcijaAlarmOprema";
import { SekcijaReolinkDodatnaOprema } from "./SekcijaReolinkDodatnaOprema";
import { createAlarmSystem, createVideonadzorSystem } from "./utils";

const groups = ["Kamera", "Nosilec", "Snemalnik", "PoE switch", "Disk", "Alarm", "WiFi kamere", "MicroSD"] as const;
const video = createVideonadzorSystem("picker").videonadzor!;
const alarm = createAlarmSystem("picker").alarm!;
const ignoreChange = () => {};

// Uses the same sections as SistemBlok; filters and product groups stay in one place.
export function ExecutionProductPicker({ onProductSelected }: { onProductSelected: (product: PriceListSearchItem) => void }) {
  const [group, setGroup] = useState<typeof groups[number]>("Kamera");
  const [products, setProducts] = useState<CenikProduct[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchCenikProducts().then((items) => { if (!cancelled) setProducts(items); })
      .catch(() => { if (!cancelled) setError("Cenika ni mogoče pridobiti."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);
  const productById = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("sl-SI");
    return new Map(products.filter((product) => !search || `${product.ime} ${product.externalId ?? ""} ${product.aaData?.productCode ?? ""} ${product.proizvajalec ?? ""}`.toLocaleLowerCase("sl-SI").includes(search)).map((product) => [product._id, product]));
  }, [products, query]);
  const select = async (product: CenikProduct) => {
    setSelecting(true);
    setError("");
    try {
      const response = await fetch(`/api/price-list/items/search?q=${encodeURIComponent(product.ime)}`);
      const items = await parseApiEnvelope<PriceListSearchItem[]>(response, "Izbira postavke ni uspela.");
      const selected = items.find((item) => item.id === product._id);
      if (!selected) throw new Error("Postavke ni mogoče izbrati. Uporabi iskanje po ceniku.");
      onProductSelected(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Izbira postavke ni uspela.");
    } finally { setSelecting(false); }
  };
  const common = { productById, onProductSelected: select, onChange: ignoreChange };
  return (
    <details open className="min-w-0 rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Izberi postavko po skupinah</summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {groups.map((label) => <Button key={label} type="button" size="sm" variant={group === label ? "default" : "outline"} disabled={selecting} onClick={() => { setGroup(label); setQuery(""); }}>{label}</Button>)}
      </div>
      <Input className="mt-3" placeholder="Poišči po nazivu, šifri ali proizvajalcu" value={query} disabled={selecting} onChange={(event) => setQuery(event.target.value)} />
      {loading ? <p className="mt-3 text-sm">Nalaganje cenika...</p> : null}
      {error ? <div className="mt-3 text-sm text-destructive">{error} <Button type="button" size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Poskusi znova</Button></div> : null}
      {!loading && products.length === 0 && !error ? <p className="mt-3 text-sm">Cenik je prazen.</p> : null}
      <fieldset disabled={loading || selecting} className="zahteva-page mt-3 min-w-0">
        {selecting ? <p className="text-sm">Izbiram postavko...</p> : null}
        {(group === "Kamera" || group === "Nosilec" || group === "WiFi kamere") ? <SekcijaKameraNosilec key={group} {...common} selectionGroup={group === "Nosilec" ? "bracket" : "camera"} cameraMode={group === "WiFi kamere" ? "reolink_wifi" : "ip"} onAddVariant={ignoreChange} /> : null}
        {group === "Nosilec" ? <p className="text-xs text-muted-foreground">Izberi kamero, nato kompatibilen nosilec.</p> : null}
        {group === "Snemalnik" ? <SekcijaSnemalnik {...common} videonadzor={video} /> : null}
        {group === "PoE switch" ? <SekcijaPoESwitch {...common} videonadzor={video} /> : null}
        {group === "Disk" ? <SekcijaDisk {...common} videonadzor={video} /> : null}
        {group === "Alarm" ? <SekcijaAlarmOprema {...common} alarm={alarm} onAddSenzor={select} /> : null}
        {group === "MicroSD" ? <SekcijaReolinkDodatnaOprema {...common} videonadzor={video} /> : null}
      </fieldset>
    </details>
  );
}
