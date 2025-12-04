import type { Project, ProjectDocument } from '../schemas/project';
import { ProjectModel } from '../schemas/project';
import { CrmClientModel, type CrmClient } from '../../crm/schemas/client';
import { createProjectDetailsDto, type ProjectClientDto, type ProjectDetailsDto } from '../dto/ProjectDetails.dto';

type ProjectInput = Project | ProjectDocument | (Project & { _id?: string });

function normalize(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isDocument(project: ProjectInput): project is ProjectDocument {
  return typeof (project as ProjectDocument)?.toObject === 'function';
}

function toPlainProject(project: ProjectInput): Project {
  if (isDocument(project)) {
    return (project as any).toObject ? (project as any).toObject() : (project as Project);
  }
  return project as Project;
}

function mapCrmClientToDto(client: CrmClient): ProjectClientDto {
  return {
    id: client._id.toString(),
    name: client.name,
    email: client.email ?? null,
    phone: client.phone ?? null,
    street: client.street ?? null,
    postalCode: client.postalCode ?? null,
    postalCity: client.postalCity ?? null,
    address: client.address ?? null,
  };
}

async function findCrmClient(project: Project): Promise<ProjectClientDto | null> {
  const vatNumber = normalize(project.customer?.taxId);
  const customerName = normalize(project.customer?.name);

  if (vatNumber) {
    const byVat = await CrmClientModel.findOne({ vat_number: vatNumber }).lean();
    if (byVat) {
      if (!customerName || normalize(byVat.name) === customerName) {
        return mapCrmClientToDto(byVat);
      }
      return mapCrmClientToDto(byVat);
    }
  }

  if (customerName) {
    const byName = await CrmClientModel.findOne({ name: customerName }).lean();
    if (byName) {
      return mapCrmClientToDto(byName);
    }
  }

  return null;
}

export async function resolveProjectClient(project: ProjectInput): Promise<ProjectClientDto | null> {
  const plain = toPlainProject(project);
  return findCrmClient(plain);
}

export function formatClientAddress(client?: ProjectClientDto | null, fallback?: string | null): string {
  if (!client) {
    return fallback?.trim() ?? '';
  }
  const street = normalize(client.street);
  const postal = [normalize(client.postalCode), normalize(client.postalCity)].filter(Boolean).join(' ').trim();
  if (street && postal) {
    return `${street}, ${postal}`;
  }
  if (street) {
    return street;
  }
  if (postal) {
    return postal;
  }
  return normalize(client.address) ?? fallback?.trim() ?? '';
}

export async function serializeProjectDetails(project: ProjectInput, clientOverride?: ProjectClientDto | null): Promise<ProjectDetailsDto> {
  const plain = toPlainProject(project);
  const client = clientOverride !== undefined ? clientOverride : await findCrmClient(plain);
  return createProjectDetailsDto(plain, client ?? null);
}

export async function loadProjectDetailsById(projectId: string): Promise<ProjectDetailsDto | null> {
  const project = await ProjectModel.findOne({ id: projectId });
  if (!project) {
    return null;
  }
  return serializeProjectDetails(project);
}
