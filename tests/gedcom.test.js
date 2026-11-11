// Run: node tests/gedcom.test.js
global.window = global;
require('../src/gedcom.js');
const assert = require('assert');
const G = window.FT.Gedcom;

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok - ' + name); }

const long = 'x'.repeat(450);
const SAMPLE = [
  '\uFEFF0 HEAD',
  '1 SOUR Test',
  '1 FILE C:\\trees\\Sharma.ged',
  '1 GEDC',
  '2 VERS 5.5.1',
  '0 @I1@ INDI',
  '1 NAME Ramlal /Sharma/',
  '2 NICK Ramu',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 12 MAR 1920',
  '2 PLAC Vadodara, India',
  '1 DEAT',
  '2 DATE 1995',
  '1 NOTE First line',
  '2 CONT Second line',
  '2 CONC  continued',
  '1 OBJE',
  '2 FILE photo.jpg',
  '1 SOUR @S1@',
  '1 FAMS @F1@',
  '1 FAMS @F2@',
  '0 @I2@ INDI',
  '1 NAME Kamla /Devi/',
  '1 SEX F',
  '1 FAMS @F1@',
  '0 @I3@ INDI',
  '1 NAME Sita /Rao/',
  '1 SEX F',
  '1 FAMS @F2@',
  '0 @I4@ INDI',
  '1 NAME Suresh /Sharma/',
  '2 GIVN Suresh Kumar',
  '1 SEX M',
  '1 FAMC @F1@',
  '0 @I5@ INDI',
  '1 NAME Mahesh /Sharma/',
  '1 SEX X',
  '1 DEAT Y',
  '1 NOTE @N1@',
  '1 FAMC @F1@',
  '2 PEDI adopted',
  '0 @I6@ INDI',
  '1 NAME Anil /Sharma/',
  '1 SEX M',
  '1 FAMC @F2@',
  '0 @N1@ NOTE Pointer note',
  '1 CONT line two',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 WIFE @I2@',
  '1 CHIL @I4@',
  '1 CHIL @I5@',
  '1 MARR',
  '2 DATE 1945',
  '2 PLAC Surat',
  '0 @F2@ FAM',
  '  1 HUSB @I1@',
  '1 WIFE @I3@',
  '1 CHIL @I6@',
  '1 DIV Y',
  '0 @F3@ FAM',
  '1 WIFE @I3@',
  '1 CHIL @I6@',
  '0 TRLR'
].join('\r\n');

function byGiven(d, g) { return Object.values(d.people).find(p => p.given === g); }

test('parse people', () => {
  const d = G.parse(SAMPLE);
  assert.strictEqual(d.version, 1);
  assert.strictEqual(d.meta.title, 'Sharma');
  assert.strictEqual(Object.keys(d.people).length, 6);
  const r = byGiven(d, 'Ramlal');
  assert.strictEqual(r.surname, 'Sharma');
  assert.strictEqual(r.nick, 'Ramu');
  assert.strictEqual(r.gender, 'M');
  assert.deepStrictEqual(r.birth, { date: '12 MAR 1920', place: 'Vadodara, India' });
  assert.strictEqual(r.death.date, '1995');
  assert.strictEqual(r.living, null);
  assert.strictEqual(r.notes, 'First line\nSecond line continued'); // CONT + CONC
  assert.match(r.id, /^p[0-9a-z]{8}$/);
  assert.strictEqual(byGiven(d, 'Suresh Kumar').surname, 'Sharma'); // GIVN override
  const m = byGiven(d, 'Mahesh');
  assert.strictEqual(m.gender, 'U');
  assert.strictEqual(m.living, false); // DEAT without date
  assert.strictEqual(m.notes, 'Pointer note\nline two'); // pointer note
  assert.deepStrictEqual(r.tags, []);
  assert.strictEqual(r.photo, '');
});

test('parse families: multiple marriages, adoption, missing HUSB', () => {
  const d = G.parse(SAMPLE);
  const fams = Object.values(d.families);
  assert.strictEqual(fams.length, 3);
  const id = g => byGiven(d, g).id;
  const f1 = fams.find(f => f.partners.length === 2 && f.status === 'married');
  assert.deepStrictEqual(f1.partners, [id('Ramlal'), id('Kamla')]);
  assert.deepStrictEqual(f1.children, [id('Suresh Kumar'), id('Mahesh')]);
  assert.strictEqual(f1.childRel[id('Suresh Kumar')], 'birth');
  assert.strictEqual(f1.childRel[id('Mahesh')], 'adopted');
  assert.deepStrictEqual(f1.marriage, { date: '1945', place: 'Surat' });
  const f2 = fams.find(f => f.status === 'divorced');
  assert.deepStrictEqual(f2.partners, [id('Ramlal'), id('Sita')]);
  const f3 = fams.find(f => f.partners.length === 1);
  assert.deepStrictEqual(f3.partners, [id('Sita')]);
  assert.strictEqual(f3.status, '');
});

// Compare two data sets structurally, ignoring generated ids.
function summarize(d) {
  const name = id => { const p = d.people[id]; return p.given + '|' + p.surname; };
  const people = Object.values(d.people).map(p =>
    [p.given, p.surname, p.nick, p.gender, p.birth.date, p.birth.place, p.death.date, p.death.place, p.living, p.notes].join('~')
  ).sort();
  const fams = Object.values(d.families).map(f => JSON.stringify({
    partners: f.partners.map(name).sort(),
    children: f.children.map(name),
    rel: f.children.map(c => f.childRel[c]),
    status: f.status, marriage: f.marriage
  })).sort();
  return { people, fams };
}

test('round trip preserves everything', () => {
  const d1 = G.parse(SAMPLE);
  // add a long, multi-line note plus special statuses
  byGiven(d1, 'Anil').notes = 'Line A\n\nLine C  indented ' + long + '\nlast';
  Object.values(d1.families).find(f => f.partners.length === 1).status = 'widowed';
  const text = G.write(d1);
  const d2 = G.parse(text);
  assert.deepStrictEqual(summarize(d2), summarize(d1));
  assert.strictEqual(byGiven(d2, 'Anil').notes, byGiven(d1, 'Anil').notes);
});

test('written output is valid GEDCOM', () => {
  const text = G.write(G.parse(SAMPLE));
  const lines = text.trim().split('\n');
  assert.strictEqual(lines[0], '0 HEAD');
  assert.strictEqual(lines[lines.length - 1], '0 TRLR');
  assert.ok(text.includes('2 VERS 5.5.1') && text.includes('2 FORM LINEAGE-LINKED') && text.includes('1 CHAR UTF-8'));
  assert.ok(text.includes('2 PEDI adopted'));
  assert.ok(lines.every(l => l.length <= 215)); // value chunks capped at 200
  // FAMS/FAMC links exist in both directions
  const famsCount = lines.filter(l => l.startsWith('1 FAMS')).length;
  const famcCount = lines.filter(l => l.startsWith('1 FAMC')).length;
  assert.strictEqual(famsCount, 5); // Ramlal x2, Kamla, Sita x2
  assert.strictEqual(famcCount, 4); // Suresh, Mahesh, Anil x2
});

test('writer partner order uses gender', () => {
  const d = G.parse(SAMPLE);
  const f = Object.values(d.families).find(f => f.partners.length === 2 && f.status === 'married');
  f.partners.reverse(); // wife first
  const text = G.write(d);
  const husb = text.indexOf('1 HUSB'), wife = text.indexOf('1 WIFE');
  assert.ok(husb > 0 && husb < wife);
  const d2 = G.parse(text);
  const f2 = Object.values(d2.families).find(x => x.status === 'married');
  assert.strictEqual(d2.people[f2.partners[0]].given, 'Ramlal');
});

test('tolerates LF, empty and junk input', () => {
  const d = G.parse('0 HEAD\n0 @I1@ INDI\n1 NAME Solo\n0 TRLR');
  assert.strictEqual(Object.values(d.people)[0].given, 'Solo');
  assert.strictEqual(d.meta.title, 'Imported tree');
  assert.deepStrictEqual(Object.keys(G.parse('').people), []);
  assert.strictEqual(G.parse(G.write({ people: {}, families: {} })).version, 1);
});

console.log('\n' + passed + ' tests passed');
