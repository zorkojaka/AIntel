import { useEffect, useMemo, useRef, useState } from "react";
import { type Client, type ClientFormPayload } from "@aintel/module-crm";
import { Loader2, RefreshCcw, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { cn } from "./ui/utils";
import { CategoryMultiSelect } from "@aintel/ui";
import type { Category, ProjectDetails } from "../types";

type NewCustomerFormState = {
  name: string;
  isCompany: boolean;
  street: string;
  cityDisplay: string;
  email: string;
  phone: string;
  contactPerson: string;
  tags: string;
  notes: string;
};

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRequirements: string;
  suggestedProjectCode: string;
  clients: Client[];
  selectedClientId: string | null;
  onSelectClient: (id: string | null) => void;
  isLoadingClients: boolean;
  isSubmitting: boolean;
  onCreateClient: (payload: ClientFormPayload) => Promise<Client>;
  onReloadClients: () => Promise<void> | void;
  onCreateProject: (payload: {
    title: string;
    requirements: string;
    categories: string[];
    clientId: string;
    client?: Client;
  }) => Promise<void>;
  onUpdateProject: (
    projectId: string,
    payload: { title: string; requirements: string; categories: string[]; clientId?: string | null; client?: Client }
  ) => Promise<void>;
  categories: Category[];
  selectedCategorySlugs: string[];
  onSelectCategories: (slugs: string[]) => void;
  isLoadingCategories: boolean;
  initialProject?: ProjectDetails | null;
}

const emptyCustomerForm = (): NewCustomerFormState => ({
  name: "",
  isCompany: false,
  street: "",
  cityDisplay: "",
  email: "",
  phone: "",
  contactPerson: "",
  tags: "",
  notes: "",
});

function buildCustomerAddress(street: string, cityDisplay: string) {
  const parts = [street.trim(), cityDisplay.trim()].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function normalizeCustomerForm(form: NewCustomerFormState): ClientFormPayload {
  const tags = form.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    name: form.name.trim(),
    type: form.isCompany ? "company" : "individual",
    street: form.street.trim() || undefined,
    postalCode: undefined,
    postalCity: form.cityDisplay.trim() || undefined,
    address: buildCustomerAddress(form.street, form.cityDisplay),
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    contactPerson: form.contactPerson.trim() || undefined,
    tags,
    notes: form.notes.trim() || undefined,
  };
}

function buildProjectTitle(projectCode: string, categoryNames: string[], customerName: string) {
  const cleanCode = projectCode.trim() || "PRJ-...";
  const topCategories = categoryNames.map((name) => name?.trim()).filter(Boolean).slice(0, 3) as string[];
  const categoriesLabel = topCategories.join(", ");
  const cleanCustomer = customerName.trim();

  if (!categoriesLabel && !cleanCustomer) {
    return cleanCode;
  }
  if (!categoriesLabel) {
    return `${cleanCode}: ${cleanCustomer}`.trim();
  }
  if (!cleanCustomer) {
    return `${cleanCode}: ${categoriesLabel}`.trim();
  }
  return `${cleanCode}: ${categoriesLabel} - ${cleanCustomer}`.trim();
}

export function NewProjectDialog({
  initialProject,
  open,
  onOpenChange,
  defaultRequirements,
  suggestedProjectCode,
  clients,
  selectedClientId,
  onSelectClient,
  isLoadingClients,
  isSubmitting,
  onCreateClient,
  onReloadClients,
  onCreateProject,
  onUpdateProject,
  categories,
  selectedCategorySlugs,
  onSelectCategories,
  isLoadingCategories,
}: NewProjectDialogProps) {
  const [requirements, setRequirements] = useState(defaultRequirements);
  const [search, setSearch] = useState("");
  const [newCustomer, setNewCustomer] = useState<NewCustomerFormState>(emptyCustomerForm);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    setRequirements(defaultRequirements);
    setSearch("");
    setCustomerError(null);
    setIsSavingCustomer(false);
    if (initialProject) {
      setNewCustomer({
        name: initialProject.customerDetail?.name ?? "",
        isCompany: Boolean(initialProject.customerDetail?.taxId),
        street: "",
        cityDisplay: "",
        email: initialProject.customerDetail?.email ?? "",
        phone: initialProject.customerDetail?.phone ?? "",
        contactPerson: "",
        tags: "",
        notes: "",
      });
    } else {
      setNewCustomer(emptyCustomerForm());
    }
  }, [open, defaultRequirements, initialProject]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) {
      return clients;
    }
    const lower = search.toLowerCase();
    return clients.filter((client) => client.name.toLowerCase().includes(lower));
  }, [clients, search]);

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const selectedCategoryNames = useMemo(
    () =>
      selectedCategorySlugs
        .map((slug) => categories.find((category) => category.slug === slug)?.name ?? slug)
        .filter(Boolean),
    [categories, selectedCategorySlugs]
  );
  const projectCodePreview = initialProject?.id ?? suggestedProjectCode;
  const previewCustomerName = selectedClient?.name ?? newCustomer.name;
  const generatedTitle = useMemo(
    () => buildProjectTitle(projectCodePreview, selectedCategoryNames, previewCustomerName),
    [previewCustomerName, projectCodePreview, selectedCategoryNames]
  );

  const isEditing = Boolean(initialProject?.id);
  const submitText = isEditing ? "Shrani projekt" : "Ustvari projekt";

  const updateNewCustomer = (field: keyof NewCustomerFormState, value: string | boolean) => {
    setCustomerError(null);
    onSelectClient(null);
    setNewCustomer((prev) => ({ ...prev, [field]: value }));
  };

  const validateNewCustomer = () => {
    const normalized = normalizeCustomerForm(newCustomer);
    if (!normalized.name) {
      return "Vnesite ime stranke.";
    }
    if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
      return "E-pošta ni veljavna.";
    }
    return null;
  };

  const saveNewCustomer = async () => {
    const validationError = validateNewCustomer();
    if (validationError) {
      setCustomerError(validationError);
      return null;
    }

    try {
      setIsSavingCustomer(true);
      const createdClient = await onCreateClient(normalizeCustomerForm(newCustomer));
      onSelectClient(createdClient.id);
      setCustomerError(null);
      return createdClient;
    } catch (error) {
      if (error instanceof Error) {
        setCustomerError(error.message);
      } else {
        setCustomerError("Shranjevanje stranke ni uspelo.");
      }
      return null;
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const ensureClientSelection = async () => {
    if (selectedClientId) {
      return {
        clientId: selectedClientId,
        client: selectedClient ?? undefined,
      };
    }

    const createdClient = await saveNewCustomer();
    if (!createdClient) {
      return null;
    }
    return {
      clientId: createdClient.id,
      client: createdClient,
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const clientSelection = await ensureClientSelection();
      if (!clientSelection) {
        return;
      }

      const payload = {
        title: generatedTitle,
        requirements: requirements.trim(),
        categories: selectedCategorySlugs,
        clientId: clientSelection.clientId,
        client: clientSelection.client,
      };

      if (isEditing && initialProject) {
        await onUpdateProject(initialProject.id, payload);
      } else {
        await onCreateProject(payload);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Napaka pri shranjevanju projekta", error);
      if (error instanceof Error) {
        setCustomerError(error.message);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-4xl" hideCloseButton>
        <form ref={formRef} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b px-6 py-4">
            <div className="flex flex-col gap-1">
              <DialogTitle>{isEditing ? "Uredi projekt" : "Nov projekt"}</DialogTitle>
              <DialogDescription>
                Najprej vnesite stranko, nato izberite kategorije. Naziv projekta se ustvari samodejno.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Shrani"
                onClick={() => formRef.current?.requestSubmit()}
                className="inline-flex h-10 w-10 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Save className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Zapri"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
            <div className="space-y-6">
          <div className="grid gap-4">
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <label className="text-sm font-medium text-foreground" htmlFor="project-title-preview">
                Naziv projekta
              </label>
              <div
                id="project-title-preview"
                className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-medium text-foreground"
              >
                {generatedTitle}
              </div>
              <p className="text-xs text-muted-foreground">
                Naziv se ustvari iz ID-ja projekta, kategorij in izbrane oziroma nove stranke.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="project-reqs">
                Opis ali zahteve
              </label>
              <Textarea
                id="project-reqs"
                value={requirements}
                onChange={(event) => setRequirements(event.target.value)}
                placeholder="Dodajte ključne informacije ali cilje projekta"
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Kategorije</p>
                <p className="text-xs text-muted-foreground">
                  Oznake pomagajo pri predlogah in filtriranju projektov.
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-muted-foreground underline transition hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/60"
                onClick={() => onSelectCategories([])}
                disabled={isLoadingCategories || selectedCategorySlugs.length === 0}
              >
                Počisti
              </button>
            </div>
            <CategoryMultiSelect
              categories={categories}
              value={selectedCategorySlugs}
              onChange={onSelectCategories}
              label=""
            />
            {isLoadingCategories && (
              <p className="text-xs text-muted-foreground">Nalagam kategorije ...</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Stranka projekta</p>
                <p className="text-xs text-muted-foreground">
                  Nova stranka je privzeti flow. Spodaj lahko še vedno izberete obstoječo stranko iz CRM.
                </p>
              </div>
              <Button type="button" variant="ghost" onClick={() => onReloadClients()}>
                <RefreshCcw className="mr-2 h-4 w-4" /> Osveži
              </Button>
            </div>

            <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Ime Priimek / Naziv stranke</span>
                <Input
                  value={newCustomer.name}
                  onChange={(event) => updateNewCustomer("name", event.target.value)}
                  placeholder="npr. Janez Novak"
                />
              </label>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-foreground">
                <Checkbox
                  checked={newCustomer.isCompany}
                  onChange={(event) => updateNewCustomer("isCompany", event.target.checked)}
                />
                <span>Podjetje</span>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Ulica</span>
                <Input
                  value={newCustomer.street}
                  onChange={(event) => updateNewCustomer("street", event.target.value)}
                  placeholder="npr. Ulica 123"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Mesto</span>
                <Input
                  value={newCustomer.cityDisplay}
                  onChange={(event) => updateNewCustomer("cityDisplay", event.target.value)}
                  placeholder="npr. 1000 Ljubljana"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>E-pošta</span>
                <Input
                  type="email"
                  value={newCustomer.email}
                  onChange={(event) => updateNewCustomer("email", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Telefon</span>
                <Input
                  value={newCustomer.phone}
                  onChange={(event) => updateNewCustomer("phone", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Kontaktna oseba</span>
                <Input
                  value={newCustomer.contactPerson}
                  onChange={(event) => updateNewCustomer("contactPerson", event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Oznake</span>
                <Input
                  value={newCustomer.tags}
                  onChange={(event) => updateNewCustomer("tags", event.target.value)}
                  placeholder="npr. VIP, servis"
                />
              </label>
              <div className="md:col-span-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Opombe</span>
                  <Textarea
                    value={newCustomer.notes}
                    onChange={(event) => updateNewCustomer("notes", event.target.value)}
                    rows={3}
                  />
                </label>
              </div>
              {customerError ? (
                <p className="md:col-span-2 text-sm text-destructive">{customerError}</p>
              ) : null}
              {selectedClient ? (
                <div className="md:col-span-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                  Uporabljena bo obstoječa stranka: <strong>{selectedClient.name}</strong>
                </div>
              ) : null}
              <div className="md:col-span-2 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSavingCustomer || isSubmitting}
                  onClick={async () => {
                    await saveNewCustomer();
                  }}
                >
                  {isSavingCustomer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Shrani stranko
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <p className="text-sm font-medium text-foreground">Ali izberite obstoječo stranko</p>
              <Input
                placeholder="Išči po nazivu"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              <div className="max-h-64 space-y-2 overflow-y-auto">
                {isLoadingClients ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Nalagam stranke ...
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-muted-foreground">
                    {clients.length === 0
                      ? "CRM trenutno nima strank. Vnesite novo stranko zgoraj."
                      : "Ni zadetkov. Poskusite z drugim iskalnim nizom."}
                  </div>
                ) : (
                  filteredClients.map((client) => (
                    <button
                      type="button"
                      key={client.id}
                      onClick={() => {
                        setCustomerError(null);
                        onSelectClient(client.id);
                      }}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition",
                        selectedClientId === client.id
                          ? "border-primary bg-primary/5"
                          : "border-slate-200 hover:border-primary"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">{client.name}</p>
                          {client.address && (
                            <p className="text-xs text-muted-foreground">{client.address}</p>
                          )}
                          {client.email && (
                            <p className="text-xs text-muted-foreground">{client.email}</p>
                          )}
                        </div>
                        <Badge variant={client.isComplete ? "default" : "secondary"}>
                          {client.isComplete ? "Popolni podatki" : "Nepopolni podatki"}
                        </Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Prekliči
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isSavingCustomer || (!selectedClientId && !newCustomer.name.trim())}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
