import { BellRing, ChevronDown, Flame, Keyboard, Package, Plus, RadioReceiver, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getProductImageUrl, type CenikProduct } from "../../api";
import type { Alarm } from "./utils";
import { formatPrice, salesCompare, topSellerId } from "./utils";

type Props = {
  alarm: Alarm;
  productById: Map<string, CenikProduct>;
  onChange: (next: Alarm) => void;
  onAddSenzor: (product: CenikProduct) => void;
};

type QuantityField = "upravljanje" | "sirene" | "pozarPoplava" | "dodatnaOprema";
type AlarmProjectMode = "wireless" | "fibra";
type AlarmCollapseKey = "ajaxProject" | "sensors" | "doorWindowSensors" | "indoorSensors" | "outdoorSensors" | "hub" | QuantityField;
type SensorFilter = {
  tip: string;
  verifikacija: string;
  barva: string;
};

function normalizeName(value: string) {
  return value.toLowerCase();
}

function categoryPriorityRank(product: CenikProduct) {
  return product.categoryPriority ?? 4;
}

function isAjaxAlarmProduct(product: CenikProduct) {
  return product.classification?.productType === "alarm_komponenta" || (product.categorySlugs ?? []).some((slug) => slug === "ajax" || slug === "alarm");
}

export function isAjaxServiceSparePart(product: CenikProduct) {
  return isAjaxAlarmProduct(product) && /\b(case|bracket|holder|battery)\b/i.test(product.ime);
}

function isFibraProduct(product: CenikProduct) {
  return /\bfibra\b/i.test(product.ime);
}

function isHub(product: CenikProduct) {
  return /^ajax hub(2|\b)/i.test(product.ime.trim()) && !/psu|power|battery|bracket|case|\bbp\b/i.test(product.ime);
}

export function isPhotoVerificationSensorName(name: string) {
  return /motioncamera|phod|video/i.test(name);
}

function isSensor(product: CenikProduct) {
  const name = normalizeName(product.ime);
  if (!isAjaxAlarmProduct(product) || isAjaxServiceSparePart(product)) return false;
  if (isHub(product) || /keypad|spacecontrol|siren|fireprotect|leaksprotect|button|relay|socket|wall|frame|cover|doorbell|lifequality/i.test(name)) return false;
  return /motion|doorprotect|glassprotect|combiprotect|curtain|seismo/i.test(name);
}

function isBasicHub(product: CenikProduct) {
  return isHub(product) && !/hub2|hub 2|hybrid|fibra|plus|bp/i.test(product.ime);
}

function isPhotoHub(product: CenikProduct) {
  return isHub(product) && /hub2|hub 2/i.test(product.ime) && !/plus|hybrid|fibra|bp/i.test(product.ime);
}

function isControl(product: CenikProduct) {
  if (!isAjaxAlarmProduct(product) || isAjaxServiceSparePart(product)) return false;
  return /keypad|spacecontrol/i.test(product.ime) || /^ajax button (bl|wh)$/i.test(product.ime.trim());
}

function isSiren(product: CenikProduct) {
  return isAjaxAlarmProduct(product) && !isAjaxServiceSparePart(product) && /siren/i.test(product.ime);
}

function isFireFlood(product: CenikProduct) {
  return isAjaxAlarmProduct(product) && !isAjaxServiceSparePart(product) && /fireprotect|leaksprotect|manualcall/i.test(product.ime);
}

function isSmartHomeModule(product: CenikProduct) {
  const name = normalizeName(product.ime);
  if (!isAjaxAlarmProduct(product) || isAjaxServiceSparePart(product)) return false;
  if (isSensor(product) || isHub(product) || isControl(product) || isSiren(product) || isFireFlood(product)) return false;
  return /button|switch|relay|socket|wall|frame|cover|transmitter|uartbridge|ocbridge|module|power|supply|din|vhfbridge|light|dimmer/i.test(name);
}

function sensorKind(product: CenikProduct) {
  const name = normalizeName(product.ime);
  if (/doorprotect/i.test(name)) return "Magnetni";
  if (/glassprotect/i.test(name)) return "Steklo";
  if (/curtain/i.test(name)) return "Zavesa";
  if (/combiprotect/i.test(name)) return "Kombinirani";
  if (/seismo/i.test(name)) return "Seizmični";
  if (/motion/i.test(name)) return "Gibanje";
  return "Ostalo";
}

function sensorSystem(product: CenikProduct) {
  return isFibraProduct(product) ? "Fibra" : "Ajax";
}

function sensorEnvironment(product: CenikProduct) {
  return /\boutdoor\b/i.test(product.ime) ? "Zunanji" : "Notranji";
}

function isDoorWindowSensor(product: CenikProduct) {
  return /doorprotect|glassprotect/i.test(product.ime);
}

function sensorVerification(product: CenikProduct) {
  return isPhotoVerificationSensorName(product.ime) ? "Photo" : "Brez photo";
}

function sensorColor(product: CenikProduct) {
  if (/\bbl\b/i.test(product.ime)) return "Črna";
  if (/\bwh\b/i.test(product.ime)) return "Bela";
  return "";
}

function sensorMatches(product: CenikProduct, filters: SensorFilter) {
  return (
    (filters.tip === "Vse" || sensorKind(product) === filters.tip) &&
    (filters.verifikacija === "Vse" || sensorVerification(product) === filters.verifikacija) &&
    (filters.barva === "Vse" || sensorColor(product) === filters.barva)
  );
}

function filterOptions(products: CenikProduct[], resolver: (product: CenikProduct) => string) {
  return ["Vse", ...Array.from(new Set(products.map(resolver).filter(Boolean))).sort((a, b) => a.localeCompare(b, "sl"))];
}

function sortProducts(a: CenikProduct, b: CenikProduct) {
  return categoryPriorityRank(a) - categoryPriorityRank(b) || salesCompare(a, b) || a.ime.localeCompare(b.ime, "sl") || a.prodajnaCena - b.prodajnaCena;
}

function selectedQuantity(items: Array<{ productId: string; kolicina: number }>, productId: string) {
  return items.find((item) => item.productId === productId)?.kolicina ?? 0;
}

function productDisplayName(product: CenikProduct) {
  return product.ime.replace(/^ajax\s+/i, "").trim() || product.ime;
}

export function alarmNeedsHub2(alarm: Alarm, productById: Map<string, CenikProduct>) {
  return alarm.senzorji.some((senzor) => {
    const product = productById.get(senzor.senzorProductId);
    return product ? isPhotoVerificationSensorName(product.ime) : false;
  });
}

export function SekcijaAlarmOprema({ alarm, productById, onChange, onAddSenzor }: Props) {
  const [projectMode, setProjectMode] = useState<AlarmProjectMode>("wireless");
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<AlarmCollapseKey, boolean>>>({});
  const [sensorFilters, setSensorFilters] = useState<SensorFilter>({
    tip: "Vse",
    verifikacija: "Vse",
    barva: "Vse",
  });

  const products = useMemo(
    () =>
      Array.from(productById.values())
        .filter(isAjaxAlarmProduct)
        .filter((product) => !isAjaxServiceSparePart(product))
        .filter((product) => projectMode === "fibra" || !isFibraProduct(product)),
    [productById, projectMode],
  );
  const sensors = useMemo(() => products.filter(isSensor).sort(sortProducts), [products]);
  const filteredSensors = useMemo(() => sensors.filter((sensor) => sensorMatches(sensor, sensorFilters)), [sensors, sensorFilters]);
  const doorWindowSensors = useMemo(() => filteredSensors.filter(isDoorWindowSensor), [filteredSensors]);
  const indoorSensors = useMemo(() => filteredSensors.filter((sensor) => !isDoorWindowSensor(sensor) && sensorEnvironment(sensor) === "Notranji"), [filteredSensors]);
  const outdoorSensors = useMemo(() => filteredSensors.filter((sensor) => !isDoorWindowSensor(sensor) && sensorEnvironment(sensor) === "Zunanji"), [filteredSensors]);
  const sensorTipOptions = useMemo(() => filterOptions(sensors, sensorKind), [sensors]);
  const sensorVerifikacijaOptions = useMemo(() => filterOptions(sensors, sensorVerification), [sensors]);
  const sensorBarvaOptions = useMemo(() => filterOptions(sensors, sensorColor), [sensors]);
  const hubs = useMemo(() => products.filter(isHub).sort((a, b) => a.prodajnaCena - b.prodajnaCena), [products]);
  const basicHubs = useMemo(() => products.filter(isBasicHub).sort((a, b) => a.prodajnaCena - b.prodajnaCena), [products]);
  const photoHubs = useMemo(() => products.filter(isPhotoHub).sort((a, b) => a.prodajnaCena - b.prodajnaCena), [products]);
  const controls = useMemo(() => products.filter(isControl).sort(sortProducts), [products]);
  const sirens = useMemo(() => products.filter(isSiren).sort(sortProducts), [products]);
  const fireFlood = useMemo(() => products.filter(isFireFlood).sort(sortProducts), [products]);
  const smartHomeModules = useMemo(() => products.filter(isSmartHomeModule).sort(sortProducts), [products]);
  const needsHub2 = alarmNeedsHub2(alarm, productById);
  const recommendedHub = needsHub2 ? photoHubs[0] : basicHubs[0];

  useEffect(() => {
    if (!recommendedHub || alarm.centrala.productId === recommendedHub._id || alarm.centrala.autoSelected === false) return;
    onChange({ ...alarm, centrala: { productId: recommendedHub._id, autoSelected: true } });
  }, [alarm, onChange, recommendedHub]);

  useEffect(() => {
    const nextFilters = { ...sensorFilters };
    if (!sensorTipOptions.includes(nextFilters.tip)) nextFilters.tip = "Vse";
    if (!sensorVerifikacijaOptions.includes(nextFilters.verifikacija)) nextFilters.verifikacija = "Vse";
    if (!sensorBarvaOptions.includes(nextFilters.barva)) nextFilters.barva = "Vse";
    if (
      nextFilters.tip !== sensorFilters.tip ||
      nextFilters.verifikacija !== sensorFilters.verifikacija ||
      nextFilters.barva !== sensorFilters.barva
    ) {
      setSensorFilters(nextFilters);
    }
  }, [sensorBarvaOptions, sensorFilters, sensorTipOptions, sensorVerifikacijaOptions]);

  const isCollapsed = (key: AlarmCollapseKey) => Boolean(collapsedSections[key]);
  const toggleCollapse = (key: AlarmCollapseKey) => {
    setCollapsedSections((current) => ({ ...current, [key]: !current[key] }));
  };

  const setHub = (productId: string | null) => {
    onChange({ ...alarm, centrala: { productId, autoSelected: false } });
  };

  const setQuantity = (field: QuantityField, productId: string, quantity: number) => {
    const nextQuantity = Math.max(0, Math.min(99, Math.round(quantity)));
    const byId = new Map((alarm[field] ?? []).map((item) => [item.productId, item.kolicina]));
    if (nextQuantity > 0) byId.set(productId, nextQuantity);
    else byId.delete(productId);
    onChange({ ...alarm, [field]: Array.from(byId.entries()).map(([id, kolicina]) => ({ productId: id, kolicina })) });
  };

  const hubOptions = hubs;

  return (
    <>
      <section className="zahteva-subsection">
        <CollapsibleHeader
          icon={<RadioReceiver className="h-4 w-4" aria-hidden />}
          title="Ajax projekt"
          description={projectMode === "wireless" ? "brezžični sistem brez Fibra elementov" : "žični Fibra sistem z vsemi Ajax elementi"}
          collapsed={isCollapsed("ajaxProject")}
          onToggle={() => toggleCollapse("ajaxProject")}
        />
        {!isCollapsed("ajaxProject") ? (
          <div className="zahteva-dialog-filters">
            <FilterStrip
              label="Sistem"
              values={["Ajax brezžični", "Ajax Fibra"]}
              selected={projectMode === "wireless" ? "Ajax brezžični" : "Ajax Fibra"}
              onSelect={(value) => setProjectMode(value === "Ajax Fibra" ? "fibra" : "wireless")}
            />
          </div>
        ) : null}
      </section>

      <section className="zahteva-subsection">
        <CollapsibleHeader
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          title="Senzorji gibanja in varovanja"
          description="najprej dodaj senzorje in jih dodeli lokacijam"
          collapsed={isCollapsed("sensors")}
          onToggle={() => toggleCollapse("sensors")}
        />
        {!isCollapsed("sensors") ? (
          <>
            <div className="zahteva-dialog-filters">
              <FilterStrip label="Tip" values={sensorTipOptions} selected={sensorFilters.tip} onSelect={(tip) => setSensorFilters((current) => ({ ...current, tip }))} />
              <FilterStrip label="Verifikacija" values={sensorVerifikacijaOptions} selected={sensorFilters.verifikacija} onSelect={(verifikacija) => setSensorFilters((current) => ({ ...current, verifikacija }))} />
              <FilterStrip label="Barva" values={sensorBarvaOptions} selected={sensorFilters.barva} onSelect={(barva) => setSensorFilters((current) => ({ ...current, barva }))} />
            </div>
            <SensorProductGroup title="Vrata / okna" products={doorWindowSensors} emptyText="Ni senzorjev za vrata, okna ali steklo za izbrane filtre." collapsed={isCollapsed("doorWindowSensors")} onToggle={() => toggleCollapse("doorWindowSensors")} onAddSenzor={onAddSenzor} />
            <SensorProductGroup title="Notranji senzorji" products={indoorSensors} emptyText="Ni notranjih senzorjev za izbrane filtre." collapsed={isCollapsed("indoorSensors")} onToggle={() => toggleCollapse("indoorSensors")} onAddSenzor={onAddSenzor} />
            <SensorProductGroup title="Zunanji senzorji" products={outdoorSensors} emptyText="Ni zunanjih senzorjev za izbrane filtre." collapsed={isCollapsed("outdoorSensors")} onToggle={() => toggleCollapse("outdoorSensors")} onAddSenzor={onAddSenzor} />
          </>
        ) : null}
      </section>

      <section className="zahteva-subsection">
        <CollapsibleHeader
          icon={<RadioReceiver className="h-4 w-4" aria-hidden />}
          title="Centrala"
          description={needsHub2 ? "photoverifikacija zahteva Hub 2" : "osnovni hub zadošča"}
          collapsed={isCollapsed("hub")}
          onToggle={() => toggleCollapse("hub")}
        />
        {!isCollapsed("hub") ? (
          <div className="zahteva-product-track zahteva-alarm-track">
            {hubOptions.map((product) => (
              <button
                key={product._id}
                type="button"
                className={`zahteva-track-card zahteva-alarm-card ${alarm.centrala.productId === product._id ? "is-active" : ""} ${recommendedHub?._id === product._id ? "is-recommended" : ""}`}
                title={product.ime}
                onClick={() => setHub(product._id)}
              >
                {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
                <strong>{productDisplayName(product)}</strong>
                <small>{recommendedHub?._id === product._id ? "Priporočeno" : "Centrala"}</small>
                <b>{formatPrice(product.prodajnaCena)}</b>
              </button>
            ))}
            {hubOptions.length === 0 ? <div className="zahteva-empty">Ni ustrezne centrale v ceniku.</div> : null}
          </div>
        ) : null}
      </section>

      <QuantitySection
        icon={<Keyboard className="h-4 w-4" aria-hidden />}
        title="Upravljanje"
        products={controls}
        items={alarm.upravljanje}
        collapsed={isCollapsed("upravljanje")}
        onToggle={() => toggleCollapse("upravljanje")}
        onSetQuantity={(productId, quantity) => setQuantity("upravljanje", productId, quantity)}
      />
      <QuantitySection
        icon={<BellRing className="h-4 w-4" aria-hidden />}
        title="Sirene"
        products={sirens}
        items={alarm.sirene}
        collapsed={isCollapsed("sirene")}
        onToggle={() => toggleCollapse("sirene")}
        onSetQuantity={(productId, quantity) => setQuantity("sirene", productId, quantity)}
      />
      <QuantitySection
        icon={<Flame className="h-4 w-4" aria-hidden />}
        title="Požarni / poplavni"
        products={fireFlood}
        items={alarm.pozarPoplava}
        collapsed={isCollapsed("pozarPoplava")}
        onToggle={() => toggleCollapse("pozarPoplava")}
        onSetQuantity={(productId, quantity) => setQuantity("pozarPoplava", productId, quantity)}
      />
      <QuantitySection
        icon={<Package className="h-4 w-4" aria-hidden />}
        title="Pametna stikala / moduli"
        products={smartHomeModules}
        items={alarm.dodatnaOprema ?? []}
        collapsed={isCollapsed("dodatnaOprema")}
        onToggle={() => toggleCollapse("dodatnaOprema")}
        onSetQuantity={(productId, quantity) => setQuantity("dodatnaOprema", productId, quantity)}
      />
    </>
  );
}

function CollapsibleHeader({
  icon,
  title,
  description,
  collapsed,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="zahteva-subsection-title zahteva-collapse-header" aria-expanded={!collapsed} onClick={onToggle}>
      <span className="zahteva-title-main">
        {icon}
        <h4>{title}</h4>
      </span>
      {description ? <small>{description}</small> : null}
      <ChevronDown className={`h-4 w-4 zahteva-collapse-icon ${collapsed ? "is-collapsed" : ""}`} aria-hidden />
    </button>
  );
}

function SensorProductGroup({
  title,
  products,
  emptyText,
  collapsed,
  onToggle,
  onAddSenzor,
}: {
  title: string;
  products: CenikProduct[];
  emptyText: string;
  collapsed: boolean;
  onToggle: () => void;
  onAddSenzor: (product: CenikProduct) => void;
}) {
  return (
    <>
      <button type="button" className="zahteva-sensor-group-title zahteva-sensor-collapse" aria-expanded={!collapsed} onClick={onToggle}>
        <span>{title}</span>
        <ChevronDown className={`h-4 w-4 zahteva-collapse-icon ${collapsed ? "is-collapsed" : ""}`} aria-hidden />
      </button>
      {!collapsed ? (
        <div className="zahteva-product-track zahteva-alarm-track">
          {products.map((product) => (
            <button key={product._id} type="button" className="zahteva-track-card zahteva-alarm-card" title={product.ime} onClick={() => onAddSenzor(product)}>
              {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
              <strong>{productDisplayName(product)}</strong>
              <small>
                {sensorKind(product)} • {sensorSystem(product)} • {sensorEnvironment(product)}
                {isPhotoVerificationSensorName(product.ime) ? " • photo" : ""}
                {sensorColor(product) ? ` • ${sensorColor(product)}` : ""}
              </small>
              {product._id === topSellerId(products) ? <span className="zahteva-sales-hint">★ najpogosteje izbrano</span> : null}
              <b>{formatPrice(product.prodajnaCena)}</b>
              <span className="zahteva-card-action">
                <Plus className="h-3 w-3" aria-hidden />
                Dodaj
              </span>
            </button>
          ))}
          {products.length === 0 ? <div className="zahteva-empty">{emptyText}</div> : null}
        </div>
      ) : null}
    </>
  );
}

function QuantitySection({
  icon,
  title,
  products,
  items,
  collapsed,
  onToggle,
  onSetQuantity,
}: {
  icon: ReactNode;
  title: string;
  products: CenikProduct[];
  items: Array<{ productId: string; kolicina: number }>;
  collapsed: boolean;
  onToggle: () => void;
  onSetQuantity: (productId: string, quantity: number) => void;
}) {
  return (
    <section className="zahteva-subsection">
      <CollapsibleHeader icon={icon} title={title} collapsed={collapsed} onToggle={onToggle} />
      {!collapsed ? (
        <div className="zahteva-product-track zahteva-alarm-track">
          {products.map((product) => {
            const quantity = selectedQuantity(items, product._id);
            return (
              <div key={product._id} className={`zahteva-track-card zahteva-alarm-card ${quantity > 0 ? "is-active" : ""}`} title={product.ime}>
                <button type="button" className="zahteva-track-main" onClick={() => onSetQuantity(product._id, quantity > 0 ? quantity : 1)}>
                  {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
                  <strong>{productDisplayName(product)}</strong>
                  <small>{title}</small>
                  <b>{formatPrice(product.prodajnaCena)}</b>
                </button>
                <div className="zahteva-qty-control">
                  <button type="button" onClick={() => onSetQuantity(product._id, quantity - 1)} aria-label={`Zmanjšaj ${product.ime}`}>-</button>
                  <span>{quantity}</span>
                  <button type="button" onClick={() => onSetQuantity(product._id, quantity + 1)} aria-label={`Povečaj ${product.ime}`}>+</button>
                </div>
              </div>
            );
          })}
          {products.length === 0 ? <div className="zahteva-empty">Ni izdelkov za ta sklop.</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function FilterStrip({ label, values, selected, onSelect }: { label: string; values: string[]; selected: string; onSelect: (value: string) => void }) {
  return (
    <div className="zahteva-filter-row">
      <span>{label}</span>
      <div>
        {values.map((value) => (
          <button key={value} type="button" className={selected === value ? "is-active" : ""} onClick={() => onSelect(value)}>
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}
