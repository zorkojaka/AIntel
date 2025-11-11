import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from './DataTable';

describe('DataTable', () => {
  test('renders headers and rows', () => {
    const columns = [{ header: 'Name', accessor: 'name' as const }];
    const data = [{ name: 'Ana' }];
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText(/Name/)).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
  });
});
