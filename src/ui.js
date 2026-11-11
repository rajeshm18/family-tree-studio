/* FT.UI — everything the user touches: canvas, inline editing, + handles, drag-to-link, menus, popovers, toolbar. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = FT.SIZE;
  const esc = (s) => FT.esc(s);
  const REL_LABEL = { parent: 'parent', child: 'child', partner: 'partner', sibling: 'brother/sister' };

  const UI = {
    M: null, L: null, view: { x: 0, y: 0, k: 1 }, sel: null, relId: null, hits: null, hitIdx: -1,
    editing: null, drag: null, readOnly: false, firstFit: true,

    init(model) {
      this.M = model;
      this.svg = $('svg'); this.vp = $('viewport'); this.tree = $('tree'); this.overlay = $('overlay');
      $('svgStyle').textContent = FT.SVG_STYLE;
      model.on((kind) => { if (kind !== 'load') FT.IO.saveSoon(); this.render(); });
      this.bindCanvas(); this.bindKeys(); this.bindToolbar();
      window.addEventListener('resize', () => this.applyView());
      // The toolbar wraps onto two rows on narrow screens, so keep the page below it.
      const bar = $('bar');
      const setBar = () => document.documentElement.style.setProperty('--barH', bar.offsetHeight + 'px');
      setBar();
      if (window.ResizeObserver) new ResizeObserver(setBar).observe(bar); else window.addEventListener('resize', setBar);
    },
    get st() { return this.M.data.settings; },
    setting(k, v) { this.st[k] = v; FT.IO.saveSoon(); this.render(); },

    // ------------------------------------------------------------------ render
    layoutOpts() {
      const st = this.st, M = this.M;
      let view = st.view || 'everyone';
      let rootId = st.rootId && M.person(st.rootId) ? st.rootId : null;
      if (view !== 'everyone' && !rootId) rootId = this.sel || M.roots()[0];
      const o = { view, rootId, collapsed: st.collapsed || [], collapsedUp: st.collapsedUp || [], gaps: st.gaps || null };
      o.freeKey = view === 'everyone' ? 'everyone' : view + ':' + rootId;
      o.free = (st.free || {})[o.freeKey] || null;
      const f = st.focusId && M.person(st.focusId) ? st.focusId : null;
      if (f && st.focusMode === 'only') {
        o.allowed = FT.Layout.branchSet(M, f);
        if (view === 'everyone') { o.view = 'descendants'; o.rootId = M.topAncestor(f); }
      }
      return o;
    },
    render() {
      const M = this.M, st = this.st;
      if (this.sel && !M.person(this.sel)) this.sel = null;
      this.L = FT.Layout.compute(M, this.layoutOpts());
      const f = st.focusId && M.person(st.focusId) ? st.focusId : null;
      FT.Render.draw(this.tree, this.L, {
        model: M, selected: new Set(this.sel ? [this.sel] : []), relId: this.relId,
        focusSet: f && st.focusMode === 'dim' ? FT.Layout.branchSet(M, f) : null,
        colorBy: st.colorBy || 'gender', readOnly: this.readOnly, hit: this.hits ? new Set(this.hits) : null
      });
      this.svg.classList.toggle('ro', this.readOnly);
      $('empty').hidden = M.count() > 0;
      $('title').textContent = M.data.meta.title || 'Our Family';
      document.title = (M.data.meta.title || 'Family') + ' – Family Tree Studio';
      document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === (st.view || 'everyone')));
      const fm = f ? (st.focusMode || 'off') : 'off';
      document.querySelectorAll('#focusSeg button').forEach((b) => {
        b.classList.toggle('on', b.dataset.focus === fm);
        b.disabled = !f && b.dataset.focus !== 'off';
      });
      $('colorBy').value = st.colorBy || 'gender';
      $('btnUndo').disabled = !M.canUndo(); $('btnRedo').disabled = !M.canRedo();
      this.updateCollapseBtn();
      this.exampleBanner();
      if (this.firstFit && M.count()) { this.firstFit = false; requestAnimationFrame(() => this.fit(false)); }
      this.updateHint();
      if (FT.VoicePanel) FT.VoicePanel.refresh();
    },
    // ------------------------------------------------------------- collapse all
    collapsedIds() {
      const M = this.M, st = this.st;
      const down = (st.collapsed || []).filter((id) => M.person(id) && M.children(id).length);
      const up = (st.collapsedUp || []).filter((id) => M.person(id));
      return { down, up, n: down.length + up.length };
    },
    updateCollapseBtn() {
      const b = $('btnCollapse'); if (!b) return;
      const c = this.collapsedIds();
      b.disabled = !this.M.count();
      if (c.n) {
        b.innerHTML = '&#8862; Expand all <span class="cnt">' + c.n + '</span>';
        b.title = c.n + (c.n === 1 ? ' branch is' : ' branches are') + ' collapsed (look for the orange +N badges). Click to open everything.';
        b.classList.add('warn');
      } else {
        b.innerHTML = '&#8863; Collapse all';
        b.title = 'Nothing is collapsed. Click to fold every family down to the top couple and their children, then open branches one by one with +N.';
        b.classList.remove('warn');
      }
    },
    toggleCollapseAll() {
      const M = this.M, st = this.st;
      const prev = { collapsed: (st.collapsed || []).slice(), collapsedUp: (st.collapsedUp || []).slice() };
      const restore = () => { st.collapsed = prev.collapsed; st.collapsedUp = prev.collapsedUp; FT.IO.saveSoon(); this.render(); this.fit(); };
      const c = this.collapsedIds();
      if (c.n) {
        st.collapsed = []; st.collapsedUp = [];
        FT.IO.saveSoon(); this.render(); this.fit();
        this.toast('Opened ' + c.n + ' collapsed ' + (c.n === 1 ? 'branch' : 'branches') + ' – everyone is visible now.', true, { label: 'Undo', fn: restore });
        return;
      }
      const o = this.layoutOpts();
      const tops = new Set(o.view === 'everyone' || !o.rootId ? M.roots() : [o.rootId]);
      Array.from(tops).forEach((t) => M.partners(t).forEach((p) => tops.add(p)));
      const fold = new Set();
      tops.forEach((t) => M.children(t).forEach((k) => { if (M.children(k).length) fold.add(k); }));
      if (!fold.size) tops.forEach((t) => { if (M.children(t).length) fold.add(t); });
      if (!fold.size) { this.toast('There is nothing to collapse yet – nobody has grandchildren.'); return; }
      st.collapsed = Array.from(fold);
      FT.IO.saveSoon(); this.render(); this.fit();
      this.toast('Folded ' + fold.size + ' families. Click an orange +N badge to open one, or "Expand all" to open everything.', true, { label: 'Undo', fn: restore });
    },
    updateHint() {
      const M = this.M;
      let h = '';
      if (this.readOnly) h = 'Click a person to see details · right-click for views · drag to move · wheel to zoom';
      else if (this.relId && this.sel) {
        const r = M.relationship(this.sel, this.relId);
        h = '🔗 ' + M.displayName(this.relId) + ' is ' + (r ? M.displayName(this.sel) + '’s ' + r : 'not related by blood to ' + M.displayName(this.sel)) + '  (Shift+click another person to compare)';
      } else if (this.sel) h = 'Type to rename · drag sideways to move this branch · orange dot on top = move the parents’ line to another person · + buttons (click = add, drag onto someone = link) · right-click for more · Shift+click another person to see how they are related';
      else if (M.count()) h = 'Click to select · drag a person left/right to move their branch · drag empty space to pan · double-click to rename · hover for + buttons';
      $('hint').textContent = h;
      const f = this.st.focusId && M.person(this.st.focusId);
      $('status').textContent = M.count() + ' people' + (f ? ' · focus: ' + M.displayName(f) : '') + (this.statusMsg ? ' · ' + this.statusMsg : '');
    },
    status(msg) { this.statusMsg = msg; this.updateHint(); },

    // ------------------------------------------------------------------ viewport
    applyView() { this.vp.setAttribute('transform', `translate(${this.view.x},${this.view.y}) scale(${this.view.k})`); if (this.editing) this.placeInline(); },
    fit(animate) {
      if (!this.L || !this.L.nodes.length) return;
      const b = this.L.bbox, r = this.svg.getBoundingClientRect();
      if (r.width < 50 || r.height < 50) { requestAnimationFrame(() => this.fit(animate)); return; }
      const k = Math.max(0.15, Math.min(1.25, Math.min((r.width - 80) / b.w, (r.height - 90) / b.h)));
      this.animateTo({ k, x: r.width / 2 - (b.x + b.w / 2) * k, y: r.height / 2 - (b.y + b.h / 2) * k }, animate);
    },
    zoomBy(f, cx, cy) {
      const r = this.svg.getBoundingClientRect();
      if (cx === undefined) { cx = r.width / 2; cy = r.height / 2; }
      const k = Math.max(0.08, Math.min(3, this.view.k * f));
      const s = k / this.view.k;
      this.view = { k, x: cx - (cx - this.view.x) * s, y: cy - (cy - this.view.y) * s };
      this.applyView();
    },
    nodeOf(pid) { return this.L && (this.L.nodes.find((n) => n.pid === pid && !n.dup) || this.L.nodes.find((n) => n.pid === pid)); },
    centerOn(pid, animate) {
      const n = this.nodeOf(pid); if (!n) return false;
      const r = this.svg.getBoundingClientRect();
      const k = Math.max(this.view.k, 0.7);
      this.animateTo({ k, x: r.width / 2 - n.x * k, y: r.height / 2 - (n.y + S.H / 2) * k }, animate !== false);
      return true;
    },
    ensureVisible(pid) {
      const n = this.nodeOf(pid); if (!n) return;
      const r = this.svg.getBoundingClientRect(), v = this.view;
      const sx = n.x * v.k + v.x, sy = n.y * v.k + v.y, m = 60;
      if (sx < m + S.W * v.k / 2 || sx > r.width - m - S.W * v.k / 2 || sy < m || sy > r.height - m - S.H * v.k) this.centerOn(pid);
    },
    animateTo(t, animate) {
      cancelAnimationFrame(this.anim);
      if (animate === false) { this.view = t; this.applyView(); return; }
      const s = Object.assign({}, this.view), t0 = performance.now(), D = 320;
      const step = (now) => {
        const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3);
        this.view = { x: s.x + (t.x - s.x) * e, y: s.y + (t.y - s.y) * e, k: s.k + (t.k - s.k) * e };
        this.applyView(); if (p < 1) this.anim = requestAnimationFrame(step);
      };
      this.anim = requestAnimationFrame(step);
    },
    toWorld(cx, cy) { const r = this.svg.getBoundingClientRect(); return { x: (cx - r.left - this.view.x) / this.view.k, y: (cy - r.top - this.view.y) / this.view.k }; },

    // ------------------------------------------------------------------ selection
    select(pid, opts) {
      opts = opts || {};
      if (opts.compare && this.sel && pid && pid !== this.sel) { this.relId = pid; this.render(); return; }
      this.sel = pid; this.relId = null;
      this.render();
      if (FT.AnPanel) FT.AnPanel.selectionChanged(pid);
      if (pid && opts.reveal) this.ensureVisible(pid);
      $('stage').focus({ preventScroll: true });
    },

    // ------------------------------------------------------------------ canvas events
    bindCanvas() {
      const svg = this.svg;
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        this.zoomBy(Math.pow(1.0018, -e.deltaY * (e.deltaMode ? 30 : 1)), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });

      svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        this.closeMenu();
        if (this.editing) this.commitInline();
        const h = e.target.closest('.h'), card = e.target.closest('.card'), act = e.target.closest('[data-act]');
        const ch = e.target.closest('.ch');
        if (ch && !this.readOnly) {
          e.stopPropagation();
          this.drag = { type: 'rechild', from: card.dataset.id, sx: e.clientX, sy: e.clientY, moved: false };
        } else if (h && !this.readOnly) {
          e.stopPropagation();
          this.drag = { type: 'link', rel: h.dataset.h, from: card.dataset.id, sx: e.clientX, sy: e.clientY, moved: false };
        } else if (card && !act && !this.readOnly && card.dataset.dup !== '1' && !e.shiftKey) {
          // dragging a person sideways moves their whole branch; a plain click still selects
          this.drag = { type: 'branch', pid: card.dataset.id, card: card.dataset.id, sx: e.clientX, sy: e.clientY, moved: false };
        } else {
          this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y, moved: false, card: card && card.dataset.id, dup: card && card.dataset.dup === '1', act: act && act.dataset.act, shift: e.shiftKey };
        }
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', (e) => {
        const d = this.drag; if (!d) return;
        const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
        if (dist > 5) d.moved = true;
        if (d.type === 'pan' && d.moved) {
          svg.classList.add('panning');
          this.view.x = d.vx + e.clientX - d.sx; this.view.y = d.vy + e.clientY - d.sy; this.applyView();
        }
        if (d.type === 'branch' && d.moved) {
          if (!d.set) { d.set = this.branchCards(d.pid); this.tree.querySelector('.lines').classList.add('moving'); }
          d.dx = (e.clientX - d.sx) / this.view.k;
          d.dy = (e.clientY - d.sy) / this.view.k;
          d.set.forEach((c) => {
            c.classList.add('moving');
            c.setAttribute('transform', c.dataset.base.replace(/translate\(([-\d.e]+),([-\d.e]+)\)/, (m, x, y) => 'translate(' + (parseFloat(x) + d.dx) + ',' + (parseFloat(y) + d.dy) + ')'));
          });
          d.plan = this.planBranchDrop(d);
          $('hint').textContent = d.plan.text;
        }
        if (d.type === 'rechild' && d.moved) {
          svg.classList.add('linking');
          const n = this.nodeOf(d.from), w = this.toWorld(e.clientX, e.clientY);
          const ov = this.overlay; while (ov.firstChild) ov.removeChild(ov.firstChild);
          FT.svgEl('path', { d: `M${n.x},${n.y}L${w.x},${w.y}`, stroke: '#f59e0b', 'stroke-width': 2.5 / this.view.k, 'stroke-dasharray': '6 5', fill: 'none' }, ov);
          FT.svgEl('circle', { cx: w.x, cy: w.y, r: 7 / this.view.k, fill: '#f59e0b' }, ov);
          const t = this.cardAt(e.clientX, e.clientY);
          this.tree.querySelectorAll('.card.drop').forEach((c) => c.classList.remove('drop'));
          if (t && t.dataset.id !== d.from) t.classList.add('drop');
          const pn = this.M.parents(d.from).map((p) => this.M.person(p).given || this.M.displayName(p)).join(' & ');
          $('hint').textContent = t && t.dataset.id !== d.from
            ? 'Release: ' + this.M.displayName(t.dataset.id) + ' becomes the child of ' + pn + ' instead of ' + this.M.displayName(d.from)
            : 'Drop on the person who is really the child of ' + pn;
        }
        if (d.type === 'link' && d.moved) {
          svg.classList.add('linking');
          const n = this.nodeOf(d.from), w = this.toWorld(e.clientX, e.clientY);
          const ov = this.overlay; while (ov.firstChild) ov.removeChild(ov.firstChild);
          const start = { parent: [n.x - 34, n.y], child: [n.x, n.y + S.H], partner: [n.x + S.W / 2, n.y + S.H / 2], sibling: [n.x - S.W / 2, n.y + S.H / 2] }[d.rel];
          FT.svgEl('path', { d: `M${start[0]},${start[1]}L${w.x},${w.y}`, stroke: '#16a34a', 'stroke-width': 2.5 / this.view.k, 'stroke-dasharray': '6 5', fill: 'none' }, ov);
          FT.svgEl('circle', { cx: w.x, cy: w.y, r: 6 / this.view.k, fill: '#16a34a' }, ov);
          const t = this.cardAt(e.clientX, e.clientY);
          this.tree.querySelectorAll('.card.drop').forEach((c) => c.classList.remove('drop'));
          if (t && t.dataset.id !== d.from) t.classList.add('drop');
          $('hint').textContent = t && t.dataset.id !== d.from
            ? 'Release to make ' + this.M.displayName(t.dataset.id) + ' the ' + REL_LABEL[d.rel] + ' of ' + this.M.displayName(d.from)
            : 'Drop on a person to make them the ' + REL_LABEL[d.rel] + ' of ' + this.M.displayName(d.from) + ' · release on empty space to cancel';
        }
      });
      const end = (e) => {
        const d = this.drag; this.drag = null; if (!d) return;
        svg.classList.remove('panning', 'linking');
        const ov = this.overlay; while (ov.firstChild) ov.removeChild(ov.firstChild);
        if (d.type === 'branch') {
          this.tree.querySelectorAll('.moving').forEach((c) => c.classList.remove('moving'));
          if (!d.moved) { this.select(d.pid, { compare: e.shiftKey }); return; }
          if (Math.hypot(d.dx || 0, d.dy || 0) < 4) { this.render(); return; }
          this.applyBranchDrop(d, d.plan || this.planBranchDrop(d));
          return;
        }
        if (d.type === 'rechild') {
          if (!d.moved) { this.toast('Drag this orange dot onto the person who is really the child (for example the spouse).'); return; }
          const t = this.cardAt(e.clientX, e.clientY);
          if (t && t.dataset.id !== d.from) this.reassignChild(d.from, t.dataset.id);
          else this.render();
          return;
        }
        if (d.type === 'link') {
          if (!d.moved) { this.addRelative(d.rel, d.from); return; }
          const t = this.cardAt(e.clientX, e.clientY);
          if (t && t.dataset.id !== d.from) {
            const err = this.M.change(() => this.M.link(d.rel, d.from, t.dataset.id));
            if (err) this.toast(err);
            else this.toast(this.M.displayName(t.dataset.id) + ' is now ' + REL_LABEL[d.rel] + ' of ' + this.M.displayName(d.from), true);
          } else this.render();
          return;
        }
        if (d.moved) return;
        if (d.act && d.card) return this.cardAction(d.act, d.card);
        if (d.card) {
          if (d.dup) { this.select(d.card); this.centerOn(d.card); return; }
          this.select(d.card, { compare: d.shift });
        } else { this.select(null); this.closeDetails(); }
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', () => { this.drag = null; svg.classList.remove('panning', 'linking'); });
      svg.addEventListener('dblclick', (e) => {
        const card = e.target.closest('.card');
        if (e.target.closest('.h,[data-act]')) return;
        if (!card) { if (!this.readOnly && !this.M.count()) this.addFirst(); else this.fit(); return; }
        if (this.readOnly) return this.openDetails(card.dataset.id);
        this.startInline(card.dataset.id);
      });
      svg.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const card = e.target.closest('.card');
        if (card) { this.select(card.dataset.id); this.personMenu(card.dataset.id, e.clientX, e.clientY); }
        else this.bgMenu(e.clientX, e.clientY);
      });
      // photo drag & drop – anywhere on the page (cards, the Details window, analytics), files or pictures from web pages
      const target = (e) => {
        const c = this.cardAt(e.clientX, e.clientY); if (c) return { pid: c.dataset.id, card: c };
        const det = e.target.closest && e.target.closest('#details');
        if (det && this.detailsPid) return { pid: this.detailsPid };
        const ap = e.target.closest && e.target.closest('#an [data-p]');
        if (ap) return { pid: ap.dataset.p };
        return null;
      };
      const clear = () => this.tree.querySelectorAll('.card.drop').forEach((c) => c.classList.remove('drop'));
      document.addEventListener('dragover', (e) => {
        e.preventDefault(); // never let the browser open the picture instead of the tree
        if (this.readOnly) { try { e.dataTransfer.dropEffect = 'none'; } catch (x) { /* ignore */ } return; }
        try { e.dataTransfer.dropEffect = 'copy'; } catch (x) { /* ignore */ }
        const t = target(e); clear();
        if (t && t.card) t.card.classList.add('drop');
      });
      document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) clear(); });
      document.addEventListener('drop', (e) => {
        e.preventDefault(); clear();
        if (this.readOnly) return;
        const dt = e.dataTransfer, t = target(e);
        // read everything now – the browser empties the drop data after this event
        const files = Array.from(dt.files || []);
        const urls = this.imageUrlsFrom(dt);
        const file = files[0];
        if (file && /\.(json|ged|gedcom|html?)$/i.test(file.name)) return this.openFileObj(file);
        if (!file && !urls.length) return this.toast('Nothing to use there. In the other window, right-click the picture → “Copy image”, then click the card here and press Ctrl+V.');
        if (!t) return this.toast('Drop the photo onto a person’s card (it turns green).');
        this.photoFromDrop(t.pid, files, urls);
      });
    },
    /** Every picture link a drag carries, best first. */
    imageUrlsFrom(dt) {
      const out = [];
      const add = (u) => { if (!u) return; u = u.trim().replace(/&amp;/g, '&'); if (/^(https?:|data:image\/|blob:)/i.test(u) && !out.includes(u)) out.push(u); };
      let html = ''; try { html = dt.getData('text/html') || ''; } catch (x) { /* ignore */ }
      if (html) {
        const d = new DOMParser().parseFromString(html, 'text/html');
        d.querySelectorAll('img').forEach((im) => {
          const ss = (im.getAttribute('srcset') || '').split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);
          if (ss.length) add(ss[ss.length - 1]);
          add(im.getAttribute('src'));
        });
        d.querySelectorAll('[style*="url("]').forEach((n) => { const m = n.getAttribute('style').match(/url\(["']?([^"')]+)/); if (m) add(m[1]); });
      }
      let list = ''; try { list = dt.getData('text/uri-list') || dt.getData('URL') || dt.getData('text/plain') || ''; } catch (x) { /* ignore */ }
      list.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).forEach(add);
      // Google Photos links: ask for a bigger copy than the thumbnail, keep the original as a fallback
      const big = out.map((u) => (/^https:\/\/[^/]*(googleusercontent\.com|ggpht\.com)\//.test(u) ? u.split('?')[0].replace(/=[^/]*$/, '') + '=s1600' : u));
      return big.concat(out).filter((u, i, a) => a.indexOf(u) === i);
    },
    async photoFromDrop(pid, files, urls) {
      for (const f of files) { // whatever the browser hands over: try to read it as a picture, whatever its name or type
        try { const src = await FT.PhotoCrop.readFile(f); return this.cropPhoto(pid, src, null); } catch (e) { /* try the next thing */ }
        if (/\.hei[cf]$/i.test(f.name || '')) return this.toast('iPhone HEIC photos can’t be read by the browser. Save/export it as JPG first, then drop that.');
      }
      if (urls.length) this.status('Fetching the picture…');
      for (const u of urls) {
        try {
          const res = await fetch(u, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
          if (!res.ok) continue;
          const src = await FT.PhotoCrop.readFile(await res.blob());
          this.status('');
          return this.cropPhoto(pid, src, null);
        } catch (e) { /* blocked by that website, or not a picture – try the next link */ }
      }
      this.status('');
      if (files.length && !urls.length) return this.toast('That file is not a picture the browser can read. Use a JPG or PNG photo.');
      this.toast('That website blocks its pictures from being dragged out. Instead: right-click the picture → “Copy image”, click ' + this.M.displayName(pid) + '’s card, then press Ctrl+V.', false, { label: 'OK', fn: () => {} });
    },
    /** Card elements that move together when a person's branch is dragged: them, their partners and everyone below. */
    branchCards(pid) {
      const M = this.M, n = this.nodeOf(pid);
      const ids = new Set([pid]);
      M.descendants(pid).forEach((x) => ids.add(x));
      Array.from(ids).forEach((x) => M.partners(x).forEach((p) => ids.add(p)));
      const out = [];
      this.tree.querySelectorAll('.card').forEach((c) => {
        const ln = this.L.nodes.find((q) => q.pid === c.dataset.id);
        if (ids.has(c.dataset.id) && (!n || !ln || ln.d >= n.d)) { c.dataset.base = c.getAttribute('transform'); out.push(c); }
      });
      return out;
    },
    /** Free-move offsets are kept per view, because a hand-made arrangement only makes sense in the view it was made in. */
    viewKey() {
      return this.layoutOpts().freeKey;
    },
    /**
     * What dropping a dragged branch will do:
     *  - passed over a brother/sister  -> change birth order ("reorder")
     *  - moved up/down, or already freely placed -> place it exactly there ("free")
     *  - small sideways move            -> more/less space beside it ("space")
     */
    planBranchDrop(d) {
      const M = this.M, n = this.nodeOf(d.pid), name = M.displayName(d.pid);
      const free = ((this.st.free || {})[this.viewKey()] || {})[d.pid];
      if (Math.abs(d.dy || 0) > S.ROW * 0.4 || free) {
        return { kind: 'free', text: '✥ Free move: ' + name + '’s family goes exactly where you drop it (lines follow). Right-click → “Put back in the tree” to undo the placement.' };
      }
      const f = M.parentFamily(d.pid);
      if (f && n) {
        const nx = n.x + (d.dx || 0);
        const sibs = f.children.filter((c) => c !== d.pid).map((c) => this.nodeOf(c)).filter((s) => s && !s.dup && s.d === n.d).sort((a, b) => a.x - b.x);
        const curIdx = sibs.filter((s) => s.x < n.x).length, newIdx = sibs.filter((s) => s.x < nx).length;
        if (newIdx !== curIdx && sibs.length) {
          const after = newIdx > 0, other = after ? sibs[newIdx - 1].pid : sibs[0].pid;
          const order = f.children.filter((c) => c !== d.pid);
          order.splice(order.indexOf(other) + (after ? 1 : 0), 0, d.pid);
          const pos = order.indexOf(d.pid) + 1;
          const nth = pos + (pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th');
          return { kind: 'reorder', other, after, text: '⇆ Release to make ' + name + ' the ' + nth + ' child (' + (after ? 'after ' : 'before ') + M.displayName(other) + ')' };
        }
      }
      return { kind: 'space', text: '↔ Release to move ' + name + '’s branch ' + ((d.dx || 0) > 0 ? 'right' : 'left') + ' (branches to the right make room; cards never overlap). Drag up or down for a free move.' };
    },
    applyBranchDrop(d, plan) {
      const M = this.M, pid = d.pid, key = this.viewKey();
      this.sel = pid;
      if (plan.kind === 'reorder') {
        M.change(() => {
          M.placeChild(pid, plan.other, plan.after);
          const g = Object.assign({}, M.data.settings.gaps); delete g[pid]; M.data.settings.gaps = g;
        });
        this.render();
        this.toast(M.displayName(pid) + ' moved ' + (plan.after ? 'after ' : 'before ') + M.displayName(plan.other) + ' in the birth order', true, { label: 'Undo', fn: () => M.undo() });
      } else if (plan.kind === 'free') {
        M.change(() => {
          const all = M.data.settings.free = Object.assign({}, M.data.settings.free);
          const mine = all[key] = Object.assign({}, all[key]);
          const o = mine[pid] || { dx: 0, dy: 0 };
          mine[pid] = { dx: Math.round(o.dx + (d.dx || 0)), dy: Math.round(o.dy + (d.dy || 0)) };
        });
        this.render();
        this.toast(M.displayName(pid) + '’s family placed freely', true, { label: 'Undo', fn: () => M.undo() });
      } else {
        M.change(() => {
          const gaps = M.data.settings.gaps = Object.assign({}, M.data.settings.gaps);
          gaps[pid] = Math.round((gaps[pid] || 0) + (d.dx || 0));
          if (Math.abs(gaps[pid]) < 4) delete gaps[pid];
        });
        this.render();
        this.toast('Branch moved', true, { label: 'Undo', fn: () => M.undo() });
      }
    },
    reassignChild(fromId, toId) {
      const M = this.M;
      const pn = M.parents(fromId).map((p) => M.displayName(p)).join(' & ');
      const err = M.change(() => M.reassignChild(fromId, toId));
      if (err) { this.toast(err); this.render(); return; }
      this.sel = toId; this.render();
      this.toast(M.displayName(toId) + ' is now the child of ' + pn + ' (instead of ' + M.displayName(fromId) + ')', true, { label: 'Undo', fn: () => M.undo() });
    },
    cardAt(x, y) {
      const els = document.elementsFromPoint(x, y);
      for (const el of els) { const c = el.closest && el.closest('.card'); if (c && c.dataset.dup !== '1') return c; }
      return null;
    },
    cardAction(act, pid) {
      if (act === 'expand') {
        this.st.collapsed = (this.st.collapsed || []).filter((x) => x !== pid); FT.IO.saveSoon(); this.select(pid);
      } else if (act === 'collapse') {
        this.st.collapsed = (this.st.collapsed || []).concat([pid]); FT.IO.saveSoon(); this.select(pid);
      } else if (act === 'show-parents') {
        this.st.view = 'hourglass'; this.st.rootId = pid; this.select(pid); this.centerOn(pid);
      } else if (act === 'details') { this.select(pid); this.openDetails(pid); }
    },

    // ------------------------------------------------------------------ adding people
    addFirst() {
      let id; this.M.change(() => { id = this.M.addPerson({}); });
      this.sel = id; this.render(); this.centerOn(id, false); this.startInline(id, '', true);
    },
    addRelative(rel, pid, famId) {
      const M = this.M; let id = null;
      M.change(() => {
        if (rel === 'parent') id = M.addParent(pid, {});
        else if (rel === 'child') id = M.addChild(pid, {}, famId);
        else if (rel === 'partner') id = M.addPartner(pid, {});
        else if (rel === 'sibling') id = M.addSibling(pid, {});
      });
      if (!id) { this.toast('Already has two parents.'); return; }
      // make sure the new person is visible
      if (rel === 'child') this.st.collapsed = (this.st.collapsed || []).filter((x) => x !== pid);
      const undoLen = M.undoStack.length;
      this.sel = id; this.relId = null; this.render();
      if (!this.nodeOf(id)) { this.st.view = 'hourglass'; this.st.rootId = rel === 'parent' ? pid : id; this.render(); }
      this.ensureVisible(id);
      setTimeout(() => this.startInline(id, '', true, { rel, from: pid, undoLen }), 30);
    },

    // ------------------------------------------------------------------ inline editor
    startInline(pid, initial, isNew, meta) {
      if (this.readOnly) return;
      const p = this.M.person(pid); if (!p) return;
      this.closeMenu();
      const inp = $('inline');
      this.editing = Object.assign({ pid, isNew: !!isNew }, meta || {});
      inp.hidden = false;
      inp.value = initial !== undefined ? initial : (isNew ? '' : [p.given, p.surname].filter(Boolean).join(' '));
      inp.placeholder = isNew ? 'Type name, e.g. Ravi Sharma (1952) (M)' : 'Name';
      this.placeInline();
      inp.focus();
      if (initial === undefined) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
      $('hint').textContent = 'Enter = save · Shift+Enter = save & add another ' + (this.editing.rel === 'child' ? 'child' : 'brother/sister') + ' · Tab = save & open details · Esc = cancel  ·  You can type dates and gender too: “Meena Sharma (1955-2010) (F)”';
    },
    placeInline() {
      const ed = this.editing; if (!ed) return;
      const card = this.tree.querySelector(`.card[data-id="${ed.pid}"][data-dup="0"]`);
      const inp = $('inline');
      if (!card) { inp.style.left = '40%'; inp.style.top = '40%'; inp.style.width = '260px'; return; }
      const r = card.getBoundingClientRect();
      const w = Math.max(240, r.width + 40);
      inp.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, r.left + r.width / 2 - w / 2)) + 'px';
      inp.style.top = Math.max(56, r.top + r.height / 2 - 18) + 'px';
      inp.style.width = w + 'px';
      const mic = $('inlineMic'); if (!mic) return;
      mic.hidden = this.readOnly;
      mic.style.left = (parseFloat(inp.style.left) + w + 6) + 'px';
      mic.style.top = (parseFloat(inp.style.top) + 1) + 'px';
    },
    /** Fill the name box by voice: offline Whisper when its engine runs, otherwise the browser's own speech service. */
    async dictate() {
      const inp = $('inline'), mic = $('inlineMic');
      if (!this.editing || !mic || !FT.Whisper) return;
      if (this._dict) { this._dict.stop(); return; }
      const done = (t) => {
        this._dict = null; mic.classList.remove('on', 'busy'); mic.style.boxShadow = '';
        if (t && this.editing) {
          inp.value = t.replace(/^(?:(?:his|her|the)\s+name\s+is|name\s+is|it'?s)\s+/i, '').replace(/[.!?,]+$/, '').trim();
          inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
          $('hint').textContent = 'Check the name, fix any letter by typing, then press Enter to save (Esc cancels).';
        }
      };
      const useWhisper = (() => { try { return (localStorage.getItem('ftstudio:voiceEngine') || 'whisper') === 'whisper'; } catch (e) { return true; } })();
      if (useWhisper && await FT.Whisper.available()) {
        mic.classList.add('on');
        $('hint').textContent = '🎤 Say the name now (offline Whisper)…';
        this._dict = await FT.Whisper.listen({
          once: true, silenceMs: 900,
          onState: (s) => { if (s === 'transcribing') { mic.classList.remove('on'); mic.classList.add('busy'); $('hint').textContent = '⏳ Writing it down…'; } if (s === 'idle' && this._dict) done(''); },
          onLevel: (v) => { mic.style.boxShadow = '0 0 0 ' + Math.round(v * 10) + 'px rgba(220,38,38,.3)'; },
          onText: done,
          onError: (e) => { done(''); this.toast(e.message); }
        });
        return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { this.toast('Start the offline voice engine (double-click “Start Voice Engine”) to speak names.'); return; }
      const rec = new SR();
      try { rec.lang = localStorage.getItem('ftstudio:voiceLang') || 'en-IN'; } catch (e) { rec.lang = 'en-IN'; }
      rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = (e) => done(e.results[0][0].transcript);
      rec.onerror = () => done('');
      rec.onend = () => { if (this._dict) done(''); };
      this._dict = { stop: () => rec.stop() };
      mic.classList.add('on'); $('hint').textContent = '🎤 Say the name now (browser voice)…';
      rec.start();
    },
    commitInline(next) {
      const ed = this.editing; if (!ed) return;
      this.editing = null;
      const inp = $('inline'); const text = inp.value.trim(); inp.hidden = true;
      if ($('inlineMic')) $('inlineMic').hidden = true; if (this._dict) { this._dict.stop(); this._dict = null; }
      const M = this.M, p = M.person(ed.pid);
      if (!p) return;
      if (!text) {
        if (ed.isNew && !p.given && !p.surname) { M.undo(); M.redoStack.pop(); this.sel = ed.from || null; this.render(); }
        $('stage').focus({ preventScroll: true });
        return;
      }
      const f = FT.Paste.parseName(text);
      M.change(() => {
        p.given = f.given || ''; p.surname = f.surname || '';
        if (f.nick) p.nick = f.nick;
        if (f.gender && f.gender !== 'U') p.gender = f.gender;
        if (f.birth && f.birth.date) p.birth.date = f.birth.date;
        if (f.birth && f.birth.place) p.birth.place = f.birth.place;
        if (f.death && f.death.date) p.death.date = f.death.date;
        if (f.death && f.death.place) p.death.place = f.death.place;
        if (f.living === false) p.living = false;
        // inherit surname from father/parent when only a first name is typed for a new child
        if (ed.isNew && !p.surname && (ed.rel === 'child' || ed.rel === 'sibling')) {
          const src = ed.rel === 'child' ? M.person(ed.from) : M.person(ed.from);
          const fatherish = ed.rel === 'child' ? src : null;
          const sn = (fatherish && fatherish.gender !== 'F' && fatherish.surname) || (ed.rel === 'sibling' && src.surname) ||
            (ed.rel === 'child' && M.partners(ed.from).map((x) => M.person(x)).filter((x) => x.gender === 'M').map((x) => x.surname)[0]) || '';
          if (sn) p.surname = sn;
        }
      });
      if (ed.isNew && ed.undoLen !== undefined && M.undoStack.length === ed.undoLen + 1) M.undoStack.splice(ed.undoLen, 1);
      this.render();
      if (next === 'sibling') {
        if (ed.rel === 'child') this.addRelative('child', ed.from, (M.parentFamily(ed.pid) || {}).id);
        else this.addRelative('sibling', ed.pid);
      } else if (next === 'details') this.openDetails(ed.pid);
      else $('stage').focus({ preventScroll: true });
    },
    cancelInline() {
      const ed = this.editing; if (!ed) return;
      $('inline').value = ed.isNew ? '' : $('inline').value;
      if (!ed.isNew) { this.editing = null; $('inline').hidden = true; if ($('inlineMic')) $('inlineMic').hidden = true; $('stage').focus({ preventScroll: true }); return; }
      this.commitInline();
    },

    // ------------------------------------------------------------------ keyboard
    bindKeys() {
      const inp = $('inline');
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.commitInline(e.shiftKey ? 'sibling' : null); }
        else if (e.key === 'Tab') { e.preventDefault(); this.commitInline('details'); }
        else if (e.key === 'Escape') { e.preventDefault(); this.cancelInline(); }
        else if (e.key === 'F8') { e.preventDefault(); this.dictate(); }
        e.stopPropagation();
      });
      inp.addEventListener('blur', () => { setTimeout(() => { if (this.editing && !this._dict && document.activeElement !== inp) this.commitInline(); }, 120); });
      const mic = $('inlineMic');
      if (mic) {
        mic.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }); // keep the cursor in the name box
        mic.addEventListener('click', () => this.dictate());
      }

      document.addEventListener('keydown', (e) => {
        const t = e.target, typing = t.matches && t.matches('input,textarea,select,[contenteditable="true"]');
        const ctrl = e.ctrlKey || e.metaKey;
        if (e.key === 'Escape') { this.closeMenu(); this.closeDetails(); this.closeModal(); if (this.relId) { this.relId = null; this.render(); } return; }
        if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); $('search').focus(); $('search').select(); return; }
        if (typing || !$('modal').hidden) return;
        if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.M.undo(); return; }
        if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); this.M.redo(); return; }
        if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); if (!this.readOnly) FT.IO.saveFile(); return; }
        if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); this.openFile(); return; }
        if (e.key === '+' || e.key === '=') { this.zoomBy(1.2); return; }
        if (e.key === '-') { this.zoomBy(1 / 1.2); return; }
        if (e.key === '0') { this.fit(); return; }
        if (e.key === 'E' && e.shiftKey && !ctrl) { e.preventDefault(); this.toggleCollapseAll(); return; }
        if (e.key === '?') { this.help(); return; }
        const pid = this.sel;
        if (!pid) {
          if (e.key.startsWith('Arrow') && this.L && this.L.nodes.length) { e.preventDefault(); this.select((this.L.nodes.find((n) => n.root) || this.L.nodes[0]).pid, { reveal: true }); }
          return;
        }
        if (ctrl && e.key.startsWith('Arrow') && !this.readOnly) {
          e.preventDefault();
          this.addRelative({ ArrowUp: 'parent', ArrowDown: 'child', ArrowRight: 'partner', ArrowLeft: 'sibling' }[e.key], pid); return;
        }
        if (ctrl && e.key.toLowerCase() === 'e') { e.preventDefault(); this.openDetails(pid); return; }
        if (e.key.startsWith('Arrow')) { e.preventDefault(); this.nav(e.key); return; }
        if (this.readOnly) { if (e.key === 'Enter') this.openDetails(pid); return; }
        if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); this.startInline(pid); return; }
        if (e.key === 'Delete') { e.preventDefault(); this.deletePerson(pid); return; }
        if (e.key.length === 1 && !ctrl && !e.altKey && /\S/.test(e.key)) { e.preventDefault(); this.startInline(pid, e.key); }
      });
      document.addEventListener('paste', (e) => {
        const t = e.target;
        if (this.readOnly || (t.matches && t.matches('input,textarea,[contenteditable="true"]')) || !$('modal').hidden) return;
        // a copied picture (“Copy image” in Google Photos, WhatsApp, any web page, or a screenshot) → photo of the selected person
        const img = Array.from(e.clipboardData.items || []).find((it) => it.kind === 'file' && /^image\//.test(it.type));
        if (img) {
          e.preventDefault();
          const pid = this.sel || this.detailsPid;
          if (!pid) { this.toast('Click the person’s card first, then press Ctrl+V to use the copied picture as their photo.'); return; }
          this.setPhoto(pid, img.getAsFile()); return;
        }
        const text = e.clipboardData.getData('text/plain');
        if (!text || !text.trim()) return;
        e.preventDefault();
        this.pasteDialog(text);
      });
    },
    nav(key) {
      const M = this.M, pid = this.sel, n = this.nodeOf(pid);
      let next = null;
      if (key === 'ArrowUp') next = M.parents(pid).find((p) => this.nodeOf(p)) || M.parents(pid)[0];
      else if (key === 'ArrowDown') next = M.children(pid).find((c) => this.nodeOf(c)) || M.children(pid)[0];
      else if (n) {
        const row = this.L.nodes.filter((x) => x.y === n.y && !x.dup).sort((a, b) => a.x - b.x);
        const i = row.findIndex((x) => x.pid === pid);
        const j = key === 'ArrowLeft' ? i - 1 : i + 1;
        if (row[j]) next = row[j].pid;
      }
      if (next) {
        if (!this.nodeOf(next)) { this.st.view = 'hourglass'; this.st.rootId = next; }
        this.select(next, { reveal: true });
      }
    },

    // ------------------------------------------------------------------ menus
    menu(items, x, y, cls) {
      const m = $('menu'); m.className = 'menu ' + (cls || ''); m.innerHTML = '';
      items.forEach((it) => {
        if (!it) return;
        if (it === '-') { m.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); return; }
        if (it.head) { m.insertAdjacentHTML('beforeend', `<div class="mh">${esc(it.head)}</div>`); return; }
        if (it.chips) {
          const d = document.createElement('div'); d.className = 'chips';
          it.chips.forEach((c) => {
            const b = document.createElement('button'); b.textContent = c.label; if (c.on) b.className = 'on';
            b.onclick = () => { this.closeMenu(); c.fn(); }; d.appendChild(b);
          });
          m.appendChild(d); return;
        }
        const d = document.createElement('div');
        d.className = 'mi' + (it.disabled ? ' dis' : '');
        d.innerHTML = `<span class="ico">${it.icon || ''}</span><span>${esc(it.label)}</span>${it.key ? `<span class="k">${esc(it.key)}</span>` : ''}`;
        d.onclick = () => { this.closeMenu(); it.fn(); };
        m.appendChild(d);
      });
      m.hidden = false;
      const r = m.getBoundingClientRect();
      m.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 6)) + 'px';
      m.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
      setTimeout(() => document.addEventListener('pointerdown', this._mclose = (e) => { if (!m.contains(e.target)) this.closeMenu(); }), 0);
    },
    closeMenu() { $('menu').hidden = true; if (this._mclose) document.removeEventListener('pointerdown', this._mclose); },
    personMenu(pid, x, y) {
      const M = this.M, p = M.person(pid), name = M.displayName(p), ro = this.readOnly, st = this.st;
      const view = (v) => () => { st.view = v; st.rootId = pid; this.select(pid); this.fit(); };
      const items = [{ head: name }];
      items.push({ icon: '✎', label: ro ? 'Details' : 'Edit details (dates, places, photo, notes)', key: 'Ctrl+E', fn: () => this.openDetails(pid) });
      items.push({ icon: '📊', label: 'Analytics for ' + name, key: 'F9', fn: () => { this.select(pid); FT.AnPanel.show('person', pid); } });
      if (!ro) {
        items.push({ icon: 'Aa', label: 'Rename', key: 'F2', fn: () => this.startInline(pid) });
        items.push('-', { head: 'Add relative' });
        items.push({ icon: '▲', label: 'Add parent', key: 'Ctrl+↑', disabled: M.parents(pid).length >= 2, fn: () => this.addRelative('parent', pid) });
        items.push({ icon: '♥', label: 'Add partner / spouse', key: 'Ctrl+→', fn: () => this.addRelative('partner', pid) });
        const fams = M.famsAsPartner(pid);
        if (fams.filter((f) => f.partners.length === 2).length > 1) {
          fams.forEach((f) => {
            const o = f.partners.find((q) => q !== pid);
            items.push({ icon: '▼', label: 'Add child with ' + (o ? M.displayName(o) : 'unknown partner'), fn: () => this.addRelative('child', pid, f.id) });
          });
        } else items.push({ icon: '▼', label: 'Add child', key: 'Ctrl+↓', fn: () => this.addRelative('child', pid) });
        items.push({ icon: '◀', label: 'Add brother / sister', key: 'Ctrl+←', fn: () => this.addRelative('sibling', pid) });
        items.push({ icon: '📋', label: 'Paste several names here…', fn: () => this.pasteDialog('') });
      }
      items.push('-', { head: 'View' });
      items.push({ icon: '⬇', label: 'Descendants of ' + (p.given || name), fn: view('descendants') });
      items.push({ icon: '⬆', label: 'Ancestors of ' + (p.given || name), fn: view('ancestors') });
      items.push({ icon: '⧗', label: 'Hourglass around ' + (p.given || name), fn: view('hourglass') });
      items.push({ icon: '🎯', label: 'Focus on this branch (dim others)', fn: () => { st.focusId = pid; st.focusMode = st.focusMode === 'only' ? 'only' : 'dim'; this.select(pid); } });
      items.push({ icon: '🔍', label: 'Show only this branch', fn: () => { st.focusId = pid; st.focusMode = 'only'; this.select(pid); this.fit(); } });
      if (M.children(pid).length) {
        const col = (st.collapsed || []).includes(pid);
        items.push({ icon: col ? '⊞' : '⊟', label: col ? 'Expand branch' : 'Collapse branch', fn: () => this.cardAction(col ? 'expand' : 'collapse', pid) });
        items.push({ icon: '⊟', label: 'Collapse all grandchildren (show children only)', fn: () => { st.collapsed = Array.from(new Set((st.collapsed || []).filter((x) => x !== pid).concat(M.children(pid)))); this.select(pid); } });
      }
      if (!ro) {
        const pf = M.parentFamily(pid);
        // one-click fix when the wrong spouse was linked as the child (e.g. son-in-law instead of daughter)
        if (pf) {
          M.partners(pid).filter((q) => !M.parents(q).length).forEach((q) => items.push({ icon: '⇄', label: 'Make ' + M.displayName(q) + ' the child of ' + pf.partners.map((x) => M.person(x).given || M.displayName(x)).join(' & ') + ' instead', fn: () => this.reassignChild(pid, q) }));
        } else {
          M.partners(pid).filter((q) => M.parents(q).length).forEach((q) => items.push({ icon: '⇄', label: 'Make ' + (p.given || name) + ' the child of ' + M.parents(q).map((x) => M.person(x).given || M.displayName(x)).join(' & ') + ' instead of ' + M.displayName(q), fn: () => this.reassignChild(q, pid) }));
        }
        const fk = this.viewKey();
        if (((st.free || {})[fk] || {})[pid]) items.push({ icon: '✥', label: 'Put back in the tree (undo free placement)', fn: () => M.change(() => { const all = Object.assign({}, M.data.settings.free); const mine = Object.assign({}, all[fk]); delete mine[pid]; all[fk] = mine; M.data.settings.free = all; }) });
        if ((st.gaps || {})[pid] !== undefined) items.push({ icon: '↔', label: 'Reset this branch’s position', fn: () => M.change(() => { const g = Object.assign({}, M.data.settings.gaps); delete g[pid]; M.data.settings.gaps = g; }) });
        if (pf) {
          items.push('-', { head: 'Child of ' + pf.partners.map((x) => M.person(x).given || M.displayName(x)).join(' & ') });
          const rel = pf.childRel[pid] || 'birth';
          items.push({ chips: ['birth', 'adopted', 'step', 'foster'].map((r) => ({ label: r, on: rel === r, fn: () => M.change(() => M.setChildRel(pid, r)) })) });
          items.push({ chips: [{ label: '◀ move left', fn: () => M.change(() => M.moveChild(pid, -1)) }, { label: 'move right ▶', fn: () => M.change(() => M.moveChild(pid, 1)) }, { label: '✂ unlink from parents', fn: () => M.change(() => M.unlinkFromParents(pid)) }] });
        }
        M.famsAsPartner(pid).filter((f) => f.partners.length === 2).forEach((f) => {
          const o = f.partners.find((q) => q !== pid);
          items.push('-', { head: 'With ' + M.displayName(o) });
          items.push({ chips: ['married', 'partner', 'divorced', 'separated', 'widowed'].map((s) => ({ label: s, on: f.status === s, fn: () => M.change(() => { f.status = s; }) })).concat([{ label: '✂ unlink', fn: () => M.change(() => M.unlinkPartner(pid, o)) }]) });
        });
        items.push('-', { head: 'Person' });
        items.push({ chips: [['M', '♂ Male'], ['F', '♀ Female'], ['U', '? Unknown']].map(([g, l]) => ({ label: l, on: p.gender === g, fn: () => M.change(() => { p.gender = g; }) })) });
        const living = M.isLiving(p);
        items.push({ chips: [{ label: 'Living', on: living, fn: () => M.change(() => { p.living = true; }) }, { label: 'Deceased', on: !living, fn: () => M.change(() => { p.living = false; }) }] });
        items.push({ icon: '🖼', label: p.photo ? 'Change photo…' : 'Add photo… (or drop an image on the card)', fn: () => this.pickPhoto(pid) });
        if (p.photo) items.push({ icon: '🔍', label: 'Adjust photo (zoom, move, rotate)…', fn: () => this.adjustPhoto(pid) });
        if (p.photo) items.push({ icon: '✖', label: 'Remove photo', fn: () => M.change(() => this.removePhoto(pid)) });
        items.push({ icon: '🗑', label: 'Delete ' + name, key: 'Del', fn: () => this.deletePerson(pid) });
      }
      this.menu(items, x, y);
    },
    bgMenu(x, y) {
      const items = [];
      if (!this.readOnly) {
        items.push({ icon: '➕', label: 'Add a new person (not connected yet)', fn: () => this.addFirst() });
        items.push({ icon: '📋', label: 'Paste a list / outline of names…', key: 'Ctrl+V', fn: () => this.pasteDialog('') });
      }
      items.push({ icon: '⤢', label: 'Fit tree to screen', key: '0', fn: () => this.fit() });
      items.push({ icon: '🌳', label: 'Show everyone', fn: () => { this.st.view = 'everyone'; this.st.focusMode = 'off'; this.render(); this.fit(); } });
      const fk = this.viewKey();
      if (!this.readOnly && Object.keys((this.st.free || {})[fk] || {}).length) items.push({ icon: '✥', label: 'Put all freely placed families back in the tree (this view)', fn: () => this.M.change(() => { const all = Object.assign({}, this.M.data.settings.free); delete all[fk]; this.M.data.settings.free = all; }) });
      if (!this.readOnly && Object.keys(this.st.gaps || {}).length) items.push({ icon: '↔', label: 'Reset all moved branches to automatic layout', fn: () => this.M.change(() => { this.M.data.settings.gaps = {}; }) });
      if ((this.st.collapsed || []).length) items.push({ icon: '⊞', label: 'Expand all collapsed branches', fn: () => { this.st.collapsed = []; this.render(); } });
      this.menu(items, x, y);
    },

    // ------------------------------------------------------------------ details popover
    openDetails(pid) {
      this.closeDetails(); this.closeMenu();
      const M = this.M, p = M.person(pid); if (!p) return;
      const box = $('details'); box.hidden = false;
      this.detailsPid = pid;
      if (!this.readOnly) M.beginBatch();
      const rels = () => {
        const chip = (id) => `<span class="chip" data-go="${id}">${esc(M.displayName(id))}</span>`;
        const parts = [['Parents', M.parents(pid)], ['Partners', M.partners(pid)], ['Children', M.children(pid)], ['Siblings', M.siblings(pid)]];
        return parts.filter(([, a]) => a.length).map(([l, a]) => `<div class="rl">${l}</div>${a.map(chip).join('')}`).join('');
      };
      const living = M.isLiving(p);
      if (this.readOnly) {
        const line = (l, v) => (v ? `<div><b>${l}:</b> ${esc(v)}</div>` : '');
        box.innerHTML = `<h3>${p.photo ? `<img src="${p.photo}" style="width:44px;height:44px;border-radius:50%;object-fit:cover">` : ''}${esc(M.displayName(p))}<button class="x" title="Close">✕</button></h3>
          <div class="ro">${line('Also known as', p.nick)}${line('Name in own script', p.altName)}${line('Gotra', p.gotra)}${line('Native place', p.native)}${line('Born', [p.birth.date, p.birth.place].filter(Boolean).join(', '))}
          ${line('Died', [p.death.date, p.death.place].filter(Boolean).join(', ') || (living ? '' : 'yes'))}${p.notes ? `<div style="white-space:pre-wrap;margin-top:8px">${esc(p.notes)}</div>` : ''}</div>
          <div class="rels">${rels()}</div>`;
      } else {
        box.innerHTML = `<h3>✎ Details<button class="x" title="Close (Esc)">✕</button></h3>
        <div class="f">
          <label>First / given name<input data-k="given" value="${esc(p.given)}"></label>
          <label>Surname / family name<input data-k="surname" value="${esc(p.surname)}"></label>
          <label>Nickname / pet name<input data-k="nick" value="${esc(p.nick)}"></label>
          <label>Name in own script<input data-k="altName" value="${esc(p.altName)}" placeholder="e.g. శ్రీకాంత్ / ಶ್ರೀಕಾಂತ್"></label>
          <label>Gotra<input data-k="gotra" value="${esc(p.gotra)}"></label>
          <label>Native place (ooru)<input data-k="native" value="${esc(p.native)}" placeholder="Ancestral town / village"></label>
          <label>Gender<div class="tg" data-tg="gender">${[['M', '♂ M'], ['F', '♀ F'], ['U', '?']].map(([g, l]) => `<button data-v="${g}" class="${p.gender === g ? 'on' : ''}">${l}</button>`).join('')}</div></label>
          <label>Born (date)<input data-k="birth.date" value="${esc(p.birth.date)}" placeholder="e.g. 1952 or 12 Mar 1952"></label>
          <label>Born (place)<input data-k="birth.place" value="${esc(p.birth.place)}" placeholder="City / village"></label>
          <label class="w">Status<div class="tg" data-tg="living">${[['auto', 'Auto'], ['true', 'Living'], ['false', 'Deceased']].map(([v, l]) => `<button data-v="${v}" class="${String(p.living === null ? 'auto' : p.living) === v ? 'on' : ''}">${l}</button>`).join('')}</div></label>
          <label>Died (date)<input data-k="death.date" value="${esc(p.death.date)}"></label>
          <label>Died (place)<input data-k="death.place" value="${esc(p.death.place)}"></label>
          <label class="w">Notes, stories, occupation, address…<textarea data-k="notes">${esc(p.notes)}</textarea></label>
          <div class="ph">${p.photo ? `<img src="${p.photo}">` : ''}${p.photo ? '<button data-ph="adj">🔍 Adjust</button>' : ''}<button data-ph="pick">${p.photo ? 'Change photo' : '🖼 Add photo'}</button>${p.photo ? '<button data-ph="rm">Remove</button>' : ''}<span style="font-size:11.5px;color:var(--ink2)">or drop an image on the card</span></div>
          <div class="sw">Card colour: ${['', '#e07a3f', '#2f9e8f', '#7b61c9', '#d4a017', '#3a7fd0', '#c2477a', '#5d9c3a'].map((c) => `<i data-c="${c}" title="${c ? c : 'automatic'}" class="${p.color === c ? 'on' : ''}" style="background:${c || 'linear-gradient(135deg,#3f7fd8 50%,#d9578b 50%)'}"></i>`).join('')}</div>
        </div><div class="rels">${rels()}</div>`;
        box.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => {
          const [a, b] = inp.dataset.k.split('.');
          if (b) p[a][b] = inp.value; else p[a] = inp.value;
          M.batchChanged();
        }));
        box.querySelectorAll('[data-tg]').forEach((tg) => tg.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return; e.preventDefault();
          tg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          if (tg.dataset.tg === 'gender') p.gender = b.dataset.v;
          else p.living = b.dataset.v === 'auto' ? null : b.dataset.v === 'true';
          M.batchChanged();
        }));
        box.querySelectorAll('[data-c]').forEach((s) => s.addEventListener('click', () => {
          p.color = s.dataset.c; box.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === s)); M.batchChanged();
        }));
        box.querySelectorAll('[data-ph]').forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.ph === 'pick') this.pickPhoto(pid);
          else if (b.dataset.ph === 'adj') this.adjustPhoto(pid);
          else { this.removePhoto(pid); M.batchChanged(); this.openDetails(pid); }
        }));
      }
      box.querySelector('.x').onclick = () => this.closeDetails();
      this.makeMovable(box, box.querySelector('h3'));
      this.rememberSize(box, 'details');
      box.querySelectorAll('[data-go]').forEach((c) => c.addEventListener('click', () => {
        const id = c.dataset.go; this.closeDetails();
        if (!this.nodeOf(id)) { this.st.view = 'hourglass'; this.st.rootId = id; }
        this.select(id, { reveal: true }); this.openDetails(id);
      }));
      this.placeDetails();
      const first = box.querySelector('input'); if (first && !this.readOnly) first.focus();
      setTimeout(() => document.addEventListener('pointerdown', this._dclose = (e) => {
        if (!box.contains(e.target) && !e.target.closest('#menu') && !e.target.closest('.card')) this.closeDetails();
      }), 0);
    },
    /** Drag a floating window around by its title bar. */
    makeMovable(box, handle) {
      if (!handle) return;
      handle.onpointerdown = (e) => {
        if (e.button !== 0 || e.target.closest('button,input,textarea,select')) return;
        e.preventDefault();
        const r = box.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        const move = (ev) => {
          box.style.left = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - dx)) + 'px';
          box.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy)) + 'px';
        };
        const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      };
    },
    /** Re-open a resizable window at the size the user last dragged it to. */
    rememberSize(box, key) {
      const k = 'ftstudio:size:' + key;
      try {
        const s = JSON.parse(localStorage.getItem(k) || 'null');
        if (s) { box.style.width = Math.min(s.w, window.innerWidth - 16) + 'px'; box.style.height = Math.min(s.h, window.innerHeight - 16) + 'px'; }
      } catch (e) { /* storage unavailable */ }
      if (box._ro || !window.ResizeObserver) return;
      let first = true;
      box._ro = new ResizeObserver(() => {
        if (first || box.hidden) { first = false; return; }
        if (!box.style.width && !box.style.height) return; // only sizes the user set by dragging
        try { localStorage.setItem(k, JSON.stringify({ w: box.offsetWidth, h: box.offsetHeight })); } catch (e) { /* ignore */ }
      });
      box._ro.observe(box);
    },
    placeDetails() {
      const box = $('details'), pid = this.detailsPid;
      const card = this.tree.querySelector(`.card[data-id="${pid}"][data-dup="0"]`);
      const bw = box.offsetWidth, bh = box.offsetHeight;
      let x = window.innerWidth - bw - 16, y = 64;
      if (card) {
        const r = card.getBoundingClientRect();
        x = r.right + 16; if (x + bw > window.innerWidth - 8) x = r.left - bw - 16;
        if (x < 8) x = Math.max(8, window.innerWidth - bw - 8);
        y = Math.max(60, Math.min(r.top - 20, window.innerHeight - bh - 10));
      }
      box.style.left = x + 'px'; box.style.top = y + 'px';
    },
    closeDetails() {
      const box = $('details'); if (box.hidden) return;
      box.hidden = true; this.detailsPid = null;
      if (this._dclose) document.removeEventListener('pointerdown', this._dclose);
      if (!this.readOnly) { this.M.endBatch(); FT.IO.saveSoon(); this.render(); }
    },
    pickPhoto(pid) {
      const inp = $('photoInput');
      inp.onchange = () => { const f = inp.files[0]; inp.value = ''; if (f) this.setPhoto(pid, f); };
      inp.click();
    },
    async setPhoto(pid, file) {
      let src;
      try { src = await FT.PhotoCrop.readFile(file); } catch (e) {
        this.toast(/\.hei[cf]$/i.test((file && file.name) || '') ? 'iPhone HEIC photos can’t be read by the browser. Open it in the Photos app and save/export it as JPG, then add that.' : 'Could not read that image.');
        return;
      }
      this.cropPhoto(pid, src, null);
    },
    /** Zoom / pan / rotate a photo so the face sits in the card's circle. */
    adjustPhoto(pid) {
      const p = this.M.person(pid); if (!p || !p.photo) return;
      this.cropPhoto(pid, p.photoSrc || p.photo, p.photoSrc ? p.photoCrop : null);
    },
    cropPhoto(pid, src, crop) {
      const open = this.detailsPid === pid;
      if (open) this.closeDetails();
      FT.PhotoCrop.open(src, crop, (r) => {
        this.M.change(() => { const p = this.M.person(pid); p.photo = r.photo; p.photoSrc = r.photoSrc; p.photoCrop = r.photoCrop; });
        if (open) this.openDetails(pid);
      }, this.M.displayName(pid));
    },
    removePhoto(pid) { const p = this.M.person(pid); p.photo = ''; p.photoSrc = ''; p.photoCrop = null; },
    deletePerson(pid) {
      const name = this.M.displayName(pid);
      this.closeDetails();
      this.M.change(() => this.M.deletePerson(pid));
      this.sel = null; this.render();
      this.toast('Deleted ' + name, false, { label: 'Undo', fn: () => this.M.undo() });
    },

    // ------------------------------------------------------------------ toast & modal
    toast(msg, ok, action) {
      const t = $('toast'); t.innerHTML = ''; t.hidden = false;
      const s = document.createElement('span'); s.textContent = (ok ? '✔ ' : '') + msg; t.appendChild(s);
      if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { t.hidden = true; action.fn(); }; t.appendChild(b); }
      clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3500);
    },
    modal(html) { $('modalBox').innerHTML = html; $('modal').hidden = false; return $('modalBox'); },
    closeModal() { $('modal').hidden = true; },

    // ------------------------------------------------------------------ paste
    pasteDialog(text) {
      const M = this.M, sel = this.sel && M.person(this.sel) ? this.sel : null;
      const box = this.modal(`<h2>📋 Paste names</h2>
        <p>Paste one name per line, or an indented outline: <b>indent</b> = child, <b>+</b> = spouse, dates in brackets, (M)/(F) for gender.</p>
        <div class="cols"><textarea id="pText" placeholder="Ramlal Sharma (1920-1995) + Kamla Devi&#10;    Suresh Sharma + Meena&#10;        Vivek (M)&#10;        Priya (F)&#10;    Mahesh Sharma&#10;    Geeta (F)"></textarea><pre id="pPrev"></pre></div>
        <div class="opt" id="pMode"></div>
        <div class="acts"><button id="pCancel">Cancel</button><button id="pGo" class="primary">Add people</button></div>`);
      const ta = box.querySelector('#pText'); ta.value = text || '';
      let mode = null;
      const modes = () => {
        const opts = [];
        if (sel) {
          const nm = M.person(sel).given || M.displayName(sel);
          opts.push(['children', 'as children of ' + nm], ['siblings', 'as brothers/sisters of ' + nm], ['partners', 'as spouse of ' + nm]);
          if (M.parents(sel).length < 2) opts.push(['parents', 'as parents of ' + nm]);
        }
        opts.push(['none', 'as a new, separate family']);
        return opts;
      };
      const refresh = () => {
        let res; try { res = FT.Paste.parse(ta.value); } catch (e) { res = { roots: [] }; }
        const lines = [];
        let n = 0;
        const walk = (node, depth) => {
          n += 1 + node.partners.length;
          const nm = (x) => [x.given, x.surname].filter(Boolean).join(' ') + (x.gender !== 'U' ? ' (' + x.gender + ')' : '') + (x.birth.date || x.death.date ? ' [' + (x.birth.date || '?') + (x.death.date ? '–' + x.death.date : '') + ']' : '');
          lines.push('  '.repeat(depth) + (depth ? '└ ' : '• ') + nm(node.person) + node.partners.map((q) => '  ♥ ' + nm(q)).join(''));
          node.children.forEach((c) => walk(c, depth + 1));
        };
        res.roots.forEach((r) => walk(r, 0));
        box.querySelector('#pPrev').textContent = lines.length ? 'Preview – ' + n + ' people\n\n' + lines.join('\n') : 'Preview appears here';
        const single = res.roots.length === 1 && sel && [res.roots[0].person.given, res.roots[0].person.surname].join(' ').trim().toLowerCase() === M.displayName(sel).toLowerCase();
        const opts = modes(); if (single) opts.unshift(['self', 'merge into ' + M.displayName(sel) + ' (same person)']);
        if (!mode || !opts.some((o) => o[0] === mode)) mode = opts[0][0];
        const mb = box.querySelector('#pMode'); mb.innerHTML = '<span style="color:var(--ink2)">Add</span>';
        opts.forEach(([k, l]) => { const b = document.createElement('button'); b.textContent = l; b.className = k === mode ? 'on' : ''; b.onclick = () => { mode = k; refresh(); }; mb.appendChild(b); });
        box.querySelector('#pGo').disabled = !n;
        return res;
      };
      ta.addEventListener('input', refresh); refresh(); ta.focus();
      box.querySelector('#pCancel').onclick = () => this.closeModal();
      box.querySelector('#pGo').onclick = () => {
        const res = refresh(); if (!res.roots.length) return;
        let firstId = null;
        M.change(() => { firstId = this.buildFromOutline(res.roots, mode, sel); });
        this.closeModal();
        if (mode === 'none' && this.st.view !== 'everyone') this.st.view = 'everyone';
        this.render();
        if (firstId) { this.select(firstId); this.centerOn(firstId); }
        this.toast('Added people from your list', true, { label: 'Undo', fn: () => M.undo() });
      };
    },
    buildFromOutline(roots, mode, sel) {
      const M = this.M;
      const fill = (id, f) => { const p = M.person(id); const keep = p.id; Object.assign(p, FT.blankPerson(Object.assign({}, f, { id: keep }))); };
      const grow = (id, node) => {
        let firstPartner = null;
        const me = M.person(id), q0 = node.partners[0];
        if (q0 && me.gender === 'U' && q0.gender !== 'U') me.gender = q0.gender === 'F' ? 'M' : 'F';
        node.partners.forEach((q, i) => { const pid = M.addPartner(id, q); if (!i) firstPartner = pid; });
        const fam = firstPartner ? M.famsAsPartner(id).find((f) => f.partners.includes(firstPartner)) : null;
        node.children.forEach((c) => {
          const cf = Object.assign({}, c.person);
          const father = [M.person(id)].concat(firstPartner ? [M.person(firstPartner)] : []).find((x) => x.gender === 'M');
          if (!cf.surname && father && father.surname) cf.surname = father.surname;
          const cid = M.addChild(id, cf, fam && fam.id);
          grow(cid, c);
        });
        return id;
      };
      let first = null;
      roots.forEach((node) => {
        let id;
        if (mode === 'self') { id = sel; const p = M.person(sel); if (node.person.birth.date && !p.birth.date) p.birth.date = node.person.birth.date; }
        else if (mode === 'children') id = M.addChild(sel, Object.assign({}, node.person, { surname: node.person.surname || (M.person(sel).gender !== 'F' ? M.person(sel).surname : '') }));
        else if (mode === 'siblings') id = M.addSibling(sel, Object.assign({}, node.person, { surname: node.person.surname || M.person(sel).surname }));
        else if (mode === 'partners') id = M.addPartner(sel, node.person);
        else if (mode === 'parents') id = M.addParent(sel, node.person) || M.addPerson(node.person);
        else id = M.addPerson(node.person);
        if (!first) first = id;
        grow(id, node);
      });
      void fill;
      return first;
    },

    // ------------------------------------------------------------------ toolbar
    bindToolbar() {
      document.querySelectorAll('#viewSeg button').forEach((b) => b.addEventListener('click', () => {
        const v = b.dataset.view, st = this.st;
        if (v !== 'everyone') {
          let r = this.sel || st.rootId;
          if (!r) { const roots = this.M.roots(); r = roots[0]; }
          if (v === 'descendants' && !this.sel && r) r = this.M.topAncestor(r);
          st.rootId = r;
          if (!r) { this.toast('Add someone first'); return; }
        }
        st.view = v; FT.IO.saveSoon(); this.render(); this.fit();
        if (v !== 'everyone' && !this.sel) this.toast('Tip: select a person first, then pick a view to centre it on them');
      }));
      document.querySelectorAll('#focusSeg button').forEach((b) => b.addEventListener('click', () => {
        const m = b.dataset.focus, st = this.st;
        if (m === 'off') { st.focusMode = 'off'; }
        else { if (this.sel) st.focusId = this.sel; if (!st.focusId) { this.toast('Select a person first – their branch will be focused'); return; } st.focusMode = m; }
        FT.IO.saveSoon(); this.render(); if (m === 'only' || m === 'off') this.fit();
      }));
      $('colorBy').addEventListener('change', (e) => this.setting('colorBy', e.target.value));
      $('btnUndo').onclick = () => this.M.undo();
      $('btnRedo').onclick = () => this.M.redo();
      $('btnFit').onclick = () => this.fit();
      $('btnCollapse').onclick = () => this.toggleCollapseAll();
      $('btnZoomIn').onclick = () => this.zoomBy(1.25);
      $('btnZoomOut').onclick = () => this.zoomBy(0.8);
      $('btnPaste').onclick = () => this.pasteDialog('');
      $('btnHelp').onclick = () => this.help();
      $('btnLegend').onclick = () => this.legend();
      $('btnAnalytics').onclick = () => FT.AnPanel.toggle();
      $('btnFile').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); this.fileMenu(r.right - 260, r.bottom + 6); };
      $('eAdd').onclick = () => this.addFirst();
      $('ePaste').onclick = () => this.pasteDialog('');
      $('eSample').onclick = () => this.loadData(FT.SAMPLE, 'Sample family loaded – play freely, then File → New tree to start your own');
      $('eOpen').onclick = () => this.openFile();
      const title = $('title');
      title.addEventListener('click', () => { if (this.readOnly) return; title.contentEditable = 'true'; title.focus(); document.execCommand('selectAll', false, null); });
      title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); title.blur(); } e.stopPropagation(); });
      title.addEventListener('blur', () => {
        title.contentEditable = 'false';
        const v = title.textContent.trim();
        if (v && v !== this.M.data.meta.title) this.M.change(() => { this.M.data.meta.title = v; }); else this.render();
      });
      // search
      const s = $('search');
      s.addEventListener('input', () => {
        const q = s.value.trim().toLowerCase();
        if (!q) { this.hits = null; $('searchInfo').textContent = ''; this.render(); return; }
        const M = this.M;
        this.hits = Object.values(M.people).filter((p) => [p.given, p.surname, p.nick, p.birth.place, p.death.place].join(' ').toLowerCase().includes(q)).map((p) => p.id);
        this.hitIdx = -1;
        $('searchInfo').textContent = this.hits.length ? this.hits.length + ' found · Enter' : 'none';
        this.render();
      });
      s.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { s.value = ''; s.dispatchEvent(new Event('input')); $('stage').focus(); }
        if (e.key === 'Enter' && this.hits && this.hits.length) {
          this.hitIdx = (this.hitIdx + 1) % this.hits.length;
          const id = this.hits[this.hitIdx];
          if (!this.nodeOf(id)) { this.st.view = 'hourglass'; this.st.rootId = id; }
          this.sel = id; this.render(); this.centerOn(id);
          $('searchInfo').textContent = (this.hitIdx + 1) + ' / ' + this.hits.length;
        }
        e.stopPropagation();
      });
    },
    fileMenu(x, y) {
      const ro = this.readOnly, IO = FT.IO, tree = () => [this.tree, this.L.bbox];
      const items = [];
      if (!ro) {
        items.push({ head: 'Your tree' });
        items.push({ icon: '💾', label: IO.fileHandle ? 'Save to ' + IO.fileHandle.name : 'Save to file…', key: 'Ctrl+S', fn: () => IO.saveFile() });
        items.push({ icon: '💾', label: 'Save as new file…', fn: () => IO.saveFile(true) });
        items.push({ icon: '📂', label: 'Open file (tree .json, GEDCOM, shared .html)…', key: 'Ctrl+O', fn: () => this.openFile() });
        items.push({ icon: '📄', label: 'New empty tree', fn: () => this.newTree() });
        items.push({ icon: '👪', label: 'Load sample family', fn: () => this.loadData(FT.SAMPLE, 'Sample family loaded') });
        items.push({ icon: '⏲', label: 'Restore a backup…', fn: () => this.backupDialog() });
        items.push('-', { head: 'Share with family' });
        items.push({ icon: '🔗', label: 'Share copy (single HTML file)…', fn: () => this.shareDialog() });
        items.push({ icon: '📤', label: this.sel ? 'Send ' + this.M.displayName(this.sel) + '’s branch to a relative…' : 'Send a branch to a relative… (select a person first)', fn: () => FT.Extras.sendBranch(this.sel) });
        items.push({ icon: '📥', label: 'Merge changes from a relative’s copy…', fn: () => FT.Extras.mergeCopy() });
      } else items.push({ head: 'Export' });
      items.push({ icon: '📖', label: 'Family Book (printable PDF with photos)', fn: () => FT.Extras.familyBook() });
      items.push({ icon: '🖼', label: 'Picture of current view (PNG)', fn: () => IO.exportPNG(...tree()).catch((e) => this.toast(e.message)) });
      items.push({ icon: '✏', label: 'Vector picture (SVG)', fn: () => IO.exportSVG(...tree()) });
      items.push({ icon: '🖨', label: 'Print / save as PDF', fn: () => IO.print(...tree()) });
      items.push('-', { head: 'Other programs' });
      items.push({ icon: '⇄', label: 'Export GEDCOM (.ged) for Ancestry, MyHeritage, Gramps…', fn: () => IO.exportGedcom() });
      items.push({ icon: '{ }', label: 'Export raw data (.json)', fn: () => IO.exportJSON() });
      if (!ro) items.push({ icon: '⇄', label: 'Import GEDCOM…', fn: () => this.openFile() });
      this.menu(items, x, y, 'file-menu');
    },
    async openFile() {
      try {
        const r = await FT.IO.openWithPicker();
        if (r === 'fallback') { const inp = $('fileInput'); inp.onchange = () => { const f = inp.files[0]; inp.value = ''; if (f) this.openFileObj(f); }; inp.click(); return; }
        if (r) this.confirmReplace(r.data, 'Opened ' + r.name);
      } catch (e) { this.toast('Could not open: ' + e.message); }
    },
    async openFileObj(file) {
      try { const data = FT.IO.parseText(await file.text(), file.name); FT.IO.fileHandle = null; this.confirmReplace(data, 'Opened ' + file.name); }
      catch (e) { this.toast('Could not open: ' + e.message); }
    },
    confirmReplace(data, msg) {
      if (!this.M.count() || this.readOnly) return this.loadData(data, msg);
      const box = this.modal(`<h2>Open this tree?</h2><p>The tree on screen (${this.M.count()} people) is kept in your backups, and you can also save it to a file first.</p>
        <div class="acts"><button id="cCancel">Cancel</button><button id="cSave">Save current first</button><button id="cGo" class="primary">Open (${Object.keys(data.people || {}).length} people)</button></div>`);
      box.querySelector('#cCancel').onclick = () => this.closeModal();
      box.querySelector('#cSave').onclick = async () => { await FT.IO.saveFile(true); FT.IO.fileHandle = null; this.closeModal(); this.loadData(data, msg); };
      box.querySelector('#cGo').onclick = () => { this.closeModal(); this.loadData(data, msg); };
    },
    loadData(data, msg) {
      if (this.M.count()) FT.IO.backup(this.M.data);
      const copy = JSON.parse(JSON.stringify(data));
      if (data === FT.SAMPLE) { copy.meta.id = FT.uid('t'); copy.meta.example = true; }
      this.M.load(copy);
      this.sel = null; this.relId = null; this.firstFit = true;
      if (!this.readOnly) FT.IO.saveNow();
      this.render();
      if (msg) this.toast(msg, true);
    },
    /** While the example family is open, a strip at the top says so and offers to start a real tree. */
    exampleBanner() {
      if (this.readOnly) return;
      const b = $('banner'), on = !!(this.M.data.meta && this.M.data.meta.example);
      if (on === !b.hidden && (!on || b.dataset.ex)) return;
      b.hidden = !on; document.body.classList.toggle('has-banner', on);
      if (!on) { delete b.dataset.ex; return; }
      b.dataset.ex = '1';
      b.innerHTML = '👋 <b>This is an example family</b> (the portraits are drawings) so you can see how a finished tree looks. Click anyone, open 📊 Analytics, explore freely. ' +
        '<button id="exStart" class="primary">Start my own family tree</button>';
      $('exStart').onclick = () => { FT.IO.fileHandle = null; this.loadData(FT.emptyData(), 'Your new tree is ready – add the first person'); };
    },
    newTree() {
      const box = this.modal(`<h2>Start a new tree?</h2><p>The current tree stays in File → Restore a backup. Save it to a file first if you want to keep a copy outside the browser.</p>
        <div class="acts"><button id="nCancel">Cancel</button><button id="nGo" class="primary">New empty tree</button></div>`);
      box.querySelector('#nCancel').onclick = () => this.closeModal();
      box.querySelector('#nGo').onclick = () => { this.closeModal(); FT.IO.fileHandle = null; this.loadData(FT.emptyData(), 'New tree started'); };
    },
    backupDialog() {
      const list = FT.IO.backups();
      const box = this.modal(`<h2>⏲ Backups</h2><p>A copy is kept automatically each time you open the tree or load another one (last 8).</p>
        <table>${list.map((b, i) => `<tr><td>${new Date(b.t).toLocaleString()}</td><td>${esc(b.title || '')}</td><td>${b.n} people</td><td><button data-i="${i}">Restore</button></td></tr>`).join('') || '<tr><td>No backups yet.</td></tr>'}</table>
        <div class="acts"><button id="bClose">Close</button></div>`);
      box.querySelector('#bClose').onclick = () => this.closeModal();
      box.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { this.closeModal(); this.loadData(JSON.parse(list[+b.dataset.i].json), 'Backup restored'); }; });
    },
    shareDialog() {
      let mode = 'viewer', privacy = 'dates', photos = true;
      const box = this.modal(`<h2>🔗 Share with family</h2>
        <p>Creates <b>one HTML file</b> containing the whole program and your tree. Send it by WhatsApp, e-mail or USB; it opens in any browser, works offline, and needs no account.</p>
        <div class="opt" id="sMode"><span>Type:</span><button data-v="viewer" class="on">View only (recommended)</button><button data-v="editor">Editable copy</button></div>
        <div class="opt" id="sPriv"><span>Living people:</span><button data-v="none">Show everything</button><button data-v="dates" class="on">Hide their dates, places &amp; notes</button><button data-v="names">Hide names too</button></div>
        <label class="ck"><input type="checkbox" id="sPh" checked> Include photos</label>
        <div class="acts"><button id="sCancel">Cancel</button><button id="sGo" class="primary">Create share file</button></div>`);
      const seg = (id, set) => box.querySelectorAll('#' + id + ' button').forEach((b) => { b.onclick = () => { box.querySelectorAll('#' + id + ' button').forEach((x) => x.classList.toggle('on', x === b)); set(b.dataset.v); }; });
      seg('sMode', (v) => { mode = v; }); seg('sPriv', (v) => { privacy = v; });
      box.querySelector('#sPh').onchange = (e) => { photos = e.target.checked; };
      box.querySelector('#sCancel').onclick = () => this.closeModal();
      box.querySelector('#sGo').onclick = () => {
        try { FT.IO.shareHTML({ mode, privacy, photos }); this.closeModal(); this.toast('Share file downloaded', true); }
        catch (e) { this.toast(e.message); }
      };
    },
    /** Dropdown that explains every colour, line and badge, drawn with the real tree styles. */
    legend() {
      const box = $('legend');
      if (!box.hidden) { box.hidden = true; return; }
      const card = (cls, stripe, label, sub, extra) =>
        `<svg viewBox="0 0 96 40"><g class="card ${cls}" style="pointer-events:none"><rect class="bg" width="96" height="40" rx="9"/><rect width="5" height="26" x="0" y="7" rx="2.5" fill="${stripe}"/><text x="12" y="17" class="nm" style="font-size:11px">${label}</text><text x="12" y="31" class="sub" style="font-size:10px">${sub}</text>${extra || ''}</g></svg>`;
      const line = (cls, d, extra) => `<svg viewBox="0 0 96 40"><path class="ln ${cls}" d="${d}"/>${extra || ''}</svg>`;
      const chip = (inner) => `<svg viewBox="0 0 96 40">${inner}</svg>`;
      const row = (pic, text) => pic + `<div>${text}</div>`;
      box.innerHTML = `<h3>ⓘ Legend<button class="x" title="Close">✕</button></h3>
      <h4>People</h4><div class="lg">
        ${row(card('', '#3f7fd8', 'Male', 'b. 1962'), 'Blue stripe = male')}
        ${row(card('', '#d9578b', 'Female', 'b. 1957'), 'Pink stripe = female')}
        ${row(card('', '#9aa0a6', 'Unknown', ''), 'Grey stripe = gender not set')}
        ${row(card('dead', '#9aa0a6', 'Late', '1925 – 2020'), 'Faded, beige card = <b>passed away</b> († or “Late”)')}
        ${row(card('root', '#d9578b', 'Main', 'person'), 'Orange outline = the person this view is built around')}
        ${row(card('sel', '#3f7fd8', 'Selected', ''), 'Blue outline = selected person')}
        ${row(card('dup', '#3f7fd8', '↪ Repeat', ''), 'Dashed card = same person shown a second time (e.g. married into another branch). Click it to jump to the main card')}
        ${row(card('dim', '#3f7fd8', 'Faded', ''), 'Very faded = outside the branch you are focusing on')}
      </div>
      <h4>Lines</h4><div class="lg">
        ${row(line('', 'M48,2V20H10V38M48,20H86V38'), 'Parents → children (by birth)')}
        ${row(line('adopted', 'M48,2V20H86V38'), '<b>Dashed line</b> = adopted, step or foster child (right-click the child → birth / adopted / step / foster)')}
        ${row(line('couple', 'M4,20H92'), 'Pink line = married / partners')}
        ${row(line('couple divorced', 'M4,20H92', '<path class="ln couple" d="M43,27L47,13M49,27L53,13"/>'), 'Pink dashed with // = divorced or separated')}
        ${row(line('sib', 'M10,10H86M10,10V38M86,10V38'), 'Teal dotted bracket = brothers/sisters whose parents are not added yet')}
        ${row(line('', 'M10,2C10,30 86,10 86,38'), 'Curved line = a family you placed freely by dragging')}
      </div>
      <h4>Badges &amp; buttons</h4><div class="lg">
        ${row(chip('<g class="badge"><rect x="26" y="11" width="44" height="18" rx="9"/><text x="48" y="24" text-anchor="middle">+12</text></g>'), 'Hidden descendants – click to show them')}
        ${row(chip('<g class="badge" opacity=".6"><rect x="37" y="12" width="22" height="16" rx="8"/><text x="48" y="24" text-anchor="middle">−</text></g>'), 'Collapse this branch')}
        ${row(chip('<g class="up"><rect x="21" y="11" width="54" height="18" rx="9"/><text x="48" y="24" text-anchor="middle">▲ parents</text></g>'), 'This person’s parents exist but are not shown in this view – click to see them')}
        ${row(chip('<g class="h" style="opacity:1"><circle cx="48" cy="20" r="11"/><text x="48" y="25" text-anchor="middle">+</text></g>'), 'Hover a card: <b>click</b> + to add a parent (top), child (bottom), spouse (right) or sibling (left); <b>drag</b> + onto someone to link them')}
        ${row(chip('<g class="ch" style="opacity:1"><circle cx="48" cy="20" r="7"/></g>'), 'Orange dot on top: drag it onto another person to make <i>them</i> the child (e.g. daughter instead of son-in-law)')}
        ${row(chip('<g class="edit-ic" style="opacity:1"><circle cx="48" cy="20" r="10"/><text x="48" y="24" text-anchor="middle">✎</text></g>'), 'Open details: dates, places, photo, notes')}
      </div>
      <h4>Colour modes (toolbar)</h4>
      <div style="font-size:12.8px">“Colour: branch” gives each child of the main person a colour: ${FT.BRANCH_COLORS.slice(0, 6).map((c) => `<span class="sw" style="background:${c}"></span>`).join('')} … “Colour: generation” colours each generation.</div>
      <h4>Moving things</h4>
      <div style="font-size:12.8px">Drag a person sideways = more/less space · drag past a brother/sister = change birth order · drag up/down = place the family freely · drag empty space = move the view.</div>`;
      box.hidden = false;
      box.querySelector('.x').onclick = () => { box.hidden = true; };
      const r = $('btnLegend').getBoundingClientRect();
      box.style.left = Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.right - box.offsetWidth)) + 'px';
      box.style.top = (r.bottom + 6) + 'px';
      this.makeMovable(box, box.querySelector('h3'));
      setTimeout(() => document.addEventListener('pointerdown', this._lclose = (e) => {
        if (!box.contains(e.target) && !e.target.closest('#btnLegend')) { box.hidden = true; document.removeEventListener('pointerdown', this._lclose); }
      }), 0);
    },
    help() {
      const k = (s) => s.split(' ').map((x) => `<kbd>${x}</kbd>`).join(' ');
      this.modal(`<h2>🌳 How to use Family Tree Studio</h2>
      <table>
      <tr><td><b>Add a relative</b></td><td>Hover a person: click <b>+</b> above (parent), below (child), right (spouse) or left (brother/sister). Type the name straight away.</td></tr>
      <tr><td><b>Connect existing people</b></td><td><b>Drag</b> a + button onto another person.</td></tr>
      <tr><td><b>Analytics</b> (F9)</td><td>Toolbar <b>📊 Analytics</b>: Data quality, Family statistics, any Person’s numbers, Birthday calendar, Photo gallery and Duplicate finder. Click any number to see the people behind it. Use <b>▦ Layout</b> (or ¼ ⅓ ½ ⅔ ¾) to share the screen with the tree, drag the edge to any size, dock left/right/bottom, float, maximise (analytics only) or minimise.</td></tr>
      <tr><td><b>Family Book, sharing a branch</b></td><td>File → <b>Family Book</b> prints a book with photos (Save as PDF). File → <b>Send a branch to a relative</b> and <b>Merge changes from a relative’s copy</b> let cousins fill in their part and you accept each change.</td></tr>
      <tr><td><b>Collapse / expand all</b></td><td>Toolbar button <b>⊟ Collapse all</b> (Shift+E) folds every family down to the top couple and their children. When anything is collapsed the button turns orange and shows how many – <b>⊞ Expand all</b> opens everything again.</td></tr>
      <tr><td><b>Tidy the layout</b></td><td><b>Drag a person left or right</b> to move their whole branch (spouse and children come along; branches to the right make room; cards never overlap). Drag empty space to pan. Right-click → <i>Reset this branch’s position</i>.</td></tr>
      <tr><td><b>Wrong person linked as the child?</b></td><td>Hover the card: drag the small <b style="color:#f59e0b">orange dot</b> on top (where the parents’ line arrives) onto the right person, e.g. the daughter instead of the son-in-law. Or right-click → <i>Make … the child … instead</i>.</td></tr>
      <tr><td><b>Rename</b></td><td>Double-click the card, or select it and just start typing.</td></tr>
      <tr><td><b>Dates &amp; gender while typing</b></td><td><code>Meena Sharma (1955-2010) (F)</code>, <code>Late Ramesh</code>, <code>Raju "Bunty" Verma b.1980</code></td></tr>
      <tr><td><b>Many children quickly</b></td><td>After typing a child, press ${k('Shift+Enter')} to add the next one.</td></tr>
      <tr><td><b>Paste a list</b></td><td>Copy names from WhatsApp/Excel/Notes and press ${k('Ctrl+V')} anywhere. Indent lines for children, use + for spouses.</td></tr>
      ${FT.Voice ? `<tr><td><b>🎙 Tell the Tree (voice)</b></td><td>Click <b>Tell the Tree</b> (or ${k('F8')}) and say e.g. <i>“Ramlal Sharma’s father is Bhimrao and mother is Sita Rao”</i>, <i>“Mahesh and Lata have two daughters Aditi and Yukti”</i>. Made a mistake? Say <i>“it is not Sita Rao, it is Sita Sharma”</i> or <i>“undo”</i>. Click a card first to say just <i>“father is …”</i>. You can also type the sentences.</td></tr>` : ''}
      <tr><td><b>Details &amp; photo</b></td><td>Click ✎ on the card, or right-click → Edit details. Drop a photo on a card – a window opens where you drag the photo and zoom (mouse wheel, slider, +/−, two-finger pinch) to put the face in the circle. Right-click → <i>Adjust photo</i> to re-frame it later. From Google Photos, WhatsApp or any web page: right-click the picture → <i>Copy image</i>, click the person’s card, press <b>Ctrl+V</b>.</td></tr>
      <tr><td><b>See one branch</b></td><td>Right-click → <i>Focus on this branch</i> / <i>Show only this branch</i>. Toolbar: All · Dim others · Only branch.</td></tr>
      <tr><td><b>Views</b></td><td>Everyone, Descendants (clan), Ancestors, Hourglass. Collapse branches with − under a card.</td></tr>
      <tr><td><b>How are we related?</b></td><td>Select one person, then ${k('Shift')}+click another.</td></tr>
      <tr><td><b>Keyboard</b></td><td>${k('← ↑ → ↓')} move · ${k('Ctrl+↑/↓/←/→')} add parent/child/sibling/spouse · ${k('F2')} rename · ${k('Ctrl+E')} details · ${k('Del')} delete · ${k('Ctrl+Z')} undo · ${k('Ctrl+F')} search · ${k('0')} fit</td></tr>
      <tr><td><b>Saving</b></td><td>Auto-saves in this browser. Use File → Save to file for a safe copy (Chrome/Edge then keep saving to that file automatically).</td></tr>
      <tr><td><b>Sharing</b></td><td>File → Share copy creates one HTML file for family (view-only or editable, with privacy for living people).</td></tr>
      </table><div class="acts"><button onclick="document.getElementById('modal').hidden=true" class="primary">Got it</button></div>`);
    }
  };
  FT.UI = UI;
})();
