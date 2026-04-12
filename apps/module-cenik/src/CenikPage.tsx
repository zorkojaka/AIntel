import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, DataTable, Input, CategoryMultiSelect, TableRowActions } from '@aintel/ui';
import { Pencil, Save, Trash2, X } from 'lucide-react';
import { clearMobileTopbar, setMobileTopbar } from '@aintel/shared/utils/mobileTopbar';
import type { ProductServiceLink, ProductServiceLinkQuantityMode } from '@aintel/shared/types/product-service-link';
import FilterBar from './components/FilterBar';
import { ImportConflictReview } from './components/ImportConflictReview';

type Product = {
  _id?: string;
  externalSource?: string;
  externalId?: string;
  externalKey?: string;
  ime: string;
  nabavnaCena: number;
  prodajnaCena: number;
  kratekOpis: string;
  dolgOpis: string;
  povezavaDoSlike: string;
  proizvajalec: string;
  dobavitelj: string;
  povezavaDoProdukta: string;
  naslovDobavitelja: string;
  casovnaNorma: string;
  defaultExecutionMode?: "simple" | "per_unit" | "measured";
  defaultInstructionsTemplate?: string;
  categorySlugs?: string[];
  isService?: boolean;
  isActive?: boolean;
  status?: string;
  mergedIntoProductId?: string;
};

type ProductServiceLinkDraft = ProductServiceLink;

type StatusBanner = {
  variant: 'success' | 'error';
  text: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: string | null;
};

type ImportSource = 'aa_api' | 'services_sheet' | 'dodatki';

type ImportPlanSummary = {
  totalSourceRows: number;
  matchedRows: number;
  toCreateCount: number;
  toUpdateCount: number;
  toSkipCount: number;
  conflictCount: number;
  invalidCount: number;
};

type ImportPlanRow = {
  rowIndex: number;
  rowId: string;
  source: string;
  sourceRecordId: string;
  externalKey: string;
  ime: string;
  rowFingerprint: string;
};

type ImportUpdateRow = ImportPlanRow & {
  productId: string;
  matchType: 'external_key' | 'source_identifier' | 'strict_business_match';
  changedFields: string[];
};

type ImportConflictRow = ImportPlanRow & {
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
  candidateMatches: Array<{
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
  }>;
};

type ImportInvalidError = {
  index: number;
  rowId: string;
  field: string;
  reason: string;
};

type ImportInvalidRow = ImportPlanRow & {
  errors: ImportInvalidError[];
};

type ImportApplySummary = ImportPlanSummary & {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  excludedConflictCount: number;
  excludedInvalidCount: number;
};

type ImportResult = {
  mode: 'analyze' | 'apply';
  source: string;
  summary: ImportPlanSummary;
  toCreate: ImportPlanRow[];
  toUpdate: ImportUpdateRow[];
  toSkip: ImportPlanRow[];
  conflicts: ImportConflictRow[];
  invalidRows: ImportInvalidRow[];
  applied?: ImportApplySummary;
  run?: ImportRun | null;
};

type ImportRun = {
  id: string;
  source: string;
  mode: 'analyze' | 'apply';
  startedAt: string;
  finishedAt?: string;
  triggeredBy?: string;
  status: 'success' | 'partial' | 'failed';
  totalSourceRows: number;
  matchedRows: number;
  toCreateCount: number;
  toUpdateCount: number;
  toSkipCount: number;
  conflictCount: number;
  invalidCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  unresolvedConflictCount: number;
  sourceFingerprint?: string;
  warnings: string[];
  errorSummary?: string;
};

type ProductCandidateMatch = {
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

type ProductPrecheckResult = {
  status: 'safe_create' | 'existing_match_found' | 'conflict_found';
  reason: string;
  candidateMatches: ProductCandidateMatch[];
};

type DuplicateCandidateProduct = {
  productId: string;
  ime: string;
  proizvajalec: string;
  dobavitelj: string;
  prodajnaCena: number;
  isService: boolean;
  externalKey: string;
  source: string;
  isActive: boolean;
};

type DuplicateCandidateGroup = {
  groupKey: string;
  reasons: string[];
  products: DuplicateCandidateProduct[];
};

type CatalogView = 'cenik' | 'produkti' | 'storitve';
type CenikQuickFilter = 'all' | 'products' | 'services';

type AuditReport = {
  totals: {
    products: number;
    activeProducts: number;
    inactiveProducts: number;
    mergedProducts: number;
    incompleteProducts: number;
  };
  countsBySource: Array<{ source: string; count: number }>;
  duplicates: {
    externalKey: { groupCount: number };
    externalSourceExternalId: { groupCount: number };
    nameManufacturerSupplier: { groupCount: number };
  };
  missingFields: Record<string, { count: number }>;
  priceAnomalies: Record<string, { count: number }>;
};

function sumCounts(record: Record<string, { count: number }>) {
  return Object.values(record).reduce((total, entry) => total + (entry?.count ?? 0), 0);
}

function isAuditOk(report: AuditReport | null) {
  if (!report) return false;
  const duplicatesOk =
    report.duplicates.externalKey.groupCount === 0 &&
    report.duplicates.externalSourceExternalId.groupCount === 0 &&
    report.duplicates.nameManufacturerSupplier.groupCount === 0;
  const missingOk = sumCounts(report.missingFields) === 0;
  const anomaliesOk = sumCounts(report.priceAnomalies) === 0;
  return duplicatesOk && missingOk && anomaliesOk;
}

type Category = {
  _id: string;
  name: string;
  slug: string;
  color?: string;
  order?: number;
};

const emptyProduct = (): Product => ({
  ime: '',
  nabavnaCena: 0,
  prodajnaCena: 0,
  kratekOpis: '',
  dolgOpis: '',
  povezavaDoSlike: '',
  proizvajalec: '',
  dobavitelj: '',
  povezavaDoProdukta: '',
  naslovDobavitelja: '',
  casovnaNorma: '',
  defaultExecutionMode: 'simple',
  defaultInstructionsTemplate: '',
  categorySlugs: [],
  isService: false
});

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value);

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('sl-SI', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
};

const statusBadgeClasses: Record<ImportRun['status'], string> = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  partial: 'border-amber-300 bg-amber-50 text-amber-800',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive'
};

function parseBooleanLike(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'da' || normalized === 'yes';
}

function parseNumberLike(value: string) {
  const normalized = value.trim().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDelimitedLine(line: string, delimiter: ',' | '\t' | ';') {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeImportHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function mapImportHeader(header: string) {
  const normalized = normalizeImportHeader(header);
  const mapping: Record<string, string> = {
    externalid: 'externalId',
    ime: 'ime',
    name: 'ime',
    naziv: 'ime',
    categories: 'categorySlugs',
    category: 'categorySlugs',
    categoryslugs: 'categorySlugs',
    kategorije: 'categorySlugs',
    kategorija: 'categorySlugs',
    nabavnacena: 'nabavnaCena',
    purchaseprice: 'nabavnaCena',
    purchasepricewithoutvat: 'nabavnaCena',
    prodajnacena: 'prodajnaCena',
    saleprice: 'prodajnaCena',
    price: 'prodajnaCena',
    proizvajalec: 'proizvajalec',
    manufacturer: 'proizvajalec',
    dobavitelj: 'dobavitelj',
    supplier: 'dobavitelj',
    isservice: 'isService',
    service: 'isService',
    kratekopis: 'kratekOpis',
    shortdescription: 'kratekOpis',
    dolgisopis: 'dolgOpis',
    dolgopis: 'dolgOpis',
    description: 'dolgOpis',
    povezavadoslike: 'povezavaDoSlike',
    imageurl: 'povezavaDoSlike',
    povezavadoprodukta: 'povezavaDoProdukta',
    producturl: 'povezavaDoProdukta',
    naslovdobavitelja: 'naslovDobavitelja',
    supplieraddress: 'naslovDobavitelja',
    casovnanorma: 'casovnaNorma',
    timenorm: 'casovnaNorma',
  };
  return mapping[normalized] ?? normalized;
}

function splitCategoryCell(value: string) {
  return value
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBulkAdditionInput(input: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [] as Record<string, unknown>[];
  }

  const headerLine = lines[0];
  const delimiter: ',' | '\t' | ';' = headerLine.includes('\t')
    ? '\t'
    : headerLine.includes(';')
      ? ';'
      : ',';
  const headers = parseDelimitedLine(headerLine, delimiter).map(mapImportHeader);

  return lines.slice(1).map((line) => {
    const cells = parseDelimitedLine(line, delimiter);
    const row: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      const rawValue = cells[index] ?? '';
      if (header === 'categorySlugs') {
        row.categorySlugs = splitCategoryCell(rawValue);
      } else if (header === 'nabavnaCena' || header === 'prodajnaCena') {
        row[header] = parseNumberLike(rawValue);
      } else if (header === 'isService') {
        row.isService = parseBooleanLike(rawValue);
      } else if (rawValue !== '') {
        row[header] = rawValue;
      }
    });

    return row;
  });
}

const MAX_VISIBLE_CATEGORY_CHIPS = 10;

type CategoryChipRowProps = {
  slugs: string[];
  lookup: Map<string, Category>;
};

function CategoryChipRow({ slugs, lookup }: CategoryChipRowProps) {
  const [showAll, setShowAll] = useState(false);
  const visibleSlugs = showAll ? slugs : slugs.slice(0, MAX_VISIBLE_CATEGORY_CHIPS);
  const hiddenCount = slugs.length - visibleSlugs.length;

  if (slugs.length === 0) {
    return <span className="text-xs text-muted-foreground">Brez kategorij</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visibleSlugs.map((slug) => (
        <span
          key={slug}
          className="rounded-full border border-border/60 bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
        >
          {lookup.get(slug)?.name ?? slug}
        </span>
      ))}
      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          className="text-xs font-medium text-primary underline"
          onClick={() => setShowAll(true)}
        >
          +{hiddenCount} več
        </button>
      )}
    </div>
  );
}

async function parseEnvelope<T>(response: Response) {
  const payload: ApiEnvelope<T> = await response.json();
  if (!payload.success) {
    throw new Error(payload.error ?? 'Napaka pri komunikaciji s strežnikom.');
  }
  return payload.data;
}

export const CenikPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogView, setCatalogView] = useState<CatalogView>('cenik');
  const [cenikQuickFilter, setCenikQuickFilter] = useState<CenikQuickFilter>('all');
  const [filters, setFilters] = useState<{ q: string; category: string | null }>({ q: '', category: null });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [importSource, setImportSource] = useState<ImportSource>('aa_api');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [resolvingConflictKey, setResolvingConflictKey] = useState<string | null>(null);
  const [bulkAdditionsText, setBulkAdditionsText] = useState('');
  const [importRuns, setImportRuns] = useState<ImportRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<ImportRun | null>(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateCandidateGroup[]>([]);
  const [duplicateAuditLoading, setDuplicateAuditLoading] = useState(false);
  const [duplicateAuditError, setDuplicateAuditError] = useState<string | null>(null);
  const [mergingDuplicateKey, setMergingDuplicateKey] = useState<string | null>(null);
  const [manualPrecheck, setManualPrecheck] = useState<ProductPrecheckResult | null>(null);
  const [manualPrecheckLoading, setManualPrecheckLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditReport | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [reviewConflictSource, setReviewConflictSource] = useState<ImportSource>('aa_api');
  const [reviewConflictResult, setReviewConflictResult] = useState<ImportResult | null>(null);
  const [reviewConflictLoading, setReviewConflictLoading] = useState(false);
  const [reviewConflictError, setReviewConflictError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productServiceLinks, setProductServiceLinks] = useState<ProductServiceLinkDraft[]>([]);
  const [initialProductServiceLinks, setInitialProductServiceLinks] = useState<ProductServiceLinkDraft[]>([]);
  const [loadingProductServiceLinks, setLoadingProductServiceLinks] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isMobileEditOpen = isModalOpen && Boolean(editingProduct);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cenik/products');
      const data = await parseEnvelope<Product[]>(response);
      setProducts(
        data.map((product) => ({
          ...product,
          categorySlugs: product.categorySlugs ?? [],
          isService: product.isService ?? false,
          defaultExecutionMode: product.defaultExecutionMode ?? 'simple',
          defaultInstructionsTemplate: product.defaultInstructionsTemplate ?? ''
        }))
      );
      setStatus(null);
    } catch (error) {
      setStatus({ variant: 'error', text: 'Ne morem naložiti cenika. Poskusi znova.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (!isImportOpen) return;
    loadImportRuns();
  }, [isImportOpen]);

  useEffect(() => {
    loadDuplicateCandidates();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories');
        const data = await parseEnvelope<Category[]>(response);
        setCategories(data);
      } catch (error) {
        console.error('Ne morem naložiti kategorij.', error);
      }
    };

    fetchCategories();
  }, []);

  useEffect(() => {
    const workspaceTitle =
      catalogView === 'produkti' ? 'Urejanje produktov' : catalogView === 'storitve' ? 'Urejanje storitev' : 'Cenik';
    if (isMobileEditOpen) {
      setMobileTopbar({
        title: workspaceTitle,
        actions: [
          {
            id: 'cenik-cancel',
            label: 'Prekliči',
            variant: 'ghost',
            onClick: handleCancel,
            disabled: saving,
          },
          {
            id: 'cenik-save',
            label: 'Shrani',
            variant: 'primary',
            onClick: () => formRef.current?.requestSubmit(),
            disabled: saving,
          },
        ],
      });
      return () => clearMobileTopbar();
    }

    setMobileTopbar({
      title: workspaceTitle,
      actions: [
        {
          id: 'cenik-import',
          label: '+ Uvoz',
          variant: 'primary',
          onClick: openImportModal,
        },
        {
          id: 'cenik-review',
          label: 'Pregled',
          variant: 'ghost',
          onClick: openReviewModal,
        },
      ],
    });

    return () => clearMobileTopbar();
  }, [catalogView, isMobileEditOpen, saving]);



  const categoryLookup = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => map.set(category.slug, category));
    return map;
  }, [categories]);

  const availableServices = useMemo(
    () =>
      products
        .filter((product) => product.isService)
        .slice()
        .sort((a, b) => a.ime.localeCompare(b.ime)),
    [products],
  );



  const filteredProducts = useMemo(() => {
    const query = filters.q.trim().toLowerCase();
    return products.filter((product) => {
      const matchesView =
        catalogView === 'cenik'
          ? cenikQuickFilter === 'all'
            ? true
            : cenikQuickFilter === 'products'
              ? !product.isService
              : !!product.isService
          : catalogView === 'produkti'
            ? !product.isService
            : !!product.isService;
      const matchesCategory = filters.category
        ? (product.categorySlugs ?? []).includes(filters.category)
        : true;
      const matchesSearch = query ? product.ime.toLowerCase().includes(query) : true;
      return matchesView && matchesCategory && matchesSearch;
    });
  }, [catalogView, cenikQuickFilter, products, filters]);

  const legacyViewMeta = useMemo(() => {
    if (catalogView === 'produkti') {
      return {
        description: 'Pogled za fizične artikle in opremo iz istega osnovnega cenika.',
        listTitle: 'Seznam produktov',
      };
    }
    if (catalogView === 'storitve') {
      return {
        description: 'Specializiran pogled za storitve in privzete nastavitve izvedbe.',
        listTitle: 'Seznam storitev',
      };
    }
    return {
      description: 'Osnovni pregled celotnega cenika z vsemi produkti in storitvami.',
      listTitle: 'Seznam postavk cenika',
    };
  }, [catalogView]);

  const viewMeta = useMemo(() => {
    if (catalogView === 'produkti') {
      return {
        title: 'Urejanje produktov',
        description: 'Delovna povrsina za urejanje in vzdrzevanje produktnih zapisov iz skupnega kataloga.',
        listTitle: 'Seznam produktov za urejanje',
        addLabel: '+ Dodaj produkt',
        emptyLabel: 'Ni najdenih produktov.',
      };
    }
    if (catalogView === 'storitve') {
      return {
        title: 'Urejanje storitev',
        description: 'Delovna povrsina za urejanje storitev in privzetih nastavitev izvedbe v katalogu.',
        listTitle: 'Seznam storitev za urejanje',
        addLabel: '+ Dodaj storitev',
        emptyLabel: 'Ni najdenih storitev.',
      };
    }
    return {
      title: 'Cenik',
      description: 'Operativni pregled celotnega kataloga za hitro iskanje, filtriranje, uvoz in osnovni CRUD.',
      listTitle: 'Seznam postavk cenika',
      addLabel: '+ Dodaj postavko',
      emptyLabel:
        cenikQuickFilter === 'services'
          ? 'Ni najdenih storitev.'
          : cenikQuickFilter === 'products'
            ? 'Ni najdenih produktov.'
            : 'Ni najdenih postavk cenika.',
    };
  }, [catalogView, cenikQuickFilter]);

  const startCreateForCurrentView = () => {
    if (catalogView === 'produkti') {
      startEdit({ ...emptyProduct(), isService: false });
      return;
    }
    if (catalogView === 'storitve') {
      startEdit({ ...emptyProduct(), isService: true, defaultExecutionMode: 'simple' });
      return;
    }
    startEdit();
  };

  const startEdit = (product?: Product) => {
    setManualPrecheck(null);
    setProductServiceLinks([]);
    setInitialProductServiceLinks([]);
    setEditingProduct(
      product
        ? {
            ...product,
            categorySlugs: product.categorySlugs ?? [],
            isService: product.isService ?? false,
            defaultExecutionMode: product.defaultExecutionMode ?? 'simple',
            defaultInstructionsTemplate: product.defaultInstructionsTemplate ?? ''
          }
        : emptyProduct()
    );
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!isModalOpen || !editingProduct?._id || editingProduct.isService) {
      setProductServiceLinks([]);
      setInitialProductServiceLinks([]);
      setLoadingProductServiceLinks(false);
      return;
    }

    let alive = true;
    setLoadingProductServiceLinks(true);

    const loadLinks = async () => {
      try {
        const response = await fetch(`/api/cenik/product-service-links?productId=${encodeURIComponent(editingProduct._id!)}`);
        const data = await parseEnvelope<ProductServiceLink[]>(response);
        if (!alive) return;
        setProductServiceLinks(data);
        setInitialProductServiceLinks(data);
      } catch (_error) {
        if (!alive) return;
        setStatus({ variant: 'error', text: 'Ne morem naložiti povezanih storitev.' });
        setProductServiceLinks([]);
        setInitialProductServiceLinks([]);
      } finally {
        if (alive) {
          setLoadingProductServiceLinks(false);
        }
      }
    };

    void loadLinks();

    return () => {
      alive = false;
    };
  }, [editingProduct?._id, editingProduct?.isService, isModalOpen]);

  const addDraftProductServiceLink = () => {
    const firstService = availableServices[0];
    if (!firstService?._id) {
      setStatus({ variant: 'error', text: 'Najprej dodaj vsaj eno storitev v cenik.' });
      return;
    }

    setProductServiceLinks((prev) => [
      ...prev,
      {
        id: `draft-${crypto.randomUUID()}`,
        productId: editingProduct?._id ?? '',
        serviceProductId: firstService._id,
        quantityMode: 'same_as_product',
        fixedQuantity: null,
        isDefault: true,
        sortOrder: prev.length,
        note: '',
        serviceProduct: {
          id: firstService._id,
          name: firstService.ime,
          unitPrice: firstService.prodajnaCena,
        },
      },
    ]);
  };

  const updateDraftProductServiceLink = (
    id: string,
    changes: Partial<ProductServiceLinkDraft>,
  ) => {
    setProductServiceLinks((prev) =>
      prev.map((link) => {
        if (link.id !== id) return link;
        const next = { ...link, ...changes };
        if (changes.serviceProductId) {
          const selectedService = availableServices.find((service) => service._id === changes.serviceProductId);
          next.serviceProduct = selectedService?._id
            ? {
                id: selectedService._id,
                name: selectedService.ime,
                unitPrice: selectedService.prodajnaCena,
              }
            : undefined;
        }
        if (next.quantityMode !== 'fixed') {
          next.fixedQuantity = null;
        }
        return next;
      }),
    );
  };

  const removeDraftProductServiceLink = (id: string) => {
    setProductServiceLinks((prev) => prev.filter((link) => link.id !== id));
  };

  const syncProductServiceLinks = async (productId: string) => {
    const initialById = new Map(initialProductServiceLinks.map((link) => [link.id, link]));
    const currentById = new Map(productServiceLinks.filter((link) => !link.id.startsWith('draft-')).map((link) => [link.id, link]));
    const removedIds = [...initialById.keys()].filter((id) => !currentById.has(id));

    for (const link of productServiceLinks) {
      const payload = {
        productId,
        serviceProductId: link.serviceProductId,
        quantityMode: link.quantityMode,
        fixedQuantity: link.quantityMode === 'fixed' ? Number(link.fixedQuantity ?? 0) : undefined,
        isDefault: link.isDefault,
        sortOrder: Number(link.sortOrder ?? 0),
        note: link.note ?? '',
      };

      if (link.id.startsWith('draft-')) {
        await parseEnvelope<ProductServiceLink>(
          await fetch('/api/cenik/product-service-links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        );
        continue;
      }

      await parseEnvelope<ProductServiceLink>(
        await fetch(`/api/cenik/product-service-links/${link.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    }

    for (const linkId of removedIds) {
      await parseEnvelope<{ id: string }>(
        await fetch(`/api/cenik/product-service-links/${linkId}`, {
          method: 'DELETE',
        }),
      );
    }
  };

  const handleDelete = async (productId: string | undefined) => {
    if (!productId) return;
    setDeletingId(productId);
    try {
      const response = await fetch(`/api/cenik/products/${productId}`, { method: 'DELETE' });
      await parseEnvelope<{ message: string }>(response);
      setProducts((prev) => prev.filter((product) => product._id !== productId));
      setStatus({ variant: 'success', text: 'Produkt je bil izbrisan.' });
      if (editingProduct?._id === productId) {
        setEditingProduct(null);
      }
    } catch (error) {
      setStatus({ variant: 'error', text: 'Ne morem izbrisati produkta.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingProduct) {
      return;
    }
    if (!editingProduct.ime) {
      setStatus({ variant: 'error', text: 'Ime je obvezno.' });
      return;
    }

    setSaving(true);

    try {
      if (editingProduct._id) {
        const { _id, ...rest } = editingProduct;
        const payload = {
          ...rest,
          categorySlugs: editingProduct.categorySlugs ?? []
        } as Omit<Product, '_id'>;
        const response = await fetch(`/api/cenik/products/${editingProduct._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await parseEnvelope<Product>(response);
        if (!data.isService) {
          await syncProductServiceLinks(data._id!);
        }
        setProducts((prev) => prev.map((product) => (product._id === data._id ? data : product)));
        setStatus({ variant: 'success', text: 'Produkt posodobljen.' });
        setEditingProduct(null);
        setIsModalOpen(false);
      } else {
        const payload = {
          ...editingProduct,
          categorySlugs: editingProduct.categorySlugs ?? []
        };
        const precheckResponse = await fetch('/api/cenik/products/precheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const precheck = await parseEnvelope<ProductPrecheckResult>(precheckResponse);

        if (precheck.status === 'safe_create') {
          await createManualProduct(false);
        } else {
          setManualPrecheck(precheck);
        }
      }
    } catch (error) {
      if (!manualPrecheck) {
        setStatus({
          variant: 'error',
          text: 'Napaka pri shranjevanju produkta. Preveri podatke in poskusi znova.'
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const updateField = (
    field: keyof Product,
    value: string | number | boolean | Product['defaultExecutionMode'],
  ) => {
    setEditingProduct((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setManualPrecheck(null);
    setProductServiceLinks([]);
    setInitialProductServiceLinks([]);
  };

  const openImportModal = () => {
    setImportSource('aa_api');
    setImportResult(null);
    setImportError(null);
    setResolvingConflictKey(null);
    setBulkAdditionsText('');
    setSelectedRun(null);
    setAuditResult(null);
    setAuditError(null);
    setIsImportOpen(true);
  };

  const openReviewModal = () => {
    setIsReviewOpen(true);
    setReviewConflictSource('aa_api');
    setReviewConflictResult(null);
    setReviewConflictError(null);
    void Promise.all([loadDuplicateCandidates(), loadImportRuns(), runAudit(), loadReviewConflicts('aa_api')]);
  };

  const closeImportModal = () => {
    if (importLoading || auditLoading) return;
    setIsImportOpen(false);
  };

  const closeReviewModal = () => {
    if (reviewConflictLoading || duplicateAuditLoading || runsLoading || auditLoading) return;
    setIsReviewOpen(false);
  };

  const loadImportRuns = async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const response = await fetch('/api/admin/import/products/runs?limit=8');
      const data = await parseEnvelope<ImportRun[]>(response);
      setImportRuns(data);
    } catch (error) {
      setRunsError('Zgodovine uvozov ni bilo mogoce naloziti.');
    } finally {
      setRunsLoading(false);
    }
  };

  const loadImportRunDetail = async (runId: string) => {
    setSelectedRunLoading(true);
    try {
      const response = await fetch(`/api/admin/import/products/runs/${runId}`);
      const data = await parseEnvelope<ImportRun>(response);
      setSelectedRun(data);
    } catch (error) {
      setRunsError('Podrobnosti uvoza ni bilo mogoce naloziti.');
    } finally {
      setSelectedRunLoading(false);
    }
  };

  const loadDuplicateCandidates = async () => {
    setDuplicateAuditLoading(true);
    setDuplicateAuditError(null);
    try {
      const response = await fetch('/api/admin/products/duplicate-candidates');
      const data = await parseEnvelope<{ groups: DuplicateCandidateGroup[] }>(response);
      setDuplicateGroups(data.groups ?? []);
    } catch (error) {
      setDuplicateAuditError('Duplikatov ni bilo mogoce naloziti.');
    } finally {
      setDuplicateAuditLoading(false);
    }
  };

  const mergeDuplicate = async (sourceProductId: string, targetProductId: string) => {
    const mergeKey = `${sourceProductId}:${targetProductId}`;
    setMergingDuplicateKey(mergeKey);
    setDuplicateAuditError(null);
    try {
      const response = await fetch('/api/admin/products/merge-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceProductId, targetProductId })
      });
      await parseEnvelope(response);
      await Promise.all([loadDuplicateCandidates(), loadProducts()]);
      setStatus({ variant: 'success', text: 'Duplikat je bil varno deaktiviran in oznacen kot merged.' });
    } catch (error) {
      setDuplicateAuditError('Zdruzitev duplikata ni uspela.');
    } finally {
      setMergingDuplicateKey(null);
    }
  };

  const runImportAnalyze = async () => {
    setImportLoading(true);
    setImportResult(null);
    setImportError(null);
    try {
      const items = importSource === 'dodatki' ? parseBulkAdditionInput(bulkAdditionsText) : undefined;
      if (importSource === 'dodatki' && (!items || items.length === 0)) {
        setImportError('Za Dodatke prilepi vrstice ali nalozi CSV/TSV datoteko.');
        return;
      }
      const response = await fetch('/api/admin/import/products/from-git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: importSource, mode: 'analyze', items })
      });
      const data = await parseEnvelope<ImportResult>(response);
      setImportResult(data);
      if (data.run) {
        setSelectedRun(data.run);
      }
      await loadImportRuns();
    } catch (error) {
      setImportError('Analiza uvoza ni uspela. Poskusi znova.');
    } finally {
      setImportLoading(false);
    }
  };

  const loadReviewConflicts = async (source: ImportSource) => {
    if (source === 'dodatki') {
      setReviewConflictResult(null);
      setReviewConflictError('Konflikti za Dodatke niso na voljo brez konkretnega lokalnega vnosa.');
      return;
    }

    setReviewConflictLoading(true);
    setReviewConflictError(null);
    try {
      const response = await fetch('/api/admin/import/products/from-git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, mode: 'analyze' })
      });
      const data = await parseEnvelope<ImportResult>(response);
      setReviewConflictResult(data);
    } catch (error) {
      setReviewConflictError('Konfliktov ni bilo mogoce naloziti.');
    } finally {
      setReviewConflictLoading(false);
    }
  };

  const resolveImportConflict = async ({
    source,
    conflict,
    action,
    targetProductId
  }: {
    source: ImportSource;
    conflict: ImportConflictRow;
    action: 'link_existing' | 'create_new' | 'skip';
    targetProductId?: string;
  }) => {
    const rowKey = conflict.externalKey || `${conflict.sourceRecordId}:${conflict.rowIndex}`;
    setResolvingConflictKey(rowKey);
    setImportError(null);
    try {
      const response = await fetch('/api/admin/import/products/resolve-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          externalKey: conflict.externalKey,
          sourceRecordId: conflict.sourceRecordId,
          rowFingerprint: conflict.rowFingerprint,
          action,
          targetProductId
        })
      });
      await parseEnvelope(response);

      const analyzeResponse = await fetch('/api/admin/import/products/from-git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, mode: 'analyze' })
      });
      const data = await parseEnvelope<ImportResult>(analyzeResponse);
      setImportResult(data);
      if (data.run) {
        setSelectedRun(data.run);
      }
      await loadImportRuns();
      if (source !== 'dodatki') {
        await loadReviewConflicts(source);
      }
    } catch (error) {
      setImportError('Shranjevanje razresitve konflikta ni uspelo. Poskusi znova.');
    } finally {
      setResolvingConflictKey(null);
    }
  };

  const runImportApply = async () => {
    setImportLoading(true);
    setImportError(null);
    try {
      const items = importSource === 'dodatki' ? parseBulkAdditionInput(bulkAdditionsText) : undefined;
      if (importSource === 'dodatki' && (!items || items.length === 0)) {
        setImportError('Za Dodatke prilepi vrstice ali nalozi CSV/TSV datoteko.');
        return;
      }
      const response = await fetch('/api/admin/import/products/from-git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: importSource, mode: 'apply', items })
      });
      const data = await parseEnvelope<ImportResult>(response);
      setImportResult(data);
      if (data.run) {
        setSelectedRun(data.run);
      }
      await loadProducts();
      await loadImportRuns();
    } catch (error) {
      setImportError('Potrditev uvoza ni uspela. Poskusi znova.');
    } finally {
      setImportLoading(false);
    }
  };

  const runAudit = async () => {
    setAuditLoading(true);
    setAuditResult(null);
    setAuditError(null);
    try {
      const response = await fetch('/api/admin/cenik/audit');
      const payload: ApiEnvelope<AuditReport> = await response.json();
      if (!payload.success) {
        setAuditError(payload.error ?? 'Audit ni uspel.');
        return;
      }
      setAuditResult(payload.data);
    } catch (error) {
      setAuditError('Audit ni uspel. Poskusi znova.');
    } finally {
      setAuditLoading(false);
    }
  };

  const openExistingProductFromCandidate = async (productId: string) => {
    const existing = products.find((product) => product._id === productId);
    if (existing) {
      startEdit(existing);
      setManualPrecheck(null);
      return;
    }

    try {
      const response = await fetch(`/api/cenik/products/${productId}`);
      const data = await parseEnvelope<Product>(response);
      startEdit(data);
      setManualPrecheck(null);
    } catch (error) {
      setStatus({ variant: 'error', text: 'Ne morem odpreti obstojecega produkta.' });
    }
  };

  const openProductEditById = async (productId: string) => {
    try {
      const response = await fetch(`/api/cenik/products/${productId}`);
      const data = await parseEnvelope<Product>(response);
      startEdit(data);
      setIsReviewOpen(false);
    } catch (error) {
      setStatus({ variant: 'error', text: 'Ne morem odpreti produkta.' });
    }
  };

  const createManualProduct = async (allowDuplicateCreate = false) => {
    if (!editingProduct) return;
    setManualPrecheckLoading(true);
    try {
      const { _id, ...rest } = editingProduct;
      const payload = {
        ...rest,
        categorySlugs: editingProduct.categorySlugs ?? [],
        allowDuplicateCreate
      } as Omit<Product, '_id'> & { allowDuplicateCreate?: boolean };

      const response = await fetch('/api/cenik/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 409) {
        const payload409 = (await response.json()) as ApiEnvelope<ProductPrecheckResult>;
        setManualPrecheck(payload409.data);
        throw new Error(payload409.error ?? 'Mozen duplikat produkta.');
      }

      const data = await parseEnvelope<Product>(response);
      if (!data.isService) {
        await syncProductServiceLinks(data._id!);
      }
      setProducts((prev) => [data, ...prev]);
      setStatus({ variant: 'success', text: 'Produkt dodan.' });
      setManualPrecheck(null);
      setEditingProduct(null);
      setIsModalOpen(false);
    } finally {
      setManualPrecheckLoading(false);
    }
  };

  const handleBulkAdditionFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setBulkAdditionsText(text);
    setImportResult(null);
    setImportError(null);
  };

  const canApplyImport =
    importResult?.mode === 'analyze' && importResult.source === importSource && !importLoading;

  const importSummary = importResult?.summary ?? null;
  const importPreviewRows = {
    toCreate: importResult?.toCreate.slice(0, 6) ?? [],
    toUpdate: importResult?.toUpdate.slice(0, 6) ?? [],
    toSkip: importResult?.toSkip.slice(0, 6) ?? [],
    conflicts: importResult?.conflicts.slice(0, 6) ?? [],
    invalidRows: importResult?.invalidRows.slice(0, 6) ?? []
  };

  return (
    <section className="cenik-page-shell max-w-6xl mx-auto px-3 py-4 md:p-6 space-y-6">
      <div className="hidden items-center justify-between gap-4 md:flex">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-foreground">{viewMeta.title}</h1>
          <p className="text-sm text-muted-foreground">{viewMeta.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={openReviewModal}>Pregled produktov</Button>
          <Button onClick={openImportModal}>Uvoz produktov</Button>
        </div>
      </div>

      {status && (
        <div
          className={`rounded-md border px-4 py-2 text-sm ${
            status.variant === 'success' ? 'border-success text-success' : 'border-destructive text-destructive'
          }`}
        >
          {status.text}
        </div>
      )}

      <Card title="Delovni prostori kataloga" className="cenik-card">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {([
              { id: 'cenik', label: 'Cenik' },
              { id: 'produkti', label: 'Urejanje produktov' },
              { id: 'storitve', label: 'Urejanje storitev' }
            ] as Array<{ id: CatalogView; label: string }>).map((view) => (
              <Button
                key={view.id}
                type="button"
                variant={catalogView === view.id ? 'default' : 'outline'}
                onClick={() => setCatalogView(view.id)}
              >
                {view.label}
              </Button>
            ))}
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
            <div className="text-sm font-semibold text-foreground">{viewMeta.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{viewMeta.description}</p>
          </div>
        </div>
      </Card>


      <Card title={catalogView === 'cenik' ? 'Iskanje in filtriranje cenika' : `Orodja za ${viewMeta.title.toLowerCase()}`} className="cenik-card">
        <div className="space-y-4">
          {catalogView === 'cenik' ? (
            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: 'all', label: 'Vse' },
                { id: 'products', label: 'Produkti' },
                { id: 'services', label: 'Storitve' },
              ] as Array<{ id: CenikQuickFilter; label: string }>).map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={cenikQuickFilter === option.id ? 'default' : 'outline'}
                  onClick={() => setCenikQuickFilter(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
        <FilterBar
          categories={categories}
          value={{ q: filters.q, category: filters.category }}
          onChange={setFilters}
          onAddProduct={startCreateForCurrentView}
          addLabel={viewMeta.addLabel}
        />
        </div>
      </Card>
      <Card title={viewMeta.listTitle} className="cenik-card">
        {loading ? (
          <p className="text-sm text-muted-foreground">Nalaganje cenika …</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="hidden md:block overflow-x-auto">
              <DataTable
                columns={[
                  { header: 'Ime', accessor: 'ime' },
                  {
                    header: 'Kategorije',
                    accessor: (row: Product) => (
                      <CategoryChipRow slugs={row.categorySlugs ?? []} lookup={categoryLookup} />
                    )
                  },
                  {
                    header: 'Prodajna cena',
                    accessor: (row: Product) => formatCurrency(row.prodajnaCena)
                  },
                  { header: 'Proizvajalec', accessor: 'proizvajalec' },
                  { header: 'Opis', accessor: 'kratekOpis' },
                  {
                    header: 'Akcije',
                    accessor: (row: Product) => (
                      <div className="flex justify-end">
                        <TableRowActions
                          onEdit={() => startEdit(row)}
                          onDelete={() => handleDelete(row._id)}
                          deleteConfirmTitle="Izbriši produkt"
                          deleteConfirmMessage="Si prepričan, da želiš izbrisati ta produkt?"
                        />
                      </div>
                    )
                  }
                ]}
                data={filteredProducts}
              />
            </div>
            <div className="grid gap-3 md:hidden">
              {filteredProducts.map((product) => (
                <article
                  key={product._id ?? `${product.ime}-${product.proizvajalec}`}
                  className="rounded-xl border border-border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="cenik-mobile-card-title text-sm font-semibold leading-5 text-foreground">
                          {product.ime}
                        </h3>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => startEdit(product)}
                            aria-label={`Uredi ${product.ime}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(product._id)}
                            disabled={deletingId === product._id}
                            aria-label={`Izbriši ${product.ime}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <CategoryChipRow slugs={product.categorySlugs ?? []} lookup={categoryLookup} />

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-semibold text-foreground">
                          {formatCurrency(product.prodajnaCena)}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="min-w-0 truncate text-muted-foreground">
                          <span className="font-medium text-foreground">Proizvajalec:</span>{" "}
                          {product.proizvajalec?.trim() || 'Ni podatka'}
                        </span>
                      </div>

                      <p className="cenik-mobile-card-description text-xs text-muted-foreground">
                        {product.kratekOpis?.trim() || 'Brez opisa'}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {filteredProducts.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                {viewMeta.emptyLabel}
              </p>
            )}
          </div>
        )}
      </Card>

      {isModalOpen && editingProduct && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 px-3 pb-3 pt-16 md:items-center md:px-4 md:py-6">
          <div className="cenik-product-modal flex w-full max-w-3xl flex-col rounded-xl bg-card shadow-2xl shadow-black/40">
            <div className="hidden items-center justify-between gap-3 border-b border-border/60 bg-card px-4 py-3 md:sticky md:top-0 md:z-10 md:flex md:px-6 md:py-4">
              <h2 className="text-xl font-semibold text-foreground">
                {editingProduct.isService
                  ? editingProduct._id
                    ? 'Uredi storitev'
                    : 'Dodaj storitev'
                  : editingProduct._id
                    ? 'Uredi produkt'
                    : 'Dodaj produkt'}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Shrani"
                  onClick={() => formRef.current?.requestSubmit()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Zapri"
                  onClick={handleCancel}
                  className="inline-flex h-10 w-10 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <form
              ref={formRef}
              className="cenik-product-modal-form mt-0 space-y-2.5 px-4 py-3 md:space-y-4 md:px-6 md:py-5"
              onSubmit={handleSubmit}
            >
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
                <Input
                  label="Ime"
                  placeholder="Naziv produkta"
                  value={editingProduct.ime}
                  onChange={(event) => updateField('ime', event.target.value)}
                  required
                />
                <div className="col-span-1 md:col-span-2 flex items-center gap-3">
                  <input
                    id="is-service"
                    type="checkbox"
                    checked={Boolean(editingProduct.isService)}
                    onChange={(event) =>
                      setEditingProduct((prev) => (prev ? { ...prev, isService: event.target.checked } : prev))
                    }
                    className="h-4 w-4 rounded border border-border bg-card focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <label htmlFor="is-service" className="text-sm font-medium text-foreground">
                    Storitev
                  </label>
                </div>
                <div className="col-span-1 md:col-span-2">
                  <div className="cenik-category-picker">
                    <CategoryMultiSelect
                      label="Kategorije"
                      categories={categories}
                      value={editingProduct.categorySlugs ?? []}
                      onChange={(slugs) =>
                        setEditingProduct((prev) => (prev ? { ...prev, categorySlugs: slugs } : prev))
                      }
                    />
                  </div>
                </div>
                <div className="col-span-1 grid grid-cols-2 gap-2 md:col-span-2 md:gap-3">
                  <Input
                    label="Nabavna cena"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingProduct.nabavnaCena}
                    onChange={(event) => updateField('nabavnaCena', Number(event.target.value))}
                  />
                  <Input
                    label="Prodajna cena"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingProduct.prodajnaCena}
                    onChange={(event) => updateField('prodajnaCena', Number(event.target.value))}
                  />
                </div>
                <Input
                  label="Proizvajalec"
                  placeholder="npr. BLEBOX"
                  value={editingProduct.proizvajalec}
                  onChange={(event) => updateField('proizvajalec', event.target.value)}
                />
                <Input
                  label="Dobavitelj"
                  placeholder="npr. Inteligent"
                  value={editingProduct.dobavitelj}
                  onChange={(event) => updateField('dobavitelj', event.target.value)}
                />
                <Input
                  label="Povezava do slike"
                  placeholder="https://..."
                  value={editingProduct.povezavaDoSlike}
                  onChange={(event) => updateField('povezavaDoSlike', event.target.value)}
                />
                <Input
                  label="Povezava do produkta"
                  placeholder="https://..."
                  value={editingProduct.povezavaDoProdukta}
                  onChange={(event) => updateField('povezavaDoProdukta', event.target.value)}
                />
                <Input
                  label="Naslov dobavitelja"
                  placeholder="naslov"
                  value={editingProduct.naslovDobavitelja}
                  onChange={(event) => updateField('naslovDobavitelja', event.target.value)}
                />
                <Input
                  label="Časovna norma"
                  placeholder="npr. 30 min"
                  value={editingProduct.casovnaNorma}
                  onChange={(event) => updateField('casovnaNorma', event.target.value)}
                />
                <div className="col-span-1 md:col-span-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Privzete nastavitve izvedbe za storitev
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Uporablja se predvsem pri storitvah za pripravo delovnega naloga.
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold">Privzeti način izvedbe storitve</span>
                      <select
                        className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                        value={editingProduct.defaultExecutionMode ?? 'simple'}
                        onChange={(event) =>
                          updateField('defaultExecutionMode', event.target.value as Product['defaultExecutionMode'])
                        }
                      >
                        <option value="simple">Enostavno</option>
                        <option value="per_unit">Po enotah</option>
                        <option value="measured">Merjeno</option>
                      </select>
                    </label>
                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-xs font-semibold">Privzeta navodila za izvedbo</span>
                      <textarea
                        className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                        rows={3}
                        value={editingProduct.defaultInstructionsTemplate ?? ''}
                        onChange={(event) => updateField('defaultInstructionsTemplate', event.target.value)}
                        placeholder="Navodila, ki se ob potrditvi ponudbe prenesejo na delovni nalog."
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 md:space-y-2">
                <label className="text-xs font-semibold">Kratek opis</label>
                <textarea
                  className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  rows={2}
                  value={editingProduct.kratekOpis}
                  onChange={(event) => updateField('kratekOpis', event.target.value)}
                />
              </div>

              <div className="space-y-1.5 md:space-y-2">
                <label className="text-xs font-semibold">Dolg opis</label>
                <textarea
                  className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  rows={4}
                  value={editingProduct.dolgOpis}
                  onChange={(event) => updateField('dolgOpis', event.target.value)}
                />
              </div>

              {!editingProduct.isService && (
                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-foreground">Povezane storitve</div>
                      <p className="text-xs text-muted-foreground">
                        Povezave služijo samo kot predlogi v ponudbi. Uporabnik jih mora potrditi ročno.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addDraftProductServiceLink}
                      disabled={availableServices.length === 0}
                    >
                      Dodaj povezano storitev
                    </Button>
                  </div>

                  {loadingProductServiceLinks ? (
                    <p className="text-xs text-muted-foreground">Nalaganje povezanih storitev ...</p>
                  ) : productServiceLinks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ni nastavljenih povezanih storitev.</p>
                  ) : (
                    <div className="space-y-3">
                      {productServiceLinks.map((link, index) => (
                        <div
                          key={link.id}
                          className="grid grid-cols-1 gap-2 rounded-lg border border-border/60 bg-background p-3 md:grid-cols-[minmax(0,1.3fr)_220px_150px_auto]"
                        >
                          <label className="space-y-1">
                            <span className="text-xs font-semibold">Storitev</span>
                            <select
                              className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                              value={link.serviceProductId}
                              onChange={(event) =>
                                updateDraftProductServiceLink(link.id, {
                                  serviceProductId: event.target.value,
                                })
                              }
                            >
                              {availableServices.map((service) => (
                                <option key={service._id} value={service._id}>
                                  {service.ime}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="space-y-1">
                            <span className="text-xs font-semibold">Količina</span>
                            <select
                              className="w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                              value={link.quantityMode}
                              onChange={(event) =>
                                updateDraftProductServiceLink(link.id, {
                                  quantityMode: event.target.value as ProductServiceLinkQuantityMode,
                                })
                              }
                            >
                              <option value="same_as_product">Enako kot produkt</option>
                              <option value="fixed">Fiksna količina</option>
                            </select>
                          </label>

                          <Input
                            label="Fiksna količina"
                            type="number"
                            min="0"
                            step="1"
                            value={link.quantityMode === 'fixed' ? Number(link.fixedQuantity ?? 1) : ''}
                            disabled={link.quantityMode !== 'fixed'}
                            onChange={(event) =>
                              updateDraftProductServiceLink(link.id, {
                                fixedQuantity: Number(event.target.value),
                              })
                            }
                          />

                          <div className="flex items-end justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeDraftProductServiceLink(link.id)}
                              aria-label={`Odstrani povezano storitev ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="hidden flex-wrap gap-3 pb-1 md:flex">
                <Button type="submit" disabled={saving}>
                  Shrani
                </Button>
                <Button variant="ghost" type="button" onClick={handleCancel}>
                  Zapri
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && manualPrecheck && editingProduct && !editingProduct._id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-xl rounded-xl bg-card p-5 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">Preverjanje duplikata</h3>
              <button
                type="button"
                aria-label="Zapri"
                onClick={() => setManualPrecheck(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3 text-sm">
              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <div className="font-medium text-foreground">
                  {manualPrecheck.status === 'existing_match_found' ? 'Najden obstojec produkt' : 'Mozen konflikt'}
                </div>
                <div className="text-xs text-muted-foreground">{manualPrecheck.reason}</div>
              </div>

              <div className="space-y-2">
                {manualPrecheck.candidateMatches.map((candidate) => (
                  <div key={candidate.productId} className="rounded-lg border border-border/60 px-3 py-3">
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">{candidate.ime}</div>
                      <div className="text-xs text-muted-foreground">
                        {candidate.proizvajalec || 'Brez proizvajalca'} | {candidate.dobavitelj || 'Brez dobavitelja'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {candidate.externalKey || 'Brez externalKey'} | {candidate.source || 'brez vira'}
                      </div>
                      <div className="text-xs text-muted-foreground">{candidate.matchExplanation}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" onClick={() => void openExistingProductFromCandidate(candidate.productId)}>
                        Uporabi obstoječi
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void createManualProduct(true).catch(() => {
                      setStatus({
                        variant: 'error',
                        text: 'Napaka pri shranjevanju produkta. Preveri podatke in poskusi znova.'
                      });
                    });
                  }}
                  disabled={manualPrecheckLoading}
                >
                  Ustvari anyway
                </Button>
                <Button variant="ghost" type="button" onClick={() => setManualPrecheck(null)}>
                  Preklici
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 md:items-center">
          <div className="w-full max-w-5xl rounded-xl bg-card p-6 shadow-2xl shadow-black/40 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-foreground">Pregled produktov</h2>
              <button
                type="button"
                aria-label="Zapri"
                onClick={closeReviewModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-5">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Zdravje kataloga</h3>
                  <Button variant="outline" type="button" onClick={runAudit} disabled={auditLoading}>
                    {auditLoading ? 'Osvezujem ...' : 'Osvezi'}
                  </Button>
                </div>
                {auditError && <div className="mt-3 text-xs text-destructive">{auditError}</div>}
                {auditResult && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-foreground md:grid-cols-3">
                    <span>Skupaj produktov: {auditResult.totals.products}</span>
                    <span>Aktivni: {auditResult.totals.activeProducts}</span>
                    <span>Neaktivni: {auditResult.totals.inactiveProducts}</span>
                    <span>Merged: {auditResult.totals.mergedProducts}</span>
                    <span>Duplikati: {duplicateGroups.length}</span>
                    <span>Nepopolni: {auditResult.totals.incompleteProducts}</span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Duplikati</h3>
                  <Button variant="outline" type="button" onClick={loadDuplicateCandidates} disabled={duplicateAuditLoading}>
                    {duplicateAuditLoading ? 'Osvezujem ...' : 'Osvezi'}
                  </Button>
                </div>
                {duplicateAuditError && <div className="mt-3 text-xs text-destructive">{duplicateAuditError}</div>}
                <div className="mt-3 space-y-4">
                  {duplicateAuditLoading && duplicateGroups.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Preverjam duplicate kandidate ...</div>
                  ) : duplicateGroups.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Ni najdenih exact duplicate skupin.</div>
                  ) : (
                    duplicateGroups.map((group) => (
                      <div key={group.groupKey} className="rounded-lg border border-border/60 bg-background p-3">
                        <div className="text-sm font-medium text-foreground">{group.products[0]?.ime || group.groupKey}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{group.reasons.join(', ')}</div>
                        <div className="mt-3 space-y-2">
                          {group.products.map((product) => (
                            <div key={product.productId} className="rounded border border-border/60 px-3 py-3">
                              <div className="grid gap-2 md:grid-cols-[1.8fr_1fr_1fr_auto] md:items-start">
                                <div className="space-y-1">
                                  <div className="text-sm font-medium text-foreground">{product.ime}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {product.proizvajalec || 'Brez proizvajalca'} | {product.dobavitelj || 'Brez dobavitelja'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {product.source || 'brez vira'} | {product.externalKey || 'brez externalKey'}
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  <div>{formatCurrency(product.prodajnaCena)}</div>
                                  <div>{product.isService ? 'Storitev' : 'Produkt'}</div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  <div>ID: {product.productId}</div>
                                  <div>{product.isActive ? 'Aktiven' : 'Neaktiven'}</div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {group.products
                                    .filter((candidate) => candidate.productId !== product.productId)
                                    .map((candidate) => {
                                      const mergeKey = `${product.productId}:${candidate.productId}`;
                                      return (
                                        <Button
                                          key={mergeKey}
                                          type="button"
                                          variant="outline"
                                          onClick={() => mergeDuplicate(product.productId, candidate.productId)}
                                          disabled={mergingDuplicateKey === mergeKey}
                                        >
                                          {mergingDuplicateKey === mergeKey ? 'Merge ...' : `Merge v ${candidate.ime}`}
                                        </Button>
                                      );
                                    })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Konflikti iz uvoza</h3>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded border border-border/70 bg-background px-3 py-2 text-xs"
                      value={reviewConflictSource}
                      onChange={(event) => setReviewConflictSource(event.target.value as ImportSource)}
                    >
                      <option value="aa_api">AA API</option>
                      <option value="services_sheet">Storitve</option>
                      <option value="dodatki">Dodatki</option>
                    </select>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void loadReviewConflicts(reviewConflictSource)}
                      disabled={reviewConflictLoading}
                    >
                      {reviewConflictLoading ? 'Osvezujem ...' : 'Osvezi konflikte'}
                    </Button>
                  </div>
                </div>
                {reviewConflictError && <div className="mt-3 text-xs text-destructive">{reviewConflictError}</div>}
                {reviewConflictResult && (reviewConflictResult.conflicts.length > 0 ? (
                  <div className="mt-3">
                    <ImportConflictReview
                      source={reviewConflictSource}
                      conflicts={reviewConflictResult.conflicts}
                      resolvingKey={resolvingConflictKey}
                      onResolve={resolveImportConflict}
                    />
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">Ni nerazresenih konfliktov za izbran vir.</div>
                ))}
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Manjkajoci podatki</h3>
                  <Button variant="outline" type="button" onClick={runAudit} disabled={auditLoading}>
                    {auditLoading ? 'Osvezujem ...' : 'Osvezi'}
                  </Button>
                </div>
                {auditResult && (
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    {Object.entries(auditResult.missingFields).map(([key, value]) => (
                      <div key={`review-missing-${key}`} className="rounded border border-border/60 bg-background p-3">
                        <div className="text-sm font-medium text-foreground">
                          {key} <span className="text-xs text-muted-foreground">({value?.count ?? 0})</span>
                        </div>
                        <div className="mt-2 space-y-2">
                          {(value?.samples ?? []).slice(0, 5).map((sample) => (
                            <div key={String(sample._id ?? `${key}-sample`)} className="flex items-center justify-between gap-3 rounded border border-border/60 px-3 py-2 text-xs">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-foreground">{String(sample.ime ?? sample._id ?? '')}</div>
                                <div className="truncate text-muted-foreground">
                                  {String(sample.externalKey ?? sample.externalSource ?? '')}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void openProductEditById(String(sample._id ?? ''))}
                              >
                                Uredi
                              </Button>
                            </div>
                          ))}
                          {(value?.samples ?? []).length === 0 && (
                            <div className="text-xs text-muted-foreground">Ni vzorcev.</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Zgodovina uvozov</h3>
                  <Button variant="outline" type="button" onClick={loadImportRuns} disabled={runsLoading}>
                    {runsLoading ? 'Osvezujem ...' : 'Osvezi'}
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  {runsError && <div className="text-xs text-destructive">{runsError}</div>}
                  {runsLoading && importRuns.length === 0 && (
                    <div className="text-xs text-muted-foreground">Nalaganje zgodovine ...</div>
                  )}
                  {!runsLoading && importRuns.length === 0 && !runsError && (
                    <div className="text-xs text-muted-foreground">Zgodovina uvozov je prazna.</div>
                  )}
                  {importRuns.length > 0 && (
                    <div className="space-y-2">
                      {importRuns.map((run) => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => loadImportRunDetail(run.id)}
                          className="grid w-full grid-cols-1 gap-2 rounded-lg border border-border/60 px-3 py-3 text-left text-xs hover:border-primary md:grid-cols-[1.4fr_0.8fr_0.8fr_2fr]"
                        >
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">{formatDateTime(run.startedAt)}</div>
                            <div className="text-muted-foreground">{run.source} | {run.mode}</div>
                          </div>
                          <div>
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusBadgeClasses[run.status]}`}>
                              {run.status}
                            </span>
                          </div>
                          <div className="text-muted-foreground">{run.triggeredBy?.trim() || 'system'}</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                            <span>+{run.createdCount || run.toCreateCount}</span>
                            <span>~{run.updatedCount || run.toUpdateCount}</span>
                            <span>={run.skippedCount || run.toSkipCount}</span>
                            <span>!{run.conflictCount}/{run.invalidCount}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedRun && (
                    <div className="rounded-lg border border-border/60 bg-background p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{selectedRun.source} | {selectedRun.mode}</div>
                          <div className="text-xs text-muted-foreground">
                            Zacetek: {formatDateTime(selectedRun.startedAt)} | Konec: {formatDateTime(selectedRun.finishedAt)}
                          </div>
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusBadgeClasses[selectedRun.status]}`}>
                          {selectedRun.status}
                        </span>
                      </div>
                      {selectedRunLoading && <div className="mt-3 text-xs text-muted-foreground">Nalaganje podrobnosti ...</div>}
                      {!selectedRunLoading && (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-2 gap-2 text-xs text-foreground md:grid-cols-3">
                            <span>Skupaj: {selectedRun.totalSourceRows}</span>
                            <span>Ujemanja: {selectedRun.matchedRows}</span>
                            <span>Za create: {selectedRun.toCreateCount}</span>
                            <span>Za update: {selectedRun.toUpdateCount}</span>
                            <span>Za skip: {selectedRun.toSkipCount}</span>
                            <span>Konflikti: {selectedRun.conflictCount}</span>
                            <span>Neveljavne: {selectedRun.invalidCount}</span>
                            <span>Ustvarjeni: {selectedRun.createdCount}</span>
                            <span>Posodobljeni: {selectedRun.updatedCount}</span>
                            <span>Preskoceni: {selectedRun.skippedCount}</span>
                            <span>Nerazreseni konflikti: {selectedRun.unresolvedConflictCount}</span>
                          </div>
                          {selectedRun.warnings.length > 0 && (
                            <div className="space-y-1 text-xs text-amber-900">
                              <div className="font-semibold">Opozorila</div>
                              {selectedRun.warnings.map((warning, index) => (
                                <div key={`${selectedRun.id}-warning-${index}`}>{warning}</div>
                              ))}
                            </div>
                          )}
                          {selectedRun.errorSummary && (
                            <div className="text-xs text-destructive">
                              <span className="font-semibold">Napaka:</span> {selectedRun.errorSummary}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 md:items-center">
          <div className="w-full max-w-3xl rounded-xl bg-card p-6 shadow-2xl shadow-black/40 max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-foreground">Uvoz produktov</h2>
              <button
                type="button"
                aria-label="Zapri"
                onClick={closeImportModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">Izberi vir in sproži uvoz.</p>
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setImportSource('aa_api');
                    setImportResult(null);
                    setImportError(null);
                    setResolvingConflictKey(null);
                  }}
                  className={`rounded-lg border px-4 py-3 text-left transition ${
                    importSource === 'aa_api'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/70 text-foreground hover:border-primary'
                  }`}
                >
                  <div className="text-sm font-semibold">AA API (material)</div>
                  <div className="text-xs text-muted-foreground">Uvoz materiala iz Alarm Automatika</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportSource('services_sheet');
                    setImportResult(null);
                    setImportError(null);
                    setResolvingConflictKey(null);
                  }}
                  className={`rounded-lg border px-4 py-3 text-left transition ${
                    importSource === 'services_sheet'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/70 text-foreground hover:border-primary'
                  }`}
                >
                  <div className="text-sm font-semibold">Storitve</div>
                  <div className="text-xs text-muted-foreground">Uvoz storitev iz cenika</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportSource('dodatki');
                    setImportResult(null);
                    setImportError(null);
                    setResolvingConflictKey(null);
                  }}
                  className={`rounded-lg border px-4 py-3 text-left transition ${
                    importSource === 'dodatki'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/70 text-foreground hover:border-primary'
                  }`}
                >
                  <div className="text-sm font-semibold">Dodatki</div>
                  <div className="text-xs text-muted-foreground">Lokalni CSV ali prilepljene dodatne vrstice</div>
                </button>
              </div>
            </div>

            {importSource === 'dodatki' && (
              <div className="mt-4 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                <div className="text-xs text-muted-foreground">
                  Podprti stolpci: <code>externalId</code>, <code>ime</code>, <code>categorySlugs</code>,
                  <code> nabavnaCena</code>, <code>prodajnaCena</code>, <code>proizvajalec</code>,
                  <code> dobavitelj</code>, <code>isService</code>. Kategorije loci z <code>|</code> ali <code>;</code>.
                </div>
                <input
                  type="file"
                  accept=".csv,.tsv,text/csv,text/tab-separated-values"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleBulkAdditionFile(file);
                    event.currentTarget.value = '';
                  }}
                  className="block w-full text-xs text-foreground"
                />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Prilepi vrstice (CSV ali TSV)</label>
                  <textarea
                    className="min-h-40 w-full rounded border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder={'ime,categorySlugs,nabavnaCena,prodajnaCena,proizvajalec,dobavitelj,isService'}
                    value={bulkAdditionsText}
                    onChange={(event) => {
                      setBulkAdditionsText(event.target.value);
                      setImportResult(null);
                      setImportError(null);
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="ghost" type="button" onClick={closeImportModal} disabled={importLoading}>
                Prekliči
              </Button>
              <Button variant="outline" type="button" onClick={runImportAnalyze} disabled={importLoading}>
                {importLoading ? 'Analiziram ...' : 'Analiziraj uvoz'}
              </Button>
              <Button type="button" onClick={runImportApply} disabled={!canApplyImport}>
                {importLoading ? 'UvaÅ¾am ...' : 'Potrdi uvoz'}
              </Button>
            </div>

            {(importError || importResult) && (
              <div className="mt-5 rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                {importError && <p className="text-destructive">{importError}</p>}
                {importSummary && (
                  <div className="mt-3 space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-xs text-foreground">
                      <span>Skupaj vrstic iz vira: {importSummary.totalSourceRows}</span>
                      <span>Ujemanja: {importSummary.matchedRows}</span>
                      <span>Za ustvariti: {importSummary.toCreateCount}</span>
                      <span>Za posodobiti: {importSummary.toUpdateCount}</span>
                      <span>Nespremenjeni: {importSummary.toSkipCount}</span>
                      <span>Konflikti: {importSummary.conflictCount}</span>
                      <span>Neveljavne vrstice: {importSummary.invalidCount}</span>
                    </div>

                    {(importResult?.conflicts.length ?? 0) > 0 && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Konflikti so izkljuÄeni iz samodejnega create toka. Veljavne vrstice lahko vseeno nadaljujejo v uvoz.
                      </div>
                    )}

                    {importResult?.applied && (
                      <div className="grid grid-cols-2 gap-2 text-xs text-foreground">
                        <span>Ustvarjeni: {importResult.applied.createdCount}</span>
                        <span>Posodobljeni: {importResult.applied.updatedCount}</span>
                        <span>Nespremenjeni: {importResult.applied.skippedCount}</span>
                        <span>IzkljuÄeni konflikti: {importResult.applied.excludedConflictCount}</span>
                        <span>IzkljuÄene neveljavne: {importResult.applied.excludedInvalidCount}</span>
                      </div>
                    )}

                    {importPreviewRows.toCreate.length > 0 && (
                      <div className="space-y-1 text-xs text-foreground">
                        <div className="font-semibold">Za ustvariti</div>
                        {importPreviewRows.toCreate.map((row) => (
                          <div key={`create-${row.externalKey}`}>{row.ime}</div>
                        ))}
                      </div>
                    )}

                    {importPreviewRows.toUpdate.length > 0 && (
                      <div className="space-y-1 text-xs text-foreground">
                        <div className="font-semibold">Za posodobiti</div>
                        {importPreviewRows.toUpdate.map((row) => (
                          <div key={`update-${row.externalKey}`}>
                            {row.ime} - {row.changedFields.join(', ')}
                          </div>
                        ))}
                      </div>
                    )}

                    {importPreviewRows.toSkip.length > 0 && (
                      <div className="space-y-1 text-xs text-foreground">
                        <div className="font-semibold">Nespremenjeni</div>
                        {importPreviewRows.toSkip.map((row) => (
                          <div key={`skip-${row.externalKey}`}>{row.ime}</div>
                        ))}
                      </div>
                    )}

                    {importPreviewRows.conflicts.length > 0 && (
                      <div className="space-y-1 text-xs text-destructive">
                        <div className="font-semibold">Konflikti</div>
                        {importPreviewRows.conflicts.map((row) => (
                          <div key={`conflict-${row.externalKey || row.rowId}`}>
                            {row.ime} - {row.reason}
                          </div>
                        ))}
                      </div>
                    )}

                    {importPreviewRows.invalidRows.length > 0 && (
                      <div className="space-y-1 text-xs text-destructive">
                        <div className="font-semibold">Neveljavne vrstice</div>
                        {importPreviewRows.invalidRows.map((row) => (
                          <div key={`invalid-${row.rowIndex}`}>
                            [{row.rowIndex}] {row.ime || row.rowId} - {row.errors[0]?.field}: {row.errors[0]?.reason}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </section>
  );
};
