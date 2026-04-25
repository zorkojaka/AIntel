import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./ui/table";
import { toast } from "sonner";

import type {
  OfferLineItem,
  OfferTemplate,
  OfferTemplateSummary,
  OfferVersion,
  OfferVersionSummary,
} from "@aintel/shared/types/offers";
import type { PriceListSearchItem } from "@aintel/shared/types/price-list";
import type { ProductServiceLink } from "@aintel/shared/types/product-service-link";
import type { ProjectDetails } from "../types";
import type { User } from "@aintel/shared/types/user";
import type { Employee } from "@aintel/shared/types/employee";

import { ArrowDown, ArrowLeft, Check, ChevronsUpDown, Download, Loader2, Pencil, Trash, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { Textarea } from "./ui/textarea";
import { PriceListProductAutocomplete } from "./PriceListProductAutocomplete";
import { OfferItemsMobile } from "./OfferItemsMobile";
import { mapProject } from "../domains/core/useProject";
import { useConfirmOffer } from "../domains/core/useConfirmOffer";
import { downloadPdf } from "../api";
import { useProjectMutationRefresh } from "../domains/core/useProjectMutationRefresh";
import { buildTenantHeaders } from "@aintel/shared/utils/tenant";
import { useSettingsData } from "@aintel/module-settings";
import { OfferCommunicationComposeDialog } from "../domains/communication/OfferCommunicationComposeDialog";
import { OfferSentMessagesTable } from "../domains/communication/OfferSentMessagesTable";

type OffersTabProps = {
  projectId: string;
  refreshKey?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
  onCommunicationChanged?: () => void;
};

type OfferLineItemForm = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  discountPercent: number;
};

type OfferImportMatch = {
  productId: string;
  ime: string;
  displayName?: string;
  prodajnaCena: number;
  isService: boolean;
  dobavitelj?: string;
  score?: number;
  reasonFlags?: {
    prefixStrong?: boolean;
    whPreferred?: boolean;
  };
};

type OfferImportRow = {
  rowIndex: number;
  rawName: string;
  normName: string;
  normCore?: string;
  qty: number;
  status: "matched" | "needs_review" | "not_found" | "invalid";
  matches: OfferImportMatch[];
  matchCandidates?: Array<OfferImportMatch & { score: number }>;
  chosenProductId?: string;
  chosenReason?:
    | "exact"
    | "color_default_wh"
    | "explicit_color"
    | "base_exact"
    | "token_best"
    | "token_needs_review"
    | "invalid_row";
  matchScore?: number;
  reviewLevel?: "ok" | "low" | "needs_review" | "invalid";
  topCandidates?: Array<{ productId: string; ime: string; prodajnaCena: number; score: number }>;
  skipped?: boolean;
  manualMatch?: OfferImportMatch;
};

const createEmptyItem = (): OfferLineItemForm => ({
  id: crypto.randomUUID(),
  productId: null,
  name: "",
  quantity: 0,
  unit: "kos",
  unitPrice: 0,
  vatRate: 22,
  discountPercent: 0,
  totalNet: 0,
  totalVat: 0,
  totalGross: 0,
});

const isEmptyOfferItem = (item: OfferLineItemForm) =>
  !item.productId && (!item.name || item.name.trim() === "") && (!item.quantity || item.quantity === 0);

const clampPositive = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
};

const clampMin = (value: unknown, fallback: number, min: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
};

const isItemValid = (item: OfferLineItem | OfferLineItemForm) =>
  item.name.trim() !== "" && item.unitPrice > 0;

const resolveUnitFromName = (name: string) => {
  const normalized = name.trim();
  const match = normalized.match(/\[([^\]]+)\]\s*\*?\s*$/);
  const raw = match?.[1]?.trim();
  if (!raw) return "kos";

  const withoutCurrency = raw.replace(/[€$£]/g, "").trim();
  const slashParts = withoutCurrency.split("/").map((part) => part.trim()).filter(Boolean);
  const candidate = (slashParts[slashParts.length - 1] ?? withoutCurrency).toLowerCase();
  return candidate || "kos";
};

function createOfferEditorSnapshot(input: {
  title: string;
  paymentTerms: string | null;
  comment: string | null;
  items: OfferLineItemForm[];
  useGlobalDiscount: boolean;
  usePerItemDiscount: boolean;
  vatMode: 0 | 9.5 | 22;
  globalDiscountPercent: number;
}) {
  const cleanItems = input.items
    .filter((i) => !isEmptyOfferItem(i))
    .filter((i) => i.name.trim() !== "" && i.unitPrice > 0)
    .map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name.trim(),
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
      vatRate: i.vatRate,
      totalNet: i.totalNet,
      totalVat: i.totalVat,
      totalGross: i.totalGross,
      discountPercent: input.usePerItemDiscount ? i.discountPercent ?? 0 : 0,
    }));

  return JSON.stringify({
    title: input.title.trim() || "Ponudba",
    paymentTerms: input.paymentTerms ?? "",
    comment: input.comment ?? "",
    items: cleanItems,
    discountPercent: input.useGlobalDiscount ? input.globalDiscountPercent : 0,
    globalDiscountPercent: input.useGlobalDiscount ? input.globalDiscountPercent : 0,
    useGlobalDiscount: input.useGlobalDiscount,
    usePerItemDiscount: input.usePerItemDiscount,
    vatMode: input.vatMode,
  });
}

const EMPTY_OFFER_SNAPSHOT = createOfferEditorSnapshot({
  title: "Ponudba",
  paymentTerms: "",
  comment: "",
  items: [],
  useGlobalDiscount: false,
  usePerItemDiscount: false,
  vatMode: 22,
  globalDiscountPercent: 0,
});

export function OffersTab({
  projectId,
  refreshKey = 0,
  onDirtyChange,
  onRegisterSaveHandler,
  onCommunicationChanged,
}: OffersTabProps) {
  const [items, setItems] = useState<OfferLineItemForm[]>([createEmptyItem()]);

  const [title, setTitle] = useState("Ponudba");
  const [paymentTerms, setPaymentTerms] = useState<string>("");
  const [comment, setComment] = useState<string>("");

  const [currentOffer, setCurrentOffer] = useState<OfferVersion | null>(null);

  const [globalDiscountPercent, setGlobalDiscountPercent] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [totalNetAfterDiscount, setTotalNetAfterDiscount] = useState<number>(0);
  const [totalGrossAfterDiscount, setTotalGrossAfterDiscount] = useState<number>(0);

  const [useGlobalDiscount, setUseGlobalDiscount] = useState<boolean>(false);
  const [usePerItemDiscount, setUsePerItemDiscount] = useState<boolean>(false);
  const [vatMode, setVatMode] = useState<0 | 9.5 | 22>(22);
  const [overriddenVatIds, setOverriddenVatIds] = useState<Set<string>>(new Set());

  const [perItemDiscountAmount, setPerItemDiscountAmount] = useState<number>(0);
  const [baseWithoutVat, setBaseWithoutVat] = useState<number>(0);
  const [baseAfterDiscount, setBaseAfterDiscount] = useState<number>(0);
  const [globalDiscountAmount, setGlobalDiscountAmount] = useState<number>(0);
  const [vatAmount, setVatAmount] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [downloadingMode, setDownloadingMode] = useState<"offer" | "both" | "descriptions" | null>(null);
  const [previewingMode, setPreviewingMode] = useState<"offer" | "descriptions" | null>(null);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [sending, setSending] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [communicationRefreshKey, setCommunicationRefreshKey] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [salesUserId, setSalesUserId] = useState("");
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>([]);
  const [assignmentsSaving, setAssignmentsSaving] = useState(false);

  const [versions, setVersions] = useState<OfferVersionSummary[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<OfferTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateCreating, setTemplateCreating] = useState(false);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isTemplateNameDialogOpen, setIsTemplateNameDialogOpen] = useState(false);
  const [templateDialogMode, setTemplateDialogMode] = useState<"create" | "rename">("create");
  const [templateDialogTemplateId, setTemplateDialogTemplateId] = useState<string | null>(null);
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateVatModeDraft, setTemplateVatModeDraft] = useState<0 | 9.5 | 22>(22);
  const [templateApplyGlobalDiscount, setTemplateApplyGlobalDiscount] = useState(true);
  const [templateApplyPerItemDiscount, setTemplateApplyPerItemDiscount] = useState(true);
  const [templateGlobalDiscountDraft, setTemplateGlobalDiscountDraft] = useState("0");
  const [templateStoredUseGlobalDiscount, setTemplateStoredUseGlobalDiscount] = useState(false);
  const [templateStoredUsePerItemDiscount, setTemplateStoredUsePerItemDiscount] = useState(false);
  const [isTemplateDeleteDialogOpen, setIsTemplateDeleteDialogOpen] = useState(false);
  const [templateDeleteTarget, setTemplateDeleteTarget] = useState<OfferTemplateSummary | null>(null);
  const [templateDeleting, setTemplateDeleting] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(EMPTY_OFFER_SNAPSHOT);
  const isPdfBusy = downloadingMode !== null || previewingMode !== null;
  const lineItemsRef = useRef<HTMLDivElement | null>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [visibleMobileBlankItemId, setVisibleMobileBlankItemId] = useState<string | null>(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRawText, setImportRawText] = useState("");
  const [importRows, setImportRows] = useState<OfferImportRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [showImportMappingHint, setShowImportMappingHint] = useState(false);
  const [linkedServiceSuggestions, setLinkedServiceSuggestions] = useState<Record<string, ProductServiceLink[]>>({});
  const [loadingLinkedServiceSuggestions, setLoadingLinkedServiceSuggestions] = useState<Record<string, boolean>>({});

  const paymentTermsInitRef = useRef<Record<string, boolean>>({});
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleDraft(title);
    }
  }, [title, isEditingTitle]);

  useEffect(() => {
    const textarea = commentTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 36)}px`;
  }, [comment]);

  const { settings } = useSettingsData();
  const paymentTermsOptions = useMemo(() => {
    const notes = Array.isArray(settings?.notes) ? settings.notes : [];
    const paymentNotes = notes
      .filter((note) => note.category === "payment")
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((note) => ({ label: note.title, value: note.text }));
    const defaultTerms = settings?.defaultPaymentTerms?.trim() ?? "";
    if (defaultTerms && !paymentNotes.some((entry) => entry.value === defaultTerms)) {
      paymentNotes.unshift({ label: "Privzeto", value: defaultTerms });
    }
    return paymentNotes;
  }, [settings]);
  const defaultPaymentTerms = paymentTermsOptions[0]?.value ?? settings?.defaultPaymentTerms ?? "";
  const selectedTemplate = useMemo(
    () => templates.find((entry) => entry._id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  );

  useEffect(() => {
    if (paymentTermsOptions.length === 0) {
      return;
    }
    const exists = paymentTermsOptions.some((option) => option.value === paymentTerms);
    if (!exists) {
      const next = defaultPaymentTerms || paymentTermsOptions[0].value;
      if (next && next !== paymentTerms) {
        setPaymentTerms(next);
      }
    }
  }, [paymentTermsOptions, defaultPaymentTerms, paymentTerms]);

  const resetToEmptyOffer = useCallback(() => {
    setSelectedOfferId(null);
    setTitle("Ponudba");
    setPaymentTerms("");
    setComment("");
    setItems(ensureTrailingBlank([]));
    setGlobalDiscountPercent(0);
    setUseGlobalDiscount(false);
    setUsePerItemDiscount(false);
    setVatMode(22);
    setBaseWithoutVat(0);
    setPerItemDiscountAmount(0);
    setGlobalDiscountAmount(0);
    setBaseAfterDiscount(0);
    setVatAmount(0);
    setTotalNetAfterDiscount(0);
    setTotalGrossAfterDiscount(0);
    setDiscountAmount(0);
    setLastSavedSnapshot(EMPTY_OFFER_SNAPSHOT);
    setLinkedServiceSuggestions({});
    setLoadingLinkedServiceSuggestions({});
  }, []);

  const refreshAfterMutation = useProjectMutationRefresh(projectId);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const fetchAssignmentsData = async () => {
      try {
        const headers = buildTenantHeaders();
        const [usersRes, employeesRes] = await Promise.all([
          fetch("/api/users", { headers }),
          fetch("/api/employees", { headers }),
        ]);
        const usersPayload = await usersRes.json();
        const employeesPayload = await employeesRes.json();
        if (!alive) return;
        setUsers(Array.isArray(usersPayload?.data) ? usersPayload.data : []);
        setEmployees(Array.isArray(employeesPayload?.data) ? employeesPayload.data : []);
      } catch {
        if (!alive) return;
        setUsers([]);
        setEmployees([]);
      }
    };
    fetchAssignmentsData();
    return () => {
      alive = false;
    };
  }, [projectId]);

const loadOfferById = useCallback(async (offerId: string) => {
    if (!projectId) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/offers/${offerId}`);
      const payload = await response.json();
      if (!payload.success) return;
      const offer: OfferVersion = payload.data;
      if (!offer) return;

      setTitle(offer.baseTitle || "Ponudba");
      const offerKey = (offer as any)?._id ?? (offer as any)?.id ?? offerId;
      const normalizedTerms = (offer.paymentTerms ?? "").trim();
      const shouldUseDefaultTerms = normalizedTerms.length === 0;
      const alreadyInitialized = paymentTermsInitRef.current[offerKey] === true;
      if (!alreadyInitialized) {
        setPaymentTerms(shouldUseDefaultTerms ? defaultPaymentTerms : offer.paymentTerms ?? "");
        paymentTermsInitRef.current[offerKey] = true;
      } else if (!shouldUseDefaultTerms) {
        setPaymentTerms(offer.paymentTerms ?? "");
      }
      setComment(offer.comment ?? "");

      setUseGlobalDiscount(offer.useGlobalDiscount ?? false);
      setUsePerItemDiscount(offer.usePerItemDiscount ?? false);
      setVatMode((offer.vatMode as 0 | 9.5 | 22) ?? 22);

      const gPercent = offer.globalDiscountPercent ?? offer.discountPercent ?? 0;
      setGlobalDiscountPercent(gPercent);

      setBaseWithoutVat(offer.baseWithoutVat ?? offer.totalNet ?? 0);
      setPerItemDiscountAmount(offer.perItemDiscountAmount ?? 0);
      setGlobalDiscountAmount(offer.globalDiscountAmount ?? offer.discountAmount ?? 0);
      setBaseAfterDiscount(offer.baseAfterDiscount ?? offer.totalNetAfterDiscount ?? 0);
      setVatAmount(offer.vatAmount ?? offer.totalVat ?? 0);
      setTotalNetAfterDiscount(offer.totalNetAfterDiscount ?? offer.baseAfterDiscount ?? 0);
      setTotalGrossAfterDiscount(offer.totalGrossAfterDiscount ?? offer.totalGross ?? 0);
      setDiscountAmount(offer.globalDiscountAmount ?? offer.discountAmount ?? 0);

      setCurrentOffer(offer);

      const mapped: OfferLineItemForm[] = (offer.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        discountPercent: item.discountPercent ?? 0,
        totalNet: item.totalNet,
        totalVat: item.totalVat,
        totalGross: item.totalGross,
        productId: item.productId ?? null,
      }));

      setItems(ensureTrailingBlank([...mapped]));
      setLinkedServiceSuggestions({});
      setLoadingLinkedServiceSuggestions({});
      setLastSavedSnapshot(
        createOfferEditorSnapshot({
          title: offer.baseTitle || "Ponudba",
          paymentTerms: offer.paymentTerms ?? "",
          comment: offer.comment ?? "",
          items: mapped,
          useGlobalDiscount: offer.useGlobalDiscount ?? false,
          usePerItemDiscount: offer.usePerItemDiscount ?? false,
          vatMode: ((offer.vatMode as 0 | 9.5 | 22) ?? 22),
          globalDiscountPercent: gPercent,
        })
      );
    } catch (error) {
      console.error(error);
    }
  }, [projectId]);

  const refreshOffers = useCallback(
    async (preferredId?: string | null, fallbackToLatest = true) => {
      if (!projectId) {
        setVersions([]);
        resetToEmptyOffer();
        return;
      }

      try {
        const res = await fetch(`/api/projects/${projectId}/offers`);
        const json = await res.json();
        if (!json.success) return;

        const list: OfferVersionSummary[] = json.data ?? [];
        setVersions(list);

        if (list.length === 0) {
          resetToEmptyOffer();
          return;
        }

        let nextId: string | null = null;

        if (preferredId && list.some((entry) => entry._id === preferredId)) {
          nextId = preferredId;
        }

        if (!nextId && fallbackToLatest && list.length > 0) {
          nextId = list[list.length - 1]._id;
        }

        if (nextId) {
          setSelectedOfferId(nextId);
          await loadOfferById(nextId);
        } else {
          resetToEmptyOffer();
        }
      } catch (error) {
        console.error(error);
      }
    },
    [loadOfferById, projectId, resetToEmptyOffer],
  );

  const refreshTemplates = useCallback(async (preferredId?: string | null) => {
    try {
      const response = await fetch(`/api/projects/offer-templates`);
      const payload = await response.json();
      if (!payload.success) return;

      const list: OfferTemplateSummary[] = Array.isArray(payload.data) ? payload.data : [];
      setTemplates(list);

      if (preferredId && list.some((entry) => entry._id === preferredId)) {
        setSelectedTemplateId(preferredId);
        return;
      }

      setSelectedTemplateId((current) =>
        current && list.some((entry) => entry._id === current) ? current : list[0]?._id ?? null
      );
    } catch (error) {
      console.error(error);
    }
  }, [projectId]);

  const selectedOfferIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedOfferIdRef.current = selectedOfferId;
  }, [selectedOfferId]);

  const refreshAfterConfirm = useCallback(async () => {
    const preferredId = selectedOfferIdRef.current;
    await refreshOffers(preferredId ?? null, true);
  }, [refreshOffers]);

  const { confirmOffer, confirmingId } = useConfirmOffer({
    projectId,
    onConfirmed: refreshAfterConfirm,
  });

  const previousProjectId = useRef<string | null>(null);
  useEffect(() => {
    const isProjectChange = previousProjectId.current !== projectId;
    previousProjectId.current = projectId;
    const preferredId = isProjectChange ? null : selectedOfferIdRef.current;
    refreshOffers(preferredId, true);
    refreshTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey, refreshOffers, refreshTemplates]);

  useEffect(() => {
    resetToEmptyOffer();
    setVersions([]);
    setTemplates([]);
    setSelectedTemplateId(null);
    setCurrentOffer(null);
    setOverriddenVatIds(new Set());
    setProjectDetails(null);
    paymentTermsInitRef.current = {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);


  const recalcItem = (item: OfferLineItemForm): OfferLineItemForm => {
    const quantity = clampMin(item.quantity, 1, 1);
    const unitPrice = clampPositive(item.unitPrice, 0);
    const vatRate = clampPositive(item.vatRate, 0);

    const perItemDiscount = usePerItemDiscount ? clampPositive(item.discountPercent ?? 0, 0) : 0;

    const net = Number((quantity * unitPrice * (1 - perItemDiscount / 100)).toFixed(2));

    const effectiveVatRate = vatMode === 0 ? 0 : vatMode ?? vatRate;
    const totalVat = Number((net * (effectiveVatRate / 100)).toFixed(2));
    const totalGross = Number((net + totalVat).toFixed(2));

    return {
      ...item,
      quantity,
      unitPrice,
      vatRate,
      discountPercent: perItemDiscount,
      totalNet: net,
      totalVat,
      totalGross,
    };
  };

  const ensureTrailingBlank = (list: OfferLineItemForm[]) => {
    const trimmed = list.filter((item, index) => {
      if (index === list.length - 1) return true;
      return !isEmptyOfferItem(item);
    });
    const last = trimmed[trimmed.length - 1];
    if (!last || !isEmptyOfferItem(last)) {
      const blank = createEmptyItem();
      trimmed.push(blank);
    }
    return trimmed;
  };

  const updateItem = (id: string, changes: Partial<OfferLineItemForm>) => {
    if (changes.productId === null) {
      setLinkedServiceSuggestions((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setLoadingLinkedServiceSuggestions((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    setItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx === -1) return prev;

      const next = [...prev];
      const merged = { ...next[idx], ...changes };
      next[idx] = recalcItem(merged);

      return ensureTrailingBlank(next);
    });
  };

  const deleteRow = (id: string) => {
    setLinkedServiceSuggestions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLoadingLinkedServiceSuggestions((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setItems((prev) => {
      if (prev.length === 1) return ensureTrailingBlank([]);
      const filtered = prev.filter((item) => item.id !== id);
      if (filtered.length === 0) return ensureTrailingBlank([]);
      return ensureTrailingBlank(filtered);
    });
  };

  const revealMobileBlankItem = useCallback(() => {
    const trailingBlank =
      [...items].reverse().find((item) => isEmptyOfferItem(item)) ?? createEmptyItem();

    if (!items.some((item) => item.id === trailingBlank.id)) {
      setItems((prev) => ensureTrailingBlank([...prev, trailingBlank]));
    }
    setVisibleMobileBlankItemId(trailingBlank.id);
  }, [items]);



  const validItems = useMemo(
    () => items.filter((item) => !isEmptyOfferItem(item)).filter(isItemValid),
    [items]
  );

  useEffect(() => {
    if (!visibleMobileBlankItemId) return;
    const visibleBlankStillExists = items.some(
      (item) => item.id === visibleMobileBlankItemId && isEmptyOfferItem(item),
    );
    if (!visibleBlankStillExists) {
      setVisibleMobileBlankItemId(null);
    }
  }, [items, visibleMobileBlankItemId]);

  const totals = useMemo(() => {
    const baseWithout = validItems.reduce(
      (acc, item) => acc + item.quantity * item.unitPrice,
      0
    );

    const perItemDisc = usePerItemDiscount
      ? validItems.reduce(
          (acc, item) =>
            acc + item.quantity * item.unitPrice * ((item.discountPercent ?? 0) / 100),
          0
        )
      : 0;

    const baseAfterPerItem = Number((baseWithout - perItemDisc).toFixed(2));

    const normalizedDiscount = useGlobalDiscount
      ? Math.min(100, Math.max(0, globalDiscountPercent || 0))
      : 0;

    const globalDisc = Number((baseAfterPerItem * (normalizedDiscount / 100)).toFixed(2));
    const baseAfterAll = Number((baseAfterPerItem - globalDisc).toFixed(2));

    const vatRate =
      vatMode === 22 ? 0.22 : vatMode === 9.5 ? 0.095 : 0;

    const vatAmt = Number((baseAfterAll * vatRate).toFixed(2));
    const totalWithVatVal = Number((baseAfterAll + vatAmt).toFixed(2));

    return {
      baseWithoutVat: baseWithout,
      perItemDiscountAmount: perItemDisc,
      globalDiscountAmount: globalDisc,
      baseAfterDiscount: baseAfterAll,
      vatAmount: vatAmt,
      totalWithVat: totalWithVatVal,
    };
  }, [validItems, usePerItemDiscount, useGlobalDiscount, globalDiscountPercent, vatMode]);

  useEffect(() => {
    setPerItemDiscountAmount(totals.perItemDiscountAmount ?? 0);
    setGlobalDiscountAmount(totals.globalDiscountAmount ?? 0);
    setBaseWithoutVat(totals.baseWithoutVat ?? 0);
    setBaseAfterDiscount(totals.baseAfterDiscount ?? 0);
    setVatAmount(totals.vatAmount ?? 0);
    setTotalGrossAfterDiscount(totals.totalWithVat ?? 0);
    setTotalNetAfterDiscount(totals.baseAfterDiscount ?? 0);
    setDiscountAmount(totals.globalDiscountAmount ?? 0);
  }, [totals]);

  const formatCurrency = (value: number) =>
    `${value.toLocaleString("sl-SI", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`;
  const totalColumns = usePerItemDiscount ? 8 : 7;
  const summaryLabelColSpan = totalColumns - 2;

  const sanitizeFilenamePart = (value: string) =>
    value
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

const buildPdfFilename = (project: ProjectDetails | null, fallbackId: string, prefix: string) => {
    const identifierRaw =
      (project?.projectNumber != null && `${project.projectNumber}`) ||
      project?.code ||
      project?.id ||
      fallbackId ||
      "";
    const customerRaw =
      project?.customerDetail?.name?.trim() ||
      project?.customer?.trim() ||
      "";

    const identifier = sanitizeFilenamePart(identifierRaw);
    const customer = sanitizeFilenamePart(customerRaw);

  if (identifier && customer) {
    return `${prefix} ${identifier} - ${customer}.pdf`;
  }
  if (identifier) {
    return `${prefix} ${identifier}.pdf`;
  }
  if (fallbackId) {
    return `${prefix} ${fallbackId}.pdf`;
  }
  return `${prefix}.pdf`;
};

  const handleToggleGlobalDiscount = (checked: boolean) => {
    setUseGlobalDiscount(checked);
    if (!checked) {
      setGlobalDiscountPercent(0);
    }
  };

  const handleVatModeChange = (mode: 0 | 9.5 | 22) => {
    setVatMode(mode);
    setItems((prev) =>
      prev.map((item) => {
        if (overriddenVatIds.has(item.id)) return recalcItem(item);
        return recalcItem({ ...item, vatRate: mode });
      })
    );
  };

  const handleSelectProduct = (rowId: string, product: PriceListSearchItem, rowIndex: number) => {
    updateItem(rowId, {
      name: product.name,
      productId: product.id,
      unit: product.unit ?? "kos",
      unitPrice: product.unitPrice,
      vatRate: product.vatRate ?? 22,
    });
    void loadLinkedServiceSuggestions(rowId, product.id);
  };

  const handleSelectCustomItem = (rowId: string) => {
    updateItem(rowId, { productId: null });
  };

  const loadLinkedServiceSuggestions = useCallback(async (rowId: string, productId: string) => {
    setLoadingLinkedServiceSuggestions((prev) => ({ ...prev, [rowId]: true }));
    try {
      const response = await fetch(`/api/cenik/product-service-links?productId=${encodeURIComponent(productId)}`);
      const payload = await response.json();
      const links: ProductServiceLink[] =
        payload?.success && Array.isArray(payload?.data) ? payload.data : [];
      setLinkedServiceSuggestions((prev) => ({ ...prev, [rowId]: links }));
    } catch {
      setLinkedServiceSuggestions((prev) => ({ ...prev, [rowId]: [] }));
    } finally {
      setLoadingLinkedServiceSuggestions((prev) => ({ ...prev, [rowId]: false }));
    }
  }, []);

  const resolveSuggestedServiceQuantity = useCallback(
    (item: OfferLineItemForm, link: ProductServiceLink) => {
      if (link.quantityMode === "fixed") {
        return Math.max(1, Number(link.fixedQuantity ?? 1));
      }
      return Math.max(1, Number(item.quantity ?? 1));
    },
    [],
  );

  const isSuggestedServiceAlreadyAdded = useCallback(
    (serviceProductId: string, sourceRowId: string) =>
      items.some(
        (entry) =>
          entry.id !== sourceRowId &&
          entry.productId === serviceProductId &&
          !isEmptyOfferItem(entry),
      ),
    [items],
  );

  const addSuggestedServicesToOffer = useCallback(
    (rowId: string, links: ProductServiceLink[], addAll = false) => {
      const item = items.find((entry) => entry.id === rowId);
      if (!item) return;

      const pendingLinks = addAll
        ? links.filter((link) => !isSuggestedServiceAlreadyAdded(link.serviceProductId, rowId))
        : links.slice(0, 1);

      if (pendingLinks.length === 0) {
        toast.message("Predlagane storitve so že dodane.");
        return;
      }

      setItems((prev) => {
        const anchorIndex = prev.findIndex((entry) => entry.id === rowId);
        if (anchorIndex === -1) return prev;
        const anchor = prev[anchorIndex];
        const next = [...prev];
        let insertIndex = anchorIndex + 1;

        for (const link of pendingLinks) {
          const duplicateExists = next.some(
            (entry) =>
              entry.id !== rowId &&
              entry.productId === link.serviceProductId &&
              !isEmptyOfferItem(entry),
          );
          if (duplicateExists) {
            continue;
          }

          const quantity = resolveSuggestedServiceQuantity(anchor, link);
          const serviceName = link.serviceProduct?.name?.trim() || "Storitev";
          const servicePrice = Number(link.serviceProduct?.unitPrice ?? 0);

          const nextItem = recalcItem({
            id: crypto.randomUUID(),
            productId: link.serviceProductId,
            name: serviceName,
            quantity,
            unit: "kos",
            unitPrice: servicePrice,
            vatRate: vatMode,
            discountPercent: 0,
            totalNet: 0,
            totalVat: 0,
            totalGross: 0,
          });

          next.splice(insertIndex, 0, nextItem);
          insertIndex += 1;
        }

        return ensureTrailingBlank(next);
      });
    },
    [items, isSuggestedServiceAlreadyAdded, resolveSuggestedServiceQuantity, vatMode],
  );

  const renderLinkedServiceSuggestions = useCallback(
    (item: OfferLineItemForm) => {
      const loadingSuggestions = loadingLinkedServiceSuggestions[item.id];
      const links = linkedServiceSuggestions[item.id] ?? [];
      if (!item.productId && !loadingSuggestions) return null;
      if (!loadingSuggestions && links.length === 0) return null;

      const canAddAny = links.some((link) => !isSuggestedServiceAlreadyAdded(link.serviceProductId, item.id));

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
                onClick={() => addSuggestedServicesToOffer(item.id, links, true)}
              >
                Dodaj vse
              </Button>
            ) : null}
          </div>

          {loadingSuggestions ? (
            <p className="mt-2 text-xs text-muted-foreground">Nalaganje predlogov ...</p>
          ) : (
            <div className="mt-2 space-y-2">
              {links.map((link) => {
                const quantity = resolveSuggestedServiceQuantity(item, link);
                const alreadyAdded = isSuggestedServiceAlreadyAdded(link.serviceProductId, item.id);
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
                      onClick={() => addSuggestedServicesToOffer(item.id, [link])}
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
    },
    [
      addSuggestedServicesToOffer,
      isSuggestedServiceAlreadyAdded,
      linkedServiceSuggestions,
      loadingLinkedServiceSuggestions,
      resolveSuggestedServiceQuantity,
    ],
  );

  const openImportModal = () => {
    setImportError("");
    setShowImportMappingHint(false);
    setImportRows([]);
    setImportRawText("");
    setIsImportOpen(true);
  };

  const parseOfferImport = async () => {
    const raw = importRawText.trim();
    if (!raw) {
      setImportError("Prilepi tabelo za uvoz.");
      setImportRows([]);
      return;
    }

    setImportLoading(true);
    setImportError("");
    setShowImportMappingHint(false);
    try {
      const response = await fetch("/api/offers/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: raw, projectId }),
      });
      const payload = await response.json();
      if (!payload?.success || !Array.isArray(payload?.data?.rows)) {
        setImportRows([]);
        setImportError(payload?.error ?? "Razčlenjevanje tabele ni uspelo.");
        setShowImportMappingHint(true);
        return;
      }
      setImportRows(payload.data.rows as OfferImportRow[]);
    } catch (error) {
      console.error(error);
      setImportRows([]);
      setImportError("Razčlenjevanje tabele ni uspelo.");
      setShowImportMappingHint(true);
    } finally {
      setImportLoading(false);
    }
  };

  const updateImportRow = (rowIndex: number, changes: Partial<OfferImportRow>) => {
    setImportRows((prev) =>
      prev.map((row) => (row.rowIndex === rowIndex ? { ...row, ...changes } : row)),
    );
  };

  const resolveImportRowProduct = (row: OfferImportRow): OfferImportMatch | null => {
    const chosenProductId = row.chosenProductId;
    if (!chosenProductId) {
      return row.manualMatch ?? null;
    }
    const fromMatches = row.matches.find((match) => match.productId === chosenProductId);
    return fromMatches ?? row.manualMatch ?? null;
  };

  const handleImportApply = () => {
    const importedRows = importRows.filter((row) => !row.skipped);
    const unresolvedRows = importedRows.filter((row) => !resolveImportRowProduct(row));
    if (unresolvedRows.length > 0) {
      toast.error("Nekatere vrstice nimajo izbranega produkta/storitve.");
      return;
    }

    const nextItems = importedRows
      .map((row) => {
        const product = resolveImportRowProduct(row);
        if (!product) return null;
        const rowName = product.ime || row.rawName;
        const rowUnit = resolveUnitFromName(rowName);
        const baseItem: OfferLineItemForm = {
          id: crypto.randomUUID(),
          productId: product.productId,
          name: rowName,
          quantity: row.qty > 0 ? row.qty : 1,
          unit: rowUnit,
          unitPrice: Number(product.prodajnaCena ?? 0),
          vatRate: vatMode,
          discountPercent: 0,
          totalNet: 0,
          totalVat: 0,
          totalGross: 0,
        };
        return recalcItem(baseItem);
      })
      .filter((item): item is OfferLineItemForm => Boolean(item));

    if (nextItems.length === 0) {
      toast.error("Ni postavk za uvoz.");
      return;
    }

    setItems(ensureTrailingBlank(nextItems));
    setIsImportOpen(false);
    toast.success(`Uvoženih postavk: ${nextItems.length}`);

    window.setTimeout(() => {
      lineItemsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      const input = lineItemsRef.current?.querySelector("input");
      input?.focus();
    }, 120);
  };

  const buildPayloadFromCurrentState = () => {
    const cleanItems = items
      .filter((i) => !isEmptyOfferItem(i))
      .filter((i) => i.name.trim() !== "" && i.unitPrice > 0)
      .map((i) => ({
        id: i.id,
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        vatRate: i.vatRate,
        totalNet: i.totalNet,
        totalVat: i.totalVat,
        totalGross: i.totalGross,
        discountPercent: usePerItemDiscount ? i.discountPercent ?? 0 : 0,
      }));

    const effectiveGlobalPercent = useGlobalDiscount ? globalDiscountPercent : 0;

    return {
      title,
      validUntil: null,
      paymentTerms,
      comment,
      items: cleanItems,
      // kompatibilnost s starimi polji
      discountPercent: effectiveGlobalPercent,
      globalDiscountPercent: effectiveGlobalPercent,
      useGlobalDiscount,
      usePerItemDiscount,
      vatMode,
    };
  };

  const currentOfferSnapshot = useMemo(
    () =>
      createOfferEditorSnapshot({
        title,
        paymentTerms,
        comment,
        items,
        useGlobalDiscount,
        usePerItemDiscount,
        vatMode,
        globalDiscountPercent,
      }),
    [title, paymentTerms, comment, items, useGlobalDiscount, usePerItemDiscount, vatMode, globalDiscountPercent]
  );
  const isDirty = currentOfferSnapshot !== lastSavedSnapshot;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const fillTemplateDialogFromCurrentOffer = () => {
    setTemplateVatModeDraft(vatMode);
    setTemplateApplyGlobalDiscount(useGlobalDiscount);
    setTemplateApplyPerItemDiscount(usePerItemDiscount);
    setTemplateGlobalDiscountDraft(String(useGlobalDiscount ? globalDiscountPercent ?? 0 : 0));
    setTemplateStoredUseGlobalDiscount(useGlobalDiscount);
    setTemplateStoredUsePerItemDiscount(usePerItemDiscount);
  };

  const fillTemplateDialogFromTemplate = (template: Pick<
    OfferTemplate,
    | "title"
    | "applyGlobalDiscount"
    | "applyPerItemDiscount"
    | "globalDiscountPercent"
    | "discountPercent"
    | "vatMode"
    | "useGlobalDiscount"
    | "usePerItemDiscount"
  >) => {
    setTemplateNameDraft(template.title);
    setTemplateVatModeDraft((template.vatMode as 0 | 9.5 | 22) ?? 22);
    setTemplateApplyGlobalDiscount(template.applyGlobalDiscount ?? true);
    setTemplateApplyPerItemDiscount(template.applyPerItemDiscount ?? true);
    setTemplateGlobalDiscountDraft(String(template.globalDiscountPercent ?? template.discountPercent ?? 0));
    setTemplateStoredUseGlobalDiscount(template.useGlobalDiscount ?? false);
    setTemplateStoredUsePerItemDiscount(template.usePerItemDiscount ?? false);
  };

  const handleSave = async () => {
    if (!validItems.length) {
      toast.error("Dodajte vsaj eno postavko z nazivom in ceno.");
      return null;
    }

    setSaving(true);
    try {
      const payloadBody = buildPayloadFromCurrentState();
      const url = selectedOfferId
        ? `/api/projects/${projectId}/offers/${selectedOfferId}`
        : `/api/projects/${projectId}/offers`;
      const method = selectedOfferId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });

      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Ponudbe ni bilo mogoče shraniti.");
        return null;
      }

      const created: OfferVersion = payload.data;
      await refreshAfterMutation(
        () => refreshOffers(created._id ?? selectedOfferId ?? null),
        async () => {
          await fetchProjectDetails();
        },
      );
      toast.success("Ponudba shranjena.");
      setLastSavedSnapshot(currentOfferSnapshot);
      return created;
    } catch (error) {
      console.error(error);
      toast.error("Napaka pri shranjevanju ponudbe.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const ensureSavedOffer = async () => {
    if (currentOffer?._id) {
      return currentOffer;
    }
    return handleSave();
  };

  const handleCreateNewVersion = () => {
    setSelectedOfferId(null);
    resetToEmptyOffer();
  };

  const handleDeleteVersion = async () => {
    if (!selectedOfferId) return;
    if (!window.confirm("Res želiš izbrisati to verzijo ponudbe?")) return;

    const response = await fetch(`/api/projects/${projectId}/offers/${selectedOfferId}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!payload.success || !payload.data) return;

    await refreshOffers(null);
  };

  const handleCloneVersion = async () => {
    if (!selectedOfferId) return;
    const payload = buildPayloadFromCurrentState();
    const response = await fetch(`/api/projects/${projectId}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!json.success || !json.data) return;
    const created: OfferVersion = json.data;
    await refreshOffers(created._id ?? null);
  };

  const handleSaveTemplate = async () => {
    if (!validItems.length) {
      toast.error("Dodajte vsaj eno postavko z nazivom in ceno.");
      return;
    }

    const selectedTemplate = templates.find((entry) => entry._id === selectedTemplateId);
    const templateName = window.prompt(
      "Vnesi ime template-a",
      selectedTemplate?.title ?? `${title.trim() || "Ponudba"} template`
    )?.trim() ?? "";
    if (!templateName) {
      return;
    }

    setTemplateSaving(true);
    try {
      const payloadBody = buildPayloadFromCurrentState();
      const response = await fetch(`/api/projects/${projectId}/offer-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payloadBody,
          sourceOfferId: currentOffer?._id ?? null,
          sourceTitle: title,
          title: templateName,
        }),
      });
      const payload = await response.json();
      if (!payload.success || !payload.data) {
        toast.error(payload.error ?? "Template ni bilo mogoče shraniti.");
        return;
      }

      await refreshTemplates(payload.data._id ?? null);
      toast.success("Template shranjen.");
    } catch (error) {
      console.error(error);
      toast.error("Template ni bilo mogoče shraniti.");
    } finally {
      setTemplateSaving(false);
    }
  };

  useEffect(() => {
    if (!onRegisterSaveHandler) return;
    onRegisterSaveHandler(async () => Boolean(await handleSave()));
    return () => onRegisterSaveHandler(null);
  }, [onRegisterSaveHandler, handleSave]);

  const openCreateTemplateDialog = () => {
    if (!validItems.length) {
      toast.error("Dodajte vsaj eno postavko z nazivom in ceno.");
      return;
    }
    setTemplateDialogMode("create");
    setTemplateDialogTemplateId(null);
    setTemplateNameDraft(`${title.trim() || "Ponudba"} template`);
    fillTemplateDialogFromCurrentOffer();
    setIsTemplateNameDialogOpen(true);
  };

  const openRenameTemplateDialog = async (templateOverride?: OfferTemplateSummary | null) => {
    const targetTemplate = templateOverride ?? selectedTemplate;
    if (!targetTemplate) {
      toast.error("Izberi template.");
      return;
    }
    setTemplateSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/offer-templates/${targetTemplate._id}/apply`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!payload.success || !payload.data) {
        toast.error(payload.error ?? "Template podatkov ni bilo mogoče naložiti.");
        return;
      }

      setTemplateDialogMode("rename");
      setTemplateDialogTemplateId(targetTemplate._id);
      fillTemplateDialogFromTemplate(payload.data as OfferTemplate);
      setIsTemplateNameDialogOpen(true);
      setIsTemplatePickerOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Template podatkov ni bilo mogoče naložiti.");
    } finally {
      setTemplateSaving(false);
    }
  };

  const submitTemplateDialog = async () => {
    const nextName = templateNameDraft.trim();
    if (!nextName) {
      toast.error("Ime template-a je obvezno.");
      return;
    }

    const nextGlobalDiscountPercent = Math.max(0, Math.min(100, Number(templateGlobalDiscountDraft) || 0));
    const shouldApplyGlobalDiscount = templateApplyGlobalDiscount;
    const shouldApplyPerItemDiscount = templateApplyPerItemDiscount;
    const effectiveUseGlobalDiscount = shouldApplyGlobalDiscount
      ? nextGlobalDiscountPercent > 0
      : templateStoredUseGlobalDiscount;
    const effectiveUsePerItemDiscount = templateStoredUsePerItemDiscount;

    setTemplateSaving(true);
    try {
      const response =
        templateDialogMode === "create"
          ? await fetch(`/api/projects/${projectId}/offer-templates`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...buildPayloadFromCurrentState(),
                sourceOfferId: currentOffer?._id ?? null,
                sourceTitle: title,
                title: nextName,
                applyGlobalDiscount: shouldApplyGlobalDiscount,
                applyPerItemDiscount: shouldApplyPerItemDiscount,
                useGlobalDiscount: effectiveUseGlobalDiscount,
                usePerItemDiscount: effectiveUsePerItemDiscount,
                vatMode: templateVatModeDraft,
                globalDiscountPercent: nextGlobalDiscountPercent,
                discountPercent: nextGlobalDiscountPercent,
              }),
            })
          : await fetch(`/api/projects/${projectId}/offer-templates/${templateDialogTemplateId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: nextName,
                applyGlobalDiscount: shouldApplyGlobalDiscount,
                applyPerItemDiscount: shouldApplyPerItemDiscount,
                useGlobalDiscount: effectiveUseGlobalDiscount,
                usePerItemDiscount: effectiveUsePerItemDiscount,
                vatMode: templateVatModeDraft,
                globalDiscountPercent: nextGlobalDiscountPercent,
                discountPercent: nextGlobalDiscountPercent,
              }),
            });

      const payload = await response.json();
      if (!payload.success || !payload.data) {
        toast.error(
          payload.error ??
            (templateDialogMode === "create"
              ? "Template ni bilo mogoče shraniti."
              : "Template ni bilo mogoče preimenovati.")
        );
        return;
      }

      await refreshTemplates(payload.data._id ?? null);
      setIsTemplateNameDialogOpen(false);
      toast.success(templateDialogMode === "create" ? "Template shranjen." : "Template preimenovan.");
    } catch (error) {
      console.error(error);
      toast.error(templateDialogMode === "create" ? "Template ni bilo mogoče shraniti." : "Template ni bilo mogoče preimenovati.");
    } finally {
      setTemplateSaving(false);
    }
  };

  const openDeleteTemplateDialog = () => {
    if (!selectedTemplate) {
      toast.error("Izberi template.");
      return;
    }
    setTemplateDeleteTarget(selectedTemplate);
    setIsTemplateDeleteDialogOpen(true);
  };

  const openDeleteTemplateDialogForItem = (template: OfferTemplateSummary) => {
    setTemplateDeleteTarget(template);
    setIsTemplateDeleteDialogOpen(true);
    setIsTemplatePickerOpen(false);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateDeleteTarget?._id) return;
    const deletedId = templateDeleteTarget._id;
    setTemplateDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/offer-templates/${deletedId}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!payload.success || !payload.data) {
        toast.error(payload.error ?? "Template ni bilo mogoče izbrisati.");
        return;
      }

      setIsTemplateDeleteDialogOpen(false);
      setTemplateDeleteTarget(null);
      await refreshTemplates(null);
      setSelectedTemplateId((current) => (current === deletedId ? null : current));
      toast.success("Template izbrisan.");
    } catch (error) {
      console.error(error);
      toast.error("Template ni bilo mogoče izbrisati.");
    } finally {
      setTemplateDeleting(false);
    }
  };

  const handleCreateOfferFromTemplate = async () => {
    if (!selectedTemplateId) {
      toast.error("Izberi template.");
      return;
    }

    setTemplateCreating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/offer-templates/${selectedTemplateId}/create-offer`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!payload.success || !payload.data) {
        toast.error(payload.error ?? "Ponudbe iz template-a ni bilo mogoče ustvariti.");
        return;
      }

      const created: OfferVersion = payload.data;
      await refreshAfterMutation(
        async () => {
          await Promise.all([
            refreshOffers(created._id ?? null),
            refreshTemplates(selectedTemplateId),
          ]);
        },
        async () => {
          await fetchProjectDetails();
        },
      );
      toast.success("Nova ponudba iz template-a je pripravljena.");
    } catch (error) {
      console.error(error);
      toast.error("Ponudbe iz template-a ni bilo mogoče ustvariti.");
    } finally {
      setTemplateCreating(false);
    }
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) {
      toast.error("Izberi template.");
      return;
    }

    if (validItems.length > 0) {
      const confirmed = window.confirm(
        "Trenutna ponudba že vsebuje postavke. Želiš template podatke prepisati čez trenutno ponudbo?"
      );
      if (!confirmed) {
        return;
      }
    }

    setTemplateCreating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/offer-templates/${selectedTemplateId}/apply`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!payload.success || !payload.data) {
        toast.error(payload.error ?? "Template podatkov ni bilo mogoče prenesti.");
        return;
      }

      const template = payload.data as {
        paymentTerms: string | null;
        comment?: string | null;
        applyGlobalDiscount: boolean;
        applyPerItemDiscount: boolean;
        useGlobalDiscount: boolean;
        usePerItemDiscount: boolean;
        vatMode: 0 | 9.5 | 22;
        globalDiscountPercent?: number;
        discountPercent: number;
        items: OfferLineItem[];
      };

      setPaymentTerms(template.paymentTerms ?? "");
      setComment(template.comment ?? "");
      setVatMode(template.vatMode ?? 22);
      if (template.applyGlobalDiscount) {
        setUseGlobalDiscount(template.useGlobalDiscount ?? false);
        setGlobalDiscountPercent(template.globalDiscountPercent ?? template.discountPercent ?? 0);
      }
      if (template.applyPerItemDiscount) {
        setUsePerItemDiscount(template.usePerItemDiscount ?? false);
      }
      const currentFilledItems = items.filter((item) => !isEmptyOfferItem(item));
      const currentDiscountsByIndex = currentFilledItems.map((item) => item.discountPercent ?? 0);
      const currentDiscountsByKey = new Map(
        currentFilledItems.map((item) => [
          `${item.productId ?? ""}::${item.name.trim().toLowerCase()}`,
          item.discountPercent ?? 0,
        ])
      );
      setItems(
        ensureTrailingBlank(
          (template.items ?? []).map((item, index) =>
            recalcItem({
              id: crypto.randomUUID(),
              productId: item.productId ?? null,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              vatRate: item.vatRate,
              totalNet: item.totalNet,
              totalVat: item.totalVat,
              totalGross: item.totalGross,
              discountPercent: template.applyPerItemDiscount
                ? item.discountPercent ?? 0
                : currentDiscountsByKey.get(`${item.productId ?? ""}::${item.name.trim().toLowerCase()}`) ??
                  currentDiscountsByIndex[index] ??
                  0,
            })
          )
        )
      );

      toast.success("Template podatki so bili preneseni v trenutno ponudbo.");
    } catch (error) {
      console.error(error);
      toast.error("Template podatkov ni bilo mogoče prenesti.");
    } finally {
      setTemplateCreating(false);
    }
  };

  const handleChangeVersion = async (value: string) => {
    setSelectedOfferId(value);
    await loadOfferById(value);
  };

  const fetchProjectDetails = useCallback(async () => {
    if (!projectId) return null;
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const result = await response.json();
      if (!result.success || !result.data) {
        return null;
      }
      const mapped = mapProject(result.data);
      setProjectDetails(mapped);
      setSalesUserId(mapped.salesUserId ?? "");
      setAssignedEmployeeIds(Array.isArray(mapped.assignedEmployeeIds) ? mapped.assignedEmployeeIds : []);
      return mapped;
    } catch (error) {
      console.error("Project fetch failed", error);
      return null;
    }
  }, [projectId]);

  useEffect(() => {
    fetchProjectDetails();
  }, [fetchProjectDetails]);

  const ensureProjectDetails = useCallback(async () => {
    if (projectDetails) {
      return projectDetails;
    }
    return fetchProjectDetails();
  }, [fetchProjectDetails, projectDetails]);

  const saveAssignments = async (nextSalesUserId: string | null, nextEmployeeIds: string[]) => {
    if (!projectId) return;
    setAssignmentsSaving(true);
    try {
      const headers = { "Content-Type": "application/json", ...buildTenantHeaders() };
      const response = await fetch(`/api/projects/${projectId}/assignments`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          salesUserId: nextSalesUserId,
          assignedEmployeeIds: nextEmployeeIds,
        }),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Posodobitev dodelitev ni uspela.");
        return false;
      }
      const mapped = mapProject(payload.data);
      setProjectDetails(mapped);
      setSalesUserId(mapped.salesUserId ?? "");
      setAssignedEmployeeIds(Array.isArray(mapped.assignedEmployeeIds) ? mapped.assignedEmployeeIds : []);
      await refreshAfterMutation(async () => {
        await fetchProjectDetails();
      });
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Posodobitev dodelitev ni uspela.");
      return false;
    } finally {
      setAssignmentsSaving(false);
    }
  };

  const handleSalesUserChange = async (value: string) => {
    const normalized = value === 'none' ? '' : value;
    const previous = salesUserId;
    setSalesUserId(normalized);
    const ok = await saveAssignments(normalized ? normalized : null, assignedEmployeeIds);
    if (!ok) {
      setSalesUserId(previous);
    }
  };

  const toggleAssignedEmployee = async (employeeId: string) => {
    const next = assignedEmployeeIds.includes(employeeId)
      ? assignedEmployeeIds.filter((id) => id !== employeeId)
      : [...assignedEmployeeIds, employeeId];
    const previous = assignedEmployeeIds;
    setAssignedEmployeeIds(next);
    const ok = await saveAssignments(salesUserId ? salesUserId : null, next);
    if (!ok) {
      setAssignedEmployeeIds(previous);
    }
  };

  const handleExportPdf = async (mode: "offer" | "both") => {
    setDownloadingMode(mode);
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) return;
      const url = `/api/projects/${projectId}/offers/${saved._id}/pdf?mode=${mode}`;
      const details = await ensureProjectDetails();
      const labelMap = {
        offer: "Ponudba",
        both: "Ponudba+Projekt",
      } as const;
      const filename = buildPdfFilename(details, projectId, labelMap[mode]);
      await downloadPdf(url, filename);
      toast.success("PDF prenesen");
    } catch (error) {
      console.error(error);
      toast.error("PDF ni bilo mogoce prenesti.");
    } finally {
      setDownloadingMode(null);
    }
  };

  const handleExportDescriptionsPdf = async () => {
    setDownloadingMode("descriptions");
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) return;
      const url = `/api/projects/${projectId}/offers/${saved._id}/pdf?variant=descriptions`;
      const details = await ensureProjectDetails();
      const filename = buildPdfFilename(details, projectId, "Produktni opisi");
      await downloadPdf(url, filename);
      toast.success("PDF prenesen");
    } catch (error) {
      console.error(error);
      toast.error("PDF ni bilo mogoce prenesti.");
    } finally {
      setDownloadingMode(null);
    }
  };

  const openPreviewWindow = () => {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      toast.error("Predogleda ni bilo mogoče odpreti.");
    }
    return previewWindow;
  };

  const loadPdfPreview = async (previewWindow: Window, url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("PDF predogled ni na voljo.");
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      previewWindow.location.href = objectUrl;
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      previewWindow.close();
      console.error(error);
      toast.error("PDF predogleda ni bilo mogoče odpreti.");
    }
  };

  const handlePreviewOfferPdf = async () => {
    const previewWindow = openPreviewWindow();
    if (!previewWindow) return;
    setPreviewingMode("offer");
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) {
        previewWindow.close();
        return;
      }
      await loadPdfPreview(previewWindow, `/api/projects/${projectId}/offers/${saved._id}/pdf?mode=offer`);
    } finally {
      setPreviewingMode(null);
    }
  };

  const handlePreviewDescriptionsPdf = async () => {
    const previewWindow = openPreviewWindow();
    if (!previewWindow) return;
    setPreviewingMode("descriptions");
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) {
        previewWindow.close();
        return;
      }
      await loadPdfPreview(previewWindow, `/api/projects/${projectId}/offers/${saved._id}/pdf?variant=descriptions`);
    } finally {
      setPreviewingMode(null);
    }
  };

  const renderPdfActionGroup = (
    previewLabel: string,
    downloadLabel: string,
    onPreview: () => void,
    onDownload: () => void,
    previewing: boolean,
    downloading: boolean,
  ) => (
    <div className="inline-flex h-8 items-center rounded-md border border-border/70 bg-background">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-none border-r border-border/70 px-3"
        onClick={onPreview}
        disabled={isPdfBusy}
      >
        {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {previewLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-none px-3"
        onClick={onDownload}
        disabled={isPdfBusy}
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {downloadLabel}
      </Button>
    </div>
  );


  const handleSend = async () => {
    setSending(true);
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) return;

      const response = await fetch(
        `/api/projects/${projectId}/offers/${saved._id}/send`,
        { method: "POST" }
      );
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Pošiljanje ni uspelo.");
        return;
      }
      toast.success(
        payload.data?.message ?? "Pošiljanje bo implementirano kasneje."
      );
      await refreshOffers(saved._id ?? null, true);
    } catch (error) {
      console.error(error);
      toast.error("Pošiljanje ni uspelo.");
    } finally {
      setSending(false);
    }
  };

  const handleOpenSendDialog = async () => {
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) return;
      setCurrentOffer(saved);
      setSelectedOfferId(saved._id);
      setIsComposeOpen(true);
    } catch (error) {
      console.error(error);
      toast.error("Posiljanja ni mogoce odpreti.");
    }
  };

  const handleCommunicationSent = async () => {
    await refreshOffers(selectedOfferId ?? currentOffer?._id ?? null, true);
    setCommunicationRefreshKey((value) => value + 1);
    onCommunicationChanged?.();
    toast.success("Email je bil uspesno poslan.");
  };


  const handleConfirmCurrentOffer = useCallback(async () => {
    const saved = await ensureSavedOffer();
    if (!saved?._id) return;
    await confirmOffer(saved._id);
  }, [ensureSavedOffer, confirmOffer]);

  const currentStatus = (currentOffer?.status ?? "").toUpperCase();
  const isCurrentAccepted = currentStatus === "ACCEPTED";
  const isCurrentCancelled = currentStatus === "CANCELLED";
  const canConfirmCurrentOffer =
    !!currentOffer?._id && !isCurrentAccepted && !isCurrentCancelled;
  const isConfirmingCurrentOffer = confirmingId !== null;
  const importMatchedCount = importRows.filter((row) => row.status === "matched").length;
  const importNeedsReviewCount = importRows.filter((row) => row.status === "needs_review").length;
  const importInvalidCount = importRows.filter((row) => row.status === "invalid").length;

  return (
    <Card className="p-4 space-y-4">
      {/* VERZIJE + DDV + POPUSTI */}
      <div className="mb-4 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Verzija ponudbe
            </span>
            <Select
              value={selectedOfferId ?? ""}
              onValueChange={handleChangeVersion}
            >
              <SelectTrigger className="min-w-[260px]">
                <SelectValue placeholder="Izberi verzijo ponudbe" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v._id} value={v._id}>
                    {v.title} –{" "}
                    {formatCurrency(
                      v.totalGrossAfterDiscount ?? v.totalWithVat ?? v.totalGross ?? 0
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateNewVersion}
            >
              Nova verzija
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCloneVersion}
              disabled={!selectedOfferId}
            >
              Kopiraj verzijo
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!selectedOfferId}
              onClick={handleDeleteVersion}
            >
              Izbriši verzijo
            </Button>
          </div>
        </div>

        <hr className="my-4 border-border" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Template
            </span>
            <div className="hidden items-center gap-2">
              <Select
                value={selectedTemplateId ?? ""}
                onValueChange={(value) => setSelectedTemplateId(value)}
              >
                <SelectTrigger className="min-w-[260px]">
                  <SelectValue placeholder="Izberi template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template._id} value={template._id}>
                      {template.title} {"-"} {formatCurrency(template.totalGrossAfterDiscount ?? template.totalWithVat ?? 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-9 shrink-0"
                disabled={!selectedTemplateId}
                onClick={openRenameTemplateDialog}
                aria-label="Preimenuj template"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={!selectedTemplateId}
                onClick={openDeleteTemplateDialog}
                aria-label="Izbriši template"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Popover open={isTemplatePickerOpen} onOpenChange={setIsTemplatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={isTemplatePickerOpen}
                  className="min-w-[320px] justify-between"
                >
                  <span className="truncate text-left">
                    {selectedTemplate
                      ? `${selectedTemplate.title} - ${formatCurrency(selectedTemplate.totalGrossAfterDiscount ?? selectedTemplate.totalWithVat ?? 0)}`
                      : "Izberi template"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[360px] p-2">
                <div className="space-y-1">
                  {templates.length === 0 ? (
                    <div className="px-3 py-5 text-sm text-muted-foreground">Ni shranjenih template-ov.</div>
                  ) : (
                    templates.map((template) => {
                      const isSelected = template._id === selectedTemplateId;
                      return (
                        <div
                          key={template._id}
                          role="button"
                          tabIndex={0}
                          className={`group flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                            isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/70"
                          }`}
                          onClick={() => {
                            setSelectedTemplateId(template._id);
                            setIsTemplatePickerOpen(false);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedTemplateId(template._id);
                              setIsTemplatePickerOpen(false);
                            }
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {isSelected && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                              <span className="truncate font-medium">{template.title}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {formatCurrency(template.totalGrossAfterDiscount ?? template.totalWithVat ?? 0)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label={`Preimenuj ${template.title}`}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                void openRenameTemplateDialog(template);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Izbriši ${template.title}`}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                openDeleteTemplateDialogForItem(template);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={openCreateTemplateDialog}
              disabled={templateSaving}
            >
              {templateSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowLeft className="mr-2 h-4 w-4" />
              )}
              Shrani template
            </Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleApplyTemplate}
              disabled={!selectedTemplateId || templateCreating}
            >
              {templateCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vnos podatkov
              {!templateCreating && <ArrowDown className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="hidden mt-3 flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">DDV način</span>
            <Select
              value={String(vatMode)}
              onValueChange={(value) =>
                handleVatModeChange(Number(value) as 0 | 9.5 | 22)
              }
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="22">22 %</SelectItem>
                <SelectItem value="9.5">9,5 %</SelectItem>
                <SelectItem value="0">0 % (76. člen)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={useGlobalDiscount}
                onChange={(e) =>
                  handleToggleGlobalDiscount(e.target.checked)
                }
              />
              <span>Popust na celotno ponudbo</span>
              {useGlobalDiscount && (
                <>
                  <Input
                    type="number"
                    className="w-20 text-right"
                    inputMode="decimal"
                    value={globalDiscountPercent}
                    onChange={(e) =>
                      setGlobalDiscountPercent(
                        Number(e.target.value) || 0
                      )
                    }
                  />
                  <span className="text-muted-foreground">%</span>
                </>
              )}
            </label>

            <label className="flex items-center gap-2">
              <Checkbox
                checked={usePerItemDiscount}
                onChange={(e) =>
                  setUsePerItemDiscount(e.target.checked)
                }
              />
              <span>Popust po produktih</span>
            </label>
          </div>
        </div>
      </div>

      {/* HEADER POLJA */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {isEditingTitle ? (
              <Input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => {
                  const next = titleDraft.trim() || "Ponudba";
                  setTitle(next);
                  setIsEditingTitle(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const next = titleDraft.trim() || "Ponudba";
                    setTitle(next);
                    setIsEditingTitle(false);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setTitleDraft(title);
                    setIsEditingTitle(false);
                  }
                }}
                className="text-xl font-semibold"
                autoFocus
              />
            ) : (
              <button
                type="button"
                className="text-xl font-semibold text-left"
                onClick={() => setIsEditingTitle(true)}
              >
                {title || "Ponudba"}
              </button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Prodajnik:{" "}
            {users.find((user) => user.id === salesUserId)?.name ?? "—"}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Plačilni pogoji</label>
            <Select
              value={paymentTerms || ""}
              onValueChange={(value) => setPaymentTerms(value)}
              disabled={paymentTermsOptions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Izberi plačilne pogoje" />
              </SelectTrigger>
              <SelectContent>
                {paymentTermsOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Komentar (vidno na PDF)</label>
            <Textarea
              ref={commentTextareaRef}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Dodatne informacije za prikaz v PDF-ju"
              rows={1}
              className="min-h-9 resize-none overflow-hidden"
            />
          </div>
        </div>
      </div>

        <div className="rounded-lg border bg-muted/25 px-4 py-3">
          <div className="flex flex-wrap items-start gap-4 lg:items-center lg:justify-between">
            <div className="flex min-w-[180px] items-center gap-2">
              <span className="text-sm text-muted-foreground">DDV način</span>
              <Select
                value={String(vatMode)}
                onValueChange={(value) =>
                  handleVatModeChange(Number(value) as 0 | 9.5 | 22)
                }
              >
                <SelectTrigger className="w-[130px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="22">22 %</SelectItem>
                  <SelectItem value="9.5">9,5 %</SelectItem>
                  <SelectItem value="0">0 % (76. člen)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-4">
              <label className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={useGlobalDiscount}
                  onChange={(e) =>
                    handleToggleGlobalDiscount(e.target.checked)
                  }
                />
                <span className="text-sm">Popust na celotno ponudbo</span>
                {useGlobalDiscount && (
                  <>
                    <Input
                      type="number"
                      className="w-20 bg-background text-right"
                      inputMode="decimal"
                      value={globalDiscountPercent}
                      onChange={(e) =>
                        setGlobalDiscountPercent(
                          Number(e.target.value) || 0
                        )
                      }
                    />
                    <span className="text-muted-foreground">%</span>
                  </>
                )}
              </label>

              <label className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={usePerItemDiscount}
                  onChange={(e) =>
                    setUsePerItemDiscount(e.target.checked)
                  }
                />
                <span className="text-sm">Popust po produktih</span>
              </label>
            </div>
          </div>
        </div>
      {/* TABELA POSTAVK */}
      <div ref={lineItemsRef}>
        <OfferItemsMobile
          items={items}
          visibleBlankItemId={visibleMobileBlankItemId}
          usePerItemDiscount={usePerItemDiscount}
          useGlobalDiscount={useGlobalDiscount}
          globalDiscountPercent={globalDiscountPercent}
          totals={totals}
          formatCurrency={formatCurrency}
          onRevealBlankItem={revealMobileBlankItem}
          onUpdateItem={updateItem}
          onDeleteItem={deleteRow}
          onSelectProduct={handleSelectProduct}
          onSelectCustomItem={handleSelectCustomItem}
          renderSuggestions={(item) => renderLinkedServiceSuggestions(item as OfferLineItemForm)}
        />

        <div className="hidden md:block bg-card rounded-[var(--radius-card)] border overflow-hidden offers-line-items-table">
          <Table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "42%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            {usePerItemDiscount && <col style={{ width: "10%" }} />}
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "4%" }} />
          </colgroup>
          <TableHeader>
            <TableRow className="h-11">
              <TableHead className="text-left pl-4 align-middle">
                Naziv
              </TableHead>
              <TableHead className="text-right align-middle">
                Količina
              </TableHead>
              <TableHead className="text-right align-middle">
                Enota
              </TableHead>
              <TableHead className="text-right align-middle">
                Cena
              </TableHead>
              {usePerItemDiscount && (
                <TableHead className="text-right align-middle">
                  Popust %
                </TableHead>
              )}
              <TableHead className="text-right align-middle">
                DDV %
              </TableHead>
              <TableHead className="text-right align-middle pr-4">
                Skupaj
              </TableHead>
              <TableHead className="text-center align-middle" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const suggestionContent = renderLinkedServiceSuggestions(item);
              return (
              <Fragment key={item.id}>
              <TableRow key={item.id} className="h-11">
                <TableCell className="text-left pl-4 align-middle min-w-0">
                  <div className="min-w-0">
                    <PriceListProductAutocomplete
                      value={item.name}
                      placeholder="Naziv ali iskanje v ceniku"
                      inputClassName="text-left h-9 min-w-0 truncate"
                      onChange={(name) => {
                        updateItem(item.id, { name, productId: null });
                      }}
                      onCustomSelected={() => handleSelectCustomItem(item.id)}
                      onProductSelected={(product) => handleSelectProduct(item.id, product, index)}
                    />
                  </div>
                </TableCell>

                <TableCell className="text-right align-middle">
                  <Input
                    className="text-right h-9"
                    type="number"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(item.id, {
                        quantity: Number(event.target.value),
                      })
                    }
                  />
                </TableCell>

                <TableCell className="text-right align-middle">
                  <Input
                    className="text-right h-9"
                    value={item.unit}
                    onChange={(event) =>
                      updateItem(item.id, { unit: event.target.value })
                    }
                  />
                </TableCell>

                <TableCell className="text-right align-middle">
                  <div className="flex items-center justify-end gap-2">
                    <span className="block text-right tabular-nums">
                      {Number(item.unitPrice || 0).toLocaleString("sl-SI", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="shrink-0">€</span>
                  </div>
                </TableCell>

                {usePerItemDiscount && (
                  <TableCell className="text-right align-middle">
                    <Input
                      className="text-right h-9"
                      type="number"
                      inputMode="decimal"
                      value={item.discountPercent ?? 0}
                      onChange={(event) =>
                        updateItem(item.id, {
                          discountPercent: Number(event.target.value),
                        })
                      }
                    />
                  </TableCell>
                )}

                <TableCell className="text-right align-middle">
                  <span className="block text-right tabular-nums">
                    {Number(item.vatRate || 0)}
                  </span>
                </TableCell>

                <TableCell className="text-right align-middle pr-4">
                  {(item.totalGross || 0).toLocaleString("sl-SI", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  €
                </TableCell>

                <TableCell className="text-center align-middle">
                  {items.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteRow(item.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
              {suggestionContent ? (
                <TableRow key={`${item.id}-suggestions`}>
                  <TableCell colSpan={totalColumns} className="px-4 pb-4 pt-0">
                    {suggestionContent}
                  </TableCell>
                </TableRow>
              ) : null}
              </Fragment>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="border-t">
              <TableCell colSpan={summaryLabelColSpan} className="text-right text-sm text-muted-foreground pr-4">
                Osnova brez DDV
              </TableCell>
              <TableCell className="text-right tabular-nums pr-4">
                {formatCurrency(totals.baseWithoutVat ?? 0)}
              </TableCell>
              <TableCell />
            </TableRow>

            {usePerItemDiscount && (totals.perItemDiscountAmount ?? 0) > 0 && (
              <TableRow>
                <TableCell colSpan={summaryLabelColSpan} className="text-right text-sm text-muted-foreground pr-4">
                  Popust po produktih
                </TableCell>
                <TableCell className="text-right tabular-nums pr-4">
                  -{formatCurrency(totals.perItemDiscountAmount ?? 0)}
                </TableCell>
                <TableCell />
              </TableRow>
            )}

            {useGlobalDiscount && (totals.globalDiscountAmount ?? 0) > 0 && (
              <TableRow>
                <TableCell colSpan={summaryLabelColSpan} className="text-right text-sm text-muted-foreground pr-4">
                  Popust na celotno ponudbo ({globalDiscountPercent || 0}%)
                </TableCell>
                <TableCell className="text-right tabular-nums pr-4">
                  -{formatCurrency(totals.globalDiscountAmount ?? 0)}
                </TableCell>
                <TableCell />
              </TableRow>
            )}

            <TableRow>
              <TableCell colSpan={summaryLabelColSpan} className="text-right text-sm text-muted-foreground pr-4">
                Osnova po popustih
              </TableCell>
              <TableCell className="text-right tabular-nums pr-4">
                {formatCurrency(totals.baseAfterDiscount ?? 0)}
              </TableCell>
              <TableCell />
            </TableRow>

            <TableRow>
              <TableCell colSpan={summaryLabelColSpan} className="text-right text-sm text-muted-foreground pr-4">
                DDV ({vatMode}%)
              </TableCell>
              <TableCell className="text-right tabular-nums pr-4">
                {formatCurrency(vatAmount)}
              </TableCell>
              <TableCell />
            </TableRow>

            <TableRow className="font-semibold">
              <TableCell colSpan={summaryLabelColSpan} className="text-right pr-4">
                Skupaj za plačilo (z DDV)
              </TableCell>
              <TableCell className="text-right tabular-nums pr-4">
                {formatCurrency(totalGrossAfterDiscount)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
          </Table>
        </div>
      </div>

      <Dialog open={isTemplateNameDialogOpen} onOpenChange={setIsTemplateNameDialogOpen}>
      <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{templateDialogMode === "create" ? "Shrani template" : "Preimenuj template"}</DialogTitle>
            <DialogDescription>
              {templateDialogMode === "create"
                ? "Vnesi ime, pod katerim bo template viden v globalnem seznamu."
                : "Posodobi ime izbranega template-a."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ime template-a</label>
              <Input
                value={templateNameDraft}
                onChange={(event) => setTemplateNameDraft(event.target.value)}
                placeholder="npr. Standardna alarm ponudba"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">DDV način</label>
              <Select
                value={String(templateVatModeDraft)}
                onValueChange={(value) => setTemplateVatModeDraft(Number(value) as 0 | 9.5 | 22)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="22">22 %</SelectItem>
                  <SelectItem value="9.5">9,5 %</SelectItem>
                  <SelectItem value="0">0 % (76. člen)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Popust na celotno ponudbo</label>
                  <p className="text-xs text-muted-foreground">
                    Če je izklopljen, trenutni globalni popust v ponudbi ostane nespremenjen.
                  </p>
                </div>
                <Checkbox
                  checked={templateApplyGlobalDiscount}
                  onCheckedChange={(checked) => setTemplateApplyGlobalDiscount(Boolean(checked))}
                />
              </div>
              {templateApplyGlobalDiscount && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-600">Vrednost popusta (%)</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={templateGlobalDiscountDraft}
                    onChange={(event) => setTemplateGlobalDiscountDraft(event.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Popust po produktih</label>
                  <p className="text-xs text-muted-foreground">
                    Če je izklopljen, item discounti v trenutni ponudbi ostanejo takšni kot so.
                  </p>
                </div>
                <Checkbox
                  checked={templateApplyPerItemDiscount}
                  onCheckedChange={(checked) => setTemplateApplyPerItemDiscount(Boolean(checked))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTemplateNameDialogOpen(false)}>
              Prekliči
            </Button>
            <Button onClick={submitTemplateDialog} disabled={templateSaving}>
              {templateSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Shrani
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTemplateDeleteDialogOpen} onOpenChange={setIsTemplateDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Izbriši template</DialogTitle>
            <DialogDescription>
              Ali ste prepričani, da želite izbrisati ta template?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTemplateDeleteDialogOpen(false)}>
              Prekliči
            </Button>
            <Button variant="destructive" onClick={confirmDeleteTemplate} disabled={templateDeleting}>
              {templateDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Izbriši
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Uvozi ponudbo</DialogTitle>
            <DialogDescription>Prilepi tabelo iz Google Sheets (TSV/CSV) in preveri ujemanja s cenikom.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium">Prilepi tabelo</label>
            <Textarea
              value={importRawText}
              onChange={(event) => setImportRawText(event.target.value)}
              rows={8}
              placeholder={"Naziv\t9.5%\t1"}
            />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Delimiter: samodejno zaznano (prednost ima tabulator).</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={parseOfferImport}
                disabled={importLoading}
              >
                {importLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Analiziraj tabelo
              </Button>
            </div>
            {importError && <p className="text-sm text-red-600">{importError}</p>}
            {showImportMappingHint && (
              <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                Namig mapiranja: naziv = prvi besedilni stolpec, DDV (%) se ignorira, kolicina = zadnji numericni stolpec.
              </div>
            )}
          </div>

          {importRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Matched: {importMatchedCount}</Badge>
                <Badge className="bg-amber-500 text-white hover:bg-amber-500">Needs review: {importNeedsReviewCount}</Badge>
                <Badge className="bg-slate-600 text-white hover:bg-slate-600">Invalid: {importInvalidCount}</Badge>
              </div>

              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[70px]">Vrstica</TableHead>
                      <TableHead>Naziv iz paste</TableHead>
                      <TableHead className="w-[120px] text-right">Kolicina</TableHead>
                      <TableHead className="w-[180px]">Status</TableHead>
                      <TableHead>Izbira produkta</TableHead>
                      <TableHead className="w-[120px] text-right">Cena</TableHead>
                      <TableHead className="w-[120px] text-right">Akcija</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importRows.map((row) => {
                      const resolvedProduct = resolveImportRowProduct(row);
                      const candidateOptions = (row.matchCandidates?.length ? row.matchCandidates : row.matches) ?? [];
                      const isSkipped = Boolean(row.skipped);
                      return (
                        <TableRow key={row.rowIndex} className={isSkipped ? "opacity-60" : ""}>
                          <TableCell>{row.rowIndex}</TableCell>
                          <TableCell className="align-top">
                            <div className="break-words">{row.rawName || "-"}</div>
                          </TableCell>
                          <TableCell className="text-right">{row.qty}</TableCell>
                          <TableCell>
                            {row.status === "matched" && (
                              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Matched</Badge>
                            )}
                            {row.status === "needs_review" && (
                              <Badge className="bg-amber-500 text-white hover:bg-amber-500">Needs review</Badge>
                            )}
                            {(row.status === "not_found" || row.status === "invalid") && (
                              <Badge className="bg-slate-600 text-white hover:bg-slate-600">Invalid</Badge>
                            )}
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.chosenReason ?? "n/a"}{" "}
                              {typeof row.matchScore === "number" ? row.matchScore.toFixed(2) : "0.00"}
                            </div>
                          </TableCell>
                          <TableCell className="space-y-2">
                            {candidateOptions.length > 0 ? (
                              <Select
                                value={row.chosenProductId ?? "__none"}
                                onValueChange={(value) => {
                                  updateImportRow(row.rowIndex, {
                                    chosenProductId: value === "__none" ? undefined : value,
                                  });
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Izberi produkt" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none">Brez izbire</SelectItem>
                                  {candidateOptions.map((match) => (
                                    <SelectItem key={match.productId} value={match.productId}>
                                      {match.displayName ?? match.ime}
                                      {typeof match.score === "number" ? ` (${match.score.toFixed(3)})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}
                            {(row.status === "not_found" || row.status === "needs_review") && (
                              <PriceListProductAutocomplete
                                value={row.manualMatch?.ime ?? row.rawName}
                                placeholder="Rocno poisci v ceniku"
                                onChange={(name) => {
                                  updateImportRow(row.rowIndex, { rawName: name });
                                }}
                                onCustomSelected={() => undefined}
                                onProductSelected={(product) => {
                                  updateImportRow(row.rowIndex, {
                                    chosenProductId: product.id,
                                    manualMatch: {
                                      productId: product.id,
                                      ime: product.name,
                                      prodajnaCena: product.unitPrice,
                                      isService: product.unit === "ura",
                                    },
                                  });
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {resolvedProduct
                              ? `${Number(resolvedProduct.prodajnaCena).toLocaleString("sl-SI", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} €`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant={isSkipped ? "secondary" : "outline"}
                              onClick={() => updateImportRow(row.rowIndex, { skipped: !isSkipped })}
                            >
                              {isSkipped ? "Vrni" : "Odstrani"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportOpen(false)}>
              Zapri
            </Button>
            <Button
              onClick={handleImportApply}
              disabled={importRows.length === 0 || importLoading}
            >
              Uvozi v ponudbo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OfferCommunicationComposeDialog
        open={isComposeOpen}
        onOpenChange={setIsComposeOpen}
        projectId={projectId}
        offerId={currentOffer?._id ?? selectedOfferId}
        customerName={projectDetails?.customerDetail?.name ?? ""}
        customerEmail={projectDetails?.customerDetail?.email ?? ""}
        projectName={projectDetails?.title ?? ""}
        offerNumber={currentOffer?.documentNumber ?? currentOffer?.title ?? currentOffer?.baseTitle ?? ""}
        offerTotal={Number(currentOffer?.totalWithVat ?? currentOffer?.totalGrossAfterDiscount ?? currentOffer?.totalGross ?? 0)}
        companyName={settings?.companyName ?? ""}
        onSent={handleCommunicationSent}
      />

      {/* GUMBI */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={openImportModal}>
            Uvozi ponudbo
          </Button>
          {renderPdfActionGroup(
            "Poglej opise",
            "",
            () => {
              void handlePreviewDescriptionsPdf();
            },
            () => {
              void handleExportDescriptionsPdf();
            },
            previewingMode === "descriptions",
            downloadingMode === "descriptions",
          )}
          {renderPdfActionGroup(
            "Poglej ponudbo",
           "" ,
            () => {
              void handlePreviewOfferPdf();
            },
            () => {
              void handleExportPdf("offer");
            },
            previewingMode === "offer",
            downloadingMode === "offer",
          )}
          <Button
            variant="outline"
            onClick={handleOpenSendDialog}
            disabled={saving}
          >
            Pošlji email stranki
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleConfirmCurrentOffer}
            disabled={!canConfirmCurrentOffer || isConfirmingCurrentOffer}
            className={
              isCurrentAccepted
                ? "bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-100"
                : "bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-100"
            }
          >
            {isConfirmingCurrentOffer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCurrentAccepted ? "Ponudba potrjena" : "Potrdi ponudbo"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Shrani ponudbo
          </Button>
        </div>
      </div>
      <OfferSentMessagesTable
        projectId={projectId}
        offerId={currentOffer?._id ?? selectedOfferId}
        refreshKey={communicationRefreshKey}
      />

    </Card>
  );
}



