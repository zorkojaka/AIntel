import React, { useEffect, useState } from 'react';
import { Button, Input } from '@aintel/ui';
import type { PriceListSearchItem } from '@aintel/shared/types/price-list';

type CandidateMatch = {
  productId: string;
  ime: string;
  proizvajalec: string;
  dobavitelj: string;
  externalKey: string;
  source: string;
  isService: boolean;
  nabavnaCena?: number;
  prodajnaCena?: number;
  matchExplanation: string;
};

type ImportConflictRow = {
  rowIndex: number;
  rowId: string;
  source: string;
  sourceRecordId: string;
  externalKey: string;
  ime: string;
  rowFingerprint: string;
  reason: string;
  incoming: {
    ime: string;
    proizvajalec: string;
    dobavitelj: string;
    categorySlugs: string[];
    nabavnaCena: number;
    prodajnaCena: number;
    isService: boolean;
  };
  candidateMatches: CandidateMatch[];
};

type ResolveAction = 'link_existing' | 'create_new' | 'skip';

type ImportConflictReviewProps = {
  source: 'aa_api' | 'services_sheet';
  conflicts: ImportConflictRow[];
  resolvingKey: string | null;
  onResolve: (input: {
    source: 'aa_api' | 'services_sheet';
    conflict: ImportConflictRow;
    action: ResolveAction;
    targetProductId?: string;
  }) => Promise<void>;
};

const formatCurrency = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('sl-SI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
};

function SearchExistingProduct({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (productId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PriceListSearchItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || disabled) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/price-list/items/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!payload.success || !Array.isArray(payload.data)) {
          setResults([]);
          return;
        }
        setResults(payload.data.slice(0, 5));
      } catch (error) {
        if ((error as DOMException)?.name !== 'AbortError') {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [disabled, query]);

  return (
    <div className="space-y-2">
      <Input
        label="Poišči obstoječ produkt"
        placeholder="Vpiši naziv obstoječega produkta"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={disabled}
      />
      <div className="space-y-1">
        {loading && <div className="text-xs text-muted-foreground">Iščem produkte...</div>}
        {!loading &&
          results.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center justify-between rounded border border-border/60 px-3 py-2 text-left text-xs hover:border-primary"
              onClick={() => onPick(item.id)}
              disabled={disabled}
            >
              <span className="min-w-0 truncate">{item.name}</span>
              <span className="ml-2 shrink-0 text-muted-foreground">{formatCurrency(item.unitPrice)}</span>
            </button>
          ))}
        {!loading && query.trim() && results.length === 0 && (
          <div className="text-xs text-muted-foreground">Ni zadetkov.</div>
        )}
      </div>
    </div>
  );
}

export function ImportConflictReview({
  source,
  conflicts,
  resolvingKey,
  onResolve,
}: ImportConflictReviewProps) {
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  if (conflicts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="font-semibold text-destructive">Konflikti</div>
      {conflicts.map((conflict) => {
        const rowKey = conflict.externalKey || `${conflict.sourceRecordId}:${conflict.rowIndex}`;
        const isExpanded = expandedRowKey === rowKey;
        const isResolving = resolvingKey === rowKey;

        return (
          <div key={rowKey} className="rounded-lg border border-border/60 bg-background px-3 py-3 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="font-medium text-foreground">{conflict.incoming.ime || conflict.ime}</div>
                <div className="text-muted-foreground">{conflict.reason}</div>
                <div className="text-muted-foreground">
                  Vir: {conflict.source} | ID: {conflict.sourceRecordId}
                </div>
                <div className="text-muted-foreground">
                  {conflict.incoming.proizvajalec || 'Brez proizvajalca'} | {conflict.incoming.dobavitelj || 'Brez dobavitelja'}
                </div>
                <div className="text-muted-foreground">
                  {formatCurrency(conflict.incoming.nabavnaCena)} / {formatCurrency(conflict.incoming.prodajnaCena)}
                  {conflict.incoming.isService ? ' | storitev' : ' | produkt'}
                </div>
                {conflict.incoming.categorySlugs.length > 0 && (
                  <div className="text-muted-foreground">
                    Kategorije: {conflict.incoming.categorySlugs.join(', ')}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setExpandedRowKey(isExpanded ? null : rowKey)}
                disabled={isResolving}
              >
                {isExpanded ? 'Skrij' : 'Preglej'}
              </Button>
            </div>

            {isExpanded && (
              <div className="mt-3 space-y-3">
                {conflict.candidateMatches.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-medium text-foreground">Predlagana ujemanja</div>
                    {conflict.candidateMatches.map((candidate) => (
                      <div
                        key={candidate.productId}
                        className="rounded border border-border/60 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="font-medium text-foreground">{candidate.ime}</div>
                            <div className="text-muted-foreground">
                              {candidate.proizvajalec || 'Brez proizvajalca'} | {candidate.dobavitelj || 'Brez dobavitelja'}
                            </div>
                            <div className="text-muted-foreground">
                              {candidate.externalKey || 'Brez externalKey'} | {candidate.source || 'brez vira'}
                            </div>
                            <div className="text-muted-foreground">
                              {formatCurrency(candidate.nabavnaCena)} / {formatCurrency(candidate.prodajnaCena)}
                              {candidate.isService ? ' | storitev' : ' | produkt'}
                            </div>
                            <div className="text-muted-foreground">{candidate.matchExplanation}</div>
                          </div>
                          <Button
                            type="button"
                            onClick={() =>
                              onResolve({
                                source,
                                conflict,
                                action: 'link_existing',
                                targetProductId: candidate.productId,
                              })
                            }
                            disabled={isResolving}
                          >
                            Poveži z obstoječim
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <SearchExistingProduct
                  disabled={isResolving}
                  onPick={(productId) =>
                    onResolve({
                      source,
                      conflict,
                      action: 'link_existing',
                      targetProductId: productId,
                    })
                  }
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onResolve({ source, conflict, action: 'create_new' })}
                    disabled={isResolving}
                  >
                    Ustvari nov produkt
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onResolve({ source, conflict, action: 'skip' })}
                    disabled={isResolving}
                  >
                    Preskoči
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
