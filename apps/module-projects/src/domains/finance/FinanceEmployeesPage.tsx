import { Card } from "../../components/ui/card";
import { useEmployeesSummary } from "./hooks/useFinanceAnalytics";

export function FinanceEmployeesPage() {
  const { data, isLoading } = useEmployeesSummary();

  return (
    <Card className="p-4">
      <div className="text-lg font-semibold mb-4">Zaposleni</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2">Zaposleni</th>
              <th className="py-2">Ure</th>
              <th className="py-2">Št. projektov</th>
              <th className="py-2">Strošek dela</th>
            </tr>
          </thead>
          <tbody>
            {data.map((employee: any) => (
              <tr key={employee.employeeId} className="border-t">
                <td className="py-2 font-medium">{employee.employeeName}</td>
                <td className="py-2">{employee.totalHours?.toFixed(2)}</td>
                <td className="py-2">{employee.projectsCount}</td>
                <td className="py-2">{employee.labourCostWithoutVat?.toFixed(2)} €</td>
              </tr>
            ))}
            {data.length === 0 && !isLoading && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
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
