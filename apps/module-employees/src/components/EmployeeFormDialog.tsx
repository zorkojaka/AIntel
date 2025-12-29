import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState, type FormEvent } from 'react';
import type { Employee, EmployeePayload } from '../types';

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EmployeePayload) => Promise<void>;
  initialData?: Employee | null;
  submitting?: boolean;
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  submitting = false,
}: EmployeeFormDialogProps) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [hourRateWithoutVat, setHourRateWithoutVat] = useState('0');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name ?? '');
      setCompany(initialData.company ?? '');
      setHourRateWithoutVat(String(initialData.hourRateWithoutVat ?? 0));
      setActive(initialData.active ?? true);
      setError(null);
    } else {
      setName('');
      setCompany('');
      setHourRateWithoutVat('0');
      setActive(true);
      setError(null);
    }
  }, [initialData, open]);

  const handleSubmit = async (event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsedRate = Number(hourRateWithoutVat);
    if (!name.trim()) {
      setError('Ime zaposlenega je obvezno.');
      return;
    }
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      setError('Urna postavka mora biti nenegativna.');
      return;
    }

    await onSubmit({
      name: name.trim(),
      company: company.trim(),
      hourRateWithoutVat: parsedRate,
      active,
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-slate-900">
              {initialData ? 'Uredi zaposlenega' : 'Nov zaposleni'}
            </Dialog.Title>
            <Dialog.Close className="text-slate-500 hover:text-slate-700">✕</Dialog.Close>
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
              <label className="text-sm font-medium text-slate-700" htmlFor="company">
                Podjetje (neobvezno)
              </label>
              <input
                id="company"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="hourRateWithoutVat">
                Urna postavka (brez DDV)
              </label>
              <input
                id="hourRateWithoutVat"
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={hourRateWithoutVat}
                onChange={(event) => setHourRateWithoutVat(event.target.value)}
                required
              />
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

            {error ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{error}</div> : null}

            <div className="flex items-center justify-end gap-2">
              <Dialog.Close
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Prekliči
              </Dialog.Close>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? 'Shranjujem…' : initialData ? 'Posodobi' : 'Dodaj'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
