import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildProductPayload, textToHtml } from '../modules/shop/woocommerce-sync.service';

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
    };
    const payload = buildProductPayload(product, 'testna-kamera', 3, 'kamere');
    assert.equal(payload.sku, 'aintel-abc123');
    assert.equal(payload.slug, 'testna-kamera');
    assert.equal(payload.name, 'Testna kamera');
    assert.equal(payload.regularPrice, '99.90');
    assert.equal(payload.shortDescription, '<p>Kratek opis</p>');
    assert.equal(payload.description, '<p>Dolg opis</p>');
    assert.equal(payload.imageSrc, 'https://example.com/slika.jpg');
    assert.equal(payload.featured, true);
    assert.equal(payload.menuOrder, 3);
    assert.deepEqual(payload.categoryKeys, ['kamere']);
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
    const payload = buildProductPayload(product, 'senzor', 0, 'ajax');
    assert.equal(payload.regularPrice, '10.00');
    assert.equal(payload.imageSrc, 'https://cdn.example.com/senzor.png');
    assert.equal(payload.description, '<p>Samo kratek</p>');
    assert.equal(payload.featured, false);
  });
});
