import type { MaterialOrder, MaterialStatus } from "@aintel/shared/types/logistics";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

interface MaterialOrderCardProps {
  materialOrder: MaterialOrder | null;
  nextStatus: MaterialStatus | null;
  onAdvanceStatus: (status: MaterialStatus) => void;
  savingWorkOrder: boolean;
}

export function MaterialOrderCard({
  materialOrder,
  nextStatus,
  onAdvanceStatus,
  savingWorkOrder,
}: MaterialOrderCardProps) {
  if (!materialOrder) {
    return <p className="text-sm text-muted-foreground">Naročilo za material bo ustvarjeno ob potrditvi ponudbe.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naziv</TableHead>
              <TableHead className="text-right">Količina</TableHead>
              <TableHead>Enota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(materialOrder.items ?? []).map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell>{item.unit}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {nextStatus && (
        <div className="flex justify-end">
          <Button onClick={() => onAdvanceStatus(nextStatus)} disabled={savingWorkOrder}>
            {nextStatus}
          </Button>
        </div>
      )}
    </div>
  );
}
