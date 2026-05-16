import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { fetchKompatibilniNosilci, getProductImageUrl, type CenikProduct } from "../../../api";

type IzberiNosilecDialogProps = {
  camera: CenikProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (nosilec: CenikProduct | null) => void;
};

function formatPrice(value: number | undefined) {
  return `${Number(value ?? 0).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function IzberiNosilecDialog({ camera, open, onOpenChange, onConfirm }: IzberiNosilecDialogProps) {
  const [nosilci, setNosilci] = useState<CenikProduct[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!open || !camera?._id) return;
    setLoading(true);
    fetchKompatibilniNosilci(camera._id)
      .then((items) => {
        if (cancelled) return;
        setNosilci(items);
        setSelectedId(items[0]?._id ?? null);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Nosilcev ni mogoče pridobiti.");
          setNosilci([]);
          setSelectedId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [camera?._id, open]);

  const selectedNosilec = useMemo(
    () => (selectedId ? nosilci.find((nosilec) => nosilec._id === selectedId) ?? null : null),
    [nosilci, selectedId]
  );
  const total = Number(camera?.prodajnaCena ?? 0) + Number(selectedNosilec?.prodajnaCena ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Izberi nosilec</DialogTitle>
          <DialogDescription>
            {camera ? `${camera.ime} - ${formatPrice(camera.prodajnaCena)}` : "Izberi kompatibilni nosilec."}
          </DialogDescription>
        </DialogHeader>

        {camera ? (
          <div className="space-y-4">
            <div className="request-dialog-product">
              {getProductImageUrl(camera) ? (
                <img src={getProductImageUrl(camera)} alt="" className="request-dialog-product__image" />
              ) : (
                <div className="request-dialog-product__image request-product-image--empty" />
              )}
              <div className="min-w-0">
                <h3>{camera.ime}</h3>
                <p className="text-sm text-muted-foreground">
                  {camera.classification?.maxResolutionMP ? `${camera.classification.maxResolutionMP}MP` : "Kamera"}
                  {camera.classification?.cameraHousing ? ` • ${camera.classification.cameraHousing}` : ""}
                  {camera.classification?.irRangeM ? ` • IR ${camera.classification.irRangeM}m` : ""}
                  {camera.classification?.hasPoE ? " • PoE" : ""}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Izberi nosilec</div>
              {loading ? <div className="request-empty-state">Nalaganje nosilcev...</div> : null}
              {!loading && nosilci.length === 0 ? (
                <div className="request-empty-state">Ni najdenih kompatibilnih nosilcev. Lahko izbereš brez nosilca.</div>
              ) : null}
              {nosilci.map((nosilec, index) => (
                <label key={nosilec._id} className="request-radio-row">
                  <input
                    type="radio"
                    name="nosilec"
                    checked={selectedId === nosilec._id}
                    onChange={() => setSelectedId(nosilec._id)}
                  />
                  {getProductImageUrl(nosilec) ? (
                    <img src={getProductImageUrl(nosilec)} alt="" className="request-radio-image" />
                  ) : (
                    <span className="request-radio-image request-product-image--empty" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{nosilec.ime}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatPrice(nosilec.prodajnaCena)}
                      {index === 0 ? " (priv)" : ""}
                    </span>
                  </span>
                </label>
              ))}
              <label className="request-radio-row">
                <input
                  type="radio"
                  name="nosilec"
                  checked={selectedId === null}
                  onChange={() => setSelectedId(null)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Brez nosilca</span>
                  <span className="text-xs text-muted-foreground">0,00 €</span>
                </span>
              </label>
            </div>

            <div className="request-dialog-total">
              {camera.ime} {selectedNosilec ? `+ ${selectedNosilec.ime}` : "+ brez nosilca"} = {formatPrice(total)}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Prekliči</Button>
          <Button onClick={() => onConfirm(selectedNosilec)} disabled={!camera}>Dodaj v košarico</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
