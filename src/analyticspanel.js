/* FT.AnPanel — the Analytics window.
   Window: dock right / left / bottom, floating, maximised ("analytics only"), minimised, closed ("tree only");
   drag the inner edge to any split, or pick a preset (¼ ⅓ ½ ⅔ ¾). Remembered between sessions.
   Tabs: Data · Family · Person · Dates · Gallery · Duplicates. Every number can be clicked to list the people behind it. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => FT.esc(s);
  const KEY = 'ftstudio:analytics';
  const NA = '<span class="na">Not available</span>';
  const TABS = [['data', '📋 Data'], ['family', '🌳 Family'], ['person', '👤 Person'], ['dates', '📅 Dates'], ['gallery', '🖼 Gallery'], ['dupes', '🔍 Duplicates']];
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

  const P = {
    open: false, tab: 'data', pid: null, follow: true, other: null, scope: 'all', branchOf: null, days: 30, showNoPhoto: false,
    win: { dock: 'right', size: 0.75, min: false, max: false, float: { x: 90, y: 90, w: 900, h: 620 } },
    lists: {},

    get M() { return FT.UI.M; },
    get UI() { return FT.UI; },

    init() {
      try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { Object.assign(this.win, s.win || {}); this.tab = s.tab || this.tab; this.follow = s.follow !== false; this.days = s.days || 30; } } catch (e) { /* storage off */ }
      this.el = $('an'); this.body = $('anBody');
      $('anTabs').innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('');
      $('anTabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) this.show(b.dataset.tab); };
      this.el.querySelector('.an-win').onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.size) this.setSize(+b.dataset.size);
        else if (b.dataset.dock) this.setDock(b.dataset.dock);
        else if (b.dataset.w === 'min') this.minimise();
        else if (b.dataset.w === 'max') this.toggleMax();
        else if (b.dataset.w === 'close') this.close();
        else if (b.dataset.w === 'layout') { const r = b.getBoundingClientRect(); this.layoutMenu(r.left, r.bottom + 4); }
        else if (b.dataset.w === 'print') this.print();
      };
      $('anHead').addEventListener('dblclick', (e) => { if (!e.target.closest('button,input,select')) this.toggleMax(); });
      $('anTabPill').onclick = () => { this.win.min = false; this.apply(); };
      this.bindSplitter(); this.bindFloat();
      this.body.addEventListener('click', (e) => this.onClick(e));
      this.body.addEventListener('change', (e) => this.onChange(e));
      this.body.addEventListener('input', (e) => this.onInput(e));
      this.M.on(() => this.refreshSoon());
      window.addEventListener('resize', () => { if (this.open) this.apply(true); });
      if (window.ResizeObserver) new ResizeObserver(() => { if (this.open) this.apply(true); }).observe($('bar'));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'F9') { e.preventDefault(); this.toggle(); }
      });
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify({ win: this.win, tab: this.tab, follow: this.follow, days: this.days })); } catch (e) { /* ignore */ } },

    // ------------------------------------------------------------ window management
    toggle() { if (this.open && !this.win.min) this.close(); else this.show(); },
    show(tab, pid) {
      if (tab) this.tab = tab;
      if (pid) { this.pid = pid; }
      this.open = true; this.win.min = false;
      this.apply(); this.render(); this.save();
    },
    close() { this.open = false; this.apply(); },
    minimise() { this.win.min = true; this.apply(); this.save(); },
    toggleMax() { this.win.max = !this.win.max; this.win.min = false; this.apply(); this.save(); this.refit(); },
    setSize(f) { this.win.size = f; this.win.max = false; this.win.min = false; if (this.win.dock === 'float') this.win.dock = 'right'; this.apply(); this.save(); this.refit(); },
    setDock(d) { this.win.dock = d; this.win.max = false; this.win.min = false; this.apply(); this.save(); this.refit(); },
    refit() { setTimeout(() => { const UI = this.UI; if (UI.sel && UI.nodeOf(UI.sel)) UI.centerOn(UI.sel); else UI.fit(); }, 60); },
    layoutMenu(x, y) {
      const s = this.win, on = (d, f) => !s.max && s.dock === d && Math.abs(s.size - f) < 0.02;
      const it = (icon, label, fn, active) => ({ icon: active ? '✔' : icon, label, fn });
      this.UI.menu([
        { head: 'How much screen for analytics?' },
        it('⛶', 'Analytics only (full screen)', () => { this.win.max = true; this.win.min = false; this.apply(); this.save(); }, s.max),
        it('▮', 'Analytics ¾ · Tree ¼', () => this.setSize(0.75), on(s.dock, 0.75)),
        it('▮', 'Analytics ⅔ · Tree ⅓', () => this.setSize(0.667), on(s.dock, 0.667)),
        it('▯', 'Half and half', () => this.setSize(0.5), on(s.dock, 0.5)),
        it('▯', 'Analytics ⅓ · Tree ⅔', () => this.setSize(0.333), on(s.dock, 0.333)),
        it('▯', 'Analytics ¼ · Tree ¾', () => this.setSize(0.25), on(s.dock, 0.25)),
        it('🌳', 'Tree only (close analytics)', () => this.close()),
        '-', { head: 'Where?' },
        it('◨', 'Dock on the right', () => this.setDock('right'), !s.max && s.dock === 'right'),
        it('◧', 'Dock on the left', () => this.setDock('left'), !s.max && s.dock === 'left'),
        it('⬓', 'Dock at the bottom', () => this.setDock('bottom'), !s.max && s.dock === 'bottom'),
        it('❐', 'Floating window (move and resize freely)', () => this.setDock('float'), !s.max && s.dock === 'float'),
        it('▁', 'Minimise to a small tab', () => this.minimise())
      ], x, y);
    },
    /** Position the window and shrink the tree area next to it. */
    apply(quiet) {
      const el = this.el, root = document.documentElement, s = this.win;
      const visible = this.open && !s.min;
      el.hidden = !visible;
      $('anTabPill').hidden = !(this.open && s.min);
      document.body.classList.toggle('an-open', visible);
      $('btnAnalytics').classList.toggle('on', this.open);
      root.style.setProperty('--anL', '0px'); root.style.setProperty('--anR', '0px'); root.style.setProperty('--anB', '0px');
      el.className = '';
      el.style.cssText = '';
      if (!visible) { if (!quiet) this.UI.applyView(); return; }
      const top = $('bar').offsetHeight + ($('banner').hidden ? 0 : 32);
      const vw = window.innerWidth, vh = window.innerHeight;
      const voice = document.body.classList.contains('voice-open') ? ($('voice').offsetWidth || 0) : 0;
      const avail = vw - voice;
      const narrow = vw < 760;
      let dock = s.max ? 'max' : s.dock;
      if (narrow && (dock === 'left' || dock === 'right')) dock = 'bottom';
      el.classList.add('dock-' + dock);
      el.style.top = top + 'px';
      if (dock === 'max') { el.style.left = '0px'; el.style.right = voice + 'px'; el.style.bottom = '0px'; }
      else if (dock === 'right' || dock === 'left') {
        const w = Math.round(Math.max(300, Math.min(avail - 160, avail * s.size)));
        el.style.width = w + 'px'; el.style.bottom = '0px';
        if (dock === 'right') { el.style.right = voice + 'px'; root.style.setProperty('--anR', w + 'px'); }
        else { el.style.left = '0px'; root.style.setProperty('--anL', w + 'px'); }
      } else if (dock === 'bottom') {
        const h = Math.round(Math.max(180, Math.min(vh - top - 90, (vh - top) * s.size)));
        el.style.height = h + 'px'; el.style.left = '0px'; el.style.right = voice + 'px'; el.style.bottom = '0px';
        root.style.setProperty('--anB', h + 'px');
      } else { // float
        const f = s.float;
        f.w = Math.min(f.w, vw - 16); f.h = Math.min(f.h, vh - top - 8);
        f.x = Math.max(0, Math.min(f.x, vw - 80)); f.y = Math.max(top, Math.min(f.y, vh - 60));
        Object.assign(el.style, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px' });
      }
      el.querySelectorAll('[data-dock]').forEach((b) => b.classList.toggle('on', !s.max && b.dataset.dock === s.dock));
      el.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', !s.max && s.dock !== 'float' && Math.abs(+b.dataset.size - s.size) < 0.02));
      el.querySelector('[data-w="max"]').innerHTML = s.max ? '❐' : '⛶';
      el.querySelector('[data-w="max"]').title = s.max ? 'Restore (show the tree too)' : 'Maximise – analytics only (double-click the title bar)';
      this.UI.applyView();
    },
    bindSplitter() {
      const sp = $('anSplit');
      sp.addEventListener('pointerdown', (e) => {
        e.preventDefault(); sp.setPointerCapture(e.pointerId);
        document.body.classList.add('an-dragging');
        const move = (ev) => {
          const vw = window.innerWidth, vh = window.innerHeight, top = this.el.getBoundingClientRect().top;
          const voice = document.body.classList.contains('voice-open') ? ($('voice').offsetWidth || 0) : 0;
          const d = this.el.classList.contains('dock-bottom') ? 'bottom' : this.win.dock;
          let f;
          if (d === 'right') f = (vw - voice - ev.clientX) / (vw - voice);
          else if (d === 'left') f = ev.clientX / (vw - voice);
          else f = (vh - ev.clientY) / (vh - top + (vh - this.el.getBoundingClientRect().bottom));
          this.win.size = Math.max(0.15, Math.min(0.92, f)); this.apply(true);
        };
        const up = () => { sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); document.body.classList.remove('an-dragging'); this.save(); if (this.UI.sel) this.UI.ensureVisible(this.UI.sel); };
        sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up);
      });
      sp.addEventListener('dblclick', () => this.setSize(this.win.size > 0.55 ? 0.333 : 0.75));
    },
    bindFloat() {
      const el = this.el, head = $('anHead');
      head.addEventListener('pointerdown', (e) => {
        if (this.win.dock !== 'float' || this.win.max || e.button !== 0 || e.target.closest('button,input,select')) return;
        e.preventDefault();
        const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        const move = (ev) => { this.win.float.x = ev.clientX - dx; this.win.float.y = ev.clientY - dy; this.apply(true); };
        const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); this.save(); };
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      });
      if (window.ResizeObserver) {
        new ResizeObserver(() => {
          if (el.hidden || this.win.dock !== 'float' || this.win.max) return;
          const w = el.offsetWidth, h = el.offsetHeight;
          if (Math.abs(w - this.win.float.w) > 2 || Math.abs(h - this.win.float.h) > 2) { this.win.float.w = w; this.win.float.h = h; clearTimeout(this._fs); this._fs = setTimeout(() => this.save(), 300); }
        }).observe(el);
      }
    },

    // ------------------------------------------------------------ content
    selectionChanged(pid) {
      if (!this.open || !pid || !this.follow) return;
      if (pid === this.pid) return;
      this.pid = pid;
      if (this.tab === 'person' || (this.tab === 'data' && this.scope === 'branch')) this.render();
    },
    refreshSoon() { if (!this.open) return; clearTimeout(this._rt); this._rt = setTimeout(() => this.render(), 250); },
    render() {
      if (!this.open || !FT.Analytics) return;
      document.querySelectorAll('#anTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
      const M = this.M;
      this.lists = {};
      const scroll = this.body.scrollTop;
      let html;
      try {
        if (!M.count()) html = '<div class="an-empty">Add some people to the tree and the analytics will appear here.</div>';
        else html = this['tab_' + this.tab]();
      } catch (e) { html = `<div class="an-empty">Could not compute this page: ${esc(e.message)}</div>`; console.error(e); }
      this.body.innerHTML = html;
      if (this._keepScroll) this.body.scrollTop = scroll;
      this._keepScroll = true;
    },

    // -------- small builders
    /** Register a list of ids and return a clickable count. */
    num(ids, label, cls) {
      ids = Array.from(ids || []);
      if (!ids.length) return `<span class="an-n zero ${cls || ''}">0</span>`;
      const k = 'l' + Object.keys(this.lists).length; this.lists[k] = { ids, label };
      return `<a class="an-n ${cls || ''}" data-list="${k}" title="Click to see who">${ids.length}</a>`;
    },
    name(id) {
      const M = this.M, p = M.person(id); if (!p) return NA;
      const g = p.gender === 'M' ? 'm' : p.gender === 'F' ? 'f' : 'u';
      return `<a class="an-p ${g}${M.isLiving(p) ? '' : ' dec'}" data-p="${id}" title="Show in the tree and see this person's analytics">${esc(M.displayName(p))}</a>`;
    },
    names(ids, max) {
      ids = Array.from(ids || []); max = max || 30;
      if (!ids.length) return '<span class="na">None recorded</span>';
      const shown = ids.slice(0, max).map((id) => this.name(id)).join('');
      return shown + (ids.length > max ? ` ${this.num(ids, 'All', 'more')}<span class="na"> in total</span>` : '');
    },
    bar(label, ids, max, color, extra) {
      const n = Array.from(ids || []).length;
      return `<div class="an-bar"><span class="l">${label}</span><span class="t"><i style="width:${max ? Math.max(n ? 2 : 0, (n / max) * 100) : 0}%;background:${color || 'var(--accent)'}"></i></span><span class="v">${this.num(ids, label)}${extra || ''}</span></div>`;
    },
    stack(parts) { // [{label, ids, color}]
      const tot = parts.reduce((s, p) => s + p.ids.length, 0) || 1;
      return `<div class="an-stack">${parts.map((p) => `<i style="width:${(p.ids.length / tot) * 100}%;background:${p.color}" title="${esc(p.label)}: ${p.ids.length}"></i>`).join('')}</div>
        <div class="an-legend">${parts.map((p) => `<span><b style="background:${p.color}"></b>${esc(p.label)} ${this.num(p.ids, p.label)} <small>${pct(p.ids.length, tot)}%</small></span>`).join('')}</div>`;
    },
    tile(label, value, sub) { return `<div class="an-tile"><div class="v">${value}</div><div class="l">${label}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`; },
    card(title, inner, wide) { return `<section class="an-card${wide ? ' wide' : ''}"><h4>${title}</h4>${inner}</section>`; },
    ring(p) { return `<div class="an-ring" style="--p:${p}"><span>${p}%</span></div>`; },
    date(x) { return x && (x.date || x.place) ? esc([x.date, x.place].filter(Boolean).join(', ')) : NA; },
    val(v, unit) { return v === null || v === undefined || (typeof v === 'object' && v.value == null) ? NA : esc((typeof v === 'object' ? v.value : v) + (unit || '')) + (typeof v === 'object' && v.n ? ` <small class="na">based on ${v.n}</small>` : ''); },

    // -------- 📋 DATA (A1–A6)
    tab_data() {
      const M = this.M, A = FT.Analytics;
      let ids = null, scopeName = 'the whole tree';
      const pid = this.pid && M.person(this.pid) ? this.pid : this.UI.sel;
      if (this.scope === 'branch' && pid) { ids = A.person(M, pid).family.ids; scopeName = M.displayName(pid) + '’s family'; }
      const D = A.data(M, ids);
      const T = D.total;
      const fields = D.completeness.fields.map((f) => `<tr><td>${esc(f.label)}</td><td class="r">${f.have} / ${f.applicable}</td><td class="bar"><span class="t"><i style="width:${pct(f.have, f.applicable)}%"></i></span></td><td class="r">${pct(f.have, f.applicable)}%</td><td class="r">${f.missing.length ? this.num(f.missing, 'Missing: ' + f.label, 'miss') : '✔'}</td></tr>`).join('');
      const sevIcon = { high: '⛔', medium: '⚠', low: 'ℹ' };
      const issues = D.issues.length ? D.issues.slice(0, 80).map((i) => `<li class="sev-${i.severity}"><span>${sevIcon[i.severity] || '⚠'}</span><div>${esc(i.text)}<div>${i.ids.map((x) => this.name(x)).join('')}</div></div></li>`).join('') : '<li class="ok">✔ No contradictions found in the dates.</li>';
      const todo = D.todo.slice(0, 40).map((t) => `<tr><td>${this.name(t.id)}</td><td class="miss-l">${t.missing.map(esc).join(', ')}</td><td>${this.UI.readOnly ? '' : `<button class="an-b" data-edit="${t.id}">✎ Fill in</button>`}</td></tr>`).join('');
      const scopeSel = `<div class="an-scope">Showing: <select data-scope><option value="all"${this.scope === 'all' ? ' selected' : ''}>Whole tree</option><option value="branch"${this.scope === 'branch' ? ' selected' : ''}>${pid ? esc(M.displayName(pid)) + '’s family only' : 'Selected person’s family (select a card)'}</option></select></div>`;
      return scopeSel + `<div class="an-grid">
        ${this.card('How complete is the information? <small>(' + esc(scopeName) + ')</small>', `<div class="an-row">${this.ring(D.completeness.pct)}<div><b>${D.completeness.pct}% complete</b><br><span class="na">Counts names, gender, birth date &amp; place, living/deceased status and death dates (for those who have passed). Photos are not counted.</span><br>${this.num(Array.from({ length: 0 }), '')} ${T} people</div></div>`)}
        ${this.card('Male / female', this.stack([{ label: 'Male', ids: D.gender.M, color: 'var(--male)' }, { label: 'Female', ids: D.gender.F, color: 'var(--female)' }, { label: 'Not recorded', ids: D.gender.U, color: '#a9b1bd' }]))}
        ${this.card('Living / deceased', this.stack([{ label: 'Living', ids: D.living.living, color: '#2f9e8f' }, { label: 'Deceased', ids: D.living.deceased, color: '#b08d57' }, { label: 'Not known', ids: D.living.unknown, color: '#a9b1bd' }]))}
        ${this.card('Field by field', `<table class="an-t"><tr><th>Information</th><th class="r">Have</th><th></th><th class="r">%</th><th class="r">Missing</th></tr>${fields}</table>`, true)}
        ${this.card('Missing details', `<table class="an-t">${D.missing.map((m) => `<tr><td>${esc(m.label)}</td><td class="r">${this.num(m.ids, m.label, 'miss')}</td></tr>`).join('')}</table>`)}
        ${this.card('Possible mistakes <small>(' + D.issues.length + ')</small>', `<ul class="an-issues">${issues}</ul>`)}
        ${this.card('Fill these next <small>– people missing the most information</small>', D.todo.length ? `<table class="an-t todo">${todo}</table>` : '<p class="ok">✔ Everyone has the basic details.</p>', true)}
      </div>`;
    },

    // -------- 🌳 FAMILY (B1–B9)
    tab_family() {
      const M = this.M, A = FT.Analytics, T = A.tree(M), h = T.headline;
      const maxGen = Math.max(1, ...T.perGeneration.map((g) => g.ids.length));
      const gens = T.perGeneration.map((g) => `<div class="an-bar"><span class="l">Generation ${g.gen}</span><span class="t">${['M', 'F', 'U'].map((k) => `<i style="width:${(g[k].length / maxGen) * 100}%;background:${k === 'M' ? 'var(--male)' : k === 'F' ? 'var(--female)' : '#a9b1bd'}"></i>`).join('')}</span><span class="v">${this.num(g.ids, 'Generation ' + g.gen)} <small class="na">${Array.isArray(g.living) ? g.living.length : g.living} living</small></span></div>`).join('');
      // B3 branch comparison
      const cands = Object.keys(M.people).filter((id) => M.children(id).length >= 2);
      const descN = {}; cands.forEach((id) => { descN[id] = M.descendants(id).size; });
      cands.sort((a, b) => descN[b] - descN[a]);
      const seen = new Set(); const opts = [];
      cands.forEach((id) => { const key = M.children(id).slice().sort().join(); if (seen.has(key)) return; seen.add(key); opts.push(id); });
      let bp = this.branchOf && M.person(this.branchOf) ? this.branchOf : (this.UI.sel && M.children(this.UI.sel).length >= 2 ? this.UI.sel : opts[0]);
      const branchHTML = bp ? this.branchTable(bp, opts) : '<p class="na">Nobody has two or more children yet.</p>';
      const rec = T.records, R = (label, r, fmt) => `<tr><td>${label}</td><td>${r && r.id ? this.name(r.id) : NA}</td><td class="r">${r && r.id ? fmt(r) : ''}</td></tr>`;
      const avg = T.averages;
      const places = (arr, label) => (arr && arr.length ? arr.slice(0, 12).map((x) => `<div class="an-bar"><span class="l">${esc(x.place || x.name)}</span><span class="t"><i style="width:${(x.ids.length / arr[0].ids.length) * 100}%"></i></span><span class="v">${this.num(x.ids, label + ': ' + (x.place || x.name))}</span></div>`).join('') : `<p class="na">Not available – no ${label.toLowerCase()} recorded yet.</p>`);
      const pg = (T.places.byGeneration || []).filter((g) => g.top.length).map((g) => `<tr><td>Gen ${g.gen}</td><td>${g.top.map((t) => esc(t.place) + ' <small class="na">(' + t.count + ')</small>').join(', ')}</td></tr>`).join('');
      const decMax = Math.max(1, ...T.decades.map((d) => d.ids.length));
      const dec = T.decades.length ? T.decades.map((d) => `<div class="an-col" title="${d.decade}s: ${d.ids.length} births"><span class="cv">${d.ids.length}</span><i style="height:${(d.ids.length / decMax) * 100}%" data-list-ids="${d.ids.join(',')}"></i><span class="cl">${String(d.decade).slice(2)}s</span></div>`).join('') : '';
      const cal = A.calendar(M, new Date(), 31);
      return `<div class="an-grid">
        ${this.card('The family at a glance', `<div class="an-tiles">
          ${this.tile('people', this.num(Object.keys(M.people), 'Everyone'))}
          ${this.tile('couples', h.couples)}
          ${this.tile('generations', h.generations)}
          ${this.tile('family branches (clans)', h.clans)}
          ${this.tile('marriages joining two families', h.linkingMarriages)}
          ${this.tile('living', this.num(A.data(M).living.living, 'Living'), `${h.deceased} deceased · ${h.unknownStatus} not known`)}
          ${this.tile('male / female', `${h.males} / ${h.females}`, h.genderUnknown ? h.genderUnknown + ' not recorded' : '')}
        </div>`, true)}
        ${this.card('People per generation <small>(1 = eldest)</small>', gens + `<div class="an-legend"><span><b style="background:var(--male)"></b>male</span><span><b style="background:var(--female)"></b>female</span><span><b style="background:#a9b1bd"></b>not recorded</span></div>`)}
        ${this.card('Compare branches', branchHTML, true)}
        ${this.card('Records', `<table class="an-t">
          ${R('Largest family (most children)', rec.largestFamily, (r) => plural(r.count, 'child', 'children'))}
          ${R('Most grandchildren', rec.mostGrandchildren, (r) => plural(r.count, 'grandchild', 'grandchildren'))}
          ${R('Most descendants', rec.mostDescendants, (r) => plural(r.count, 'descendant'))}
          ${R('Eldest living member', rec.eldestLiving, (r) => r.years + ' years')}
          ${R('Youngest member', rec.youngest, (r) => esc(r.date || ''))}
          ${R('Longest life', rec.longestLived, (r) => r.years + ' years')}
        </table>`)}
        ${this.card('Averages', `<table class="an-t">
          <tr><td>Children per couple</td><td class="r">${this.val(avg.childrenPerCouple)}</td></tr>
          <tr><td>Lifespan</td><td class="r">${this.val(avg.lifespan, ' years')}</td></tr>
          <tr><td>Age at marriage</td><td class="r">${this.val(avg.ageAtMarriage, ' years')}</td></tr>
          <tr><td>Age at first child</td><td class="r">${this.val(avg.ageAtFirstChild, ' years')}</td></tr>
        </table><p class="na">Only people whose dates are recorded are counted.</p>`)}
        ${this.card('Births per decade', dec ? `<div class="an-cols">${dec}</div>` : '<p class="na">Not available – no birth years recorded yet.</p>')}
        ${this.card('Where the family was born', places(T.places.birth, 'Birthplace') + (pg ? `<table class="an-t" style="margin-top:8px">${pg}</table>` : ''))}
        ${this.card('Native places (ooru)', places(T.places.native, 'Native place'))}
        ${this.card('Common first names', places((T.names.given || []).map((x) => ({ place: x.name, ids: x.ids })), 'First name'))}
        ${this.card('Surnames', places((T.names.surnames || []).map((x) => ({ place: x.name, ids: x.ids })), 'Surname') + ((T.names.marriedIn || []).length ? `<h5>Came into the family by marriage</h5>${places(T.names.marriedIn.map((x) => ({ place: x.name, ids: x.ids })), 'Married-in surname')}` : ''))}
        ${(T.gotras || []).length ? this.card('Gotras', places(T.gotras.map((x) => ({ place: x.name, ids: x.ids })), 'Gotra')) : ''}
        ${this.card('Coming up this month', this.calList(cal.slice(0, 8)) + `<p><a class="an-link" data-tab-go="dates">Full birthday &amp; anniversary calendar →</a></p>`)}
      </div>`;
    },
    branchTable(bp, opts) {
      const M = this.M, B = FT.Analytics.branches(M, bp);
      const max = Math.max(1, ...B.rows.map((r) => r.family));
      const sel = `<div class="an-scope">Compare the children of <select data-branchof>${opts.slice(0, 200).map((id) => `<option value="${id}"${id === bp ? ' selected' : ''}>${esc(M.displayName(id))} (${M.children(id).length} children)</option>`).join('')}${opts.includes(bp) ? '' : `<option value="${bp}" selected>${esc(M.displayName(bp))}</option>`}</select></div>`;
      const rows = B.rows.map((r) => `<tr><td>${this.name(r.id)}</td><td class="r">${r.children}</td><td class="r">${r.descendants}</td><td class="r">${r.family}</td><td class="r">${r.living}</td><td class="r">${r.generations}</td><td class="bar"><span class="t"><i style="width:${(r.family / max) * 100}%"></i></span></td></tr>`).join('');
      const t = B.total || {};
      return sel + `<table class="an-t"><tr><th>Branch of</th><th class="r">Children</th><th class="r">Descendants</th><th class="r">Whole family<br><small>incl. spouses</small></th><th class="r">Living</th><th class="r">Generations below</th><th></th></tr>${rows}
        <tr class="tot"><td>Total</td><td class="r">${t.children ?? ''}</td><td class="r">${t.descendants ?? ''}</td><td class="r">${t.family ?? ''}</td><td class="r">${t.living ?? ''}</td><td class="r">${t.generations ?? ''}</td><td></td></tr></table>`;
    },

    // -------- 👤 PERSON (C1–C7)
    tab_person() {
      const M = this.M, A = FT.Analytics;
      let pid = this.pid && M.person(this.pid) ? this.pid : this.UI.sel;
      if (!pid || !M.person(pid)) pid = this.pid = M.roots()[0];
      const P = A.person(M, pid), p = M.person(pid);
      const pick = `<div class="an-scope"><input list="anPeople" data-pick="me" placeholder="Type a name to see their analytics…" value=""> <label><input type="checkbox" data-follow ${this.follow ? 'checked' : ''}> follow the card I click in the tree</label>${this.datalist()}</div>`;
      const age = P.age ? `${P.age.years} years${P.age.atDeath ? ' (at death)' : ''}` : NA;
      const st = { living: 'Living', deceased: 'Deceased', unknown: 'Not known' }[P.status] || NA;
      const head = `<div class="an-who">${p.photo ? `<img src="${p.photo}">` : `<div class="ph ${p.gender}">${esc((p.given || '?')[0])}</div>`}<div><h2>${esc(P.name)}</h2>${P.altName ? `<div class="alt">${esc(P.altName)}</div>` : ''}${P.nick ? `<div class="na">also called ${esc(P.nick)}</div>` : ''}
        <div class="acts"><button class="an-b" data-show="${pid}">🎯 Show in tree</button>${this.UI.readOnly ? '' : `<button class="an-b" data-edit="${pid}">✎ Edit details</button>`}<button class="an-b" data-focus="${pid}">🔦 Focus on this family</button></div></div></div>`;
      const basic = `<table class="an-t kv">
        <tr><td>Gender</td><td>${P.gender === 'M' ? 'Male' : P.gender === 'F' ? 'Female' : NA}</td></tr>
        <tr><td>Born</td><td>${this.date(P.birth)}</td></tr>
        <tr><td>Status</td><td>${st}</td></tr>
        ${P.status !== 'living' ? `<tr><td>Deceased</td><td>${P.status === 'deceased' ? this.date(P.death) : NA}</td></tr>` : ''}
        <tr><td>Age</td><td>${age}</td></tr>
        <tr><td>Gotra</td><td>${P.gotra ? esc(P.gotra) : NA}</td></tr>
        <tr><td>Native place</td><td>${P.native ? esc(P.native) : NA}</td></tr></table>`;
      const fam = `<table class="an-t kv">
        <tr><td>Parents</td><td>${this.names(P.parents)}</td></tr>
        <tr><td>${P.partners.length > 1 ? 'Spouses' : 'Spouse'}</td><td>${this.names(P.partners)}</td></tr>
        <tr><td>Children</td><td><b>${this.num(P.children, 'Children of ' + P.name)}</b> – ${plural(P.sons.length, 'son')}, ${plural(P.daughters.length, 'daughter')}${P.otherChildren.length ? ', ' + P.otherChildren.length + ' not recorded' : ''}<div>${this.names(P.children)}</div></td></tr>
        <tr><td>Brothers &amp; sisters</td><td><b>${this.num(P.siblings, 'Siblings of ' + P.name)}</b>${P.birthOrder ? ` – ${this.ordinal(P.birthOrder.pos)} of ${P.birthOrder.of}` : ''}<div>${this.names(P.siblings)}</div></td></tr></table>`;
      const LV = ['Children', 'Grandchildren', 'Great-grandchildren'];
      const levels = P.levels.map((ids, i) => `<tr><td>${LV[i] || (i - 1) + '× great-grandchildren'}</td><td class="r">${this.num(ids, (LV[i] || 'Generation ' + (i + 1)) + ' of ' + P.name)}</td><td class="r na">${ids.filter((x) => M.isLiving(M.person(x))).length} living</td></tr>`).join('');
      const size = `<div class="an-tiles">${this.tile('descendants', this.num(Array.from(M.descendants(pid)), 'Descendants of ' + P.name))}${this.tile('in the whole family', this.num(P.family.ids, P.name + '’s family'), 'self + spouses + descendants + their spouses')}${this.tile('living in the family', P.family.living)}</div>
        ${levels ? `<table class="an-t">${levels}</table>` : '<p class="na">No children recorded.</p>'}`;
      const roots = `<table class="an-t kv"><tr><td>Known ancestors</td><td>${P.ancestors.count ? this.num(Array.from(M.ancestors(pid)), 'Ancestors of ' + P.name) : NA}</td></tr>
        <tr><td>Generations back</td><td>${P.ancestors.depth || NA}</td></tr>
        <tr><td>Eldest known ancestor</td><td>${P.ancestors.eldest ? this.name(P.ancestors.eldest) : NA}</td></tr></table>`;
      const q = P.quality;
      const quality = `<div class="an-row">${this.ring(q.completeness.pct)}<div>${q.missing.filter((m) => m.ids.length && m.key !== 'photo').slice(0, 6).map((m) => `<div>${esc(m.label)}: ${this.num(m.ids, m.label + ' (' + P.name + '’s family)', 'miss')}</div>`).join('') || '✔ Nothing important missing'}</div></div>`;
      const tl = P.timeline.length ? `<ol class="an-tl">${P.timeline.map((e) => `<li><span class="y">${e.y || '?'}</span><span>${esc(e.text)}</span></li>`).join('')}</ol>` : '<p class="na">Not available – add dates to build a timeline.</p>';
      // C5 relationship finder
      let rel = `<div class="an-scope"><input list="anPeople" data-pick="other" placeholder="Pick another person…" value="${this.other && M.person(this.other) ? esc(M.displayName(this.other)) : ''}"></div>`;
      if (this.other && M.person(this.other) && this.other !== pid) {
        const o = this.other;
        const r = M.relationship(pid, o);
        const steps = A.pathSteps(M, pid, o);
        const kin = FT.Kin ? FT.Kin.all(M, pid, o) : null;
        rel += `<p class="an-big">${this.name(o)} is ${esc(P.name)}’s <b>${esc(r || 'relative (distant link)')}</b></p>`;
        if (kin) rel += `<table class="an-t kv">${(FT.Kin.LANGS || []).filter((l) => l.code !== 'en').map((l) => `<tr><td>${esc(l.name)}</td><td>${kin[l.code] ? esc(kin[l.code]) : '<span class="na">–</span>'}</td></tr>`).join('')}</table>`;
        if (steps.length) rel += `<div class="an-path">${this.name(pid)}${steps.map((s) => `<span class="st">→ ${esc(s.rel)} →</span>${this.name(s.to)}`).join('')}</div>`;
        else rel += '<p class="na">They are not connected in this tree.</p>';
      }
      const kids = M.children(pid).length >= 2 ? this.card('Compare ' + esc(P.name) + '’s children’s branches', this.branchTable(pid, [pid]), true) : '';
      return pick + head + `<div class="an-grid">
        ${this.card('Basic details', basic)}
        ${this.card('Immediate family', fam)}
        ${this.card('Family size', size)}
        ${this.card('Roots', roots)}
        ${kids}
        ${this.card('How are they related?', rel, true)}
        ${this.card('Information completeness in this family', quality)}
        ${this.card('Life timeline', tl)}
      </div>`;
    },
    ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); },
    datalist() {
      const M = this.M;
      return `<datalist id="anPeople">${Object.values(M.people).map((p) => `<option value="${esc(M.displayName(p))}${p.birth.date ? ' (b. ' + esc(p.birth.date) + ')' : ''}">`).join('')}</datalist>`;
    },
    findByLabel(v) {
      const M = this.M; v = (v || '').trim().toLowerCase(); if (!v) return null;
      const ps = Object.values(M.people);
      const full = (p) => (M.displayName(p) + (p.birth.date ? ' (b. ' + p.birth.date + ')' : '')).toLowerCase();
      return (ps.find((p) => full(p) === v) || ps.find((p) => M.displayName(p).toLowerCase() === v) || {}).id || null;
    },

    // -------- 📅 DATES (B9 + F3)
    calList(items) {
      if (!items.length) return '<p class="na">Nothing in this period. Birthdays need a day and month (e.g. 12 Mar 1952).</p>';
      const icon = { birthday: '🎂', 'death anniversary': '🪔', 'wedding anniversary': '💍' };
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return `<ul class="an-cal">${items.map((c) => {
        const d = new Date(c.date); d.setHours(0, 0, 0, 0);
        const days = Math.round((d - today) / 864e5);
        const when = days === 0 ? '<b>Today</b>' : days === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
        const what = c.kind === 'birthday' ? (c.years ? 'turns ' + c.years : 'birthday') : c.kind === 'wedding anniversary' ? (c.years ? c.years + ' years married' : 'wedding anniversary') : (c.years ? c.years + ' years since passing' : 'death anniversary');
        return `<li><span class="d">${when}</span><span class="i">${icon[c.kind] || '•'}</span><span>${(c.ids || [c.id]).map((x) => this.name(x)).join(' &amp; ')} <small class="na">${esc(what)}</small></span></li>`;
      }).join('')}</ul>`;
    },
    tab_dates() {
      const M = this.M, A = FT.Analytics;
      const items = A.calendar(M, new Date(), this.days);
      const st = this.UI.st;
      const missing = Object.values(M.people).filter((p) => M.isLiving(p) && !((FT.parseDate(p.birth.date) || {}).d)).map((p) => p.id);
      return `<div class="an-scope">Show the next <select data-days>${[7, 30, 90, 365].map((d) => `<option value="${d}"${d === this.days ? ' selected' : ''}>${d === 365 ? 'year' : d + ' days'}</option>`).join('')}</select>
        <label><input type="checkbox" data-remind ${st.remind === false ? '' : 'checked'}> Remind me of this week's dates when I open the tree</label></div>
        <div class="an-grid">${this.card('Birthdays &amp; anniversaries', this.calList(items), true)}
        ${this.card('Birthdays we don’t know', `<p>${this.num(missing, 'Living people without a full birth date', 'miss')} living people have no full birth date (day and month), so their birthdays can’t be shown.</p>`)}</div>`;
    },

    // -------- 🖼 GALLERY (F2)
    tab_gallery() {
      const M = this.M, gen = FT.Analytics.generations(M);
      const groups = {};
      Object.values(M.people).forEach((p) => { if (!p.photo && !this.showNoPhoto) return; const g = gen.get(p.id) || 1; (groups[g] = groups[g] || []).push(p); });
      const withPhoto = Object.values(M.people).filter((p) => p.photo).length;
      const ro = this.UI.readOnly;
      const sec = Object.keys(groups).sort((a, b) => a - b).map((g) => `<h5>Generation ${g}</h5><div class="an-gal">${groups[g].sort((a, b) => (FT.year(a.birth.date) || 9999) - (FT.year(b.birth.date) || 9999)).map((p) => `<figure data-p="${p.id}">${p.photo ? `<img src="${p.photo}" loading="lazy">` : `<div class="ph ${p.gender}">${ro ? '?' : '＋'}<small>${ro ? '' : 'add photo'}</small></div>`}<figcaption>${esc(M.displayName(p))}<small>${esc([p.birth.date && 'b. ' + p.birth.date, p.death.date && 'd. ' + p.death.date].filter(Boolean).join(' · '))}</small></figcaption></figure>`).join('')}</div>`).join('');
      return `<div class="an-scope">${withPhoto} of ${M.count()} people have a photo. <label><input type="checkbox" data-nophoto ${this.showNoPhoto ? 'checked' : ''}> also show people without a photo</label>${ro ? '' : ' · <span class="na">Click an empty frame to add a photo, or drop an image on a card.</span>'}</div>` +
        (sec || '<div class="an-empty">No photos yet. Tick “also show people without a photo” to add some.</div>');
    },

    // -------- 🔍 DUPLICATES (F5)
    tab_dupes() {
      const M = this.M;
      if (!FT.Dupes) return '<div class="an-empty">Duplicate finder not available.</div>';
      const ignore = new Set(this.UI.st.notDupes || []);
      const pairs = FT.Dupes.find(M).filter((d) => !ignore.has([d.a, d.b].sort().join('|')));
      if (!pairs.length) return '<div class="an-empty">✔ No likely duplicates found. (Same person entered twice, e.g. “Sreekanth” and “Srikanth”, would show here.)</div>';
      const side = (id) => {
        const p = M.person(id);
        return `<div class="side">${this.name(id)}<div class="na">${esc([p.birth.date && 'b. ' + p.birth.date, p.birth.place, p.death.date && 'd. ' + p.death.date].filter(Boolean).join(' · ') || 'no dates')}</div>
          <div class="na">Parents: ${esc(M.parents(id).map((x) => M.displayName(x)).join(', ') || '–')}</div><div class="na">Spouse: ${esc(M.partners(id).map((x) => M.displayName(x)).join(', ') || '–')}</div><div class="na">Children: ${M.children(id).length}</div></div>`;
      };
      const ro = this.UI.readOnly;
      return `<p class="an-scope">${pairs.length} possible duplicate${pairs.length === 1 ? '' : 's'}. Merging keeps all information from both entries and joins their families. You can undo with Ctrl+Z.</p>` +
        pairs.slice(0, 60).map((d) => `<div class="an-dup"><div class="sc">${d.score}%<small>alike</small></div>${side(d.a)}${side(d.b)}<div class="why na">${d.reasons.map(esc).join(' · ')}</div>
          ${ro ? '' : `<div class="acts"><button class="an-b" data-merge="${d.a}|${d.b}">Same person – keep left</button><button class="an-b" data-merge="${d.b}|${d.a}">Same person – keep right</button><button class="an-b" data-notdup="${d.a}|${d.b}">Different people</button></div>`}</div>`).join('');
    },

    // ------------------------------------------------------------ events
    onClick(e) {
      const M = this.M, UI = this.UI, t = e.target;
      const l = t.closest('[data-list]'); if (l) { const L = this.lists[l.dataset.list]; if (L) this.listSheet(L.label, L.ids); return; }
      const li = t.closest('[data-list-ids]'); if (li) { this.listSheet('People', li.dataset.listIds.split(',').filter(Boolean)); return; }
      const ed = t.closest('[data-edit]'); if (ed) { this.reveal(ed.dataset.edit); UI.openDetails(ed.dataset.edit); return; }
      const sh = t.closest('[data-show]'); if (sh) { this.reveal(sh.dataset.show); return; }
      const fo = t.closest('[data-focus]'); if (fo) { UI.st.focusId = fo.dataset.focus; UI.st.focusMode = 'dim'; FT.IO.saveSoon(); this.reveal(fo.dataset.focus); return; }
      const tg = t.closest('[data-tab-go]'); if (tg) { this.show(tg.dataset.tabGo); return; }
      const mg = t.closest('[data-merge]');
      if (mg) {
        const [keep, drop] = mg.dataset.merge.split('|'); const n1 = M.displayName(drop), n2 = M.displayName(keep);
        M.change(() => FT.Dupes.mergePeople(M, keep, drop));
        UI.toast('Merged ' + n1 + ' into ' + n2, true, { label: 'Undo', fn: () => M.undo() }); return;
      }
      const nd = t.closest('[data-notdup]');
      if (nd) { const k = nd.dataset.notdup.split('|').sort().join('|'); UI.st.notDupes = (UI.st.notDupes || []).concat([k]); FT.IO.saveSoon(); this.render(); return; }
      const fig = t.closest('figure[data-p]');
      if (fig) { const id = fig.dataset.p; if (!M.person(id).photo && !UI.readOnly) UI.pickPhoto(id); else this.goPerson(id); return; }
      const p = t.closest('[data-p]'); if (p) { e.preventDefault(); this.goPerson(p.dataset.p); }
    },
    onChange(e) {
      const t = e.target;
      if (t.matches('[data-scope]')) { this.scope = t.value; this.render(); }
      else if (t.matches('[data-branchof]')) { this.branchOf = t.value; this.render(); }
      else if (t.matches('[data-follow]')) { this.follow = t.checked; this.save(); }
      else if (t.matches('[data-days]')) { this.days = +t.value; this.save(); this.render(); }
      else if (t.matches('[data-remind]')) { this.UI.st.remind = t.checked; FT.IO.saveSoon(); }
      else if (t.matches('[data-nophoto]')) { this.showNoPhoto = t.checked; this.render(); }
      else if (t.matches('[data-pick]')) this.onInput(e);
    },
    onInput(e) {
      const t = e.target; if (!t.matches('[data-pick]')) return;
      const id = this.findByLabel(t.value); if (!id) return;
      if (t.dataset.pick === 'me') { this.pid = id; this.reveal(id, true); }
      else this.other = id;
      this._keepScroll = true; this.render();
    },
    /** Select a person in the tree (switching view if they are not drawn) without stealing the panel. */
    reveal(id, quiet) {
      const UI = this.UI;
      if (!UI.nodeOf(id)) { UI.st.view = 'hourglass'; UI.st.rootId = id; }
      const f = this.follow; this.follow = false;
      UI.select(id); UI.centerOn(id);
      this.follow = f;
      if (!quiet) this.pid = id;
    },
    goPerson(id) { this.reveal(id); this.tab = 'person'; this._keepScroll = false; this.render(); this.body.scrollTop = 0; },
    listSheet(label, ids) {
      const M = this.M;
      const rows = ids.map((id) => M.person(id)).filter(Boolean).sort((a, b) => M.displayName(a).localeCompare(M.displayName(b)));
      const box = document.createElement('div'); box.className = 'an-sheet';
      box.innerHTML = `<div class="in"><h4>${esc(label)} <small>(${rows.length})</small><button class="x" title="Close">✕</button></h4><table class="an-t">
        <tr><th>Name</th><th>Born</th><th>Died</th><th></th></tr>
        ${rows.map((p) => `<tr><td>${this.name(p.id)}</td><td>${p.birth.date || p.birth.place ? esc([p.birth.date, p.birth.place].filter(Boolean).join(', ')) : NA}</td><td>${M.isLiving(p) ? '<span class="na">living</span>' : p.death.date || p.death.place ? esc([p.death.date, p.death.place].filter(Boolean).join(', ')) : NA}</td><td>${this.UI.readOnly ? '' : `<button class="an-b" data-edit="${p.id}">✎</button>`}</td></tr>`).join('')}</table></div>`;
      box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('.x')) box.remove(); else if (e.target.closest('[data-p],[data-edit]')) { this.onClick(e); if (e.target.closest('[data-p]')) box.remove(); } });
      this.el.appendChild(box);
    },

    // ------------------------------------------------------------ print / PDF of the analytics sheet
    print() {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(f);
      const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n');
      const tabs = ['data', 'family', 'person'];
      const keep = this.tab;
      const parts = tabs.map((t) => { this.tab = t; this.lists = {}; return `<h1>${TABS.find((x) => x[0] === t)[1]}</h1>` + this['tab_' + t](); });
      this.tab = keep;
      f.contentDocument.open();
      f.contentDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(this.M.data.meta.title)} – analytics</title><style>${css}
        html,body{overflow:visible!important;height:auto!important;background:#fff}h1{font-size:18px;margin:18px 0 8px;page-break-before:always}h1:first-child{page-break-before:avoid}
        .an-scope,.acts,button,select,input{display:none!important}.an-card{break-inside:avoid}</style></head><body class="an-print">${parts.join('')}</body></html>`);
      f.contentDocument.close();
      setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); this.render(); }, 400);
    }
  };
  FT.AnPanel = P;
})();
