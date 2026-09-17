/* Raydn FieldCalc: the Send screen and the Settings screen. */
(function (global) {
  'use strict';

  var FC = global.FC, G = global.FCGates, U = global.UI, S = global.FCShare, App = global.App;
  var el = U.el, field = U.field, card = U.card;
  function go(v) { global.App.go(v); }

  /* ================================================== send a job ========= */
  function vSend() {
    var j = FC.active();
    if (!j) { go('home'); return; }
    var st = G.status(j);
    App.header('Send this job', j.header.customer || 'Untitled job', 'job');
    var body = U.clear(document.getElementById('fc-body'));

    var approved = !!(j.review && j.review.approved);
    if (!approved) {
      body.appendChild(U.note('Not reviewed yet',
        'This has not been through Master Review, so everything that leaves the phone carries the preliminary notice and no code compliance wording. That is on purpose. Send it to Dmitry, not to the customer.', 'warn'));
    }

    /* What is about to leave the phone, shown before it leaves. */
    var pics = Object.keys(j.photos || {}).filter(function (k) { return j.photos[k].data; }).length;
    var assumed = G.assumedFields(j);
    body.appendChild(card('What gets sent', null, [
      U.table(['Item', 'Detail'], [
        { cells: [{ t: 'Status' }, { t: FC.STATUS[st.key] ? FC.STATUS[st.key].label : st.key }] },
        { cells: [{ t: 'Calculated load' }, { t: st.calc ? Math.round(st.calc.totalW) + ' W, ' + st.calc.amps.toFixed(1) + ' A' : 'No result yet' }] },
        { cells: [{ t: 'Field packet' }, { t: st.packet.done + ' of ' + st.packet.total + ' recorded' }] },
        { cells: [{ t: 'Photos attached' }, { t: String(pics) }] },
        { cells: [{ t: 'Values still assumed' }, { t: assumed.length ? String(assumed.length) : 'None' }] }
      ])
    ]));

    /* Route 1, the share tray. */
    var shareCard = card('Send it now', null, []);
    if (S.canShareFiles()) {
      shareCard.appendChild(el('p', { class: 'mut', text: 'Opens your phone share tray with the job file attached. From there it goes to Gmail, Drive, Messages, anything installed.' }));
      shareCard.appendChild(el('button', {
        class: 'btn pri wide', style: 'margin-top:12px', text: 'Open share tray',
        onclick: function () {
          S.shareJob(j, st, { reportText: S.summary(j, st) })
            .then(function () { FC.touch('Job shared from the phone'); U.toast('Sent'); })
            .catch(function (e) {
              if (e && e.name === 'AbortError') return;
              U.toast('Share tray refused. Use email or download instead.');
            });
        }
      }));
    } else {
      shareCard.appendChild(el('p', { class: 'mut', text: 'This device has no share tray, which is normal on a desktop browser. Use email or download below.' }));
    }
    body.appendChild(shareCard);

    /* Route 2, email. */
    var to = { v: 'info@raydnrenewables.com' };
    body.appendChild(card('Email it', null, [
      field({
        label: 'Send to', type: 'email', value: to.v,
        hint: 'Opens your mail app with the whole summary already written in the body.',
        oninput: function (v) { to.v = v; }
      }),
      el('button', {
        class: 'btn wide', style: 'margin-top:4px', text: 'Open email',
        onclick: function () {
          App.download(FC.exportJob(j, true), S.jobFileName(j, 'json'), 'application/json');
          global.location.href = S.mailtoHref(j, st, to.v);
          FC.touch('Emailed from the phone');
          U.toast('Mail app opening. The job file downloaded separately, attach it if you need the photos.');
        }
      }),
      el('p', { class: 'tiny', style: 'margin-top:8px', text: 'Email cannot carry an attachment from a web link. That is a mail standard limit, not the app. The summary goes in the body and the job file downloads at the same time so you can attach it yourself.' })
    ]));

    /* Route 4, the shared job log. */
    var logCard = card('Push to the shared job log', null, []);
    if (!FC.state.sheetUrl) {
      logCard.appendChild(el('p', { class: 'mut', text: 'Not set up yet. One paste in Settings turns on a shared Google Sheet that every walkdown writes a row to, with the full record saved in Drive behind it.' }));
      logCard.appendChild(el('button', { class: 'btn wide', style: 'margin-top:12px', text: 'Set up the job log', onclick: function () { go('settings'); } }));
    } else {
      logCard.appendChild(el('p', { class: 'mut', text: 'Writes one row to the Raydn FieldCalc Job Log and saves the full record in Drive. Sending the same job again updates its row instead of adding a second one.' }));
      var out = el('div', { style: 'margin-top:12px' });
      logCard.appendChild(el('button', {
        class: 'btn pri wide', text: 'Push to the job log',
        onclick: function (e) {
          var b = e.currentTarget; b.disabled = true; b.textContent = 'Sending';
          S.pushToSheet(j, st, FC.state.sheetUrl, FC.state.sheetSecret).then(function (d) {
            b.disabled = false; b.textContent = 'Push to the job log';
            U.clear(out).appendChild(U.note(d.updated ? 'Row updated' : 'Row added',
              'Row ' + d.row + ' in the job log.' + (d.driveFile ? ' Full record saved in Drive.' : ''), 'good'));
            FC.touch('Pushed to the shared job log');
          }).catch(function (err) {
            b.disabled = false; b.textContent = 'Push to the job log';
            U.clear(out).appendChild(U.note('It did not go through', String(err.message || err), 'warn'));
          });
        }
      }));
      logCard.appendChild(out);
    }
    body.appendChild(logCard);

    /* Route 3, plain file. */
    body.appendChild(card('Just save the file', null, [
      el('p', { class: 'mut', text: 'The job file holds everything, including the photos. Import it on another phone to carry on.' }),
      el('div', { style: 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap' }, [
        el('button', {
          class: 'btn sm', style: 'flex:1;min-width:150px', text: 'With photos',
          onclick: function () { App.download(FC.exportJob(j, true), S.jobFileName(j, 'json'), 'application/json'); }
        }),
        el('button', {
          class: 'btn sm gho', style: 'flex:1;min-width:150px', text: 'Data only, smaller',
          onclick: function () { App.download(FC.exportJob(j, false), S.jobFileName(j, 'json'), 'application/json'); }
        })
      ])
    ]));

    App.bar([
      el('button', { class: 'btn gho', style: 'flex:1', text: 'Back', onclick: function () { go('job'); } }),
      el('button', { class: 'btn pri', style: 'flex:1', text: 'Reports', onclick: function () { go('reports'); } })
    ]);
  }

  /* ================================================== settings =========== */
  function vSettings() {
    App.header('Settings', 'Storage, job log, about', 'home');
    var body = U.clear(document.getElementById('fc-body'));

    /* Where the data actually is, in plain words, measured not assumed. */
    var tier = FC.state.tier || { key: 'tab', label: 'Unknown', durable: false };
    var storeCard = card('Where your work is saved', null, []);
    storeCard.appendChild(U.band(tier.durable ? 'good' : 'warn', tier.label, null, null,
      tier.key === 'full' ? 'Jobs and photos are on this phone. They survive closing the app and restarting the phone.'
      : tier.key === 'nophotos' ? 'Jobs survive closing the app. Photos are held in memory only on this device, so export the job before you close it.'
      : 'This browser has device storage switched off. Nothing survives closing the tab. Export every job as soon as you finish it.'));
    var usage = el('p', { class: 'tiny', style: 'margin-top:10px', text: 'Checking space' });
    storeCard.appendChild(usage);
    if (global.FCDisk) {
      global.FCDisk.usage().then(function (u) {
        if (!u || !u.quota) { usage.textContent = 'This browser does not report how much space is left.'; return; }
        usage.textContent = 'Using about ' + (u.used / 1048576).toFixed(1) + ' MB of roughly ' +
          (u.quota / 1048576).toFixed(0) + ' MB available on this phone.';
      });
      global.FCDisk.persist().then(function (ok) {
        if (ok) storeCard.appendChild(el('p', { class: 'tiny', text: 'This phone has agreed not to clear FieldCalc data to free up space.' }));
      });
    }
    body.appendChild(storeCard);

    /* The shared job log. */
    var urlBox = { v: FC.state.sheetUrl || '' };
    var secretBox = { v: FC.state.sheetSecret || '' };
    var testOut = el('div', { style: 'margin-top:12px' });
    body.appendChild(card('Shared job log, optional', null, [
      el('p', { class: 'mut', text: 'Turns on a shared Google Sheet in Dmitry\u2019s Drive. Every walkdown pushed from any phone writes one row, and the full record lands in a Drive folder behind it. Free, no account needed on the phone. Setup is one paste, in the file called FieldCalc-JobLog.gs.' }),
      field({
        label: 'Job log URL', value: urlBox.v, type: 'url',
        hint: 'The Apps Script web app address. It ends in /exec.',
        oninput: function (v) { urlBox.v = v.trim(); }
      }),
      field({
        label: 'Pass phrase', value: secretBox.v,
        hint: 'Whatever you set SECRET to at the top of the script. The app code is public, so this has to be typed in here rather than built in.',
        oninput: function (v) { secretBox.v = v.trim(); }
      }),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        el('button', {
          class: 'btn sm pri', style: 'flex:1;min-width:140px', text: 'Save',
          onclick: function () {
            if (urlBox.v && urlBox.v.indexOf('/exec') === -1) {
              return U.clear(testOut).appendChild(U.note('That does not look right', 'A deployed Apps Script web app URL ends in /exec. Copy it again from the Deploy panel.', 'warn'));
            }
            FC.state.sheetUrl = urlBox.v; FC.state.sheetSecret = secretBox.v; FC.save();
            U.clear(testOut).appendChild(U.note('Saved', urlBox.v ? 'The job log is on. It stays on for every job from now on.' : 'The job log is off.', 'good'));
          }
        }),
        el('button', {
          class: 'btn sm gho', style: 'flex:1;min-width:140px', text: 'Send a test row',
          onclick: function (e) {
            var url = urlBox.v || FC.state.sheetUrl;
            if (!url) return U.clear(testOut).appendChild(U.note('Nothing to test', 'Paste the URL first.', 'warn'));
            var b = e.currentTarget; b.disabled = true; b.textContent = 'Testing';
            var probe = FC.blankJob(FC.state.role || 'other');
            probe.header.customer = 'TEST ROW, delete me';
            probe.header.address = 'Connection test from FieldCalc';
            S.pushToSheet(probe, G.status(probe), url, secretBox.v || FC.state.sheetSecret).then(function (d) {
              b.disabled = false; b.textContent = 'Send a test row';
              U.clear(testOut).appendChild(U.note('It works', 'A test row landed at row ' + d.row + '. Open the sheet and delete it.', 'good'));
            }).catch(function (err) {
              b.disabled = false; b.textContent = 'Send a test row';
              var msg = String(err.message || err);
              if (err.answered) {
                /* Reached the script and got a real answer back. */
                var tip = /secret/i.test(msg)
                  ? 'The URL is right and the script is running. The pass phrase here does not match the SECRET line in the script. Two things to check. First, that you actually changed SECRET in the script and saved it. Second, and this is the one that catches people, Apps Script keeps serving the version you deployed, not the code you just saved. After editing SECRET go to Deploy, Manage deployments, hit the pencil, set Version to New version, then Deploy.'
                  : 'The script is running and it answered. Fix what it said above and try again.';
                U.clear(testOut).appendChild(U.note('The script answered and said no', msg + ' ' + tip, 'warn'));
              } else {
                U.clear(testOut).appendChild(U.note('Could not reach the job log', msg + ' Check the URL ends in /exec, and that the deployment is set to Execute as Me and Who has access Anyone.', 'warn'));
              }
            });
          }
        })
      ]),
      testOut
    ]));

    body.appendChild(card('About', null, [
      U.table(['', ''], [
        { cells: [{ t: 'App' }, { t: 'Raydn FieldCalc ' + FC.version }] },
        { cells: [{ t: 'Code edition' }, { t: FC.CEC_VERSION }] },
        { cells: [{ t: 'Signed in as' }, { t: FC.roleObj().name + ', ' + FC.roleObj().title }] },
        { cells: [{ t: 'Jobs on this phone' }, { t: String(FC.state.jobs.length) }] },
        { cells: [{ t: 'Last saved' }, { t: FC.state.lastSaved ? FC.stamp(FC.state.lastSaved) : 'Not yet' }] }
      ]),
      el('p', { class: 'tiny', style: 'margin-top:12px', text: FC.INTERNAL_NOTICE })
    ]));

    App.bar([el('button', { class: 'btn wide', text: 'Home', onclick: function () { go('home'); } })]);
  }

  global.FCViews = global.FCViews || {};
  global.FCViews.send = vSend;
  global.FCViews.settings = vSettings;
})(window);
