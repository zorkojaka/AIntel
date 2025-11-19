import { useEffect, useMemo, useState } from "react";
import { Client } from "@aintel/module-crm";
import { Loader2, RefreshCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { cn } from "./ui/utils";

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
  onCreateProject: (options: { title: string; requirements: string; client: Client }) => Promise<void>;
}

export function NewProjectDialog({
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
}: NewProjectDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [requirements, setRequirements] = useState(defaultRequirements);
  const [search, setSearch] = useState("");

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedClient) {
      return;
    }
    await onCreateProject({ title: title.trim(), requirements: requirements.trim(), client: selectedClient });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Nov projekt</DialogTitle>
            <DialogDescription>
              Izberite stranko iz CRM baze ali dodajte novo, nato določite osnovne podatke projekta.
            </DialogDescription>
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
            <Button type="submit" disabled={!selectedClient || !title.trim() || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ustvari projekt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
