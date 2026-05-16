import { HardDrive } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchPredlogDisk, getProductImageUrl, type CenikProduct } from "../../api";
import type { Videonadzor } from "./utils";
import { assignedCameraProducts, calculateDvcStorage, formatPrice } from "./utils";

type Props = {
  videonadzor: Videonadzor;
  productById: Map<string, CenikProduct>;
  onChange: (next: Videonadzor) => void;
};

function recordingDaysForDisk(capacityTB: number | undefined, totalMbps: number, cameraCount: number) {
  if (!capacityTB || !totalMbps || cameraCount <= 0) return null;
  return Math.max(1, Math.round((capacityTB * 1024) / (totalMbps * 0.4395 * 24)));
}

export function SekcijaDisk({ videonadzor, productById, onChange }: Props) {
  const cameras = useMemo(() => assignedCameraProducts(videonadzor, productById), [productById, videonadzor]);
  const cameraIds = useMemo(() => cameras.map((camera) => camera._id), [cameras]);
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
        .filter((product) => (product.classification?.diskCapacityTB ?? 0) >= storage.recommendedDiskTB)
        .sort((a, b) => (a.classification?.diskCapacityTB ?? 0) - (b.classification?.diskCapacityTB ?? 0) || a.prodajnaCena - b.prodajnaCena)
        .slice(0, 6),
    [productById, storage.recommendedDiskTB],
  );

  useEffect(() => {
    const suggested = serverSuggestion?.productId ? productById.get(serverSuggestion.productId) : null;
    const selected = suggested ?? alternatives[0];
    if (!selected || videonadzor.disk.productId) return;
    const signature = `${storage.recommendedDiskTB}|${selected._id}`;
    if (autoAppliedRef.current === signature) return;
    autoAppliedRef.current = signature;
    onChange({ ...videonadzor, disk: { ...videonadzor.disk, productId: selected._id } });
  }, [alternatives, onChange, productById, serverSuggestion?.productId, storage.recommendedDiskTB, videonadzor]);

  return (
    <section className="zahteva-subsection">
      <div className="zahteva-subsection-title">
        <HardDrive className="h-4 w-4" aria-hidden />
        <h4>Disk</h4>
        <small>dni: {videonadzor.disk.dniSnemanja}</small>
      </div>
      <div className="zahteva-disk-controls">
        <input
          type="range"
          min={7}
          max={90}
          value={videonadzor.disk.dniSnemanja}
          onChange={(event) => onChange({ ...videonadzor, disk: { ...videonadzor.disk, dniSnemanja: Number(event.target.value) } })}
          aria-label="Dni snemanja"
        />
        <label>
          <input
            type="checkbox"
            checked={videonadzor.disk.motionRecord}
            onChange={(event) => onChange({ ...videonadzor, disk: { ...videonadzor.disk, motionRecord: event.target.checked } })}
          />
          motion
        </label>
        <span>{storage.requiredTB} TB, predlog {storage.recommendedDiskTB} TB</span>
      </div>
      <div className="zahteva-product-track">
        {alternatives.map((product, index) => {
          const days = recordingDaysForDisk(product.classification?.diskCapacityTB, storage.totalMbps, cameras.length);
          return (
            <button
              key={product._id}
              type="button"
              className={`zahteva-track-card ${videonadzor.disk.productId === product._id ? "is-active" : ""} ${index === 0 ? "is-recommended" : ""}`}
              onClick={() => onChange({ ...videonadzor, disk: { ...videonadzor.disk, productId: product._id } })}
            >
              {getProductImageUrl(product) ? <img src={getProductImageUrl(product)} alt="" /> : <span className="zahteva-image-empty" />}
              <strong>{product.ime}</strong>
              <small>{product.classification?.diskCapacityTB ?? "-"} TB</small>
              <b>{formatPrice(product.prodajnaCena)}</b>
              {days ? <span className="zahteva-disk-days">{days} dni za {cameras.length} kam</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
