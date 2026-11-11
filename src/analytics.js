/* FT.Analytics — read-only statistics, data-quality checks, per-person summaries, paths and calendar. */
window.FT = window.FT || {};
(function () {
  'use strict';

  // ---------- dates ----------
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const APPROX_RE = /^(?:circa|ca|c|abt|about|approx|approximately|before|bef|after|aft|est|estimated|~)\.?\s*(?=[\dA-Za-z]|$)/i;

  /** Parse a free-text date → {y, m, d, approx} or null. DD/MM/YYYY is assumed for numeric dates. */
  function parseDate(s) {
    if (s === null || s === undefined) return null;
    s = String(s).trim();
    if (!s) return null;
    let approx = false;
    const pre = s.match(APPROX_RE);
    if (pre) { approx = true; s = s.slice(pre[0].length).trim(); }
    if (/^~/.test(s)) { approx = true; s = s.replace(/^~\s*/, ''); }
    let y = null, m = null, d = null, r;
    if ((r = s.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?$/))) {
      y = +r[1]; m = +r[2]; d = r[3] ? +r[3] : null;
    } else if ((r = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) {
      y = +r[3]; d = +r[1]; m = +r[2];
      if (m > 12 && d <= 12) { const t = d; d = m; m = t; }
    } else if ((r = s.match(/^(\d{1,2})[\/.\-](\d{4})$/))) {
      y = +r[2]; m = +r[1];
    } else {
      const yr = s.match(/\b(\d{4})\b/);
      if (yr) {
        y = +yr[1];
        const rest = s.replace(yr[0], ' ');
        const mm = rest.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/i);
        if (mm) {
          m = MONTHS[mm[1].toLowerCase()];
          const dm = rest.replace(mm[0], ' ').match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
          if (dm) d = +dm[1];
        }
      } else {
        y = FT.year ? FT.year(s) : null;
      }
    }
    if (!y) return null;
    if (m !== null && (m < 1 || m > 12)) { m = null; d = null; }
    if (d !== null && (d < 1 || d > 31)) d = null;
    if (m === null) d = null;
    return { y: y, m: m, d: d, approx: approx };
  }
  FT.parseDate = parseDate;

  function yearsBetween(b, e) {
    let n = e.y - b.y;
    if (b.m && e.m && (e.m < b.m || (e.m === b.m && b.d && e.d && e.d < b.d))) n--;
    return n;
  }
  function isDeceased(p) { return p.living === false || !!(p.death && (p.death.date || p.death.place)); }

  /** {years, atDeath} or null. */
  function age(p, now) {
    if (!p) return null;
    const b = parseDate(p.birth && p.birth.date);
    if (!b) return null;
    if (isDeceased(p)) {
      const dd = parseDate(p.death && p.death.date);
      if (!dd) return null;
      return { years: yearsBetween(b, dd), atDeath: true };
    }
    now = now || new Date();
    return { years: yearsBetween(b, { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }), atDeath: false };
  }

  // ---------- context / indexes ----------
  function index(M) {
    const people = M.data.people, fams = Object.values(M.data.families);
    const fc = {}, fp = {};
    fams.forEach((f) => {
      f.children.forEach((c) => (fc[c] = fc[c] || []).push(f));
      f.partners.forEach((x) => (fp[x] = fp[x] || []).push(f));
    });
    const parents = {}, allParents = {}, partners = {}, children = {}, pfam = {};
    Object.keys(people).forEach((id) => {
      const cf = fc[id] || [];
      const pf = cf.find((f) => (f.childRel[id] || 'birth') === 'birth') || cf[0] || null;
      pfam[id] = pf;
      parents[id] = pf ? pf.partners.slice() : [];
      const ap = []; cf.forEach((f) => f.partners.forEach((x) => { if (ap.indexOf(x) < 0) ap.push(x); }));
      allParents[id] = ap;
      const ps = [], ch = [];
      (fp[id] || []).forEach((f) => {
        f.partners.forEach((x) => { if (x !== id && ps.indexOf(x) < 0) ps.push(x); });
        f.children.forEach((c) => { if (ch.indexOf(c) < 0) ch.push(c); });
      });
      partners[id] = ps; children[id] = ch;
    });
    return { M: M, people: people, fams: fams, parents: parents, allParents: allParents, partners: partners, children: children, pfam: pfam };
  }
  function ctx(M) {
    const c = index(M);
    const pb = new Map(), pd = new Map();
    c.b = (id) => { if (!pb.has(id)) pb.set(id, parseDate(c.people[id].birth.date)); return pb.get(id); };
    c.d = (id) => { if (!pd.has(id)) pd.set(id, parseDate(c.people[id].death.date)); return pd.get(id); };
    c.by = (id) => { const x = c.b(id); return x ? x.y : null; };
    c.dy = (id) => { const x = c.d(id); return x ? x.y : null; };
    c.nm = (id) => M.displayName(c.people[id]);
    c.now = new Date();
    c.status = (p) => {
      if (isDeceased(p)) return 'deceased';
      if (p.living === true) return 'living';
      const b = c.by(p.id);
      if (b && c.now.getFullYear() - b <= 100) return 'living';
      return 'unknown';
    };
    return c;
  }
  function descSet(c, id) {
    const seen = new Set(), st = [id];
    while (st.length) { const x = st.pop(); (c.children[x] || []).forEach((k) => { if (!seen.has(k)) { seen.add(k); st.push(k); } }); }
    return seen;
  }
  function famIds(c, id, desc) {
    const s = new Set([id]);
    (c.partners[id] || []).forEach((x) => s.add(x));
    desc.forEach((d) => { s.add(d); (c.partners[d] || []).forEach((x) => s.add(x)); });
    return s;
  }
  const round1 = (x) => Math.round(x * 10) / 10;
  const mean = (a) => (a.length ? round1(a.reduce((s, x) => s + x, 0) / a.length) : null);
  function avg(a) { return { value: mean(a), n: a.length }; }
  function groupDesc(map, limit) {
    const out = Array.from(map.values()).sort((a, b) => b.ids.length - a.ids.length || String(a.name || a.place).localeCompare(String(b.name || b.place)));
    return limit ? out.slice(0, limit) : out;
  }
  function addTo(map, key, disp, id, field) {
    let g = map.get(key);
    if (!g) { g = { ids: [] }; g[field] = disp; map.set(key, g); }
    g.ids.push(id);
  }
  const town = (s) => String(s || '').split(',')[0].trim().replace(/\s+/g, ' ');
  const possessive = (p) => (p.gender === 'M' ? 'his' : p.gender === 'F' ? 'her' : 'their');
  const roleOf = (p) => (p.gender === 'M' ? 'father' : p.gender === 'F' ? 'mother' : 'parent');
  const normName = (p) => ((p.given || '') + (p.surname || '')).toLowerCase().replace(/[.\s]/g, '');

  // ---------- data quality ----------
  function data(M, ids) {
    const c = ctx(M);
    const all = Object.keys(c.people);
    const list = ids ? Array.from(ids).filter((i) => c.people[i]) : all;
    const S = new Set(list);
    const total = list.length;
    const P = (id) => c.people[id];

    // completeness
    const defs = [
      { key: 'name', label: 'First name', has: (p) => !!p.given },
      { key: 'surname', label: 'Surname', has: (p) => !!p.surname },
      { key: 'gender', label: 'Gender', has: (p) => p.gender === 'M' || p.gender === 'F' },
      { key: 'birthDate', label: 'Birth date', has: (p) => !!p.birth.date },
      { key: 'birthPlace', label: 'Birth place', has: (p) => !!p.birth.place },
      { key: 'status', label: 'Living / deceased known', has: (p) => p.living !== null || !!(p.death.date || p.death.place) || !!c.by(p.id) },
      { key: 'deathDate', label: 'Death date', applies: (p) => isDeceased(p), has: (p) => !!p.death.date },
      { key: 'photo', label: 'Photo', has: (p) => !!p.photo }
    ];
    const fields = defs.map((df) => {
      let have = 0, applicable = 0; const missing = [];
      list.forEach((id) => {
        const p = P(id);
        if (df.applies && !df.applies(p)) return;
        applicable++;
        if (df.has(p)) have++; else missing.push(id);
      });
      return { key: df.key, label: df.label, have: have, applicable: applicable, missing: missing };
    });
    let sh = 0, sa = 0;
    fields.forEach((f) => { if (f.key !== 'photo') { sh += f.have; sa += f.applicable; } });
    const pct = sa ? Math.round((100 * sh) / sa) : (total ? 100 : 0);

    // gender / living
    const gender = { M: [], F: [], U: [] };
    const living = { living: [], deceased: [], unknown: [] };
    list.forEach((id) => {
      const p = P(id);
      gender[p.gender === 'M' ? 'M' : p.gender === 'F' ? 'F' : 'U'].push(id);
      living[c.status(p)].push(id);
    });

    // missing
    const married = (id) => c.partners[id].length > 0 && c.partners[id].every((x) => c.parents[x].length > 0);
    const missingDefs = [
      ['birthDate', 'No birth date', (p) => !p.birth.date],
      ['birthPlace', 'No birth place', (p) => !p.birth.place],
      ['deathDate', 'Deceased, no death date', (p) => isDeceased(p) && !p.death.date],
      ['deathPlace', 'Deceased, no death place', (p) => isDeceased(p) && !p.death.place],
      ['gender', 'Gender not recorded', (p) => p.gender !== 'M' && p.gender !== 'F'],
      ['surname', 'No surname', (p) => !p.surname],
      ['photo', 'No photo', (p) => !p.photo],
      ['parentsMissing', 'No parents in tree (not counting married-in spouses or clan roots)',
        (p) => !c.parents[p.id].length && !married(p.id) && !c.partners[p.id].length && !c.children[p.id].length]
    ];
    const missing = missingDefs.map((md) => ({ key: md[0], label: md[1], ids: list.filter((id) => md[2](P(id))) }));

    // issues
    const issues = [];
    const add = (type, severity, text, ids2) => issues.push({ type: type, severity: severity, text: text, ids: ids2 });
    const bTxt = (id) => '(b. ' + c.by(id) + ')';
    c.fams.forEach((f) => {
      const parentsInFam = f.partners.filter((x) => c.people[x]);
      f.children.forEach((ch) => {
        if (!S.has(ch) || (f.childRel[ch] && f.childRel[ch] !== 'birth')) return;
        const cby = c.by(ch), cp = P(ch);
        parentsInFam.forEach((par) => {
          if (!S.has(par)) return;
          const pp = P(par), pby = c.by(par), role = roleOf(pp);
          if (cby && pby) {
            if (cby <= pby) {
              add('child-before-parent', 'high', c.nm(ch) + ' ' + bTxt(ch) + ' is recorded as born ' + (cby < pby ? 'before' : 'in the same year as') + ' ' + possessive(cp) + ' ' + role + ' ' + c.nm(par) + ' ' + bTxt(par), [ch, par]);
            } else {
              const a = cby - pby;
              if (a < 13) add('young-parent', 'medium', c.nm(par) + ' ' + bTxt(par) + ' was only ' + a + ' when ' + c.nm(ch) + ' was born in ' + cby, [par, ch]);
              else if (pp.gender === 'F' && a > 55) add('old-mother', 'medium', c.nm(par) + ' ' + bTxt(par) + ' would have been ' + a + ' when ' + c.nm(ch) + ' was born in ' + cby, [par, ch]);
              else if (pp.gender === 'M' && a > 80) add('old-father', 'low', c.nm(par) + ' ' + bTxt(par) + ' would have been ' + a + ' when ' + c.nm(ch) + ' was born in ' + cby, [par, ch]);
            }
          }
          const pdy = c.dy(par);
          if (cby && pdy && cby - pdy > 1) {
            add('born-after-parent-death', pp.gender === 'F' ? 'high' : 'medium', c.nm(ch) + ' ' + bTxt(ch) + ' was born ' + (cby - pdy) + ' years after ' + possessive(cp) + ' ' + role + ' ' + c.nm(par) + ' died (d. ' + pdy + ')', [ch, par]);
          }
        });
      });
      if (f.partners.length === 2 && f.partners.every((x) => S.has(x))) {
        const a = f.partners[0], b = f.partners[1], ya = c.by(a), yb = c.by(b);
        if (ya && yb && Math.abs(ya - yb) > 25) {
          add('age-gap', 'low', c.nm(a) + ' ' + bTxt(a) + ' and ' + c.nm(b) + ' ' + bTxt(b) + ' are partners with an age gap of ' + Math.abs(ya - yb) + ' years', [a, b]);
        }
      }
    });
    list.forEach((id) => {
      const p = P(id), by = c.by(id), dy = c.dy(id);
      if (by && dy && dy < by) add('death-before-birth', 'high', c.nm(id) + ' is recorded as dying (' + dy + ') before being born (' + by + ')', [id]);
      if (p.living === true || (!isDeceased(p) && c.status(p) === 'living')) {
        const a = age(p, c.now);
        if (a && a.years > 110) add('too-old-living', 'medium', c.nm(id) + ' ' + bTxt(id) + ' is marked living but would be ' + a.years + ' years old', [id]);
      }
    });
    // duplicates
    const byName = new Map();
    list.forEach((id) => { const k = normName(P(id)); if (k) { if (!byName.has(k)) byName.set(k, []); byName.get(k).push(id); } });
    byName.forEach((grp) => {
      if (grp.length < 2 || grp.length > 60) return;
      const uf = {}; const find = (x) => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
      grp.forEach((x) => (uf[x] = x));
      let any = false;
      for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++) {
        const ya = c.by(grp[i]), yb = c.by(grp[j]);
        if (!ya || !yb || ya === yb) { uf[find(grp[i])] = find(grp[j]); any = true; }
      }
      if (!any) return;
      const clusters = {};
      grp.forEach((x) => (clusters[find(x)] = clusters[find(x)] || []).push(x));
      Object.values(clusters).forEach((cl) => {
        if (cl.length < 2) return;
        add('duplicate', 'medium', 'Possible duplicate: ' + cl.map((x) => c.nm(x) + (c.by(x) ? ' (b. ' + c.by(x) + ')' : '')).join(' and '), cl);
      });
    });
    const rank = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => rank[a.severity] - rank[b.severity]);

    // todo
    const todo = [];
    list.forEach((id) => {
      const p = P(id); const miss = []; let score = 0;
      if (!p.given) { miss.push('First name'); score++; }
      if (!p.surname) { miss.push('Surname'); score++; }
      if (p.gender !== 'M' && p.gender !== 'F') { miss.push('Gender'); score++; }
      if (!p.birth.date) { miss.push('Birth date'); score++; }
      if (!p.birth.place) { miss.push('Birth place'); score++; }
      if (isDeceased(p) && !p.death.date) { miss.push('Death date'); score += 2; }
      if (score > 0) todo.push({ id: id, missing: miss, score: score });
    });
    todo.sort((a, b) => b.score - a.score || c.nm(a.id).localeCompare(c.nm(b.id)));

    return { total: total, completeness: { pct: pct, fields: fields }, gender: gender, living: living, missing: missing, issues: issues, todo: todo };
  }

  // ---------- generations ----------
  function gensFrom(c) {
    const memo = new Map(), visiting = new Set();
    function g(id) {
      if (memo.has(id)) return memo.get(id);
      if (visiting.has(id)) return 1;
      visiting.add(id);
      let v = 1;
      const ps = c.parents[id];
      if (ps.length) {
        v = Math.max.apply(null, ps.map(g)) + 1;
      } else {
        const wp = c.partners[id].filter((x) => c.parents[x].length);
        if (wp.length) v = Math.max.apply(null, wp.map(g));
      }
      visiting.delete(id);
      memo.set(id, v);
      return v;
    }
    Object.keys(c.people).forEach(g);
    let min = Infinity; memo.forEach((v) => { if (v < min) min = v; });
    if (min !== Infinity && min !== 1) memo.forEach((v, k) => memo.set(k, v - min + 1));
    return memo;
  }
  function generations(M) { return gensFrom(ctx(M)); }

  // ---------- whole-tree statistics ----------
  function tree(M) {
    const c = ctx(M);
    const ids = Object.keys(c.people);
    const gens = gensFrom(c);
    const P = (id) => c.people[id];
    const st = {}; ids.forEach((id) => (st[id] = c.status(P(id))));
    const count = (fn) => ids.filter(fn).length;

    const couples = c.fams.filter((f) => f.partners.length === 2).length;
    const linking = c.fams.filter((f) => f.partners.length === 2 && f.partners.every((x) => c.parents[x].length)).length;
    const maxGen = ids.length ? Math.max.apply(null, ids.map((i) => gens.get(i))) : 0;
    const headline = {
      people: ids.length, couples: couples, generations: maxGen, clans: M.roots().length, linkingMarriages: linking,
      living: count((i) => st[i] === 'living'), deceased: count((i) => st[i] === 'deceased'), unknownStatus: count((i) => st[i] === 'unknown'),
      males: count((i) => P(i).gender === 'M'), females: count((i) => P(i).gender === 'F'), genderUnknown: count((i) => P(i).gender !== 'M' && P(i).gender !== 'F')
    };

    const perGeneration = [];
    for (let g = 1; g <= maxGen; g++) {
      const gi = ids.filter((i) => gens.get(i) === g);
      perGeneration.push({
        gen: g, ids: gi,
        living: gi.filter((i) => st[i] === 'living').length, deceased: gi.filter((i) => st[i] === 'deceased').length,
        M: gi.filter((i) => P(i).gender === 'M').length, F: gi.filter((i) => P(i).gender === 'F').length,
        U: gi.filter((i) => P(i).gender !== 'M' && P(i).gender !== 'F').length
      });
    }

    // records
    let largest = null;
    c.fams.forEach((f) => {
      if (!f.children.length || !f.partners.length) return;
      if (!largest || f.children.length > largest.count) {
        const m = f.partners.find((x) => P(x) && P(x).gender === 'M');
        largest = { id: m || f.partners[0], count: f.children.length };
      }
    });
    let eldestLiving = null, youngest = null, longestLived = null, mostGrand = null, mostDesc = null, youngKey = null;
    ids.forEach((id) => {
      const p = P(id), a = age(p, c.now);
      if (a && st[id] === 'living' && !a.atDeath && (!eldestLiving || a.years > eldestLiving.years)) eldestLiving = { id: id, years: a.years };
      if (a && a.atDeath && (!longestLived || a.years > longestLived.years)) longestLived = { id: id, years: a.years };
      const b = c.b(id);
      if (b) {
        const key = b.y * 10000 + (b.m || 0) * 100 + (b.d || 0);
        if (youngKey === null || key > youngKey) { youngKey = key; youngest = { id: id, date: p.birth.date }; }
      }
      const kids = c.children[id];
      if (kids.length) {
        const gc = new Set(); kids.forEach((k) => c.children[k].forEach((x) => gc.add(x)));
        if (gc.size && (!mostGrand || gc.size > mostGrand.count)) mostGrand = { id: id, count: gc.size };
        const dn = descSet(c, id).size;
        if (!mostDesc || dn > mostDesc.count) mostDesc = { id: id, count: dn };
      }
    });
    const records = { largestFamily: largest, eldestLiving: eldestLiving, youngest: youngest, longestLived: longestLived, mostGrandchildren: mostGrand, mostDescendants: mostDesc };

    // averages
    const coupleKids = c.fams.filter((f) => f.partners.length === 2).map((f) => f.children.length);
    const famKids = c.fams.filter((f) => f.children.length).map((f) => f.children.length);
    const lifespans = [];
    ids.forEach((id) => { const a = age(P(id), c.now); if (a && a.atDeath && a.years >= 0) lifespans.push(a.years); });
    const marAges = [];
    c.fams.forEach((f) => {
      const md = parseDate(f.marriage && f.marriage.date);
      if (!md) return;
      f.partners.forEach((x) => { const b = c.b(x); if (b) { const y = yearsBetween(b, md); if (y >= 0) marAges.push(y); } });
    });
    const firstAges = [];
    ids.forEach((id) => {
      const b = c.b(id); if (!b) return;
      const ys = c.children[id].map((k) => c.b(k)).filter(Boolean);
      if (!ys.length) return;
      ys.sort((x, y) => x.y * 10000 + (x.m || 0) * 100 + (x.d || 0) - (y.y * 10000 + (y.m || 0) * 100 + (y.d || 0)));
      const y = yearsBetween(b, ys[0]);
      if (y >= 0) firstAges.push(y);
    });
    const averages = {
      childrenPerCouple: avg(coupleKids), lifespan: avg(lifespans), ageAtMarriage: avg(marAges),
      ageAtFirstChild: avg(firstAges), siblingsPerFamily: avg(famKids)
    };

    // places
    const bp = new Map(), nat = new Map(), genPlaces = {};
    ids.forEach((id) => {
      const p = P(id), t = town(p.birth.place);
      if (t) {
        addTo(bp, t.toLowerCase(), t, id, 'place');
        const g = gens.get(id); const gm = genPlaces[g] = genPlaces[g] || new Map();
        const e = gm.get(t.toLowerCase()); if (e) e.count++; else gm.set(t.toLowerCase(), { place: t, count: 1 });
      }
      const n = String(p.native || '').trim().replace(/\s+/g, ' ');
      if (n) addTo(nat, n.toLowerCase(), n, id, 'place');
    });
    const places = {
      birth: groupDesc(bp),
      byGeneration: perGeneration.map((pg) => ({
        gen: pg.gen,
        top: Array.from((genPlaces[pg.gen] || new Map()).values()).sort((a, b) => b.count - a.count || a.place.localeCompare(b.place)).slice(0, 3)
      })),
      native: groupDesc(nat)
    };

    // names
    const gv = new Map(), sv = new Map(), mi = new Map();
    ids.forEach((id) => {
      const p = P(id);
      const first = String(p.given || '').trim().split(/\s+/)[0];
      if (first) addTo(gv, first.toLowerCase(), first, id, 'name');
      const sn = String(p.surname || '').trim();
      if (sn) {
        addTo(sv, sn.toLowerCase(), sn, id, 'name');
        if (!c.parents[id].length && c.partners[id].length && c.partners[id].every((x) => c.parents[x].length)) addTo(mi, sn.toLowerCase(), sn, id, 'name');
      }
    });
    const names = { given: groupDesc(gv, 15), surnames: groupDesc(sv, 15), marriedIn: groupDesc(mi, 15) };

    // decades
    const bd = new Map(), dd = new Map();
    const dec = (m, y, id) => { const k = Math.floor(y / 10) * 10; if (!m.has(k)) m.set(k, []); m.get(k).push(id); };
    ids.forEach((id) => { const b = c.by(id), d = c.dy(id); if (b) dec(bd, b, id); if (d) dec(dd, d, id); });
    const toArr = (m) => Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map((e) => ({ decade: e[0], ids: e[1] }));

    const gt = new Map();
    ids.forEach((id) => { const g = String(P(id).gotra || '').trim(); if (g) addTo(gt, g.toLowerCase(), g, id, 'name'); });

    return { headline: headline, perGeneration: perGeneration, records: records, averages: averages, places: places, names: names, decades: toArr(bd), deaths: toArr(dd), gotras: groupDesc(gt) };
  }

  // ---------- branches ----------
  function branchStats(c, root, includeSelfOnly) {
    const desc = descSet(c, root);
    const fam = famIds(c, root, desc);
    let living = 0; fam.forEach((id) => { if (c.status(c.people[id]) === 'living') living++; });
    // depth below root
    let depth = 0, level = [root]; const seen = new Set([root]);
    while (level.length) {
      const next = [];
      level.forEach((x) => c.children[x].forEach((k) => { if (!seen.has(k)) { seen.add(k); next.push(k); } }));
      if (next.length) depth++;
      level = next;
    }
    return { id: root, descendants: desc.size, family: fam.size, living: living, generations: depth, children: c.children[root].length };
  }
  function branches(M, pid) {
    const c = ctx(M);
    if (!c.people[pid]) return { rows: [], total: null };
    return { rows: c.children[pid].map((k) => branchStats(c, k)), total: branchStats(c, pid) };
  }

  // ---------- one person ----------
  function levelsOf(c, pid) {
    const levels = []; const seen = new Set([pid]); let cur = [pid];
    for (;;) {
      const next = [];
      cur.forEach((x) => c.children[x].forEach((k) => { if (!seen.has(k)) { seen.add(k); next.push(k); } }));
      if (!next.length) break;
      levels.push(next); cur = next;
    }
    return levels;
  }
  function person(M, pid) {
    const c = ctx(M);
    const p = c.people[pid];
    if (!p) return null;
    const kids = c.children[pid];
    const sons = kids.filter((k) => c.people[k].gender === 'M');
    const daughters = kids.filter((k) => c.people[k].gender === 'F');
    const other = kids.filter((k) => c.people[k].gender !== 'M' && c.people[k].gender !== 'F');
    const sibs = [];
    c.fams.forEach((f) => {
      if (f.children.indexOf(pid) < 0) return;
      f.children.forEach((k) => { if (k !== pid && sibs.indexOf(k) < 0) sibs.push(k); });
      f.partners.forEach((par) => c.children[par].forEach((k) => { if (k !== pid && sibs.indexOf(k) < 0) sibs.push(k); }));
    });
    const pf = c.pfam[pid];
    const birthOrder = pf ? { pos: pf.children.indexOf(pid) + 1, of: pf.children.length } : null;
    const levels = levelsOf(c, pid);
    const desc = descSet(c, pid);
    const fam = famIds(c, pid, desc);
    let famLiving = 0; fam.forEach((id) => { if (c.status(c.people[id]) === 'living') famLiving++; });

    // ancestors
    const up = new Map([[pid, 0]]); let q = [pid];
    while (q.length) {
      const nq = [];
      q.forEach((x) => c.parents[x].forEach((a) => { if (!up.has(a)) { up.set(a, up.get(x) + 1); nq.push(a); } }));
      q = nq;
    }
    up.delete(pid);
    let depth = 0, eldest = null, eldestY = null, deepest = null;
    up.forEach((d, id) => {
      if (d > depth) { depth = d; deepest = id; }
      const y = c.by(id);
      if (y && (eldestY === null || y < eldestY)) { eldestY = y; eldest = id; }
    });
    if (!eldest) eldest = deepest;

    // timeline
    const ev = [];
    const addEv = (date, text, ids2) => { const d = parseDate(date); ev.push({ date: date || '', y: d ? d.y : null, key: d ? d.y * 10000 + (d.m || 0) * 100 + (d.d || 0) : Infinity, text: text, ids: ids2 }); };
    addEv(p.birth.date, 'Born' + (p.birth.place ? ' in ' + p.birth.place : ''), [pid]);
    c.fams.forEach((f) => {
      if (f.partners.indexOf(pid) < 0) return;
      f.partners.filter((x) => x !== pid).forEach((x) => {
        addEv(f.marriage && f.marriage.date, 'Married ' + c.nm(x) + (f.marriage && f.marriage.place ? ' in ' + f.marriage.place : ''), [pid, x]);
      });
    });
    kids.forEach((k) => { const cp = c.people[k]; if (cp.birth.date) addEv(cp.birth.date, 'Child ' + c.nm(k) + ' born', [k]); });
    c.partners[pid].forEach((x) => { const xp = c.people[x]; if (xp.death.date) addEv(xp.death.date, 'Partner ' + c.nm(x) + ' died', [x]); });
    c.parents[pid].forEach((x) => { const xp = c.people[x]; if (xp.death.date) addEv(xp.death.date, 'Parent ' + c.nm(x) + ' died', [x]); });
    if (isDeceased(p)) addEv(p.death.date, 'Died' + (p.death.place ? ' in ' + p.death.place : ''), [pid]);
    ev.forEach((e, i) => (e.i = i));
    ev.sort((a, b) => (a.key === b.key ? a.i - b.i : a.key < b.key ? -1 : 1));
    const timeline = ev.map((e) => ({ date: e.date, y: e.y, text: e.text, ids: e.ids }));

    return {
      id: pid, name: c.nm(pid), nick: p.nick, gender: p.gender, altName: p.altName, gotra: p.gotra, native: p.native,
      birth: { date: p.birth.date, place: p.birth.place }, death: { date: p.death.date, place: p.death.place },
      status: c.status(p), age: age(p, c.now),
      parents: c.parents[pid].slice(), partners: c.partners[pid].slice(), children: kids.slice(),
      sons: sons, daughters: daughters, otherChildren: other, siblings: sibs, birthOrder: birthOrder,
      levels: levels, descendants: desc.size,
      family: { total: fam.size, living: famLiving, ids: Array.from(fam) },
      ancestors: { count: up.size, depth: depth, eldest: eldest },
      quality: data(M, Array.from(fam)),
      timeline: timeline
    };
  }

  // ---------- paths ----------
  function path(M, a, b) {
    const c = index(M);
    if (!c.people[a] || !c.people[b]) return [];
    if (a === b) return [a];
    const prev = new Map([[a, null]]); let q = [a];
    while (q.length) {
      const nq = [];
      for (const x of q) {
        const nb = c.allParents[x].concat(c.children[x], c.partners[x]);
        for (const y of nb) {
          if (prev.has(y) || !c.people[y]) continue;
          prev.set(y, x);
          if (y === b) {
            const out = [b]; let cur = x;
            while (cur !== null) { out.unshift(cur); cur = prev.get(cur); }
            return out;
          }
          nq.push(y);
        }
      }
      q = nq;
    }
    return [];
  }
  function pathSteps(M, a, b) {
    const c = index(M);
    const p = path(M, a, b), out = [];
    for (let i = 0; i + 1 < p.length; i++) {
      const from = p[i], to = p[i + 1], g = c.people[to].gender;
      let rel;
      if (c.allParents[from].indexOf(to) >= 0) rel = g === 'M' ? 'father' : g === 'F' ? 'mother' : 'parent';
      else if (c.children[from].indexOf(to) >= 0) rel = g === 'M' ? 'son' : g === 'F' ? 'daughter' : 'child';
      else rel = g === 'M' ? 'husband' : g === 'F' ? 'wife' : 'partner';
      out.push({ from: from, to: to, rel: rel });
    }
    return out;
  }

  // ---------- calendar ----------
  function calendar(M, fromDate, days) {
    const c = ctx(M);
    const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const end = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
    const out = [];
    const occ = (y, m, d) => { const dt = new Date(y, m - 1, d); if (dt.getMonth() !== m - 1) return new Date(y, m - 1, 28); return dt; };
    const years = []; for (let y = from.getFullYear(); y <= end.getFullYear(); y++) years.push(y);
    const push = (kind, id, pd, y0, ids) => {
      years.forEach((y) => {
        const dt = occ(y, pd.m, pd.d);
        if (dt >= from && dt < end) out.push({ id: id, kind: kind, date: dt, years: y0 ? y - y0 : null, ids: ids });
      });
    };
    Object.keys(c.people).forEach((id) => {
      const p = c.people[id], b = c.b(id), d = c.d(id);
      if (c.status(p) === 'living' && b && b.m && b.d) push('birthday', id, b, b.y, [id]);
      if (isDeceased(p) && d && d.m && d.d) push('death anniversary', id, d, d.y, [id]);
    });
    c.fams.forEach((f) => {
      if (f.partners.length !== 2) return;
      const md = parseDate(f.marriage && f.marriage.date);
      if (md && md.m && md.d) push('wedding anniversary', f.partners[0], md, md.y, f.partners.slice());
    });
    out.sort((a, b) => a.date - b.date || a.kind.localeCompare(b.kind));
    return out;
  }

  FT.Analytics = { age: age, data: data, generations: generations, tree: tree, branches: branches, person: person, path: path, pathSteps: pathSteps, calendar: calendar };
})();
