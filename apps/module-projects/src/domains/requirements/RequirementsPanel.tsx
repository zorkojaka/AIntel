import type { Dispatch, SetStateAction } from "react";
import { Card } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { OfferCandidate, ProjectDetails } from "../../types";
import type { ProjectRequirement } from "@aintel/shared/types/project";
import { ValidationBanner } from "../core/ValidationBanner";
import { Loader2 } from "lucide-react";

export type RequirementRow = ProjectRequirement;

interface RequirementsPanelProps {
  project: ProjectDetails;
  validationIssues: string[];
  showVariantWizard: boolean;
  selectedVariantSlug: string;
  setSelectedVariantSlug: (value: string) => void;
  variantOptions: { variantSlug: string; label: string }[];
  variantLoading: boolean;
  onConfirmVariantSelection: () => void;
  requirementsText: string;
  setRequirementsText: (value: string) => void;
  requirements: RequirementRow[];
  updateRequirementRow: (id: string, changes: Partial<RequirementRow>) => void;
  deleteRequirementRow: (id: string) => void;
  addRequirementRow: () => void;
  onSaveRequirements: () => Promise<void> | void;
  canSaveRequirements: boolean;
  savingRequirements: boolean;
  proceedingToOffer: boolean;
  handleProceedToOffer: () => Promise<void> | void;
  isGenerateModalOpen: boolean;
  setIsGenerateModalOpen: (open: boolean) => void;
  offerCandidates: OfferCandidate[];
  candidateSelections: Record<string, { productId?: string; quantity: number; include: boolean }>;
  candidateProducts: Record<string, ProductLookup[]>;
  toggleCandidateSelection: (ruleId: string, include: boolean) => void;
  setCandidateSelections: Dispatch<
    SetStateAction<Record<string, { productId?: string; quantity: number; include: boolean }>>
  >;
  handleConfirmOfferFromRequirements: () => Promise<void>;
}

export function RequirementsPanel({
  project,
  validationIssues,
  showVariantWizard,
  selectedVariantSlug,
  setSelectedVariantSlug,
  variantOptions,
  variantLoading,
  onConfirmVariantSelection,
  requirementsText,
  setRequirementsText,
  requirements,
  updateRequirementRow,
  deleteRequirementRow,
  addRequirementRow,
  onSaveRequirements,
  canSaveRequirements,
  savingRequirements,
  proceedingToOffer,
  handleProceedToOffer,
  isGenerateModalOpen,
  setIsGenerateModalOpen,
  offerCandidates,
  candidateSelections,
  candidateProducts,
  toggleCandidateSelection,
  setCandidateSelections,
  handleConfirmOfferFromRequirements,
}: RequirementsPanelProps) {
  const customerName = project.customerDetail?.name || project.customer;

  return (
    <>
      {validationIssues.length > 0 && <ValidationBanner missing={validationIssues} />}

      {showVariantWizard && (
        <Card className="p-4 space-y-3">
          <h3 className="text-lg font-semibold">Izberi varianto zahtev</h3>
          <p className="text-sm text-muted-foreground">
            Izberi varianto sistema, da se predizpolnijo vrstice zahtev.
          </p>
          <Select
            value={selectedVariantSlug || undefined}
            onValueChange={(value) => setSelectedVariantSlug(value)}
            disabled={variantLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Izberi varianto" />
            </SelectTrigger>
            <SelectContent>
              {variantOptions
                .filter((variant) => variant.variantSlug && variant.variantSlug.trim() !== "")
                .map((variant) => (
                  <SelectItem key={variant.variantSlug} value={variant.variantSlug}>
                    {variant.label || variant.variantSlug}
                  </SelectItem>
                ))}
              {variantOptions.length === 0 && (
                <SelectItem value="__noval__" disabled>
                  Ni variant
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button onClick={onConfirmVariantSelection} disabled={!selectedVariantSlug}>
              Potrdi varianto
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Opis zahtev stranke</h3>
        <p className="text-sm text-muted-foreground">
          Zapišite glavne potrebe, opažanja z ogleda in posebne želje stranke.
        </p>
        <Textarea
          value={requirementsText}
          onChange={(event) => setRequirementsText(event.target.value)}
          placeholder="Npr. videonadzor 4 kamere žično, snemanje 7 dni, dostop preko aplikacije ..."
          rows={4}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Zahteve</h3>
        <div className="bg-card rounded-[var(--radius-card)] border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naziv</TableHead>
                <TableHead>Vrednost</TableHead>
                <TableHead>Kategorija</TableHead>
                <TableHead>Opombe</TableHead>
                <TableHead className="text-right w-52">Akcije</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requirements ?? []).map((req) => (
                <TableRow key={req.id}>
                  <TableCell>
                    <Input
                      value={req.label}
                      onChange={(event) => updateRequirementRow(req.id, { label: event.target.value })}
                      placeholder="Naziv zahteve"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={req.value ?? ""}
                      onChange={(event) => updateRequirementRow(req.id, { value: event.target.value })}
                      placeholder="Vrednost"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={(project.categories?.length ?? 0) > 0 ? req.categorySlug : "__none__"}
                      onValueChange={(value) =>
                        value === "__none__"
                          ? null
                          : updateRequirementRow(req.id, { categorySlug: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Izberi kategorijo" />
                      </SelectTrigger>
                      <SelectContent>
                        {(project.categories ?? []).map((slug) => (
                          <SelectItem key={slug} value={slug}>
                            {slug}
                          </SelectItem>
                        ))}
                        {(project.categories ?? []).length === 0 && (
                          <SelectItem value="__none__" disabled>
                            Brez kategorij
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={req.notes ?? ""}
                      onChange={(event) => updateRequirementRow(req.id, { notes: event.target.value })}
                      placeholder="Opombe"
                    />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => deleteRequirementRow(req.id)}>
                      Izbriši
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" onClick={addRequirementRow}>
            Dodaj zahtevo
          </Button>
          <Button
            onClick={onSaveRequirements}
            disabled={!canSaveRequirements || savingRequirements}
            variant="secondary"
          >
            {savingRequirements ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Shrani zahteve
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleProceedToOffer} disabled={savingRequirements || proceedingToOffer}>
          {savingRequirements || proceedingToOffer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Pripravi ponudbo
        </Button>
      </div>

      <Dialog open={isGenerateModalOpen} onOpenChange={(open) => setIsGenerateModalOpen(open)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Predlagane postavke iz zahtev</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {offerCandidates.length === 0 && (
              <div className="text-sm text-muted-foreground">Ni kandidatov za dodajanje.</div>
            )}
            {offerCandidates.length > 0 && (
              <div className="space-y-2">
                {offerCandidates.map((candidate) => {
                  const selection = candidateSelections[candidate.ruleId] ?? {
                    productId: candidate.suggestedProductId,
                    quantity: candidate.quantity ?? 1,
                    include: true,
                  };
                  const productsForCategory = candidateProducts[candidate.productCategorySlug] ?? [];
                  const product = productsForCategory.find((p) => p.id === selection.productId) ?? productsForCategory[0];
                  const price = product?.price ?? 0;
                  const vatRate = typeof product?.vatRate === "number" ? product?.vatRate : 22;
                  const total = (selection.quantity || 0) * price * (1 + vatRate / 100);
                  return (
                    <div
                      key={candidate.ruleId}
                      className="flex items-center justify-between rounded border border-border px-3 py-2"
                    >
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selection.include}
                          onChange={(event) => toggleCandidateSelection(candidate.ruleId, event.target.checked)}
                        />
                        <div>
                          <div className="font-medium">{candidate.suggestedName}</div>
                          <div className="text-xs text-muted-foreground">
                            Pravilo: {candidate.ruleId} | Kategorija: {candidate.productCategorySlug}
                          </div>
                        </div>
                      </label>
                      <div className="flex items-center gap-3">
                        <Select
                          value={
                            productsForCategory.length > 0
                              ? selection.productId ?? productsForCategory[0].id
                              : "__none__"
                          }
                          onValueChange={(value) =>
                            setCandidateSelections((prev) => ({
                              ...prev,
                              [candidate.ruleId]: {
                                ...(prev[candidate.ruleId] ?? { include: true, quantity: candidate.quantity ?? 1 }),
                                productId: value === "__none__" ? undefined : value,
                              },
                            }))
                          }
                          disabled={productsForCategory.length === 0}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Izberi produkt" />
                          </SelectTrigger>
                          <SelectContent>
                            {productsForCategory.length === 0 && (
                              <SelectItem value="__none__" disabled>
                                Ni produktov
                              </SelectItem>
                            )}
                            {productsForCategory.map((productOption) => (
                              <SelectItem key={productOption.id} value={productOption.id}>
                                {productOption.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="w-24"
                          type="number"
                          inputMode="decimal"
                          value={selection.quantity}
                          onChange={(event) =>
                            setCandidateSelections((prev) => ({
                              ...prev,
                              [candidate.ruleId]: {
                                ...(prev[candidate.ruleId] ?? { include: true }),
                                productId: selection.productId,
                                quantity: Number(event.target.value),
                              },
                            }))
                          }
                        />
                        <div className="text-sm font-semibold min-w-[90px] text-right">€ {total.toFixed(2)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsGenerateModalOpen(false)}>
                Prekliči
              </Button>
              <Button
                onClick={handleConfirmOfferFromRequirements}
                disabled={!offerCandidates.some((c) => candidateSelections[c.ruleId]?.include !== false)}
              >
                Potrdi in dodaj v ponudbo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
