import { useEffect, useState } from "react";
import { ProjectList } from "./components/ProjectList";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { TemplateEditor, Template } from "./components/TemplateEditor";
import type {
  Project,
  ProjectItem,
  ProjectOffer,
  ProjectTimelineEvent,
  ProjectWorkOrder,
} from "./types";
import { Toaster } from "./components/ui/sonner";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Settings, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createProject,
  fetchProjectDetail,
  fetchProjects,
  type ProjectDetail,
} from "./api/projects";

const fallbackProjects: Project[] = [
  {
    id: "PRJ-001",
    title: "Hotel Dolenjc – kamere",
    customer: "Hotel Dolenjc d.o.o.",
    status: "offered",
    offerAmount: 2120,
    invoiceAmount: 0,
    createdAt: "08.11.2024",
  },
  {
    id: "PRJ-002",
    title: "Poslovni center – požarni alarm",
    customer: "ABC Nepremičnine",
    status: "in-progress",
    offerAmount: 8450,
    invoiceAmount: 4225,
    createdAt: "22.10.2024",
  },
  {
    id: "PRJ-003",
    title: "Trgovina – LED razsvetljava",
    customer: "Mega Market",
    status: "completed",
    offerAmount: 3200,
    invoiceAmount: 3200,
    createdAt: "15.09.2024",
  },
];

const fallbackItems: Item[] = [
  {
    id: "item-1",
    name: "DVC IP kamera 4MP",
    sku: "DVC-4MP-001",
    unit: "kos",
    quantity: 4,
    price: 185,
    discount: 0,
    vatRate: 22,
    total: 902.8,
    category: "material",
    description: "IP kamera 4MP z nočnim vidom, H.265 kodiranje",
  },
  {
    id: "item-2",
    name: "UTP Cat6 kabel",
    sku: "UTP-CAT6",
    unit: "m",
    quantity: 50,
    price: 1.2,
    discount: 5,
    vatRate: 22,
    total: 69.54,
    category: "material",
    description: "UTP kabel kategorije 6 za prenos podatkov",
  },
  {
    id: "item-3",
    name: "Montaža in konfiguracija",
    sku: "SRV-INST",
    unit: "h",
    quantity: 8,
    price: 45,
    discount: 0,
    vatRate: 22,
    total: 439.2,
    category: "labor",
    description: "Strokovnjak za montažo in konfiguracijo kamer",
  },
  {
    id: "item-4",
    name: "NVR 8-kanalni",
    sku: "NVR-8CH-2TB",
    unit: "kos",
    quantity: 1,
    price: 320,
    discount: 10,
    vatRate: 22,
    total: 351.36,
    category: "material",
    description: "Network Video Recorder z 2TB diskom",
  },
];

const fallbackOffers: OfferVersion[] = [
  {
    id: "offer-1",
    version: 1,
    status: "sent",
    amount: 1950,
    date: "08.11.2024",
  },
  {
    id: "offer-2",
    version: 2,
    status: "accepted",
    amount: 2120,
    date: "09.11.2024",
    isSelected: true,
  },
];

const fallbackWorkOrders: WorkOrder[] = [
  {
    id: "wo-1",
    team: "Ekipa A - Janez Novak, Marko Horvat",
    schedule: "14.11.2024 08:00",
    location: "Hotel Dolenjc, Tržaška cesta 12, Ljubljana",
    status: "planned",
    notes: "Pripraviti ključe za dostop do tehničnih prostorov",
  },
];

const fallbackTimelineEvents: ProjectTimelineEvent[] = [
  {
    id: "evt-1",
    type: "edit",
    title: "Projekt ustvarjen",
    description: "Nov projekt za Hotel Dolenjc",
    timestamp: "08.11.2024 09:15",
    user: "Admin",
  },
  {
    id: "evt-2",
    type: "offer",
    title: "Ponudba v1 ustvarjena",
    description: "Prva verzija ponudbe pripravljena",
    timestamp: "08.11.2024 10:30",
    user: "Admin",
    metadata: { amount: "€ 1.950", status: "sent" },
  },
  {
    id: "evt-3",
    type: "offer",
    title: "Ponudba v2 ustvarjena",
    description: "Posodobljena verzija ponudbe z dodanimi postavkami",
    timestamp: "09.11.2024 14:20",
    user: "Admin",
    metadata: { amount: "€ 2.120", status: "accepted" },
  },
  {
    id: "evt-4",
    type: "status-change",
    title: "Status spremenjen",
    description: "Projekt prešel v fazo 'Ponujeno'",
    timestamp: "09.11.2024 14:25",
    user: "Admin",
  },
  {
    id: "evt-5",
    type: "execution",
    title: "Delovni nalog ustvarjen",
    description: "Načrtovana montaža za 14.11.2024",
    timestamp: "10.11.2024 09:00",
    user: "Admin",
    metadata: { team: "Ekipa A" },
  },
];

const FALLBACK_REQUIREMENTS =
  "Postavitev 4 IP kamer DVC za nadzor vhoda in parkirišča. Vodenje kablov po stenah, postavitev NVR, konfiguracija.";

function buildFallbackDetail(projectId: string): ProjectDetail | null {
  const summary = fallbackProjects.find((project) => project.id === projectId);
  if (!summary) {
    return null;
  }

  return {
    ...summary,
    city: "Ljubljana",
    requirements: FALLBACK_REQUIREMENTS,
    customerInfo: {
      name: summary.customer,
      taxId: "SI12345678",
      address: "Tržaška cesta 12, 1000 Ljubljana",
      paymentTerms: "30 dni",
    },
    items: fallbackItems,
    offers: fallbackOffers,
    workOrders: fallbackWorkOrders,
    timeline: fallbackTimelineEvents,
  };
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "tpl-default-offer",
    name: "Standardna ponudba",
    description: "Privzeta predloga za vse ponudbe",
    category: "offer",
    content: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Inter', sans-serif; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { margin-bottom: 40px; border-bottom: 2px solid #2563EB; padding-bottom: 20px; }
    .header h1 { color: #2563EB; margin: 0 0 10px 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px; }
    .info-section h3 { color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 10px 0; }
    .info-section p { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
    th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .totals { margin-top: 30px; text-align: right; }
    .totals .row { display: flex; justify-content: flex-end; gap: 100px; padding: 8px 0; }
    .totals .total { font-weight: bold; font-size: 18px; color: #2563EB; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Ponudba #{{offerVersion}}</h1>
    <p>{{projectTitle}}</p>
  </div>

  <div class="info-grid">
    <div class="info-section">
      <h3>Stranka</h3>
      <p><strong>{{customerName}}</strong></p>
      <p>{{customerAddress}}</p>
      <p>ID za DDV: {{customerTaxId}}</p>
    </div>
    <div class="info-section">
      <h3>Podrobnosti ponudbe</h3>
      <p>Datum: {{offerDate}}</p>
      <p>Projekt ID: {{projectId}}</p>
      <p>Veljavnost: 30 dni</p>
    </div>
  </div>

  <div class="description">
    <h3>Opis projekta</h3>
    <p>{{projectDescription}}</p>
  </div>

  <h3>Postavke</h3>
  <table>
    <thead>
      <tr>
        <th>Opis</th>
        <th>Količina</th>
        <th>Enota</th>
        <th style="text-align: right">Cena</th>
        <th style="text-align: right">DDV</th>
        <th style="text-align: right">Skupaj</th>
      </tr>
    </thead>
    <tbody>
      {{items}}
    </tbody>
  </table>

  <div class="totals">
    <div class="row">
      <span>Neto znesek:</span>
      <span>€ {{totalNet}}</span>
    </div>
    <div class="row">
      <span>DDV:</span>
      <span>€ {{totalVAT}}</span>
    </div>
    <div class="row total">
      <span>Skupaj z DDV:</span>
      <span>€ {{totalGross}}</span>
    </div>
  </div>

  <div class="footer">
    <p>Plačilni pogoji: {{paymentTerms}}</p>
    <p>Zahvaljujemo se vam za zaupanje!</p>
  </div>
</body>
</html>`,
    isDefault: true,
    createdAt: "2024-11-01T10:00:00",
    updatedAt: "2024-11-01T10:00:00",
  },
];

export function ProjectsPage() {
  const [currentView, setCurrentView] = useState<"list" | "workspace" | "settings">("list");
  const [projects, setProjects] = useState<Project[]>(fallbackProjects);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      setIsLoadingList(true);
      try {
        const remoteProjects = await fetchProjects();
        if (!isMounted) return;
        setProjects(remoteProjects);
        setListError(null);
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "API ni dosegljiv.";
        setListError(message);
        setProjects(fallbackProjects);
        toast.warning(`API /projects ni dosegljiv (${message}). Prikazujemo demo podatke.`);
      } finally {
        if (isMounted) {
          setIsLoadingList(false);
        }
      }
    }

    loadProjects();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectProject = async (projectId: string) => {
    setCurrentView("workspace");
    setIsLoadingProject(true);
    setSelectedProject(null);

    try {
      const detail = await fetchProjectDetail(projectId);
      setSelectedProject(detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : "API ni dosegljiv.";
      toast.warning(`API /projects/${projectId} ni dosegljiv (${message}). Prikazujemo demo podatke.`);
      const fallback = buildFallbackDetail(projectId);
      if (fallback) {
        setSelectedProject(fallback);
      } else {
        toast.error(`Projekt ${projectId} ni na voljo.`);
        setCurrentView("list");
      }
    } finally {
      setIsLoadingProject(false);
    }
  };

  const handleBackToList = () => {
    setSelectedProject(null);
    setCurrentView("list");
  };

  const handleNewProject = async () => {
    const title = window.prompt("Vnesi naziv novega projekta");
    if (!title) {
      return;
    }

    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      toast.error("Naziv projekta je obvezen.");
      return;
    }

    const customerName = window.prompt("Naziv stranke", "Nova stranka") ?? "Neznana stranka";
    const normalizedCustomer = customerName.trim() || "Neznana stranka";

    try {
      const detail = await createProject({
        title: normalizedTitle,
        customer: { name: normalizedCustomer },
        requirements: FALLBACK_REQUIREMENTS,
      });
      setProjects((prev) => [detail, ...prev]);
      setSelectedProject(detail);
      setCurrentView("workspace");
      toast.success("Nov projekt uspešno ustvarjen");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Neznana napaka.";
      toast.error(`Napaka pri ustvarjanju projekta: ${message}`);
    }
  };

  const handleSaveTemplate = (template: Template) => {
    setTemplates((prev) => {
      const existing = prev.find((t) => t.id === template.id);
      if (existing) {
        return prev.map((t) => (t.id === template.id ? template : t));
      }
      return [...prev, template];
    });
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success("Predloga izbrisana");
  };

  const handleSetDefaultTemplate = (id: string) => {
    setTemplates((prev) =>
      prev.map((t) => ({
        ...t,
        isDefault: t.id === id,
      }))
    );
    toast.success("Privzeta predloga nastavljena");
  };

  const handleProjectUpdated = (detail: ProjectDetail) => {
    setSelectedProject(detail);
    setProjects((prev) =>
      prev.map((project) =>
        project.id === detail.id
          ? {
              ...project,
              title: detail.title,
              customer: detail.customer,
              status: detail.status,
              offerAmount: detail.offerAmount,
              invoiceAmount: detail.invoiceAmount,
            }
          : project
      )
    );
  };

  return (
    <>
      {currentView === "list" && (
        <div className="min-h-screen bg-background p-6">
          <div className="mx-auto max-w-[1280px]">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="m-0">Projekti</h1>
              <div className="flex items-center gap-2">
                <Button onClick={handleNewProject}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nov projekt
                </Button>
                <Button variant="outline" onClick={() => setCurrentView("settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Nastavitve
                </Button>
              </div>
            </div>
            {listError && (
              <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                API /projects ni dosegljiv ({listError}). Prikazani so demo podatki.
              </div>
            )}
            {isLoadingList ? (
              <div className="rounded border border-dashed p-8 text-center text-muted-foreground">
                Nalaganje projektov...
              </div>
            ) : (
              <ProjectList projects={projects} onSelectProject={handleSelectProject} />
            )}
          </div>
        </div>
      )}

      {currentView === "workspace" && (
        <>
          {isLoadingProject && !selectedProject ? (
            <div className="min-h-screen bg-background p-6">
              <div className="mx-auto max-w-[1280px] text-center text-muted-foreground">
                Nalaganje projekta...
              </div>
            </div>
          ) : selectedProject ? (
            <ProjectWorkspace
              projectId={selectedProject.id}
              projectTitle={selectedProject.title}
              customer={selectedProject.customerInfo}
              items={selectedProject.items}
              offers={selectedProject.offers}
              workOrders={selectedProject.workOrders}
              timelineEvents={selectedProject.timeline}
              status={selectedProject.status}
              requirementsText={selectedProject.requirements}
              templates={templates}
              onBack={handleBackToList}
              onProjectUpdated={handleProjectUpdated}
            />
          ) : (
            <div className="min-h-screen bg-background p-6">
              <div className="mx-auto max-w-[1280px] text-center text-muted-foreground">
                Izberite projekt v seznamu.
              </div>
            </div>
          )}
        </>
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
                  Splošne nastavitve bodo na voljo kmalu
                </div>
              </TabsContent>
              <TabsContent value="integrations" className="mt-6">
                <div className="py-12 text-center text-muted-foreground">
                  AI integracije in API povezave bodo na voljo kmalu
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <Toaster />
    </>
  );
}
