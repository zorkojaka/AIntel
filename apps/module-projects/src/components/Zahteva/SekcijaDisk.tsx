import { HardDrive } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPredlogDisk, getProductImageUrl, type CenikProduct } from "../../api";
import type { Videonadzor } from "./utils";
import { assignedCameraProducts, calculateDvcStorage, formatPrice, normalizedSelectedItems } from "./utils";

type Props = {
  videonadzor: Videonadzor;
  productById: Map<string, CenikProduct>;
  onChange: (next: Videonadzor) => void;
};

function recordingDaysForCapacity(capacityTB: number, totalMbps: number, cameraCount: number) {
  if (!capacityTB || !totalMbps || cameraCount <= 0) return null;
  return Math.max(1, Math.round((capacityTB * 1024) / (totalMbps * 0.4395 * 24)));
}

function syncPrimary<T extends { productId: string; kolicina: number }>(items: T[]) {
  const first = items.find((item) => item.kolicina > 0);
  return { productId: first?.productId ?? null, kolicina: first?.kolicina ?? 0, items };
}

export function SekcijaDisk({ videonadzor, productById, onChange }: Props) {
  const cameras = useMemo(() => assignedCameraProducts(videonadzor, productById), [productById, videonadzor]);
  const cameraIds = useMemo(() => cameras.map((camera) => camera._id), [cameras]);
  const selectedNvr = videonadzor.snemalnik.productId ? productById.get(videonadzor.snemalnik.productId) : null;
  const hddSlots = Math.max(1, Number(selectedNvr?.classification?.nvrHddSlots ?? 1) || 1);
  const selectedItems = normalizedSelectedItems(videonadzor.disk);
  const selectedDiskCount = selectedItems.reduce((sum, item) => sum + item.kolicina, 0);
  const localStorage = useMemo(
    () => calculateDvcStorage(cameras, videonadzor.disk.dniSnemanja || 30, videonadzor.disk.motionRecord),
    [cameras, videonadzor.disk.dniSnemanja, videonadzor.disk.motionRecord],
  );
  const [serverSuggestion, setServerSuggestion] = useState<{
    storage: { requiredTB: number; recommendedDiskTB: number; totalMbps: number };
    productId?: string | null;
  } | null>(null);
  const storage = serverSuggestion?.storage ?? localStorage;
  const autoAppliedRef = useRef("");

  useEffect(() => {
    if (cameraIds.length === 0) {
      setServerSuggestion(null);
      return;
    }

    let cancelled = false;
    fetchPredlogDisk({
      cameraIds,
      dni: videonadzor.disk.dniSnemanja || 30,
      motionRecord: videonadzor.disk.motionRecord,
    })
      .then((result) => {
        if (cancelled) return;
        if (result && typeof result === "object" && "storage" in result) {
          setServerSuggestion({ storage: result.storage, productId: result.product?._id ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) setServerSuggestion(null);
      });

    return () => {
      cancelled = true;
    };
  }, [cameraIds, videonadzor.disk.dniSnemanja, videonadzor.disk.motionRecord]);

  const alternatives = useMemo(
    () =>
      Array.from(productById.values())
        .filter((product) => product.classification?.productType === "disk")
        .filter((product) => product.classification?.isSurveillanceDisk !== false)
        .sort((a, b) => (a.classification?.diskCapacityTB ?? 0) - (b.classification?.diskCapacityTB ?? 0) || a.prodajnaCena - b.prodajnaCena)
        .slice(0, 8),
    [productById],
  );

  useEffect(() => {
    const suggested = serverSuggestion?.productId ? productById.get(serverSuggestion.productId) : null;
    const selected = suggested ?? alternatives.find((product) => (product.classification?.diskCapacityTB ?? 0) >= storage.recommendedDiskTB) ?? alternatives[0];
    if (!selected || selectedItems.length > 0) return;
    const signature = `${storage.recommendedDiskTB}|${selected._id}`;
    if (autoAppliedRef.current === signature) return;
    autoAppliedRef.current = signature;
    onChange({ ...videonadzor, disk: { ...videonadzor.disk, ...syncPrimary([{ productId: selected._id, kolicina: 1 }]) } });
  }, [alternatives, onChange, productById, selectedItems.length, serverSuggestion?.productId, storage.recommendedDiskTB, videonadzor]);

  const setQuantity = (productId: string, quantity: number) => {
    const nextQuantity = Math.max(0, Math.min(99, Math.round(quantity)));
    const byId = new Map(selectedItems.map((item) => [item.productId, item.kolicina]));
    if (nextQuantity > 0) byId.set(productId, nextQuantity);
    else byId.delete(productId);
    const items = Array.from(byId.entries()).map(([id, kolicina]) => ({ productId: id, kolicina }));
    onChange({ ...videonadzor, disk: { ...videonadzor.disk, ...syncPrimary(items) } });
  };

  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        <HardDrive className="h-4 w-4" aria-hidden />
        <h4>Disk</h4>
      </div>
      <div className="zahteva-recording-row">
        <span>Snemanje:</span>
        <input
          type="range"
          min={7}
          max={90}
          value={videonadzor.disk.dniSnemanja}
          onChange={(event) => onChange({ ...videonadzor, disk: { ...videonadzor.disk, dniSnemanja: Number(event.target.value) } })}
          aria-label="Dni snemanja"
        />
        <strong>{videonadzor.disk.dniSnemanja} dni</strong>
        <label>
          <input
            type="checkbox"
            checked={videonadzor.disk.motionRecord}
            onChange={(event) => onChange({ ...videonadzor, disk: { ...videonadzor.disk, motionRecord: event.target.checked } })}
          />
          samo motion
        </label>
      </div>
      <div className="zahteva-storage-note">Potrebno: {storage.requiredTB} TB (predlog {storage.recommendedDiskTB}TB disk)</div>
      <div className={`zahteva-capacity-note ${selectedDiskCount <= hddSlots ? "is-ok" : "is-warning"}`}>
        Snemalnik ima {hddSlots} disk {hddSlots === 1 ? "slot" : "slota"} • izbrano {selectedDiskCount} {selectedDiskCount <= hddSlots ? "✓" : "⚠"}
      </div>
      <div className="zahteva-product-track">
        {alternatives.map((product) => {
          const quantity = selectedItems.find((item) => item.productId === product._id)?.kolicina ?? 0;
          const displayQuantity = quantity > 0 ? quantity : 1;
          const totalCapacity = (product.classification?.diskCapacityTB ?? 0) * displayQuantity;
          const days = recordingDaysForCapacity(totalCapacity, storage.totalMbps, cameras.length);
          const recommended = (product.classification?.diskCapacityTB ?? 0) >= storage.recommendedDiskTB;
          return (
            <div key={product._id} className={`zahteva-track-card ${quantity > 0 ? "is-active" : ""} ${recommended ? "is-recommended" : ""}`}>
              <button type="button" className="zahteva-track-main" onClick={() => setQuantity(product._id, quantity > 0 ? quantity : 1)}>
                {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
                <strong>{product.ime}</strong>
                <small>{product.classification?.diskCapacityTB ?? "-"} TB</small>
                <b>{formatPrice(product.prodajnaCena)}</b>
                <span className="zahteva-disk-days">{days ? `${days} dni za ${cameras.length} kam` : "—"}</span>
              </button>
              <div className="zahteva-qty-control">
                <button type="button" onClick={() => setQuantity(product._id, quantity - 1)} aria-label={`Zmanjšaj ${product.ime}`}>−</button>
                <span>{quantity}</span>
                <button type="button" onClick={() => setQuantity(product._id, quantity + 1)} aria-label={`Povečaj ${product.ime}`}>+</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
