import { BellRing, Flame, Keyboard, Plus, RadioReceiver, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { getProductImageUrl, type CenikProduct } from "../../api";
import type { Alarm } from "./utils";
import { formatPrice } from "./utils";

type Props = {
  alarm: Alarm;
  productById: Map<string, CenikProduct>;
  onChange: (next: Alarm) => void;
  onAddSenzor: (product: CenikProduct) => void;
};

type QuantityField = "upravljanje" | "sirene" | "pozarPoplava";

function normalizeName(value: string) {
  return value.toLowerCase();
}

function categoryPriorityRank(product: CenikProduct) {
  return product.categoryPriority ?? 4;
}

function isAjaxAlarmProduct(product: CenikProduct) {
  return product.classification?.productType === "alarm_komponenta" || (product.categorySlugs ?? []).some((slug) => slug === "ajax" || slug === "alarm");
}

function isHub(product: CenikProduct) {
  return /\bhub\b/i.test(product.ime);
}

export function isPhotoVerificationSensorName(name: string) {
  return /motioncamera|phod|video/i.test(name);
}

function isSensor(product: CenikProduct) {
  const name = normalizeName(product.ime);
  if (!isAjaxAlarmProduct(product)) return false;
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
  return isAjaxAlarmProduct(product) && /keypad|spacecontrol|button|doublebutton/i.test(product.ime);
}

function isSiren(product: CenikProduct) {
  return isAjaxAlarmProduct(product) && /siren/i.test(product.ime);
}

function isFireFlood(product: CenikProduct) {
  return isAjaxAlarmProduct(product) && /fireprotect|leaksprotect|manualcall/i.test(product.ime);
}

function sortProducts(a: CenikProduct, b: CenikProduct) {
  return categoryPriorityRank(a) - categoryPriorityRank(b) || a.ime.localeCompare(b.ime, "sl") || a.prodajnaCena - b.prodajnaCena;
}

function selectedQuantity(items: Array<{ productId: string; kolicina: number }>, productId: string) {
  return items.find((item) => item.productId === productId)?.kolicina ?? 0;
}

export function alarmNeedsHub2(alarm: Alarm, productById: Map<string, CenikProduct>) {
  return alarm.senzorji.some((senzor) => {
    const product = productById.get(senzor.senzorProductId);
    return product ? isPhotoVerificationSensorName(product.ime) : false;
  });
}

export function SekcijaAlarmOprema({ alarm, productById, onChange, onAddSenzor }: Props) {
  const products = useMemo(() => Array.from(productById.values()).filter(isAjaxAlarmProduct), [productById]);
  const sensors = useMemo(() => products.filter(isSensor).sort(sortProducts), [products]);
  const basicHubs = useMemo(() => products.filter(isBasicHub).sort((a, b) => a.prodajnaCena - b.prodajnaCena), [products]);
  const photoHubs = useMemo(() => products.filter(isPhotoHub).sort((a, b) => a.prodajnaCena - b.prodajnaCena), [products]);
  const controls = useMemo(() => products.filter(isControl).sort(sortProducts), [products]);
  const sirens = useMemo(() => products.filter(isSiren).sort(sortProducts), [products]);
  const fireFlood = useMemo(() => products.filter(isFireFlood).sort(sortProducts), [products]);
  const needsHub2 = alarmNeedsHub2(alarm, productById);
  const recommendedHub = needsHub2 ? photoHubs[0] : basicHubs[0];

  useEffect(() => {
    if (!recommendedHub || alarm.centrala.productId === recommendedHub._id || alarm.centrala.autoSelected === false) return;
    onChange({ ...alarm, centrala: { productId: recommendedHub._id, autoSelected: true } });
  }, [alarm, onChange, recommendedHub]);

  const setHub = (productId: string | null) => {
    onChange({ ...alarm, centrala: { productId, autoSelected: false } });
  };

  const setQuantity = (field: QuantityField, productId: string, quantity: number) => {
    const nextQuantity = Math.max(0, Math.min(99, Math.round(quantity)));
    const byId = new Map(alarm[field].map((item) => [item.productId, item.kolicina]));
    if (nextQuantity > 0) byId.set(productId, nextQuantity);
    else byId.delete(productId);
    onChange({ ...alarm, [field]: Array.from(byId.entries()).map(([id, kolicina]) => ({ productId: id, kolicina })) });
  };

  const hubOptions = needsHub2 ? photoHubs : basicHubs;

  return (
    <>
      <section className="zahteva-subsection">
        <div className="zahteva-subsection-title">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          <h4>Senzorji</h4>
          <small>najprej dodaj senzorje in jih dodeli lokacijam</small>
        </div>
        <div className="zahteva-product-track">
          {sensors.map((product) => (
            <button key={product._id} type="button" className="zahteva-track-card" onClick={() => onAddSenzor(product)}>
              {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
              <strong>{product.ime}</strong>
              <small>{isPhotoVerificationSensorName(product.ime) ? "Photoverifikacija" : "Senzor"}</small>
              <b>{formatPrice(product.prodajnaCena)}</b>
              <span className="zahteva-card-action">
                <Plus className="h-3 w-3" aria-hidden />
                Dodaj
              </span>
            </button>
          ))}
          {sensors.length === 0 ? <div className="zahteva-empty">Ni alarmnih senzorjev v ceniku.</div> : null}
        </div>
      </section>

      <section className="zahteva-subsection">
        <div className="zahteva-subsection-title">
          <RadioReceiver className="h-4 w-4" aria-hidden />
          <h4>Centrala</h4>
          <small>{needsHub2 ? "photoverifikacija zahteva Hub 2" : "osnovni hub zadošča"}</small>
        </div>
        <div className="zahteva-product-track">
          {hubOptions.map((product) => (
            <button
              key={product._id}
              type="button"
              className={`zahteva-track-card ${alarm.centrala.productId === product._id ? "is-active" : ""} ${recommendedHub?._id === product._id ? "is-recommended" : ""}`}
              onClick={() => setHub(product._id)}
            >
              {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
              <strong>{product.ime}</strong>
              <small>{recommendedHub?._id === product._id ? "Priporočeno" : "Centrala"}</small>
              <b>{formatPrice(product.prodajnaCena)}</b>
            </button>
          ))}
          {hubOptions.length === 0 ? <div className="zahteva-empty">Ni ustrezne centrale v ceniku.</div> : null}
        </div>
      </section>

      <QuantitySection icon={<Keyboard className="h-4 w-4" aria-hidden />} title="Upravljanje" products={controls} items={alarm.upravljanje} onSetQuantity={(productId, quantity) => setQuantity("upravljanje", productId, quantity)} />
      <QuantitySection icon={<BellRing className="h-4 w-4" aria-hidden />} title="Sirene" products={sirens} items={alarm.sirene} onSetQuantity={(productId, quantity) => setQuantity("sirene", productId, quantity)} />
      <QuantitySection icon={<Flame className="h-4 w-4" aria-hidden />} title="Požarni / poplavni" products={fireFlood} items={alarm.pozarPoplava} onSetQuantity={(productId, quantity) => setQuantity("pozarPoplava", productId, quantity)} />
    </>
  );
}

function QuantitySection({
  icon,
  title,
  products,
  items,
  onSetQuantity,
}: {
  icon: ReactNode;
  title: string;
  products: CenikProduct[];
  items: Array<{ productId: string; kolicina: number }>;
  onSetQuantity: (productId: string, quantity: number) => void;
}) {
  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        {icon}
        <h4>{title}</h4>
      </div>
      <div className="zahteva-product-track">
        {products.map((product) => {
          const quantity = selectedQuantity(items, product._id);
          return (
            <div key={product._id} className={`zahteva-track-card ${quantity > 0 ? "is-active" : ""}`}>
              <button type="button" className="zahteva-track-main" onClick={() => onSetQuantity(product._id, quantity > 0 ? quantity : 1)}>
                {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
                <strong>{product.ime}</strong>
                <small>{title}</small>
                <b>{formatPrice(product.prodajnaCena)}</b>
              </button>
              <div className="zahteva-qty-control">
                <button type="button" onClick={() => onSetQuantity(product._id, quantity - 1)} aria-label={`Zmanjšaj ${product.ime}`}>−</button>
                <span>{quantity}</span>
                <button type="button" onClick={() => onSetQuantity(product._id, quantity + 1)} aria-label={`Povečaj ${product.ime}`}>+</button>
              </div>
            </div>
          );
        })}
        {products.length === 0 ? <div className="zahteva-empty">Ni izdelkov za ta sklop.</div> : null}
      </div>
    </section>
  );
}
