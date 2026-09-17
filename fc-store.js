/* =========================================================================
   Raydn FieldCalc  ::  fc-store.js
   Job model, roles, evidence values, in session persistence, JSON in and out.

   Storage note. The preview host blocks every browser storage API. The job
   record is persisted in window.name, which survives a reload in the same tab,
   and the JSON export is the real backup. Photos are held in memory and are
   written into the export file when asked for.
   ========================================================================= */
(function (global) {
  'use strict';

  var VERSION = '2.0.0';
  var SCHEMA = 2;
  var CEC_VERSION = 'CSA C22.1:24, Canadian Electrical Code Part I, 26th edition. Declared in force in Alberta April 1, 2025.';

  var CHANGELOG = [
    {
      v: '2.0.0', d: '2026-09-05', title: 'Raydn FieldCalc V1.0, Field Evidence',
      items: [
        'Renamed the product to Raydn FieldCalc. Load, Site, Solar Proof.',
        'Phone first home screen with role selector, recent jobs and save state.',
        'Guided Walkdown for non electricians. Facts and photos only, no technical decisions.',
        'Photo proof pack with Captured, Not applicable, Cannot capture, Unsafe access and Follow up, each with a reason, an owner and a due date.',
        'Major load nameplate cards with existing versus proposed and per field evidence status.',
        'Evidence metadata on every critical value. Source, status, who entered it, who verified it.',
        'Unknown or verify state so a missing value never silently becomes zero.',
        'Jurisdiction and wires owner required before scope, with the Alberta presets.',
        'Field packet completeness meter and blocker list.',
        'Master Review lock. Only the Master Electrician releases a conclusion.',
        'Override log with a required written reason on every change.',
        'Statuses: Incomplete field packet, Master review hold, Pass preliminary, Tight review required, Needs EVEMS review, Upgrade review, Master approved. No automatic fail.',
        'Transparent CEC ledger on the unchanged validated engine from v1.0.',
        'Wire and voltage drop screening with an explicit ampacity review gate.',
        'Solar walkdown: roof planes, shade, 12 month kWh with bill quality, snowbird pattern, Rule 024 annual use alignment.',
        'Three reports: internal field report, customer next steps, proposal handoff. All print to PDF.',
        'JSON export and import, with or without photos.',
        'v1.0 calculator frozen as raydn-cec-loadcalc-v1-backup. engine.js unchanged.'
      ]
    }
  ];

  /* ---------------- roles ---------------- */
  var ROLES = {
    master: { key: 'master', name: 'Dmitry Naboka', title: 'Master Electrician, ME# 13824', canReview: true,  short: 'Master' },
    kyle:   { key: 'kyle',   name: 'Kyle Verbeek',  title: 'Journeyman, co-owner. Evidence capture only', canReview: false, short: 'Journeyman' },
    brian:  { key: 'brian',  name: 'Brian',         title: 'Crew, evidence capture only',   canReview: false, short: 'Crew' },
    ryan:   { key: 'ryan',   name: 'Ryan',          title: 'Crew, evidence capture only',   canReview: false, short: 'Crew' },
    ronny:  { key: 'ronny',  name: 'Ronny',         title: 'Crew, evidence capture only',   canReview: false, short: 'Crew' },
    other:  { key: 'other',  name: 'Someone else',  title: 'Evidence capture only',         canReview: false, short: 'Crew' }
  };

  var FIELD_NOTICE =
    'Preliminary field screen only. Master Electrician review required before design, pricing, permit, ' +
    'utility submission, or customer facing code compliance recommendation.';

  var INTERNAL_NOTICE =
    'Decision support only. Final design and code compliance require Master Electrician review, applicable ' +
    'authority requirements, manufacturer instructions, and current code verification.';

  var JURISDICTION_WARNING =
    'Utility process, permit path, service equipment responsibility and cost vary by jurisdiction and wires owner. ' +
    'Do not use another municipality process by default.';

  /* ---------------- jurisdiction presets ---------------- */
  var JURISDICTIONS = [
    { k: 'epcor-edm',    label: 'City of Edmonton, EPCOR',                authority: 'City of Edmonton', utility: 'EPCOR' },
    { k: 'fortis-sg',    label: 'City of Spruce Grove, FortisAlberta',    authority: 'City of Spruce Grove', utility: 'FortisAlberta' },
    { k: 'fortis-strath',label: 'Strathcona County, Sherwood Park, FortisAlberta', authority: 'Strathcona County', utility: 'FortisAlberta' },
    { k: 'other',        label: 'Other Alberta authority, name it below', authority: '', utility: '' },
    { k: 'unknown',      label: 'Unknown, this puts the job on Master Review Hold', authority: '', utility: '' }
  ];

  /* ---------------- job types ---------------- */
  var JOB_TYPES = [
    { k: 'service', label: 'Service or panel upgrade' },
    { k: 'ev',      label: 'EV charger' },
    { k: 'tub',     label: 'Hot tub or spa' },
    { k: 'ac',      label: 'AC condenser' },
    { k: 'hp',      label: 'Heat pump' },
    { k: 'solar',   label: 'Residential solar' },
    { k: 'ess',     label: 'Battery or ESS' },
    { k: 'gen',     label: 'Generator or transfer switch' },
    { k: 'garage',  label: 'Garage or shop' },
    { k: 'suite',   label: 'Basement suite or addition' },
    { k: 'reno',    label: 'Renovation' },
    { k: 'vd',      label: 'Long feeder, voltage drop' },
    { k: 'led',     label: 'Commercial LED or lighting' },
    { k: 'rv',      label: 'RV or off-grid' }
  ];

  var LEAD_SOURCES = ['Flyer', 'Neighbour', 'Repeat customer', 'Google', 'Website', 'Referral', 'Partner', 'Yard sign', 'Other'];
  var STAGES = ['Draft', 'Walkdown', 'Evidence Missing', 'Master Review', 'Proposal Ready', 'Submitted', 'Complete'];

  /* ---------------- evidence value model ---------------- */
  var SOURCES = ['Nameplate photo', 'Customer statement', 'Existing drawing', 'Field measurement', 'Utility bill', 'Assumption'];
  var AREA_SOURCES = ['Municipal property record', 'Field measurement', 'Existing drawing', 'Customer statement', 'Assumption'];
  var EV_STATUS = ['Verified', 'Pending', 'Cannot verify', 'Not applicable'];

  function ev(unit) {
    return {
      value: '', unit: unit || '', source: '', evidenceStatus: 'Pending',
      evidenceReference: '', enteredBy: '', enteredAt: '',
      verifiedBy: '', verifiedAt: '', notes: ''
    };
  }
  function evVal(o) {
    if (o === null || o === undefined) return '';
    if (typeof o === 'object') return o.value === undefined ? '' : o.value;
    return o;
  }
  function evNum(o) {
    var v = evVal(o);
    if (v === '' || v === null || v === undefined) return null;   // null, never a silent zero
    var x = Number(v);
    return isFinite(x) ? x : null;
  }
  function evKnown(o) {
    if (!o || typeof o !== 'object') return String(o || '').trim() !== '';
    if (o.evidenceStatus === 'Cannot verify') return false;
    return String(o.value || '').trim() !== '';
  }

  /* ---------------- statuses, section 9 of the addendum ---------------- */
  var STATUS = {
    INCOMPLETE: { key: 'INCOMPLETE', label: 'Incomplete field packet', tone: 'warn',
      blurb: 'Required evidence or key inputs are missing. The packet cannot go to review yet.' },
    HOLD: { key: 'HOLD', label: 'Master review hold', tone: 'warn',
      blurb: 'Uncertainty on site, unusual equipment, unclear occupancy, a code interpretation question, a safety concern, or an unresolved jurisdiction.' },
    PASS: { key: 'PASS', label: 'Pass, preliminary', tone: 'good',
      blurb: 'The calculated result appears to fit. It still requires Master approval.' },
    TIGHT: { key: 'TIGHT', label: 'Tight, review required', tone: 'warn',
      blurb: 'It may fit, but the margin, the data or the service condition needs a detailed review.' },
    EVEMS: { key: 'EVEMS', label: 'Needs EVEMS review', tone: 'warn',
      blurb: 'EV charging may be feasible through a load management path. Equipment, control and code requirements need Master Review.' },
    UPGRADE: { key: 'UPGRADE', label: 'Upgrade review', tone: 'warn',
      blurb: 'Calculated demand, equipment condition, panel capacity, physical constraints or future loads point at a possible upgrade path.' },
    APPROVED: { key: 'APPROVED', label: 'Master approved', tone: 'good',
      blurb: 'The calculation, evidence, assumptions, jurisdiction and conclusion have been reviewed and signed.' }
  };

  /* ---------------- load card catalogue ---------------- */
  var LOAD_KINDS = [
    'Range, cooktop or oven', 'Dryer', 'Water heater', 'Tankless water heater',
    'Furnace or air handler', 'AC condenser', 'Heat pump outdoor unit',
    'Heat pump indoor air handler', 'Electric backup heat', 'EVSE', 'Hot tub or spa',
    'Garage or shop', 'Basement suite', 'Sump, well or pump',
    'Generator or transfer switch', 'Solar inverter', 'Battery or ESS', 'Other load'
  ];
  var LOAD_STATE = ['Existing, staying', 'Existing, being removed', 'Proposed', 'Future, not used for sizing'];

  /* ---------------- photo proof pack ---------------- */
  var PHOTO_PACK = [
    { k: 'panel_open',       label: 'Open electrical panel',  req: true,  hint: 'Dead front off if it is safe. Get the whole interior in frame.' },
    { k: 'main_label',       label: 'Main breaker rating',    req: true,  hint: 'The number stamped on the main handle.' },
    { k: 'panel_label',      label: 'Panel make, model and bus label', req: true, hint: 'Usually inside the door. The catalogue number matters.' },
    { k: 'directory',        label: 'Panel directory',        req: true,  hint: 'The circuit list on the door.' },
    { k: 'meter',            label: 'Meter',                  req: true,  hint: 'Include the socket and the meter number.' },
    { k: 'service_entrance', label: 'Service entrance, mast or underground equipment', req: true, hint: 'Weatherhead and attachment point, or the pedestal.' },
    { k: 'subpanels',        label: 'Existing subpanels',     req: false, hint: 'One per subpanel. Choose Not applicable if there are none.' },
    { k: 'nameplates',       label: 'Major equipment nameplates', req: true, hint: 'Every load over 1500 W gets its own label shot.' },
    { k: 'proposed_loc',     label: 'Proposed equipment or circuit location', req: true, hint: 'Where the new gear is going.' },
    { k: 'route',            label: 'Conduit or feeder route', req: true, hint: 'Walk the run. Show both ends.' },
    { k: 'damage',           label: 'Damage, corrosion, heat or water concerns', req: false, hint: 'Anything that looks wrong. Not applicable if nothing found.' }
  ];
  var PHOTO_SOLAR = [
    { k: 'elevations',       label: 'Front, rear and side elevations', req: true, hint: 'Four shots from the ground, whole house in frame.' },
    { k: 'roof_planes',      label: 'Every roof plane',       req: true,  hint: 'One clear shot per plane.' },
    { k: 'roof_obstructions',label: 'Roof obstructions',      req: true,  hint: 'Vents, stacks, skylights, chimneys.' },
    { k: 'shade',            label: 'Shade sources',          req: true,  hint: 'Trees, neighbouring buildings, towers.' },
    { k: 'roof_condition',   label: 'Roof condition findings', req: true, hint: 'Close shots of wear, lifting, granule loss, flashing.' },
    { k: 'equip_wall',       label: 'Proposed inverter and disconnect wall', req: true, hint: 'Show the clearances.' },
    { k: 'solar_route',      label: 'Proposed conduit route, roof to panel', req: true, hint: 'Attic, exterior, or both.' },
    { k: 'bill_evidence',    label: 'Power bill or utility usage evidence', req: true, hint: 'The monthly kWh page, not the dollar total.' }
  ];
  var PHOTO_STATES = ['Captured', 'Not applicable', 'Cannot capture', 'Unsafe access', 'Follow up required'];

  /* ---------------- helpers ---------------- */
  function uid() {
    return 'J' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  }
  function nowISO() { return new Date().toISOString(); }
  function stamp(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function blankMonths() {
    return MONTHS.map(function (m) { return { month: m, kwh: '', days: '', from: '', to: '', status: '' }; });
  }

  function blankJob(role) {
    return {
      schema: SCHEMA, appVersion: VERSION,
      id: uid(), created: nowISO(), updated: nowISO(),
      rep: role || 'other', stage: 'Draft', demo: false,
      header: {
        customer: '', phone: '', email: '', address: '', postal: '',
        leadSource: '', campaign: '', referrer: '',
        request: '', budget: '', timeline: '', decisionMakers: ''
      },
      juris: { preset: '', authority: '', utility: '', retailer: '', boundaryNotes: '' },
      types: [],
      service: {
        supplyVoltage: '120/240 V single phase, 3 wire',
        serviceRating: ev('A'), mainBreaker: ev('A'), busRating: ev('A'),
        panelMakeModel: ev(''), serviceConductors: ev(''),
        panelArrangement: '', panelCondition: '', panelLocation: '',
        spacesFree: '', spacesTotal: '', meterLocation: '',
        measured: { value: '', unit: 'kW', source: '', window: '' },
        overheadUnderground: '', subpanels: '', entranceNotes: '',
        specialEquipment: '', routeNotes: ''
      },
      occupancyPath: 'single',
      areas: { unit: 'sqft', above: '', aboveSource: '', below: '', hasBasement: '', belowHeight: '', exclBasement: '' },
      loads: [],
      clamp: [],
      ev: {
        status: '', vehicle: '', annualKm: '', homeShare: '80', efficiency: '20',
        chargerMakeModel: '', voltage: '240', amps: ev('A'), mca: ev('A'), mocp: ev('A'),
        desiredRate: '', location: '', routeLength: ev('m'),
        evemsCandidate: '', timing: '', sizingUse: ''
      },
      tub: { makeModel: ev(''), voltage: '240', amps: ev('A'), mocp: ev('A'), disconnect: '', state: '', heaterNotes: '', gfciFlag: false, route: '' },
      hvac: {
        outdoorMakeModel: ev(''), voltage: '240', mca: ev('A'), mocp: ev('A'),
        indoorMakeModel: ev(''), indoorMca: ev('A'), backupHeatKw: ev('kW'),
        state: '', relationship: '', interlock: '', quoteRef: '',
        disconnect: '', route: '', futureKwh: ''
      },
      solar: {
        months: blankMonths(), dataQuality: '',
        occupancy: '', awayMonths: '', winterBase: '', winterOccupied: '', futureOccupancy: '',
        futureLoads: [], futureAnnualKwh: '',
        roofMaterial: '', roofAge: ev('years'), roofCondition: ev(''), reroofTiming: '', rooferNotes: '',
        planes: [], obstructions: '', shade: '', access: '',
        inverterLocation: '', conduitRoute: '', batteryInterest: '', monitoring: '',
        forecastAnnualAcKwh: ''
      },
      club: {
        retailer: '', hiRate: '', loRate: '', fee: '', term: '',
        rateSwitch: '', optIn: '', firstBillReview: '', firstYearReview: '', months: []
      },
      wire: {
        systemVoltage: '240', phase: '1', current: 'ac', loadA: '', loadVa: '',
        pf: '1', lengthM: ev('m'), material: 'cu',
        sizes: ['10', '8', '6', '4', '3', '2', '1/0'],
        method: '', parallel: '1', dataSource: 'Conductor resistance table, ohms per kilometre at 75 C',
        costNote: '', ampacityReviewed: false
      },
      photos: {},
      flags: [],
      review: {
        approved: false, reviewer: '', approvedAt: '',
        cecVersion: CEC_VERSION, standataChecked: false,
        assumptions: '', openQuestions: '', conclusion: '', status: '',
        serviceRecommendation: '', conductorNote: '', solarNote: '',
        proposalState: '', nextAction: '', nextOwner: '', nextDue: '',
        overrides: []
      },
      log: []
    };
  }

  /* ---------------- store ---------------- */
  var Store = {
    version: VERSION, CEC_VERSION: CEC_VERSION, CHANGELOG: CHANGELOG,
    ROLES: ROLES, JOB_TYPES: JOB_TYPES, LEAD_SOURCES: LEAD_SOURCES, STAGES: STAGES,
    STATUS: STATUS, LOAD_KINDS: LOAD_KINDS, LOAD_STATE: LOAD_STATE,
    PHOTO_PACK: PHOTO_PACK, PHOTO_SOLAR: PHOTO_SOLAR, PHOTO_STATES: PHOTO_STATES,
    SOURCES: SOURCES, AREA_SOURCES: AREA_SOURCES, EV_STATUS: EV_STATUS, JURISDICTIONS: JURISDICTIONS, MONTHS: MONTHS,
    FIELD_NOTICE: FIELD_NOTICE, INTERNAL_NOTICE: INTERNAL_NOTICE, JURISDICTION_WARNING: JURISDICTION_WARNING,
    stamp: stamp, nowISO: nowISO, uid: uid, blankJob: blankJob, blankMonths: blankMonths,
    ev: ev, evVal: evVal, evNum: evNum, evKnown: evKnown,

    state: { role: '', jobs: [], activeId: null, lastSaved: null, sheetUrl: '', sheetSecret: '', photoLoss: 0, tier: null },

    active: function () {
      var s = this.state;
      for (var i = 0; i < s.jobs.length; i++) if (s.jobs[i].id === s.activeId) return s.jobs[i];
      return null;
    },
    setActive: function (id) { this.state.activeId = id; this.save(); },
    newJob: function () {
      var j = blankJob(this.state.role);
      j.log.push({ at: nowISO(), by: this.roleObj().name, what: 'Job created' });
      this.state.jobs.unshift(j);
      this.state.activeId = j.id;
      this.save();
      return j;
    },
    deleteJob: function (id) {
      this.state.jobs = this.state.jobs.filter(function (j) { return j.id !== id; });
      if (this.state.activeId === id) this.state.activeId = null;
      this.save();
    },
    touch: function (what) {
      var j = this.active();
      if (!j) return;
      j.updated = nowISO();
      if (what) j.log.push({ at: nowISO(), by: this.roleObj().name, what: what });
      this.save();
    },
    override: function (field, prior, next, reason) {
      var j = this.active();
      if (!j) return;
      j.review.overrides.push({
        fieldChanged: field, priorValue: String(prior === undefined ? '' : prior),
        newValue: String(next === undefined ? '' : next), reason: reason,
        changedBy: this.roleObj().name, changedAt: nowISO()
      });
      this.save();
    },
    stampEntry: function (o) {
      if (!o || typeof o !== 'object') return o;
      if (!o.enteredBy) { o.enteredBy = this.roleObj().name; o.enteredAt = nowISO(); }
      if (o.evidenceStatus === 'Verified' && this.isMaster() && !o.verifiedBy) {
        o.verifiedBy = this.roleObj().name; o.verifiedAt = nowISO();
      }
      return o;
    },

    /* ---- persistence ----
       Job records go to the device key store. Photo images go to the device
       blob store, keyed by job and slot, because they are megabytes and they
       are exactly what the old build threw away on reload. */
    setPhoto: function (jobKey, rec) {
      var j = this.active();
      if (!j) return Promise.resolve(false);
      j.photos[jobKey] = rec;
      this.save();
      if (rec && rec.data && global.FCDisk) {
        var self = this;
        return global.FCDisk.putPhoto(j.id, jobKey, rec.data).then(function (ok) {
          if (!ok) {
            rec.state = 'Follow up required';
            rec.reason = 'This phone would not store the image. Retake it or export the job now.';
            self.save();
          }
          return ok;
        });
      }
      if (global.FCDisk) global.FCDisk.delPhoto(j.id, jobKey);
      return Promise.resolve(true);
    },

    save: function () {
      try {
        var slim = JSON.parse(JSON.stringify(this.state));
        delete slim.photoLoss; delete slim.tier;
        slim.jobs.forEach(function (j) {
          Object.keys(j.photos || {}).forEach(function (k) {
            var p = j.photos[k];
            if (p && p.data) { p.data = ''; p.inBlobStore = true; }
          });
        });
        var ok = global.FCDisk ? global.FCDisk.saveState(slim)
                               : (global.name = 'RAYDN_FIELDCALC::' + JSON.stringify(slim), true);
        this.state.lastSaved = ok ? nowISO() : this.state.lastSaved;
        if (this.onSave) this.onSave(ok ? null : new Error('Nothing could be saved on this phone.'));
      } catch (e) { if (this.onSave) this.onSave(e); }
    },

    restore: function (done) {
      var self = this;
      this.state.photoLoss = 0;
      this.state.tier = global.FCDisk ? global.FCDisk.tier() : { key: 'tab', label: 'Saved in this browser tab only', durable: false };
      var d = null;
      try { d = global.FCDisk ? global.FCDisk.loadState() : null; } catch (e) { d = null; }
      if (!d) {
        try {
          var raw = global.name || '';
          if (raw.indexOf('RAYDN_FIELDCALC::') === 0) d = JSON.parse(raw.slice(17));
        } catch (e2) { d = null; }
      }
      if (!d || !d.jobs) { if (done) done(false); return false; }

      this.state.role = d.role || '';
      this.state.jobs = d.jobs;
      this.state.activeId = d.activeId || null;
      this.state.lastSaved = d.lastSaved || null;
      this.state.sheetUrl = d.sheetUrl || '';
      this.state.sheetSecret = d.sheetSecret || '';
      this.state.jobs.forEach(function (j) {
        if (j.areas && j.areas.hasBasement === undefined) j.areas.hasBasement = '';
        if (j.areas && j.areas.aboveSource === undefined) j.areas.aboveSource = '';
      });

      /* Pull the photo images back out of the blob store. Anything still
         marked Captured that has no image is demoted, because a record that
         claims evidence it cannot produce is worse than a blank one. */
      var jobs = this.state.jobs.slice();
      function sweep() {
        jobs.forEach(function (j) {
          Object.keys(j.photos || {}).forEach(function (k) {
            var r = j.photos[k];
            if (r && r.state === 'Captured' && !r.data) {
              r.state = 'Follow up required';
              r.reason = 'The image is not on this phone. Retake this shot.';
              self.state.photoLoss++;
            }
          });
        });
        if (done) done(true);
      }
      if (!global.FCDisk || !global.FCDisk.photosAvailable()) { sweep(); return true; }
      Promise.all(jobs.map(function (j) {
        return global.FCDisk.getJobPhotos(j.id).then(function (map) {
          Object.keys(map).forEach(function (k) {
            if (j.photos && j.photos[k]) j.photos[k].data = map[k];
          });
        });
      })).then(sweep, sweep);
      return true;
    },

    /* ---- export and import ---- */
    exportJob: function (job, withPhotos) {
      var copy = JSON.parse(JSON.stringify(job));
      if (!withPhotos) {
        Object.keys(copy.photos || {}).forEach(function (k) {
          if (copy.photos[k]) { copy.photos[k].data = ''; copy.photos[k].stripped = true; }
        });
      }
      copy.exported = { at: nowISO(), by: this.roleObj().name, app: 'Raydn FieldCalc ' + VERSION, photos: !!withPhotos };
      return JSON.stringify(copy, null, 2);
    },
    importJob: function (text) {
      var d = JSON.parse(text);
      if (!d || !d.id) throw new Error('That file is not a FieldCalc job.');
      var base = blankJob(this.state.role);
      Object.keys(base).forEach(function (k) { if (!(k in d)) d[k] = base[k]; });
      this.state.jobs = this.state.jobs.filter(function (j) { return j.id !== d.id; });
      this.state.jobs.unshift(d);
      this.state.activeId = d.id;
      this.save();
      return d;
    },

    isMaster: function () { return !!ROLES[this.state.role] && ROLES[this.state.role].canReview; },
    roleObj: function () { return ROLES[this.state.role] || ROLES.other; }
  };

  global.FC = Store;
})(window);
