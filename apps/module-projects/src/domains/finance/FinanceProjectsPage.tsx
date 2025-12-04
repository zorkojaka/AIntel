import { useProjectsSummary } from "./hooks/useFinanceAnalytics";
import { Card } from "../../components/ui/card";

export function FinanceProjectsPage() {
  const { data, isLoading } = useProjectsSummary();

  return (
    <Card className="p-4">
      <div className="text-lg font-semibold mb-4">Projekti</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2">Projekt</th>
              <th className="py-2">Prihodki</th>
              <th className="py-2">Material</th>
              <th className="py-2">Delo</th>
              <th className="py-2">Dobiček</th>
              <th className="py-2">Marža</th>
            </tr>
          </thead>
          <tbody>
            {data.map((project: any) => (
              <tr key={project.projectId} className="border-t">
                <td className="py-2 font-medium">{project.projectName}</td>
                <td className="py-2">{project.revenueWithVat?.toFixed(2)} €</td>
                <td className="py-2">{project.materialCostWithoutVat?.toFixed(2)} €</td>
                <td className="py-2">{project.labourCostWithoutVat?.toFixed(2)} €</td>
                <td className="py-2">{project.profitWithoutVat?.toFixed(2)} €</td>
                <td className="py-2">{project.profitMarginPercent?.toFixed(1)}%</td>
              </tr>
            ))}
            {data.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-muted-foreground">
                  Ni podatkov.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
