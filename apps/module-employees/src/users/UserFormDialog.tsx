import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@aintel/shared/types/user';

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: Partial<User>) => Promise<void>;
  initialData?: User | null;
  submitting?: boolean;
}

const roleOptions = ['admin', 'sales', 'ops', 'technician', 'finance', 'manager'] as const;

export function UserFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  submitting = false,
}: UserFormDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [active, setActive] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name ?? '');
      setEmail(initialData.email ?? '');
      setActive(initialData.active ?? true);
      setRoles(initialData.roles ?? []);
      setError(null);
    } else {
      setName('');
      setEmail('');
      setActive(true);
      setRoles([]);
      setError(null);
    }
  }, [initialData, open]);

  const toggleRole = (role: string) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role]));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError('Ime uporabnika je obvezno.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Email ni veljaven.');
      return;
    }

    await onSubmit({
      name: trimmedName,
      email: trimmedEmail,
      roles,
      active,
      employeeId: initialData?.employeeId ?? null,
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              {initialData ? 'Uredi uporabnika' : 'Nov uporabnik'}
            </Dialog.Title>
            <Dialog.Close className="text-slate-500 hover:text-slate-700">X</Dialog.Close>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="name">
                Ime
              </label>
              <input
                id="name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Vloge</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {roleOptions.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      onChange={() => toggleRole(role)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              Aktiven
            </label>

            {error ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {error}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Dialog.Close
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Preklici
              </Dialog.Close>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'Shranjujem...' : initialData ? 'Posodobi' : 'Dodaj'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
