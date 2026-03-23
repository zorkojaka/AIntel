import { Mail, Pencil, Phone, Trash2 } from 'lucide-react';
import type { Employee } from '../types';

interface EmployeesTableProps {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onDelete: (employee: Employee) => void;
}

function StatusBadge({
  active,
  label,
  activeClassName,
  inactiveClassName,
}: {
  active: boolean;
  label: string;
  activeClassName: string;
  inactiveClassName: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
        active ? activeClassName : inactiveClassName
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-current' : 'bg-current'}`} />
      {label}
    </span>
  );
}

function RoleChips({ roles }: { roles?: string[] }) {
  if (!roles?.length) {
    return <span className="text-xs text-slate-500">Brez vloge</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span
          key={role}
          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700"
        >
          {role}
        </span>
      ))}
    </div>
  );
}

export function EmployeesTable({ employees, onEdit, onDelete }: EmployeesTableProps) {
  if (!employees.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-slate-500">
        Trenutno ni zaposlenih.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="table w-full border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th>Ime</th>
              <th className="hidden lg:table-cell">Podjetje</th>
              <th className="hidden xl:table-cell">Email</th>
              <th className="hidden xl:table-cell">Telefon</th>
              <th>Urna postavka</th>
              <th className="hidden lg:table-cell">Vloge</th>
              <th>Aktiven</th>
              <th>Dostop</th>
              <th className="text-right">Akcije</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td className="font-medium text-slate-900">{employee.name}</td>
                <td className="hidden lg:table-cell text-slate-600">{employee.company || '-'}</td>
                <td className="hidden xl:table-cell text-slate-600">{employee.email || '-'}</td>
                <td className="hidden xl:table-cell text-slate-600">{employee.phone || '-'}</td>
                <td className="text-slate-900">
                  {employee.hourRateWithoutVat.toLocaleString('sl-SI', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  EUR
                </td>
                <td className="hidden lg:table-cell text-slate-600">
                  {employee.roles?.length ? employee.roles.join(', ') : '-'}
                </td>
                <td>
                  <StatusBadge
                    active={employee.active}
                    label={employee.active ? 'Aktiven' : 'Neaktiven'}
                    activeClassName="bg-green-50 text-green-700"
                    inactiveClassName="bg-orange-50 text-orange-700"
                  />
                </td>
                <td>
                  <StatusBadge
                    active={employee.appAccess !== false}
                    label={employee.appAccess !== false ? 'Omogočen' : 'Onemogočen'}
                    activeClassName="bg-blue-50 text-blue-700"
                    inactiveClassName="bg-slate-100 text-slate-600"
                  />
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(employee)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      aria-label={`Uredi ${employee.name}`}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(employee)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-700 transition hover:border-rose-200 hover:bg-rose-100"
                      aria-label={`Izbriši ${employee.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {employees.map((employee) => (
          <article key={employee.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <h3 className="text-sm font-semibold leading-5 text-slate-900">{employee.name}</h3>
                <p className="text-xs text-slate-500">{employee.company?.trim() || 'Brez podjetja'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(employee)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  aria-label={`Uredi ${employee.name}`}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(employee)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-700 transition hover:border-rose-200 hover:bg-rose-100"
                  aria-label={`Izbriši ${employee.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge
                active={employee.active}
                label={employee.active ? 'Aktiven' : 'Neaktiven'}
                activeClassName="bg-green-50 text-green-700"
                inactiveClassName="bg-orange-50 text-orange-700"
              />
              <StatusBadge
                active={employee.appAccess !== false}
                label={employee.appAccess !== false ? 'Dostop omogočen' : 'Dostop onemogočen'}
                activeClassName="bg-blue-50 text-blue-700"
                inactiveClassName="bg-slate-100 text-slate-600"
              />
            </div>

            <div className="mt-2 space-y-2">
              <RoleChips roles={employee.roles} />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-slate-500">Urna postavka</div>
                  <div className="font-semibold text-slate-900">
                    {employee.hourRateWithoutVat.toLocaleString('sl-SI', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    EUR
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-slate-500">Kontakt</div>
                  <div className="space-y-1 pt-0.5 text-slate-700">
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail size={12} />
                      <span className="truncate">{employee.email?.trim() || 'Ni emaila'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone size={12} />
                      <span className="truncate">{employee.phone?.trim() || 'Ni telefona'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
