import React from 'react';
import { DataTable } from '@aintel/ui';
import { Client } from '../types/client';

interface ClientsTableDesktopProps {
  clients: Client[];
  columns: Array<{ header: string; accessor: (client: Client) => React.ReactNode }>;
  rowProps: (client: Client) => Record<string, unknown>;
}

export function ClientsTableDesktop({ clients, columns, rowProps }: ClientsTableDesktopProps) {
  return (
    <div className="crm-clients-desktop">
      <DataTable columns={columns} data={clients} rowProps={rowProps} />
    </div>
  );
}
