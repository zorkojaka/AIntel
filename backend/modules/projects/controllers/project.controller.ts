import { Request, Response } from 'express';
import { ProductModel } from '../../cenik/product.model';
import {
  Project,
  ProjectDocument,
  ProjectItem,
  ProjectRequirement,
  ProjectModel,
  ProjectOffer,
  ProjectOfferItem,
  ProjectStatus,
  addTimeline,
  calculateOfferAmount,
  generateProjectIdentifiers,
  summarizeProject,
} from '../schemas/project';
import mongoose, { Types } from 'mongoose';
import { generateRequirementsFromTemplates } from '../services/requirements-from-templates';
import type { RequirementFieldType, RequirementFormulaConfig } from '../../shared/requirements.types';
import { getOfferCandidatesFromRequirements } from '../services/offer-from-requirements';
import { serializeProjectDetails } from '../services/project.service';
import { OfferVersionModel } from '../schemas/offer-version';
import { MaterialOrderModel } from '../schemas/material-order';
import { WorkOrderModel } from '../schemas/work-order';
import { resolveTenantId } from '../../../utils/tenant';
import { UserModel } from '../../users/schemas/user';
import { EmployeeModel } from '../../employees/schemas/employee';

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeCategorySlugs(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const normalized = input
    .map((value) => (typeof value === 'string' ? normalizeSlug(value) : ''))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function validateProjectPayload(body: any) {
  if (!body?.title) {
    return 'Manjka naziv projekta (title).';
  }
  if (!body?.customer?.name) {
    return 'Manjka podatek o stranki (customer.name).';
  }
  return null;
}

function toISODate(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

async function responseProject(project: Project | ProjectDocument) {
  return serializeProjectDetails(project);
}

const allowedRequirementFieldTypes: RequirementFieldType[] = ['number', 'text', 'select', 'boolean'];

function sanitizeRequirementFormula(input: any): RequirementFormulaConfig | null {
  if (!input || typeof input !== 'object') return null;
  const baseFieldId = String(input.baseFieldId ?? '').trim();
  if (!baseFieldId) return null;
  const multiplyBy = input.multiplyBy === undefined ? undefined : Number(input.multiplyBy);
  const notes = input.notes ? String(input.notes) : undefined;
  return {
    baseFieldId,
    multiplyBy: Number.isFinite(multiplyBy) ? multiplyBy : undefined,
    notes,
  };
}

function sanitizeRequirements(input: unknown): ProjectRequirement[] {
  const rawReqs = Array.isArray(input) ? input : [];

  const requirements = rawReqs
    .map((r: any) => ({
      id: String(r?.id ?? new Types.ObjectId().toString()),
      label: (r?.label ?? '').toString().trim(),
      value:
        r?.value !== undefined && r?.value !== null
          ? String(r.value).trim()
          : '',
      categorySlug: r?.categorySlug ? String(r.categorySlug) : '',
      notes: (r?.notes ?? '').toString().trim(),
      templateRowId: r?.templateRowId ? String(r.templateRowId) : undefined,
      fieldType: (r?.fieldType as RequirementFieldType) || 'number',
      productCategorySlug: r?.productCategorySlug ? String(r.productCategorySlug) : null,
      formulaConfig: sanitizeRequirementFormula(r?.formulaConfig),
    }))
    .filter((req) => {
      const hasLabel = !!req.label?.trim();
      const hasValue = req.value !== undefined && req.value !== null && `${req.value}`.trim() !== '';
      const hasCategory = !!req.categorySlug;
      const hasNotes = !!req.notes?.trim();
      return hasLabel || hasValue || hasCategory || hasNotes;
    });

  return requirements;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function withTotals(item: ProjectItem): ProjectItem {
  const netAmount = item.quantity * item.price * (1 - item.discount / 100);
  const total = Number((netAmount * (1 + item.vatRate / 100)).toFixed(2));
  return { ...item, total };
}

function sanitizeItemPayload(body: any, existing?: ProjectItem) {
  const name = (body?.name ?? existing?.name ?? '').toString().trim();
  if (!name) {
    return { error: 'Naziv postavke je obvezen.' };
  }

  const quantity = normalizeNumber(body?.quantity ?? existing?.quantity ?? 1, 1);
  if (quantity <= 0) return { error: 'Količina mora biti večja od 0.' };

  const price = normalizeNumber(body?.price ?? existing?.price ?? 0, 0);
  if (price < 0) return { error: 'Cena mora biti 0 ali več.' };

  const discount = Math.min(100, Math.max(0, normalizeNumber(body?.discount ?? existing?.discount ?? 0, 0)));
  const vatRate = Math.min(50, Math.max(0, normalizeNumber(body?.vatRate ?? existing?.vatRate ?? 22, 22)));
  const unit = (body?.unit ?? existing?.unit ?? 'kos').toString().trim() || 'kos';
  const sku = (body?.sku ?? existing?.sku ?? '').toString().trim() || `SKU-${Date.now()}`;
  const allowedCategories: ProjectItem['category'][] = ['material', 'labor', 'other'];
  const requestedCategory = (body?.category ?? existing?.category ?? 'material') as string;
  const category = (allowedCategories.includes(requestedCategory as ProjectItem['category'])
    ? requestedCategory
    : 'material') as ProjectItem['category'];
  const description = (body?.description ?? existing?.description ?? '').toString();

  const item: ProjectItem = withTotals({
    id: existing?.id ?? `item-${Date.now()}`,
    name,
    sku,
    unit,
    quantity,
    price,
    discount,
    vatRate,
    category,
    description,
    total: 0,
  });

  return { item };
}

function sanitizeOfferItemPayload(body: any, existing?: ProjectOfferItem): { item?: ProjectOfferItem; error?: string } {
  const base = sanitizeItemPayload(body, existing as unknown as ProjectItem);
  if (base.error || !base.item) return base;
  const item: ProjectOfferItem = {
    ...base.item,
    productId: body?.productId ?? existing?.productId,
  };
  return { item };
}

function updateOfferAmount(project: Project) {
  project.offerAmount = Number(calculateOfferAmount(project.items).toFixed(2));
}

async function findProjectById(id: string) {
  const project =
    (await ProjectModel.findOne({ id }).lean()) || (await ProjectModel.findById(id).lean());
  return project ?? null;
}

function calculateOfferItemsTotal(items: ProjectOfferItem[]) {
  return items.reduce(
    (acc, item) => acc + item.quantity * item.price * (1 - item.discount / 100) * (1 + item.vatRate / 100),
    0
  );
}

function buildDefaultOffer(): ProjectOffer {
  return {
    id: 'OFF-001',
    label: 'Ponudba 1',
    items: [],
  };
}

function normalizeIdArray(value: unknown): string[] | null {
  if (value === null) return [];
  if (!Array.isArray(value)) return null;
  const ids = value.map((item) => String(item)).filter((item) => item.length > 0);
  return Array.from(new Set(ids));
}

async function validateUsersAndEmployees(tenantId: string, salesUserId?: string | null, employeeIds?: string[]) {
  if (salesUserId) {
    if (!mongoose.isValidObjectId(salesUserId)) {
      return 'Neveljaven uporabnik.';
    }
    const exists = await UserModel.findOne({ _id: salesUserId, tenantId }).lean();
    if (!exists) {
      return 'Uporabnik ne pripada tenantu.';
    }
  }

  if (employeeIds && employeeIds.length > 0) {
    const invalid = employeeIds.find((id) => !mongoose.isValidObjectId(id));
    if (invalid) {
      return 'Neveljaven zaposleni.';
    }
    const matches = await EmployeeModel.find({ _id: { $in: employeeIds }, tenantId }).select('_id').lean();
    if (matches.length !== employeeIds.length) {
      return 'Zaposleni ne pripadajo tenantu.';
    }
  }

  return null;
}

export async function listProjects(_req: Request, res: Response) {
  const all = await ProjectModel.find().lean();
  return res.success(all.map(summarizeProject));
}

export async function updateProjectAssignments(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const tenantId = resolveTenantId(req);
  if (!tenantId) return res.fail('TenantId ni podan.', 400);

  const salesUserId =
    req.body?.salesUserId === null || req.body?.salesUserId === undefined
      ? null
      : String(req.body.salesUserId);
  const assignedEmployeeIds = normalizeIdArray(req.body?.assignedEmployeeIds);
  if (assignedEmployeeIds === null) {
    return res.fail('Neveljaven seznam zaposlenih.', 400);
  }

  const validationError = await validateUsersAndEmployees(tenantId, salesUserId ?? undefined, assignedEmployeeIds ?? []);
  if (validationError) {
    return res.fail(validationError, 400);
  }

  project.salesUserId = salesUserId;
  project.assignedEmployeeIds = assignedEmployeeIds ?? [];

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function getProject(req: Request, res: Response) {
  const project = await findProjectById(req.params.id);
  if (!project) {
    return res.fail(`Projekt ${req.params.id} ni najden.`, 404);
  }

  return res.success(await responseProject(project));
}

export async function getOfferCandidates(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) {
    return res.fail(`Projekt ${req.params.id} ni najden.`, 404);
  }
  const candidates = await getOfferCandidatesFromRequirements(project);
  return res.success(candidates);
}

export async function createProject(req: Request, res: Response) {
  const error = validateProjectPayload(req.body);
  if (error) return res.fail(error, 400);

  const { id, code, projectNumber } = await generateProjectIdentifiers();
  const createdAt = toISODate();
  const categories = sanitizeCategorySlugs(req.body.categories);
  const variantSlug = req.body?.requirementsTemplateVariantSlug
    ? String(req.body.requirementsTemplateVariantSlug).trim()
    : '';
  let requirements = sanitizeRequirements(req.body?.requirements);
  if (requirements.length === 0 && categories.length > 0 && variantSlug) {
    requirements = await generateRequirementsFromTemplates(categories, variantSlug);
  }

  const project: Project = {
    id,
    code,
    projectNumber,
    title: req.body.title,
    customer: {
      name: req.body.customer.name,
      taxId: req.body.customer.taxId,
      address: req.body.customer.address,
      paymentTerms: req.body.customer.paymentTerms ?? '30 dni',
    },
    status: 'draft',
    offerAmount: 0,
    invoiceAmount: 0,
    createdAt,
    requirementsTemplateVariantSlug: variantSlug || undefined,
    requirements,
    items: (req.body.items as ProjectItem[])?.map((item) => ({
      ...item,
      id: item.id ?? `item-${Date.now()}`,
    })) ?? [],
    offers: [],
    workOrders: [],
    purchaseOrders: [],
    deliveryNotes: [],
    timeline: [],
    templates: req.body.templates ?? [],
    categories,
  };

  if (Array.isArray(project.templates) && project.templates.length > 0) {
    console.warn('[templates] Project %s created with %d templates', project.id, project.templates.length);
  }

  addTimeline(project, {
    type: 'edit',
    title: 'Projekt ustvarjen',
    description: project.title,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await ProjectModel.create(project);

  return res.success(await responseProject(project), 201);
}

export async function updateProject(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const error = validateProjectPayload(req.body);
  if (error) return res.fail(error, 400);

  const requestedVariantSlug = req.body?.requirementsTemplateVariantSlug
    ? String(req.body.requirementsTemplateVariantSlug).trim()
    : project.requirementsTemplateVariantSlug;

  project.title = req.body.title;
  if (req.body?.requirements !== undefined) {
    project.requirements = sanitizeRequirements(req.body.requirements);
  } else if (
    requestedVariantSlug &&
    requestedVariantSlug !== project.requirementsTemplateVariantSlug &&
    (req.body?.requirementsTemplateVariantSlug !== undefined || req.body?.categories !== undefined)
  ) {
    const categories = sanitizeCategorySlugs(req.body.categories ?? project.categories);
    project.requirements = await generateRequirementsFromTemplates(categories, requestedVariantSlug);
  }
  if (req.body.customer) {
    project.customer = {
      name: req.body.customer.name ?? project.customer.name,
      taxId: req.body.customer.taxId ?? project.customer.taxId,
      address: req.body.customer.address ?? project.customer.address,
      paymentTerms: req.body.customer.paymentTerms ?? project.customer.paymentTerms,
    };
  }
  if (Array.isArray(req.body.items)) {
    project.items = req.body.items.map((item: ProjectItem) => ({
      ...item,
      id: item.id ?? `item-${Date.now()}`,
    }));
  }
  if (Array.isArray(req.body.templates)) {
    console.warn('[templates] Updating templates for project %s (%d templates)', project.id, req.body.templates.length);
    project.templates = req.body.templates;
  }
  project.categories = sanitizeCategorySlugs(req.body.categories ?? project.categories);
  if (req.body.status) {
    project.status = req.body.status;
  }
  project.requirementsTemplateVariantSlug = requestedVariantSlug || undefined;
  updateOfferAmount(project);

  addTimeline(project, {
    type: 'edit',
    title: 'Projekt posodobljen',
    description: project.title,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function updateStatus(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const nextStatus = req.body?.status as ProjectStatus;
  const allowed: ProjectStatus[] = ['draft', 'offered', 'ordered', 'in-progress', 'completed', 'invoiced'];
  if (!nextStatus || !allowed.includes(nextStatus)) {
    return res.fail('Neznan status projekta.', 400);
  }

  project.status = nextStatus;
  addTimeline(project, {
    type: 'status-change',
    title: 'Status spremenjen',
    description: `Projekt prešel v fazo '${nextStatus}'`,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function addOffer(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const amount = calculateOfferAmount(project.items);
  const version = project.offers.length + 1;
  const offer = {
    id: `offer-${version}`,
    version,
    status: 'draft' as const,
    amount: Number(amount.toFixed(2)),
    date: new Date().toLocaleDateString('sl-SI'),
  };

  project.offers.push(offer);
  project.offerAmount = offer.amount;

  addTimeline(project, {
    type: 'offer',
    title: `Ponudba v${version} ustvarjena`,
    description: `Nova verzija ponudbe v vrednosti € ${offer.amount.toFixed(2)}`,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
    metadata: { amount: `€ ${offer.amount.toFixed(2)}`, status: 'draft' },
  });

  project.status = project.status === 'draft' ? 'offered' : project.status;

  await project.save();

  return res.success(await responseProject(project.toObject()), 201);
}

export async function addItem(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const { item, error } = sanitizeItemPayload(req.body);
  if (error || !item) {
    return res.fail(error ?? 'Napaka pri dodajanju postavke.', 400);
  }

  project.items.push(item);
  updateOfferAmount(project);

  addTimeline(project, {
    type: 'edit',
    title: 'Dodana postavka',
    description: `${item.name} x${item.quantity}`,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()), 201);
}

export async function addItemFromCenik(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const productId = req.body?.productId;
  if (!productId) {
    return res.fail('Manjka produkt iz cenika.', 400);
  }

  try {
    const product = await ProductModel.findById(productId).lean();
    if (!product) {
      return res.fail('Produkt iz cenika ni najden.', 404);
    }

    const category = product.kategorija?.toLowerCase().includes('del')
      ? 'labor'
      : (product.kategorija?.toLowerCase().includes('storitev') ? 'other' : 'material');

    const { item, error } = sanitizeItemPayload({
      name: product.ime,
      sku: productId,
      unit: req.body?.unit ?? 'kos',
      quantity: req.body?.quantity ?? 1,
      price: req.body?.price ?? product.prodajnaCena ?? 0,
      discount: req.body?.discount ?? 0,
      vatRate: req.body?.vatRate ?? 22,
      category,
      description: product.kratekOpis ?? '',
    });

    if (error || !item) {
      return res.fail(error ?? 'Napaka pri dodajanju postavke iz cenika.', 400);
    }

    project.items.push(item);
    updateOfferAmount(project);

    addTimeline(project, {
      type: 'edit',
      title: 'Dodana postavka iz cenika',
      description: `${item.name} x${item.quantity}`,
      timestamp: new Date().toLocaleString('sl-SI'),
      user: 'Admin',
      metadata: { source: 'cenik' },
    });

    await project.save();

    return res.success(await responseProject(project.toObject()), 201);
  } catch (error) {
    return res.fail('Napaka pri povezavi s cenikom.', 500);
  }
}

export async function updateItem(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const existing = project.items.find((item) => item.id === req.params.itemId);
  if (!existing) {
    return res.fail('Postavka ni najdena.', 404);
  }

  const { item, error } = sanitizeItemPayload(req.body, existing);
  if (error || !item) {
    return res.fail(error ?? 'Napaka pri shranjevanju postavke.', 400);
  }

  project.items = project.items.map((current) => (current.id === existing.id ? item : current));
  updateOfferAmount(project);

  addTimeline(project, {
    type: 'edit',
    title: 'Postavka posodobljena',
    description: `${item.name} x${item.quantity}`,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function deleteItem(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const existing = project.items.find((item) => item.id === req.params.itemId);
  if (!existing) {
    return res.fail('Postavka ni najdena.', 404);
  }

  project.items = project.items.filter((item) => item.id !== existing.id);
  updateOfferAmount(project);

  addTimeline(project, {
    type: 'edit',
    title: 'Postavka izbrisana',
    description: existing.name,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function sendOffer(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const offer = project.offers.find((o) => o.id === req.params.offerId);
  if (!offer) return res.fail('Ponudba ni najdena.', 404);

  offer.status = 'sent';
  addTimeline(project, {
    type: 'offer',
    title: `Ponudba v${offer.version} poslana`,
    description: 'Ponudba poslana stranki',
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

function createPurchaseOrders(project: Project) {
  return [
    {
      id: `PO-${Date.now()}-1`,
      supplier: 'Aliansa d.o.o.',
      status: 'sent' as const,
      amount: 1200,
      dueDate: toISODate(),
      items: ['DVC IP kamera 4MP (4x)', 'NVR 8-kanalni (1x)'],
    },
    {
      id: `PO-${Date.now()}-2`,
      supplier: 'Elektromaterial LLC',
      status: 'sent' as const,
      amount: 60,
      dueDate: toISODate(),
      items: ['UTP Cat6 kabel (50m)'],
    },
  ];
}

export async function confirmOffer(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const offer = project.offers.find((o) => o.id === req.params.offerId);
  if (!offer) return res.fail('Ponudba ni najdena.', 404);

  project.offers = project.offers.map((o) => ({
    ...o,
    status: o.id === offer.id ? 'accepted' : o.status,
    isSelected: o.id === offer.id,
  }));

  const purchaseOrders = createPurchaseOrders(project);
  const workOrder = {
    id: `WO-${Date.now()}`,
    team: 'Ekipa A - Janez Novak, Marko Horvat',
    schedule: `${toISODate()} 08:00`,
    location: project.customer.address ?? '',
    status: 'planned' as const,
    notes: 'Pripraviti ključe za dostop do tehničnih prostorov',
  };

  project.purchaseOrders = purchaseOrders;
  project.deliveryNotes = purchaseOrders.map((po) => ({
    id: `DN-${Date.now()}-${po.id}`,
    poId: po.id,
    supplier: po.supplier,
    receivedQuantity: 0,
    totalQuantity: po.items.length,
    receivedDate: '',
    serials: [],
  }));
  project.workOrders = [...project.workOrders, workOrder];
  project.status = 'ordered';

  addTimeline(project, {
    type: 'offer',
    title: `Ponudba v${offer.version} potrjena`,
    description: 'Ponudba označena kot izbrana',
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
    metadata: { amount: `€ ${offer.amount.toFixed(2)}` },
  });

  addTimeline(project, {
    type: 'po',
    title: 'Naročilnice generirane',
    description: `Ustvarjenih ${purchaseOrders.length} naročilnic`,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
    metadata: { count: purchaseOrders.length.toString() },
  });

  addTimeline(project, {
    type: 'execution',
    title: 'Delovni nalog ustvarjen',
    description: `Načrtovana montaža: ${workOrder.schedule}`,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
    metadata: { team: workOrder.team },
  });

  addTimeline(project, {
    type: 'status-change',
    title: 'Status spremenjen',
    description: "Projekt prešel v fazo 'Naročeno'",
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function cancelConfirmation(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const offer = project.offers.find((o) => o.id === req.params.offerId);
  if (!offer) return res.fail('Ponudba ni najdena.', 404);

  project.offers = project.offers.map((o) => ({
    ...o,
    status: o.id === offer.id ? 'sent' : o.status,
    isSelected: false,
  }));

  project.purchaseOrders = [];
  project.deliveryNotes = [];
  project.workOrders = project.workOrders.filter((wo) => !wo.id.startsWith('WO-'));
  project.status = 'offered';

  addTimeline(project, {
    type: 'status-change',
    title: `Potrditev ponudbe ${offer.id} preklicana`,
    description: 'Naročilnice, delovni nalogi in dobavnice izbrisani',
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function selectOffer(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const offer = project.offers.find((o) => o.id === req.params.offerId);
  if (!offer) return res.fail('Ponudba ni najdena.', 404);

  project.offers = project.offers.map((o) => ({
    ...o,
    isSelected: o.id === offer.id,
  }));

  addTimeline(project, {
    type: 'offer',
    title: `Ponudba ${offer.id} označena kot izbrana`,
    description: 'Označena ponudba za nadaljnjo obdelavo',
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function receiveDelivery(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const delivery = project.deliveryNotes.find((d) => d.id === req.params.deliveryId);
  if (!delivery) return res.fail('Dobavnica ni najdena.', 404);

  delivery.receivedQuantity = delivery.totalQuantity;
  delivery.receivedDate = toISODate();
  delivery.serials = ['SN-001', 'SN-002', 'SN-003'];

  project.purchaseOrders = project.purchaseOrders.map((po) =>
    po.id === delivery.poId ? { ...po, status: 'delivered' as const } : po
  );

  const allDelivered = project.deliveryNotes.every((dn) => dn.receivedQuantity > 0);
  if (allDelivered) {
    project.status = 'in-progress';
    addTimeline(project, {
      type: 'status-change',
      title: 'Status spremenjen',
      description: "Projekt prešel v fazo 'V teku' - vsa dobava potrjena",
      timestamp: new Date().toLocaleString('sl-SI'),
      user: 'Admin',
    });
  }

  addTimeline(project, {
    type: 'delivery',
    title: 'Dobavnica potrjena',
    description: `Dobavnica ${delivery.id} - ${delivery.supplier}`,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
    metadata: { supplier: delivery.supplier },
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function saveSignature(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.id });
  if (!project) return res.fail(`Projekt ${req.params.id} ni najden.`, 404);

  const signerName = req.body?.signerName;
  if (!signerName) {
    return res.fail('Manjka ime podpisnika.', 400);
  }

  project.status = 'completed';

  addTimeline(project, {
    type: 'execution',
    title: 'Potrdilo o zaključku del',
    description: `Podpisal: ${signerName}`,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
    metadata: { signer: signerName },
  });

  addTimeline(project, {
    type: 'status-change',
    title: 'Status spremenjen',
    description: "Projekt prešel v fazo 'Zaključeno'",
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  await project.save();

  return res.success(await responseProject(project.toObject()));
}

export async function getProjectOffer(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.projectId });
  if (!project) return res.fail(`Projekt ${req.params.projectId} ni najden.`, 404);

  if (!project.offers || project.offers.length === 0) {
    const defaultOffer = {
      id: 'OFF-001',
      version: 1,
      status: 'draft' as const,
      amount: 0,
      date: toISODate(),
      label: 'Ponudba 1',
      items: [],
    };
    project.offers = [defaultOffer];
    await project.save();
  }

  const offer = project.offers[0];
  const payload: ProjectOffer = {
    id: offer.id,
    label: offer.label ?? 'Ponudba 1',
    items: offer.items ?? [],
  };

  return res.success(payload);
}

export async function updateProjectOffer(req: Request, res: Response) {
  const project = await ProjectModel.findOne({ id: req.params.projectId });
  if (!project) return res.fail(`Projekt ${req.params.projectId} ni najden.`, 404);

  const bodyItems = Array.isArray(req.body?.items) ? req.body.items : Array.isArray(req.body?.offer?.items) ? req.body.offer.items : null;
  if (!bodyItems) {
    return res.fail('Manjkajo postavke ponudbe.', 400);
  }

  const sanitized: ProjectOfferItem[] = [];
  for (const raw of bodyItems) {
    const { item, error } = sanitizeOfferItemPayload(raw);
    if (error || !item) {
      return res.fail(error ?? 'Napaka pri validaciji postavk ponudbe.', 400);
    }
    sanitized.push(item);
  }

  if (!project.offers || project.offers.length === 0) {
    project.offers = [
      {
        id: 'OFF-001',
        version: 1,
        status: 'draft',
        amount: 0,
        date: toISODate(),
        label: 'Ponudba 1',
        items: [],
      },
    ];
  }

  const active = project.offers[0];
  active.items = sanitized;
  active.amount = Number(calculateOfferItemsTotal(sanitized).toFixed(2));
  active.label = active.label ?? 'Ponudba 1';
  project.offers[0] = active;

  await project.save();

  return res.success({
    id: active.id,
    label: active.label,
    items: active.items,
  });
}

export async function deleteProject(req: Request, res: Response) {
  const deleted = await ProjectModel.findOneAndDelete({ id: req.params.id }).lean();
  if (!deleted) {
    return res.fail(`Projekt ${req.params.id} ni najden.`, 404);
  }
  const projectKey = deleted.id ?? (deleted as { _id?: Types.ObjectId })._id?.toString();
  if (projectKey) {
    await Promise.all([
      OfferVersionModel.deleteMany({ projectId: projectKey }),
      MaterialOrderModel.deleteMany({ projectId: projectKey }),
      WorkOrderModel.deleteMany({ projectId: projectKey }),
    ]);
  }
  return res.success({ id: deleted.id });
}
