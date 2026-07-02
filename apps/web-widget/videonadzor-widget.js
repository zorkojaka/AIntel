/*
 * AIntel – widget za informativno ponudbo (videonadzor)
 * Vgradnja na inteligent.si:
 *
 *   <div id="aintel-ponudba"></div>
 *   <script src="videonadzor-widget.js"></script>
 *   <script>
 *     AintelInquiry.init({
 *       container: '#aintel-ponudba',
 *       apiBase: 'https://testaintel.inteligent.si/api/public',
 *       apiKey: 'VSTAVI-KLJUC',
 *     });
 *   </script>
 *
 * Widget je samostojen (brez knjižnic). Cene in izbire bere iz AIntela
 * (GET /options), povpraševanje odda na POST /inquiries.
 */
(function () {
  'use strict';

  var STYLE = [
    '.aiq{max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#111827;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.08);overflow:hidden}',
    '.aiq-head{background:#111827;color:#fff;padding:14px 18px;font-size:16px;font-weight:bold}',
    '.aiq-head small{display:block;font-weight:normal;color:#9ca3af;margin-top:2px;font-size:12px}',
    '.aiq-body{padding:18px}',
    '.aiq-q{font-size:15px;font-weight:bold;margin:0 0 12px}',
    '.aiq-hint{font-size:12px;color:#6b7280;margin:-6px 0 12px}',
    '.aiq-opts{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}',
    '.aiq-opt{flex:1 1 45%;min-width:130px;border:2px solid #e5e7eb;border-radius:10px;padding:10px 12px;cursor:pointer;background:#fff;text-align:left;font-size:14px}',
    '.aiq-opt:hover{border-color:#9ca3af}',
    '.aiq-opt.sel{border-color:#2563eb;background:#eff6ff}',
    '.aiq-opt b{display:block;margin-bottom:2px}',
    '.aiq-opt span{font-size:12px;color:#6b7280}',
    '.aiq-num{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}',
    '.aiq-num button{width:44px;height:44px;border:2px solid #e5e7eb;border-radius:10px;background:#fff;font-size:15px;cursor:pointer}',
    '.aiq-num button.sel{border-color:#2563eb;background:#eff6ff;font-weight:bold}',
    '.aiq input[type=text],.aiq input[type=email],.aiq input[type=tel],.aiq input[type=number]{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:14px;margin:0 0 10px}',
    '.aiq label{font-size:12px;color:#374151;display:block;margin-bottom:3px}',
    '.aiq-row{display:flex;gap:8px}.aiq-row>div{flex:1}',
    '.aiq-btn{display:block;width:100%;background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px;font-size:15px;font-weight:bold;cursor:pointer}',
    '.aiq-btn:disabled{background:#93c5fd;cursor:wait}',
    '.aiq-back{background:none;border:0;color:#6b7280;font-size:13px;cursor:pointer;padding:0;margin-top:10px}',
    '.aiq-err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;padding:10px;font-size:13px;margin-bottom:12px}',
    '.aiq-ok{text-align:center;padding:10px 0}',
    '.aiq-ok .ico{font-size:40px}',
    '.aiq-ok h3{margin:8px 0 6px}',
    '.aiq-ok p{font-size:14px;color:#374151;margin:4px 0}',
    '.aiq-progress{height:4px;background:#e5e7eb}',
    '.aiq-progress i{display:block;height:4px;background:#2563eb;transition:width .3s}',
    '.aiq-consent{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#374151;margin-bottom:12px}',
    '.aiq-consent input{margin-top:2px}',
    '.aiq-note{font-size:11px;color:#9ca3af;margin-top:10px;text-align:center}',
  ].join('');

  var state = {
    step: 0,
    cameraCount: null,
    wiringType: null,
    wiringReady: null,
    contact: { firstName: '', lastName: '', email: '', phone: '', street: '', postalCode: '', city: '' },
    consent: false,
    options: null,
    error: null,
    sending: false,
  };
  var cfg = null;
  var root = null;

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === 'class') el.className = attrs[key];
        else if (key === 'html') el.innerHTML = attrs[key];
        else if (key.indexOf('on') === 0) el.addEventListener(key.slice(2), attrs[key]);
        else el.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      if (child) el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return el;
  }

  function formatPrice(value) {
    return value == null ? '' : value.toFixed(2).replace('.', ',') + ' €';
  }

  function recommendedWiring() {
    return state.cameraCount != null && state.cameraCount <= 3 ? 'wifi' : 'wired';
  }

  function totalSteps() {
    return state.wiringType === 'wired' ? 4 : 3;
  }

  function render() {
    root.innerHTML = '';
    var steps = [renderCameraCount, renderWiring];
    if (state.wiringType === 'wired') steps.push(renderWiringReady);
    steps.push(renderContact);

    var body;
    if (state.step >= 100) {
      body = renderDone();
    } else {
      body = steps[Math.min(state.step, steps.length - 1)]();
    }

    var progress = state.step >= 100 ? 100 : Math.round((state.step / totalSteps()) * 100);
    root.appendChild(
      h('div', { class: 'aiq' }, [
        h('div', { class: 'aiq-head' }, [
          'Informativna ponudba za videonadzor',
          h('small', null, ['Odgovorite na nekaj vprašanj in ponudbo prejmete na e-mail – takoj in brezplačno.']),
        ]),
        h('div', { class: 'aiq-progress' }, [h('i', { style: 'width:' + progress + '%' })]),
        h('div', { class: 'aiq-body' }, [state.error ? h('div', { class: 'aiq-err' }, [state.error]) : null, body]),
      ])
    );
  }

  function backButton() {
    if (state.step === 0) return null;
    return h('button', { class: 'aiq-back', onclick: function () { state.error = null; state.step -= 1; render(); } }, ['← Nazaj']);
  }

  function renderCameraCount() {
    var wrap = h('div', null, [h('p', { class: 'aiq-q' }, ['1. Koliko kamer potrebujete?'])]);
    var nums = h('div', { class: 'aiq-num' });
    for (var i = 1; i <= 8; i += 1) {
      (function (count) {
        nums.appendChild(
          h('button', {
            class: state.cameraCount === count ? 'sel' : '',
            onclick: function () { state.cameraCount = count; state.error = null; state.step = 1; render(); },
          }, [String(count)])
        );
      })(i);
    }
    wrap.appendChild(nums);
    wrap.appendChild(h('label', null, ['Več kot 8? Vpišite število:']));
    var input = h('input', { type: 'number', min: '1', max: '64', placeholder: 'npr. 12' });
    wrap.appendChild(input);
    wrap.appendChild(
      h('button', {
        class: 'aiq-btn',
        onclick: function () {
          var value = state.cameraCount || parseInt(input.value, 10);
          if (!value || value < 1 || value > 64) { state.error = 'Vnesite število kamer med 1 in 64.'; render(); return; }
          state.cameraCount = value; state.error = null; state.step = 1; render();
        },
      }, ['Naprej'])
    );
    return wrap;
  }

  function renderWiring() {
    var rec = recommendedWiring();
    var cameras = (state.options && state.options.pillars.videonadzor.cameras) || [];
    function cameraInfo(key) {
      for (var i = 0; i < cameras.length; i += 1) if (cameras[i].key === key) return cameras[i];
      return null;
    }
    function option(key, title, description) {
      var product = cameraInfo(key);
      return h('button', {
        class: 'aiq-opt' + (state.wiringType === key ? ' sel' : ''),
        onclick: function () { state.wiringType = key; state.error = null; state.step = 2; render(); },
      }, [
        h('b', null, [title + (rec === key ? ' ⭐ priporočamo' : '')]),
        h('span', null, [product ? product.name + (product.priceWithVat ? ' · ' + formatPrice(product.priceWithVat) + '/kos' : '') : description]),
      ]);
    }
    return h('div', null, [
      h('p', { class: 'aiq-q' }, ['2. Kakšno izvedbo želite?']),
      h('p', { class: 'aiq-hint' }, ['Do 3 kamere praviloma zadošča WiFi, za 4 ali več priporočamo žično izvedbo (zanesljivejša slika in napajanje).']),
      h('div', { class: 'aiq-opts' }, [
        option('wifi', 'WiFi kamere', 'Brez kablov, hitra montaža.'),
        option('wired', 'Žične kamere (PoE)', 'Snemalnik, stabilna povezava.'),
      ]),
      backButton(),
    ]);
  }

  function renderWiringReady() {
    function option(value, title, description) {
      return h('button', {
        class: 'aiq-opt' + (state.wiringReady === value ? ' sel' : ''),
        onclick: function () { state.wiringReady = value; state.error = null; state.step = 3; render(); },
      }, [h('b', null, [title]), h('span', null, [description])]);
    }
    return h('div', null, [
      h('p', { class: 'aiq-q' }, ['3. Ali so kabli / cevi za kamere že napeljani?']),
      h('div', { class: 'aiq-opts' }, [
        option(true, 'Da, napeljava obstaja', 'Kabli ali cevi so že pripravljeni.'),
        option(false, 'Ne, potrebna je napeljava', 'Napeljava se obračuna po dejanski porabi.'),
      ]),
      backButton(),
    ]);
  }

  function renderContact() {
    var contact = state.contact;
    function field(label, key, type, placeholder, half) {
      var wrap = h('div', null, [h('label', null, [label])]);
      var input = h('input', {
        type: type, value: contact[key], placeholder: placeholder || '',
        oninput: function (event) { contact[key] = event.target.value; },
      });
      wrap.appendChild(input);
      return wrap;
    }
    var consent = h('input', { type: 'checkbox', onchange: function (event) { state.consent = event.target.checked; } });
    if (state.consent) consent.setAttribute('checked', 'checked');

    var stepNumber = state.wiringType === 'wired' ? '4' : '3';
    return h('div', null, [
      h('p', { class: 'aiq-q' }, [stepNumber + '. Kam pošljemo informativno ponudbo?']),
      h('div', { class: 'aiq-row' }, [field('Ime *', 'firstName', 'text'), field('Priimek *', 'lastName', 'text')]),
      h('div', { class: 'aiq-row' }, [field('E-mail *', 'email', 'email', 'ime@posta.si'), field('Telefon *', 'phone', 'tel', '041 ...')]),
      field('Naslov objekta (ulica in hišna št.) *', 'street', 'text', 'npr. Slovenska cesta 1'),
      h('div', { class: 'aiq-row' }, [field('Poštna številka *', 'postalCode', 'text', '1000'), field('Kraj *', 'city', 'text', 'Ljubljana')]),
      h('div', { class: 'aiq-consent' }, [
        consent,
        h('span', null, ['Strinjam se, da Inteligent d.o.o. moje podatke uporabi za pripravo ponudbe in kontakt v zvezi z njo.']),
      ]),
      h('button', { class: 'aiq-btn', disabled: state.sending ? 'disabled' : null, onclick: submit }, [state.sending ? 'Pošiljam ...' : 'Pošlji in prejmi ponudbo']),
      backButton(),
      h('p', { class: 'aiq-note' }, ['Ponudba je informativna. Napeljava se obračuna po dejanski porabi, končno ponudbo potrdimo po posvetu.']),
    ]);
  }

  function renderDone() {
    var summary = state.result && state.result.offerSummary;
    return h('div', { class: 'aiq-ok' }, [
      h('div', { class: 'ico' }, ['✉️']),
      h('h3', null, ['Hvala za povpraševanje!']),
      h('p', null, [state.result && state.result.message ? state.result.message : 'Povpraševanje smo prejeli.']),
      summary && summary.offerNumber ? h('p', null, ['Št. ponudbe: ' + summary.offerNumber + (summary.totalWithVat ? ' · informativna vrednost: ' + formatPrice(summary.totalWithVat) : '')]) : null,
      h('p', null, ['V kratkem vas pokličemo za brezplačen posvet in po potrebi ogled objekta.']),
    ]);
  }

  function submit() {
    var contact = state.contact;
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim());
    if (!contact.firstName.trim() || !contact.lastName.trim()) { state.error = 'Vnesite ime in priimek.'; render(); return; }
    if (!emailOk) { state.error = 'Vnesite veljaven e-naslov.'; render(); return; }
    if (!contact.phone.trim()) { state.error = 'Vnesite telefonsko številko.'; render(); return; }
    if (!contact.street.trim() || !contact.postalCode.trim() || !contact.city.trim()) { state.error = 'Vnesite naslov objekta (za izračun poti in točnost ponudbe).'; render(); return; }
    if (!state.consent) { state.error = 'Za pošiljanje ponudbe potrebujemo vaše soglasje.'; render(); return; }

    state.sending = true; state.error = null; render();
    fetch(cfg.apiBase + '/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body: JSON.stringify({
        pillar: 'videonadzor',
        source: cfg.source || window.location.hostname,
        contact: {
          firstName: contact.firstName.trim(),
          lastName: contact.lastName.trim(),
          email: contact.email.trim(),
          phone: contact.phone.trim(),
          siteAddress: { street: contact.street.trim(), postalCode: contact.postalCode.trim(), city: contact.city.trim() },
        },
        videonadzor: {
          cameraCount: state.cameraCount,
          wiringType: state.wiringType,
          wiringReady: state.wiringType === 'wired' ? state.wiringReady === true : false,
        },
      }),
    })
      .then(function (response) { return response.json().then(function (data) { return { status: response.status, data: data }; }); })
      .then(function (result) {
        state.sending = false;
        if (result.data && result.data.ok) {
          state.result = result.data;
          state.step = 100;
        } else {
          state.error = (result.data && result.data.message) || 'Prišlo je do napake. Poskusite znova ali nas pokličite.';
        }
        render();
      })
      .catch(function () {
        state.sending = false;
        state.error = 'Povezava ni uspela. Poskusite znova ali nas pokličite na 051 222 135.';
        render();
      });
  }

  function loadOptions() {
    fetch(cfg.apiBase + '/options', { headers: { 'X-API-Key': cfg.apiKey } })
      .then(function (response) { return response.json(); })
      .then(function (data) { if (data && data.ok) { state.options = data; render(); } })
      .catch(function () { /* widget works without options; prices are just not shown */ });
  }

  window.AintelInquiry = {
    init: function (options) {
      cfg = options || {};
      if (!cfg.container || !cfg.apiBase || !cfg.apiKey) {
        console.error('[AintelInquiry] Manjka container, apiBase ali apiKey.');
        return;
      }
      root = typeof cfg.container === 'string' ? document.querySelector(cfg.container) : cfg.container;
      if (!root) {
        console.error('[AintelInquiry] Container ni najden:', cfg.container);
        return;
      }
      var style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);
      render();
      loadOptions();
    },
  };
})();
