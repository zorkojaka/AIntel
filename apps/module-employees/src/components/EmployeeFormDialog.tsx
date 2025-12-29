import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Employee, EmployeePayload } from '../types';
import type { User } from '@aintel/shared/types/user';
import { fetchUsers, getEmployeeUser } from '../api/users';

interface AccessPayload {
  enabled: boolean;
  mode: 'existing' | 'new';
  selectedUserId: string | null;
  roles: string[];
  newUser: {
    email: string;
    roles: string[];
    active: boolean;
  } | null;
  previousUserId: string | null;
}

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EmployeePayload, access: AccessPayload) => Promise<void>;
  initialData?: Employee | null;
  submitting?: boolean;
}

const contractTypeOptions = ['zaposlitvena', 'podjemna', 's.p.', 'student', 'zunanji'] as const;
const shirtSizeOptions = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const;
const roleOptions = ['admin', 'sales', 'ops', 'technician', 'finance', 'manager'] as const;

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
  const [accessEnabled, setAccessEnabled] = useState(false);
  const [accessMode, setAccessMode] = useState<'existing' | 'new'>('existing');
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserActive, setNewUserActive] = useState(true);
  const [initialUserId, setInitialUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
    }
  }, [initialData, open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    if (initialData?.id) {
      getEmployeeUser(initialData.id)
        .then((user) => {
          if (!alive) return;
          const userId = user?.id ?? '';
          setSelectedUserId(userId);
          setInitialUserId(userId || null);
          setAccessEnabled(!!userId);
          setAccessMode('existing');
          setRoles(user?.roles ?? []);
        })
        .catch(() => {
          if (!alive) return;
          setSelectedUserId('');
          setInitialUserId(null);
          setAccessEnabled(false);
          setRoles([]);
        });
    } else {
      setSelectedUserId('');
      setInitialUserId(null);
      setAccessEnabled(false);
      setRoles([]);
    }
    setAccessMode('existing');
    setNewUserEmail('');
    setNewUserActive(true);
    return () => {
      alive = false;
    };
  }, [initialData?.id, open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(() => {
      fetchUsers({ search: userSearch })
        .then((data) => {
          if (!alive) return;
          setUsers(data);
        })
        .catch(() => {
          if (!alive) return;
          setUsers([]);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, userSearch]);

  useEffect(() => {
    if (!selectedUserId) return;
    const selected = users.find((user) => user.id === selectedUserId);
    if (selected?.roles) {
      setRoles(selected.roles);
    }
  }, [selectedUserId, users]);

  const selectedUserLabel = useMemo(() => {
    const match = users.find((user) => user.id === selectedUserId);
    if (!match) return '';
    return match.email ? `${match.name} (${match.email})` : match.name;
  }, [selectedUserId, users]);

  const toggleRole = (role: string) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role]));
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
    if (accessEnabled && accessMode === 'new') {
      const trimmedNewEmail = newUserEmail.trim();
      if (!trimmedNewEmail || !trimmedNewEmail.includes('@')) {
        setError('Email za uporabnika ni veljaven.');
        return;
      }
    }

    await onSubmit(
      {
        name: trimmedName,
        company: company.trim(),
        phone: trimmedPhone || undefined,
        email: trimmedEmail || undefined,
        address: trimmedAddress || undefined,
        employmentStartDate: employmentStartDate ? employmentStartDate : null,
        contractType: contractType || null,
        shirtSize: shirtSize || null,
        shoeSize: parsedShoeSize,
        notes: trimmedNotes || undefined,
        hourRateWithoutVat: parsedRate,
        active,
      },
      {
        enabled: accessEnabled,
        mode: accessMode,
        selectedUserId: selectedUserId || null,
        roles,
        newUser: accessEnabled && accessMode === 'new'
          ? { email: newUserEmail.trim(), roles, active: newUserActive }
          : null,
        previousUserId: initialUserId,
      }
    );
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Access & Roles</p>
                  <p className="text-xs text-slate-500">Upravljanje dostopa do aplikacije.</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={accessEnabled}
                    onChange={(event) => setAccessEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  Ima dostop
                </label>
              </div>

              {accessEnabled ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={accessMode === 'existing'}
                        onChange={() => setAccessMode('existing')}
                        className="h-4 w-4 border-slate-300 text-primary focus:ring-primary"
                      />
                      Povezi obstojecega uporabnika
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={accessMode === 'new'}
                        onChange={() => setAccessMode('new')}
                        className="h-4 w-4 border-slate-300 text-primary focus:ring-primary"
                      />
                      Ustvari novega uporabnika
                    </label>
                  </div>

                  {accessMode === 'existing' ? (
                    <div className="space-y-2">
                      <input
                        placeholder="Isci uporabnika..."
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                      />
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        value={selectedUserId}
                        onChange={(event) => setSelectedUserId(event.target.value)}
                      >
                        <option value="">Izberi uporabnika</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} {user.email ? `(${user.email})` : ''}
                          </option>
                        ))}
                      </select>
                      {selectedUserLabel ? <p className="text-xs text-slate-500">Izbran: {selectedUserLabel}</p> : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        placeholder="Email uporabnika"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        value={newUserEmail}
                        onChange={(event) => setNewUserEmail(event.target.value)}
                      />
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={newUserActive}
                          onChange={(event) => setNewUserActive(event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        Aktiven uporabnik
                      </label>
                    </div>
                  )}

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
                </div>
              ) : null}
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
