import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, RefreshCw, Search, User } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import type { User as UserType } from '@aintel/shared/types/user';
import { createUser, deleteUser, fetchUsers, updateUser } from '../api/users';
import { UsersTable } from './UsersTable';
import { UserFormDialog } from './UserFormDialog';

export function UsersAdminTab() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const loadUsers = useCallback(
    async (includeDeleted = false, search?: string) => {
      setLoading(true);
      try {
        const data = await fetchUsers({ includeDeleted, search });
        setUsers(data);
      } catch (error: any) {
        toast.error(error?.message ?? 'Napaka pri nalaganju uporabnikov.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers(showDeleted, searchTerm.trim() || undefined);
    }, 200);
    return () => clearTimeout(timer);
  }, [loadUsers, searchTerm, showDeleted]);

  const openCreateDialog = () => {
    setEditingUser(null);
    setDialogOpen(true);
  };

  const openEditDialog = (user: UserType) => {
    setEditingUser(user);
    setDialogOpen(true);
  };

  const handleSubmit = async (payload: Partial<UserType>) => {
    setSubmitting(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, payload);
        toast.success('Uporabnik posodobljen.');
      } else {
        await createUser(payload);
        toast.success('Uporabnik dodan.');
      }
      setDialogOpen(false);
      await loadUsers(showDeleted, searchTerm.trim() || undefined);
    } catch (error: any) {
      toast.error(error?.message ?? 'Shranjevanje ni uspelo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: UserType) => {
    const confirmed = window.confirm(`Res zelite izbrisati uporabnika "${user.name}"?`);
    if (!confirmed) return;

    try {
      await deleteUser(user.id);
      toast.success('Uporabnik je bil odstranjen.');
      await loadUsers(showDeleted, searchTerm.trim() || undefined);
    } catch (error: any) {
      toast.error(error?.message ?? 'Brisanje ni uspelo.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3 text-slate-800">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <User size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Uporabniki (admin)</h2>
              <p className="text-sm text-slate-500">Upravljanje dostopov in vlog.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => loadUsers(showDeleted, searchTerm.trim() || undefined)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-[1px] hover:border-slate-300 hover:shadow"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Osvezi
          </button>
          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-600"
          >
            <Plus size={18} />
            Nov uporabnik
          </button>
        </div>
      </div>

      <div className="employees-card space-y-4 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <User size={16} />
            <span>{users.length} rezultatov</span>
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
                placeholder="Isci po imenu ali emailu"
                className="w-full border-none bg-transparent text-sm outline-none"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            Nalagam uporabnike...
          </div>
        ) : (
          <UsersTable users={users} onEdit={openEditDialog} onDelete={handleDelete} />
        )}
      </div>

      <UserFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        initialData={editingUser}
        submitting={submitting}
      />

      <Toaster richColors position="top-right" />
    </div>
  );
}
