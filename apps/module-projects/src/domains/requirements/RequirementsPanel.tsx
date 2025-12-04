import type { Dispatch, SetStateAction } from "react";
import { Card } from "../../components/ui/card";
import { Tabs, TabsContent } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { ItemsTable, Item } from "./ItemsTable";
import {
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { toast } from "sonner";
import { OfferCandidate, ProjectDetails } from "../../types";
import type { ProjectRequirement } from "@aintel/shared/types/project";
import { ProductLookup } from "../../api";
import { ValidationBanner } from "../core/ValidationBanner";
import { openPreview } from "../offers/TemplateRenderer";

export type ItemFormState = {
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  vatRate: number;
  description: string;
  category: Item["category"];
};

export type RequirementRow = ProjectRequirement;

export type CatalogProduct = {
  id: string;
  name: string;
  category?: string;
  price: number;
  description?: string;
  supplier?: string;
  categorySlugs?: string[];
};

export type CatalogTarget = "project" | "offer";

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
  handleProceedToOffer: () => Promise<void> | void;
  isExecutionPhase: boolean;
  items: Item[];
  handleProjectItemFieldChange: (id: string, changes: Partial<Item>) => Promise<void> | void;
  openCatalog: (target: CatalogTarget) => void;
  handleAddItem: () => void;
  handleDeleteItem: (id: string) => void;
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
  isItemDialogOpen: boolean;
  setItemDialogOpen: (open: boolean) => void;
  resetItemForm: () => void;
  editingItem: Item | null;
  itemForm: ItemFormState;
  setItemForm: Dispatch<SetStateAction<ItemFormState>>;
  itemContext: CatalogTarget;
  setItemContext: (context: CatalogTarget) => void;
  isSavingItem: boolean;
  handleSaveItem: () => Promise<void>;
  isCatalogDialogOpen: boolean;
  setCatalogDialogOpen: (open: boolean) => void;
  filteredCatalog: CatalogProduct[];
  catalogSearch: string;
  setCatalogSearch: (value: string) => void;
  selectedCatalogProduct: CatalogProduct | null;
  setSelectedCatalogProduct: (product: CatalogProduct | null) => void;
  catalogQuantity: number;
  setCatalogQuantity: (value: number) => void;
  catalogDiscount: number;
  setCatalogDiscount: (value: number) => void;
  catalogVatRate: number;
  setCatalogVatRate: (value: number) => void;
  catalogUnit: string;
  setCatalogUnit: (value: string) => void;
  handleAddFromCatalog: () => Promise<void>;
  isAddingFromCatalog: boolean;
  catalogLoading: boolean;
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
  handleProceedToOffer,
  isExecutionPhase,
  items,
  handleProjectItemFieldChange,
  openCatalog,
  handleAddItem,
  handleDeleteItem,
  isGenerateModalOpen,
  setIsGenerateModalOpen,
  offerCandidates,
  candidateSelections,
  candidateProducts,
  toggleCandidateSelection,
  setCandidateSelections,
  handleConfirmOfferFromRequirements,
  isItemDialogOpen,
  setItemDialogOpen,
  resetItemForm,
  editingItem,
  itemForm,
  setItemForm,
  itemContext,
  setItemContext,
  isSavingItem,
  handleSaveItem,
  isCatalogDialogOpen,
  setCatalogDialogOpen,
  filteredCatalog,
  catalogSearch,
  setCatalogSearch,
  selectedCatalogProduct,
  setSelectedCatalogProduct,
  catalogQuantity,
  setCatalogQuantity,
  catalogDiscount,
  setCatalogDiscount,
  catalogVatRate,
  setCatalogVatRate,
  catalogUnit,
  setCatalogUnit,
  handleAddFromCatalog,
  isAddingFromCatalog,
  catalogLoading,
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
        <Button variant="outline" onClick={addRequirementRow}>
          Dodaj zahtevo
        </Button>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleProceedToOffer}>Pripravi ponudbo</Button>
      </div>

      {!isExecutionPhase ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Tehnične postavke bodo na voljo, ko bo ponudba sprejeta in bo projekt v izvedbi.
        </Card>
      ) : (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Tehnične postavke</h3>
          <ItemsTable
            items={items}
            onEditField={handleProjectItemFieldChange}
            onAddFromCatalog={() => openCatalog("project")}
            onAddCustom={handleAddItem}
            onDelete={handleDeleteItem}
            showDraftRow={false}
            showDiscount
          />
        </div>
      )}

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

      <Dialog
        open={isItemDialogOpen}
        onOpenChange={(open) => {
          setItemDialogOpen(open);
          if (!open) {
            resetItemForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Uredi postavko" : "Dodaj postavko"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Naziv</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={itemForm.sku} onChange={(e) => setItemForm((prev) => ({ ...prev, sku: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Enota</Label>
                <Input value={itemForm.unit} onChange={(e) => setItemForm((prev) => ({ ...prev, unit: e.target.value }))} />
              </div>
              <div>
                <Label>Kategorija</Label>
                <Select
                  value={itemForm.category ?? "material"}
                  onValueChange={(value) => setItemForm((prev) => ({ ...prev, category: value as Item["category"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="labor">Delo</SelectItem>
                    <SelectItem value="other">Drugo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>DDV %</Label>
                <Input
                  type="number"
                  value={itemForm.vatRate}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, vatRate: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>Količina</Label>
                <Input
                  type="number"
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Cena</Label>
                <Input
                  type="number"
                  value={itemForm.price}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, price: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Popust %</Label>
                <Input
                  type="number"
                  value={itemForm.discount}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, discount: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Opis</Label>
                <Input value={itemForm.description} onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setItemDialogOpen(false)}>
                Prekliči
              </Button>
              <Button onClick={handleSaveItem} disabled={isSavingItem}>
                {isSavingItem ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Shrani
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCatalogDialogOpen} onOpenChange={setCatalogDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Dodaj iz cenika</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Išči po nazivu ali kategoriji"
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                />
              </div>
              <Button variant="outline" onClick={openPreviewCatalogInfo}>
                <Sparkles className="mr-2 h-4 w-4" />
                Predlogi AI (v pripravi)
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCatalogDialogOpen(false)}>
                <RefreshCcw className={`h-4 w-4 ${catalogLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="grid grid-cols-[2fr_1fr] gap-4">
              <div className="rounded border border-border">
                <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm text-muted-foreground">
                  <span>Rezultati</span>
                  <span>{filteredCatalog.length} produktov</span>
                </div>
                <div className="h-[340px] overflow-y-auto p-3 space-y-2">
                  {filteredCatalog.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground">Ni zadetkov!!</div>
                  )}
                  {filteredCatalog.map((product) => (
                    <Card
                      key={product.id}
                      className={`cursor-pointer border ${
                        selectedCatalogProduct?.id === product.id ? "border-primary" : "border-border"
                      }`}
                      onClick={() => setSelectedCatalogProduct(product)}
                    >
                      <div className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold">{product.name}</div>
                            <div className="text-sm text-muted-foreground">{product.category}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">€ {product.price.toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">{product.supplier || "-"}</div>
                          </div>
                        </div>
                        {product.description && (
                          <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Stranka</div>
                  <div className="font-semibold">{customerName || "-"}</div>
                  <div className="text-sm text-muted-foreground">{project.customerDetail?.address || "-"}</div>
                </div>

                <div className="space-y-2">
                  <Label>Produkt</Label>
                  <Input value={selectedCatalogProduct?.name ?? "Izberi produkt"} readOnly />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Količina</Label>
                    <Input
                      type="number"
                      value={catalogQuantity}
                      onChange={(event) => setCatalogQuantity(Number(event.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Popust %</Label>
                    <Input
                      type="number"
                      value={catalogDiscount}
                      onChange={(event) => setCatalogDiscount(Number(event.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>DDV %</Label>
                    <Input
                      type="number"
                      value={catalogVatRate}
                      onChange={(event) => setCatalogVatRate(Number(event.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Enota</Label>
                    <Input value={catalogUnit} onChange={(event) => setCatalogUnit(event.target.value || "kos")} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1" onClick={handleAddFromCatalog} disabled={isAddingFromCatalog}>
                    {isAddingFromCatalog ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Dodaj v zahteve
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">Dodaj v</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openCatalog("project")}>Zahteve</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openCatalog("offer")}>Ponudbo</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function openPreviewCatalogInfo() {
  openPreview(`
    <div style="font-family: Inter, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto;">
      <h2 style="margin-top: 0;">Predlogi iz AI</h2>
      <p style="color: #6b7280;">Na podlagi zahtev bomo predlagali elemente iz cenika.</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px;">
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
          <div style="font-weight: 600;">Video nadzor paket S</div>
          <div style="color: #6b7280;">4x kamera 2MP, NVR 1TB, montaža</div>
          <div style="margin-top: 8px; font-weight: 600;">€ 1.240,00</div>
        </div>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
          <div style="font-weight: 600;">Alarm paket M</div>
          <div style="color: #6b7280;">8 con, tipkovnica, GSM modul, montaža</div>
          <div style="margin-top: 8px; font-weight: 600;">€ 890,00</div>
        </div>
      </div>
      <p style="color: #6b7280; margin-top: 16px;">
        V naslednji verziji bomo ponudili realne predloge na podlagi zahtev stranke.
      </p>
    </div>
  `);
  toast.info("Predlogi AI so v pripravi");
}
