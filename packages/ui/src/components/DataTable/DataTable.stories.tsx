import type { Meta, StoryObj } from '@storybook/react';
import { DataTable } from './DataTable';

const meta: Meta<typeof DataTable> = {
  title: 'UI/DataTable',
  component: DataTable
};

export default meta;

type Story = StoryObj<typeof DataTable>;

type Person = { name: string; company: string };

export const Default: Story = {
  args: {
    columns: [
      { header: 'Ime', accessor: 'name' },
      { header: 'Podjetje', accessor: (row: Person) => row.company }
    ],
    data: [
      { name: 'Ana', company: 'Inteligent' },
      { name: 'Marko', company: 'AI Lab' }
    ]
  }
};
