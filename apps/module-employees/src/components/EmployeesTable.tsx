import { Pencil, Trash2 } from 'lucide-react';
import type { Employee } from '../types';
import type { User } from '@aintel/shared/types/user';

interface EmployeesTableProps {
  employees: Array<Employee & { user?: User | null }>;
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
  onSetAccess: (employee: Employee) => void;
  onRemoveAccess: (employee: Employee & { user?: User | null }) => void;
}

export function EmployeesTable({ employees, onEdit, onDelete, onSetAccess, onRemoveAccess }: EmployeesTableProps) {
  if (!employees.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-slate-500">
        Trenutno ni zaposlenih.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="table w-full border-collapse">
        <thead className="bg-slate-50">
          <tr>
            <th>Ime</th>
            <th>Podjetje</th>
            <th>Email</th>
            <th>Telefon</th>
            <th>Urna postavka (brez DDV)</th>
            <th>Email za prijavo</th>
            <th>Vloge</th>
            <th>Dostop</th>
            <th>Aktiven</th>
            <th className="text-right">Akcije</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id}>
              <td className="font-medium text-slate-900">{employee.name}</td>
              <td className="text-slate-600">{employee.company || '-'}</td>
              <td className="text-slate-600">{employee.email || '-'}</td>
              <td className="text-slate-600">{employee.phone || '-'}</td>
              <td className="text-slate-900">{employee.hourRateWithoutVat.toFixed(2)}</td>
              <td className="text-slate-600">{employee.user?.email ?? '-'}</td>
              <td className="text-slate-600">{employee.user?.roles?.length ? employee.user.roles.join(', ') : '-'}</td>
              <td className="text-slate-600">{employee.user ? 'Ima dostop' : 'Brez dostopa'}</td>
              <td>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    employee.active ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${employee.active ? 'bg-green-500' : 'bg-orange-500'}`}
                  />
                  {employee.active ? 'Aktiven' : 'Neaktiven'}
                </span>
              </td>
              <td className="text-right">
                <div className="flex items-center justify-end gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => onEdit(employee)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm transition hover:-translate-y-[1px] hover:border-slate-300 hover:shadow"
                  >
                    <Pencil size={16} />
                    Uredi
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(employee)}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-1.5 text-rose-700 shadow-sm transition hover:-translate-y-[1px] hover:border-rose-200 hover:bg-rose-100 hover:shadow"
                  >
                    <Trash2 size={16} />
                    Izbrisi
                  </button>
                  <button
                    type="button"
                    onClick={() => onSetAccess(employee)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm transition hover:-translate-y-[1px] hover:border-slate-300 hover:shadow"
                  >
                    Nastavi dostop
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveAccess(employee)}
                    disabled={!employee.user}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-1.5 text-amber-700 shadow-sm transition hover:-translate-y-[1px] hover:border-amber-200 hover:bg-amber-100 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Odstrani dostop
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
