export type DerivedProjectPhase = "zahteve" | "ponudbe" | "priprava" | "izvedba" | "predaja" | "racun";

type PhaseSignals = {
  hasOffers?: boolean;
  hasConfirmedOffer?: boolean;
  hasWorkOrder?: boolean;
  allExecutionUnitsCompleted?: boolean;
  hasSignedDelivery?: boolean;
  hasIssuedInvoice?: boolean;
};

function normalizeStatus(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    : "";
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function collectOffers(project: any) {
  return [
    ...asArray(project?.offers),
    ...asArray(project?.offerVersions),
    ...asArray(project?.logistics?.offerVersions),
  ];
}

function collectWorkOrders(project: any) {
  return [
    ...asArray(project?.workOrders),
    ...asArray(project?.logistics?.workOrders),
    ...(project?.workOrder ? [project.workOrder] : []),
    ...(project?.logistics?.workOrder ? [project.logistics.workOrder] : []),
  ];
}

function collectInvoiceVersions(project: any) {
  return [
    ...asArray(project?.invoiceVersions),
    ...asArray(project?.logistics?.invoiceVersions),
    ...asArray(project?.logistics?.invoices),
  ];
}

function hasCompletedExecutionUnits(project: any) {
  const units = collectWorkOrders(project).flatMap((order) =>
    asArray(order?.items).flatMap((item) => {
      const executionUnits = asArray(item?.executionSpec?.executionUnits);
      return executionUnits.length > 0 ? executionUnits.map((unit) => unit?.isCompleted === true) : [item?.isCompleted === true];
    }),
  );
  return units.length > 0 && units.every(Boolean);
}

export function deriveProjectPhase(project: any): DerivedProjectPhase {
  const signals = (project?.phaseSignals ?? {}) as PhaseSignals;
  const status = normalizeStatus(project?.status);

  const hasIssuedInvoice =
    signals.hasIssuedInvoice === true ||
    status === "invoiced" ||
    status === "zaracunano" ||
    collectInvoiceVersions(project).some((invoice) => normalizeStatus(invoice?.status) === "issued");
  if (hasIssuedInvoice) return "racun";

  const hasSignedDelivery =
    signals.hasSignedDelivery === true ||
    status === "delivered" ||
    Boolean(project?.deliverySignedAt) ||
    collectWorkOrders(project).some((order) => {
      if (normalizeStatus(order?.confirmationState) === "signed_active") return true;
      if (order?.customerSignedAt) return true;
      return asArray(order?.confirmationVersions).some(
        (version) => normalizeStatus(version?.state) === "active" && Boolean(version?.signedAt),
      );
    });
  const allExecutionUnitsCompleted = signals.allExecutionUnitsCompleted === true || hasCompletedExecutionUnits(project);
  if (hasSignedDelivery || allExecutionUnitsCompleted || status === "completed") return "predaja";

  const hasWorkOrder =
    signals.hasWorkOrder === true ||
    Boolean(project?.workOrderId || project?.workOrder || project?.logistics?.workOrder) ||
    collectWorkOrders(project).some((order) => asArray(order?.items).length > 0 || Boolean(order?._id || order?.id));
  if (hasWorkOrder) return "izvedba";

  const hasConfirmedOffer =
    signals.hasConfirmedOffer === true ||
    Boolean(project?.confirmedOfferVersionId || project?.logistics?.confirmedOfferVersionId || project?.logistics?.acceptedOfferId) ||
    collectOffers(project).some((offer) => ["accepted", "confirmed"].includes(normalizeStatus(offer?.status)));
  if (hasConfirmedOffer || status === "ordered" || status === "in-progress" || status === "confirmed") return "priprava";

  const hasOffer =
    signals.hasOffers === true ||
    Boolean(project?.hasOffer || project?.offerStatus) ||
    collectOffers(project).length > 0;
  if (hasOffer || status === "offered") return "ponudbe";

  return "zahteve";
}
