/* =========================================================================
   Raydn FieldCalc  ::  fc-app.js
   Shell, router, home screen, and the Guided Walkdown.
   ========================================================================= */
(function (global) {
  'use strict';
  var FC = global.FC, G = global.FCGates, U = global.UI;
  var el = U.el, field = U.field, evField = U.evField, card = U.card, acc = U.acc;

  /* Inline SVG icons. No emoji anywhere in this app: emoji render differently
     on every phone, they do not inherit brand colour, and they read as
     unserious on a document an inspector may see. */
  var ICONS = {
    clipboard: '<path d="M9 3h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2V4a1 1 0 0 1 1-1zm0 3v1h6V6H9zM8 11h8M8 15h5"/>',
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
    ruler: '<path d="M3 15 15 3l6 6L9 21z"/><path d="M7 11l2 2M10 8l2 2M13 5l2 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h8"/>'
  };
  function icon(name) {
    var s = document.createElement('span');
    s.className = 'ic';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.clipboard) + '</svg>';
    return s;
  }


  var App = { view: 'home', arg: '' };
  var top, body, bottom;

  /* ---------------------------------------------------------------- shell */
  function mount() {
    top = document.getElementById('fc-top');
    body = document.getElementById('fc-body');
    bottom = document.getElementById('fc-bottom');
  }

  function go(view, arg) {
    App.view = view; App.arg = arg || '';
    global.location.hash = '#/' + view + (arg ? '/' + arg : '');
    render();
    global.scrollTo(0, 0);
  }
  App.go = go;

  function readHash() {
    var h = (global.location.hash || '').replace(/^#\/?/, '');
    var p = h.split('/');
    return { view: p[0] || 'home', arg: p[1] || '' };
  }

  function header(title, sub, backTo) {
    U.clear(top);
    if (backTo) top.appendChild(el('button', { class: 'back', text: '‹', 'aria-label': 'Back', onclick: function () { go(backTo); } }));
    top.appendChild(el('div', { class: 'ttl' }, [
      el('strong', { text: title }),
      sub ? el('small', { text: sub }) : null
    ]));
    var s = FC.state.lastSaved;
    top.appendChild(el('div', { class: 'savedot' + (s ? '' : ' stale') }, [
      el('i'), el('span', { text: s ? 'Saved' : 'Not saved' })
    ]));
  }

  function bar(kids) {
    U.clear(bottom);
    if (!kids || !kids.length) { bottom.classList.add('hidden'); return; }
    bottom.classList.remove('hidden');
    bottom.appendChild(el('div', { class: 'inner' }, kids));
  }

  function fieldNotice() {
    return U.note('Scope of this tool', FC.FIELD_NOTICE, 'lock');
  }

  /* ---------------------------------------------------------------- home */
  function vHome() {
    header('Raydn FieldCalc', 'Load, Site, Solar Proof', null);
    U.clear(body);
    var role = FC.roleObj();

    body.appendChild(el('div', { class: 'hero' }, [
      el('div', { class: 'mark', text: 'R' }),
      el('h1', { class: 'h-hero', text: 'Raydn FieldCalc' }),
      el('div', { class: 'tag', text: 'Load · Site · Solar Proof' }),
      el('p', { class: 'mut', text: 'CEC 2024 field evidence and decision support for Raydn Renewables. Version ' + FC.version + '.' })
    ]));

    body.appendChild(el('div', { class: 'card', style: 'margin-top:18px' }, [
      el('span', { class: 'lab', style: 'display:block;font-size:12.5px;font-weight:600;color:var(--ink-2);margin-bottom:8px', text: 'Who is on site' }),
      U.chips({
        values: FC.state.role, multi: false,
        options: Object.keys(FC.ROLES).map(function (k) { return { k: k, label: FC.ROLES[k].name }; }),
        onpick: function (k) { FC.state.role = k; FC.save(); render(); }
      }),
      el('p', { class: 'tiny', style: 'margin-top:10px', text: !FC.state.role
        ? 'Pick who is on site before you start. Nobody is signed in, so review and release are locked.'
        : role.title + (role.canReview ? '. Full access, including review and release.' : '. Evidence capture only. Technical conclusions are locked.') })
    ]));

    var isM = FC.isMaster();
    var tiles = el('div', { class: 'tiles' });
    function tile(ic, t, s, fn, cls) {
      tiles.appendChild(el('button', { class: 'tile ' + (cls || ''), onclick: fn }, [
        icon(ic),
        el('div', { class: 'tx' }, [el('b', { text: t }), el('span', { text: s })])
      ]));
    }
    tiles.appendChild(el('button', {
      class: 'tile pri wide', onclick: function () {
        if (!FC.state.role) return U.toast('Pick who is on site first.');
        FC.newJob(); go('job');
      }
    }, [
      icon('clipboard'),
      el('div', { class: 'tx' }, [el('b', { text: 'Start a Guided Walkdown' }), el('span', { text: 'New job. Facts, nameplates and photos, step by step.' })])
    ]));
    tile('bolt', 'Express Screen', 'Ballpark direction in about a minute', function () { go('express'); });
    tile('ruler', 'Wire and voltage drop', 'Screening only, never a final size', function () { go('wire'); });
    tile('sun', 'Solar and Rule 024', 'Annual use alignment check', function () {
      var j = FC.active();
      if (!j) return U.toast('Open or start a job first.');
      go('w-solar');
    });
    if (isM) {
      tile('lock', 'Master Review', 'Read the ledger, log overrides, approve', function () {
        if (!FC.active()) return U.toast('Open a job first.');
        go('master');
      });
      tile('calc', 'Full CEC calculator', 'All occupancies, v1.0 engine', function () { global.location.href = 'calc.html'; });
    } else {
      tiles.appendChild(el('button', { class: 'tile locked', onclick: function () { U.toast('Master Electrician only.'); } }, [
        icon('lock'),
        el('div', { class: 'tx' }, [el('b', { text: 'Master Review' }), el('span', { text: 'Approval and release' })])
      ]));
      tiles.appendChild(el('button', { class: 'tile locked', onclick: function () { U.toast('Master Electrician only.'); } }, [
        icon('calc'),
        el('div', { class: 'tx' }, [el('b', { text: 'Full CEC calculator' }), el('span', { text: 'All occupancies' })])
      ]));
    }
    body.appendChild(tiles);

    /* saved jobs */
    if (FC.state.photoLoss) {
      body.appendChild(U.note('Some photos are missing', FC.state.photoLoss + ' photo' + (FC.state.photoLoss === 1 ? ' was' : 's were') + ' marked Captured but the image is not on this phone. They have been set back to Follow up required so nothing looks proven when it is not. Retake them.', 'warn'));
    }
    var tier = FC.state.tier || { key: 'tab', durable: false };
    if (!tier.durable) {
      body.appendChild(U.note('Device storage is switched off in this browser',
        'Your work is being held in this browser tab only. Closing the tab loses everything including the photos. Export every job the moment you finish it, or open FieldCalc in Chrome or Safari instead of a private window.', 'warn'));
    }
    body.appendChild(el('h2', { class: 'h-sec', text: tier.durable ? 'Jobs on this phone' : 'Jobs in this tab' }));
    if (!FC.state.jobs.length) {
      body.appendChild(el('p', { class: 'mut', text: 'Nothing saved in this tab yet. Start a walkdown, or load a job file that was exported from another phone.' }));
    } else {
      FC.state.jobs.forEach(function (j) {
        var st = G.status(j);
        var s = FC.STATUS[st.key];
        var cls = s.tone === 'good' ? 'done' : s.tone === 'block' ? 'blockb' : 'warnb';
        body.appendChild(el('div', {
          class: 'item ' + cls,
          onclick: function () { FC.setActive(j.id); go('job'); }
        }, [
          el('span', { class: 'dot' }),
          el('div', { class: 'tx' }, [
            el('b', { text: (FC.evVal(j.header.customer) || 'Untitled job') + (j.demo ? '  DEMO ONLY' : '') }),
            el('span', { text: (FC.evVal(j.header.address) || 'No address yet') + ' · ' + s.label + ' · ' + st.packet.pct + '% packet' })
          ]),
          el('span', { class: 'go', text: '›' })
        ]));
      });
    }

    body.appendChild(el('div', { class: 'card', style: 'margin-top:16px' }, [
      el('h3', { text: 'Move a job between phones' }),
      el('p', { class: 'mut', text: 'Nothing leaves the phone unless you send it. The job file carries everything, including the photos. Send it to Dmitry, then import it on his phone for review.' }),
      el('div', { style: 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap' }, [
        el('label', { class: 'btn sm', style: 'flex:1;min-width:150px;cursor:pointer' }, [
          'Import a job file',
          el('input', {
            type: 'file', accept: 'application/json,.json', style: 'display:none',
            onchange: function (e) {
              var f = e.target.files[0]; if (!f) return;
              var fr = new FileReader();
              fr.onload = function () {
                try { FC.importJob(fr.result); U.toast('Job imported.'); go('job'); }
                catch (err) { U.toast('Could not read that file.'); }
              };
              fr.readAsText(f);
            }
          })
        ]),
        el('button', { class: 'btn sm gho', style: 'flex:1;min-width:150px', text: 'Settings and job log', onclick: function () { go('settings'); } }),
        el('button', { class: 'btn sm gho', style: 'flex:1;min-width:150px', text: 'What changed in this version', onclick: function () { go('changelog'); } })
      ])
    ]));

    body.appendChild(el('p', { class: 'tiny', style: 'margin-top:20px;text-align:center;line-height:1.6' , text:
      'Dmitry Naboka, Master Electrician, ME# 13824 · (780) 904-3462 · info@raydnrenewables.com · raydnrenewables.com' }));
    body.appendChild(el('p', { class: 'tiny', style: 'text-align:center', text: FC.CEC_VERSION }));

    bar([]);
  }

  /* ---------------------------------------------------------------- changelog */
  function vChangelog() {
    header('What changed', 'Version history', 'home');
    U.clear(body);
    FC.CHANGELOG.forEach(function (c) {
      body.appendChild(card(c.title, null, [
        el('p', { class: 'mut', text: 'Version ' + c.v + ', ' + c.d }),
        el('ul', { style: 'margin:12px 0 0;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.6' },
          c.items.map(function (i) { return el('li', { text: i, style: 'margin-bottom:6px' }); }))
      ]));
    });
    bar([el('button', { class: 'btn wide gho', text: 'Back to home', onclick: function () { go('home'); } })]);
  }

  /* ---------------------------------------------------------------- job hub */
  var STEPS = [
    { k: 'w-header',  n: '1', t: 'Job header',            s: 'Customer, address, what they asked for' },
    { k: 'w-juris',   n: '2', t: 'Jurisdiction',          s: 'Authority and wires owner, before anything else' },
    { k: 'w-types',   n: '3', t: 'What is this job',      s: 'Pick every lane that applies' },
    { k: 'w-service', n: '4', t: 'Service and panel',     s: 'Three separate facts, do not merge them' },
    { k: 'w-area',    n: '5', t: 'Areas and occupancy',   s: 'Above grade, below grade, ceiling height' },
    { k: 'w-loads',   n: '6', t: 'Major load cards',      s: 'Nameplates, existing versus proposed' },
    { k: 'w-photos',  n: '7', t: 'Photo proof pack',      s: 'Every required shot, or a reason and an owner' },
    { k: 'w-solar',   n: '8', t: 'Solar walkdown',        s: 'Roof, shade, 12 month kWh, Rule 024' },
    { k: 'w-flags',   n: '9', t: 'Site flags and notes',  s: 'Anything that looked wrong' }
  ];

  function stepState(job, k) {
    var p = G.packet(job);
    function miss(pre) { return p.missing.filter(function (m) { return m.indexOf(pre) === 0; }).length; }
    function blocked(pre) { return p.blockers.filter(function (m) { return m.indexOf(pre) === 0; }).length; }
    switch (k) {
      case 'w-header':  return { open: ['Customer name', 'Service address', 'Phone or email', 'Lead source', 'Customer request in their own words'].filter(function (x) { return p.missing.indexOf(x) >= 0; }).length, block: p.blockers.indexOf('Customer name') >= 0 || p.blockers.indexOf('Service address') >= 0 };
      case 'w-juris':   return { open: ['Jurisdiction selected', 'Inspection authority named', 'Wires owner named', 'Retailer for solar'].filter(function (x) { return p.missing.indexOf(x) >= 0; }).length, block: p.blockers.indexOf('Jurisdiction selected') >= 0 };
      case 'w-types':   return { open: p.missing.indexOf('At least one job type') >= 0 ? 1 : 0, block: p.blockers.indexOf('At least one job type') >= 0 };
      case 'w-service': return { open: ['Existing service rating', 'Main breaker rating', 'Panel bus rating', 'Panel make and model', 'Spaces available', 'Meter location', 'Overhead or underground service', 'Panel location', 'Panel condition'].filter(function (x) { return p.missing.indexOf(x) >= 0; }).length, block: p.blockers.filter(function (b) { return ['Existing service rating', 'Main breaker rating', 'Panel bus rating', 'Overhead or underground service'].indexOf(b) >= 0; }).length > 0 };
      case 'w-area':    return { open: p.missing.indexOf('Above grade living area') >= 0 ? 1 : 0, block: p.blockers.indexOf('Above grade living area') >= 0 };
      case 'w-loads':   return { open: miss('EVSE') + miss('Hot tub') + miss('Outdoor unit') + miss('Charger') + miss('Heating and cooling') + (job.loads.length ? 0 : 1), block: blocked('EVSE') + blocked('Hot tub') + blocked('Outdoor unit') > 0 };
      case 'w-photos':  return { open: miss('Photo:'), block: blocked('Photo:') > 0 };
      case 'w-solar':   return { open: job.types.indexOf('solar') < 0 ? -1 : ['Twelve months of measured kWh', 'Bill quality flag on every month', 'Seasonal occupancy pattern', 'Roof material', 'Roof condition', 'At least one roof plane recorded', 'Proposed inverter location'].filter(function (x) { return p.missing.indexOf(x) >= 0; }).length, block: blocked('Twelve months') + blocked('Seasonal') + blocked('At least one roof') > 0 };
      default:          return { open: 0, block: false };
    }
  }

  function vJob() {
    var job = FC.active();
    if (!job) return go('home');
    header(FC.evVal(job.header.customer) || 'New job', FC.evVal(job.header.address) || 'Guided Walkdown', 'home');
    U.clear(body);

    var st = G.status(job);
    var s = FC.STATUS[st.key];

    body.appendChild(el('div', { class: 'card' }, [
      U.ring(st.packet.pct, 'Field packet ' + st.packet.done + ' of ' + st.packet.total,
        st.packet.blockers.length ? st.packet.blockers.length + ' item' + (st.packet.blockers.length === 1 ? '' : 's') + ' blocking review' : 'No blockers'),
      el('div', { style: 'margin-top:14px' }, U.band(s.tone, s.label, null, null, s.blurb))
    ]));

    if (job.demo) body.appendChild(U.note('Demo record', 'This job is marked DEMO ONLY. It is for training and testing. Do not use any number from it on a real site.', ''));

    body.appendChild(el('h2', { class: 'h-sec', text: 'Walkdown steps' }));
    var stepNo = 0;
    STEPS.forEach(function (sp) {
      var ss = stepState(job, sp.k);
      if (ss.open === -1) return;                       // step not relevant to this job
      stepNo++;
      var cls = ss.open > 0 ? 'warnb' : 'done';
      var sub = ss.open > 0
        ? ss.open + ' item' + (ss.open === 1 ? '' : 's') + ' still open' + (ss.block ? ', required for review' : '')
        : 'Complete';
      body.appendChild(el('div', { class: 'item ' + cls, onclick: function () { go(sp.k); } }, [
        el('span', { class: 'dot' }),
        el('div', { class: 'tx' }, [el('b', { text: stepNo + '. ' + sp.t }), el('span', { text: sp.s + ' · ' + sub })]),
        el('span', { class: 'go', text: '›' })
      ]));
    });

    body.appendChild(el('h2', { class: 'h-sec', text: 'Results and handoff' }));
    body.appendChild(el('div', { class: 'item', onclick: function () { go('status'); } }, [
      el('span', { class: 'dot' }),
      el('div', { class: 'tx' }, [el('b', { text: 'Preliminary screen' }), el('span', { text: 'What the numbers say so far, and what is still open' })]),
      el('span', { class: 'go', text: '›' })
    ]));
    body.appendChild(el('div', {
      class: 'item' + (FC.isMaster() ? '' : ' locked'), style: FC.isMaster() ? '' : 'opacity:.45',
      onclick: function () { FC.isMaster() ? go('master') : U.toast('Master Electrician only.'); }
    }, [
      el('span', { class: 'dot' }),
      el('div', { class: 'tx' }, [el('b', { text: 'Master Review' + (FC.isMaster() ? '' : ', locked') }), el('span', { text: 'CEC ledger, overrides, approval and release' })]),
      el('span', { class: 'go', text: '›' })
    ]));
    body.appendChild(el('div', { class: 'item', onclick: function () { go('send'); } }, [
      el('span', { class: 'dot' }),
      el('div', { class: 'tx' }, [el('b', { text: 'Send this job' }), el('span', { text: 'Share tray, email, the shared job log, or save the file' })]),
      el('span', { class: 'go', text: '›' })
    ]));
    body.appendChild(el('div', { class: 'item', onclick: function () { go('reports'); } }, [
      el('span', { class: 'dot' }),
      el('div', { class: 'tx' }, [el('b', { text: 'Reports' }), el('span', { text: 'Internal field report, customer next steps, proposal handoff' })]),
      el('span', { class: 'go', text: '›' })
    ]));

    body.appendChild(el('div', { class: 'card', style: 'margin-top:16px' }, [
      el('h3', { text: 'This job' }),
      el('p', { class: 'tiny', style: 'margin-top:8px', text: 'Job ' + job.id + '. Created ' + FC.stamp(job.created) + ', last change ' + FC.stamp(job.updated) + ', recorded by ' + FC.ROLES[job.rep].name }),
      el('div', { style: 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap' }, [
        el('button', { class: 'btn sm', style: 'flex:1;min-width:140px', text: 'Export job file', onclick: function () { download(job, false); } }),
        el('button', { class: 'btn sm', style: 'flex:1;min-width:140px', text: 'Export with photos', onclick: function () { download(job, true); } }),
        el('button', {
          class: 'btn sm gho', style: 'flex:1;min-width:140px',
          text: job.demo ? 'Unmark demo' : 'Mark as DEMO ONLY',
          onclick: function () { job.demo = !job.demo; FC.touch('Demo flag set to ' + job.demo); render(); }
        }),
        el('button', {
          class: 'btn sm dngr', style: 'flex:1;min-width:140px', text: 'Delete this job',
          onclick: function () {
            if (confirm('Delete this job from this device? Export it first if you need it.')) { FC.deleteJob(job.id); go('home'); }
          }
        })
      ])
    ]));

    bar([el('button', { class: 'btn pri wide', text: 'Continue the walkdown', onclick: function () { nextOpen(job); } })]);
  }

  function nextOpen(job) {
    for (var i = 0; i < STEPS.length; i++) {
      var ss = stepState(job, STEPS[i].k);
      if (ss.open > 0 || ss.block) return go(STEPS[i].k);
    }
    go('status');
  }

  function download(job, photos) {
    var blob = new Blob([FC.exportJob(job, photos)], { type: 'application/json' });
    var a = el('a', {
      href: URL.createObjectURL(blob),
      download: 'FieldCalc_' + (String(FC.evVal(job.header.customer) || 'job').replace(/[^A-Za-z0-9]+/g, '_')) + '_' + job.id + '.json'
    });
    document.body.appendChild(a); a.click(); a.remove();
    U.toast(photos ? 'Exported with photos.' : 'Exported.');
  }

  /* ------------------------------------------------------- step chrome */
  function stepWrap(k, title, sub, kids, hint) {
    var i = STEPS.map(function (s) { return s.k; }).indexOf(k);
    header(title, sub, 'job');
    U.clear(body);
    if (hint) body.appendChild(U.note(null, hint, ''));
    kids.forEach(function (c) { body.appendChild(c); });
    if (!FC.isMaster()) body.appendChild(fieldNotice());
    var next = STEPS[i + 1];
    bar([
      el('button', { class: 'btn gho', style: 'flex:0 0 auto', text: 'Steps', onclick: function () { go('job'); } }),
      el('button', {
        class: 'btn pri', style: 'flex:1',
        text: next ? 'Next, ' + next.t.toLowerCase() : 'See the screen',
        onclick: function () {
          FC.touch(null);
          if (!next) return go('status');
          var job = FC.active();
          if (next.k === 'w-solar' && job.types.indexOf('solar') < 0) return go('w-flags');
          go(next.k);
        }
      })
    ]);
  }
  function upd(what) { return function () { FC.touch(what); }; }

  /* ------------------------------------------------------- 1 header */
  function vHeader() {
    var j = FC.active(); if (!j) return go('home');
    var h = j.header;
    stepWrap('w-header', 'Job header', 'Step 1 of 9', [
      card('Who and where', '1', [
        field({ label: 'Customer name', req: true, value: h.customer, oninput: function (v) { h.customer = v; FC.touch(null); } }),
        el('div', { class: 'row2' }, [
          field({ label: 'Phone', type: 'tel', value: h.phone, oninput: function (v) { h.phone = v; } }),
          field({ label: 'Email', type: 'email', value: h.email, oninput: function (v) { h.email = v; } })
        ]),
        field({ label: 'Service address', req: true, hint: 'The civic address of the work, not the mailing address. Permit authority and wires owner follow this address.', value: h.address, oninput: function (v) { h.address = v; FC.touch(null); } }),
        field({ label: 'Postal code', value: h.postal, oninput: function (v) { h.postal = v; } })
      ]),
      card('Where the lead came from', '2', [
        field({ label: 'Lead source', options: FC.LEAD_SOURCES, value: h.leadSource, onchange: function (v) { h.leadSource = v; FC.touch(null); } }),
        field({ label: 'Campaign or flyer drop', value: h.campaign, oninput: function (v) { h.campaign = v; } }),
        field({ label: 'Referred by', value: h.referrer, oninput: function (v) { h.referrer = v; } })
      ]),
      card('What they actually asked for', '3', [
        field({ label: 'In their own words', rows: 4, hint: 'Write what they said, not what you think they meant. This is the sentence the proposal answers.', value: h.request, oninput: function (v) { h.request = v; } }),
        field({ label: 'Budget signal', options: ['Not discussed', 'Price shopping', 'Has a number in mind', 'Wants the right job done', 'Grant or rebate driven'], value: h.budget, onchange: function (v) { h.budget = v; } }),
        field({ label: 'Timeline', options: ['Emergency', 'Weeks', 'This season', 'Next year', 'Just gathering information'], value: h.timeline, onchange: function (v) { h.timeline = v; } }),
        field({ label: 'Who decides', hint: 'Names. If a partner has to agree, say so now.', value: h.decisionMakers, oninput: function (v) { h.decisionMakers = v; } })
      ])
    ]);
  }

  /* ------------------------------------------------------- 2 jurisdiction */
  function vJuris() {
    var j = FC.active(); if (!j) return go('home');
    var ju = j.juris;
    var box = card('Jurisdiction and wires owner', '1', []);
    function paint() {
      var bd = box.querySelector('.bd'); U.clear(bd);
      bd.appendChild(U.chips({
        values: ju.preset, multi: false,
        options: FC.JURISDICTIONS.map(function (x) { return { k: x.k, label: x.label }; }),
        onpick: function (k) {
          var p = FC.JURISDICTIONS.filter(function (x) { return x.k === k; })[0];
          ju.preset = k;
          if (p.authority) ju.authority = p.authority;
          if (p.utility) ju.utility = p.utility;
          if (k === 'unknown') { ju.authority = ''; ju.utility = ''; }
          FC.touch('Jurisdiction set to ' + p.label);
          paint();
        }
      }));
      bd.appendChild(el('div', { style: 'margin-top:14px' }));
      bd.appendChild(field({ label: 'Inspection authority', req: true, value: ju.authority, oninput: function (v) { ju.authority = v; FC.touch(null); } }));
      bd.appendChild(field({ label: 'Wires owner', req: true, value: ju.utility, oninput: function (v) { ju.utility = v; FC.touch(null); } }));
      bd.appendChild(field({ label: 'Electricity retailer', hint: 'Needed for solar. It is on the bill.', value: ju.retailer, oninput: function (v) { ju.retailer = v; } }));
      bd.appendChild(field({ label: 'Who owns what on site', rows: 3, hint: 'Trench, conductors in the trench, mast, service head, meter socket, meter, and the shutdown. Write down anything the customer told you.', value: ju.boundaryNotes, oninput: function (v) { ju.boundaryNotes = v; } }));
      if (ju.preset === 'unknown') bd.appendChild(U.note('This puts the job on hold', 'An unresolved jurisdiction means the permit path, the utility process and the equipment responsibility are unknown. The screen will stay on Master Review Hold until it is answered.', ''));
    }
    paint();
    stepWrap('w-juris', 'Jurisdiction', 'Step 2 of 9', [
      U.note('Read this first', FC.JURISDICTION_WARNING, ''),
      box
    ], 'Jurisdiction comes before scope, price or equipment. A signed agreement naming the wrong authority has already had to be reissued and initialled on a real job.');
  }

  /* ------------------------------------------------------- 3 job types */
  function vTypes() {
    var j = FC.active(); if (!j) return go('home');
    stepWrap('w-types', 'What is this job', 'Step 3 of 9', [
      card('Pick every lane that applies', null, [
        U.chips({
          values: j.types, multi: true, options: FC.JOB_TYPES,
          onpick: function () { FC.touch('Job types updated'); }
        }),
        el('p', { class: 'mut', style: 'margin-top:14px', text: 'Each lane switches on the questions and the photos that lane needs. Pick honestly. Guessing here costs a second trip.' })
      ]),
      card('Calculation path', null, [
        field({
          label: 'Occupancy', value: j.occupancyPath,
          options: [
            { v: 'single', l: 'Single dwelling, Rule 8-200' },
            { v: 'apt-unit', l: 'Apartment unit, Rule 8-202' },
            { v: 'apt-building', l: 'Apartment building, Rule 8-202 3)' },
            { v: 'other', l: 'Something else, Master picks the path' }
          ],
          hint: 'Anything other than a single dwelling goes to the Master Electrician to choose the route. It does not run on this screen.',
          onchange: function (v) { j.occupancyPath = v; FC.touch('Occupancy path set to ' + v); render(); }
        })
      ])
    ]);
  }

  /* ------------------------------------------------------- 4 service */
  function vService() {
    var j = FC.active(); if (!j) return go('home');
    var s = j.service;
    var warn = el('div');
    function check() {
      U.clear(warn);
      var bus = FC.evNum(s.busRating), main = FC.evNum(s.mainBreaker), rate = FC.evNum(s.serviceRating);
      if (bus !== null && main !== null && bus !== main) {
        warn.appendChild(U.note('Bus and main do not match', 'The panel bus is ' + bus + ' A and the main breaker is ' + main + ' A. A ' + bus + ' A rated panel with a ' + main + ' A main is not a ' + bus + ' A service. Record both and let the Master Electrician decide what the service actually is.', ''));
      }
      if (rate !== null && main !== null && rate !== main) {
        warn.appendChild(U.note('Service rating and main do not match', 'Recorded service rating is ' + rate + ' A, main breaker is ' + main + ' A. Both go in the report as separate facts. Do not average them and do not pick one.', ''));
      }
    }
    check();

    stepWrap('w-service', 'Service and panel', 'Step 4 of 9', [
      U.note('Three separate facts', 'Service rating, main breaker rating and panel bus rating are three different numbers. Record all three. Do not merge them, and do not assume one from another.', ''),
      card('The numbers', '1', [
        field({
          label: 'Supply voltage', value: s.supplyVoltage,
          options: ['120/240 V single phase, 3 wire', '120/208 V, 3 wire from a 3 phase 4 wire supply', '120/208 V, 3 phase 4 wire', '347/600 V, 3 phase 4 wire'],
          onchange: function (v) { s.supplyVoltage = v; FC.touch(null); }
        }),
        evField({ label: 'Existing service rating', obj: s.serviceRating, unit: 'A', req: true, type: 'number', hint: 'What the service is rated at. Off the meter base or the utility record, not off the breaker.', onchange: check }),
        evField({ label: 'Main breaker rating', obj: s.mainBreaker, unit: 'A', req: true, type: 'number', hint: 'The number stamped on the main handle.', onchange: check }),
        evField({ label: 'Panel bus rating', obj: s.busRating, unit: 'A', req: true, type: 'number', hint: 'Off the panel label. Bus rating is not demand approval.', onchange: check }),
        warn
      ]),
      card('The panel', '2', [
        evField({ label: 'Panel make and model', obj: s.panelMakeModel, hint: 'The catalogue number off the label matters when breakers get ordered.' }),
        el('div', { class: 'row2' }, [
          field({ label: 'Spaces used', type: 'number', value: s.spacesTotal, oninput: function (v) { s.spacesTotal = v; } }),
          field({ label: 'Spaces free', type: 'number', value: s.spacesFree, oninput: function (v) { s.spacesFree = v; FC.touch(null); } })
        ]),
        field({ label: 'Panel arrangement', options: ['Main breaker panel', 'Main lug only, fed from a main disconnect', 'Split bus', 'Fused', 'Unknown, needs a look'], value: s.panelArrangement, onchange: function (v) { s.panelArrangement = v; } }),
        field({ label: 'Panel condition', options: ['Good', 'Aged but serviceable', 'Corrosion present', 'Heat damage present', 'Water present', 'Known problem brand', 'Cannot assess safely'], value: s.panelCondition, onchange: function (v) { s.panelCondition = v; FC.touch(null); } }),
        field({ label: 'Panel location', value: s.panelLocation, placeholder: 'Basement utility room, garage wall, exterior', oninput: function (v) { s.panelLocation = v; FC.touch(null); } }),
        field({ label: 'Existing subpanels', rows: 2, hint: 'Location, rating, and how it is fed. Say none if there are none.', value: s.subpanels, oninput: function (v) { s.subpanels = v; } })
      ]),
      card('Measured demand, optional but worth chasing', '3', [
        el('p', { class: 'mut', text: 'Rule 8-106 8) lets an existing house be sized on what it actually measured over the last twelve months plus the new loads, instead of the worst case Rule 8-200 number. On a lived in house the two often disagree, and that gap is usually the honest answer. Leave this blank unless you have a real demand figure. This is a demand reading, not the kWh total off a power bill.' }),
        el('div', { class: 'row2' }, [
          field({
            label: 'Measured maximum demand', type: 'number', value: s.measured.value,
            oninput: function (v) { s.measured.value = v; FC.touch(null); }
          }),
          field({
            label: 'Units', options: ['kW', 'A', 'W'], value: s.measured.unit,
            onchange: function (v) { s.measured.unit = v; FC.touch(null); }
          })
        ]),
        field({
          label: 'Where the number came from', value: s.measured.source,
          hint: 'Utility demand data, a recording meter, or a logger. Name it. Without a source this does not get used.',
          placeholder: 'Fortis interval data, EPCOR MyAccount demand, Fluke logger on the main',
          oninput: function (v) { s.measured.source = v; FC.touch(null); }
        }),
        field({
          label: 'Twelve month window', value: s.measured.window,
          hint: 'The dates the reading covers. The rule says the most recent twelve month period.',
          placeholder: 'September 2025 to August 2026',
          oninput: function (v) { s.measured.window = v; FC.touch(null); }
        }),
        el('p', { class: 'tiny', text: 'Both the source and the window have to be filled in before the number counts. Rule 8-106 8) is also subject to Rule 8-104 5) and 6), which is a Master Review call, not a field one.' })
      ]),
      card('The supply', '4', [
        field({ label: 'Overhead or underground', req: true, options: ['Overhead, aerial service', 'Underground', 'Overhead now, underground proposed', 'Unknown'], value: s.overheadUnderground, onchange: function (v) { s.overheadUnderground = v; FC.touch(null); } }),
        field({ label: 'Meter location', value: s.meterLocation, oninput: function (v) { s.meterLocation = v; FC.touch(null); } }),
        evField({ label: 'Service conductors, if visible', obj: s.serviceConductors, hint: 'Size and material if you can read it. Leave blank rather than guessing.' }),
        field({ label: 'Service entrance notes', rows: 3, hint: 'Mast condition, attachment point, height, weatherhead, pedestal condition. Anything the utility will care about.', value: s.entranceNotes, oninput: function (v) { s.entranceNotes = v; } }),
        field({ label: 'Special equipment on site', rows: 2, hint: 'Generator, transfer switch, existing solar, battery, well, sump, medical equipment.', value: s.specialEquipment, oninput: function (v) { s.specialEquipment = v; } }),
        field({ label: 'Route notes', rows: 2, hint: 'Where new conduit would run and what is in the way.', value: s.routeNotes, oninput: function (v) { s.routeNotes = v; } })
      ])
    ]);
  }

  /* ------------------------------------------------------- 5 areas */
  function vArea() {
    var j = FC.active(); if (!j) return go('home');
    var a = j.areas;
    var out = el('p', { class: 'mut' });
    function calc() {
      var ab = Number(a.above) || 0, be = Number(a.below) || 0, hh = Number(a.belowHeight) || 0;
      var f = a.unit === 'sqft' ? 1 / 10.7639 : 1;
      var abm = ab * f, bem = be * f;
      var counted = hh >= 1.8 ? bem * 0.75 : 0;
      if (!ab) { out.textContent = 'Enter the above grade area to see the living area used.'; return; }
      var msg = 'Above grade ' + abm.toFixed(1) + ' m2. ';
      if (a.hasBasement === 'No') {
        msg += 'No basement recorded. ';
      } else if (a.hasBasement === 'Yes') {
        if (!be) msg += 'Basement area is still blank, so it is counting zero right now. ';
        else if (!hh) msg += 'Below grade ' + bem.toFixed(1) + ' m2, ceiling height still blank so it is counting zero right now. ';
        else if (hh >= 1.8) msg += 'Below grade ' + bem.toFixed(1) + ' m2, ceiling ' + hh + ' m so 75 percent counts, ' + counted.toFixed(1) + ' m2. ';
        else msg += 'Below grade ' + bem.toFixed(1) + ' m2, ceiling ' + hh + ' m is under 1.8 m so it does not count. ';
      } else {
        msg += 'Answer the basement question so the calculation is not silently leaving it out. ';
      }
      msg += 'Living area used for the calculation, ' + (abm + counted).toFixed(1) + ' m2.';
      out.textContent = msg;
    }
    var bsmt = el('div');
    function paint() {
      U.clear(bsmt);
      if (a.hasBasement !== 'Yes') { calc(); return; }
      bsmt.appendChild(field({ label: 'Below grade area', req: true, type: 'number', unit: a.unit === 'sqft' ? 'ft²' : 'm²', hint: 'Total basement footprint, finished or not. Bare concrete counts.', value: a.below, oninput: function (v) { a.below = v; FC.touch(null); calc(); } }));
      bsmt.appendChild(field({ label: 'Basement ceiling height', req: true, type: 'number', unit: 'm', hint: 'Measure it, do not guess. 1.8 m is the line in Rule 8-110 c).', value: a.belowHeight, oninput: function (v) { a.belowHeight = v; FC.touch(null); calc(); } }));
      calc();
    }
    paint();

    stepWrap('w-area', 'Areas and occupancy', 'Step 5 of 9', [
      U.note('The basement counts', 'Rule 8-110 c) takes 75 percent of the below grade area where the ceiling is over 1.8 m. Unlike the above grade clause it does not say used for living purposes. Bare framing and bare concrete still count. On Jochen\u2019s job the basement was never measured and it moved the service result, so this screen will not let you skip it.', ''),
      U.note('Gross area is not living area', 'A municipal record often lists total gross area, which may already fold in the basement or a garage. If you use that number, say so in the source box below so the Master Electrician knows what it includes.', ''),
      card('Floor area', null, [
        U.seg({ value: a.unit, options: [{ v: 'sqft', l: 'Square feet' }, { v: 'm2', l: 'Square metres' }], onpick: function (v) { a.unit = v; FC.touch(null); calc(); } }),
        el('div', { style: 'height:14px' }),
        field({ label: 'Above grade living area', req: true, type: 'number', unit: a.unit === 'sqft' ? 'ft²' : 'm²', hint: 'Ground floor and above.', value: a.above, oninput: function (v) { a.above = v; FC.touch(null); calc(); } }),
        field({ label: 'Where that number came from', type: 'select', options: [''].concat(FC.AREA_SOURCES), hint: 'Assumption is allowed here, but it will hold the job out of review until it is replaced.', value: a.aboveSource, oninput: function (v) { a.aboveSource = v; FC.touch(null); } }),
        el('div', { style: 'height:6px' }),
        el('div', { class: 'lab' }, ['Is there a basement? ', el('i', { class: 'req', text: '*' })]),
        U.seg({ value: a.hasBasement, options: [{ v: 'Yes', l: 'Yes' }, { v: 'No', l: 'No' }], onpick: function (v) { a.hasBasement = v; FC.touch(null); paint(); } }),
        el('div', { style: 'height:10px' }),
        bsmt,
        field({ label: 'Area excluding basement', type: 'number', unit: a.unit === 'sqft' ? 'ft²' : 'm²', hint: 'Used for the Rule 8-200 1) b) minimum. Leave blank to use the above grade figure.', value: a.exclBasement, oninput: function (v) { a.exclBasement = v; } }),
        el('div', { style: 'margin-top:6px' }, out)
      ])
    ]);
  }

  /* ------------------------------------------------------- 6 loads */
  function vLoads() {
    var j = FC.active(); if (!j) return go('home');
    var list = el('div');

    function paintList() {
      U.clear(list);
      if (!j.loads.length) {
        list.appendChild(el('p', { class: 'mut', text: 'No load cards yet. Add one card per piece of equipment over 1500 W, plus the range, the dryer and the water heater whatever their rating.' }));
      }
      j.loads.forEach(function (L, i) {
        var sc = el('div', { class: 'subcard' });
        sc.appendChild(el('div', { class: 'hd' }, [
          el('b', { text: (L.kind || 'New load card') }),
          el('button', {
            class: 'xbtn', text: '×', 'aria-label': 'Remove',
            onclick: function () { j.loads.splice(i, 1); FC.touch('Load card removed'); paintList(); }
          })
        ]));
        sc.appendChild(field({ label: 'What is it', options: FC.LOAD_KINDS, value: L.kind, onchange: function (v) { L.kind = v; FC.touch(null); paintList(); } }));
        sc.appendChild(field({ label: 'Existing or proposed', options: FC.LOAD_STATE, value: L.state, onchange: function (v) { L.state = v; FC.touch(null); paintList(); } }));
        sc.appendChild(evField({ label: 'Make and model', obj: L.makeModel }));
        sc.appendChild(el('div', { class: 'row3' }, [
          field({ label: 'Volts', type: 'number', value: L.voltage, oninput: function (v) { L.voltage = v; FC.touch(null); } }),
          evField({ label: 'Watts', obj: L.w, type: 'number', unit: 'W' }),
          evField({ label: 'Amps', obj: L.amps, type: 'number', unit: 'A' })
        ]));
        sc.appendChild(el('div', { class: 'row2' }, [
          evField({ label: 'MCA', obj: L.mca, type: 'number', unit: 'A' }),
          evField({ label: 'MOCP', obj: L.mocp, type: 'number', unit: 'A' })
        ]));
        sc.appendChild(field({ label: 'Location', value: L.location, oninput: function (v) { L.location = v; } }));
        sc.appendChild(field({ label: 'Notes', rows: 2, value: L.notes, oninput: function (v) { L.notes = v; } }));
        var lw = G.loadWatts(L);
        sc.appendChild(el('p', { class: 'tiny', style: 'margin-top:4px', text: lw ? 'Reads as ' + U.fmt(lw.w) + ' W, from ' + lw.basis + '.' : 'No usable nameplate data yet. This card cannot go into the calculation and it will hold the result.' }));
        list.appendChild(sc);
      });
    }
    paintList();

    stepWrap('w-loads', 'Major load cards', 'Step 6 of 9', [
      U.note('One card per nameplate', 'Anything over 1500 W gets its own card and its own label photo. Read the nameplate. If you cannot read it, set the evidence status to Cannot verify and say why in the notes. A missing value never becomes zero in this app, it holds the result instead.', ''),
      card('Loads on this property', null, [
        list,
        el('button', {
          class: 'btn wide', style: 'margin-top:6px', text: '+ Add a load card',
          onclick: function () {
            j.loads.push({
              kind: '', state: 'Existing, staying', makeModel: FC.ev(''), voltage: '240',
              w: FC.ev('W'), va: FC.ev('VA'), amps: FC.ev('A'), mca: FC.ev('A'), mocp: FC.ev('A'),
              location: '', notes: ''
            });
            FC.touch('Load card added'); paintList();
          }
        })
      ]),
      j.types.indexOf('ev') >= 0 ? evCard(j) : null,
      j.types.indexOf('tub') >= 0 ? tubCard(j) : null,
      (j.types.indexOf('ac') >= 0 || j.types.indexOf('hp') >= 0) ? hvacCard(j) : null
    ].filter(Boolean));
  }

  function evCard(j) {
    var e = j.ev;
    var est = el('p', { class: 'tiny' });
    function calc() {
      var k = G.evAnnualKwh(e);
      est.textContent = k
        ? 'Estimated home charging, about ' + U.fmt(k) + ' kWh a year. Assumption based, not measured. It is used for solar sizing context only, never for the service calculation.'
        : 'Enter annual kilometres and efficiency to estimate home charging energy.';
    }
    calc();
    return acc('EV charger', j.types.indexOf('ev') >= 0 ? 'Required' : '', 'warn', [
      U.note('Alberta rule on adjustable chargers', 'STANDATA 24-ECI-086. An adjustable EVSE is counted at its maximum adjustable setting unless an electrician sets it and it is secured behind a barrier. Record the maximum, not what the customer says they will use.', ''),
      field({ label: 'Status', options: ['Vehicle owned already', 'Vehicle ordered', 'Planning to buy', 'Preparing for resale value', 'Not sure yet'], value: e.status, onchange: function (v) { e.status = v; FC.touch(null); } }),
      field({ label: 'Vehicle', value: e.vehicle, oninput: function (v) { e.vehicle = v; } }),
      field({ label: 'Charger make and model', value: e.chargerMakeModel, oninput: function (v) { e.chargerMakeModel = v; FC.touch(null); } }),
      el('div', { class: 'row3' }, [
        field({ label: 'Volts', type: 'number', value: e.voltage, oninput: function (v) { e.voltage = v; } }),
        evField({ label: 'Max amps', obj: e.amps, type: 'number', unit: 'A' }),
        evField({ label: 'MOCP', obj: e.mocp, type: 'number', unit: 'A' })
      ]),
      field({ label: 'Sizing basis used', options: ['Maximum adjustable setting', 'Fixed rating, not adjustable', 'Set by an electrician and secured behind a barrier', 'Unknown'], hint: 'Anything other than the first two needs the Master Electrician to confirm the basis.', value: e.sizingUse, onchange: function (v) { e.sizingUse = v; FC.touch(null); } }),
      field({ label: 'Charger location', value: e.location, oninput: function (v) { e.location = v; FC.touch(null); } }),
      evField({ label: 'Run length, panel to charger', obj: e.routeLength, type: 'number', unit: 'm', hint: 'Walk it and pace it. Do not eyeball it from the driveway.' }),
      field({ label: 'Load management candidate', options: ['Not considered', 'EVEMS proposed, controls per Rule 8-500', 'Customer wants full rate, no management', 'Master to decide'], value: e.evemsCandidate, onchange: function (v) { e.evemsCandidate = v; FC.touch(null); } }),
      el('div', { class: 'row3' }, [
        field({ label: 'Annual km', type: 'number', value: e.annualKm, oninput: function (v) { e.annualKm = v; calc(); } }),
        field({ label: 'kWh per 100 km', type: 'number', value: e.efficiency, oninput: function (v) { e.efficiency = v; calc(); } }),
        field({ label: 'Charged at home', type: 'number', unit: '%', value: e.homeShare, oninput: function (v) { e.homeShare = v; calc(); } })
      ]),
      est
    ], true);
  }

  function tubCard(j) {
    var t = j.tub;
    return acc('Hot tub or spa', 'Required', 'warn', [
      evField({ label: 'Make and model', obj: t.makeModel }),
      el('div', { class: 'row3' }, [
        field({ label: 'Volts', type: 'number', value: t.voltage, oninput: function (v) { t.voltage = v; } }),
        evField({ label: 'Amps', obj: t.amps, type: 'number', unit: 'A' }),
        evField({ label: 'MOCP', obj: t.mocp, type: 'number', unit: 'A' })
      ]),
      field({ label: 'Existing or proposed', options: FC.LOAD_STATE, value: t.state, onchange: function (v) { t.state = v; FC.touch(null); } }),
      field({ label: 'Disconnect location', hint: 'Distance and line of sight from the tub.', value: t.disconnect, oninput: function (v) { t.disconnect = v; FC.touch(null); } }),
      field({ label: 'Heater and pump notes', rows: 2, value: t.heaterNotes, oninput: function (v) { t.heaterNotes = v; } }),
      field({ label: 'Route', rows: 2, value: t.route, oninput: function (v) { t.route = v; } })
    ], true);
  }

  function hvacCard(j) {
    var h = j.hvac;
    return acc('AC or heat pump', 'Required', 'warn', [
      U.note('Interlock question', 'Rule 8-106 3) only lets you count the greater of heating or cooling where interlocks are installed. No interlock and both loads count. Ask, look, and record what you actually saw.', ''),
      evField({ label: 'Outdoor unit make and model', obj: h.outdoorMakeModel }),
      el('div', { class: 'row3' }, [
        field({ label: 'Volts', type: 'number', value: h.voltage, oninput: function (v) { h.voltage = v; } }),
        evField({ label: 'MCA', obj: h.mca, type: 'number', unit: 'A' }),
        evField({ label: 'MOCP', obj: h.mocp, type: 'number', unit: 'A' })
      ]),
      evField({ label: 'Indoor unit make and model', obj: h.indoorMakeModel }),
      el('div', { class: 'row2' }, [
        evField({ label: 'Indoor MCA', obj: h.indoorMca, type: 'number', unit: 'A' }),
        evField({ label: 'Electric backup heat', obj: h.backupHeatKw, type: 'number', unit: 'kW' })
      ]),
      field({ label: 'Existing or proposed', options: FC.LOAD_STATE, value: h.state, onchange: function (v) { h.state = v; FC.touch(null); } }),
      field({ label: 'Relationship to existing heat', options: ['Replaces the furnace entirely', 'Works with the existing furnace, dual fuel', 'Supplemental only', 'Cooling only', 'Unknown'], value: h.relationship, onchange: function (v) { h.relationship = v; } }),
      field({ label: 'Simultaneous operation', req: true, options: ['Interlocked, cannot run together', 'Not interlocked, both can run', 'Unknown, needs verification'], value: h.interlock, onchange: function (v) { h.interlock = v; FC.touch('Interlock status set'); } }),
      field({ label: 'HVAC contractor quote reference', value: h.quoteRef, oninput: function (v) { h.quoteRef = v; } }),
      field({ label: 'Disconnect and route', rows: 2, value: h.route, oninput: function (v) { h.route = v; } })
    ], true);
  }

  /* ------------------------------------------------------- 7 photos */
  function vPhotos() {
    var j = FC.active(); if (!j) return go('home');
    var pack = G.photoPackFor(j);
    var wrap = el('div');

    function paint() {
      U.clear(wrap);
      var done = 0;
      pack.forEach(function (p) {
        var rec = j.photos[p.k] || (j.photos[p.k] = { state: '', data: '', reason: '', owner: '', due: '', at: '', by: '' });
        var ok = rec.state === 'Captured' ? !!rec.data : (rec.state && rec.reason && rec.owner);
        if (ok) done++;
        var box = el('div', { class: 'ph ' + (ok ? 'done' : rec.state ? 'pend' : '') });
        box.appendChild(el('div', { class: 'top' }, [
          el('b', { text: p.label + (p.req ? ' *' : '') }),
          rec.data ? el('img', { class: 'thumb', src: rec.data, alt: p.label }) : null
        ]));
        box.appendChild(el('p', { class: 'hint', text: p.hint }));

        var acts = el('div', { class: 'acts' });
        var lab = el('label', { class: 'btn sm cam' }, [
          rec.data ? 'Retake' : 'Take photo',
          el('input', {
            type: 'file', accept: 'image/*', capture: 'environment',
            onchange: function (e) {
              var f = e.target.files[0]; if (!f) return;
              U.toast('Processing photo');
              U.downscale(f, function (d) {
                if (!d) return U.toast('Could not read that photo.');
                rec.data = d; rec.state = 'Captured';
                rec.at = FC.nowISO(); rec.by = FC.roleObj().name;
                rec.reason = ''; rec.owner = ''; rec.due = '';
                FC.touch('Photo captured, ' + p.label);
                FC.setPhoto(p.k, rec).then(function (ok) {
                  U.toast(ok ? 'Photo saved on this phone' : 'Photo could not be saved. Export the job now.');
                  paint();
                });
                paint();
              });
            }
          })
        ]);
        acts.appendChild(lab);
        acts.appendChild(el('button', {
          class: 'btn sm gho', text: 'Cannot get it',
          onclick: function () { rec.state = rec.state === 'Captured' || !rec.state ? 'Cannot capture' : rec.state; rec.data = ''; FC.setPhoto(p.k, rec); FC.touch(null); paint(); }
        }));
        box.appendChild(acts);

        if (rec.state && rec.state !== 'Captured') {
          box.appendChild(el('div', { style: 'margin-top:12px' }, [
            field({ label: 'Why not', options: FC.PHOTO_STATES.filter(function (s) { return s !== 'Captured'; }), value: rec.state, onchange: function (v) { rec.state = v; FC.touch(null); paint(); } }),
            rec.state === 'Not applicable' ? null : field({ label: 'Reason', req: true, rows: 2, hint: 'Plain words. Locked room, no ladder, live gear, customer said no.', value: rec.reason, oninput: function (v) { rec.reason = v; FC.touch(null); } }),
            rec.state === 'Not applicable' ? null : el('div', { class: 'row2' }, [
              field({ label: 'Follow up owner', req: true, value: rec.owner, oninput: function (v) { rec.owner = v; FC.touch(null); } }),
              field({ label: 'Due date', type: 'date', value: rec.due, oninput: function (v) { rec.due = v; } })
            ])
          ].filter(Boolean)));
          if (rec.state === 'Not applicable') { rec.reason = rec.reason || 'Not present on this property'; rec.owner = rec.owner || FC.roleObj().name; }
        } else if (rec.state === 'Captured') {
          box.appendChild(el('p', { class: 'tiny', style: 'margin-top:8px', text: 'Captured by ' + rec.by + ' on ' + FC.stamp(rec.at) + '.' }));
        }
        wrap.appendChild(box);
      });
      ringHost.replaceChild(U.ring(pack.length ? done / pack.length * 100 : 0, done + ' of ' + pack.length + ' recorded',
        'Every required shot is either captured or has a reason, an owner and a due date.'), ringHost.firstChild);
    }

    var ringHost = el('div', { class: 'card' }, U.ring(0, '', ''));
    paint();

    stepWrap('w-photos', 'Photo proof pack', 'Step 7 of 9', [
      ringHost,
      U.note('Nothing is skipped silently', 'If a shot cannot be taken, it needs a state, a written reason, a named follow up owner and a due date. Photos stay on this phone. They only travel in an exported job file.', ''),
      wrap
    ]);
  }

  /* ------------------------------------------------------- 9 flags */
  function vFlags() {
    var j = FC.active(); if (!j) return go('home');
    var list = el('div');
    function paint() {
      U.clear(list);
      if (!j.flags.length) list.appendChild(el('p', { class: 'mut', text: 'Nothing flagged. If you saw something that bothered you, put it here rather than mentioning it in the truck later.' }));
      j.flags.forEach(function (f, i) {
        var sc = el('div', { class: 'subcard' });
        sc.appendChild(el('div', { class: 'hd' }, [
          el('b', { text: f.severity || 'New flag' }),
          el('button', { class: 'xbtn', text: '×', onclick: function () { j.flags.splice(i, 1); FC.touch(null); paint(); } })
        ]));
        sc.appendChild(field({ label: 'How serious', options: ['Observation', 'Needs attention', 'Blocker', 'Safety risk'], value: f.severity, onchange: function (v) { f.severity = v; FC.touch('Site flag set to ' + v); paint(); } }));
        sc.appendChild(field({ label: 'What you saw', rows: 3, value: f.note, oninput: function (v) { f.note = v; FC.touch(null); } }));
        sc.appendChild(field({ label: 'Where', value: f.where, oninput: function (v) { f.where = v; } }));
        if (f.severity === 'Safety risk' || f.severity === 'Blocker') {
          sc.appendChild(U.note('This holds the job', 'A blocker or a safety risk puts the screen on Master Review Hold until the Master Electrician has looked at it.', 'danger'));
        }
        list.appendChild(sc);
      });
    }
    paint();

    stepWrap('w-flags', 'Site flags and notes', 'Step 9 of 9', [
      card('Anything that looked wrong', null, [
        list,
        el('button', {
          class: 'btn wide', style: 'margin-top:6px', text: '+ Add a flag',
          onclick: function () { j.flags.push({ severity: 'Observation', note: '', where: '' }); FC.touch(null); paint(); }
        })
      ]),
      card('Clamp meter readings', null, [
        U.note('Supporting evidence only', 'A clamp reading is a snapshot, not a demand study. It never substitutes for the Section 8 calculation. It is recorded because it is useful context for the Master Electrician.', ''),
        clampList(j)
      ])
    ]);
  }

  function clampList(j) {
    var box = el('div');
    function paint() {
      U.clear(box);
      j.clamp.forEach(function (c, i) {
        box.appendChild(el('div', { class: 'subcard' }, [
          el('div', { class: 'hd' }, [
            el('b', { text: c.where || 'Reading ' + (i + 1) }),
            el('button', { class: 'xbtn', text: '×', onclick: function () { j.clamp.splice(i, 1); paint(); FC.touch(null); } })
          ]),
          field({ label: 'Where the clamp was', value: c.where, oninput: function (v) { c.where = v; paint2(); } }),
          el('div', { class: 'row3' }, [
            field({ label: 'Leg A', type: 'number', unit: 'A', value: c.a, oninput: function (v) { c.a = v; } }),
            field({ label: 'Leg B', type: 'number', unit: 'A', value: c.b, oninput: function (v) { c.b = v; } }),
            field({ label: 'Time', type: 'time', value: c.time, oninput: function (v) { c.time = v; } })
          ]),
          field({ label: 'What was running', rows: 2, value: c.running, oninput: function (v) { c.running = v; } })
        ]));
      });
      box.appendChild(el('button', {
        class: 'btn wide sm', text: '+ Add a clamp reading',
        onclick: function () { j.clamp.push({ where: '', a: '', b: '', time: '', running: '' }); FC.touch(null); paint(); }
      }));
    }
    function paint2() { FC.touch(null); }
    paint();
    return box;
  }

  /* ---------------------------------------------------------------- router */
  function render() {
    mount();
    var r = readHash();
    App.view = r.view; App.arg = r.arg;
    var map = {
      home: vHome, changelog: vChangelog, job: vJob,
      'w-header': vHeader, 'w-juris': vJuris, 'w-types': vTypes, 'w-service': vService,
      'w-area': vArea, 'w-loads': vLoads, 'w-photos': vPhotos, 'w-flags': vFlags
    };
    var fn = map[r.view] || (global.FCViews && global.FCViews[r.view]) || vHome;
    try { fn(); }
    catch (e) { U.clear(body); body.appendChild(U.note('Something went wrong on this screen', String(e && e.message || e), 'danger')); bar([el('button', { class: 'btn wide', text: 'Back to home', onclick: function () { go('home'); } })]); }
  }

  App.render = render;
  App.header = header;
  App.bar = bar;
  App.fieldNotice = fieldNotice;
  App.download = download;
  global.App = App;

  /* Only nag about closing when the data genuinely will not survive it. A
     warning that fires when nothing is at risk gets dismissed on reflex, and
     then it is not there on the day it matters. */
  global.addEventListener('beforeunload', function (e) {
    var tier = FC.state.tier;
    if (tier && tier.durable) return;
    if (!FC.state.jobs.length) return;
    var open = FC.state.jobs.some(function (j) { return !(j.review && j.review.approved); });
    if (!open) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  global.addEventListener('hashchange', render);
  document.addEventListener('DOMContentLoaded', function () {
    mount();
    FC.onSave = function (err) {
      var d = top && top.querySelector('.savedot');
      if (!d) return;
      d.classList.toggle('stale', !!err);
      d.querySelector('span').textContent = err ? 'NOT SAVED' : 'Saved';
    };
    FC.restore(function () { render(); });
    render();
    if ('serviceWorker' in global.navigator) {
      global.navigator.serviceWorker.register('sw.js').catch(function () { /* offline is a bonus, not a requirement */ });
    }
  });
})(window);
