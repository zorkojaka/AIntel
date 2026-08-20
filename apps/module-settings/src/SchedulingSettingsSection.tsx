import type { FormEvent } from 'react';
import { Button, Card, Input } from '@aintel/ui';
import type { SettingsDto } from './types';

interface SchedulingSettingsSectionProps {
  value: SettingsDto['scheduling'];
  onChange: (value: SettingsDto['scheduling']) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  loading: boolean;
}

export function SchedulingSettingsSection({
  value,
  onChange,
  onSubmit,
  saving,
  loading,
}: SchedulingSettingsSectionProps) {
  const updateNumber = (field: 'minimumLeadDays' | 'maximumAdvanceDays', rawValue: string) => {
    const parsed = Number(rawValue);
    onChange({
      ...value,
      [field]: Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0,
    });
  };

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <Card title="Obdobje izbire terminov">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Skrij termine prvih nekaj dni"
            type="number"
            min={0}
            max={365}
            value={value.minimumLeadDays}
            onChange={(event) => updateNumber('minimumLeadDays', event.target.value)}
          />
          <Input
            label="Prikaži termine največ toliko dni vnaprej"
            type="number"
            min={value.minimumLeadDays}
            max={3650}
            value={value.maximumAdvanceDays}
            onChange={(event) => updateNumber('maximumAdvanceDays', event.target.value)}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Vrednost 3 pri prvi nastavitvi skrije danes, jutri in pojutrišnjem. Prvi možni termin je tretji dan od danes.
        </p>
      </Card>

      <Card title="Prikaz stranki">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={value.showDurationToCustomer}
            onChange={(event) => onChange({ ...value, showDurationToCustomer: event.target.checked })}
            className="mt-1 h-4 w-4 rounded border border-border bg-card focus-visible:ring-2 focus-visible:ring-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">Prikaži oceno trajanja izvedbe stranki</span>
            <span className="block text-sm text-muted-foreground">
              Če je izklopljeno, ocena ni prikazana v pogledu za potrditev delovnega naloga.
            </span>
          </span>
        </label>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={loading || saving}>
          {saving ? 'Shranjujem ...' : 'Shrani nastavitve terminov'}
        </Button>
      </div>
    </form>
  );
}
