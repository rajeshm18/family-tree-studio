/* FT.Dupes (duplicate finder / person merge) and FT.Merge (merge a relative's copy). */
window.FT = window.FT || {};
(function () {
  'use strict';

  // ------------------------------------------------------------------ names
  function normToken(w) {
    w = w.toLowerCase();
    try { w = w.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* ignore */ }
    w = w.replace(/[^a-z]/g, '');
    if (!w) return '';
    w = w.replace(/x/g, 'ks').replace(/ksh/g, 'ks').replace(/sch/g, 's').replace(/sh/g, 's')
      .replace(/th/g, 't').replace(/dh/g, 'd').replace(/bh/g, 'b').replace(/kh/g, 'k').replace(/gh/g, 'g')
      .replace(/ph/g, 'f').replace(/w/g, 'v').replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u')
      .replace(/aa/g, 'a').replace(/z/g, 'j').replace(/(.)\1+/g, '$1');
    while (w.length > 2 && /[ah]$/.test(w)) w = w.slice(0, -1);
    return w;
  }
  function normalize(name) {
    if (!name) return '';
    return String(name).split(/[^A-Za-zÀ-ɏ]+/).map(normToken).filter(Boolean).join('');
  }
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
      }
      const t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }
  function simKeys(ka, kb) {
    if (!ka || !kb) return 0;
    if (ka === kb) return 1;
    return Math.max(0, 1 - lev(ka, kb) / Math.max(ka.length, kb.length));
  }
  function similarity(a, b) { return simKeys(normalize(a), normalize(b)); }

  const GROUP = { c: 'k', q: 'k', b: 'v', w: 'v', z: 'j', y: 'j' };
  const grp = (k) => GROUP[k[0]] || k[0];

  // --------------------------------------------------------------- indexes
  function buildAdj(families) {
    const parents = {}, partners = {}, children = {};
    const add = (o, k, v) => { (o[k] = o[k] || new Set()).add(v); };
    Object.values(families).forEach((f) => {
      f.partners.forEach((p) => {
        f.partners.forEach((q) => { if (q !== p) add(partners, p, q); });
        f.children.forEach((c) => { add(children, p, c); add(parents, c, p); });
      });
    });
    return { parents, partners, children };
  }
  const has = (o, k) => o[k] || new Set();
  function intersects(a, b) { for (const x of a) if (b.has(x)) return true; return false; }

  // -------------------------------------------------------------- FT.Dupes
  function find(M, opts) {
    opts = opts || {};
    const min = opts.min === undefined ? 60 : opts.min;
    const data = M.data;
    const adj = buildAdj(data.families);
    const list = [];
    Object.values(data.people).forEach((p) => {
      const gk = normalize(p.given);
      if (!gk) return;
      list.push({ p, gk, sk: normalize(p.surname), by: window.FT.year(p.birth && p.birth.date) });
    });
    const blocks = {};
    list.forEach((e) => { (blocks[grp(e.gk)] = blocks[grp(e.gk)] || []).push(e); });
    const out = [];
    function test(A, B) {
      const a = A.p, b = B.p;
      if (a.gender !== 'U' && b.gender !== 'U' && a.gender !== b.gender) return;
      const la = A.gk.length, lb = B.gk.length;
      if (Math.abs(la - lb) > 0.3 * Math.max(la, lb)) return;
      const g = simKeys(A.gk, B.gk);
      if (g < 0.7) return;
      if (has(adj.parents, a.id).has(b.id) || has(adj.parents, b.id).has(a.id)) return;
      if (has(adj.partners, a.id).has(b.id)) return;
      const reasons = [];
      let score = g * 60;
      reasons.push(g === 1 ? 'Same first name' : 'Similar first name (' + a.given + ' / ' + b.given + ')');
      if (A.sk && B.sk) {
        const s = simKeys(A.sk, B.sk);
        if (s >= 0.7) { score += 25 * s; reasons.push(s === 1 ? 'Same surname' : 'Similar surname'); } else score -= 10;
      } else score += 8;
      if (a.gender !== 'U' && a.gender === b.gender) score += 5;
      if (A.by && B.by) {
        const d = Math.abs(A.by - B.by);
        if (d === 0) { score += 15; reasons.push('Same birth year'); }
        else if (d <= 1) { score += 10; reasons.push('Birth years 1 apart'); }
        else if (d <= 3) { score += 3; reasons.push('Birth years ' + d + ' apart'); }
        else { score -= 40; reasons.push('Birth years differ by ' + d); }
      }
      if (intersects(has(adj.parents, a.id), has(adj.parents, b.id))) { score += 20; reasons.push('Same parents'); }
      if (intersects(has(adj.partners, a.id), has(adj.partners, b.id))) { score += 20; reasons.push('Same partner'); }
      if (intersects(has(adj.children, a.id), has(adj.children, b.id))) { score += 20; reasons.push('Same children'); }
      score = Math.round(Math.max(0, Math.min(100, score)));
      if (score >= min) out.push({ a: a.id, b: b.id, score, reasons });
    }
    Object.keys(blocks).forEach((k) => {
      const blk = blocks[k];
      for (let i = 0; i < blk.length; i++) for (let j = i + 1; j < blk.length; j++) test(blk[i], blk[j]);
    });
    out.sort((x, y) => y.score - x.score);
    return out;
  }

  function mergePeople(M, keepId, dropId) {
    const d = M.data;
    const K = d.people[keepId], D = d.people[dropId];
    if (!K || !D || keepId === dropId) return keepId;
    ['given', 'surname', 'nick', 'photo', 'color', 'gotra', 'native', 'altName'].forEach((k) => { if (!K[k] && D[k]) K[k] = D[k]; });
    if (K.gender === 'U' && D.gender !== 'U') K.gender = D.gender;
    ['birth', 'death'].forEach((k) => { ['date', 'place'].forEach((s) => { if (!K[k][s] && D[k][s]) K[k][s] = D[k][s]; }); });
    if (K.living === null || K.living === undefined) K.living = D.living === undefined ? null : D.living;
    if (D.notes && D.notes !== K.notes) K.notes = K.notes ? K.notes + '\n' + D.notes : D.notes;
    K.tags = (K.tags || []).concat((D.tags || []).filter((t) => !(K.tags || []).includes(t)));
    // re-point family memberships
    Object.values(d.families).forEach((f) => {
      if (f.partners.includes(dropId)) {
        f.partners = f.partners.map((x) => (x === dropId ? keepId : x)).filter((x, i, a) => a.indexOf(x) === i);
      }
      if (f.children.includes(dropId)) {
        f.children = f.children.map((x) => (x === dropId ? keepId : x)).filter((x, i, a) => a.indexOf(x) === i);
        if (f.childRel[dropId] !== undefined) {
          if (f.childRel[keepId] === undefined) f.childRel[keepId] = f.childRel[dropId];
          delete f.childRel[dropId];
        }
      }
    });
    // merge families with identical partner sets
    const seen = {};
    Object.values(d.families).forEach((f) => {
      if (!f.partners.length) return;
      const key = f.partners.slice().sort().join('|');
      const g = seen[key];
      if (!g) { seen[key] = f; return; }
      f.children.forEach((c) => { if (!g.children.includes(c)) g.children.push(c); });
      Object.keys(f.childRel).forEach((c) => { if (g.childRel[c] === undefined) g.childRel[c] = f.childRel[c]; });
      if (!g.status) g.status = f.status;
      if (!g.marriage.date) g.marriage.date = f.marriage.date;
      if (!g.marriage.place) g.marriage.place = f.marriage.place;
      delete d.families[f.id];
    });
    delete d.people[dropId];
    const s = d.settings || {};
    ['rootId', 'focusId'].forEach((k) => { if (s[k] === dropId) s[k] = keepId; });
    if (s.gaps && s.gaps[dropId] !== undefined) { if (s.gaps[keepId] === undefined) s.gaps[keepId] = s.gaps[dropId]; delete s.gaps[dropId]; }
    M.cleanup();
    return keepId;
  }

  FT.Dupes = { normalize, similarity, find, mergePeople };

  // ------------------------------------------------------------- FT.Merge
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const nameOf = (p) => ([p.given, p.surname].filter(Boolean).join(' ').trim() || 'Unnamed');
  const FIELDS = [
    ['given', 'first name'], ['surname', 'surname'], ['nick', 'nickname'], ['gender', 'gender'],
    ['birth.date', 'birth date'], ['birth.place', 'birth place'], ['death.date', 'death date'], ['death.place', 'death place'],
    ['notes', 'notes'], ['gotra', 'gotra'], ['native', 'native place'], ['altName', 'alternate name'], ['photo', 'photo']
  ];
  const getF = (o, path) => path.split('.').reduce((x, k) => (x ? x[k] : undefined), o);
  const setF = (o, path, v) => { const ks = path.split('.'); const l = ks.pop(); const t = ks.reduce((x, k) => x[k], o); t[l] = v; };
  const isEmpty = (path, v) => v === undefined || v === null || v === '' || (path === 'gender' && v === 'U');
  const KIND_ORDER = { addPerson: 0, editPerson: 1, addFamily: 2, addPartner: 3, addChild: 4, editFamily: 5, removed: 6 };

  function setKey(ids) { return ids.slice().sort().join('|'); }
  function findFam(data, ids) {
    if (!ids.length) return null;
    const key = setKey(ids);
    const fams = Object.values(data.families);
    let f = fams.find((x) => setKey(x.partners) === key);
    if (!f && ids.length === 1) f = fams.find((x) => x.partners.includes(ids[0]));
    return f || null;
  }

  function diff(base, inc) {
    const bAdj = buildAdj(base.families), iAdj = buildAdj(inc.families);
    const matched = {}; const usedBase = new Set();
    const D = FT.Dupes;
    // 1. same id
    Object.keys(inc.people).forEach((id) => {
      const b = base.people[id], i = inc.people[id];
      if (!b) return;
      const gs = b.given && i.given ? simKeys(normalize(b.given), normalize(i.given)) : 1;
      const ss = b.surname && i.surname ? simKeys(normalize(b.surname), normalize(i.surname)) : 1;
      if (gs < 0.5 && ss < 0.5) return; // same id but evidently a different person
      matched[id] = id; usedBase.add(id);
    });
    // 2. by name + context
    const bKey = {};
    Object.values(base.people).forEach((p) => {
      if (usedBase.has(p.id)) return;
      const k = normalize(p.given) + '|' + normalize(p.surname);
      (bKey[k] = bKey[k] || []).push(p);
    });
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      Object.values(inc.people).forEach((i) => {
        if (matched[i.id]) return;
        const cands = (bKey[normalize(i.given) + '|' + normalize(i.surname)] || []).filter((b) => !usedBase.has(b.id));
        if (!cands.length || !normalize(i.given)) return;
        const iy = FT.year(i.birth && i.birth.date);
        const near = new Set();
        [iAdj.parents, iAdj.partners, iAdj.children].forEach((m, idx) => {
          has(m, i.id).forEach((x) => { if (matched[x]) near.add(idx + ':' + matched[x]); });
        });
        const pick = cands.find((b) => {
          const by = FT.year(b.birth && b.birth.date);
          if (iy && by && Math.abs(iy - by) > 1) return false;
          if (iy && by && iy === by) return true;
          return [bAdj.parents, bAdj.partners, bAdj.children].some((m, idx) => [...has(m, b.id)].some((x) => near.has(idx + ':' + x)));
        });
        if (pick) { matched[i.id] = pick.id; usedBase.add(pick.id); changed = true; }
      });
      if (!changed) break;
    }
    const ref = (id) => matched[id] || 'new:' + id;
    const changes = [];
    const push = (c) => changes.push(c);
    const gword = (p, m, f, n) => (p.gender === 'M' ? m : p.gender === 'F' ? f : n);

    // people
    Object.values(inc.people).forEach((i) => {
      if (!matched[i.id]) {
        let t = 'New person: ' + nameOf(i);
        const y = FT.year(i.birth && i.birth.date);
        if (y) t += ' (b. ' + y + ')';
        const pars = [...has(iAdj.parents, i.id)].map((x) => inc.people[x]).filter(Boolean);
        const sps = [...has(iAdj.partners, i.id)].map((x) => inc.people[x]).filter(Boolean);
        if (pars.length) t += ', ' + gword(i, 'son', 'daughter', 'child') + ' of ' + pars.map(nameOf).join(' & ');
        else if (sps.length) t += ', ' + gword(i, 'husband', 'wife', 'partner') + ' of ' + sps.map(nameOf).join(' & ');
        push({ id: 'addPerson:' + i.id, kind: 'addPerson', text: t, personId: i.id, data: clone(i) });
        return;
      }
      const b = base.people[matched[i.id]];
      FIELDS.forEach((fl) => {
        const path = fl[0], to = getF(i, path), from = getF(b, path);
        if (isEmpty(path, to) || to === from) return;
        const conflict = !isEmpty(path, from);
        push({
          id: 'editPerson:' + b.id + ':' + path, kind: 'editPerson', personId: b.id, field: path,
          from: conflict ? from : '', to, conflict: conflict || undefined,
          text: nameOf(b) + ': ' + (conflict ? fl[1] + ' differs (yours "' + from + '", theirs "' + to + '")'
            : 'add ' + fl[1] + ' "' + (path === 'photo' ? '(photo)' : to) + '"')
        });
      });
    });

    // families
    Object.values(inc.families).forEach((f) => {
      if (!f.partners.length) return;
      const refs = f.partners.map(ref);
      const bf = findFam(base, refs);
      const exact = bf && setKey(bf.partners) === setKey(refs);
      let famNames = f.partners.map((x) => nameOf(inc.people[x])).join(' & ');
      if (!bf) {
        const sub = refs.length === 2 ? Object.values(base.families).find((x) => x.partners.length === 1 && refs.includes(x.partners[0])) : null;
        if (sub) {
          const newP = f.partners.find((x) => ref(x) !== sub.partners[0]);
          push({
            id: 'addPartner:' + f.id + ':' + newP, kind: 'addPartner', personId: newP,
            text: 'New partner: ' + nameOf(inc.people[newP]) + ' with ' + nameOf(base.people[sub.partners[0]]),
            data: { baseFamilyId: sub.id, partner: newP, status: f.status, marriage: clone(f.marriage) }
          });
        } else {
          push({
            id: 'addFamily:' + f.id, kind: 'addFamily', personId: f.partners[0],
            text: 'New family: ' + famNames + (f.status ? ' (' + f.status + ')' : ''),
            data: { partners: f.partners.slice(), status: f.status, marriage: clone(f.marriage) }
          });
        }
      } else if (exact) {
        [['status', 'status'], ['marriage.date', 'marriage date'], ['marriage.place', 'marriage place']].forEach((fl) => {
          const to = getF(f, fl[0]), from = getF(bf, fl[0]);
          if (!to || to === from) return;
          push({
            id: 'editFamily:' + bf.id + ':' + fl[0], kind: 'editFamily', field: fl[0], from: from || '', to,
            conflict: from ? true : undefined,
            text: famNames + ': ' + (from ? fl[1] + ' differs (yours "' + from + '", theirs "' + to + '")' : 'add ' + fl[1] + ' "' + to + '"'),
            data: { familyId: bf.id }
          });
        });
      }
      f.children.forEach((c) => {
        const bc = matched[c];
        if (bc && Object.values(base.families).some((x) => x.children.includes(bc))) {
          if (bf && bf.children.includes(bc)) return;
          return; // already has parents in base; do not relink
        }
        push({
          id: 'addChild:' + f.id + ':' + c, kind: 'addChild', personId: c,
          text: 'Add ' + nameOf(inc.people[c]) + ' as ' + gword(inc.people[c], 'son', 'daughter', 'child') + ' of ' + famNames,
          data: { partners: f.partners.slice(), child: c, rel: f.childRel[c] || 'birth' }
        });
      });
    });

    // removed (informational)
    Object.values(base.people).forEach((b) => {
      if (!usedBase.has(b.id)) push({ id: 'removed:' + b.id, kind: 'removed', personId: b.id, text: 'Not in their copy: ' + nameOf(b) });
    });

    changes.forEach((c, i) => { c._o = i; });
    changes.sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || x._o - y._o);
    changes.forEach((c) => { delete c._o; });
    return { changes, matchedBy: matched };
  }

  function apply(M, res, accepted) {
    const d = M.data;
    const acc = accepted === undefined || accepted === null ? null : new Set(accepted);
    const ok = (c) => (acc ? acc.has(c.id) : c.kind !== 'removed' && !c.conflict);
    const newId = {};
    const resolve = (iid) => res.matchedBy[iid] || newId[iid] || null;
    let applied = 0, skipped = 0;
    res.changes.slice().sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind]).forEach((c) => {
      if (!ok(c)) return;
      let done = false;
      if (c.kind === 'addPerson') {
        const p = clone(c.data);
        if (d.people[p.id]) p.id = FT.uid('p');
        d.people[p.id] = FT.blankPerson(p); newId[c.data.id] = p.id; done = true;
      } else if (c.kind === 'editPerson') {
        const p = d.people[c.personId];
        if (p) { setF(p, c.field, c.to); done = true; }
      } else if (c.kind === 'addFamily') {
        const ids = c.data.partners.map(resolve);
        if (ids.every(Boolean)) {
          const f = M.addFamily({ partners: ids, status: c.data.status, marriage: clone(c.data.marriage) });
          done = !!f;
        }
      } else if (c.kind === 'addPartner') {
        const f = d.families[c.data.baseFamilyId], pid = resolve(c.data.partner);
        if (f && pid) {
          if (!f.partners.includes(pid)) f.partners.push(pid);
          if (!f.status) f.status = c.data.status || '';
          if (!f.marriage.date) f.marriage.date = c.data.marriage.date;
          if (!f.marriage.place) f.marriage.place = c.data.marriage.place;
          done = true;
        }
      } else if (c.kind === 'addChild') {
        const ids = c.data.partners.map(resolve), cid = resolve(c.data.child);
        if (cid && ids.every(Boolean)) {
          const f = findFam(d, ids);
          if (f) {
            if (!f.children.includes(cid)) f.children.push(cid);
            if (c.data.rel && c.data.rel !== 'birth') f.childRel[cid] = c.data.rel;
            done = true;
          }
        }
      } else if (c.kind === 'editFamily') {
        const f = d.families[c.data.familyId];
        if (f) { setF(f, c.field, c.to); done = true; }
      } else if (c.kind === 'removed') {
        if (d.people[c.personId]) { M.deletePerson(c.personId); done = true; }
      }
      if (done) applied++; else skipped++;
    });
    return { applied, skipped };
  }

  function branchData(M, pid) {
    const d = M.data;
    const set = new Set([pid]);
    M.descendants(pid).forEach((x) => set.add(x));
    [...set].forEach((x) => M.partners(x).forEach((p) => set.add(p)));
    M.famsAsChild(pid).forEach((f) => f.partners.forEach((p) => set.add(p)));
    const out = { version: 1, meta: {}, people: {}, families: {}, settings: {} };
    const now = new Date().toISOString();
    const P = d.people[pid];
    out.meta = { id: FT.uid('t'), title: (P ? nameOf(P) : 'Family') + "'s branch", created: now, modified: now, parent: d.meta.id };
    set.forEach((id) => { if (d.people[id]) out.people[id] = clone(d.people[id]); });
    Object.values(d.families).forEach((f) => {
      const nf = clone(f);
      nf.partners = nf.partners.filter((x) => set.has(x));
      nf.children = nf.children.filter((x) => set.has(x));
      Object.keys(nf.childRel).forEach((k) => { if (!set.has(k)) delete nf.childRel[k]; });
      if (nf.partners.length + nf.children.length < 2 || (nf.partners.length === 1 && !nf.children.length)) return;
      out.families[nf.id] = nf;
    });
    return out;
  }

  FT.Merge = { diff, apply, branchData };
})();
