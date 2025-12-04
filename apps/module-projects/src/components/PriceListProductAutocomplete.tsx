import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PriceListSearchItem } from "@aintel/shared/types/price-list";
import { cn } from "./ui/utils";

type PriceListProductAutocompleteProps = {
  value: string;
  onChange: (name: string) => void;
  onProductSelected: (product: PriceListSearchItem) => void;
  onCustomSelected?: () => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  inputRef?: (node: HTMLInputElement | null) => void;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export function PriceListProductAutocomplete({
  value,
  onChange,
  onProductSelected,
  onCustomSelected,
  disabled,
  placeholder,
  inputClassName,
  inputRef,
}: PriceListProductAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<PriceListSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const dropdownInteractionRef = useRef(false);
  const internalInputRef = useRef<HTMLInputElement | null>(null);

  const assignInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      internalInputRef.current = node;
      inputRef?.(node);
    },
    [inputRef],
  );

  useEffect(() => {
    setInputValue(value ?? "");
  }, [value]);

  const updateAnchorRect = useCallback(() => {
    if (!internalInputRef.current) return;
    setAnchorRect(internalInputRef.current.getBoundingClientRect());
  }, []);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    updateAnchorRect();
  }, [disabled, updateAnchorRect]);

  const handleInputChange = (nextValue: string) => {
    setInputValue(nextValue);
    onChange(nextValue);
    if (!isOpen && !disabled) {
      openDropdown();
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setAnchorRect(null);
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
        fetchAbortRef.current = null;
      }
      setResults([]);
      setLoading(false);
      return;
    }

    updateAnchorRect();

    const handlePositionChange = () => {
      updateAnchorRect();
    };

    window.addEventListener("scroll", handlePositionChange, true);
    window.addEventListener("resize", handlePositionChange);

    const trimmed = inputValue.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return () => {
        window.removeEventListener("scroll", handlePositionChange, true);
        window.removeEventListener("resize", handlePositionChange);
      };
    }

    setLoading(true);
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    const timeoutId = window.setTimeout(async () => {
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
      window.clearTimeout(timeoutId);
      controller.abort();
      window.removeEventListener("scroll", handlePositionChange, true);
      window.removeEventListener("resize", handlePositionChange);
    };
  }, [inputValue, isOpen, updateAnchorRect]);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
      }
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
      }
    },
    [],
  );

  const handleBlur = () => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
    }
    blurTimeoutRef.current = window.setTimeout(() => {
      if (!dropdownInteractionRef.current) {
        setIsOpen(false);
      }
    }, 100);
  };

  const handleCustomSelect = () => {
    onCustomSelected?.();
    setIsOpen(false);
  };

  const handleProductPick = (product: PriceListSearchItem) => {
    onProductSelected(product);
    setInputValue(product.name);
    setIsOpen(false);
  };

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <div className="relative">
      <input
        ref={assignInputRef}
        type="text"
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("w-full text-left", inputClassName)}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={() => {
          if (blurTimeoutRef.current) {
            window.clearTimeout(blurTimeoutRef.current);
          }
          openDropdown();
        }}
        onBlur={handleBlur}
      />

      {isOpen && !disabled && anchorRect && portalTarget
        ? createPortal(
            <div
              className="fixed z-[9999] rounded border bg-popover text-sm shadow"
              style={{
                top: anchorRect.bottom + 4,
                left: anchorRect.left,
                width: anchorRect.width,
              }}
              onMouseEnter={() => {
                dropdownInteractionRef.current = true;
              }}
              onMouseLeave={() => {
                dropdownInteractionRef.current = false;
              }}
            >
              <div className="flex max-h-64 flex-col overflow-y-auto">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground hover:bg-muted/50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handleCustomSelect}
                >
                  Po meri
                </button>
                <div className="border-t">
                  {loading && (
                    <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
                      <span className="text-xs">Iskanje...</span>
                    </div>
                  )}
                  {!loading && results.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Ni zadetkov.</div>
                  )}
                  {!loading &&
                    results.slice(0, 10).map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-1 text-left hover:bg-muted/70"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleProductPick(product)}
                      >
                        <span className="truncate">{product.name}</span>
                        <span className="text-xs text-muted-foreground">{formatCurrency(product.unitPrice)} €</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
