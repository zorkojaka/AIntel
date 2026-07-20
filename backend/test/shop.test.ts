import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildProductPayload, curateSolutions, textToHtml, mapSolutions, normalizeBrand } from '../modules/shop/woocommerce-sync.service';

describe('shop woocommerce sync', () => {
  it('textToHtml pretvori golo besedilo v odstavke in ubeži HTML', () => {
    assert.equal(textToHtml(''), '');
    assert.equal(textToHtml('Ena vrstica'), '<p>Ena vrstica</p>');
    assert.equal(
      textToHtml('Prvi odstavek\nz novo vrstico\n\nDrugi <b>odstavek</b>'),
      '<p>Prvi odstavek<br>z novo vrstico</p>\n<p>Drugi &lt;b&gt;odstavek&lt;/b&gt;</p>',
    );
  });

  it('buildProductPayload sestavi WooCommerce polja iz cenika', () => {
    const product: Record<string, unknown> = {
      _id: 'abc123',
      ime: 'Testna kamera',
      prodajnaCena: 99.9,
      kratekOpis: 'Kratek opis',
      dolgOpis: 'Dolg opis',
      povezavaDoSlike: 'https://example.com/slika.jpg',
      merchandising: { featured: true },
      categorySlugs: ['kamera', 'ip-kamera'],
      proizvajalec: 'HIKVISION',
    };
    const payload = buildProductPayload(product, 'testna-kamera', 3);
    assert.equal(payload.sku, 'aintel-abc123');
    assert.equal(payload.slug, 'testna-kamera');
    assert.equal(payload.name, 'Testna kamera');
    assert.equal(payload.regularPrice, '99.90');
    assert.equal(payload.shortDescription, '<p>Kratek opis</p>');
    assert.equal(payload.description, '<p>Dolg opis</p>');
    assert.equal(payload.imageSrc, 'https://example.com/slika.jpg');
    assert.equal(payload.featured, true);
    assert.equal(payload.menuOrder, 3);
    // rešitev (videonadzor) + proizvajalec (hikvision)
    assert.deepEqual(payload.categoryKeys, ['videonadzor', 'hikvision']);
  });

  it('mapSolutions preslika categorySlugs v rešitve strani', () => {
    assert.deepEqual(mapSolutions(['ip-kamera']), ['videonadzor']);
    assert.deepEqual(mapSolutions(['alarm-komponenta']), ['alarm']);
    assert.deepEqual(mapSolutions(['domofoni-in-video-domofoni']), ['domofon']);
    assert.deepEqual(mapSolutions(['blebox', 'wifi-krmilniki']), ['pametni-dom']);
    assert.deepEqual(mapSolutions(['neznano-nekaj']), []);
  });

  it('curateSolutions umakne Ajax iz pametni-dom (LightCore sodi pod alarm)', () => {
    // Ajaxova LightCore nosi generično 'pametne-hise' → mapSolutions ga da v pametni-dom.
    const solutions = mapSolutions(['ajax', 'alarm', 'pametne-hise', 'protivlomni-sistemi']);
    assert.ok(solutions.includes('pametni-dom'), 'brez kuracije je Ajax v pametni-dom');
    const curated = curateSolutions(solutions, 'ajax');
    assert.ok(!curated.includes('pametni-dom'), 'Ajax se umakne iz pametni-dom');
    assert.ok(curated.includes('alarm'), 'a obdrži alarm — ne ostane brez rešitve');
  });

  it('curateSolutions pusti Blebox, SmartLife in Yale v pametni-dom', () => {
    assert.deepEqual(curateSolutions(mapSolutions(['blebox']), 'blebox'), ['pametni-dom']);
    assert.deepEqual(curateSolutions(mapSolutions(['smartlife']), 'smartlife'), ['pametni-dom']);
    // Yale pride v pametni-dom prek iste 'pametne-hise' kot Ajax, a ostane.
    assert.ok(curateSolutions(mapSolutions(['yale', 'pametne-hise']), 'yale').includes('pametni-dom'));
  });

  it('buildProductPayload: Ajax stikalo ni pod pametni-dom, Blebox je', () => {
    const ajax = buildProductPayload(
      { _id: 'a1', ime: 'Ajax CenterButton', prodajnaCena: 20, proizvajalec: 'Ajax', categorySlugs: ['ajax', 'alarm', 'pametne-hise'] },
      'ajax-centerbutton', 0,
    );
    assert.ok(!ajax.categoryKeys.includes('pametni-dom'));
    assert.ok(ajax.categoryKeys.includes('alarm') && ajax.categoryKeys.includes('ajax'));

    const blebox = buildProductPayload(
      { _id: 'b1', ime: 'BleBox wLightBox', prodajnaCena: 30, proizvajalec: 'BleBox', categorySlugs: ['blebox', 'wifi-krmilniki'] },
      'blebox-wlightbox', 1,
    );
    assert.ok(blebox.categoryKeys.includes('pametni-dom') && blebox.categoryKeys.includes('blebox'));
  });

  it('normalizeBrand poenoti različne zapise proizvajalca', () => {
    assert.deepEqual(normalizeBrand('AJAX'), { slug: 'ajax', label: 'Ajax' });
    assert.deepEqual(normalizeBrand('Ajax'), { slug: 'ajax', label: 'Ajax' });
    assert.deepEqual(normalizeBrand('HIKVISION'), { slug: 'hikvision', label: 'Hikvision' });
    assert.deepEqual(normalizeBrand('BleBox'), { slug: 'blebox', label: 'BleBox' });
    assert.equal(normalizeBrand(''), null);
    assert.equal(normalizeBrand(null), null);
  });

  it('buildProductPayload uporabi aaData.image kot rezervo in kratekOpis kot opis', () => {
    const product: Record<string, unknown> = {
      _id: 'def456',
      ime: 'Senzor',
      prodajnaCena: 10,
      kratekOpis: 'Samo kratek',
      dolgOpis: '',
      povezavaDoSlike: '',
      aaData: { image: 'https://cdn.example.com/senzor.png' },
    };
    const payload = buildProductPayload(product, 'senzor', 0);
    assert.equal(payload.regularPrice, '10.00');
    assert.equal(payload.imageSrc, 'https://cdn.example.com/senzor.png');
    assert.equal(payload.description, '<p>Samo kratek</p>');
    assert.equal(payload.featured, false);
  });
});
