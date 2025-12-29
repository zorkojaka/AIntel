import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Plus, RefreshCw, Search, Users } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import type { User } from '@aintel/shared/types/user';
import { EmployeesTable } from '../components/EmployeesTable';
import { EmployeeFormDialog } from '../components/EmployeeFormDialog';
import { UsersAdminTab } from '../users/UsersAdminTab';
import { createEmployee, deleteEmployee, fetchEmployees, getTenantId, updateEmployee } from '../api/employees';
import { createUser, fetchUsers, updateUser } from '../api/users';
import type { Employee, EmployeePayload } from '../types';
import { useCapabilities } from '../hooks/useCapabilities';

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'employees' | 'users'>('employees');
  const capabilities = useCapabilities();

  const loadEmployees = useCallback(async (includeDeleted = false) => {
    setLoading(true);
    try {
      const data = await fetchEmployees(includeDeleted);
      setEmployees(data);
    } catch (error: any) {
      toast.error(error?.message ?? 'Napaka pri nalaganju zaposlenih.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    loadEmployees(showDeleted);
    loadUsers();
  }, [loadEmployees, loadUsers, showDeleted]);

  const filteredEmployees = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const visible = employees.filter((employee) => (showDeleted ? true : !employee.deletedAt));
    const userByEmployeeId = new Map<string, User>();
    users.forEach((user) => {
      if (!user.employeeId) return;
      if (!userByEmployeeId.has(user.employeeId)) {
        userByEmployeeId.set(user.employeeId, user);
      }
    });
    const filtered = term
      ? visible.filter((employee) => {
          const linked = userByEmployeeId.get(employee.id);
          const haystack = `${employee.name} ${employee.company ?? ''} ${employee.email ?? ''} ${
            employee.phone ?? ''
          } ${linked?.email ?? ''} ${(linked?.roles ?? []).join(' ')}`.toLowerCase();
          return haystack.includes(term);
        })
      : visible;
    const withUsers = filtered.map((employee) => ({
      ...employee,
      user: userByEmployeeId.get(employee.id) ?? null,
    }));
    return withUsers.sort((a, b) => a.name.localeCompare(b.name, 'sl', { sensitivity: 'base' }));
  }, [employees, searchTerm, showDeleted, users]);

  const openCreateDialog = () => {
    setEditingEmployee(null);
    setDialogOpen(true);
  };

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setDialogOpen(true);
  };

  const handleSubmit = async (
    payload: EmployeePayload,
    access: {
      enabled: boolean;
      mode: 'existing' | 'new';
      selectedUserId: string | null;
      roles: string[];
      newUser: { email: string; roles: string[]; active: boolean } | null;
      previousUserId: string | null;
    }
  ) => {
    setSubmitting(true);
    try {
      let saved: Employee | null = null;
      if (editingEmployee) {
        saved = await updateEmployee(editingEmployee.id, payload);
        toast.success('Zaposleni posodobljen.');
      } else {
        saved = await createEmployee(payload);
        toast.success('Zaposleni dodan.');
      }

      if (saved) {
        if (!access.enabled) {
          if (access.previousUserId) {
            await updateUser(access.previousUserId, { employeeId: null });
          }
        } else if (access.mode === 'new' && access.newUser) {
          const created = await createUser({
            email: access.newUser.email,
            name: saved.name,
            roles: access.newUser.roles,
            active: access.newUser.active,
            employeeId: saved.id,
          } as any);
          await updateUser(created.id, { employeeId: saved.id });
        } else if (access.mode === 'existing') {
          if (access.previousUserId && access.previousUserId !== access.selectedUserId) {
            await updateUser(access.previousUserId, { employeeId: null });
          }
          if (access.selectedUserId) {
            await updateUser(access.selectedUserId, {
              employeeId: saved.id,
              roles: access.roles,
            });
          }
        }
      }

      setDialogOpen(false);
      await loadEmployees(showDeleted);
      await loadUsers();
    } catch (error: any) {
      toast.error(error?.message ?? 'Shranjevanje ni uspelo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (employee: Employee) => {
    if (!capabilities.canDelete) return;
    const confirmed = window.confirm(`Res zelite izbrisati zaposlenega "${employee.name}"?`);
    if (!confirmed) return;

    try {
      await deleteEmployee(employee.id);
      toast.success('Zaposleni je bil odstranjen.');
      await loadEmployees(showDeleted);
      await loadUsers();
    } catch (error: any) {
      toast.error(error?.message ?? 'Brisanje ni uspelo.');
    }
  };

  const handleRemoveAccess = async (employee: Employee & { user?: User | null }) => {
    if (!employee.user) return;
    try {
      await updateUser(employee.user.id, { employeeId: null });
      toast.success('Dostop odstranjen.');
      await loadEmployees(showDeleted);
      await loadUsers();
    } catch (error: any) {
      toast.error(error?.message ?? 'Odstranitev dostopa ni uspela.');
    }
  };

  const canViewUsersAdmin = true;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3 text-slate-800">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Zaposleni</h1>
              <p className="text-sm text-slate-500">Upravljanje ekip in urnih postavk.</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Tenant: {getTenantId()}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('employees')}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                activeTab === 'employees' ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
              }`}
            >
              Zaposleni
            </button>
            {canViewUsersAdmin ? (
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  activeTab === 'users' ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
                }`}
              >
                Uporabniki (admin)
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => loadEmployees(showDeleted)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-[1px] hover:border-slate-300 hover:shadow"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Osvezi
          </button>
          {capabilities.canCreate ? (
            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-600"
            >
              <Plus size={18} />
              Nov zaposleni
            </button>
          ) : null}
        </div>
      </div>

      {activeTab === 'employees' ? (
        <div className="employees-card space-y-4 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <Users size={16} />
              <span>{filteredEmployees.length} rezultatov</span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  checked={showDeleted}
                  onChange={(event) => setShowDeleted(event.target.checked)}
                />
                <span className="inline-flex items-center gap-1">
                  {showDeleted ? <Eye size={14} /> : <EyeOff size={14} />}
                  Vkljuci izbrisane
                </span>
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                <Search size={16} className="text-slate-400" />
                <input
                  type="search"
                  placeholder="Isci po imenu, podjetju ali emailu"
                  className="w-full border-none bg-transparent text-sm outline-none"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
              Nalagam zaposlene...
            </div>
          ) : (
            <EmployeesTable
              employees={filteredEmployees}
              onEdit={openEditDialog}
              onDelete={handleDelete}
              onSetAccess={openEditDialog}
              onRemoveAccess={handleRemoveAccess}
            />
          )}
        </div>
      ) : (
        <UsersAdminTab />
      )}

      <EmployeeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        initialData={editingEmployee}
        submitting={submitting}
      />

      <Toaster richColors position="top-right" />
    </div>
  );
}
