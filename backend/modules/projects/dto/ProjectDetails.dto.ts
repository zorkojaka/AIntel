import type { Project } from '../schemas/project';

export interface ProjectClientDto {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  street?: string | null;
  postalCode?: string | null;
  postalCity?: string | null;
  address?: string | null;
}

export type ProjectDetailsDto = Project & {
  client?: ProjectClientDto | null;
};

export function createProjectDetailsDto(project: Project, client?: ProjectClientDto | null): ProjectDetailsDto {
  return {
    ...project,
    client: client ?? null,
  };
}
