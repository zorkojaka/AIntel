import type { MaterialOrder, MaterialStatus } from "@aintel/shared/types/logistics";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

export type TechnicianOption = {
  id: string;
  name: string;
};

interface MaterialOrderCardProps {
  materialOrder: MaterialOrder | null;
  technicians: TechnicianOption[];
  nextStatus: MaterialStatus | null;
  onTechnicianSelect: (technicianId: string) => void;
  onAdvanceStatus: (status: MaterialStatus) => void;
  savingWorkOrder: boolean;
}

export function MaterialOrderCard({
  materialOrder,
  technicians,
  nextStatus,
  onTechnicianSelect,
  onAdvanceStatus,
  savingWorkOrder,
}: MaterialOrderCardProps) {
  if (!materialOrder) {
    return <p className="text-sm text-muted-foreground">Naročilo za material bo ustvarjeno ob potrditvi ponudbe.</p>;
  }

  const technicianValue: string | undefined = materialOrder.technicianId ?? undefined;

  return (
    <div className="space-y-4">
      <div className="max-w-sm space-y-2">
        <label className="text-sm font-medium">Tehnik</label>
        <Select value={technicianValue} onValueChange={onTechnicianSelect}>
          <SelectTrigger>
            <SelectValue placeholder="Izberi tehnika" />
          </SelectTrigger>
          <SelectContent>
            {technicians
              .filter((technician) => technician.id.trim().length > 0)
              .map((technician) => (
                <SelectItem key={technician.id} value={technician.id}>
                  {technician.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
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
