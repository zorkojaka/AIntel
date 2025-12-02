import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
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

interface ItemsTableProps<T extends Item> {
  items: T[];
  onEditField: (id: string, changes: Partial<T>) => void;
  onAddFromCatalog: () => void;
  onAddCustom: () => void;
  onDelete: (id: string) => void;
  draftItem?: T;
  onChangeDraft?: (changes: Partial<T>) => void;
  onSubmitDraft?: () => void;
  showDraftRow?: boolean;
  showDiscount?: boolean;
}

export function ItemsTable<T extends Item>({
  items,
  onEditField,
  onAddFromCatalog,
  onAddCustom,
  onDelete,
  draftItem,
  onChangeDraft,
  onSubmitDraft,
  showDraftRow = false,
  showDiscount = true,
}: ItemsTableProps<T>) {
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

  const handleNumberChange = (id: string, field: keyof Item) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    onEditField(id, { [field]: value } as Partial<T>);
  };

  const handleSelectChange = (id: string) => (value: string) => {
    onEditField(id, { vatRate: Number(value) } as Partial<T>);
  };

  const handleDraftNumberChange = (field: keyof Item) => (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!onChangeDraft) return;
    const value = Number(event.target.value);
    onChangeDraft({ [field]: value } as Partial<T>);
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
              <TableHead className="text-right">Količina</TableHead>
              <TableHead>Enota</TableHead>
              <TableHead className="text-right">Cena</TableHead>
              {showDiscount && <TableHead className="text-right">Popust %</TableHead>}
              <TableHead className="text-right">DDV %</TableHead>
              <TableHead className="text-right">Skupaj</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/50">
                <TableCell>{item.name}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="text-right"
                    value={item.quantity}
                    onChange={handleNumberChange(item.id, "quantity")}
                    onBlur={handleNumberChange(item.id, "quantity")}
                  />
                </TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="text-right"
                    value={item.price}
                    onChange={handleNumberChange(item.id, "price")}
                    onBlur={handleNumberChange(item.id, "price")}
                  />
                </TableCell>
                {showDiscount && (
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="text-right"
                      value={item.discount}
                      onChange={handleNumberChange(item.id, "discount")}
                      onBlur={handleNumberChange(item.id, "discount")}
                    />
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <Select value={String(item.vatRate)} onValueChange={handleSelectChange(item.id)}>
                    <SelectTrigger className="justify-end">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="22">22%</SelectItem>
                      <SelectItem value="9.5">9.5%</SelectItem>
                      <SelectItem value="0">0%</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  € {(item.quantity * item.price * (1 - item.discount / 100) * (1 + item.vatRate / 100)).toFixed(2)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onDelete(item.id)}>Izbriši</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}

            {showDraftRow && draftItem && onChangeDraft && onSubmitDraft && (
              <TableRow>
                <TableCell>
                  <Input
                    value={draftItem.name}
                    onChange={(event) => onChangeDraft({ name: event.target.value } as Partial<T>)}
                    placeholder="Naziv"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="text-right"
                    value={draftItem.quantity ?? 1}
                    onChange={handleDraftNumberChange("quantity")}
                    placeholder="1"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={draftItem.unit ?? "kos"}
                    onChange={(event) => onChangeDraft({ unit: event.target.value } as Partial<T>)}
                    placeholder="Enota"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="text-right"
                    value={draftItem.price ?? 0}
                    onChange={handleDraftNumberChange("price")}
                    placeholder="0"
                  />
                </TableCell>
                {showDiscount && (
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="text-right"
                      value={draftItem.discount ?? 0}
                      onChange={handleDraftNumberChange("discount")}
                      placeholder="0"
                    />
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="text-right"
                    value={draftItem.vatRate ?? 22}
                    onChange={handleDraftNumberChange("vatRate")}
                    placeholder="22"
                  />
                </TableCell>
                <TableCell className="text-right">€ 0.00</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={onSubmitDraft}>
                    Dodaj
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-muted-foreground">Material</div>
          <div className="font-semibold">€ {totals.net.toFixed(2)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-muted-foreground">DDV (22%)</div>
          <div className="font-semibold">€ {totals.vat22.toFixed(2)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-muted-foreground">DDV (9.5%)</div>
          <div className="font-semibold">€ {totals.vat95.toFixed(2)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-muted-foreground">Skupaj z DDV</div>
          <div className="font-semibold">€ {totals.gross.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
