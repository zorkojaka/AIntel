import type { ProductServiceLink } from "@aintel/shared/types/product-service-link";

import { Button } from "../../components/ui/button";
import type { OfferLineItemForm } from "./offerEditorUtils";

type OfferLinkedServiceSuggestionsProps = {
  item: OfferLineItemForm;
  links: ProductServiceLink[];
  loading: boolean;
  canAddAny: boolean;
  resolveQuantity: (item: OfferLineItemForm, link: ProductServiceLink) => number;
  isAlreadyAdded: (serviceProductId: string, sourceRowId: string) => boolean;
  onAddAll: (rowId: string, links: ProductServiceLink[]) => void;
  onAddOne: (rowId: string, link: ProductServiceLink) => void;
};

export function OfferLinkedServiceSuggestions({
  item,
  links,
  loading,
  canAddAny,
  resolveQuantity,
  isAlreadyAdded,
  onAddAll,
  onAddOne,
}: OfferLinkedServiceSuggestionsProps) {
  if (!item.productId && !loading) return null;
  if (!loading && links.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Predlagane storitve
        </div>
        {links.length > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canAddAny}
            onClick={() => onAddAll(item.id, links)}
          >
            Dodaj vse
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">Nalaganje predlogov ...</p>
      ) : (
        <div className="mt-2 space-y-2">
          {links.map((link) => {
            const quantity = resolveQuantity(item, link);
            const alreadyAdded = isAlreadyAdded(link.serviceProductId, item.id);
            const serviceName = link.serviceProduct?.name ?? "Storitev";

            return (
              <div
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/50 bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {serviceName} ({quantity}x)
                  </div>
                  {alreadyAdded ? (
                    <div className="text-xs text-muted-foreground">Že dodano v ponudbo.</div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={alreadyAdded}
                  onClick={() => onAddOne(item.id, link)}
                >
                  Dodaj
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
