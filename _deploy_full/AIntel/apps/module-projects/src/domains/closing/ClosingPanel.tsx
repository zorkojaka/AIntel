import { useMemo } from "react";
import { Card } from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import type { ProjectLogistics } from "@aintel/shared/types/projects/Logistics";
import type { WorkOrder, WorkOrderItem } from "@aintel/shared/types/logistics";
import { InvoiceVersionEditor } from "./components/InvoiceVersionEditor";

interface ClosingPanelProps {
  logistics?: ProjectLogistics | null;
}

type AggregatedRow = {
  key: string;
  name: string;
  unit: string;
  offered: number;
  executed: number;
  difference: number;
  type: "Osnovno" | "Dodatno" | "Manj";
};

const TYPE_ORDER: Record<AggregatedRow["type"], number> = {
  Osnovno: 0,
  Dodatno: 1,
  Manj: 2,
};

const numberFormatter = new Intl.NumberFormat("sl-SI", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function formatQuantity(value: number) {
  return numberFormatter.format(value);
}

function buildAggregation(workOrders: WorkOrder[]): AggregatedRow[] {
  const grouped = new Map<
    string,
    { name: string; unit: string; offered: number; executed: number; isExtraGroup: boolean }
  >();

  workOrders.forEach((order) => {
    (order.items ?? []).forEach((item) => {
      const offered = typeof item.offeredQuantity === "number" ? item.offeredQuantity : 0;
      const executed = typeof item.executedQuantity === "number" ? item.executedQuantity : 0;
      const key =
        item.offerItemId && item.offerItemId.length > 0
          ? `offer:${item.offerItemId}`
          : item.productId && item.productId.length > 0
            ? `product:${item.productId}`
            : `custom:${(item.name ?? "").trim()}::${(item.unit ?? "").trim()}`;
      const current = grouped.get(key) ?? {
        name: item.name ?? "",
        unit: item.unit ?? "",
        offered: 0,
        executed: 0,
        isExtraGroup: false,
      };
      grouped.set(key, {
        name: current.name || item.name || "",
        unit: current.unit || item.unit || "",
        offered: current.offered + offered,
        executed: current.executed + executed,
        isExtraGroup:
          current.isExtraGroup || !!item.isExtra || (item.offeredQuantity ?? 0) === 0,
      });
    });
  });

  return Array.from(grouped.entries())
    .map(([key, entry]) => {
      const difference = entry.executed - entry.offered;
      let type: AggregatedRow["type"];
      if (entry.isExtraGroup || entry.offered === 0) {
        type = "Dodatno";
      } else if (entry.executed < entry.offered) {
        type = "Manj";
      } else {
        type = "Osnovno";
      }
      return {
        key,
        name: entry.name || "Neimenovana postavka",
        unit: entry.unit || "-",
        offered: entry.offered,
        executed: entry.executed,
        difference,
        type,
      };
    })
    .sort((a, b) => {
      const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
      if (typeDiff !== 0) return typeDiff;
      return a.name.localeCompare(b.name, "sl-SI", { sensitivity: "base" });
    });
}

function countExtras(items: WorkOrderItem[]) {
  return items.filter((item) => item.isExtra || (item.offeredQuantity ?? 0) === 0).length;
}

function countUnderExecuted(items: WorkOrderItem[]) {
  return items.filter(
    (item) =>
      typeof item.offeredQuantity === "number" &&
      typeof item.executedQuantity === "number" &&
      item.executedQuantity < item.offeredQuantity
  ).length;
}

export function ClosingPanel({ logistics }: ClosingPanelProps) {
  const workOrders = logistics?.workOrders ?? [];
  const allItems = useMemo(
    () => workOrders.flatMap((order) => order.items ?? []),
    [workOrders]
  );

  const summary = useMemo(
    () => ({
      totalWorkOrders: workOrders.length,
      totalItems: allItems.length,
      totalExtras: countExtras(allItems),
      totalLessExecuted: countUnderExecuted(allItems),
    }),
    [workOrders.length, allItems]
  );

  const aggregatedRows = useMemo(() => buildAggregation(workOrders), [workOrders]);
  const derivedProjectId =
    workOrders[0]?.projectId ??
    logistics?.materialOrders?.[0]?.projectId ??
    logistics?.workOrder?.projectId ??
    null;

  if (summary.totalWorkOrders === 0 || summary.totalItems === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Zaključek še ni na voljo. Najprej dokončajte logistiko in izvedbo.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold m-0">Predlog postavk za račun</h3>
          <p className="text-sm text-muted-foreground m-0">
            Predlog količin iz izvedenih del (brez cen).
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naziv</TableHead>
                <TableHead>Enota</TableHead>
                <TableHead className="text-right">Ponujeno</TableHead>
                <TableHead className="text-right">Izvedeno</TableHead>
                <TableHead className="text-right">Razlika</TableHead>
                <TableHead>Tip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggregatedRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.unit}</TableCell>
                  <TableCell className="text-right">{formatQuantity(row.offered)}</TableCell>
                  <TableCell className="text-right">{formatQuantity(row.executed)}</TableCell>
                  <TableCell className="text-right">
                    {row.difference > 0
                      ? `+${formatQuantity(row.difference)}`
                      : formatQuantity(row.difference)}
                  </TableCell>
                  <TableCell>{row.type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      <InvoiceVersionEditor projectId={derivedProjectId} />
    </div>
  );
}
