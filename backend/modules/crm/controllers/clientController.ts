import { Request, Response } from 'express';
import { CrmClientModel, CrmClient } from '../schemas/client';

type ClientPayload = {
  name?: string;
  type?: 'company' | 'individual';
  vatNumber?: string;
  address?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  tags?: string[] | string;
  notes?: string;
  street?: string;
  postalCode?: string;
  postalCity?: string;
};

function parseBooleanFlag(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value.some((item) => ['1', 'true', 'yes'].includes(String(item).toLowerCase()));
  }
  if (value === undefined) {
    return false;
  }
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
}

function formatClient(client: CrmClient) {
  const requiresVat = client.type === 'company';
  const isComplete =
    Boolean(client.name && client.street && client.postalCity && client.email && client.phone) &&
    (!requiresVat || Boolean(client.vat_number));

  return {
    id: client._id.toString(),
    name: client.name,
    type: client.type,
    vatNumber: client.vat_number ?? undefined,
    address: client.address,
    street: client.street,
    postalCode: client.postalCode,
    postalCity: client.postalCity,
    email: client.email,
    phone: client.phone,
    contactPerson: client.contact_person,
    tags: client.tags ?? [],
    notes: client.notes,
    isActive: client.isActive !== false,
    createdAt: client.createdAt,
    isComplete
  };
}

function normalizeTags(raw: string[] | string | undefined) {
  if (Array.isArray(raw)) {
    return raw.map((tag) => tag.trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function sanitizeVatNumber(value?: string) {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  return normalized || undefined;
}

function ensurePayload(payload: ClientPayload) {
  const name = payload.name?.trim();
  const type = payload.type;
  if (!name) {
    throw new Error('Naziv je obvezen');
  }
  if (!type || (type !== 'company' && type !== 'individual')) {
    throw new Error('Tip stranke ni pravilen');
  }
  return { name, type };
}

async function rejectDuplicate(name: string, vatNumber?: string, excludeId?: string) {
  if (!vatNumber) {
    return;
  }
  const query = {
    name,
    vat_number: vatNumber,
    isActive: { $ne: false },
    ...(excludeId ? { _id: { $ne: excludeId } } : {})
  };
  const existing = await CrmClientModel.findOne(query);
  if (existing) {
    throw new Error('Stranka z enakim nazivom in DDV že obstaja');
  }
}

export async function getClients(req: Request, res: Response) {
  try {
    const includeInactive = parseBooleanFlag(req.query.includeInactive as string | string[] | undefined);
    const filter = includeInactive ? {} : { isActive: { $ne: false } };
    const clients = await CrmClientModel.find(filter).sort({ createdAt: -1 });
    res.success(clients.map(formatClient));
  } catch (error) {
    res.fail('Ne morem pridobiti strank');
  }
}

export async function getClient(req: Request, res: Response) {
  try {
    const client = await CrmClientModel.findById(req.params.id);
    if (!client) {
      return res.fail('Stranka ni najdena', 404);
    }
    res.success(formatClient(client));
  } catch (error) {
    res.fail('Ne morem pridobiti stranke');
  }
}

export async function createClient(req: Request, res: Response) {
  try {
    const payload: ClientPayload = req.body;
    const { name, type } = ensurePayload(payload);
    const vatNumber = sanitizeVatNumber(payload.vatNumber);

    if (type === 'company' && vatNumber && !/^SI\d{8}$/.test(vatNumber)) {
      return res.fail('DDV mora biti v obliki SI12345678', 400);
    }

    await rejectDuplicate(name, vatNumber);

    const street = payload.street?.trim();
    const postalCode = payload.postalCode?.trim() || undefined;
    const postalCity = payload.postalCity?.trim();
    const addressLine = [street, postalCity]
      .filter(Boolean)
      .join(', ');

    const client = await CrmClientModel.create({
      name,
      type,
      vat_number: type === 'company' ? vatNumber : undefined,
      address: addressLine || payload.address?.trim(),
      street,
      postalCode,
      postalCity,
      email: payload.email?.trim(),
      phone: payload.phone?.trim(),
      contact_person: payload.contactPerson?.trim(),
      tags: normalizeTags(payload.tags),
      notes: payload.notes?.trim(),
      isActive: true
    });

    res.success(formatClient(client), 201);
  } catch (error) {
    if (error instanceof Error) {
      res.fail(error.message, error.message.includes('Stranka') ? 409 : 400);
      return;
    }
    res.fail('Ne morem ustvariti stranke');
  }
}

export async function updateClient(req: Request, res: Response) {
  try {
    const payload: ClientPayload = req.body;
    const { name, type } = ensurePayload(payload);
    const vatNumber = sanitizeVatNumber(payload.vatNumber);

    if (type === 'company' && vatNumber && !/^SI\d{8}$/.test(vatNumber)) {
      return res.fail('DDV mora biti v obliki SI12345678', 400);
    }

    await rejectDuplicate(name, vatNumber, req.params.id);

    const street = payload.street?.trim();
    const postalCode = payload.postalCode?.trim() || undefined;
    const postalCity = payload.postalCity?.trim();
    const addressLine = [street, postalCity]
      .filter(Boolean)
      .join(', ');

    const updated = await CrmClientModel.findByIdAndUpdate(
      req.params.id,
      {
        name,
        type,
        vat_number: type === 'company' ? vatNumber : undefined,
        address: addressLine || payload.address?.trim(),
        street,
        postalCode,
        postalCity,
        email: payload.email?.trim(),
        phone: payload.phone?.trim(),
        contact_person: payload.contactPerson?.trim(),
        tags: normalizeTags(payload.tags),
        notes: payload.notes?.trim()
      },
      { new: true }
    );

    if (!updated) {
      return res.fail('Stranka ni najdena', 404);
    }

    res.success(formatClient(updated));
  } catch (error) {
    if (error instanceof Error) {
      res.fail(error.message, 400);
      return;
    }
    res.fail('Ne morem posodobiti stranke');
  }
}

export async function deleteClient(req: Request, res: Response) {
  try {
    const updated = await CrmClientModel.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!updated) {
      return res.fail('Stranka ni najdena', 404);
    }
    res.success({ deletedId: updated._id, isActive: updated.isActive });
  } catch (error) {
    res.fail('Ne morem izbrisati stranke');
  }
}
