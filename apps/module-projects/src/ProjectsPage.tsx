import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Column, DataTable, Input, Select } from '@aintel/ui';
import { tokens } from '@aintel/theme';
import { ProjectForm } from './forms/ProjectForm';
import { ProjectDetail } from './ProjectDetail';
import { STATUS_LABELS, STATUS_OPTIONS } from './constants/status';
import { ProjectRecord } from './types/project';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface CompanyOption {
  _id: string;
  name: string;
}

interface ContactOption {
  _id: string;
  first_name?: string;
  last_name?: string;
}

const extractPayload = (payload: any) => payload?.data ?? payload;

export const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectRecord | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const formatDates = useCallback((start?: string, end?: string) => {
    if (start && end) {
      return `${new Date(start).toLocaleDateString('sl')} → ${new Date(end).toLocaleDateString('sl')}`;
    }
    if (start) return new Date(start).toLocaleDateString('sl');
    if (end) return new Date(end).toLocaleDateString('sl');
    return '-';
  }, []);

  const loadCompanies = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/crm/companies`);
      const payload = await response.json();
      setCompanies(extractPayload(payload) ?? []);
    } catch {
      setError('Ne morem naložiti strank iz CRM-a');
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/crm/people`);
      const payload = await response.json();
      setContacts(extractPayload(payload) ?? []);
    } catch {
      setError('Ne morem naložiti kontaktov iz CRM-a');
    }
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${API_BASE}/projekti${query}`);
      const payload = await response.json();
      const data = extractPayload(payload);
      const list = data?.projects ?? data ?? [];
      setProjects(Array.isArray(list) ? list : []);
    } catch {
      setError('Ne morem naložiti projektov');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  const loadProjectDetail = useCallback(async (projectId: string) => {
    setDetailLoading(true);
    try {
      const response = await fetch(`${API_BASE}/projekti/${projectId}`);
      const payload = await response.json();
      const record = extractPayload(payload);
      setSelectedProject(record ?? null);
    } catch {
      setError('Ne najdem podrobnosti projekta');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleConfirmPhase = useCallback(
    async (phase: string) => {
      if (!selectedProject) return;
      setDetailLoading(true);
      try {
        const response = await fetch(`${API_BASE}/projekti/${selectedProject._id}/confirm-phase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase })
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload?.error ?? 'Neuspešna potrditvena akcija');
        }
        await loadProjects();
        await loadProjectDetail(selectedProject._id);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setDetailLoading(false);
      }
    },
    [selectedProject, loadProjects, loadProjectDetail]
  );

  const columns: Column<ProjectRecord>[] = useMemo(
    () => [
      { header: 'Naziv', accessor: 'name' },
      { header: 'Stranka', accessor: 'companyName' },
      { header: 'Kontakt', accessor: 'contactName' },
      {
        header: 'Status',
        accessor: (row) => STATUS_LABELS[row.status] ?? row.status
      },
      {
        header: 'Termini',
        accessor: (row) => formatDates(row.startDate, row.endDate)
      },
      {
        header: 'Akcije',
        accessor: (row) => (
          <Button variant="ghost" onClick={() => loadProjectDetail(row._id)}>
            Podrobnosti
          </Button>
        )
      }
    ],
    [loadProjectDetail, formatDates]
  );

  useEffect(() => {
    loadCompanies();
    loadContacts();
  }, [loadCompanies, loadContacts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProjects();
    }, 400);
    return () => clearTimeout(timer);
  }, [loadProjects]);

  return (
    <section className="projects-page">
      <header className="projects-page__header">
        <div>
          <h1 style={{ color: tokens.colors.primary }}>Modul Projektov</h1>
          <p>
            Upravljajte projekte, spremljajte statusne faze in povežite projekte s CRM strankami.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'Zapri obrazec' : 'Nov projekt'}
        </Button>
      </header>

      <div className="projects-page__controls">
        <Input
          label="Išči projekte"
          placeholder="Išči po nazivu, opisu ali kraju"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {showForm && (
        <Card title="Ustvari nov projekt" className="projects-page__form-card">
          <ProjectForm
            companies={companies}
            contacts={contacts}
            onSuccess={() => {
              setShowForm(false);
              loadProjects();
            }}
          />
        </Card>
      )}

      {error && <p className="projects-page__error">{error}</p>}

      <div className="projects-page__grid">
        <Card title="Seznam projektov" className="projects-page__list-card">
          {loading ? <p>Nalaganje projektov...</p> : <DataTable columns={columns} data={projects} />}
        </Card>

        <ProjectDetail
          project={selectedProject}
          onConfirmPhase={(phase) => handleConfirmPhase(phase)}
          loading={detailLoading}
        />
      </div>
    </section>
  );
};
