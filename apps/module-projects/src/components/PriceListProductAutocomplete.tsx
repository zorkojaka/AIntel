import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";
import type { PriceListSearchItem } from "@aintel/shared/types/price-list";
import { cn } from "./ui/utils";

type PriceListProductAutocompleteProps = {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  inputRef?: (node: HTMLInputElement | null) => void;
  inputClassName?: string;
  onChange: (name: string) => void;
  onProductSelected: (product: PriceListSearchItem) => void;
  onCustomSelected?: () => void;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export function PriceListProductAutocomplete({
  value,
  placeholder,
  autoFocus,
  disabled,
  inputRef,
  inputClassName,
  onChange,
  onProductSelected,
  onCustomSelected,
}: PriceListProductAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [searchTerm, setSearchTerm] = useState(value);
  const [results, setResults] = useState<PriceListSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setInputValue(value);
    setSearchTerm(value);
  }, [value]);

  const handleInputChange = (nextValue: string) => {
    setInputValue(nextValue);
    setSearchTerm(nextValue);
    onChange(nextValue);
  };

  useEffect(() => {
    if (!open) {
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
        fetchAbortRef.current = null;
      }
      setResults([]);
      setLoading(false);
      return;
    }

    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/price-list/items/search?q=${encodeURIComponent(trimmed)}&limit=10`,
          { signal: controller.signal },
        );
        const payload = await response.json();
        if (!payload.success || !Array.isArray(payload.data)) {
          setResults([]);
        } else {
          setResults(payload.data.slice(0, 10));
        }
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [open, searchTerm]);

  const handleCustomSelect = () => {
    onCustomSelected?.();
    setOpen(false);
  };

  const handleProductPick = (product: PriceListSearchItem) => {
    onProductSelected(product);
    setInputValue(product.name);
    setSearchTerm(product.name);
    setOpen(false);
  };

  const productRows = useMemo(() => results.slice(0, 10), [results]);

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          className={cn("text-left", inputClassName)}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] p-0"
        align="start"
        side="bottom"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="max-h-64 overflow-y-auto">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleCustomSelect}
          >
            Po meri
          </button>
          <div className="border-t">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Iskanje...
              </div>
            )}
            {!loading && productRows.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Ni zadetkov.</div>
            )}
            {!loading &&
              productRows.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-1 text-left text-sm hover:bg-muted/70"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleProductPick(product)}
                >
                  <span className="truncate">{product.name}</span>
                  <span className="text-xs text-muted-foreground">{formatCurrency(product.unitPrice)} €</span>
                </button>
              ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
