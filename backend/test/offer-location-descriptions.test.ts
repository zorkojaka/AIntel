import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProductDescriptionsHtml } from '../modules/projects/services/document-renderers';

test('description PDF groups equipment and photos under locations', () => {
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

  assert.match(html, /Opisi lokacij/);
  assert.equal((html.match(/class="location-title">Glavni vhod/g) ?? []).length, 1);
  assert.equal((html.match(/data:image\/png;base64,location/g) ?? []).length, 1);
  assert.match(html, /Montaža nad vrati/);
  assert.match(html, /Kamera A/);
  assert.match(html, /Senzor B/);
  assert.ok(html.indexOf('Glavni vhod') < html.indexOf('Kamera A'));
});

test('description PDF identifies entries without a location', () => {
  const html = renderProductDescriptionsHtml([{ title: 'Napajalnik', description: 'Opis napajalnika' }]);

  assert.match(html, /Postavke brez določene lokacije/);
  assert.match(html, /Napajalnik/);
});
