import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { Employee, EmployeePayload } from '../types';

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EmployeePayload) => Promise<void>;
  initialData?: Employee | null;
  submitting?: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

interface AuthMePayload {
  roles?: string[];
  employee?: {
    roles?: string[];
  } | null;
}

interface CenikProduct {
  _id: string;
  name: string;
  isService?: boolean;
}

interface EmployeeServiceRate {
  serviceProductId: string;
  defaultPercent: number;
  overridePrice: number | null;
  isActive: boolean;
}

interface ServiceRateRow {
  productId: string;
  productName: string;
  defaultPercent: string;
  overridePrice: string;
  isActive: boolean;
}

const contractTypeOptions = ['zaposlitvena', 'podjemna', 's.p.', 'student', 'zunanji'] as const;
const shirtSizeOptions = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const;
const roleOptions = ['ADMIN', 'SALES', 'EXECUTION', 'FINANCE', 'ORGANIZER'] as const;

type FormTab = 'osnovno' | 'cenik';

async function parseEnvelope<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? 'Zahteva ni uspela.');
  }
  return payload.data;
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
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [employmentStartDate, setEmploymentStartDate] = useState('');
  const [contractType, setContractType] = useState('');
  const [shirtSize, setShirtSize] = useState('');
  const [shoeSize, setShoeSize] = useState('');
  const [notes, setNotes] = useState('');
  const [hourRateWithoutVat, setHourRateWithoutVat] = useState('0');
  const [active, setActive] = useState(true);
  const [appAccess, setAppAccess] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FormTab>('osnovno');
  const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);

  const [serviceRows, setServiceRows] = useState<ServiceRateRow[]>([]);
  const [serviceRatesLoading, setServiceRatesLoading] = useState(false);
  const [serviceRatesSaving, setServiceRatesSaving] = useState(false);
  const [copySourceEmployeeId, setCopySourceEmployeeId] = useState('');
  const [copyingServiceRates, setCopyingServiceRates] = useState(false);
  const [copyCandidates, setCopyCandidates] = useState<Array<{ id: string; name: string }>>([]);

  const canManageServiceRates = useMemo(
    () => currentUserRoles.includes('ADMIN') || currentUserRoles.includes('FINANCE'),
    [currentUserRoles]
  );

  useEffect(() => {
    if (initialData) {
      setName(initialData.name ?? '');
      setCompany(initialData.company ?? '');
      setPhone(initialData.phone ?? '');
      setEmail(initialData.email ?? '');
      setAddress(initialData.address ?? '');
      setEmploymentStartDate(initialData.employmentStartDate ? initialData.employmentStartDate.slice(0, 10) : '');
      setContractType(initialData.contractType ?? '');
      setShirtSize(initialData.shirtSize ?? '');
      setShoeSize(initialData.shoeSize !== null && initialData.shoeSize !== undefined ? String(initialData.shoeSize) : '');
      setNotes(initialData.notes ?? '');
      setHourRateWithoutVat(String(initialData.hourRateWithoutVat ?? 0));
      setActive(initialData.active ?? true);
      setAppAccess(initialData.appAccess !== false);
      setRoles(initialData.roles ?? []);
      setError(null);
    } else {
      setName('');
      setCompany('');
      setPhone('');
      setEmail('');
      setAddress('');
      setEmploymentStartDate('');
      setContractType('');
      setShirtSize('');
      setShoeSize('');
      setNotes('');
      setHourRateWithoutVat('0');
      setActive(true);
      setAppAccess(true);
      setRoles([]);
      setError(null);
    }
    setActiveTab('osnovno');
    setServiceRows([]);
    setCopySourceEmployeeId('');
  }, [initialData, open]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    const loadUserRoles = async () => {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        const me = await parseEnvelope<AuthMePayload>(response);
        if (!mounted) return;
        setCurrentUserRoles(me.roles ?? me.employee?.roles ?? []);
      } catch {
        if (!mounted) return;
        setCurrentUserRoles([]);
      }
    };

    loadUserRoles();
    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !initialData?.id || !canManageServiceRates) return;
    let mounted = true;

    const loadServiceRates = async () => {
      setServiceRatesLoading(true);
      try {
        const [productsResponse, ratesResponse, employeesResponse] = await Promise.all([
          fetch('/api/cenik/products', { credentials: 'include' }),
          fetch(`/api/employee-profiles/${initialData.id}/service-rates`, { credentials: 'include' }),
          fetch('/api/employees', { credentials: 'include' }),
        ]);

        const products = await parseEnvelope<CenikProduct[]>(productsResponse);
        const rates = await parseEnvelope<EmployeeServiceRate[]>(ratesResponse);
        const employees = await parseEnvelope<Employee[]>(employeesResponse);

        if (!mounted) return;

        const rateByProductId = new Map<string, EmployeeServiceRate>();
        rates.forEach((rate) => {
          rateByProductId.set(rate.serviceProductId, rate);
        });

        const rows = products
          .filter((product) => product.isService)
          .sort((a, b) => a.name.localeCompare(b.name, 'sl', { sensitivity: 'base' }))
          .map((product) => {
            const existingRate = rateByProductId.get(product._id);
            return {
              productId: product._id,
              productName: product.name,
              defaultPercent: String(existingRate?.defaultPercent ?? 0),
              overridePrice:
                existingRate?.overridePrice === null || existingRate?.overridePrice === undefined
                  ? ''
                  : String(existingRate.overridePrice),
              isActive: existingRate?.isActive ?? true,
            } satisfies ServiceRateRow;
          });

        setServiceRows(rows);
        setCopyCandidates(
          employees
            .filter((employee) => employee.id !== initialData.id)
            .map((employee) => ({ id: employee.id, name: employee.name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'sl', { sensitivity: 'base' }))
        );
      } catch (fetchError) {
        toast.error(fetchError instanceof Error ? fetchError.message : 'Napaka pri nalaganju cenika storitev.');
      } finally {
        if (mounted) {
          setServiceRatesLoading(false);
        }
      }
    };

    loadServiceRates();
    return () => {
      mounted = false;
    };
  }, [canManageServiceRates, initialData?.id, open]);

  const toggleRole = (role: string) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role]));
  };

  const updateServiceRow = (productId: string, patch: Partial<ServiceRateRow>) => {
    setServiceRows((prev) => prev.map((row) => (row.productId === productId ? { ...row, ...patch } : row)));
  };

  const handleSaveServiceRates = async () => {
    if (!initialData?.id || !canManageServiceRates) return;

    const ratesPayload = serviceRows.map((row) => {
      const defaultPercent = Number(row.defaultPercent);
      const parsedOverride = row.overridePrice.trim() ? Number(row.overridePrice) : null;
      if (!Number.isFinite(defaultPercent) || defaultPercent < 0 || defaultPercent > 100) {
        throw new Error(`Neveljaven % za storitev "${row.productName}".`);
      }
      if (parsedOverride !== null && (!Number.isFinite(parsedOverride) || parsedOverride < 0)) {
        throw new Error(`Neveljavna override cena za storitev "${row.productName}".`);
      }

      return {
        serviceProductId: row.productId,
        defaultPercent,
        overridePrice: parsedOverride,
        isActive: row.isActive,
      };
    });

    setServiceRatesSaving(true);
    try {
      const response = await fetch(`/api/employee-profiles/${initialData.id}/service-rates`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rates: ratesPayload }),
      });
      await parseEnvelope<EmployeeServiceRate[]>(response);
      toast.success('Cenik storitev je shranjen.');
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Shranjevanje cenika ni uspelo.');
    } finally {
      setServiceRatesSaving(false);
    }
  };

  const handleCopyServiceRates = async () => {
    if (!initialData?.id || !copySourceEmployeeId) return;

    setCopyingServiceRates(true);
    try {
      const response = await fetch(
        `/api/employee-profiles/${initialData.id}/service-rates/copy-from/${copySourceEmployeeId}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const copiedRates = await parseEnvelope<EmployeeServiceRate[]>(response);
      const copiedMap = new Map<string, EmployeeServiceRate>();
      copiedRates.forEach((rate) => {
        copiedMap.set(rate.serviceProductId, rate);
      });

      setServiceRows((prev) =>
        prev.map((row) => {
          const copied = copiedMap.get(row.productId);
          if (!copied) return row;
          return {
            ...row,
            defaultPercent: String(copied.defaultPercent ?? 0),
            overridePrice:
              copied.overridePrice === null || copied.overridePrice === undefined ? '' : String(copied.overridePrice),
            isActive: copied.isActive ?? true,
          };
        })
      );

      toast.success('Cenik storitev je kopiran.');
    } catch (copyError) {
      toast.error(copyError instanceof Error ? copyError.message : 'Kopiranje cenika ni uspelo.');
    } finally {
      setCopyingServiceRates(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const parsedRate = Number(hourRateWithoutVat);
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = address.trim();
    const trimmedNotes = notes.trim();
    const parsedShoeSize = shoeSize.trim() ? Number(shoeSize) : null;
    if (!trimmedName) {
      setError('Ime zaposlenega je obvezno.');
      return;
    }
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      setError('Urna postavka mora biti nenegativna.');
      return;
    }
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      setError('Email ni veljaven.');
      return;
    }
    if (shoeSize.trim() && !Number.isFinite(parsedShoeSize)) {
      setError('Stevilka cevljev ni veljavna.');
      return;
    }

    await onSubmit({
      name: trimmedName,
      company: company.trim(),
      phone: trimmedPhone || undefined,
      email: trimmedEmail || undefined,
      roles,
      address: trimmedAddress || undefined,
      employmentStartDate: employmentStartDate ? employmentStartDate : null,
      contractType: contractType || null,
      shirtSize: shirtSize || null,
      shoeSize: parsedShoeSize,
      notes: trimmedNotes || undefined,
      hourRateWithoutVat: parsedRate,
      active,
      appAccess,
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
            <Dialog.Close className="text-slate-500 hover:text-slate-700">X</Dialog.Close>
          </div>

          <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab('osnovno')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                activeTab === 'osnovno' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Osnovni podatki
            </button>
            {canManageServiceRates && initialData?.id ? (
              <button
                type="button"
                onClick={() => setActiveTab('cenik')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  activeTab === 'cenik' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cenik storitev
              </button>
            ) : null}
          </div>

          {activeTab === 'osnovno' ? (
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
                  Podjetje / Zunanji izvajalec
                </label>
                <input
                  id="company"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="phone">
                    Telefon
                  </label>
                  <input
                    id="phone"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
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
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="address">
                  Naslov
                </label>
                <input
                  id="address"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="employmentStartDate">
                    Datum zaposlitve
                  </label>
                  <input
                    id="employmentStartDate"
                    type="date"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={employmentStartDate}
                    onChange={(event) => setEmploymentStartDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="contractType">
                    Vrsta pogodbe
                  </label>
                  <select
                    id="contractType"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={contractType}
                    onChange={(event) => setContractType(event.target.value)}
                  >
                    <option value="">-</option>
                    {contractTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="shirtSize">
                    Velikost majice
                  </label>
                  <select
                    id="shirtSize"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={shirtSize}
                    onChange={(event) => setShirtSize(event.target.value)}
                  >
                    <option value="">-</option>
                    {shirtSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="shoeSize">
                    Stevilka cevljev
                  </label>
                  <input
                    id="shoeSize"
                    type="number"
                    min={0}
                    step="0.5"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={shoeSize}
                    onChange={(event) => setShoeSize(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="notes">
                  Opombe
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
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

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Vloge</p>
                  <p className="text-xs text-slate-500">Dostopne vloge za zaposlenega.</p>
                </div>
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

              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={appAccess}
                  onChange={(event) => setAppAccess(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                Dostop do aplikacije
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
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="hourRateWithoutVatServiceTab">
                    Urna postavka (brez DDV)
                  </label>
                  <input
                    id="hourRateWithoutVatServiceTab"
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={hourRateWithoutVat}
                    onChange={(event) => setHourRateWithoutVat(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="copySourceEmployeeId">
                    Kopiraj od zaposlenega
                  </label>
                  <select
                    id="copySourceEmployeeId"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={copySourceEmployeeId}
                    onChange={(event) => setCopySourceEmployeeId(event.target.value)}
                  >
                    <option value="">Izberi zaposlenega</option>
                    {copyCandidates.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleCopyServiceRates}
                  disabled={!copySourceEmployeeId || copyingServiceRates}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copyingServiceRates ? 'Kopiram...' : 'Kopiraj od zaposlenega'}
                </button>
              </div>

              {serviceRatesLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  Nalagam cenik storitev...
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2">Storitev</th>
                        <th className="border-b border-slate-200 px-3 py-2">defaultPercent (%)</th>
                        <th className="border-b border-slate-200 px-3 py-2">overridePrice (€)</th>
                        <th className="border-b border-slate-200 px-3 py-2">Aktivno</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceRows.map((row) => (
                        <tr key={row.productId} className="odd:bg-white even:bg-slate-50/40">
                          <td className="border-b border-slate-100 px-3 py-2 text-slate-900">{row.productName}</td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              className="w-32 rounded-lg border border-slate-200 px-2 py-1"
                              value={row.defaultPercent}
                              onChange={(event) => updateServiceRow(row.productId, { defaultPercent: event.target.value })}
                            />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-32 rounded-lg border border-slate-200 px-2 py-1"
                              value={row.overridePrice}
                              onChange={(event) => updateServiceRow(row.productId, { overridePrice: event.target.value })}
                              placeholder="Prazno = %"
                            />
                          </td>
                          <td className="border-b border-slate-100 px-3 py-2">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={row.isActive}
                                onChange={(event) => updateServiceRow(row.productId, { isActive: event.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                              />
                              <span className="text-xs text-slate-600">Aktivno</span>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveServiceRates}
                  disabled={serviceRatesSaving || serviceRatesLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {serviceRatesSaving ? 'Shranjujem...' : 'Shrani cenik'}
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
