import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTemplateContext,
  renderCommunicationBodyHtml,
  renderCommunicationFooterHtmlForEmail,
  renderCommunicationTemplate,
} from '../modules/communication/services/template-render.service';

const sender = {
  senderName: 'Prodaja',
  senderEmail: 'prodaja@example.test',
  senderPhone: '',
  senderRole: 'Prodaja',
  defaultCc: null,
  defaultBcc: null,
  replyToEmail: null,
  emailFooterTemplate: null,
  enabled: true,
};

test('S8 communication template HTML escapes interpolated customer-controlled values', () => {
  const context = buildTemplateContext({
    customerName: '<img src=x onerror=alert(1)>',
    customerEmail: 'customer@example.test',
    projectName: 'Projekt <script>alert(1)</script>',
    offerNumber: 'P-1',
    offerTotal: '100 EUR',
    companyName: 'Inteligent',
    sender,
  });

  const rendered = renderCommunicationTemplate(
    {
      subjectTemplate: 'Ponudba za {{customer.name}}',
      bodyTemplate: 'Pozdravljeni {{customer.name}}\nProjekt: {{project.name}}',
    },
    context,
  );
  const html = renderCommunicationBodyHtml(rendered.body);

  assert.match(rendered.subject, /<img src=x onerror=alert\(1\)>/);
  assert.match(rendered.body, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('S8 communication template HTML appends already-rendered escaped footer HTML', () => {
  const context = buildTemplateContext({
    customerName: 'Stranka',
    projectName: 'Projekt',
    offerNumber: 'P-1',
    offerTotal: '100 EUR',
    companyName: '<b>Inteligent</b>',
    companyWebsite: 'https://example.test',
    sender,
  });

  const footerHtml = renderCommunicationFooterHtmlForEmail('{{company.name}}\n{{company.website}}', context);
  const html = renderCommunicationBodyHtml('Body', footerHtml);

  assert.match(footerHtml, /&lt;b&gt;Inteligent&lt;\/b&gt;/);
  assert.match(html, /Body/);
  assert.match(html, /border-top:1px solid #e5e7eb/);
  assert.match(html, /&lt;b&gt;Inteligent&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Inteligent<\/b>/);
});
