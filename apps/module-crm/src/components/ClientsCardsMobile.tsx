import React from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@aintel/ui';
import { Client } from '../types/client';

interface ClientsCardsMobileProps {
  clients: Client[];
  onEdit: (client: Client) => void;
}

function buildAddress(client: Client) {
  const street = client.street?.trim() || client.address?.trim() || '';
  const postal = client.postalCode?.trim() || '';
  const city = client.postalCity?.trim() || '';
  const locality = [postal, city].filter(Boolean).join(' ');
  return [street, locality].filter(Boolean).join(', ');
}

export function ClientsCardsMobile({ clients, onEdit }: ClientsCardsMobileProps) {
  return (
    <div className="crm-clients-mobile">
      {clients.map((client) => {
        const address = buildAddress(client);
        return (
          <article
            key={client.id}
            className="crm-client-card"
            onClick={() => onEdit(client)}
          >
            <div className="crm-client-card__head">
              <div className="crm-client-card__identity">
                <h3 className="crm-client-card__title">
                  {client.name}
                  {!client.isComplete && <span className="crm-name-alert">!</span>}
                </h3>
                <div className="crm-client-card__badges">
                  <span className="crm-client-card__badge">
                    {client.type === 'company' ? 'Podjetje' : 'Fizična oseba'}
                  </span>
                  {!client.isComplete ? <span className="crm-client-card__badge crm-client-card__badge--warn">Nepopolna</span> : null}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="crm-client-card__action"
                onClick={(event: React.MouseEvent) => {
                  event.stopPropagation();
                  onEdit(client);
                }}
              >
                <Pencil size={14} />
                Uredi
              </Button>
            </div>

            <div className="crm-client-card__body">
              {client.contactPerson ? (
                <div className="crm-client-card__row">
                  <span className="crm-client-card__label">Kontakt</span>
                  <span className="crm-client-card__value">{client.contactPerson}</span>
                </div>
              ) : null}
              {client.phone ? (
                <div className="crm-client-card__row">
                  <span className="crm-client-card__label">Telefon</span>
                  <span className="crm-client-card__value">{client.phone}</span>
                </div>
              ) : null}
              {client.email ? (
                <div className="crm-client-card__row">
                  <span className="crm-client-card__label">E-pošta</span>
                  <span className="crm-client-card__value crm-client-card__value--truncate">{client.email}</span>
                </div>
              ) : null}
              {address ? (
                <div className="crm-client-card__row">
                  <span className="crm-client-card__label">Naslov</span>
                  <span className="crm-client-card__value">{address}</span>
                </div>
              ) : null}
              {client.tags.length > 0 ? (
                <div className="crm-client-card__tags">
                  {client.tags.map((tag) => (
                    <span key={`${client.id}-${tag}`} className="crm-client-card__tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
