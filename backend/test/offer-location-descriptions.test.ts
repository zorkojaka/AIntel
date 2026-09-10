import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProductDescriptionsHtml } from '../modules/projects/services/document-renderers';
import { buildLocationPhotoFilters } from '../modules/projects/services/offer-description-pdf.service';

test('description PDF presents products first and only assigns their names to locations', () => {
  const html = renderProductDescriptionsHtml([
    {
      title: 'Kamera A',
      description: 'Opis kamere',
      imageUrl: 'data:image/png;base64,device',
      locations: [{ id: 'loc-1', name: 'Glavni vhod', note: 'Montaža nad vrati', photos: ['data:image/png;base64,location'] }],
    },
    {
      title: 'Senzor B',
      description: 'Opis senzorja',
      locations: [{ id: 'loc-1', name: 'Glavni vhod', note: 'Montaža nad vrati', photos: ['data:image/png;base64,location'] }],
    },
  ]);

  assert.match(html, /Produktni opisi/);
  assert.equal((html.match(/class="location-title">Glavni vhod/g) ?? []).length, 1);
  assert.equal((html.match(/data:image\/png;base64,location/g) ?? []).length, 1);
  assert.equal((html.match(/data:image\/png;base64,device/g) ?? []).length, 1);
  assert.equal((html.match(/Opis kamere/g) ?? []).length, 1);
  assert.equal((html.match(/Opis senzorja/g) ?? []).length, 1);
  assert.match(html, /Montaža nad vrati/);
  assert.match(html, /Dodeljene naprave/);
  assert.ok(html.indexOf('Opis kamere') < html.indexOf('Glavni vhod'));
  const locationHtml = html.slice(html.indexOf('class="locations-heading"'));
  assert.doesNotMatch(locationHtml, /Opis kamere|Opis senzorja|data:image\/png;base64,device/);
  assert.match(locationHtml, /<li>Kamera A<\/li>/);
  assert.match(locationHtml, /<li>Senzor B<\/li>/);
});

test('description PDF still presents products without a location', () => {
  const html = renderProductDescriptionsHtml([{ title: 'Napajalnik', description: 'Opis napajalnika' }]);

  assert.match(html, /Napajalnik/);
  assert.match(html, /Opis napajalnika/);
  assert.doesNotMatch(html, /class="locations-heading"/);
});

test('location photos use the same location key from requirements and offer steps', () => {
  const requirementItemId = 'zahteva-location:req-1:sys-1:loc-1';
  const offerLocationId = 'project-location-offer-1';
  const [filter] = buildLocationPhotoFilters('project-object-id', [requirementItemId, offerLocationId, requirementItemId]);

  assert.deepEqual((filter as any).phase.$in, ['requirements', 'offer', 'preparation', 'execution']);
  assert.deepEqual((filter as any).itemId.$in, [requirementItemId, offerLocationId]);
  assert.equal((filter as any).unitIndex, undefined);
});

test('legacy offer location photos still fall back to offer item and unit index', () => {
  const [filter] = buildLocationPhotoFilters('project-object-id', [], { itemId: 'offer-item-1', unitIndex: 2 });

  assert.deepEqual((filter as any).phase.$in, ['requirements', 'offer', 'preparation', 'execution']);
  assert.equal((filter as any).itemId, 'offer-item-1');
  assert.equal((filter as any).unitIndex, 2);
});
