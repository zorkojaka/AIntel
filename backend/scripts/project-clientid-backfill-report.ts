import mongoose from 'mongoose';

import { connectToMongo } from '../db/mongo';
import { loadEnvironment } from '../loadEnv';
import { CrmClientModel } from '../modules/crm/schemas/client';
import { ProjectModel } from '../modules/projects/schemas/project';

type ClientCandidate = {
  id: string;
  name: string;
  vatNumber?: string | null;
};

type ProjectCandidate = {
  id: string;
  title?: string | null;
  clientId?: unknown;
  customer?: {
    name?: string | null;
    taxId?: string | null;
  } | null;
};

export type ProjectClientIdBackfillRow = {
  projectId: string;
  title?: string | null;
  customerName: string;
  customerTaxId: string;
  status: 'already_linked' | 'match' | 'ambiguous' | 'no_match';
  matchReason?: 'taxId' | 'name';
  clientId?: string;
  candidates?: ClientCandidate[];
};

function normalize(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasClientId(value: unknown) {
  return Boolean(value && normalize(String(value)));
}

export function analyzeProjectClientIdBackfill(projects: ProjectCandidate[], clients: ClientCandidate[]) {
  const clientsByVat = new Map<string, ClientCandidate[]>();
  const clientsByName = new Map<string, ClientCandidate[]>();

  for (const client of clients) {
    const vat = normalize(client.vatNumber).toUpperCase();
    const name = normalize(client.name);
    if (vat) clientsByVat.set(vat, [...(clientsByVat.get(vat) ?? []), client]);
    if (name) clientsByName.set(name, [...(clientsByName.get(name) ?? []), client]);
  }

  const rows: ProjectClientIdBackfillRow[] = projects.map((project) => {
    const customerName = normalize(project.customer?.name);
    const customerTaxId = normalize(project.customer?.taxId).toUpperCase();
    const base = {
      projectId: project.id,
      title: project.title ?? null,
      customerName,
      customerTaxId,
    };

    if (hasClientId(project.clientId)) {
      return { ...base, status: 'already_linked' as const, clientId: String(project.clientId) };
    }

    const taxMatches = customerTaxId ? clientsByVat.get(customerTaxId) ?? [] : [];
    if (taxMatches.length === 1) {
      return { ...base, status: 'match' as const, matchReason: 'taxId' as const, clientId: taxMatches[0].id };
    }
    if (taxMatches.length > 1) {
      return { ...base, status: 'ambiguous' as const, matchReason: 'taxId' as const, candidates: taxMatches };
    }

    const nameMatches = customerName ? clientsByName.get(customerName) ?? [] : [];
    if (nameMatches.length === 1) {
      return { ...base, status: 'match' as const, matchReason: 'name' as const, clientId: nameMatches[0].id };
    }
    if (nameMatches.length > 1) {
      return { ...base, status: 'ambiguous' as const, matchReason: 'name' as const, candidates: nameMatches };
    }

    return { ...base, status: 'no_match' as const };
  });

  return {
    totals: {
      projects: rows.length,
      alreadyLinked: rows.filter((row) => row.status === 'already_linked').length,
      matches: rows.filter((row) => row.status === 'match').length,
      ambiguous: rows.filter((row) => row.status === 'ambiguous').length,
      noMatch: rows.filter((row) => row.status === 'no_match').length,
    },
    rows,
  };
}

export async function runProjectClientIdBackfillReport() {
  loadEnvironment();
  await connectToMongo();

  const [projects, clients] = await Promise.all([
    ProjectModel.find({})
      .select({ id: 1, title: 1, clientId: 1, customer: 1 })
      .lean(),
    CrmClientModel.find({ isActive: { $ne: false } })
      .select({ _id: 1, name: 1, vat_number: 1 })
      .lean(),
  ]);

  const report = analyzeProjectClientIdBackfill(
    projects.map((project: any) => ({
      id: String(project.id),
      title: project.title ?? null,
      clientId: project.clientId ?? null,
      customer: project.customer ?? null,
    })),
    clients.map((client: any) => ({
      id: String(client._id),
      name: String(client.name ?? ''),
      vatNumber: client.vat_number ?? null,
    })),
  );

  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  runProjectClientIdBackfillReport()
    .catch((error) => {
      console.error('project-clientid-backfill-report failed:', error);
      process.exitCode = 1;
    })
    .finally(() => {
      mongoose.connection.close();
    });
}
