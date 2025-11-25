import { useEffect, useMemo, useRef, useState } from "react";
import { Client } from "@aintel/module-crm";
import { Loader2, RefreshCcw, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { cn } from "./ui/utils";
import { CategoryMultiSelect } from "@aintel/ui";
import type { Category, ProjectDetails } from "../types";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  defaultRequirements: string;
  clients: Client[];
  selectedClientId: string | null;
  onSelectClient: (id: string) => void;
  isLoadingClients: boolean;
  isSubmitting: boolean;
  onAddClient: () => void;
  onReloadClients: () => Promise<void> | void;
  onCreateProject: (payload: {
    title: string;
    requirements: string;
    categories: string[];
  }) => Promise<void>;
  onUpdateProject: (
    projectId: string,
    payload: { title: string; requirements: string; categories: string[] }
  ) => Promise<void>;
  categories: Category[];
  selectedCategorySlugs: string[];
  onSelectCategories: (slugs: string[]) => void;
  isLoadingCategories: boolean;
  initialProject?: ProjectDetails | null;
}

export function NewProjectDialog({
  initialProject,
  open,
  onOpenChange,
  defaultTitle,
  defaultRequirements,
  clients,
  selectedClientId,
  onSelectClient,
  isLoadingClients,
  isSubmitting,
  onAddClient,
  onReloadClients,
  onCreateProject,
  onUpdateProject,
  categories,
  selectedCategorySlugs,
  onSelectCategories,
  isLoadingCategories,
}: NewProjectDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [requirements, setRequirements] = useState(defaultRequirements);
  const [search, setSearch] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setRequirements(defaultRequirements);
      setSearch("");
    }
  }, [open, defaultRequirements, defaultTitle]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) {
      return clients;
    }
    const lower = search.toLowerCase();
    return clients.filter((client) => client.name.toLowerCase().includes(lower));
  }, [clients, search]);

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;

  const toggleCategory = (slug: string) => {
    const isSelected = selectedCategorySlugs.includes(slug);
    onSelectCategories(
      isSelected
        ? selectedCategorySlugs.filter((value) => value !== slug)
        : [...selectedCategorySlugs, slug]
    );
  };

  const isEditing = Boolean(initialProject?.id);
  const submitText = isEditing ? "Shrani projekt" : "Ustvari projekt";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      title: title.trim(),
      requirements: requirements.trim(),
      categories: selectedCategorySlugs,
    };

    try {
      if (isEditing && initialProject) {
        await onUpdateProject(initialProject.id, payload);
      } else {
        await onCreateProject(payload);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Napaka pri shranjevanju projekta", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" hideCloseButton>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
          <DialogHeader className="flex items-center justify-between">
            <div>
              <DialogTitle>{isEditing ? "Uredi projekt" : "Nov projekt"}</DialogTitle>
              <DialogDescription>
                Izberite stranko iz CRM baze ali dodajte novo, nato določite osnovne podatke projekta.
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

          <div className="grid gap-4">
            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="project-title">
                Naziv projekta
              </label>
              <Input
                id="project-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="npr. Videonadzor poslovnih prostorov"
                required
              />
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
                  Izberite obstoječo stranko ali ustvarite novo. Nova stranka bo po shranjevanju samodejno izbrana.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={onAddClient}>
                  Dodaj novo stranko
                </Button>
                <Button type="button" variant="ghost" onClick={() => onReloadClients()}>
                  <RefreshCcw className="mr-2 h-4 w-4" /> Osveži
                </Button>
              </div>
            </div>

            <Input
              className="mt-4"
              placeholder="Išči po nazivu"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {isLoadingClients ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Nalagam stranke ...
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-muted-foreground">
                  {clients.length === 0
                    ? "CRM trenutno nima strank. Dodajte novo za začetek."
                    : "Ni zadetkov. Poskusite z drugim iskalnim nizom."}
                </div>
              ) : (
                filteredClients.map((client) => (
                  <button
                    type="button"
                    key={client.id}
                    onClick={() => onSelectClient(client.id)}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Prekliči
            </Button>
            <Button
              type="submit"
              disabled={
                (isEditing ? false : !selectedClient) || !title.trim() || isSubmitting || selectedCategorySlugs.length === 0
              }
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
