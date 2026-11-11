// node tests/analytics.test.js
global.window = global;
['model', 'sample', 'analytics'].forEach((f) => require('../src/' + f + '.js'));
const assert = require('assert');
const A = FT.Analytics;
let n = 0;
const t = (name, fn) => { fn(); n++; };

// ---------- parseDate ----------
t('parseDate', () => {
  assert.deepStrictEqual(FT.parseDate('1952'), { y: 1952, m: null, d: null, approx: false });
  assert.deepStrictEqual(FT.parseDate('12 Mar 1952'), { y: 1952, m: 3, d: 12, approx: false });
  assert.deepStrictEqual(FT.parseDate('12/03/1952'), { y: 1952, m: 3, d: 12, approx: false });
  assert.deepStrictEqual(FT.parseDate('1952-03-12'), { y: 1952, m: 3, d: 12, approx: false });
  assert.deepStrictEqual(FT.parseDate('Mar 1952'), { y: 1952, m: 3, d: null, approx: false });
  assert.deepStrictEqual(FT.parseDate('March 12, 1952'), { y: 1952, m: 3, d: 12, approx: false });
  assert.strictEqual(FT.parseDate('abt 1950').approx, true);
  assert.strictEqual(FT.parseDate('abt 1950').y, 1950);
  assert.strictEqual(FT.parseDate('c. 1950').y, 1950);
  assert.strictEqual(FT.parseDate('~1950').approx, true);
  assert.strictEqual(FT.parseDate('before 1950').approx, true);
  assert.strictEqual(FT.parseDate('25/12/1980').m, 12);
  assert.strictEqual(FT.parseDate(''), null);
  assert.strictEqual(FT.parseDate('unknown'), null);
});

// ---------- age ----------
t('age', () => {
  const now = new Date(2026, 5, 15);
  assert.deepStrictEqual(A.age({ birth: { date: '12/03/1980' }, death: {}, living: true }, now), { years: 46, atDeath: false });
  assert.deepStrictEqual(A.age({ birth: { date: '12/09/1980' }, death: {}, living: true }, now), { years: 45, atDeath: false });
  assert.deepStrictEqual(A.age({ birth: { date: '1920' }, death: { date: '12 Mar 1995' }, living: false }, now), { years: 75, atDeath: true });
  assert.strictEqual(A.age({ birth: { date: '1920' }, death: { date: '' }, living: false }, now), null);
  assert.strictEqual(A.age({ birth: { date: '' }, death: {}, living: true }, now), null);
});

// ---------- hand-built model ----------
const person = (id, given, surname, gender, b, d, extra) => Object.assign({ id, given, surname, gender, birth: { date: b || '', place: '' }, death: { date: d || '', place: '' }, living: d ? false : null }, extra || {});
const M2 = new FT.Model();
M2.load({
  people: {
    mo: person('mo', 'Mohan', 'Sharma', 'M', '12/03/1950', '5 Jan 2010'),
    si: person('si', 'Sita', 'Devi', 'F', '1955'),
    an: person('an', 'Anil', 'Sharma', 'M', '1948'),     // born before father
    ra: person('ra', 'Ravi', 'Sharma', 'M', '1980', '', { birth: { date: '1980', place: 'Jaipur, India' } }),
    pr: person('pr', 'Priya', 'Sharma', 'F', '5 Jan 1982'),
    ne: person('ne', 'Neha', 'Gupta', 'F', '1983'),
    ki: person('ki', 'Kid', 'Sharma', 'M', '2010'),
    k2: person('k2', 'Kid2', 'Sharma', 'F', '2012'),
    gk: person('gk', 'Gkid', 'Sharma', 'M', '2040'),
    bad: person('bad', 'Bad', 'Dates', 'U', '1990', '1980'),
    dup: person('dup', 'ravi', 'sharma', 'M', ''),
    far: person('far', 'Far', 'Away', 'F', '1900')
  },
  families: {
    f1: { id: 'f1', partners: ['mo', 'si'], children: ['an', 'ra', 'pr'], marriage: { date: '14/02/1975', place: '' } },
    f2: { id: 'f2', partners: ['ra', 'ne'], children: ['ki', 'k2'], marriage: { date: '2005', place: '' } },
    f3: { id: 'f3', partners: ['ki'], children: ['gk'] }
  }
});

t('generations', () => {
  const g = A.generations(M2);
  assert.strictEqual(g.get('mo'), 1); assert.strictEqual(g.get('si'), 1);
  assert.strictEqual(g.get('ra'), 2); assert.strictEqual(g.get('ne'), 2); // spouse takes partner's gen
  assert.strictEqual(g.get('ki'), 3); assert.strictEqual(g.get('gk'), 4);
  assert.strictEqual(Math.min.apply(null, Array.from(g.values())), 1);
  const S = new FT.Model(); S.load(FT.SAMPLE);
  const sg = A.generations(S);
  assert.strictEqual(sg.size, S.count());
  // cycle must not hang
  const C = new FT.Model();
  C.load({ people: { a: person('a', 'A', 'X', 'M'), b: person('b', 'B', 'X', 'M') }, families: { f: { id: 'f', partners: ['a'], children: ['b'] }, g: { id: 'g', partners: ['b'], children: ['a'] } } });
  assert.strictEqual(A.generations(C).size, 2);
});

t('data counts sum to total (sample + hand model)', () => {
  [new FT.Model(), M2].forEach((M, i) => {
    if (i === 0) M.load(FT.SAMPLE);
    const d = A.data(M);
    assert.strictEqual(d.total, M.count());
    assert.strictEqual(d.gender.M.length + d.gender.F.length + d.gender.U.length, d.total);
    assert.strictEqual(d.living.living.length + d.living.deceased.length + d.living.unknown.length, d.total);
    assert(d.completeness.pct >= 0 && d.completeness.pct <= 100);
    assert.strictEqual(d.completeness.fields.map((f) => f.key).join(), 'name,surname,gender,birthDate,birthPlace,status,deathDate,photo');
  });
  const d = A.data(M2);
  assert(d.missing.find((m) => m.key === 'deathDate').ids.length === 0);
  assert(d.missing.find((m) => m.key === 'photo').ids.length === 12);
  assert(d.todo.length > 0 && d.todo[0].score >= d.todo[d.todo.length - 1].score);
  const sub = A.data(M2, ['mo', 'si']);
  assert.strictEqual(sub.total, 2);
});

t('issues', () => {
  const d = A.data(M2);
  const has = (type) => d.issues.find((i) => i.type === type);
  const cb = has('child-before-parent');
  assert(cb && cb.severity === 'high' && cb.ids.includes('an') && cb.ids.includes('mo'));
  assert(/Anil Sharma \(b\. 1948\) is recorded as born before his father Mohan Sharma \(b\. 1950\)/.test(cb.text), cb.text);
  assert(has('death-before-birth').ids[0] === 'bad');
  const dup = has('duplicate');
  assert(dup && dup.ids.includes('ra') && dup.ids.includes('dup'));
  assert(d.issues.some((i) => i.type === 'born-after-parent-death' || i.type === 'child-before-parent'));
  // Gkid born 2040 to Kid (b.2010): 30y ok. Mohan is 30 at Ravi: no issue.
  assert(!d.issues.some((i) => i.type === 'young-parent'));
});

t('branches', () => {
  const b = A.branches(M2, 'mo');
  assert.deepStrictEqual(b.rows.map((r) => r.id), ['an', 'ra', 'pr']);
  const ra = b.rows[1];
  assert.strictEqual(ra.descendants, 3); // ki, k2, gk
  assert.strictEqual(ra.family, 5);      // ra, ne, ki, k2, gk
  assert.strictEqual(ra.generations, 2);
  assert.strictEqual(ra.children, 2);
  assert.strictEqual(b.total.descendants, 6);
  assert.strictEqual(b.total.children, 3);
  assert.strictEqual(b.total.generations, 3);
  assert.strictEqual(b.rows[0].generations, 0);
});

t('person', () => {
  const p = A.person(M2, 'ra');
  assert.strictEqual(p.name, 'Ravi Sharma');
  assert.deepStrictEqual(p.parents, ['mo', 'si']);
  assert.deepStrictEqual(p.partners, ['ne']);
  assert.deepStrictEqual(p.children, ['ki', 'k2']);
  assert.deepStrictEqual(p.sons, ['ki']); assert.deepStrictEqual(p.daughters, ['k2']);
  assert.deepStrictEqual(p.siblings.sort(), ['an', 'pr']);
  assert.deepStrictEqual(p.birthOrder, { pos: 2, of: 3 });
  assert.deepStrictEqual(p.levels, [['ki', 'k2'], ['gk']]);
  assert.strictEqual(p.descendants, 3);
  assert.strictEqual(p.family.total, 5);
  assert.deepStrictEqual(p.ancestors, { count: 2, depth: 1, eldest: 'mo' });
  assert.strictEqual(p.quality.total, 5);
  const tl = p.timeline;
  assert.strictEqual(tl[0].text.indexOf('Born'), 0);
  assert(tl.some((e) => /Married Neha/.test(e.text)));
  assert(tl.some((e) => /Parent Mohan Sharma died/.test(e.text) && e.y === 2010));
  const ys = tl.map((e) => e.y).filter((y) => y !== null);
  assert.deepStrictEqual(ys, ys.slice().sort((a, b) => a - b));
  assert.strictEqual(A.person(M2, 'mo').birthOrder, null);
  // sample: works for everyone
  const S = new FT.Model(); S.load(FT.SAMPLE);
  Object.keys(S.people).forEach((id) => A.person(S, id));
});

t('tree headline on sample + M2', () => {
  const S = new FT.Model(); S.load(FT.SAMPLE);
  const tr = A.tree(S);
  assert.strictEqual(tr.headline.people, S.count());
  assert.strictEqual(tr.headline.males + tr.headline.females + tr.headline.genderUnknown, S.count());
  assert.strictEqual(tr.headline.living + tr.headline.deceased + tr.headline.unknownStatus, S.count());
  assert.strictEqual(tr.perGeneration.reduce((s, g) => s + g.ids.length, 0), S.count());
  assert(tr.records.mostDescendants && tr.records.mostDescendants.count > 0);
  assert(tr.places.birth.length > 0 && tr.places.birth[0].place);
  const t2 = A.tree(M2);
  assert.strictEqual(t2.headline.generations, 4);
  assert.strictEqual(t2.averages.childrenPerCouple.n, 2);
  assert.strictEqual(t2.averages.childrenPerCouple.value, 2.5);
  assert.strictEqual(t2.records.largestFamily.count, 3);
  assert.strictEqual(t2.names.surnames[0].name, 'Sharma');
  assert(t2.decades[0].decade <= t2.decades[t2.decades.length - 1].decade);
  assert.strictEqual(t2.places.birth[0].place, 'Jaipur');
});

t('path / pathSteps', () => {
  assert.deepStrictEqual(A.path(M2, 'pr', 'gk'), ['pr', 'mo', 'ra', 'ki', 'gk']);
  assert.deepStrictEqual(A.path(M2, 'pr', 'far'), []);
  assert.deepStrictEqual(A.path(M2, 'ra', 'ra'), ['ra']);
  const s = A.pathSteps(M2, 'ne', 'mo');
  assert.deepStrictEqual(s.map((x) => x.rel), ['husband', 'father']);
  assert.deepStrictEqual(A.pathSteps(M2, 'mo', 'ki').map((x) => x.rel), ['son', 'son']);
  assert.deepStrictEqual(A.pathSteps(M2, 'ra', 'k2').map((x) => x.rel), ['daughter']);
});

t('calendar incl. year wrap', () => {
  const ev = A.calendar(M2, new Date(2026, 11, 20), 30); // 20 Dec 2026 -> 19 Jan 2027
  const b = ev.find((e) => e.kind === 'birthday' && e.id === 'pr');
  assert(b, 'birthday across year boundary');
  assert.strictEqual(b.date.getFullYear(), 2027); assert.strictEqual(b.date.getMonth(), 0); assert.strictEqual(b.date.getDate(), 5);
  assert.strictEqual(b.years, 45);
  const d = ev.find((e) => e.kind === 'death anniversary' && e.id === 'mo');
  assert(d && d.years === 17);
  assert(!ev.some((e) => e.kind === 'birthday' && e.id === 'mo'), 'no birthday for deceased');
  const w = A.calendar(M2, new Date(2026, 1, 1), 30).find((e) => e.kind === 'wedding anniversary');
  assert(w && w.years === 51 && w.ids.length === 2 && w.date.getDate() === 14);
  for (let i = 1; i < ev.length; i++) assert(ev[i - 1].date <= ev[i].date);
});

t('performance 2000 people', () => {
  const people = {}, families = {};
  let k = 0; const gen = [[]];
  for (let i = 0; i < 20; i++) { const id = 'r' + i; people[id] = person(id, 'R' + i, 'S', i % 2 ? 'F' : 'M', '1900'); gen[0].push(id); }
  let cur = gen[0];
  for (let g = 0; g < 4; g++) {
    const next = [];
    cur.forEach((id, i) => {
      if (i % 2) return;
      const par = cur[i + 1] || id;
      const kids = [];
      for (let j = 0; j < 4 && k < 1900; j++) { const cid = 'c' + (k++); people[cid] = person(cid, 'C' + k, 'S', j % 2 ? 'F' : 'M', String(1925 + g * 25)); kids.push(cid); next.push(cid); }
      families['f' + k] = { id: 'f' + k, partners: par === id ? [id] : [id, par], children: kids };
    });
    cur = next;
  }
  const P = new FT.Model(); P.load({ people, families });
  const t0 = Date.now();
  A.data(P); A.tree(P); A.person(P, 'r0'); A.generations(P);
  assert(Date.now() - t0 < 4000, 'too slow: ' + (Date.now() - t0));
});

console.log(n + ' analytics tests passed');
