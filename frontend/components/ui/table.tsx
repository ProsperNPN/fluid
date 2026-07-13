import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
}

export function DataTable<T extends object>({ columns, rows }: { columns: Array<TableColumn<T>>; rows: T[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-600">
            {columns.map((column) => (
              <th key={String(column.key)} className="px-3 py-3 font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-slate-100">
              {columns.map((column) => (
                <td key={String(column.key)} className="px-3 py-3 text-slate-700">
                  {column.render ? column.render(row[column.key], row) : (row[column.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
