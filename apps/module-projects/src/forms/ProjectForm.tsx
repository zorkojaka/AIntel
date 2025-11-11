import React, { useState } from 'react';
import { Button, Input, Select, Textarea, DateInput } from '@aintel/ui';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface CompanyOption {
  _id: string;
  name: string;
}

interface ContactOption {
  _id: string;
  first_name?: string;
  last_name?: string;
}

interface ProjectFormProps {
  companies: CompanyOption[];
  contacts: ContactOption[];
  onSuccess: () => void;
}

export const ProjectForm: React.FC<ProjectFormProps> = ({ companies, contacts, onSuccess }) => {
  const [form, setForm] = useState({
    name: '',
    city: '',
    description: '',
    startDate: '',
    endDate: '',
    company_id: '',
    contact_id: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name || !form.company_id || !form.contact_id) {
      setMessage({ type: 'error', text: 'Naziv, stranka in kontaktna oseba so obvezni.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    const notes =
      form.notes
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean) ?? [];

    try {
      const response = await fetch(`${API_URL}/projekti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          city: form.city,
          startDate: form.startDate,
          endDate: form.endDate,
          company_id: form.company_id,
          contact_id: form.contact_id,
          notes
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload?.error ?? 'Napaka pri ustvarjanju projekta.');
      }

      setForm({
        name: '',
        city: '',
        description: '',
        startDate: '',
        endDate: '',
        company_id: '',
        contact_id: '',
        notes: ''
      });
      setMessage({ type: 'success', text: 'Projekt je bil ustvarjen.' });
      onSuccess();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="project-form" onSubmit={handleSubmit}>
      <Input
        label="Naziv projekta"
        value={form.name}
        onChange={(event) => handleChange('name', event.target.value)}
      />
      <Input
        label="Kraj projekta"
        value={form.city}
        onChange={(event) => handleChange('city', event.target.value)}
      />
      <Textarea
        label="Opis"
        value={form.description}
        onChange={(event) => handleChange('description', event.target.value)}
        placeholder="Dodajte osnovne informacije o projektu..."
      />
      <DateInput
        label="Začetni datum"
        value={form.startDate}
        onChange={(event) => handleChange('startDate', event.target.value)}
      />
      <DateInput
        label="Predvideni zaključek"
        value={form.endDate}
        onChange={(event) => handleChange('endDate', event.target.value)}
      />
      <Select
        label="Stranka"
        value={form.company_id}
        onChange={(event) => handleChange('company_id', event.target.value)}
      >
        <option value="">Izberi stranko</option>
        {companies.map((company) => (
          <option key={company._id} value={company._id}>
            {company.name}
          </option>
        ))}
      </Select>
      <Select
        label="Kontaktna oseba"
        value={form.contact_id}
        onChange={(event) => handleChange('contact_id', event.target.value)}
      >
        <option value="">Izberi kontakt</option>
        {contacts.map((contact) => (
          <option key={contact._id} value={contact._id}>
            {`${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()}
          </option>
        ))}
      </Select>
      <Textarea
        label="Opombe"
        value={form.notes}
        onChange={(event) => handleChange('notes', event.target.value)}
        placeholder="Dodajte dodatne opombe (ločene z novo vrstico)"
      />
      <div className="project-form__actions">
        <Button type="submit" disabled={saving}>
          {saving ? 'Shranjujem...' : 'Ustvari projekt'}
        </Button>
      </div>
      {message && (
        <p className={`project-form__message project-form__message--${message.type}`}>
          {message.text}
        </p>
      )}
    </form>
  );
};
