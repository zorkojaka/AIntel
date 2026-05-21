import { useEffect, useMemo, useRef, useState } from "react";
import { type Client, type ClientFormPayload } from "@aintel/module-crm";
import { Bell, ChevronDown, Home, Loader2, RefreshCcw, Save, Search, Shield, Video, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { cn } from "./ui/utils";
import type { Category, ProjectDetails } from "../types";

type NewCustomerFormState = {
  name: string;
  isCompany: boolean;
  street: string;
  postalCode: string;
  postalCity: string;
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

const PROJECT_CATEGORY_OPTIONS = [
  { slug: "videonadzor", name: "Videonadzor", icon: Video },
  { slug: "alarm", name: "Alarm", icon: Shield },
  { slug: "domofon", name: "Domofon", icon: Bell },
  { slug: "smarthome", name: "Pametni dom", icon: Home },
] as const;

const PROJECT_CATEGORY_SLUGS = new Set<string>(PROJECT_CATEGORY_OPTIONS.map((category) => category.slug));

const emptyCustomerForm = (): NewCustomerFormState => ({
  name: "",
  isCompany: false,
  street: "",
  postalCode: "",
  postalCity: "",
  email: "",
  phone: "",
  contactPerson: "",
  tags: "",
  notes: "",
});

function buildCustomerAddress(street: string, postalCode: string, postalCity: string) {
  const cityLine = [postalCode.trim(), postalCity.trim()].filter(Boolean).join(" ");
  const parts = [street.trim(), cityLine].filter(Boolean);
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
    postalCode: form.postalCode.trim() || undefined,
    postalCity: form.postalCity.trim() || undefined,
    address: buildCustomerAddress(form.street, form.postalCode, form.postalCity),
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
  selectedCategorySlugs,
  onSelectCategories,
  isLoadingCategories,
}: NewProjectDialogProps) {
  const [requirements, setRequirements] = useState(defaultRequirements);
  const [search, setSearch] = useState("");
  const [newCustomer, setNewCustomer] = useState<NewCustomerFormState>(emptyCustomerForm);
  const [customerMode, setCustomerMode] = useState<"new" | "existing">("new");
  const [quickAddress, setQuickAddress] = useState("");
  const [showMoreCustomerFields, setShowMoreCustomerFields] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    setRequirements(defaultRequirements);
    setSearch("");
    setCustomerMode(initialProject?.client?.id ? "existing" : "new");
    setQuickAddress("");
    setShowMoreCustomerFields(false);
    setCustomerError(null);
    setIsSavingCustomer(false);
    if (initialProject) {
      setNewCustomer({
        name: initialProject.customerDetail?.name ?? "",
        isCompany: Boolean(initialProject.customerDetail?.taxId),
        street: initialProject.client?.street ?? "",
        postalCode: initialProject.client?.postalCode ?? "",
        postalCity: initialProject.client?.postalCity ?? "",
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
  const selectedProjectCategorySlugs = useMemo(
    () => selectedCategorySlugs.filter((slug) => PROJECT_CATEGORY_SLUGS.has(slug)),
    [selectedCategorySlugs]
  );
  const hiddenLegacyCategorySlugs = useMemo(
    () => selectedCategorySlugs.filter((slug) => !PROJECT_CATEGORY_SLUGS.has(slug)),
    [selectedCategorySlugs]
  );
  const selectedCategoryNames = useMemo(
    () =>
      selectedProjectCategorySlugs
        .map((slug) => PROJECT_CATEGORY_OPTIONS.find((category) => category.slug === slug)?.name ?? slug)
        .filter(Boolean),
    [selectedProjectCategorySlugs]
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

  const handleParseQuickAddress = () => {
    const lines = quickAddress
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const postalMatch = lines[2]?.match(/^(\d{4})\s+(.+)$/);

    setCustomerError(null);
    onSelectClient(null);
    setNewCustomer((prev) => ({
      ...prev,
      name: lines[0] ?? prev.name,
      street: lines[1] ?? prev.street,
      postalCode: postalMatch?.[1] ?? prev.postalCode,
      postalCity: postalMatch?.[2] ?? prev.postalCity,
    }));
  };

  const toggleProjectCategory = (slug: string) => {
    const next = selectedProjectCategorySlugs.includes(slug)
      ? selectedProjectCategorySlugs.filter((item) => item !== slug)
      : [...selectedProjectCategorySlugs, slug];
    onSelectCategories(next);
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
        categories: isEditing ? [...selectedProjectCategorySlugs, ...hiddenLegacyCategorySlugs] : selectedProjectCategorySlugs,
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
              <DialogDescription>Najprej vnesite stranko, nato opis in projektne kategorije.</DialogDescription>
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
              <section className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Stranka</h3>
                  <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerMode("new");
                        onSelectClient(null);
                        setCustomerError(null);
                      }}
                      className={cn(
                        "rounded px-3 py-1.5 text-sm font-medium transition",
                        customerMode === "new"
                          ? "bg-white text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Nova stranka
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerMode("existing");
                        setCustomerError(null);
                      }}
                      className={cn(
                        "rounded px-3 py-1.5 text-sm font-medium transition",
                        customerMode === "existing"
                          ? "bg-white text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Obstoječa
                    </button>
                  </div>
                </div>

                {customerMode === "new" ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <label className="space-y-2 text-sm font-medium text-foreground" htmlFor="quick-address">
                        <span>Hitri vnos naslova</span>
                        <Textarea
                          id="quick-address"
                          value={quickAddress}
                          onChange={(event) => setQuickAddress(event.target.value)}
                          placeholder={"Janez Novak\nGlavna ulica 5\n1230 Domžale"}
                          rows={3}
                          className="bg-white"
                        />
                      </label>
                      <div className="mt-3 flex justify-end">
                        <Button type="button" variant="outline" onClick={handleParseQuickAddress}>
                          Razčleni v polja
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                        <label className="space-y-2 text-sm font-medium text-foreground">
                          <span>Ime in priimek/naziv</span>
                          <Input
                            value={newCustomer.name}
                            onChange={(event) => updateNewCustomer("name", event.target.value)}
                            placeholder="Janez Novak"
                          />
                        </label>
                        <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-foreground">
                          <Checkbox
                            checked={newCustomer.isCompany}
                            onChange={(event) => updateNewCustomer("isCompany", event.target.checked)}
                          />
                          <span>Podjetje</span>
                        </label>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1.5fr]">
                        <label className="space-y-2 text-sm font-medium text-foreground">
                          <span>Ulica</span>
                          <Input
                            value={newCustomer.street}
                            onChange={(event) => updateNewCustomer("street", event.target.value)}
                            placeholder="Glavna ulica 5"
                          />
                        </label>
                        <label className="space-y-2 text-sm font-medium text-foreground">
                          <span>Pošta</span>
                          <Input
                            value={newCustomer.postalCode}
                            onChange={(event) => updateNewCustomer("postalCode", event.target.value)}
                            placeholder="1230"
                          />
                        </label>
                        <label className="space-y-2 text-sm font-medium text-foreground">
                          <span>Mesto</span>
                          <Input
                            value={newCustomer.postalCity}
                            onChange={(event) => updateNewCustomer("postalCity", event.target.value)}
                            placeholder="Domžale"
                          />
                        </label>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
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
                      </div>

                      <button
                        type="button"
                        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
                        onClick={() => setShowMoreCustomerFields((prev) => !prev)}
                      >
                        Več
                        <ChevronDown className={cn("h-4 w-4 transition", showMoreCustomerFields && "rotate-180")} />
                      </button>

                      {showMoreCustomerFields ? (
                        <div className="grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
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
                              placeholder="VIP, servis"
                            />
                          </label>
                          <label className="space-y-2 text-sm font-medium text-foreground md:col-span-2">
                            <span>Opombe</span>
                            <Textarea
                              value={newCustomer.notes}
                              onChange={(event) => updateNewCustomer("notes", event.target.value)}
                              rows={3}
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Išči po nazivu"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </div>
                      <Button type="button" variant="ghost" onClick={() => onReloadClients()}>
                        <RefreshCcw className="mr-2 h-4 w-4" /> Osveži
                      </Button>
                    </div>

                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {isLoadingClients ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Nalagam stranke ...
                        </div>
                      ) : filteredClients.length === 0 ? (
                        <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-muted-foreground">
                          {clients.length === 0
                            ? "CRM trenutno nima strank. Vnesite novo stranko."
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
                                {client.address && <p className="text-xs text-muted-foreground">{client.address}</p>}
                                {client.email && <p className="text-xs text-muted-foreground">{client.email}</p>}
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
                )}

                {customerError ? <p className="mt-3 text-sm text-destructive">{customerError}</p> : null}
                {selectedClient ? (
                  <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                    Uporabljena bo obstoječa stranka: <strong>{selectedClient.name}</strong>
                  </div>
                ) : null}
              </section>

              <section className="space-y-2">
                <label
                  className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                  htmlFor="project-reqs"
                >
                  Opis / zahteva
                </label>
                <Textarea
                  id="project-reqs"
                  value={requirements}
                  onChange={(event) => setRequirements(event.target.value)}
                  placeholder="Kaj stranka želi"
                  rows={4}
                />
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Kategorije projekta
                  </h3>
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted-foreground underline transition hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/60"
                    onClick={() => onSelectCategories([])}
                    disabled={selectedProjectCategorySlugs.length === 0}
                  >
                    Počisti
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {PROJECT_CATEGORY_OPTIONS.map((category) => {
                    const Icon = category.icon;
                    const selected = selectedProjectCategorySlugs.includes(category.slug);
                    return (
                      <button
                        key={category.slug}
                        type="button"
                        onClick={() => toggleProjectCategory(category.slug)}
                        className={cn(
                          "flex min-h-24 flex-col items-start justify-between rounded-lg border p-4 text-left transition",
                          selected
                            ? "border-primary bg-primary/5 text-primary shadow-sm"
                            : "border-slate-200 bg-white text-foreground hover:border-primary/60"
                        )}
                      >
                        <Icon className="h-6 w-6" />
                        <span className="text-base font-semibold">{category.name}</span>
                      </button>
                    );
                  })}
                </div>
                {isLoadingCategories ? (
                  <p className="text-xs text-muted-foreground">Nalagam projektne kategorije ...</p>
                ) : null}
              </section>
            </div>
          </div>

          <DialogFooter className="flex shrink-0 flex-col gap-3 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Naziv: {generatedTitle || "PRJ-XXX"} (samodejno)</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Prekliči
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  isSavingCustomer ||
                  (customerMode === "existing" && !selectedClientId) ||
                  (customerMode === "new" && !newCustomer.name.trim())
                }
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitText}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
