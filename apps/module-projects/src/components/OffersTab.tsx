import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
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
import type { CommunicationMessage } from "@aintel/shared/types/communication";
import { parseApiEnvelope } from "@aintel/shared/utils/api-client";

import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronsUpDown, Loader2, Pencil, Trash, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { Textarea } from "./ui/textarea";
import { PriceListProductAutocomplete } from "./PriceListProductAutocomplete";
import { OfferItemsMobile } from "./OfferItemsMobile";
import { mapProject } from "../domains/core/useProject";
import { useConfirmOffer } from "../domains/core/useConfirmOffer";
import {
  calculateProjectKm,
  fetchExecutionRuleSettings,
  fetchRouteCalculationSettings,
  type RouteCalculationSettings,
} from "../api";
import { useProjectMutationRefresh } from "../domains/core/useProjectMutationRefresh";
import { useSettingsData } from "@aintel/module-settings";
import { OfferCommunicationComposeDialog } from "../domains/communication/OfferCommunicationComposeDialog";
import { OfferSentMessagesTable } from "../domains/communication/OfferSentMessagesTable";
import { fetchOfferMessages } from "../domains/communication/api";
import { ExecutionDefinitionPanel } from "../domains/logistics/ExecutionDefinitionPanel";
import { OfferImportDialog } from "../domains/offers/OfferImportDialog";
import {
  OfferKmAddressComparison,
  OfferKmCalculationButton,
  OfferKmCalculationMobile,
  shouldShowOfferKmAddressComparison,
} from "../domains/offers/OfferKmCalculationControls";
import { OfferLinkedServiceSuggestions } from "../domains/offers/OfferLinkedServiceSuggestions";
import { OfferPdfActionGroup } from "../domains/offers/OfferPdfActionGroup";
import { OfferTemplateDialogs } from "../domains/offers/OfferTemplateDialogs";
import { useOfferPdfActions } from "../domains/offers/useOfferPdfActions";
import {
  calculateOfferTotals,
  createEmptyItem,
  createOfferEditorSnapshot,
  EMPTY_OFFER_SNAPSHOT,
  ensureTrailingBlankOfferItem,
  formatKm,
  isEmptyOfferItem,
  isItemValid,
  recalculateOfferItem,
  resolveImportRowProduct,
  resolveUnitFromName,
  sleep,
  type KmCalculationState,
  type OfferEmailSendContext,
  type OfferImportRow,
  type OfferLineItemForm,
} from "../domains/offers/offerEditorUtils";

type OffersTabProps = {
  projectId: string;
  refreshKey?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
  onCommunicationChanged?: () => void;
};

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
  const [routeCalculationSettings, setRouteCalculationSettings] = useState<RouteCalculationSettings | null>(null);
  const [kmCalculationStates, setKmCalculationStates] = useState<Record<string, KmCalculationState>>({});
  const [manualKmQuantities, setManualKmQuantities] = useState<Record<string, number>>({});
  const [kilometrinaServiceProductIds, setKilometrinaServiceProductIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    let alive = true;
    fetchRouteCalculationSettings()
      .then((settings) => {
        if (alive) {
          setRouteCalculationSettings(settings);
        }
      })
      .catch(() => {
        if (alive) {
          setRouteCalculationSettings({ routeCalculationAddress: "", orsApiConfigured: false });
        }
      });

    fetchExecutionRuleSettings()
      .then((settings) => {
        if (!alive) return;
        const ids = new Set<string>();
        for (const scenario of settings.scenarios ?? []) {
          for (const service of scenario.storitve ?? []) {
            if (
              service.quantityRule?.type === "per_classification_field" &&
              service.quantityRule.field === "kilometrinaKm" &&
              service.serviceProductId
            ) {
              ids.add(String(service.serviceProductId));
            }
          }
        }
        setKilometrinaServiceProductIds(ids);
      })
      .catch(() => {
        if (alive) {
          setKilometrinaServiceProductIds(new Set());
        }
      });

    return () => {
      alive = false;
    };
  }, []);

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
    setPaymentTerms(defaultPaymentTerms);
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
    setLastSavedSnapshot(
      createOfferEditorSnapshot({
        title: "Ponudba",
        paymentTerms: defaultPaymentTerms,
        comment: "",
        items: [],
        useGlobalDiscount: false,
        usePerItemDiscount: false,
        vatMode: 22,
        globalDiscountPercent: 0,
      })
    );
    setLinkedServiceSuggestions({});
    setLoadingLinkedServiceSuggestions({});
    setManualKmQuantities({});
  }, [defaultPaymentTerms]);

  const refreshAfterMutation = useProjectMutationRefresh(projectId);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const fetchAssignmentsData = async () => {
      try {
        const [usersRes, employeesRes] = await Promise.all([
          fetch("/api/users"),
          fetch("/api/employees"),
        ]);
        const usersPayload = await parseApiEnvelope<User[]>(usersRes, "Uporabnikov ni mogoče naložiti.");
        const employeesPayload = await parseApiEnvelope<Employee[]>(employeesRes, "Zaposlenih ni mogoče naložiti.");
        if (!alive) return;
        setUsers(Array.isArray(usersPayload) ? usersPayload : []);
        setEmployees(Array.isArray(employeesPayload) ? employeesPayload : []);
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
      const offer = await parseApiEnvelope<OfferVersion>(response, "Ponudbe ni mogoče naložiti.");
      if (!offer) return;

      setTitle(offer.baseTitle || "Ponudba");
      const offerKey = (offer as any)?._id ?? (offer as any)?.id ?? offerId;
      const normalizedTerms = (offer.paymentTerms ?? "").trim();
      const shouldUseDefaultTerms = normalizedTerms.length === 0;
      const effectivePaymentTerms = shouldUseDefaultTerms ? defaultPaymentTerms : offer.paymentTerms ?? "";
      const alreadyInitialized = paymentTermsInitRef.current[offerKey] === true;
      if (!alreadyInitialized) {
        setPaymentTerms(effectivePaymentTerms);
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
      setManualKmQuantities({});
      setLinkedServiceSuggestions({});
      setLoadingLinkedServiceSuggestions({});
      setLastSavedSnapshot(
        createOfferEditorSnapshot({
          title: offer.baseTitle || "Ponudba",
          paymentTerms: effectivePaymentTerms,
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
        const list = await parseApiEnvelope<OfferVersionSummary[]>(res, "Ponudb ni mogoče naložiti.");
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
      const payload = await parseApiEnvelope<OfferTemplateSummary[]>(response, "Template-ov ni mogoče naložiti.");
      const list: OfferTemplateSummary[] = Array.isArray(payload) ? payload : [];
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
    setKmCalculationStates({});
    setManualKmQuantities({});
    paymentTermsInitRef.current = {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);


  const recalcItem = (item: OfferLineItemForm, vatModeOverride?: 0 | 9.5 | 22): OfferLineItemForm => {
    return recalculateOfferItem(item, { usePerItemDiscount, vatMode, vatModeOverride });
  };

  const ensureTrailingBlank = ensureTrailingBlankOfferItem;

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

  const isKilometrinaOfferItem = (item: OfferLineItemForm) =>
    !!item.productId && kilometrinaServiceProductIds.has(String(item.productId));

  const handleItemUpdate = (id: string, changes: Partial<OfferLineItemForm>) => {
    const current = items.find((item) => item.id === id);
    if (current && Object.prototype.hasOwnProperty.call(changes, "quantity") && isKilometrinaOfferItem(current)) {
      const nextQuantity = Number(changes.quantity);
      if (Number.isFinite(nextQuantity)) {
        setManualKmQuantities((prev) => ({ ...prev, [id]: nextQuantity }));
      }
      setKmCalculationStates((prev) => ({ ...prev, [id]: { status: "manual" } }));
    }
    updateItem(id, changes);
  };

  const isKmCalculationDisabled =
    !routeCalculationSettings?.orsApiConfigured || !routeCalculationSettings?.routeCalculationAddress?.trim();

  const applyKmResult = (item: OfferLineItemForm, result: ProjectKmCalculation) => {
    setManualKmQuantities((prev) => {
      if (!(item.id in prev)) return prev;
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    updateItem(item.id, { quantity: result.razdaljaSkupaj });
    setKmCalculationStates((prev) => ({ ...prev, [item.id]: { status: "calculated", result } }));
  };

  const handleCalculateKm = async (item: OfferLineItemForm) => {
    if (!isKilometrinaOfferItem(item) || isKmCalculationDisabled) {
      return;
    }

    setKmCalculationStates((prev) => ({ ...prev, [item.id]: { status: "loading" } }));
    try {
      const result = await calculateProjectKm(projectId);
      applyKmResult(item, result);
      toast.success(`Kilometrina izračunana: ${formatKm(result.razdaljaSkupaj)} km.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Naslova ni bilo mogoče najti. Vnesi km ročno.";
      setKmCalculationStates((prev) => ({ ...prev, [item.id]: { status: "error", message } }));
      toast.error(message);
    }
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
    setManualKmQuantities((prev) => {
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

  const moveItem = (id: string, direction: -1 | 1) => {
    setItems((prev) => {
      const movableItems = prev.filter((item) => !isEmptyOfferItem(item));
      const fromIndex = movableItems.findIndex((item) => item.id === id);
      const toIndex = fromIndex + direction;
      if (fromIndex === -1 || toIndex < 0 || toIndex >= movableItems.length) return prev;

      const nextMovableItems = [...movableItems];
      const [movedItem] = nextMovableItems.splice(fromIndex, 1);
      nextMovableItems.splice(toIndex, 0, movedItem);

      const trailingBlank = prev.find((item) => isEmptyOfferItem(item)) ?? createEmptyItem();
      return ensureTrailingBlank([...nextMovableItems, trailingBlank]);
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

  const totals = useMemo(
    () =>
      calculateOfferTotals({
        validItems,
        usePerItemDiscount,
        useGlobalDiscount,
        globalDiscountPercent,
        vatMode,
      }),
    [validItems, usePerItemDiscount, useGlobalDiscount, globalDiscountPercent, vatMode]
  );

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
  const summaryLabelColSpan = totalColumns - 1;
  const totalColumnClassName =
    "sticky right-0 z-10 bg-card text-right align-middle pr-4 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)]";
  const totalFooterColumnClassName =
    "sticky right-0 z-10 bg-muted/50 text-right tabular-nums pr-4 shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.35)]";

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
        if (overriddenVatIds.has(item.id)) return recalcItem(item, mode);
        return recalcItem({ ...item, vatRate: mode }, mode);
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
      const payload = await parseApiEnvelope<ProductServiceLink[]>(response, "Povezanih storitev ni mogoče naložiti.");
      const links: ProductServiceLink[] = Array.isArray(payload) ? payload : [];
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

  const getLinkedServiceSuggestionProps = (item: OfferLineItemForm) => {
    const links = linkedServiceSuggestions[item.id] ?? [];
    return {
      item,
      links,
      loading: Boolean(loadingLinkedServiceSuggestions[item.id]),
      canAddAny: links.some((link) => !isSuggestedServiceAlreadyAdded(link.serviceProductId, item.id)),
      resolveQuantity: resolveSuggestedServiceQuantity,
      isAlreadyAdded: isSuggestedServiceAlreadyAdded,
      onAddAll: (rowId: string, targetLinks: ProductServiceLink[]) => addSuggestedServicesToOffer(rowId, targetLinks, true),
      onAddOne: (rowId: string, link: ProductServiceLink) => addSuggestedServicesToOffer(rowId, [link]),
    };
  };

  const openClientAddressEditor = () => {
    const clientId = projectDetails?.client?.id ?? projectDetails?.customerDetail?.id;
    if (!clientId) {
      toast.message("Stranka ni povezana s CRM zapisom. Naslov popravi pri podatkih projekta.");
      return;
    }
    window.location.href = `/crm?clientId=${encodeURIComponent(String(clientId))}`;
  };

  const getKmCalculationProps = (item: OfferLineItemForm) => ({
    item,
    isKmItem: isKilometrinaOfferItem(item),
    state: kmCalculationStates[item.id] ?? ({ status: "idle" } as KmCalculationState),
    disabled: isKmCalculationDisabled,
    projectDetails,
    onCalculate: (target: OfferLineItemForm) => void handleCalculateKm(target),
    onOpenAddressEditor: openClientAddressEditor,
  });

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
      const payload = await parseApiEnvelope<{ rows?: OfferImportRow[] }>(response, "Razčlenjevanje tabele ni uspelo.");
      if (!Array.isArray(payload?.rows)) {
        setImportRows([]);
        setImportError("Razčlenjevanje tabele ni uspelo.");
        setShowImportMappingHint(true);
        return;
      }
      setImportRows(payload.rows);
    } catch (error) {
      console.error(error);
      setImportRows([]);
      setImportError(error instanceof Error ? error.message : "Razčlenjevanje tabele ni uspelo.");
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
      .map((i) => {
        const quantity =
          isKilometrinaOfferItem(i) && manualKmQuantities[i.id] !== undefined
            ? manualKmQuantities[i.id]
            : i.quantity;
        return {
        id: i.id,
        productId: i.productId,
        name: i.name,
        quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        vatRate: i.vatRate,
        totalNet: i.totalNet,
        totalVat: i.totalVat,
        totalGross: i.totalGross,
        discountPercent: usePerItemDiscount ? i.discountPercent ?? 0 : 0,
        };
      });

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
      const offerIdBeingSaved = selectedOfferId;
      const payloadBody = buildPayloadFromCurrentState();
      const url = offerIdBeingSaved
        ? `/api/projects/${projectId}/offers/${offerIdBeingSaved}`
        : `/api/projects/${projectId}/offers`;
      const method = offerIdBeingSaved ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });

      const created = await parseApiEnvelope<OfferVersion>(response, "Ponudbe ni bilo mogoče shraniti.");
      const savedOfferId = offerIdBeingSaved ?? created._id ?? null;
      if (savedOfferId) {
        selectedOfferIdRef.current = savedOfferId;
        setSelectedOfferId(savedOfferId);
      }
      await refreshAfterMutation(
        () => refreshOffers(savedOfferId, !savedOfferId),
        async () => {
          await fetchProjectDetails();
        },
      );
      toast.success("Ponudba shranjena.");
      setLastSavedSnapshot(currentOfferSnapshot);
      return created;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Napaka pri shranjevanju ponudbe.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const ensureSavedOffer = async () => {
    if (currentOffer?._id && !isDirty) {
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

    try {
      const response = await fetch(`/api/projects/${projectId}/offers/${selectedOfferId}`, {
        method: "DELETE",
      });
      await parseApiEnvelope<unknown>(response, "Ponudbe ni bilo mogoče izbrisati.");

      await refreshOffers(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Ponudbe ni bilo mogoče izbrisati.");
    }
  };

  const handleCloneVersion = async () => {
    if (!selectedOfferId) return;
    try {
      const payload = buildPayloadFromCurrentState();
      const response = await fetch(`/api/projects/${projectId}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const created = await parseApiEnvelope<OfferVersion>(response, "Ponudbe ni bilo mogoče klonirati.");
      await refreshOffers(created._id ?? null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Ponudbe ni bilo mogoče klonirati.");
    }
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
      const payload = await parseApiEnvelope<OfferTemplateSummary>(response, "Template ni bilo mogoče shraniti.");

      await refreshTemplates(payload._id ?? null);
      toast.success("Template shranjen.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Template ni bilo mogoče shraniti.");
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
      const payload = await parseApiEnvelope<OfferTemplate>(response, "Template podatkov ni bilo mogoče naložiti.");

      setTemplateDialogMode("rename");
      setTemplateDialogTemplateId(targetTemplate._id);
      fillTemplateDialogFromTemplate(payload);
      setIsTemplateNameDialogOpen(true);
      setIsTemplatePickerOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Template podatkov ni bilo mogoče naložiti.");
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

      const fallbackMessage =
        templateDialogMode === "create"
          ? "Template ni bilo mogoče shraniti."
          : "Template ni bilo mogoče preimenovati.";
      const payload = await parseApiEnvelope<OfferTemplateSummary>(response, fallbackMessage);

      await refreshTemplates(payload._id ?? null);
      setIsTemplateNameDialogOpen(false);
      toast.success(templateDialogMode === "create" ? "Template shranjen." : "Template preimenovan.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : templateDialogMode === "create" ? "Template ni bilo mogoče shraniti." : "Template ni bilo mogoče preimenovati.");
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
      await parseApiEnvelope<unknown>(response, "Template ni bilo mogoče izbrisati.");

      setIsTemplateDeleteDialogOpen(false);
      setTemplateDeleteTarget(null);
      await refreshTemplates(null);
      setSelectedTemplateId((current) => (current === deletedId ? null : current));
      toast.success("Template izbrisan.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Template ni bilo mogoče izbrisati.");
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
      const created = await parseApiEnvelope<OfferVersion>(response, "Ponudbe iz template-a ni bilo mogoče ustvariti.");
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
      toast.error(error instanceof Error ? error.message : "Ponudbe iz template-a ni bilo mogoče ustvariti.");
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
      const template = await parseApiEnvelope<{
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
      }>(response, "Template podatkov ni bilo mogoče prenesti.");

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
      toast.error(error instanceof Error ? error.message : "Template podatkov ni bilo mogoče prenesti.");
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
      const result = await parseApiEnvelope<any>(response, "Projekt ni bil najden.");
      const mapped = mapProject(result);
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

  const {
    downloadingMode,
    previewingMode,
    isPdfBusy,
    handleExportPdf,
    handleExportDescriptionsPdf,
    handlePreviewOfferPdf,
    handlePreviewDescriptionsPdf,
  } = useOfferPdfActions({
    projectId,
    ensureSavedOffer,
    ensureProjectDetails,
  });

  const saveAssignments = async (nextSalesUserId: string | null, nextEmployeeIds: string[]) => {
    if (!projectId) return;
    setAssignmentsSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/assignments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesUserId: nextSalesUserId,
          assignedEmployeeIds: nextEmployeeIds,
        }),
      });
      const payload = await parseApiEnvelope<any>(response, "Posodobitev dodelitev ni uspela.");
      const mapped = mapProject(payload);
      setProjectDetails(mapped);
      setSalesUserId(mapped.salesUserId ?? "");
      setAssignedEmployeeIds(Array.isArray(mapped.assignedEmployeeIds) ? mapped.assignedEmployeeIds : []);
      await refreshAfterMutation(async () => {
        await fetchProjectDetails();
      });
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Posodobitev dodelitev ni uspela.");
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

  const handleSend = async () => {
    setSending(true);
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) return;

      const response = await fetch(
        `/api/projects/${projectId}/offers/${saved._id}/send`,
        { method: "POST" }
      );
      const payload = await parseApiEnvelope<{ message?: string }>(response, "Pošiljanje ni uspelo.");
      toast.success(
        payload?.message ?? "Pošiljanje bo implementirano kasneje."
      );
      await refreshOffers(saved._id ?? null, true);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Pošiljanje ni uspelo.");
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

  const waitForOfferEmailSendResult = useCallback(
    async (context: OfferEmailSendContext) => {
      const minCreatedAt = context.startedAtMs - 5000;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const messages = await fetchOfferMessages(projectId, context.offerId);
        const matchingMessage = messages.find((message) => {
          const createdAt = Date.parse(message.createdAt || message.sentAt || "");
          return (
            Number.isFinite(createdAt) &&
            createdAt >= minCreatedAt &&
            message.subjectFinal === context.subject &&
            (message.status === "sent" || message.status === "failed")
          );
        });
        if (matchingMessage) {
          return matchingMessage;
        }
        await sleep(2000);
      }
      throw new Error("Pošiljanje še vedno poteka. Status preveri v poslanih sporočilih.");
    },
    [projectId]
  );

  const handleCommunicationSent = async (
    result?: { queued?: boolean },
    context?: OfferEmailSendContext
  ): Promise<CommunicationMessage | null | void> => {
    await refreshOffers(selectedOfferId ?? currentOffer?._id ?? null, true);
    setCommunicationRefreshKey((value) => value + 1);
    onCommunicationChanged?.();

    if (!result?.queued || !context) {
      return null;
    }

    const toastId = toast.loading("Pošiljanje emaila se je začelo. Pripravljam PDF priponke ...", {
      duration: Infinity,
    });

    try {
      const message = await waitForOfferEmailSendResult(context);
      await refreshOffers(selectedOfferId ?? currentOffer?._id ?? null, true);
      setCommunicationRefreshKey((value) => value + 1);
      onCommunicationChanged?.();

      if (message.status === "sent") {
        toast.success("Email je bil uspešno poslan.", { id: toastId, duration: 8000 });
      } else {
        toast.error(message.errorMessage || "Pošiljanje emaila ni uspelo.", { id: toastId, duration: 12000 });
      }

      return message;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pošiljanje emaila ni uspelo.";
      toast.error(message, { id: toastId, duration: 12000 });
      throw error;
    }
  };


  const handleConfirmCurrentOffer = useCallback(async () => {
    const saved = await ensureSavedOffer();
    if (!saved?._id) return;
    await confirmOffer(saved._id);
  }, [ensureSavedOffer, confirmOffer]);

  const handleCancelCurrentOfferConfirmation = useCallback(async () => {
    const offerId = currentOffer?._id ?? selectedOfferId;
    if (!offerId) return;
    if (!window.confirm("Res želiš preklicati potrditev ponudbe? Ponudbo bo mogoče popraviti in znova potrditi.")) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/logistics/cancel-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerVersionId: offerId }),
      });
      await parseApiEnvelope<unknown>(response, "Potrditve ponudbe ni mogoče preklicati.");
      toast.success("Potrditev ponudbe je bila preklicana.");
      await refreshAfterMutation(
        () => refreshOffers(offerId, true),
        async () => {
          await fetchProjectDetails();
        },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Potrditve ponudbe ni mogoče preklicati.");
    } finally {
      setSaving(false);
    }
  }, [currentOffer?._id, fetchProjectDetails, projectId, refreshAfterMutation, refreshOffers, selectedOfferId]);

  const currentStatus = (currentOffer?.status ?? "").toUpperCase();
  const isCurrentAccepted = currentStatus === "ACCEPTED";
  const canConfirmCurrentOffer =
    !!currentOffer?._id && !isCurrentAccepted;
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
                onClick={() => openRenameTemplateDialog()}
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
          onUpdateItem={handleItemUpdate}
          onDeleteItem={deleteRow}
          onMoveItem={moveItem}
          onSelectProduct={handleSelectProduct}
          onSelectCustomItem={handleSelectCustomItem}
          renderItemActions={(item) => <OfferKmCalculationMobile {...getKmCalculationProps(item as OfferLineItemForm)} />}
          renderSuggestions={(item) => (
            <OfferLinkedServiceSuggestions {...getLinkedServiceSuggestionProps(item as OfferLineItemForm)} />
          )}
        />

        <div className="hidden md:block bg-card rounded-[var(--radius-card)] border overflow-hidden offers-line-items-table">
          <Table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: usePerItemDiscount ? "31%" : "38%" }} />
            <col style={{ width: usePerItemDiscount ? "12%" : "13%" }} />
            <col style={{ width: usePerItemDiscount ? "8%" : "8%" }} />
            <col style={{ width: usePerItemDiscount ? "11%" : "12%" }} />
            {usePerItemDiscount && <col style={{ width: "9%" }} />}
            <col style={{ width: usePerItemDiscount ? "8%" : "8%" }} />
            <col style={{ width: usePerItemDiscount ? "5%" : "4%" }} />
            <col style={{ width: usePerItemDiscount ? "16%" : "17%" }} />
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
              <TableHead className="text-center align-middle" />
              <TableHead className={totalColumnClassName}>
                Skupaj
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const suggestionContent = <OfferLinkedServiceSuggestions {...getLinkedServiceSuggestionProps(item)} />;
              const showSuggestions =
                Boolean(item.productId || loadingLinkedServiceSuggestions[item.id]) &&
                (Boolean(loadingLinkedServiceSuggestions[item.id]) || (linkedServiceSuggestions[item.id] ?? []).length > 0);
              const kmCalculationProps = getKmCalculationProps(item);
              const kmButton = <OfferKmCalculationButton {...kmCalculationProps} />;
              const kmAddressComparison = <OfferKmAddressComparison {...kmCalculationProps} />;
              const showKmAddressComparison = shouldShowOfferKmAddressComparison(kmCalculationProps);
              const movableItems = items.filter((entry) => !isEmptyOfferItem(entry));
              const itemOrderIndex = movableItems.findIndex((entry) => entry.id === item.id);
              const canMoveUp = itemOrderIndex > 0;
              const canMoveDown = itemOrderIndex >= 0 && itemOrderIndex < movableItems.length - 1;
              return (
              <Fragment key={item.id}>
              <TableRow key={item.id} className="h-11">
                <TableCell className="text-left pl-4 align-middle min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex shrink-0 flex-col">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-5 w-7 rounded-none"
                        disabled={!canMoveUp}
                        onClick={() => moveItem(item.id, -1)}
                        aria-label={`Premakni postavko ${item.name || index + 1} gor`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-5 w-7 rounded-none"
                        disabled={!canMoveDown}
                        onClick={() => moveItem(item.id, 1)}
                        aria-label={`Premakni postavko ${item.name || index + 1} dol`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="min-w-0 flex-1">
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
                    {kmButton}
                  </div>
                </TableCell>

                <TableCell className="text-right align-middle px-1">
                  <div className="flex items-center justify-end gap-2">
                    <Input
                      className="h-9 w-full min-w-0 text-right"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={item.quantity}
                      onChange={(event) =>
                        handleItemUpdate(item.id, {
                          quantity: Number(event.target.value),
                        })
                      }
                    />
                  </div>
                </TableCell>

                <TableCell className="text-right align-middle px-1">
                  <Input
                    className="h-9 w-full min-w-0 text-right"
                    value={item.unit}
                    onChange={(event) =>
                      updateItem(item.id, { unit: event.target.value })
                    }
                  />
                </TableCell>

                <TableCell className="text-right align-middle">
                  <div className="flex items-center justify-end gap-2">
                    <Input
                      className="h-9 w-full min-w-0 text-right"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItem(item.id, {
                          unitPrice: Number(event.target.value),
                        })
                      }
                    />
                    <span className="hidden">
                      {Number(item.unitPrice || 0).toLocaleString("sl-SI", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="shrink-0">€</span>
                  </div>
                </TableCell>

                {usePerItemDiscount && (
                  <TableCell className="text-right align-middle px-1">
                    <Input
                      className="h-9 w-full min-w-0 text-right"
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
                    {vatMode}
                  </span>
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

                <TableCell className={totalColumnClassName}>
                  {(item.totalGross || 0).toLocaleString("sl-SI", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  €
                </TableCell>

              </TableRow>
              {showSuggestions ? (
                <TableRow key={`${item.id}-suggestions`}>
                  <TableCell colSpan={totalColumns} className="px-4 pb-4 pt-0">
                    {suggestionContent}
                  </TableCell>
                </TableRow>
              ) : null}
              {showKmAddressComparison ? (
                <TableRow key={`${item.id}-km-address`}>
                  <TableCell colSpan={totalColumns} className="px-4 pb-4 pt-0">
                    <div className="pl-2">{kmAddressComparison}</div>
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
              <TableCell className={totalFooterColumnClassName}>
                {formatCurrency(totals.baseWithoutVat ?? 0)}
              </TableCell>
            </TableRow>

            {usePerItemDiscount && (totals.perItemDiscountAmount ?? 0) > 0 && (
              <TableRow>
                <TableCell colSpan={summaryLabelColSpan} className="text-right text-sm text-muted-foreground pr-4">
                  Popust po produktih
                </TableCell>
                <TableCell className={totalFooterColumnClassName}>
                  -{formatCurrency(totals.perItemDiscountAmount ?? 0)}
                </TableCell>
              </TableRow>
            )}

            {useGlobalDiscount && (totals.globalDiscountAmount ?? 0) > 0 && (
              <TableRow>
                <TableCell colSpan={summaryLabelColSpan} className="text-right text-sm text-muted-foreground pr-4">
                  Popust na celotno ponudbo ({globalDiscountPercent || 0}%)
                </TableCell>
                <TableCell className={totalFooterColumnClassName}>
                  -{formatCurrency(totals.globalDiscountAmount ?? 0)}
                </TableCell>
              </TableRow>
            )}

            <TableRow>
              <TableCell colSpan={summaryLabelColSpan} className="text-right text-sm text-muted-foreground pr-4">
                Osnova po popustih
              </TableCell>
              <TableCell className={totalFooterColumnClassName}>
                {formatCurrency(totals.baseAfterDiscount ?? 0)}
              </TableCell>
            </TableRow>

            <TableRow>
              <TableCell colSpan={summaryLabelColSpan} className="text-right text-sm text-muted-foreground pr-4">
                DDV ({vatMode}%)
              </TableCell>
              <TableCell className={totalFooterColumnClassName}>
                {formatCurrency(vatAmount)}
              </TableCell>
            </TableRow>

            <TableRow className="font-semibold">
              <TableCell colSpan={summaryLabelColSpan} className="text-right pr-4">
                Skupaj za plačilo (z DDV)
              </TableCell>
              <TableCell className={totalFooterColumnClassName}>
                {formatCurrency(totalGrossAfterDiscount)}
              </TableCell>
            </TableRow>
          </TableFooter>
          </Table>
        </div>
      </div>

      <OfferTemplateDialogs
        nameDialogOpen={isTemplateNameDialogOpen}
        onNameDialogOpenChange={setIsTemplateNameDialogOpen}
        deleteDialogOpen={isTemplateDeleteDialogOpen}
        onDeleteDialogOpenChange={setIsTemplateDeleteDialogOpen}
        mode={templateDialogMode}
        nameDraft={templateNameDraft}
        onNameDraftChange={setTemplateNameDraft}
        vatModeDraft={templateVatModeDraft}
        onVatModeDraftChange={setTemplateVatModeDraft}
        applyGlobalDiscount={templateApplyGlobalDiscount}
        onApplyGlobalDiscountChange={setTemplateApplyGlobalDiscount}
        applyPerItemDiscount={templateApplyPerItemDiscount}
        onApplyPerItemDiscountChange={setTemplateApplyPerItemDiscount}
        globalDiscountDraft={templateGlobalDiscountDraft}
        onGlobalDiscountDraftChange={setTemplateGlobalDiscountDraft}
        saving={templateSaving}
        deleting={templateDeleting}
        onSubmit={submitTemplateDialog}
        onConfirmDelete={confirmDeleteTemplate}
      />

      <OfferImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        rawText={importRawText}
        onRawTextChange={setImportRawText}
        rows={importRows}
        loading={importLoading}
        error={importError}
        showMappingHint={showImportMappingHint}
        matchedCount={importMatchedCount}
        needsReviewCount={importNeedsReviewCount}
        invalidCount={importInvalidCount}
        onParse={parseOfferImport}
        onApply={handleImportApply}
        onUpdateRow={updateImportRow}
      />

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
        offerVersions={versions}
        companyName={settings?.companyName ?? ""}
        onSent={handleCommunicationSent}
      />

      {/* GUMBI */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={openImportModal}>
            Uvozi ponudbo
          </Button>
          <OfferPdfActionGroup
            previewLabel="Poglej opise"
            downloadLabel=""
            onPreview={() => {
              void handlePreviewDescriptionsPdf();
            }}
            onDownload={() => {
              void handleExportDescriptionsPdf();
            }}
            previewing={previewingMode === "descriptions"}
            downloading={downloadingMode === "descriptions"}
            disabled={isPdfBusy}
          />
          <OfferPdfActionGroup
            previewLabel="Poglej ponudbo"
            downloadLabel=""
            onPreview={() => {
              void handlePreviewOfferPdf();
            }}
            onDownload={() => {
              void handleExportPdf("offer");
            }}
            previewing={previewingMode === "offer"}
            downloading={downloadingMode === "offer"}
            disabled={isPdfBusy}
          />
          <Button
            variant="outline"
            onClick={handleOpenSendDialog}
            disabled={saving}
          >
            Pošlji email stranki
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isCurrentAccepted ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelCurrentOfferConfirmation}
              disabled={saving || isConfirmingCurrentOffer}
            >
              Prekliči potrditev
            </Button>
          ) : (
            <Button
              onClick={handleConfirmCurrentOffer}
              disabled={!canConfirmCurrentOffer || isConfirmingCurrentOffer}
              className="bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-100"
            >
              {isConfirmingCurrentOffer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Potrdi ponudbo
            </Button>
          )}
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
      <ExecutionDefinitionPanel
        projectId={projectId}
        offerVersionId={currentOffer?._id ?? selectedOfferId}
        refreshToken={lastSavedSnapshot}
      />

    </Card>
  );
}
