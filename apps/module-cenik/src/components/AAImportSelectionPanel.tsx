import { useState } from 'react';

export const AA_IMPORT_FIELD_GROUPS = [
  { id: 'prices', label: 'Cene', description: 'nabavna in prodajna cena', fields: ['purchasePriceWithoutVat', 'nabavnaCena', 'prodajnaCena'] },
  { id: 'content', label: 'Naziv in opisi', description: 'lahko prepiše prilagojeno vsebino', fields: ['ime', 'kratekOpis', 'dolgOpis'] },
  { id: 'image', label: 'Slika', description: 'slika iz AA', fields: ['povezavaDoSlike'] },
  { id: 'categories', label: 'Kategorije', description: 'AA kategorije in klasifikacija', fields: ['kategorija', 'categorySlugs', 'classification'] },
  { id: 'supplier', label: 'Dobavitelj', description: 'proizvajalec, dobavitelj in povezava', fields: ['povezavaDoProdukta', 'proizvajalec', 'dobavitelj', 'naslovDobavitelja'] },
  { id: 'technical', label: 'AA tehnični podatki', description: 'zaloga, atributi in surov AA opis', fields: ['aaData'] },
] as const;

export type AAImportField = (typeof AA_IMPORT_FIELD_GROUPS)[number]['fields'][number];
export type AAImportMode = 'new_only' | 'new_and_existing';

type CreateRow = { externalKey: string; sourceRecordId: string; ime: string };
type UpdateRow = CreateRow & {
  changedFields: string[];
  changes?: Array<{ field: string; currentValue: unknown; incomingValue: unknown }>;
};

type Props = {
  toCreate: CreateRow[];
  toUpdate: UpdateRow[];
  mode: AAImportMode;
  onModeChange: (mode: AAImportMode) => void;
  createFields: Set<AAImportField>;
  updateFields: Set<AAImportField>;
  onCreateFieldsChange: (fields: Set<AAImportField>) => void;
  onUpdateFieldsChange: (fields: Set<AAImportField>) => void;
  selectedCreateKeys: Set<string>;
  selectedUpdateKeys: Set<string>;
  onSelectedCreateKeysChange: (keys: Set<string>) => void;
  onSelectedUpdateKeysChange: (keys: Set<string>) => void;
};

const FIELD_LABELS: Record<string, string> = {
  ime: 'Naziv',
  purchasePriceWithoutVat: 'Nabavna cena brez DDV',
  nabavnaCena: 'Nabavna cena',
  prodajnaCena: 'Prodajna cena',
  kratekOpis: 'Kratek opis',
  dolgOpis: 'Dolg opis',
  povezavaDoSlike: 'Slika',
  povezavaDoProdukta: 'Povezava do AA',
  kategorija: 'Glavna kategorija',
  categorySlugs: 'Kategorije',
  proizvajalec: 'Proizvajalec',
  dobavitelj: 'Dobavitelj',
  naslovDobavitelja: 'Naslov dobavitelja',
  aaData: 'AA tehnični podatki',
  classification: 'Klasifikacija',
};

function toggleKeys(current: Set<string>, key: string, checked: boolean) {
  const next = new Set(current);
  if (checked) next.add(key);
  else next.delete(key);
  return next;
}

function toggleGroup(current: Set<AAImportField>, fields: readonly AAImportField[], checked: boolean) {
  const next = new Set(current);
  fields.forEach((field) => checked ? next.add(field) : next.delete(field));
  return next;
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('sl-SI');
  if (typeof value === 'string') return value.length > 180 ? `${value.slice(0, 180)}…` : value;
  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function FieldGroups({ value, onChange, protectWarning }: { value: Set<AAImportField>; onChange: (value: Set<AAImportField>) => void; protectWarning?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {AA_IMPORT_FIELD_GROUPS.map((group) => {
        const checked = group.fields.every((field) => value.has(field));
        return (
          <label key={group.id} className={`flex cursor-pointer gap-2 rounded border p-3 ${checked ? 'border-primary bg-primary/5' : 'border-border/70 bg-background'}`}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => onChange(toggleGroup(value, group.fields, event.target.checked))}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-medium">{group.label}</span>
              <span className={`block text-xs ${protectWarning && group.id === 'content' ? 'text-amber-700' : 'text-muted-foreground'}`}>
                {group.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function AAImportSelectionPanel(props: Props) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase('sl');
  const creates = props.toCreate.filter((row) => !query || row.ime.toLocaleLowerCase('sl').includes(query) || row.sourceRecordId.includes(query));
  const selectedUpdateFields = new Set<string>(props.updateFields);
  const eligibleUpdates = props.toUpdate.filter((row) => row.changedFields.some((field) => selectedUpdateFields.has(field)));
  const updates = eligibleUpdates.filter((row) => !query || row.ime.toLocaleLowerCase('sl').includes(query) || row.sourceRecordId.includes(query));
  const selectedEligibleUpdateCount = eligibleUpdates.filter((row) => props.selectedUpdateKeys.has(row.externalKey)).length;

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-sm font-semibold">1. Kaj želiš uvoziti?</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => props.onModeChange('new_only')} className={`rounded border p-3 text-left ${props.mode === 'new_only' ? 'border-primary bg-primary/10' : 'border-border/70'}`}>
            <span className="block font-medium">Samo novi produkti</span>
            <span className="text-xs text-muted-foreground">Obstoječi produkti ostanejo popolnoma nespremenjeni.</span>
          </button>
          <button type="button" onClick={() => props.onModeChange('new_and_existing')} className={`rounded border p-3 text-left ${props.mode === 'new_and_existing' ? 'border-primary bg-primary/10' : 'border-border/70'}`}>
            <span className="block font-medium">Novi in obstoječi produkti</span>
            <span className="text-xs text-muted-foreground">Pri obstoječih izbereš produkte in polja za posodobitev.</span>
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">2. Podatki za nove produkte</div>
        <FieldGroups value={props.createFields} onChange={props.onCreateFieldsChange} />
        <p className="mt-2 text-xs text-muted-foreground">AA ID, naziv, osnovne cene, kategorija in dobavitelj se pri novem produktu vedno shranijo, ker so potrebni za veljaven produkt.</p>
      </div>

      {props.mode === 'new_and_existing' && (
        <div>
          <div className="mb-2 text-sm font-semibold">3. Polja za obstoječe produkte</div>
          <FieldGroups value={props.updateFields} onChange={props.onUpdateFieldsChange} protectWarning />
          <p className="mt-2 text-xs text-amber-700">Naziv in opise označi samo, če želiš zamenjati vaše prilagojene vsebine z AA vsebinami.</p>
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">{props.mode === 'new_only' ? '3' : '4'}. Izberi produkte</div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Išči po nazivu ali AA ID" className="h-9 min-w-64 rounded border border-border bg-background px-3 text-sm" />
        </div>

        <div className="space-y-3">
          <div className="rounded border border-border/70 bg-background">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={props.toCreate.length > 0 && props.toCreate.every((row) => props.selectedCreateKeys.has(row.externalKey))} onChange={(event) => props.onSelectedCreateKeysChange(event.target.checked ? new Set(props.toCreate.map((row) => row.externalKey)) : new Set())} />
                Novi produkti ({props.selectedCreateKeys.size}/{props.toCreate.length})
              </label>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {creates.map((row) => (
                <label key={row.externalKey} className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-sm last:border-0">
                  <input type="checkbox" checked={props.selectedCreateKeys.has(row.externalKey)} onChange={(event) => props.onSelectedCreateKeysChange(toggleKeys(props.selectedCreateKeys, row.externalKey, event.target.checked))} />
                  <span className="min-w-0 flex-1 truncate">{row.ime}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">AA ID {row.sourceRecordId}</span>
                </label>
              ))}
              {creates.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground">Ni novih produktov.</div>}
            </div>
          </div>

          {props.mode === 'new_and_existing' && (
            <div className="rounded border border-border/70 bg-background">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={eligibleUpdates.length > 0 && eligibleUpdates.every((row) => props.selectedUpdateKeys.has(row.externalKey))} onChange={(event) => props.onSelectedUpdateKeysChange(event.target.checked ? new Set(eligibleUpdates.map((row) => row.externalKey)) : new Set())} />
                  Obstoječi produkti z izbranimi spremembami ({selectedEligibleUpdateCount}/{eligibleUpdates.length})
                </label>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {updates.map((row) => {
                  const relevantChanges = (row.changes ?? []).filter((change) => selectedUpdateFields.has(change.field));
                  return (
                    <div key={row.externalKey} className="border-b border-border/50 px-3 py-2 last:border-0">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={props.selectedUpdateKeys.has(row.externalKey)} onChange={(event) => props.onSelectedUpdateKeysChange(toggleKeys(props.selectedUpdateKeys, row.externalKey, event.target.checked))} />
                        <span className="min-w-0 flex-1 truncate">{row.ime}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">AA ID {row.sourceRecordId}</span>
                      </label>
                      <details className="ml-6 mt-1 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Prikaži spremembe ({relevantChanges.length})</summary>
                        <div className="mt-2 space-y-2">
                          {relevantChanges.map((change) => (
                            <div key={change.field} className="grid gap-1 rounded bg-muted/50 p-2 sm:grid-cols-[8rem_1fr_1fr]">
                              <span className="font-medium">{FIELD_LABELS[change.field] ?? change.field}</span>
                              <span><span className="text-muted-foreground">Trenutno: </span>{formatValue(change.currentValue)}</span>
                              <span><span className="text-muted-foreground">AA: </span>{formatValue(change.incomingValue)}</span>
                            </div>
                          ))}
                          {relevantChanges.length === 0 && <div className="text-muted-foreground">Za izbrana polja ni sprememb.</div>}
                        </div>
                      </details>
                    </div>
                  );
                })}
                {updates.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground">Ni produktov za posodobitev.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
