import React, { useState } from 'react';
import { Button, Card, DataTable, Input } from '@aintel/ui';
import { tokens } from '@aintel/theme';
import './styles.css';

interface Person {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
}

interface Company {
  name: string;
  vatId: string;
  address: string;
}

const initialPeople: Person[] = [
  { firstName: 'Ana', lastName: 'Mrak', email: 'ana@example.com', company: 'Inteligent' },
  { firstName: 'Marko', lastName: 'Kovač', email: 'marko@example.com', company: 'AI Lab' }
];

const initialCompanies: Company[] = [
  { name: 'Inteligent d.o.o.', vatId: 'SI12345678', address: 'Kotnikova 12, Ljubljana' },
  { name: 'AI Lab', vatId: 'SI87654321', address: 'Trg Osvobodilne fronte 9, Maribor' }
];

export const CRMPage: React.FC = () => {
  const [people, setPeople] = useState(initialPeople);
  const [companies, setCompanies] = useState(initialCompanies);
  const [personForm, setPersonForm] = useState({ firstName: '', lastName: '', email: '', company: '' });
  const [companyForm, setCompanyForm] = useState({ name: '', vatId: '', address: '' });

  const handlePersonSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!personForm.firstName || !personForm.lastName) return;
    setPeople((prev) => [...prev, { ...personForm }]);
    setPersonForm({ firstName: '', lastName: '', email: '', company: '' });
  };

  const handleCompanySubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!companyForm.name) return;
    setCompanies((prev) => [...prev, { ...companyForm }]);
    setCompanyForm({ name: '', vatId: '', address: '' });
  };

  return (
    <section className="crm-page">
      <header>
        <h1 style={{ color: tokens.colors.primary }}>CRM modul</h1>
        <p>
          Osnovni CRM UI uporablja skupne tokene (barve, razmiki) iz `@aintel/theme` in komponente iz
          `@aintel/ui`. Vsebuje sezname kontaktov, podjetij in obrazce za ustvarjanje novih vnosev.
        </p>
      </header>

      <div className="crm-page__grid">
        <Card title="Kontakti (osebe)">
          <DataTable
            columns={[
              { header: 'Ime', accessor: (row: Person) => `${row.firstName} ${row.lastName}` },
              { header: 'Email', accessor: 'email' },
              { header: 'Podjetje', accessor: 'company' }
            ]}
            data={people}
          />
        </Card>

        <Card title="Podjetja">
          <DataTable
            columns={[
              { header: 'Naziv', accessor: 'name' },
              { header: 'DDV', accessor: 'vatId' },
              { header: 'Naslov', accessor: 'address' }
            ]}
            data={companies}
          />
        </Card>
      </div>

      <div className="crm-page__grid">
        <Card title="Dodaj kontakt">
          <form className="crm-form" onSubmit={handlePersonSubmit}>
            <Input
              label="Ime"
              value={personForm.firstName}
              onChange={(event) => setPersonForm({ ...personForm, firstName: event.target.value })}
            />
            <Input
              label="Priimek"
              value={personForm.lastName}
              onChange={(event) => setPersonForm({ ...personForm, lastName: event.target.value })}
            />
            <Input
              label="Email"
              value={personForm.email}
              onChange={(event) => setPersonForm({ ...personForm, email: event.target.value })}
            />
            <Input
              label="Podjetje"
              placeholder="Poveži s podjetjem"
              value={personForm.company}
              onChange={(event) => setPersonForm({ ...personForm, company: event.target.value })}
            />
            <Button type="submit">Shrani kontakt</Button>
          </form>
        </Card>

        <Card title="Dodaj podjetje">
          <form className="crm-form" onSubmit={handleCompanySubmit}>
            <Input
              label="Naziv"
              value={companyForm.name}
              onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })}
            />
            <Input
              label="DDV"
              value={companyForm.vatId}
              onChange={(event) => setCompanyForm({ ...companyForm, vatId: event.target.value })}
            />
            <Input
              label="Naslov"
              value={companyForm.address}
              onChange={(event) => setCompanyForm({ ...companyForm, address: event.target.value })}
            />
            <Button variant="ghost" type="submit">
              Dodaj podjetje
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
};
