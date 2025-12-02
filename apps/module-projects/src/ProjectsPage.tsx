import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ClientForm, ClientFormPayload, Client } from "@aintel/module-crm";
import { useSettingsData } from "@aintel/module-settings";
import { Settings, ArrowLeft, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ProjectList } from "./components/ProjectList";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { TemplateEditor, Template } from "./components/TemplateEditor";
import { Toaster } from "./components/ui/sonner";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Category, ProjectDetails, ProjectSummary } from "./types";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { DEFAULT_TEMPLATES, mapProject } from "./domains/core/useProject";

const slugify = (value?: string) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const API_PREFIX = "/api/projects";

function toSummary(project: ProjectDetails): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    customer: project.customer,
    status: project.status,
    offerAmount: project.offerAmount,
    invoiceAmount: project.invoiceAmount,
    createdAt: project.createdAt,
    categories: project.categories ?? [],
    requirementsTemplateVariantSlug: project.requirementsTemplateVariantSlug,
  };
}

export function ProjectsPage() {
  const { settings: globalSettings } = useSettingsData({ applyTheme: false });
  const [currentView, setCurrentView] = useState<"list" | "workspace" | "settings">("list");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [isClientModalOpen, setClientModalOpen] = useState(false);
  const [isNewProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectFormInitial, setProjectFormInitial] = useState<ProjectDetails | null>(null);
  const [crmClients, setCrmClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [newProjectCategorySlugs, setNewProjectCategorySlugs] = useState<string[]>([]);
  const [newProjectDefaults, setNewProjectDefaults] = useState({
    title: "Nov projekt",
    requirements: "Dodajte opis projekta",
  });
  const [clientPortalContainer, setClientPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      setClientPortalContainer(document.body);
    }
  }, []);

  useEffect(() => {
    if (!projectFormInitial || crmClients.length === 0) return;

    const byId = projectFormInitial.customerDetail?.id
      ? crmClients.find((client) => client.id === projectFormInitial.customerDetail?.id)
      : null;

    const byTaxId = !byId && projectFormInitial.customerDetail?.taxId
      ? crmClients.find((client) => client.vatNumber === projectFormInitial.customerDetail?.taxId)
      : null;

    const byNameAndTax = !byId && !byTaxId
      ? crmClients.find(
          (client) =>
            client.name === projectFormInitial.customerDetail?.name &&
            (!!client.vatNumber && client.vatNumber === projectFormInitial.customerDetail?.taxId)
        )
      : null;

    const match = byId || byTaxId || byNameAndTax;
    if (match) {
      setSelectedClientId(match.id);
    }
  }, [projectFormInitial, crmClients]);

  const fetchProjectList = async () => {
    const response = await fetch(API_PREFIX);
    const result = await response.json();
    if (!result.success) {
      toast.error(result.error ?? "Napaka pri nalaganju projektov.");
      return;
    }
    setProjects(result.data as ProjectSummary[]);
  };

  const sortCategories = useCallback(
    (list: Category[]) =>
      [...list].sort((a, b) => a.name.localeCompare(b.name, "sl", { sensitivity: "base" })),
    []
  );

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const response = await fetch("/api/categories");
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error ?? "Napaka pri nalaganju kategorij.");
        return;
      }
      const normalized = (result.data ?? []).map((category: any) => {
        const slug = category.slug || slugify(category.name ?? category.id ?? category._id);
        return {
          id: category.id ?? category._id ?? slug,
          name: category.name ?? slug ?? "Nepoznana kategorija",
          slug,
          color: category.color,
          order: typeof category.order === "number" ? category.order : undefined,
        };
      });
      setCategories(sortCategories(normalized));
    } catch (error) {
      toast.error("Kategorij ni mogoče pridobiti.");
    } finally {
      setCategoriesLoading(false);
    }
  }, [sortCategories]);

  useEffect(() => {
    fetchProjectList();
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (!categories.length) return;
    setNewProjectCategorySlugs((prev) =>
      prev.filter((slug) => categories.some((category) => category.slug === slug))
    );
  }, [categories]);

  const loadProjectDetails = async (projectId: string) => {
    const response = await fetch(`${API_PREFIX}/${projectId}`);
    const result = await response.json();
    if (!result.success) {
      toast.error(result.error ?? "Projekt ni bil najden.");
      return;
    }
    const mapped = mapProject(result.data);
    setProjectDetails(mapped);
    setSelectedProjectId(mapped.id);
    setTemplates(mapped.templates);
    setCurrentView("workspace");
  };

  const handleSelectProject = (projectId: string) => {
    loadProjectDetails(projectId);
  };

  const handleBackToList = () => {
    setCurrentView("list");
    setSelectedProjectId(null);
    setProjectDetails(null);
  };

  const fetchCrmClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const response = await fetch("/api/crm/clients");
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error ?? "Napaka pri nalaganju strank.");
        return;
      }
      setCrmClients(result.data ?? []);
    } catch (error) {
      toast.error("Ne morem pridobiti strank.");
    } finally {
      setClientsLoading(false);
    }
  }, []);

  const openNewProjectDialog = () => {
    setProjectFormInitial(null);
    setNewProjectDefaults({
      title: `Nov projekt ${projects.length + 1}`,
      requirements: "Dodajte opis projekta",
    });
    setSelectedClientId(null);
    setNewProjectCategorySlugs([]);
    setNewProjectDialogOpen(true);
    if (!crmClients.length) {
      fetchCrmClients();
    }
    if (!categories.length && !categoriesLoading) {
      fetchCategories();
    }
  };

  const handleEditProject = async (project: ProjectSummary) => {
    try {
      const response = await fetch(`${API_PREFIX}/${project.id}`);
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error ?? "Projekt ni bil najden.");
        return;
      }
      const mapped = mapProject(result.data);
      setProjectFormInitial(mapped);
      setNewProjectDefaults({
        title: mapped.title,
        requirements: mapped.requirementsText ?? "",
      });
      setNewProjectCategorySlugs(mapped.categories ?? []);
      setSelectedClientId(mapped.customerDetail?.id ?? null);
      setNewProjectDialogOpen(true);
      if (!crmClients.length) {
        fetchCrmClients();
      }
      if (!categories.length && !categoriesLoading) {
        fetchCategories();
      }
    } catch (error) {
      toast.error("Napaka pri nalaganju projekta.");
    }
  };

  const handleDeleteProject = async (project: ProjectSummary) => {
    try {
      const response = await fetch(`${API_PREFIX}/${project.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error ?? "Projekt ni bil izbrisan.");
        return;
      }
      toast.success("Projekt je bil izbrisan.");
      fetchProjectList();
      if (project.id === selectedProjectId) {
        setSelectedProjectId(null);
        setProjectDetails(null);
      }
    } catch (error) {
      toast.error("Napaka pri brisanju projekta.");
    }
  };

  const handleCreateProject = async ({
    title,
    requirements,
    categories,
  }: {
    title: string;
    requirements: string;
    categories: string[];
  }) => {
    if (!selectedClientId) {
      toast.error("Izberi stranko.");
      return;
    }
    const client = crmClients.find((c) => c.id === selectedClientId);
    if (!client) {
      toast.error("Izbrana stranka ne obstaja.");
      return;
    }

    setIsCreatingProject(true);
    const payload = {
      title,
      requirements,
      categories,
      customer: {
        name: client.name,
        taxId: client.vatNumber,
        address: client.address,
        paymentTerms: globalSettings.defaultPaymentTerms || "30 dni",
      },
      items: [],
      templates: [],
      status: "draft" as ProjectStatus,
    };

    try {
      const response = await fetch(API_PREFIX, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error ?? "Napaka pri ustvarjanju projekta.");
        return;
      }

      const mapped = mapProject(result.data);
      setProjects((prev) => [toSummary(mapped), ...prev]);
      setProjectDetails(mapped);
      setTemplates(mapped.templates);
      setSelectedProjectId(mapped.id);
      setCurrentView("workspace");
      toast.success("Projekt uspešno ustvarjen");
      setNewProjectDialogOpen(false);
      setSelectedClientId(null);
      setProjectFormInitial(null);
      setNewProjectCategorySlugs([]);
    } catch (error) {
      toast.error("Prišlo je do napake pri ustvarjanju projekta.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleUpdateProject = async (
    projectId: string,
    {
      title,
      requirements,
      categories,
    }: {
      title: string;
      requirements: string;
      categories: string[];
    }
  ) => {
    if (!projectFormInitial) {
      toast.error("Projekt ni pripravljen za urejanje.");
      return;
    }

    const selectedClient =
      selectedClientId != null ? crmClients.find((client) => client.id === selectedClientId) : null;
    if (selectedClientId && !selectedClient) {
      toast.error("Izbrana stranka ne obstaja.");
      return;
    }

    const customer =
      selectedClient != null
        ? {
            name: selectedClient.name,
            taxId: selectedClient.vatNumber,
            address: selectedClient.address,
            paymentTerms: globalSettings.defaultPaymentTerms || "30 dni",
          }
        : projectFormInitial.customerDetail;

    setIsCreatingProject(true);
    const payload = {
      title,
      requirements,
      categories,
      customer,
      items: projectFormInitial.items,
      templates: projectFormInitial.templates,
      status: projectFormInitial.status,
    };

    try {
      const response = await fetch(`${API_PREFIX}/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error ?? "Napaka pri posodabljanju projekta.");
        return;
      }

      const mapped = mapProject(result.data);
      setProjects((prev) =>
        prev.map((project) => (project.id === mapped.id ? toSummary(mapped) : project))
      );
      setProjectDetails(mapped);
      setTemplates(mapped.templates);
      setSelectedProjectId(mapped.id);
      toast.success("Projekt je bil posodobljen.");
      setNewProjectDialogOpen(false);
      setProjectFormInitial(null);
      setNewProjectCategorySlugs(mapped.categories ?? []);
    } catch (error) {
      toast.error("Napaka pri posodabljanju projekta.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleAddClient = () => {
    setClientModalOpen(true);
  };

  const handleClientSubmit = async (payload: ClientFormPayload) => {
    const response = await fetch("/api/crm/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error ?? "Prišlo je do napake pri shranjevanju stranke.");
    }

    const createdClient = result.data as Client;
    setCrmClients((prev) => {
      if (!prev.some((client) => client.id === createdClient.id)) {
        return [createdClient, ...prev];
      }
      return prev.map((client) => (client.id === createdClient.id ? createdClient : client));
    });
    setSelectedClientId(createdClient.id);

    toast.success(
      createdClient?.name
        ? `Stranka ${createdClient.name} je bila dodana.`
        : "Stranka je bila dodana."
    );
  };

  const handleSaveTemplate = (template: Template) => {
    setTemplates((prev) => {
      const existing = prev.find((t) => t.id === template.id);
      const nextTemplates = existing
        ? prev.map((t) => (t.id === template.id ? template : t))
        : [...prev, template];

      setProjectDetails((detail) => (detail ? { ...detail, templates: nextTemplates } : detail));
      return nextTemplates;
    });
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => {
      const nextTemplates = prev.filter((t) => t.id !== id);
      setProjectDetails((detail) => (detail ? { ...detail, templates: nextTemplates } : detail));
      return nextTemplates;
    });
    toast.success("Predloga izbrisana");
  };

  const handleSetDefaultTemplate = (id: string) => {
    setTemplates((prev) => {
      const nextTemplates = prev.map((t) => ({
        ...t,
        isDefault: t.id === id,
      }));
      setProjectDetails((detail) => (detail ? { ...detail, templates: nextTemplates } : detail));
      return nextTemplates;
    });
    toast.success("Privzeta predloga nastavljena");
  };

  const handleProjectUpdate = async (path: string, options?: RequestInit) => {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    const result = await response.json();
    if (!result.success) {
      toast.error(result.error ?? "Napaka pri shranjevanju projekta.");
      return null;
    }
    const mapped = mapProject(result.data);
    setProjectDetails(mapped);
    setProjects((prev) => prev.map((proj) => (proj.id === mapped.id ? toSummary(mapped) : proj)));
    setTemplates(mapped.templates);
    return mapped;
  };

  return (
    <>
      {currentView === "list" && (
        <div className="min-h-screen bg-background p-6">
          <div className="mx-auto max-w-[1280px]">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="m-0">Projekti</h1>
              <div className="flex items-center gap-2">
                <Button onClick={openNewProjectDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nov projekt
                </Button>
                <Button variant="ghost" onClick={handleAddClient}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Dodaj stranko
                </Button>
                <Button variant="outline" onClick={() => setCurrentView("settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Nastavitve
                </Button>
              </div>
            </div>
            <ProjectList
              projects={projects}
              onSelectProject={handleSelectProject}
              categories={categories}
              onEditProject={handleEditProject}
              onDeleteProject={handleDeleteProject}
            />
          </div>
        </div>
      )}

      {currentView === "workspace" && projectDetails && (
        <ProjectWorkspace
          key={projectDetails.id}
          projectId={projectDetails.id}
          initialProject={projectDetails}
          templates={templates}
          onBack={handleBackToList}
          onProjectUpdate={handleProjectUpdate}
        />
      )}

      {currentView === "settings" && (
        <div className="min-h-screen bg-background p-6">
          <div className="mx-auto max-w-[1280px]">
            <div className="mb-6">
              <Button variant="ghost" onClick={() => setCurrentView("list")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Nazaj na projekte
              </Button>
            </div>
            <Tabs defaultValue="templates">
              <TabsList>
                <TabsTrigger value="templates">PDF Predloge</TabsTrigger>
                <TabsTrigger value="general">Splošno</TabsTrigger>
                <TabsTrigger value="integrations">Integracije</TabsTrigger>
              </TabsList>
              <TabsContent value="templates" className="mt-6">
                <TemplateEditor
                  templates={templates}
                  onSave={handleSaveTemplate}
                  onDelete={handleDeleteTemplate}
                  onSetDefault={handleSetDefaultTemplate}
                />
              </TabsContent>
              <TabsContent value="general" className="mt-6">
                <div className="py-12 text-center text-muted-foreground">
                  Nastavitve bodo na voljo v naslednji iteraciji.
                </div>
              </TabsContent>
              <TabsContent value="integrations" className="mt-6">
                <div className="py-12 text-center text-muted-foreground">
                  Integracije bodo na voljo v naslednji iteraciji.
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <NewProjectDialog
        open={isNewProjectDialogOpen}
        onOpenChange={(open) => {
          setNewProjectDialogOpen(open);
          if (!open) {
            setSelectedClientId(null);
            setNewProjectCategorySlugs([]);
            setProjectFormInitial(null);
          }
        }}
        defaultTitle={newProjectDefaults.title}
        defaultRequirements={newProjectDefaults.requirements}
        clients={crmClients}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        isLoadingClients={clientsLoading}
        isSubmitting={isCreatingProject}
        onAddClient={handleAddClient}
        onReloadClients={fetchCrmClients}
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        categories={categories}
        selectedCategorySlugs={newProjectCategorySlugs}
        onSelectCategories={setNewProjectCategorySlugs}
        isLoadingCategories={categoriesLoading}
        initialProject={projectFormInitial}
      />
      {clientPortalContainer &&
        createPortal(
          <ClientForm
            open={isClientModalOpen}
            onClose={() => setClientModalOpen(false)}
            onSubmit={handleClientSubmit}
            onSuccess={() => setClientModalOpen(false)}
          />,
          clientPortalContainer,
        )}
      <Toaster />
    </>
  );
}
