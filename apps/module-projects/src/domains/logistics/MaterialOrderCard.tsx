import type { MaterialOrder, MaterialStatus } from "@aintel/shared/types/logistics";
import type { Employee } from "@aintel/shared/types/employee";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

interface MaterialOrderCardProps {
  materialOrder: MaterialOrder | null;
  nextStatus: MaterialStatus | null;
  onAdvanceStatus: (status: MaterialStatus) => void;
  savingWorkOrder: boolean;
  employees: Employee[];
  assignedEmployeeIds: string[];
  onToggleAssignedEmployee: (employeeId: string) => void;
  onDownloadPurchaseOrder: () => void;
  onDownloadDeliveryNote: () => void;
  onDeliveredQtyChange: (itemId: string, deliveredQty: number) => void;
  onDeliveredQtyCommit: (itemId: string, deliveredQty: number) => void;
  canDownloadPdf: boolean;
  downloadingPdf: "PURCHASE_ORDER" | "DELIVERY_NOTE" | null;
}

export function MaterialOrderCard({
  materialOrder,
  nextStatus,
  onAdvanceStatus,
  savingWorkOrder,
  employees,
  assignedEmployeeIds,
  onToggleAssignedEmployee,
  onDownloadPurchaseOrder,
  onDownloadDeliveryNote,
  onDeliveredQtyChange,
  onDeliveredQtyCommit,
  canDownloadPdf,
  downloadingPdf,
}: MaterialOrderCardProps) {
  if (!materialOrder) {
    return <p className="text-sm text-muted-foreground">Naročilo za material bo ustvarjeno ob potrditvi ponudbe.</p>;
  }

  const missingItemsCount = (materialOrder.items ?? []).filter((item) => {
    const deliveredQty = typeof item.deliveredQty === "number" ? item.deliveredQty : 0;
    return item.quantity - deliveredQty > 0;
  }).length;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Ekipa (material)</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {employees.filter((employee) => employee.active).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ni zaposlenih.</p>
          ) : (
            employees
              .filter((employee) => employee.active)
              .map((employee) => (
                <label key={employee.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={assignedEmployeeIds.includes(employee.id)}
                    onChange={() => onToggleAssignedEmployee(employee.id)}
                  />
                  {employee.name}
                </label>
              ))
          )}
        </div>
      </div>
      {missingItemsCount > 0 && (
        <div className="text-sm text-muted-foreground">Manjkajoce postavke: {missingItemsCount}</div>
      )}
      <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naziv</TableHead>
              <TableHead className="text-right">Količina</TableHead>
              <TableHead>Enota</TableHead>
              <TableHead className="text-right">Dobavljeno</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(materialOrder.items ?? []).map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{item.name}</span>
                    {item.quantity - (typeof item.deliveredQty === "number" ? item.deliveredQty : 0) > 0 && (
                      <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Manjka{" "}
                        {item.quantity - (typeof item.deliveredQty === "number" ? item.deliveredQty : 0)}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={item.quantity}
                    value={typeof item.deliveredQty === "number" ? item.deliveredQty : 0}
                    onChange={(event) => {
                      const raw = Number(event.target.value);
                      const clamped = Number.isFinite(raw) ? Math.min(item.quantity, Math.max(0, raw)) : 0;
                      onDeliveredQtyChange(item.id, clamped);
                    }}
                    onBlur={(event) => {
                      const raw = Number(event.target.value);
                      const clamped = Number.isFinite(raw) ? Math.min(item.quantity, Math.max(0, raw)) : 0;
                      onDeliveredQtyCommit(item.id, clamped);
                    }}
                    className="h-8 w-24 text-right"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDownloadPurchaseOrder}
            disabled={!canDownloadPdf || (downloadingPdf !== null && downloadingPdf !== "PURCHASE_ORDER")}
          >
            {downloadingPdf === "PURCHASE_ORDER" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Prenesi naročilnico
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDownloadDeliveryNote}
            disabled={!canDownloadPdf || (downloadingPdf !== null && downloadingPdf !== "DELIVERY_NOTE")}
          >
            {downloadingPdf === "DELIVERY_NOTE" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Prenesi dobavnico
          </Button>
        </div>
        {nextStatus && (
          <Button
            onClick={() => onAdvanceStatus(nextStatus)}
            disabled={savingWorkOrder}
            title="Naprej"
            aria-label="Naprej"
            className="px-5"
            style={{
              clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)",
              paddingRight: "20px",
            }}
          >
            {nextStatus}
          </Button>
        )}
      </div>
    </div>
  );
}
