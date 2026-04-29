import React from 'react';
import './DataTable.css';

export interface Column<T> {
  header: React.ReactNode;
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
    <div className="aintel-data-table-wrap">
      <table className="aintel-data-table">
        <thead>
          <tr>
            {columns.map((column, columnIndex) =>
              React.isValidElement(column.header) && column.header.type === 'th' ? (
                React.cloneElement(column.header, { key: columnIndex })
              ) : (
                <th key={columnIndex}>{column.header}</th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const props = rowProps ? rowProps(row, rowIndex) : undefined;
            return (
              <tr key={rowIndex} {...props}>
                {columns.map((column, columnIndex) => (
                  <td key={`${rowIndex}-${columnIndex}`}>
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
    </div>
  );
}
