import { Pencil, Trash2 } from 'lucide-react';
import type { User } from '@aintel/shared/types/user';

interface UsersTableProps {
  users: User[];
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

export function UsersTable({ users, onEdit, onDelete }: UsersTableProps) {
  if (!users.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-slate-500">
        Trenutno ni uporabnikov.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="table w-full border-collapse">
        <thead className="bg-slate-50">
          <tr>
            <th>Ime</th>
            <th>Email</th>
            <th>Vloge</th>
            <th>Aktiven</th>
            <th className="text-right">Akcije</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td className="font-medium text-slate-900">{user.name}</td>
              <td className="text-slate-600">{user.email}</td>
              <td className="text-slate-600">{user.roles?.length ? user.roles.join(', ') : '-'}</td>
              <td>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                    user.active ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${user.active ? 'bg-green-500' : 'bg-orange-500'}`}
                  />
                  {user.active ? 'Aktiven' : 'Neaktiven'}
                </span>
              </td>
              <td className="text-right">
                <div className="flex items-center justify-end gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => onEdit(user)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm transition hover:-translate-y-[1px] hover:border-slate-300 hover:shadow"
                  >
                    <Pencil size={16} />
                    Uredi
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(user)}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-1.5 text-rose-700 shadow-sm transition hover:-translate-y-[1px] hover:border-rose-200 hover:bg-rose-100 hover:shadow"
                  >
                    <Trash2 size={16} />
                    Izbrisi
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
