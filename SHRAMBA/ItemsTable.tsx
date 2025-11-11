import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { MoreVertical, Plus, Calculator, FileUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

export interface Item {
  id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  vatRate: number;
  total: number;
  description?: string;
  category?: string;
}

interface ItemsTableProps {
  items: Item[];
  onEdit: (item: Item) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export function ItemsTable({ items, onEdit, onAdd, onDelete }: ItemsTableProps) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const totals = items.reduce(
    (acc, item) => {
      const netAmount = item.quantity * item.price * (1 - item.discount / 100);
      const vatAmount = netAmount * (item.vatRate / 100);
      const grossAmount = netAmount + vatAmount;

      return {
        net: acc.net + netAmount,
        vat22: acc.vat22 + (item.vatRate === 22 ? vatAmount : 0),
        vat95: acc.vat95 + (item.vatRate === 9.5 ? vatAmount : 0),
        gross: acc.gross + grossAmount,
      };
    },
    { net: 0, vat22: 0, vat95: 0, gross: 0 }
  );

  const materialTotal = items
    .filter((item) => item.category === "material")
    .reduce((acc, item) => acc + item.quantity * item.price * (1 - item.discount / 100), 0);

  const laborTotal = items
    .filter((item) => item.category === "labor")
    .reduce((acc, item) => acc + item.quantity * item.price * (1 - item.discount / 100), 0);

  const handleRowClick = (item: Item) => {
    setSelectedItem(item);
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button onClick={onAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Dodaj iz cenika
        </Button>
        <Button variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Nova postavka
        </Button>
        <Button variant="outline">
          <Calculator className="w-4 h-4 mr-2" />
          Rekalkuliraj
        </Button>
        <Button variant="outline">
          <FileUp className="w-4 h-4 mr-2" />
          Uvozi iz verzije
        </Button>
      </div>

      <div className="border rounded-[var(--radius-card)] bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naziv</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Enota</TableHead>
              <TableHead className="text-right">Količina</TableHead>
              <TableHead className="text-right">Cena</TableHead>
              <TableHead className="text-right">Popust %</TableHead>
              <TableHead className="text-right">DDV %</TableHead>
              <TableHead className="text-right">Skupaj</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleRowClick(item)}
              >
                <TableCell>{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.sku}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right">€ {item.price.toFixed(2)}</TableCell>
                <TableCell className="text-right">{item.discount}%</TableCell>
                <TableCell className="text-right">{item.vatRate}%</TableCell>
                <TableCell className="text-right">
                  € {(item.quantity * item.price * (1 - item.discount / 100) * (1 + item.vatRate / 100)).toFixed(2)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onEdit(item);
                      }}>
                        Uredi
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                      }} className="text-destructive">
                        Izbriši
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="border-t p-6 bg-muted/30">
          <div className="grid grid-cols-2 gap-4 max-w-md ml-auto">
            <div className="text-muted-foreground">Material:</div>
            <div className="text-right">€ {materialTotal.toFixed(2)}</div>
            <div className="text-muted-foreground">Delo:</div>
            <div className="text-right">€ {laborTotal.toFixed(2)}</div>
            <div className="text-muted-foreground">Neto:</div>
            <div className="text-right">€ {totals.net.toFixed(2)}</div>
            {totals.vat22 > 0 && (
              <>
                <div className="text-muted-foreground">DDV 22%:</div>
                <div className="text-right">€ {totals.vat22.toFixed(2)}</div>
              </>
            )}
            {totals.vat95 > 0 && (
              <>
                <div className="text-muted-foreground">DDV 9.5%:</div>
                <div className="text-right">€ {totals.vat95.toFixed(2)}</div>
              </>
            )}
            <div className="font-semibold">Bruto:</div>
            <div className="text-right font-semibold">€ {totals.gross.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Podrobnosti postavke</SheetTitle>
          </SheetHeader>
          {selectedItem && (
            <div className="mt-6 space-y-4">
              <div>
                <Label>Naziv</Label>
                <Input value={selectedItem.name} readOnly className="mt-1" />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={selectedItem.sku} readOnly className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Količina</Label>
                  <Input type="number" value={selectedItem.quantity} readOnly className="mt-1" />
                </div>
                <div>
                  <Label>Enota</Label>
                  <Input value={selectedItem.unit} readOnly className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Cena (€)</Label>
                <Input type="number" value={selectedItem.price} readOnly className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Popust (%)</Label>
                  <Input type="number" value={selectedItem.discount} readOnly className="mt-1" />
                </div>
                <div>
                  <Label>DDV (%)</Label>
                  <Input type="number" value={selectedItem.vatRate} readOnly className="mt-1" />
                </div>
              </div>
              {selectedItem.description && (
                <div>
                  <Label>Opis</Label>
                  <Textarea value={selectedItem.description} readOnly className="mt-1" rows={4} />
                </div>
              )}
              <div className="pt-4 border-t">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skupaj:</span>
                  <span className="font-semibold">
                    € {(selectedItem.quantity * selectedItem.price * (1 - selectedItem.discount / 100) * (1 + selectedItem.vatRate / 100)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
