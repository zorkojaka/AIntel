import { Loader2 } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Textarea } from "../../components/ui/textarea";
import { PriceListProductAutocomplete } from "../../components/PriceListProductAutocomplete";
import { resolveImportRowProduct, type OfferImportRow } from "./offerEditorUtils";

type OfferImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawText: string;
  onRawTextChange: (value: string) => void;
  rows: OfferImportRow[];
  loading: boolean;
  error: string;
  showMappingHint: boolean;
  matchedCount: number;
  needsReviewCount: number;
  invalidCount: number;
  onParse: () => void;
  onApply: () => void;
  onUpdateRow: (rowIndex: number, changes: Partial<OfferImportRow>) => void;
};

export function OfferImportDialog({
  open,
  onOpenChange,
  rawText,
  onRawTextChange,
  rows,
  loading,
  error,
  showMappingHint,
  matchedCount,
  needsReviewCount,
  invalidCount,
  onParse,
  onApply,
  onUpdateRow,
}: OfferImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Uvozi ponudbo</DialogTitle>
          <DialogDescription>Prilepi tabelo iz Google Sheets (TSV/CSV) in preveri ujemanja s cenikom.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium">Prilepi tabelo</label>
          <Textarea
            value={rawText}
            onChange={(event) => onRawTextChange(event.target.value)}
            rows={8}
            placeholder={"Naziv\t9.5%\t1"}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Delimiter: samodejno zaznano (prednost ima tabulator).</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onParse}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Analiziraj tabelo
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {showMappingHint && (
            <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
              Namig mapiranja: naziv = prvi besedilni stolpec, DDV (%) se ignorira, kolicina = zadnji numericni stolpec.
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Matched: {matchedCount}</Badge>
              <Badge className="bg-amber-500 text-white hover:bg-amber-500">Needs review: {needsReviewCount}</Badge>
              <Badge className="bg-slate-600 text-white hover:bg-slate-600">Invalid: {invalidCount}</Badge>
            </div>

            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">Vrstica</TableHead>
                    <TableHead>Naziv iz paste</TableHead>
                    <TableHead className="w-[120px] text-right">Kolicina</TableHead>
                    <TableHead className="w-[180px]">Status</TableHead>
                    <TableHead>Izbira produkta</TableHead>
                    <TableHead className="w-[120px] text-right">Cena</TableHead>
                    <TableHead className="w-[120px] text-right">Akcija</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const resolvedProduct = resolveImportRowProduct(row);
                    const candidateOptions = (row.matchCandidates?.length ? row.matchCandidates : row.matches) ?? [];
                    const isSkipped = Boolean(row.skipped);
                    return (
                      <TableRow key={row.rowIndex} className={isSkipped ? "opacity-60" : ""}>
                        <TableCell>{row.rowIndex}</TableCell>
                        <TableCell className="align-top">
                          <div className="break-words">{row.rawName || "-"}</div>
                        </TableCell>
                        <TableCell className="text-right">{row.qty}</TableCell>
                        <TableCell>
                          {row.status === "matched" && (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Matched</Badge>
                          )}
                          {row.status === "needs_review" && (
                            <Badge className="bg-amber-500 text-white hover:bg-amber-500">Needs review</Badge>
                          )}
                          {(row.status === "not_found" || row.status === "invalid") && (
                            <Badge className="bg-slate-600 text-white hover:bg-slate-600">Invalid</Badge>
                          )}
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.chosenReason ?? "n/a"}{" "}
                            {typeof row.matchScore === "number" ? row.matchScore.toFixed(2) : "0.00"}
                          </div>
                        </TableCell>
                        <TableCell className="space-y-2">
                          {candidateOptions.length > 0 ? (
                            <Select
                              value={row.chosenProductId ?? "__none"}
                              onValueChange={(value) => {
                                onUpdateRow(row.rowIndex, {
                                  chosenProductId: value === "__none" ? undefined : value,
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Izberi produkt" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">Brez izbire</SelectItem>
                                {candidateOptions.map((match) => (
                                  <SelectItem key={match.productId} value={match.productId}>
                                    {match.displayName ?? match.ime}
                                    {typeof match.score === "number" ? ` (${match.score.toFixed(3)})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                          {(row.status === "not_found" || row.status === "needs_review") && (
                            <PriceListProductAutocomplete
                              value={row.manualMatch?.ime ?? row.rawName}
                              placeholder="Rocno poisci v ceniku"
                              onChange={(name) => {
                                onUpdateRow(row.rowIndex, { rawName: name });
                              }}
                              onProductSelected={(product) => {
                                onUpdateRow(row.rowIndex, {
                                  chosenProductId: product.id,
                                  manualMatch: {
                                    productId: product.id,
                                    ime: product.name,
                                    prodajnaCena: product.unitPrice,
                                    isService: product.unit === "ura",
                                  },
                                });
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {resolvedProduct
                            ? `${Number(resolvedProduct.prodajnaCena).toLocaleString("sl-SI", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })} €`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant={isSkipped ? "secondary" : "outline"}
                            onClick={() => onUpdateRow(row.rowIndex, { skipped: !isSkipped })}
                          >
                            {isSkipped ? "Vrni" : "Odstrani"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zapri
          </Button>
          <Button
            onClick={onApply}
            disabled={rows.length === 0 || loading}
          >
            Uvozi v ponudbo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
