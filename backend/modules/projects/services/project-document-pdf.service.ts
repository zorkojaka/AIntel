import { Types } from 'mongoose';
import { ProjectModel, type ProjectDocument } from '../schemas/project';
import { MaterialOrderModel } from '../schemas/material-order';
import { WorkOrderModel } from '../schemas/work-order';
import { renderHtmlToPdf } from './html-pdf.service';
import { renderDocumentHtml, type DocumentPreviewContext, type PreviewTask } from './document-renderers';
import { getCompanySettings, getPdfDocumentSettings } from './pdf-settings.service';
import { getSettings } from '../../settings/settings.service';
import { EmployeeModel } from '../../employees/schemas/employee';
import type { DocumentNumberingKind } from './document-numbering.service';

type MaterialDocType = 'PURCHASE_ORDER' | 'DELIVERY_NOTE';
type WorkDocType = 'WORK_ORDER' | 'WORK_ORDER_CONFIRMATION';

function assertProject(project: ProjectDocument | null) {
  if (!project) {
    throw new Error('Projekt ni najden.');
  }
  return project;
}

function assertMaterialOrder(order: Awaited<ReturnType<typeof MaterialOrderModel.findOne>>) {
  if (!order) {
    throw new Error('Naročilo za material ni najdeno.');
  }
  return order;
}

function assertWorkOrder(order: Awaited<ReturnType<typeof WorkOrderModel.findOne>>) {
  if (!order) {
    throw new Error('Delovni nalog ni najden.');
  }
  return order;
}

function formatDate(value?: Date | string | null) {
  if (!value) return new Date().toLocaleDateString('sl-SI');
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return new Date().toLocaleDateString('sl-SI');
  }
  return date.toLocaleDateString('sl-SI');
}

function formatAddress(value?: string | null) {
  if (!value) return '';
  return value
    .split(/\n|,\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function buildCompanyProfile(
  company: Awaited<ReturnType<typeof getCompanySettings>>,
  settings: Awaited<ReturnType<typeof getSettings>>,
) {
  const addressParts = [
    settings.address,
    [settings.postalCode, settings.city].filter(Boolean).join(' ').trim(),
    settings.country,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => !!value);

  return {
    ...company,
    companyName: settings.companyName || company.companyName,
    address: addressParts.length ? addressParts.join('\n') : company.address,
    email: settings.email || company.email,
    phone: settings.phone || company.phone,
    vatId: settings.vatId || company.vatId,
    iban: settings.iban || company.iban,
    directorName: settings.directorName || company.directorName,
    logoUrl: settings.logoUrl || company.logoUrl,
    primaryColor: settings.primaryColor || company.primaryColor || '#0f62fe',
    website: settings.website || company.website,
  };
}

function buildCustomer(project: ProjectDocument, overrides?: Partial<{ name: string; address: string; taxId: string }>) {
  const customer = project.customer ?? { name: '' };
  return {
    name: overrides?.name ?? customer.name ?? '',
    address: formatAddress(overrides?.address ?? customer.address),
    taxId: overrides?.taxId ?? customer.taxId ?? '',
  };
}

function buildDocumentNumber(docType: DocumentNumberingKind, preferred?: string | null, fallbackId?: Types.ObjectId | string) {
  if (preferred && preferred.trim().length > 0) {
    return preferred.trim();
  }
  const tail =
    typeof fallbackId === 'string'
      ? fallbackId.slice(-6).toUpperCase()
      : fallbackId instanceof Types.ObjectId
        ? fallbackId.toString().slice(-6).toUpperCase()
        : Math.random().toString(36).slice(-6).toUpperCase();
  switch (docType) {
    case 'PURCHASE_ORDER':
      return `NOR-${tail}`;
    case 'DELIVERY_NOTE':
      return `DOB-${tail}`;
    case 'WORK_ORDER':
      return `DEL-${tail}`;
    case 'WORK_ORDER_CONFIRMATION':
      return `POT-${tail}`;
    default:
      return `${docType}-${tail}`;
  }
}

function buildNotes(defaultTexts?: { paymentTerms?: string; disclaimer?: string }, extra?: string[]) {
  const notes: string[] = [];
  if (defaultTexts?.paymentTerms) {
    notes.push(defaultTexts.paymentTerms);
  }
  if (defaultTexts?.disclaimer) {
    notes.push(defaultTexts.disclaimer);
  }
  if (extra && extra.length) {
    extra.filter((note) => !!note?.trim()).forEach((note) => notes.push(note.trim()));
  }
  return notes;
}

function buildConfiguredNotes(
  settings: Awaited<ReturnType<typeof getSettings>>,
  settingsKey: 'workOrder' | 'workOrderConfirmation',
  defaultTexts?: { paymentTerms?: string; disclaimer?: string },
  extra?: Array<string | null | undefined>,
) {
  const noteLookup = new Map((settings.notes ?? []).map((note) => [note.id, note]));
  const selectedIds = settings.noteDefaultsByDoc?.[settingsKey] ?? [];
  const configuredNotes = selectedIds
    .map((id) => noteLookup.get(id))
    .filter((note): note is NonNullable<typeof settings.notes>[number] => !!note)
    .map((note) => note.text?.trim() || note.title?.trim() || '')
    .filter((note): note is string => !!note);

  return buildNotes(defaultTexts, [
    ...configuredNotes,
    ...((extra ?? []).map((value) => value?.trim() ?? '').filter(Boolean)),
  ]);
}

function buildWorkOrderItemStatusLabel(item: NonNullable<Awaited<ReturnType<typeof WorkOrderModel.findOne>>>['items'][number]) {
  const isCompleted = !!item.isCompleted;
  const executedQuantity = typeof item.executedQuantity === 'number' ? item.executedQuantity : 0;
  const offeredQuantity =
    typeof item.offeredQuantity === 'number'
      ? item.offeredQuantity
      : typeof item.plannedQuantity === 'number'
        ? item.plannedQuantity
        : typeof item.quantity === 'number'
          ? item.quantity
          : 0;

  if (!isCompleted) {
    return 'V teku';
  }

  if (executedQuantity === offeredQuantity) {
    return 'Usklajeno';
  }

  return 'Odstopanje';
}

async function resolveWorkOrderExecutorLabel(
  workOrder: NonNullable<Awaited<ReturnType<typeof WorkOrderModel.findOne>>>,
  companyName: string,
) {
  const assignedIds = Array.isArray(workOrder.assignedEmployeeIds)
    ? workOrder.assignedEmployeeIds.map((id) => String(id)).filter(Boolean)
    : [];
  const mainInstallerId = workOrder.mainInstallerId ? String(workOrder.mainInstallerId) : '';
  const lookupIds = Array.from(new Set([...assignedIds, ...(mainInstallerId ? [mainInstallerId] : [])]));

  if (lookupIds.length === 0) {
    return companyName;
  }

  const employees = await EmployeeModel.find({ _id: { $in: lookupIds } }).select('name').lean();
  const nameById = new Map(
    employees.map((employee: any) => [
      String(employee._id),
      typeof employee.name === 'string' ? employee.name.trim() : '',
    ]),
  );

  const assignedNames = assignedIds
    .map((id) => nameById.get(id) ?? '')
    .filter((name) => name.length > 0);

  if (assignedNames.length > 0) {
    return assignedNames.join(', ');
  }

  if (mainInstallerId) {
    const mainInstallerName = nameById.get(mainInstallerId) ?? '';
    if (mainInstallerName) {
      return mainInstallerName;
    }
  }

  return companyName;
}

export async function generateMaterialOrderDocumentPdf(projectId: string, materialOrderId: string, docType: MaterialDocType) {
  const [project, materialOrder] = await Promise.all([
    ProjectModel.findOne({ id: projectId }).lean(),
    MaterialOrderModel.findOne({ _id: materialOrderId, projectId }).lean(),
  ]);
  const existingProject = assertProject(project);
  const existingOrder = assertMaterialOrder(materialOrder);

  const [company, documentSettings, globalSettings] = await Promise.all([
    getCompanySettings(),
    getPdfDocumentSettings(docType),
    getSettings(),
  ]);

  const companyProfile = buildCompanyProfile(company, globalSettings);
  const customer = buildCustomer(existingProject);

  const items: DocumentPreviewContext['items'] = (existingOrder.items ?? []).map((item) => ({
    name: item.name ?? 'Neimenovana postavka',
    quantity: Number(item.quantity ?? 0),
    unit: item.unit ?? '',
  }));

  const statusNote =
    typeof existingOrder.materialStatus === 'string' && existingOrder.materialStatus.trim().length > 0
      ? `Status: ${existingOrder.materialStatus}`
      : null;

  const context: DocumentPreviewContext = {
    docType,
    documentNumber: buildDocumentNumber(docType, undefined, existingOrder._id),
    issueDate: formatDate(existingOrder.createdAt),
    company: companyProfile,
    customer,
    projectTitle: existingProject.title ?? existingProject.id,
    items,
    notes: buildNotes(documentSettings.defaultTexts, statusNote ? [statusNote] : undefined),
  };

  const html = renderDocumentHtml(context);
  return renderHtmlToPdf(html);
}

function mapWorkOrderTasks(
  workOrder: Awaited<ReturnType<typeof WorkOrderModel.findOne>>,
  docType: WorkDocType,
): PreviewTask[] {
  return (workOrder?.items ?? []).map((item) => {
    const executed = typeof item.executedQuantity === 'number' && item.executedQuantity > 0;
    const completed = !!item.isCompleted;
    let status: PreviewTask['status'] = 'todo';
    if (docType === 'WORK_ORDER_CONFIRMATION') {
      status = completed || executed ? 'done' : 'in-progress';
    } else if (completed) {
      status = 'done';
    } else if (executed) {
      status = 'in-progress';
    }
    return {
      label: item.name ?? 'Neimenovana naloga',
      status,
    };
  });
}

export async function generateWorkOrderDocumentPdf(projectId: string, workOrderId: string, docType: WorkDocType) {
  const [project, workOrder] = await Promise.all([
    ProjectModel.findOne({ id: projectId }).lean(),
    WorkOrderModel.findOne({ _id: workOrderId, projectId }).lean(),
  ]);
  const existingProject = assertProject(project);
  const existingOrder = assertWorkOrder(workOrder);

  const [company, documentSettings, globalSettings] = await Promise.all([
    getCompanySettings(),
    getPdfDocumentSettings(docType),
    getSettings(),
  ]);

  const companyProfile = buildCompanyProfile(company, globalSettings);
  const customer = buildCustomer(existingProject, {
    name: existingOrder.customerName ?? undefined,
    address: existingOrder.customerAddress ?? undefined,
  });

  const tasks = mapWorkOrderTasks(existingOrder, docType);
  const items: DocumentPreviewContext['items'] = (existingOrder.items ?? []).map((item) => {
    const offeredQuantity =
      typeof item.offeredQuantity === 'number'
        ? item.offeredQuantity
        : typeof item.plannedQuantity === 'number'
          ? item.plannedQuantity
          : item.quantity ?? 0;
    const executedQuantity =
      typeof item.executedQuantity === 'number'
        ? item.executedQuantity
        : typeof item.plannedQuantity === 'number'
          ? item.plannedQuantity
          : item.quantity ?? 0;

    return {
      name: item.name ?? 'Neimenovana postavka',
      quantity: docType === 'WORK_ORDER_CONFIRMATION' ? executedQuantity : offeredQuantity,
      plannedQuantity: docType === 'WORK_ORDER_CONFIRMATION' ? offeredQuantity : undefined,
      unit: item.unit ?? '',
      statusLabel: docType === 'WORK_ORDER_CONFIRMATION' ? buildWorkOrderItemStatusLabel(item) : null,
    };
  });

  const notes = buildConfiguredNotes(
    globalSettings,
    docType === 'WORK_ORDER_CONFIRMATION' ? 'workOrderConfirmation' : 'workOrder',
    documentSettings.defaultTexts,
    [docType === 'WORK_ORDER_CONFIRMATION' ? existingOrder.customerRemark ?? null : existingOrder.notes ?? null],
  );
  const comment = existingOrder.executionNote ?? existingOrder.notes ?? null;
  const executorLabel =
    docType === 'WORK_ORDER_CONFIRMATION'
      ? await resolveWorkOrderExecutorLabel(existingOrder, companyProfile.companyName)
      : null;

  const context: DocumentPreviewContext = {
    docType,
    documentNumber: buildDocumentNumber(
      docType,
      existingOrder.code ?? undefined,
      existingOrder._id ?? undefined,
    ),
    issueDate: formatDate(existingOrder.createdAt),
    company: companyProfile,
    customer,
    projectTitle: existingProject.title ?? existingProject.id,
    items,
    tasks,
    comment,
    notes,
    signatures:
      docType === 'WORK_ORDER_CONFIRMATION'
        ? {
            left: {
              label: 'Izvajalec',
              name: executorLabel,
            },
            right: {
              label: 'Naročnik',
              name: existingOrder.customerSignerName ?? existingOrder.customerName ?? null,
              image: existingOrder.customerSignature ?? null,
              signedAt: existingOrder.customerSignedAt ? new Date(existingOrder.customerSignedAt).toISOString() : null,
            },
          }
        : null,
  };

  const html = renderDocumentHtml(context);
  return renderHtmlToPdf(html);
}
