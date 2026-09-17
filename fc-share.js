/* Raydn FieldCalc: getting a job off the phone.

   Four routes, cheapest and easiest first. Nothing here needs an account, a
   server, or a subscription except route 4, which is a free Google Apps Script
   sitting in Dmitry's own Drive.

     1. Share sheet.  navigator.share with files. On a phone this opens the
        normal Android or iOS share tray, so the job file and the report go to
        Gmail, Drive, Messages, WhatsApp, anything installed. Best route.
     2. Email.        A prefilled mailto with the summary in the body. Works
        everywhere, including desktop. Cannot carry an attachment, which is a
        mail standard limit and not something the app can work around, so the
        app downloads the file at the same time and says so.
     3. Download.     Plain file save. Always available, final fallback.
     4. Job log.      POST to a Google Apps Script that appends a row to a
        shared Google Sheet and drops the full job JSON into a Drive folder.
        Optional. Paste the URL once in Settings and it stays on.

   Route 4 posts as text/plain on purpose. That is a CORS simple request, so
   the browser does not send a preflight, which Apps Script cannot answer. */
(function (global) {
  'use strict';

  var FC = global.FC;

  function canShareFiles(files) {
    try {
      return !!(global.navigator && global.navigator.canShare &&
                global.navigator.canShare({ files: files }));
    } catch (e) { return false; }
  }

  function jobFileName(j, ext) {
    var who = (j.header.customer || 'job').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
    return 'FieldCalc-' + who + '-' + (j.id || '').slice(0, 6) + '.' + ext;
  }

  /* A short plain text summary. This is what lands in an email body, so it has
     to stand on its own without the app, and it has to carry the field notice
     because an unreviewed number leaving the phone is the whole risk. */
  function summary(j, st) {
    var L = [];
    var G = global.FCGates;
    L.push('RAYDN FIELDCALC, FIELD RECORD');
    L.push('');
    L.push('Customer: ' + (j.header.customer || 'not recorded'));
    L.push('Address: ' + (j.header.address || 'not recorded'));
    L.push('Phone: ' + (j.header.phone || 'not recorded'));
    L.push('Authority: ' + (j.juris.authority || 'not recorded') + ', wires owner ' + (j.juris.utility || 'not recorded'));
    L.push('Walked by: ' + (j.rep && FC.ROLES[j.rep] ? FC.ROLES[j.rep].name : j.rep || 'not recorded'));
    L.push('Date: ' + FC.stamp(j.updated || j.created));
    L.push('');
    L.push('STATUS: ' + (FC.STATUS[st.key] ? FC.STATUS[st.key].label : st.key));
    if (st.calc && st.calc.totalW) {
      L.push('Calculated load: ' + Math.round(st.calc.totalW) + ' W, ' + st.calc.amps.toFixed(1) + ' A');
      L.push('Existing service: ' + (FC.evNum(j.service.serviceRating) || 'not recorded') + ' A');
    } else {
      L.push('No calculation yet. Required inputs are still missing.');
    }
    L.push('Field packet: ' + st.packet.done + ' of ' + st.packet.total + ' items recorded');
    L.push('');
    if (st.reasons && st.reasons.length) {
      L.push('OPEN ITEMS, ' + st.reasons.length + ':');
      st.reasons.slice(0, 20).forEach(function (r) { L.push('  ' + r); });
      if (st.reasons.length > 20) L.push('  plus ' + (st.reasons.length - 20) + ' more, see the app.');
      L.push('');
    }
    var assumed = G && G.assumedFields ? G.assumedFields(j) : [];
    if (assumed.length) {
      L.push('VALUES STILL TAGGED ASSUMPTION, ' + assumed.length + ':');
      assumed.forEach(function (a) { L.push('  ' + a); });
      L.push('');
    }
    L.push(FC.FIELD_NOTICE);
    L.push('');
    L.push('Dmitry Naboka, Master Electrician, ME# 13824');
    L.push('(780) 904-3462 | info@raydnrenewables.com | raydnrenewables.com');
    return L.join('\n');
  }

  var Share = {
    canShareFiles: function () {
      try {
        return !!(global.navigator && global.navigator.share && global.navigator.canShare);
      } catch (e) { return false; }
    },
    summary: summary,
    jobFileName: jobFileName,

    /* Route 1. Native share tray with the job file and the summary attached. */
    shareJob: function (j, st, opts) {
      opts = opts || {};
      var files = [];
      try {
        files.push(new File([FC.exportJob(j, true)], jobFileName(j, 'json'), { type: 'application/json' }));
        if (opts.reportText) {
          files.push(new File([opts.reportText], jobFileName(j, 'txt'), { type: 'text/plain' }));
        }
      } catch (e) { return Promise.reject(new Error('This browser cannot build the file.')); }

      var payload = {
        title: 'FieldCalc, ' + (j.header.customer || 'job'),
        text: summary(j, st)
      };
      if (canShareFiles(files)) payload.files = files;
      if (!global.navigator || !global.navigator.share) {
        return Promise.reject(new Error('No share tray on this device.'));
      }
      return global.navigator.share(payload);
    },

    /* Route 2. Prefilled email. No attachment, that is a mail limit. */
    mailtoHref: function (j, st, to) {
      var subj = 'FieldCalc field record, ' + (j.header.customer || 'job') +
                 (j.header.address ? ', ' + j.header.address : '');
      var body = summary(j, st);
      return 'mailto:' + (to || '') +
        '?subject=' + encodeURIComponent(subj) +
        '&body=' + encodeURIComponent(body);
    },

    /* Route 4. Append a row to the shared Google Sheet job log.
       The pass phrase is held on the device and typed in once, never written
       into this file, because this file is public and a pass phrase sitting in
       public code is not a pass phrase. */
    pushToSheet: function (j, st, url, secret) {
      if (!url) return Promise.reject(new Error('No job log URL is set. Add it in Settings.'));
      var G = global.FCGates;
      var row = {
        secret: secret || '',
        jobId: j.id,
        recordedAt: FC.nowISO(),
        walkedBy: (j.rep && FC.ROLES[j.rep] ? FC.ROLES[j.rep].name : j.rep || ''),
        customer: j.header.customer || '',
        address: j.header.address || '',
        phone: j.header.phone || '',
        leadSource: j.header.leadSource || '',
        authority: j.juris.authority || '',
        utility: j.juris.utility || '',
        jobTypes: (j.types || []).join(', '),
        existingServiceA: FC.evNum(j.service.serviceRating) || '',
        mainBreakerA: FC.evNum(j.service.mainBreaker) || '',
        busRatingA: FC.evNum(j.service.busRating) || '',
        calculatedW: st.calc ? Math.round(st.calc.totalW) : '',
        calculatedA: st.calc ? Number(st.calc.amps.toFixed(1)) : '',
        status: FC.STATUS[st.key] ? FC.STATUS[st.key].label : st.key,
        packet: st.packet.done + ' of ' + st.packet.total,
        openItems: (st.reasons || []).length,
        assumedValues: (G && G.assumedFields ? G.assumedFields(j) : []).join(' | '),
        masterApproved: j.review && j.review.approved ? 'Yes' : 'No',
        notice: FC.FIELD_NOTICE,
        jobJson: FC.exportJob(j, false)
      };
      return global.fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(row)
      }).then(function (r) {
        if (!r.ok) throw new Error('The job log returned ' + r.status + '.');
        return r.text();
      }).then(function (t) {
        var d = {};
        try { d = JSON.parse(t); } catch (e) { throw new Error('The job log replied with something unreadable. Check the deployment is set to Anyone.'); }
        if (!d.ok) throw new Error(d.error || 'The job log refused the row.');
        return d;
      });
    }
  };

  global.FCShare = Share;
})(window);
