import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProductDescriptionsHtml } from '../modules/projects/services/document-renderers';

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
