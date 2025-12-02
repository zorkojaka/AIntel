import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Template } from "../../components/TemplateEditor";
import { ProjectDetails } from "../../types";

export type UseProjectResult = {
  project: ProjectDetails | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  setProject: (updater: (prev: ProjectDetails) => ProjectDetails) => void;
};

export const DEFAULT_TEMPLATES: Template[] = [
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
    <h1>Ponudba</h1>
    <p>Za projekt: {{project.title}}</p>
  </div>

  <div class="info-grid">
    <div class="info-section">
      <h3>Stranka</h3>
      <p>{{customer.name}}</p>
      <p>{{customer.address}}</p>
      <p>ID za DDV: {{customer.taxId}}</p>
    </div>
    <div class="info-section">
      <h3>Projekt</h3>
      <p>ID: {{project.id}}</p>
      <p>{{project.description}}</p>
    </div>
  </div>

  <table>
    <tr>
      <th>Postavka</th>
      <th>Količina</th>
      <th>Cena</th>
      <th>DDV</th>
      <th>Skupaj</th>
    </tr>
    {{items}}
  </table>

  <div class="totals">
    <div class="row">
      <span>Skupaj brez DDV:</span>
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

export function mapProject(data: any): ProjectDetails {
  const requirementsArray = Array.isArray(data.requirements) ? data.requirements : [];
  const requirementsText = !Array.isArray(data.requirements) && typeof data.requirements === "string"
    ? data.requirements
    : "";
  return {
    id: data.id,
    title: data.title,
    customer: data.customer?.name ?? data.customer ?? "",
    status: data.status,
    offerAmount: data.offerAmount ?? 0,
    invoiceAmount: data.invoiceAmount ?? 0,
    createdAt: data.createdAt,
    customerDetail: data.customer ?? { name: data.customer ?? "" },
    requirements: requirementsArray,
    requirementsText,
    items: data.items ?? [],
    offers: data.offers ?? [],
    workOrders: data.workOrders ?? [],
    purchaseOrders: data.purchaseOrders ?? [],
    deliveryNotes: data.deliveryNotes ?? [],
    timelineEvents: data.timeline ?? data.timelineEvents ?? [],
    templates: data.templates && data.templates.length > 0 ? data.templates : DEFAULT_TEMPLATES,
    categories: Array.isArray(data.categories) ? data.categories : [],
    requirementsTemplateVariantSlug: data.requirementsTemplateVariantSlug,
  };
}

export function useProject(projectId: string, initialProject?: ProjectDetails | null): UseProjectResult {
  const [project, setProjectState] = useState<ProjectDetails | null>(initialProject ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const result = await response.json();
      if (!result.success) {
        const message = result.error ?? "Projekt ni bil najden.";
        setError(new Error(message));
        toast.error(message);
        setProjectState(null);
        return;
      }
      const mapped = mapProject(result.data);
      setProjectState(mapped);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Napaka pri nalaganju projekta.");
      setError(error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    await fetchProject();
  }, [fetchProject]);

  const setProject = useCallback(
    (updater: (prev: ProjectDetails) => ProjectDetails) => {
      setProjectState((prev) => {
        if (!prev) return prev;
        return updater(prev);
      });
    },
    []
  );

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return { project, loading, error, refresh, setProject };
}
