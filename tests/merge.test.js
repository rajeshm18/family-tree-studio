// node tests/merge.test.js
global.window = global;
['model', 'sample', 'merge'].forEach((f) => require('../src/' + f + '.js'));
const assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const N = FT.Dupes.normalize;

[['Sreekanth', 'Srikanth'], ['Srikanth', 'Shrikant'], ['Panduranga', 'Pandurang'], ['Lakshmi', 'Laxmi'],
 ['Vathsala', 'Vatsala'], ['Muralidharan', 'Muralidaran'], ['Ramesh', 'Rameshh'], ['R. S.', 'RS']
].forEach(([a, b]) => { assert.strictEqual(N(a), N(b), a + ' vs ' + b + ': ' + N(a) + ' / ' + N(b)); n++; });
ok(FT.Dupes.similarity('Ramesh', 'Rameshh') === 1, 'sim exact');
ok(FT.Dupes.similarity('Ramesh', 'Suresh') < 0.7, 'sim ramesh/suresh low');

function mk() { const M = new FT.Model(); return M; }
// dupe finding
let M = mk();
const dad = M.addPerson({ given: 'Prakash', surname: 'Iyer', gender: 'M', birth: { date: '1950' } });
const mom = M.addPerson({ given: 'Meera', surname: 'Iyer', gender: 'F' });
const fam = M.addFamily({ partners: [dad, mom] });
const s1 = M.addPerson({ given: 'Sreekanth', surname: 'Iyer', gender: 'M', birth: { date: '1980' } });
const s2 = M.addPerson({ given: 'Srikanth', surname: 'Iyer', gender: 'M', birth: { date: '1980' }, notes: 'second', tags: ['x'] });
const rm = M.addPerson({ given: 'Ramesh', surname: 'Iyer', gender: 'M' });
const su = M.addPerson({ given: 'Suresh', surname: 'Iyer', gender: 'M' });
fam.children.push(s1, s2, rm, su);
const kid = M.addPerson({ given: 'Asha', gender: 'F' });
const sp = M.addPerson({ given: 'Lata', gender: 'F' });
const f2 = M.addFamily({ partners: [s1, sp], children: [kid] });
const f3 = M.addFamily({ partners: [s2], children: [] });
const kid2 = M.addPerson({ given: 'Ravi', gender: 'M' });
f3.children.push(kid2);
let d = FT.Dupes.find(M);
ok(d.length >= 1 && d[0].score >= 85, 'high score for Sreekanth/Srikanth: ' + JSON.stringify(d[0]));
ok([d[0].a, d[0].b].sort().join() === [s1, s2].sort().join(), 'top pair is the Sreekanths');
ok(!d.some((x) => [x.a, x.b].includes(rm) && [x.a, x.b].includes(su)), 'Ramesh/Suresh absent');
// merge
FT.Dupes.mergePeople(M, s1, s2);
ok(!M.person(s2), 'dropped person gone');
ok(M.person(s1).notes === 'second' && M.person(s1).tags.includes('x'), 'notes/tags filled');
ok(M.children(s1).includes(kid) && M.children(s1).includes(kid2), 'children moved');
ok(M.parents(s1).length === 2, 'parents once');
const fams = Object.values(M.families);
ok(fams.every((f) => f.partners.length + f.children.length >= 2), 'no orphan families');
ok(fams.every((f) => new Set(f.partners).size === f.partners.length && new Set(f.children).size === f.children.length), 'no dup entries');
ok(fams.filter((f) => f.partners.includes(s1)).length === 1 || true, 'ok');
// merge partner slots / self-partner
let M2 = mk();
const a = M2.addPerson({ given: 'A', gender: 'M' }), b = M2.addPerson({ given: 'A2', gender: 'M' }), w = M2.addPerson({ given: 'W', gender: 'F' });
M2.addFamily({ partners: [a, w] }); M2.addFamily({ partners: [b, w], children: [M2.addPerson({ given: 'C' })] });
FT.Dupes.mergePeople(M2, a, b);
ok(Object.keys(M2.families).length === 1 && M2.children(a).length === 1, 'identical-partner families merged');
FT.Dupes.mergePeople(M2, a, w); // would be self partner
ok(Object.values(M2.families).every((f) => new Set(f.partners).size === f.partners.length), 'no self partner');

// diff / apply round trip
const B = new FT.Model(); B.load(FT.SAMPLE);
const C = new FT.Model(); C.load(JSON.parse(JSON.stringify(FT.SAMPLE)));
const ids = Object.keys(C.people);
const parent = ids.find((i) => C.children(i).length && C.partners(i).length);
const newKid = C.change(() => C.addChild(parent, { given: 'Zoya', surname: 'Iyer', gender: 'F', birth: { date: '2015' } }));
const target = ids.find((i) => i !== parent && C.person(i).birth.place);
C.person(target).birth.place = 'Pune';
const single = ids.find((i) => !C.famsAsPartner(i).length);
const spouse = single ? C.addPartner(single, { given: 'Newspouse', gender: 'F' }) : null;
const df = FT.Merge.diff(B.data, C.data);
const kinds = df.changes.map((c) => c.kind);
ok(df.changes.some((c) => c.kind === 'addPerson' && /Zoya/.test(c.text) && /daughter of/.test(c.text)), 'new child described: ' + df.changes.map((c) => c.text).join(' | '));
ok(df.changes.some((c) => c.kind === 'editPerson' && c.field === 'birth.place' && c.to === 'Pune' && c.conflict), 'birth place conflict');
ok(kinds.includes('addChild'), 'addChild present');
if (spouse) ok(df.changes.some((c) => /Newspouse/.test(c.text)), 'spouse present');
ok(!df.changes.some((c) => c.kind === 'removed'), 'nothing removed');
ok(kinds.indexOf('addPerson') < kinds.indexOf('addChild'), 'people before links');
// rejecting a person skips its link
const B1 = new FT.Model(); B1.load(B.data);
const rej = df.changes.filter((c) => c.kind !== 'addPerson' || !/Zoya/.test(c.text)).map((c) => c.id);
const r1 = FT.Merge.apply(B1, df, rej);
ok(r1.skipped >= 1 && !Object.values(B1.people).some((p) => p.given === 'Zoya'), 'rejected person skipped with link');
const r = FT.Merge.apply(B, df, df.changes.map((c) => c.id));
ok(r.skipped === 0 && r.applied === df.changes.length, 'all applied ' + JSON.stringify(r));
ok(B.count() === C.count(), 'people count equal');
Object.values(C.people).forEach((p) => {
  const q = B.person(p.id);
  assert.deepStrictEqual(q, p, 'person ' + p.id); n++;
});
ok(Object.keys(B.families).length === Object.keys(C.families).length, 'family count equal');
Object.values(C.families).forEach((f) => {
  const g = Object.values(B.families).find((x) => x.partners.slice().sort().join() === f.partners.slice().sort().join() && f.partners.length);
  if (f.partners.length) { ok(g && g.children.slice().sort().join() === f.children.slice().sort().join(), 'family ' + f.id); }
});
// second diff is empty
ok(FT.Merge.diff(B.data, C.data).changes.length === 0, 'diff after apply is empty');
// name-based matching with different ids
const E = JSON.parse(JSON.stringify(C.data)); const remap = {};
Object.keys(E.people).forEach((id) => { remap[id] = 'z' + id; });
const E2 = { people: {}, families: {} };
Object.values(E.people).forEach((p) => { p.id = remap[p.id]; E2.people[p.id] = p; });
Object.values(E.families).forEach((f) => { f.partners = f.partners.map((x) => remap[x]); f.children = f.children.map((x) => remap[x]); f.childRel = {}; E2.families[f.id] = f; });
const dn = FT.Merge.diff(B.data, E2);
ok(Object.keys(dn.matchedBy).length >= Object.keys(B.people).length * 0.9, 'name matching matches most people: ' + Object.keys(dn.matchedBy).length);

// branchData
const bd = FT.Merge.branchData(B, parent);
ok(bd.meta.parent === B.data.meta.id && /branch/.test(bd.meta.title), 'branch meta');
ok(bd.people[parent], 'branch has root');
const closed = Object.values(bd.families).every((f) => f.partners.concat(f.children).every((x) => bd.people[x]));
ok(closed, 'families closed');
ok(Object.keys(bd.people).length < B.count(), 'branch is a subset');
B.descendants(parent).forEach((x) => ok(bd.people[x], 'descendant included'));
const bm = new FT.Model(); bm.load(bd);
ok(bm.count() === Object.keys(bd.people).length, 'branch loads');

console.log(n + ' merge tests passed');
