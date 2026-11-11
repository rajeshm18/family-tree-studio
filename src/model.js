/* FT.Model — data store, relationship queries, mutations, undo/redo. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const uid = (p) => p + Math.random().toString(36).slice(2, 10);
  FT.uid = uid;

  function blankPerson(o) {
    o = o || {};
    return {
      id: o.id || uid('p'), given: o.given || '', surname: o.surname || '', nick: o.nick || '',
      gender: o.gender || 'U',
      birth: { date: (o.birth && o.birth.date) || '', place: (o.birth && o.birth.place) || '' },
      death: { date: (o.death && o.death.date) || '', place: (o.death && o.death.place) || '' },
      living: o.living === undefined ? null : o.living,
      photo: o.photo || '', notes: o.notes || '', tags: o.tags || [], color: o.color || '',
      gotra: o.gotra || '', native: o.native || '', altName: o.altName || '',
      photoSrc: o.photoSrc || '', photoCrop: o.photoCrop || null
    };
  }
  function blankFamily(o) {
    o = o || {};
    return {
      id: o.id || uid('f'), partners: o.partners || [], children: o.children || [],
      childRel: o.childRel || {}, status: o.status || '',
      marriage: { date: (o.marriage && o.marriage.date) || '', place: (o.marriage && o.marriage.place) || '' }
    };
  }
  function emptyData() {
    const now = new Date().toISOString();
    return { version: 1, meta: { id: uid('t'), title: 'Our Family', created: now, modified: now }, people: {}, families: {}, settings: {} };
  }
  FT.blankPerson = blankPerson;
  FT.emptyData = emptyData;

  /** Extract a 3-4 digit year from free-text date. */
  FT.year = function (s) {
    if (!s) return null;
    const m = String(s).match(/(\d{4})(?!.*\d{4})/) || String(s).match(/\b(\d{3})\b/);
    return m ? parseInt(m[1], 10) : null;
  };

  class Model {
    constructor() {
      this.data = emptyData();
      this.undoStack = []; this.redoStack = [];
      this.listeners = [];
      this._batch = null;
      this.readOnly = false;
    }
    on(fn) { this.listeners.push(fn); }
    emit(kind) { this.listeners.forEach((fn) => fn(kind || 'change')); }

    /** Replace all data (normalises every record). */
    load(data, keepHistory) {
      const d = emptyData();
      if (data) {
        d.version = 1;
        d.meta = Object.assign(d.meta, data.meta || {});
        d.settings = Object.assign({}, data.settings || {});
        Object.values(data.people || {}).forEach((p) => { d.people[p.id] = blankPerson(p); });
        Object.values(data.families || {}).forEach((f) => {
          const nf = blankFamily(f);
          nf.partners = nf.partners.filter((x) => d.people[x]);
          nf.children = nf.children.filter((x) => d.people[x]);
          d.families[nf.id] = nf;
        });
      }
      this.data = d;
      if (!keepHistory) { this.undoStack = []; this.redoStack = []; }
      this.emit('load');
    }

    /** Run a mutation as one undoable step. */
    change(fn, label) {
      if (this.readOnly) return;
      if (this._batch) { const r = fn(); this._batch.dirty = true; return r; }
      const before = JSON.stringify(this.data);
      const r = fn();
      const after = JSON.stringify(this.data);
      if (before !== after) {
        this.undoStack.push(before);
        if (this.undoStack.length > 300) this.undoStack.shift();
        this.redoStack = [];
        this.data.meta.modified = new Date().toISOString();
        this.emit(label || 'change');
      }
      return r;
    }
    /** Group many edits (e.g., a details popover session) into one undo step. */
    beginBatch() { if (!this._batch) this._batch = { before: JSON.stringify(this.data), dirty: false }; }
    batchChanged() { this.data.meta.modified = new Date().toISOString(); this.emit('change'); }
    endBatch() {
      const b = this._batch; this._batch = null;
      if (b && JSON.stringify(this.data) !== b.before) { this.undoStack.push(b.before); this.redoStack = []; }
    }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    undo() {
      if (!this.undoStack.length) return;
      this.redoStack.push(JSON.stringify(this.data));
      this.data = JSON.parse(this.undoStack.pop()); this.emit('undo');
    }
    redo() {
      if (!this.redoStack.length) return;
      this.undoStack.push(JSON.stringify(this.data));
      this.data = JSON.parse(this.redoStack.pop()); this.emit('redo');
    }

    // ---------- queries ----------
    get people() { return this.data.people; }
    get families() { return this.data.families; }
    person(id) { return this.data.people[id]; }
    count() { return Object.keys(this.data.people).length; }
    famsAsPartner(pid) { return Object.values(this.data.families).filter((f) => f.partners.includes(pid)); }
    famsAsChild(pid) { return Object.values(this.data.families).filter((f) => f.children.includes(pid)); }
    parentFamily(pid) {
      const fs = this.famsAsChild(pid);
      return fs.find((f) => (f.childRel[pid] || 'birth') === 'birth') || fs[0] || null;
    }
    parents(pid) { const f = this.parentFamily(pid); return f ? f.partners.slice() : []; }
    partners(pid) {
      const out = [];
      this.famsAsPartner(pid).forEach((f) => f.partners.forEach((x) => { if (x !== pid && !out.includes(x)) out.push(x); }));
      return out;
    }
    children(pid) {
      const out = [];
      this.famsAsPartner(pid).forEach((f) => f.children.forEach((c) => { if (!out.includes(c)) out.push(c); }));
      return out;
    }
    siblings(pid) {
      const out = [];
      this.famsAsChild(pid).forEach((f) => {
        f.children.forEach((c) => { if (c !== pid && !out.includes(c)) out.push(c); });
        f.partners.forEach((par) => this.children(par).forEach((c) => { if (c !== pid && !out.includes(c)) out.push(c); }));
      });
      return out;
    }
    ancestors(pid) {
      const seen = new Set(); const st = [pid];
      while (st.length) { const x = st.pop(); this.parents(x).forEach((p) => { if (!seen.has(p)) { seen.add(p); st.push(p); } }); }
      return seen;
    }
    descendants(pid) {
      const seen = new Set(); const st = [pid];
      while (st.length) { const x = st.pop(); this.children(x).forEach((c) => { if (!seen.has(c)) { seen.add(c); st.push(c); } }); }
      return seen;
    }
    /** Farthest ancestor following first parents (used as default clan root). */
    topAncestor(pid) {
      let best = pid, bestD = 0; const seen = new Set();
      const walk = (x, d) => {
        if (seen.has(x)) return; seen.add(x);
        if (d > bestD) { bestD = d; best = x; }
        this.parents(x).forEach((p) => walk(p, d + 1));
      };
      walk(pid, 0);
      // prefer the partner listed first in that couple
      const f = this.famsAsPartner(best).find((fm) => fm.partners.length === 2);
      if (f && !this.parents(f.partners[0]).length) return f.partners[0];
      return best;
    }
    /** Clan roots: people without parents who are not merely married into a family with parents. */
    roots() {
      const ids = Object.keys(this.data.people);
      const out = []; const covered = new Set();
      const sorted = ids.slice().sort((a, b) => this.descendants(b).size - this.descendants(a).size);
      sorted.forEach((id) => {
        if (covered.has(id) || this.parents(id).length) return;
        const ps = this.partners(id);
        if (ps.length && ps.every((p) => this.parents(p).length)) return; // married-in spouse
        out.push(id);
        covered.add(id); ps.forEach((p) => { if (!this.parents(p).length) covered.add(p); });
      });
      return out;
    }
    isLiving(p) {
      if (!p) return false;
      if (p.living === true || p.living === false) return p.living;
      if (p.death && (p.death.date || p.death.place)) return false;
      const y = FT.year(p.birth && p.birth.date);
      if (y && new Date().getFullYear() - y > 105) return false;
      return true;
    }
    displayName(p) {
      if (typeof p === 'string') p = this.person(p);
      if (!p) return '';
      const n = [p.given, p.surname].filter(Boolean).join(' ').trim();
      return n || 'Unnamed';
    }

    // ---------- mutations (call inside change()) ----------
    addPerson(fields) { const p = blankPerson(fields); this.data.people[p.id] = p; return p.id; }
    addFamily(fields) { const f = blankFamily(fields); this.data.families[f.id] = f; return f; }

    /** Family into which a new child of pid goes (latest family with a partner, else single-parent family). */
    defaultFamilyFor(pid) {
      const fs = this.famsAsPartner(pid);
      if (!fs.length) return this.addFamily({ partners: [pid] });
      return fs.slice().reverse().find((f) => f.partners.length === 2) || fs[0];
    }
    addChild(pid, fields, famId) {
      const f = (famId && this.data.families[famId]) || this.defaultFamilyFor(pid);
      const id = this.addPerson(fields); f.children.push(id); return id;
    }
    addParent(pid, fields) {
      let f = this.parentFamily(pid);
      if (!f) f = this.addFamily({ children: [pid] });
      if (f.partners.length >= 2) return null;
      const other = f.partners[0] && this.person(f.partners[0]);
      fields = Object.assign({}, fields);
      if ((!fields.gender || fields.gender === 'U') && other) fields.gender = other.gender === 'M' ? 'F' : other.gender === 'F' ? 'M' : 'U';
      const id = this.addPerson(fields);
      // conventional order: father first
      if (fields.gender === 'M') f.partners.unshift(id); else f.partners.push(id);
      if (f.partners.length === 2 && !f.status) f.status = 'married';
      return id;
    }
    addPartner(pid, fields) {
      const me = this.person(pid);
      fields = Object.assign({}, fields);
      if ((!fields.gender || fields.gender === 'U') && me) fields.gender = me.gender === 'M' ? 'F' : me.gender === 'F' ? 'M' : 'U';
      const id = this.addPerson(fields);
      const single = this.famsAsPartner(pid).find((f) => f.partners.length === 1);
      if (single) { single.partners.push(id); single.status = single.status || 'married'; }
      else this.addFamily({ partners: [pid, id], status: 'married' });
      return id;
    }
    addSibling(pid, fields) {
      let f = this.parentFamily(pid);
      if (!f) f = this.addFamily({ children: [pid] });
      const id = this.addPerson(fields);
      const i = f.children.indexOf(pid);
      f.children.splice(i + 1, 0, id);
      return id;
    }

    /** Connect two existing people. rel describes what B becomes to A. Returns error string or ''. */
    link(rel, a, b) {
      if (a === b) return 'Cannot link a person to themselves.';
      if (rel === 'child') {
        if (this.ancestors(a).has(b)) return 'That would create a loop (they are already an ancestor).';
        const existing = this.parentFamily(b);
        if (existing && existing.partners.includes(a)) return 'Already linked.';
        if (existing && existing.partners.length === 1 && existing.partners[0] !== a) {
          // b already has one parent: if that parent is a's partner family, move there; else make a the 2nd parent
          const pa = existing.partners[0];
          const shared = this.famsAsPartner(a).find((f) => f.partners.includes(pa));
          if (shared) { existing.children.splice(existing.children.indexOf(b), 1); shared.children.push(b); }
          else existing.partners.push(a);
          this.cleanup(); return '';
        }
        if (existing && existing.partners.length === 0) { existing.partners.push(a); return ''; }
        if (existing) { existing.children.splice(existing.children.indexOf(b), 1); }
        this.defaultFamilyFor(a).children.push(b); this.cleanup(); return '';
      }
      if (rel === 'parent') return this.link('child', b, a);
      if (rel === 'partner') {
        if (this.partners(a).includes(b)) return 'Already partners.';
        const fa = this.famsAsPartner(a).find((f) => f.partners.length === 1);
        if (fa) { fa.partners.push(b); fa.status = fa.status || 'married'; return ''; }
        const fb = this.famsAsPartner(b).find((f) => f.partners.length === 1);
        if (fb) { fb.partners.push(a); fb.status = fb.status || 'married'; return ''; }
        this.addFamily({ partners: [a, b], status: 'married' }); return '';
      }
      if (rel === 'sibling') {
        let fa = this.parentFamily(a), fb = this.parentFamily(b);
        if (fa && fb && fa === fb) return 'Already siblings.';
        if (!fa && !fb) { this.addFamily({ children: [a, b] }); return ''; }
        if (fa && !fb) { fa.children.push(b); return ''; }
        if (fb && !fa) { fb.children.push(a); return ''; }
        return 'Both already have parents – link them to the same parents instead.';
      }
      return 'Unknown relationship';
    }
    unlinkFromParents(pid) {
      this.famsAsChild(pid).forEach((f) => { f.children = f.children.filter((c) => c !== pid); delete f.childRel[pid]; });
      this.cleanup();
    }
    unlinkPartner(a, b) {
      this.famsAsPartner(a).filter((f) => f.partners.includes(b)).forEach((f) => {
        if (f.children.length) f.partners = f.partners.filter((x) => x !== b); else delete this.data.families[f.id];
      });
      this.cleanup();
    }
    deletePerson(pid) {
      Object.values(this.data.families).forEach((f) => {
        f.partners = f.partners.filter((x) => x !== pid);
        f.children = f.children.filter((x) => x !== pid);
        delete f.childRel[pid];
      });
      delete this.data.people[pid];
      if (this.data.settings.rootId === pid) delete this.data.settings.rootId;
      if (this.data.settings.focusId === pid) delete this.data.settings.focusId;
      this.cleanup();
    }
    /** Remove families that no longer connect anyone. */
    cleanup() {
      Object.values(this.data.families).forEach((f) => {
        const n = f.partners.length + f.children.length;
        if (n < 2 || (f.partners.length === 1 && !f.children.length)) delete this.data.families[f.id];
      });
    }
    /** Move the "child of" link from oldId to newId (e.g., from the son-in-law to the real daughter). */
    reassignChild(oldId, newId) {
      if (oldId === newId) return '';
      const f = this.parentFamily(oldId);
      if (!f) return 'There is no parent link to move.';
      if (f.partners.includes(newId)) return 'That person is one of the parents.';
      for (const p of f.partners) {
        if (this.descendants(newId).has(p)) return 'That would create a loop in the family.';
      }
      if (f.children.includes(newId)) return 'They are already a child of these parents.';
      this.famsAsChild(newId).forEach((g) => { g.children = g.children.filter((c) => c !== newId); delete g.childRel[newId]; });
      const i = f.children.indexOf(oldId);
      f.children[i] = newId;
      f.childRel[newId] = f.childRel[oldId] || 'birth'; delete f.childRel[oldId];
      const gaps = this.data.settings.gaps;
      if (gaps && gaps[oldId] !== undefined) { gaps[newId] = gaps[oldId]; delete gaps[oldId]; }
      this.cleanup();
      return '';
    }
    setChildRel(childId, rel) {
      const f = this.parentFamily(childId); if (f) f.childRel[childId] = rel;
    }
    /** Put childId directly before/after another child of the same parents (birth order). */
    placeChild(childId, otherId, after) {
      const f = this.parentFamily(childId);
      if (!f || !f.children.includes(otherId) || childId === otherId) return false;
      f.children.splice(f.children.indexOf(childId), 1);
      f.children.splice(f.children.indexOf(otherId) + (after ? 1 : 0), 0, childId);
      return true;
    }
    moveChild(childId, dir) {
      const f = this.parentFamily(childId); if (!f) return;
      const i = f.children.indexOf(childId), j = i + dir;
      if (j < 0 || j >= f.children.length) return;
      f.children.splice(i, 1); f.children.splice(j, 0, childId);
    }

    // ---------- relationship calculator ----------
    relationship(a, b) {
      if (a === b) return 'same person';
      const A = this.person(a), B = this.person(b);
      const g = (p, m, f, n) => (p && p.gender === 'M' ? m : p && p.gender === 'F' ? f : n);
      if (this.partners(a).includes(b)) return g(B, 'husband', 'wife', 'partner');
      const upA = this._upDist(a), upB = this._upDist(b);
      let best = null;
      upA.forEach((da, anc) => { if (upB.has(anc)) { const db = upB.get(anc); if (!best || da + db < best.da + best.db) best = { anc, da, db }; } });
      if (best) return this._blood(best.da, best.db, B, g);
      // in-law via partner of a
      for (const p of this.partners(a)) {
        const r = this._bloodBetween(p, b, g, B);
        if (r) return r + ' (by marriage)';
      }
      for (const p of this.partners(b)) {
        const r = this._bloodBetween(a, p, g, B);
        if (r) {
          if (r === 'son' || r === 'daughter' || r === 'child') return g(B, 'son-in-law', 'daughter-in-law', 'child-in-law');
          if (r === 'brother' || r === 'sister' || r === 'sibling') return g(B, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
          return 'partner of ' + r;
        }
      }
      return '';
    }
    _bloodBetween(a, b, g, B) {
      const upA = this._upDist(a), upB = this._upDist(b); let best = null;
      upA.forEach((da, anc) => { if (upB.has(anc)) { const db = upB.get(anc); if (!best || da + db < best.da + best.db) best = { da, db }; } });
      if (!best) return '';
      if (best.da === 1 && best.db === 0) return g(B, 'father-in-law', 'mother-in-law', 'parent-in-law');
      if (best.da === 0 && best.db === 1) return g(B, 'son', 'daughter', 'child');
      if (best.da === 1 && best.db === 1) return g(B, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
      return this._blood(best.da, best.db, B, g);
    }
    _upDist(x) {
      const m = new Map([[x, 0]]); const q = [x];
      while (q.length) { const c = q.shift(); this.parents(c).forEach((p) => { if (!m.has(p)) { m.set(p, m.get(c) + 1); q.push(p); } }); }
      return m;
    }
    _blood(da, db, B, g) {
      const greats = (n) => (n <= 0 ? '' : n === 1 ? 'great-' : n + '× great-');
      if (da === 0) { // B is descendant of A
        if (db === 1) return g(B, 'son', 'daughter', 'child');
        return greats(db - 2) + g(B, 'grandson', 'granddaughter', 'grandchild');
      }
      if (db === 0) {
        if (da === 1) return g(B, 'father', 'mother', 'parent');
        return greats(da - 2) + g(B, 'grandfather', 'grandmother', 'grandparent');
      }
      if (da === 1 && db === 1) return g(B, 'brother', 'sister', 'sibling');
      if (db === 1) return greats(da - 2) + g(B, 'uncle', 'aunt', 'parent’s sibling');
      if (da === 1) return greats(db - 2) + g(B, 'nephew', 'niece', 'sibling’s child');
      const deg = Math.min(da, db) - 1, rem = Math.abs(da - db);
      const ord = ['', 'first', 'second', 'third', 'fourth', 'fifth'][deg] || deg + 'th';
      return ord + ' cousin' + (rem ? (rem === 1 ? ' once removed' : ' ' + rem + '× removed') : '');
    }
  }
  FT.Model = Model;
})();
