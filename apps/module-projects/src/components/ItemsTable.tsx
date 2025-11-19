import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { MoreVertical, Plus, Calculator, FileUp } from "lucide-react";

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
  onAddFromCatalog: () => void;
  onAddCustom: () => void;
  onDelete: (id: string) => void;
}

export function ItemsTable({ items, onEdit, onAddFromCatalog, onAddCustom, onDelete }: ItemsTableProps) {
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
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAddFromCatalog}>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj iz cenika
        </Button>
        <Button variant="outline" onClick={onAddCustom}>
          <Plus className="mr-2 h-4 w-4" />
          Nova postavka
        </Button>
        <Button variant="outline">
          <Calculator className="mr-2 h-4 w-4" />
          Rekalkuliraj
        </Button>
        <Button variant="outline">
          <FileUp className="mr-2 h-4 w-4" />
          Uvozi iz verzije
        </Button>
      </div>

      <div className="bg-card rounded-[var(--radius-card)] border overflow-hidden">
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
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(item);
                        }}
                      >
                        Uredi
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(item.id);
                        }}
                        className="text-destructive"
                      >
                        Izbriši
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="bg-muted/30 border-t p-6">
          <div className="ml-auto grid max-w-md grid-cols-2 gap-4">
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
                <div className="text-muted-foreground">DDV 9,5%:</div>
                <div className="text-right">€ {totals.vat95.toFixed(2)}</div>
              </>
            )}
            <div className="font-semibold text-right text-primary">Skupaj: € {totals.gross.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Postavka</SheetTitle>
          </SheetHeader>

          {selectedItem && (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Naziv</Label>
                  <Input value={selectedItem.name} readOnly />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input value={selectedItem.sku} readOnly />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Količina</Label>
                  <Input value={selectedItem.quantity} readOnly />
                </div>
                <div>
                  <Label>Cena</Label>
                  <Input value={`€ ${selectedItem.price.toFixed(2)}`} readOnly />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Popust</Label>
                  <Input value={`${selectedItem.discount}%`} readOnly />
                </div>
                <div>
                  <Label>DDV</Label>
                  <Select defaultValue={selectedItem.vatRate.toString()}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="22">22%</SelectItem>
                      <SelectItem value="9.5">9,5%</SelectItem>
                      <SelectItem value="0">0%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Opis</Label>
                <Textarea value={selectedItem.description} readOnly rows={4} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
