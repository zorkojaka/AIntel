import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useFinanceInvoices } from "./hooks/useFinanceAnalytics";

export function FinanceInvoicesPage() {
  const { data, isLoading } = useFinanceInvoices();

  const handleDownload = async (invoice: any) => {
    const response = await fetch(`/api/projects/${invoice.projectId}/invoices/${invoice.invoiceId}/pdf`);
    if (!response.ok) return;
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `racun-${invoice.projectId}-${invoice.invoiceId}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4">
      <div className="text-lg font-semibold mb-4">Izdani računi</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2">Datum</th>
              <th className="py-2">Projekt</th>
              <th className="py-2">Stranka</th>
              <th className="py-2">Znesek</th>
              <th className="py-2">PDF</th>
            </tr>
          </thead>
          <tbody>
            {data.map((invoice: any) => (
              <tr key={invoice.invoiceId} className="border-t">
                <td className="py-2">{invoice.dateIssued ? new Date(invoice.dateIssued).toLocaleDateString() : ""}</td>
                <td className="py-2">{invoice.projectName}</td>
                <td className="py-2">{invoice.customerName}</td>
                <td className="py-2">{invoice.totalWithVat?.toFixed(2)} €</td>
                <td className="py-2">
                  <Button size="sm" variant="outline" onClick={() => handleDownload(invoice)} disabled={!invoice.pdfAvailable}>
                    Prenesi
                  </Button>
                </td>
              </tr>
            ))}
            {data.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted-foreground">
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
