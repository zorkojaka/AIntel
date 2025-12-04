import { Card } from "../../components/ui/card";
import { useMonthlySummary, useProjectsSummary } from "./hooks/useFinanceAnalytics";

export function FinanceDashboardPage() {
  const { data: projects } = useProjectsSummary();
  const { data: monthly } = useMonthlySummary();

  const totalProjects = projects.length;
  const totalRevenue = projects.reduce((sum, project: any) => sum + (project.revenueWithVat ?? 0), 0);
  const totalProfit = projects.reduce((sum, project: any) => sum + (project.profitWithoutVat ?? 0), 0);
  const materialCost = projects.reduce((sum, project: any) => sum + (project.materialCostWithoutVat ?? 0), 0);
  const labourCost = projects.reduce((sum, project: any) => sum + (project.labourCostWithoutVat ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card className="p-4 space-y-2">
        <div className="text-sm text-muted-foreground">Projekti (mesec)</div>
        <div className="text-3xl font-semibold">{totalProjects}</div>
        <div className="text-sm text-muted-foreground">Skupaj projektov</div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm text-muted-foreground">Prihodki</div>
        <div className="text-3xl font-semibold">{totalRevenue.toFixed(2)} €</div>
        <div className="text-sm text-muted-foreground">Skupaj z DDV</div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm text-muted-foreground">Dobiček</div>
        <div className="text-3xl font-semibold">{totalProfit.toFixed(2)} €</div>
        <div className="text-sm text-muted-foreground">Brez DDV</div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm text-muted-foreground">Material vs delo</div>
        <div className="flex items-baseline gap-3">
          <div>
            <div className="text-2xl font-semibold">{materialCost.toFixed(2)} €</div>
            <div className="text-xs text-muted-foreground">Material</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{labourCost.toFixed(2)} €</div>
            <div className="text-xs text-muted-foreground">Delo</div>
          </div>
        </div>
      </Card>
      <Card className="p-4 space-y-2 md:col-span-2 xl:col-span-2">
        <div className="text-sm text-muted-foreground">Graf projektov po mesecih</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          {monthly.map((entry: any) => (
            <div key={entry.yearMonth} className="rounded-md border p-2">
              <div className="font-medium">{entry.yearMonth}</div>
              <div className="text-muted-foreground">{entry.projectCount} projektov</div>
            </div>
          ))}
          {monthly.length === 0 && <div className="text-muted-foreground">Ni podatkov.</div>}
        </div>
      </Card>
    </div>
  );
}
