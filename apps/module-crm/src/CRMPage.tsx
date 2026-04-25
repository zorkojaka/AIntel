import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, TableRowActions } from '@aintel/ui';
import { ClientForm } from './components/ClientForm';
import { ClientsCardsMobile } from './components/ClientsCardsMobile';
import { ClientsTableDesktop } from './components/ClientsTableDesktop';
import { Client, ClientFormPayload } from './types/client';
import './styles.css';

export const CRMPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState('');
  const [isClientModalOpen, setClientModalOpen] = useState(false);
  const [clientModalMode, setClientModalMode] = useState<'create' | 'edit'>('create');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchClients = useCallback(async () => {
    setClientsError('');
    setClientsLoading(true);
    try {
      const response = await fetch('/api/crm/clients');
      const payload = await response.json();
      if (!payload.success) {
        setClientsError(payload.error ?? 'Neznana napaka pri nalaganju strank.');
        return;
      }
      if (Array.isArray(payload.data)) {
        setClients(payload.data);
      } else {
        setClientsError('Neveljaven odgovor streznika.');
      }
    } catch {
      setClientsError('Ne morem naloziti strank.');
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleOpenClientModal = () => {
    setClientModalMode('create');
    setSelectedClient(null);
    setClientModalOpen(true);
  };

  const handleEditClient = (client: Client) => {
    setClientModalMode('edit');
    setSelectedClient(client);
    setClientModalOpen(true);
  };

  const closeClientModal = () => {
    setClientModalOpen(false);
    setSelectedClient(null);
    setClientModalMode('create');
  };

  const handleClientSave = async (payload: ClientFormPayload) => {
    const isEdit = clientModalMode === 'edit';
    if (isEdit && !selectedClient) {
      throw new Error('Izbrati je potrebno stranko.');
    }
    const url = `/api/crm/clients${isEdit ? `/${selectedClient?.id}` : ''}`;
    const response = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error ?? 'Prislo je do napake.');
    }
  };

  const softDeleteClient = useCallback(async (client: Client) => {
    setClientsError('');
    try {
      const response = await fetch(`/api/crm/clients/${client.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!result.success) {
        setClientsError(result.error ?? 'Stranke ni bilo mogoče odstraniti.');
        return;
      }
      setClients((current) => current.filter((entry) => entry.id !== client.id));
      if (selectedClient?.id === client.id) {
        closeClientModal();
      }
    } catch {
      setClientsError('Stranke ni bilo mogoče odstraniti.');
    }
  }, [selectedClient]);

  const handleDeleteClient = useCallback((client: Client) => {
    const confirmed = globalThis.confirm('Stranka bo odstranjena iz seznama, projekti ostanejo.');
    if (confirmed) {
      void softDeleteClient(client);
    }
  }, [softDeleteClient]);

  const clientColumns = useMemo(
    () => [
      {
        header: 'Stranka',
        accessor: (client: Client) => (
          <span className="crm-name-with-alert">
            {client.name}
            {!client.isComplete && <span className="crm-name-alert">!</span>}
          </span>
        ),
      },
      {
        header: 'Tip',
        accessor: (client: Client) => (client.type === 'company' ? 'Podjetje' : 'Fizicna oseba'),
      },
      { header: 'VAT', accessor: (client: Client) => client.vatNumber ?? '-' },
      {
        header: 'Ulica',
        accessor: (client: Client) => client.street ?? client.address ?? '-',
      },
      {
        header: 'Mesto',
        accessor: (client: Client) => client.postalCity ?? '-',
      },
      { header: 'Telefon', accessor: (client: Client) => client.phone ?? '-' },
      { header: 'E-posta', accessor: (client: Client) => client.email ?? '-' },
      { header: 'Oznake', accessor: (client: Client) => client.tags.join(', ') || '-' },
      {
        header: 'Datum vnosa',
        accessor: (client: Client) => new Date(client.createdAt).toLocaleDateString('sl-SI'),
      },
      {
        header: '',
        accessor: (client: Client) => (
          <div
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <TableRowActions
              onEdit={() => handleEditClient(client)}
              onDelete={() => softDeleteClient(client)}
              deleteConfirmTitle="Izbriši stranko"
              deleteConfirmMessage="Stranka bo odstranjena iz seznama, projekti ostanejo."
            />
          </div>
        ),
      },
    ],
    [softDeleteClient],
  );

  const visibleClients = useMemo(() => {
    const activeClients = clients.filter((client) => client.isActive !== false);
    const base = showIncompleteOnly ? activeClients.filter((client) => !client.isComplete) : activeClients;
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return base;
    }

    return base.filter((client) => {
      const tagMatch = client.tags.some((tag) => tag.toLowerCase().includes(term));
      const cityMatch = client.postalCity?.toLowerCase().includes(term);
      const addressMatch = client.address?.toLowerCase().includes(term) || client.street?.toLowerCase().includes(term);
      return (
        client.name.toLowerCase().includes(term) ||
        client.vatNumber?.toLowerCase().includes(term) ||
        client.phone?.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term) ||
        cityMatch ||
        addressMatch ||
        tagMatch
      );
    });
  }, [clients, searchTerm, showIncompleteOnly]);

  const clientRowProps = (client: Client) => ({
    className: `crm-clients__row${selectedClient?.id === client.id ? ' crm-clients__row--selected' : ''}`,
    tabIndex: 0,
    role: 'button',
    onClick: () => handleEditClient(client),
    onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleEditClient(client);
      }
    },
  });

  return (
    <section className="crm-page">
      <header className="crm-header crm-header--with-action">
        <h1>STRANKE</h1>
        <Button className="crm-header__button" onClick={handleOpenClientModal}>
          Dodaj stranko
        </Button>
      </header>
      <div className="crm-clients crm-clients--full">
        <div className="crm-clients__header">
          <input
            className="crm-search"
            placeholder="Isci"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <label className="crm-filter">
            <input
              type="checkbox"
              checked={showIncompleteOnly}
              onChange={(event) => setShowIncompleteOnly(event.target.checked)}
            />
            <span>Prikazi samo nepopolne</span>
          </label>
        </div>

        {clientsError ? <div className="crm-clients__error">{clientsError}</div> : null}

        <div className="crm-clients__desktop">
          <ClientsTableDesktop
            clients={visibleClients}
            columns={clientColumns}
            rowProps={clientRowProps}
            loading={clientsLoading}
            emptyMessage={
              clientsLoading
                ? 'Nalagam stranke...'
                : visibleClients.length === 0
                  ? 'Ni strank za prikaz.'
                  : ''
            }
          />
        </div>

        <div className="crm-clients__mobile">
          <ClientsCardsMobile clients={visibleClients} onEdit={handleEditClient} onDelete={handleDeleteClient} />
        </div>
      </div>

      <ClientForm
        open={isClientModalOpen}
        mode={clientModalMode}
        client={selectedClient ?? undefined}
        onClose={closeClientModal}
        onSubmit={handleClientSave}
        onSuccess={async () => {
          closeClientModal();
          await fetchClients();
        }}
      />
    </section>
  );
};
