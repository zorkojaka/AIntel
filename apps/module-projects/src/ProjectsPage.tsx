import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClientForm, ClientFormPayload, Client } from "@aintel/module-crm";
import { useSettingsData } from "@aintel/module-settings";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ProjectList } from "./components/ProjectList";
import { ProjectFilters } from "./components/ProjectFilters";
import { ProjectKanban } from "./components/ProjectKanban";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { Toaster } from "./components/ui/sonner";
import { Button } from "./components/ui/button";
import { Category, ProjectDetails, ProjectSummary, Template, ProjectStatus } from "./types";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { mapProject } from "./domains/core/useProject";
import { canAccessPreparation } from "@aintel/shared/utils/preparationAccess";

const API_PREFIX = "/api/projects";
const VIEW_STORAGE_KEY = "projects:view-mode";
const VALID_TABS = ["items", "offers", "logistics", "execution", "closing"] as const;
type WorkspaceTab = (typeof VALID_TABS)[number];
const shownForbiddenProjectToasts = new Set<string>();

function parseWorkspaceTab(value: string | null): WorkspaceTab | null {
  if (!value) return null;
  return (VALID_TABS as readonly string[]).includes(value) ? (value as WorkspaceTab) : null;
}

function toSummary(project: ProjectDetails): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    customer: project.customer,
    status: project.status,
    offerAmount: project.offerAmount,
    quotedTotal: project.quotedTotal,
    quotedVat: project.quotedVat,
    quotedTotalWithVat: project.quotedTotalWithVat,
    invoiceAmount: project.invoiceAmount,
    createdAt: project.createdAt,
    categories: project.categories ?? [],
    requirementsTemplateVariantSlug: project.requirementsTemplateVariantSlug,
  };
}

function getNextProjectCode(projects: ProjectSummary[]) {
  const maxProjectNumber = projects.reduce((max, project) => {
    if (typeof project.projectNumber === "number" && Number.isFinite(project.projectNumber)) {
      return Math.max(max, project.projectNumber);
    }
    const match = project.id?.match(/^PRJ-(\d+)$/);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  return `PRJ-${String(maxProjectNumber + 1).padStart(3, "0")}`;
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

export function ProjectsPage() {
  const { settings: globalSettings } = useSettingsData({ applyTheme: false });
  const [viewerRoles, setViewerRoles] = useState<string[]>([]);
  const [viewerRolesLoaded, setViewerRolesLoaded] = useState(false);
  const [currentView, setCurrentView] = useState<"list" | "workspace">("list");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [initialWorkspaceTab, setInitialWorkspaceTab] = useState<"items" | "offers" | "logistics" | "execution" | "closing" | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isClientModalOpen, setClientModalOpen] = useState(false);
  const [isNewProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectFormInitial, setProjectFormInitial] = useState<ProjectDetails | null>(null);
  const [crmClients, setCrmClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [projectsViewMode, setProjectsViewMode] = useState<"list" | "kanban">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [newProjectCategorySlugs, setNewProjectCategorySlugs] = useState<string[]>([]);
  const [newProjectDefaults, setNewProjectDefaults] = useState({
    requirements: "Dodajte opis projekta",
  });
  const [clientPortalContainer, setClientPortalContainer] = useState<HTMLElement | null>(null);
  const initialProjectFromUrlHandledRef = useRef(false);
  const isExecutionOnlyViewer = useMemo(() => {
    const roleSet = new Set(viewerRoles);
    const isExecution = roleSet.has("EXECUTION");
    const hasPrivileged =
      roleSet.has("ADMIN") || roleSet.has("SALES") || roleSet.has("FINANCE") || canAccessPreparation(viewerRoles);
    return isExecution && !hasPrivileged;
  }, [viewerRoles]);
  const canAccessPreparationPhase = useMemo(() => canAccessPreparation(viewerRoles), [viewerRoles]);
  const allowedWorkspaceTabs = useMemo<WorkspaceTabValue[] | undefined>(() => {
    if (isExecutionOnlyViewer) {
      return ["items", "execution"];
    }
    if (!canAccessPreparationPhase) {
      return ["items", "offers", "execution", "closing"];
    }
    return undefined;
  }, [canAccessPreparationPhase, isExecutionOnlyViewer]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      setClientPortalContainer(document.body);
    }
  }, []);

  useEffect(() => {
    const persisted = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (persisted === "list" || persisted === "kanban") {
      setProjectsViewMode(persisted);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchMe = async () => {
      try {
        const response = await fetch("/api/auth/me");
        const result = await response.json();
        if (cancelled || !result?.success) {
          if (!cancelled) {
            setViewerRolesLoaded(true);
          }
          return;
        }
        const roles = Array.isArray(result?.data?.employee?.roles) ? result.data.employee.roles : [];
        setViewerRoles(roles);
        setViewerRolesLoaded(true);
      } catch {
        if (!cancelled) {
          setViewerRoles([]);
          setViewerRolesLoaded(true);
        }
      }
    };
    fetchMe();
    return () => {
      cancelled = true;
    };
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
    try {
      const response = await fetch(API_PREFIX);
      const result = await response.json();
      if (!result.success) {
        toast.error(result.error ?? "Napaka pri nalaganju projektov.");
        return;
      }
      setProjects(result.data as ProjectSummary[]);
    } catch {
      toast.error("Napaka pri nalaganju projektov.");
    } finally {
      setProjectsLoaded(true);
    }
  };

  const sortCategories = useCallback(
    (list: Category[]) =>
      [...list].sort((a, b) => a.name.localeCompare(b.name, "sl", { sensitivity: "base" })),
    []
  );

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const response = await fetch("/api/categories/project-options");
      const result = await response.json();
      const normalized = (result?.options ?? []).map((option: any) => ({
        id: option.slug,
        name: option.label ?? option.slug,
        slug: option.slug
      }));
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
      if (response.status === 403) {
        if (!shownForbiddenProjectToasts.has(projectId)) {
          shownForbiddenProjectToasts.add(projectId);
          toast.error("Nimaš dostopa do izbranega projekta.");
        }
        handleBackToList();
      } else {
        toast.error(result.error ?? "Projekt ni bil najden.");
      }
      return;
    }
    shownForbiddenProjectToasts.delete(projectId);
    const mapped = mapProject(result.data);
    setProjectDetails(mapped);
    setSelectedProjectId(mapped.id);
    setTemplates(mapped.templates);
    setCurrentView("workspace");
  };

  useEffect(() => {
    if (initialProjectFromUrlHandledRef.current) return;
    if (!projectsLoaded) return;
    if (!viewerRolesLoaded) return;

    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("projectId");
    if (!projectId) {
      initialProjectFromUrlHandledRef.current = true;
      return;
    }
    const tab = parseWorkspaceTab(params.get("tab"));
    if (tab) {
      if (tab === "logistics" && !canAccessPreparationPhase) {
        toast.error("Nimaš dostopa do faze Priprava.");
      } else {
        setInitialWorkspaceTab(tab);
      }
    }

    if (isExecutionOnlyViewer) {
      const isAssignedProject = projects.some((project) => project.id === projectId);
      if (!isAssignedProject) {
        initialProjectFromUrlHandledRef.current = true;
        if (!shownForbiddenProjectToasts.has(projectId)) {
          shownForbiddenProjectToasts.add(projectId);
          toast.error("Nimaš dostopa do izbranega projekta.");
        }
        handleBackToList();
        return;
      }
    }

    initialProjectFromUrlHandledRef.current = true;
    void loadProjectDetails(projectId);
  }, [projectsLoaded, projects, isExecutionOnlyViewer, viewerRolesLoaded, canAccessPreparationPhase]);

  const handleSelectProject = (projectId: string) => {
    setInitialWorkspaceTab(isExecutionOnlyViewer ? "execution" : null);
    loadProjectDetails(projectId);
  };

  const handleBackToList = () => {
    setCurrentView("list");
    setSelectedProjectId(null);
    setProjectDetails(null);
    setInitialWorkspaceTab(null);
    if (window.location.search) {
      window.history.replaceState({ moduleId: "projects" }, "", "/projects");
    }
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
        setTemplates([]);
        setCurrentView("list");
      }
    } catch (error) {
      toast.error("Napaka pri brisanju projekta.");
    }
  };

  const handleCreateProject = async ({
    title,
    requirements,
    categories,
    clientId,
    client: providedClient,
  }: {
    title: string;
    requirements: string;
    categories: string[];
    clientId: string;
    client?: Client;
  }) => {
    if (!clientId) {
      toast.error("Izberi stranko.");
      return;
    }
    const client = crmClients.find((c) => c.id === clientId) ?? providedClient ?? null;
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

      let mapped = mapProject(result.data);
      const finalCategoryNames = categories
        .map((slug) => categoryLookup.get(slug) ?? slug)
        .filter(Boolean);
      const finalTitle = buildProjectTitle(mapped.id, finalCategoryNames, client.name);

      if (mapped.title !== finalTitle) {
        const updateResponse = await fetch(`${API_PREFIX}/${mapped.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: finalTitle,
            requirements,
            categories,
            customer: {
              name: client.name,
              taxId: client.vatNumber,
              address: client.address,
              paymentTerms: globalSettings.defaultPaymentTerms || "30 dni",
            },
            items: mapped.items,
            templates: mapped.templates,
            status: mapped.status,
          }),
        });
        const updateResult = await updateResponse.json();
        if (updateResult.success) {
          mapped = mapProject(updateResult.data);
        }
      }

      setProjects((prev) => [toSummary(mapped), ...prev]);
      setProjectDetails(mapped);
      setTemplates(mapped.templates);
      setSelectedProjectId(mapped.id);
      setInitialWorkspaceTab("offers");
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
      clientId,
      client,
    }: {
      title: string;
      requirements: string;
      categories: string[];
      clientId?: string | null;
      client?: Client;
    }
  ) => {
    if (!projectFormInitial) {
      toast.error("Projekt ni pripravljen za urejanje.");
      return;
    }

    const selectedClient =
      clientId != null ? crmClients.find((entry) => entry.id === clientId) ?? client ?? null : null;
    if (clientId && !selectedClient) {
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
    return createdClient;
  };

  const handleProjectUpdate = useCallback(
    async (path: string, options?: RequestInit) => {
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
    },
    [setProjectDetails, setProjects, setTemplates],
  );

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => map.set(category.slug, category.name));
    return map;
  }, [categories]);
  const suggestedProjectCode = useMemo(() => getNextProjectCode(projects), [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const matchesSearch =
        normalizedQuery.length === 0 ||
        project.title.toLowerCase().includes(normalizedQuery) ||
        project.customer.toLowerCase().includes(normalizedQuery);
      const matchesPhase =
        phaseFilter === "all" ||
        project.status === phaseFilter ||
        (phaseFilter === "completed" && project.status === "invoiced");
      const matchesCategory =
        categoryFilter === "all" || project.categories.some((categorySlug) => categorySlug === categoryFilter);
      return matchesSearch && matchesPhase && matchesCategory;
    });
  }, [projects, searchQuery, phaseFilter, categoryFilter]);

  const handleViewModeChange = (mode: "list" | "kanban") => {
    setProjectsViewMode(mode);
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
  };

  const handleProjectDrop = useCallback(
    async (projectId: string, nextStatus: ProjectStatus) => {
      const previous = projects;
      const project = projects.find((entry) => entry.id === projectId);
      if (!project || project.status === nextStatus) return;

      const nextProjects = projects.map((entry) =>
        entry.id === projectId ? { ...entry, status: nextStatus } : entry
      );
      setProjects(nextProjects);

      try {
        const response = await fetch(`${API_PREFIX}/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const result = await response.json();
        if (!result.success) {
          setProjects(previous);
          toast.error(result.error ?? "Statusa ni bilo mogoče posodobiti.");
          return;
        }
      } catch {
        setProjects(previous);
        toast.error("Statusa ni bilo mogoče posodobiti.");
      }
    },
    [projects],
  );

  return (
    <>
      {currentView === "list" && (
        <div className="min-h-screen bg-background px-3 py-4 md:p-6">
          <div className="projects-page-shell">
            <div className="projects-page-topbar mb-4 flex flex-col gap-3 md:mb-6 md:flex-row md:items-center md:justify-between">
              <h1 className="m-0">Projekti</h1>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="view-toggle">
                  <button
                    className={`vt-btn ${projectsViewMode === "list" ? "active" : ""}`}
                    id="vt-list"
                    type="button"
                    onClick={() => handleViewModeChange("list")}
                  >
                    ☰ Seznam
                  </button>
                  <button
                    className={`vt-btn ${projectsViewMode === "kanban" ? "active" : ""}`}
                    id="vt-kanban"
                    type="button"
                    onClick={() => handleViewModeChange("kanban")}
                  >
                    ⊞ Kanban
                  </button>
                </div>
                {!isExecutionOnlyViewer ? (
                  <>
                    <Button onClick={openNewProjectDialog}>
                      <Plus className="mr-2 h-4 w-4" />
                      Nov projekt
                    </Button>
                    <Button variant="ghost" onClick={handleAddClient}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Dodaj stranko
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="mb-4">
              <ProjectFilters
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                phaseFilter={phaseFilter}
                onPhaseFilterChange={setPhaseFilter}
                categoryFilter={categoryFilter}
                onCategoryFilterChange={setCategoryFilter}
                categories={categories}
              />
            </div>
            {projectsViewMode === "list" ? (
              <ProjectList
                projects={projects}
                filteredProjects={filteredProjects}
                hideFilters
                onSelectProject={handleSelectProject}
                categories={categories}
                onEditProject={handleEditProject}
                onDeleteProject={handleDeleteProject}
                readOnly={isExecutionOnlyViewer}
              />
            ) : (
              <ProjectKanban
                projects={filteredProjects}
                categoryLookup={categoryLookup}
                onSelectProject={handleSelectProject}
                onProjectDrop={handleProjectDrop}
              />
            )}
          </div>
        </div>
      )}

      {currentView === "workspace" && projectDetails && (
        <ProjectWorkspace
          key={projectDetails.id}
          projectId={projectDetails.id}
          initialProject={projectDetails}
          initialTab={initialWorkspaceTab ?? undefined}
          templates={templates}
          onBack={handleBackToList}
          onProjectUpdate={handleProjectUpdate}
          onNewProject={openNewProjectDialog}
          brandColor={globalSettings?.primaryColor}
          allowedTabs={allowedWorkspaceTabs}
        />
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
        defaultRequirements={newProjectDefaults.requirements}
        suggestedProjectCode={suggestedProjectCode}
        clients={crmClients}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        isLoadingClients={clientsLoading}
        isSubmitting={isCreatingProject}
        onCreateClient={handleClientSubmit}
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
            onSubmit={async (payload) => {
              await handleClientSubmit(payload);
            }}
            onSuccess={() => setClientModalOpen(false)}
          />,
          clientPortalContainer,
        )}
      <Toaster />
    </>
  );
}


