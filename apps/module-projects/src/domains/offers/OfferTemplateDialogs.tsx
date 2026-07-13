import { Loader2 } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

type OfferTemplateDialogsProps = {
  nameDialogOpen: boolean;
  onNameDialogOpenChange: (open: boolean) => void;
  deleteDialogOpen: boolean;
  onDeleteDialogOpenChange: (open: boolean) => void;
  mode: "create" | "rename";
  nameDraft: string;
  onNameDraftChange: (value: string) => void;
  vatModeDraft: 0 | 9.5 | 22;
  onVatModeDraftChange: (value: 0 | 9.5 | 22) => void;
  applyGlobalDiscount: boolean;
  onApplyGlobalDiscountChange: (checked: boolean) => void;
  applyPerItemDiscount: boolean;
  onApplyPerItemDiscountChange: (checked: boolean) => void;
  globalDiscountDraft: string;
  onGlobalDiscountDraftChange: (value: string) => void;
  saving: boolean;
  deleting: boolean;
  onSubmit: () => void;
  onConfirmDelete: () => void;
};

export function OfferTemplateDialogs({
  nameDialogOpen,
  onNameDialogOpenChange,
  deleteDialogOpen,
  onDeleteDialogOpenChange,
  mode,
  nameDraft,
  onNameDraftChange,
  vatModeDraft,
  onVatModeDraftChange,
  applyGlobalDiscount,
  onApplyGlobalDiscountChange,
  applyPerItemDiscount,
  onApplyPerItemDiscountChange,
  globalDiscountDraft,
  onGlobalDiscountDraftChange,
  saving,
  deleting,
  onSubmit,
  onConfirmDelete,
}: OfferTemplateDialogsProps) {
  return (
    <>
      <Dialog open={nameDialogOpen} onOpenChange={onNameDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Shrani template" : "Preimenuj template"}</DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Vnesi ime, pod katerim bo template viden v globalnem seznamu."
                : "Posodobi ime izbranega template-a."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ime template-a</label>
              <Input
                value={nameDraft}
                onChange={(event) => onNameDraftChange(event.target.value)}
                placeholder="npr. Standardna alarm ponudba"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">DDV način</label>
              <Select
                value={String(vatModeDraft)}
                onValueChange={(value) => onVatModeDraftChange(Number(value) as 0 | 9.5 | 22)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="22">22 %</SelectItem>
                  <SelectItem value="9.5">9,5 %</SelectItem>
                  <SelectItem value="0">0 % (76. člen)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Popust na celotno ponudbo</label>
                  <p className="text-xs text-muted-foreground">
                    Če je izklopljen, trenutni globalni popust v ponudbi ostane nespremenjen.
                  </p>
                </div>
                <Checkbox
                  checked={applyGlobalDiscount}
                  onChange={(event) => onApplyGlobalDiscountChange(event.target.checked)}
                />
              </div>
              {applyGlobalDiscount && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600">Vrednost popusta (%)</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={globalDiscountDraft}
                    onChange={(event) => onGlobalDiscountDraftChange(event.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Popust po produktih</label>
                  <p className="text-xs text-muted-foreground">
                    Če je izklopljen, item discounti v trenutni ponudbi ostanejo takšni kot so.
                  </p>
                </div>
                <Checkbox
                  checked={applyPerItemDiscount}
                  onChange={(event) => onApplyPerItemDiscountChange(event.target.checked)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onNameDialogOpenChange(false)}>
              Prekliči
            </Button>
            <Button onClick={onSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Shrani
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={onDeleteDialogOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Izbriši template</DialogTitle>
            <DialogDescription>
              Ali ste prepričani, da želite izbrisati ta template?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onDeleteDialogOpenChange(false)}>
              Prekliči
            </Button>
            <Button variant="destructive" onClick={onConfirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Izbriši
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
