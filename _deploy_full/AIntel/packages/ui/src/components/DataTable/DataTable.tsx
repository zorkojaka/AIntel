import React from 'react';
import './DataTable.css';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowProps?: (row: T, rowIndex: number) => React.HTMLAttributes<HTMLTableRowElement>;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowProps
}: DataTableProps<T>) {
  return (
    <table className="aintel-data-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.header}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, rowIndex) => {
          const props = rowProps ? rowProps(row, rowIndex) : undefined;
          return (
            <tr key={rowIndex} {...props}>
              {columns.map((column) => (
                <td key={`${rowIndex}-${String(column.header)}`}>
                  {typeof column.accessor === 'function'
                    ? column.accessor(row)
                    : (row[column.accessor] as React.ReactNode)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
