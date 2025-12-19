import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useFinanceInvoices } from "./hooks/useFinanceAnalytics";
import { downloadPdf } from "../../api";
import { toast } from "sonner";

export function FinanceInvoicesPage() {
  const { data, isLoading } = useFinanceInvoices();

  const handleDownload = async (invoice: any) => {
    if (!invoice?.projectId || !invoice?.invoiceId) return;
    try {
      const filename = `racun-${invoice.projectId}-${invoice.invoiceId}.pdf`;
      await downloadPdf(`/api/projects/${invoice.projectId}/invoices/${invoice.invoiceId}/pdf`, filename);
      toast.success("Račun prenesen.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Prenos računa ni uspel.");
    }
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
                    Prenesi PDF
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
