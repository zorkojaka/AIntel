import { Request, Response } from 'express';
import { ProductModel } from '../../cenik/product.model';
import {
  Project,
  ProjectItem,
  ProjectStatus,
  addTimeline,
  calculateOfferAmount,
  findProject,
  nextProjectId,
  projects,
  summarizeProject,
} from '../schemas/project';

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

function responseProject(project: Project) {
  return project;
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

function updateOfferAmount(project: Project) {
  project.offerAmount = Number(calculateOfferAmount(project.items).toFixed(2));
}

export function listProjects(_req: Request, res: Response) {
  return res.success(projects.map(summarizeProject));
}

export function getProject(req: Request, res: Response) {
  const project = findProject(req.params.id);
  if (!project) {
    return res.fail(`Projekt ${req.params.id} ni najden.`, 404);
  }

  return res.success(responseProject(project));
}

export function createProject(req: Request, res: Response) {
  const error = validateProjectPayload(req.body);
  if (error) return res.fail(error, 400);

  const id = nextProjectId();
  const createdAt = toISODate();

  const project: Project = {
    id,
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
    requirements: req.body.requirements ?? '',
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
  };

  addTimeline(project, {
    type: 'edit',
    title: 'Projekt ustvarjen',
    description: project.title,
    timestamp: new Date().toLocaleString('sl-SI'),
    user: 'Admin',
  });

  projects.unshift(project);

  return res.success(responseProject(project), 201);
}

export function updateStatus(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project));
}

export function addOffer(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project), 201);
}

export function addItem(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project), 201);
}

export async function addItemFromCenik(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

    return res.success(responseProject(project), 201);
  } catch (error) {
    return res.fail('Napaka pri povezavi s cenikom.', 500);
  }
}

export function updateItem(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project));
}

export function deleteItem(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project));
}

export function sendOffer(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project));
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

export function confirmOffer(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project));
}

export function cancelConfirmation(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project));
}

export function selectOffer(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project));
}

export function receiveDelivery(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project));
}

export function saveSignature(req: Request, res: Response) {
  const project = findProject(req.params.id);
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

  return res.success(responseProject(project));
}
