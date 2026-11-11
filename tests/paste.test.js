global.window = global;
require('../src/paste.js');
require('../src/sample.js');

var FT = global.FT, pn = FT.Paste.parseName, parse = FT.Paste.parse;
var pass = 0, fail = 0;
function eq(name, got, exp) {
  var ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.log('FAIL: ' + name + '\n  got: ' + JSON.stringify(got) + '\n  exp: ' + JSON.stringify(exp)); }
}

// parseName
var a = pn('Ramlal Sharma');
eq('basic split', [a.given, a.surname, a.gender, a.living], ['Ramlal', 'Sharma', 'U', null]);
eq('single token', [pn('Rajesh').given, pn('Rajesh').surname], ['Rajesh', '']);
eq('multi given', [pn('Anil Kumar Sharma').given, pn('Anil Kumar Sharma').surname], ['Anil Kumar', 'Sharma']);
eq('bullet dash', pn('- Priya Sharma (F)').given, 'Priya');
eq('bullet number', pn('1. Priya Sharma').given, 'Priya');
eq('bullet num paren', pn('2) Priya').given, 'Priya');
eq('bullet letter', pn('a) Priya').given, 'Priya');
eq('bullet unicode', pn('• Priya').given, 'Priya');
eq('gender (F)', pn('Priya (F)').gender, 'F');
eq('gender [m] removes marker', [pn('Raju [m]').gender, pn('Raju [m]').given], ['M', 'Raju']);
eq('gender symbol', [pn('Sita ♀').gender, pn('Sita ♀').given], ['F', 'Sita']);
var b = pn('Ramlal Sharma (1920-1995)');
eq('year range', [b.birth.date, b.death.date, b.living, b.surname], ['1920', '1995', false, 'Sharma']);
var c = pn('Suresh (1945 - )');
eq('open range', [c.birth.date, c.death.date, c.living], ['1945', '', null]);
eq('(b. 1950)', pn('Anil (b. 1950)').birth.date, '1950');
var d = pn('Anil (d. 2001)');
eq('(d. 2001)', [d.death.date, d.living], ['2001', false]);
var e = pn('Kamla (12 Mar 1950 - 3 Jan 2001)');
eq('full date range', [e.birth.date, e.death.date], ['12 Mar 1950', '3 Jan 2001']);
var f = pn('Mohan b.1950 d.2001');
eq('bare b./d.', [f.given, f.birth.date, f.death.date, f.living], ['Mohan', '1950', '2001', false]);
eq('late prefix', [pn('Late Ramlal Sharma').living, pn('Late Ramlal Sharma').given], [false, 'Ramlal']);
eq('swargiya prefix', pn('Swargiya Ramlal').living, false);
eq('(late) marker', pn('Ramlal Sharma (late)').living, false);
var g = pn('Rajesh "Raju" Sharma');
eq('nickname', [g.nick, g.given, g.surname], ['Raju', 'Rajesh', 'Sharma']);
var h = pn('Smt. Kamla Devi');
eq('Smt hint', [h.gender, h.given, h.surname], ['F', 'Kamla', 'Devi']);
eq('Shri hint', pn('Shri Ramlal Sharma').gender, 'M');
eq('explicit gender beats hint', pn('Mrs Ravi (M)').gender, 'M');
eq('Dr kept', pn('Dr Anil Sharma').given, 'Dr Anil');
eq('place', pn('Ravi (b. 1950, Mumbai)').birth.place, 'Mumbai');

// parse
var l1 = parse('Ravi\nSita\r\nGita\n\n');
eq('list kind', [l1.kind, l1.roots.length], ['list', 3]);
var l2 = parse('Ravi, Sita, Gita');
eq('comma list', [l2.kind, l2.roots.map(function (r) { return r.person.given; })], ['list', ['Ravi', 'Sita', 'Gita']]);
var l3 = parse('Ravi (b. 1950, Mumbai)');
eq('paren comma not split', [l3.roots.length, l3.roots[0].person.birth.place], [1, 'Mumbai']);

var o = parse('Ramlal Sharma (1920-1995) + Kamla Devi\n    Suresh Sharma + Meena\n        Rajesh\n        Priya (F)\n    Mahesh Sharma');
eq('outline kind', o.kind, 'outline');
eq('outline root partner', [o.roots.length, o.roots[0].partners[0].given], [1, 'Kamla']);
eq('outline children', o.roots[0].children.map(function (n) { return n.person.given; }), ['Suresh', 'Mahesh']);
eq('outline grandchildren', o.roots[0].children[0].children.map(function (n) { return n.person.given; }), ['Rajesh', 'Priya']);
eq('outline partner of child', o.roots[0].children[0].partners[0].given, 'Meena');

var o2 = parse('A & B\n\tC\n\tD married to E');
eq('tabs and & and married to', [o2.roots[0].partners[0].given, o2.roots[0].children[1].partners[0].given], ['B', 'E']);
var o3 = parse('A + B + C\n  K');
eq('two partners', o3.roots[0].partners.map(function (p) { return p.given; }), ['B', 'C']);
var o4 = parse('Ramlal\n  Spouse: Kamla\n  Wife: Rani\n  Suresh');
eq('Spouse: lines', [o4.roots[0].partners.map(function (p) { return p.given; }), o4.roots[0].children.length], [['Kamla', 'Rani'], 1]);
var o5 = parse('A\n    B\n  C\n      D\nE');
eq('inconsistent indent', [o5.roots.map(function (r) { return r.person.given; }), o5.roots[0].children.map(function (r) { return r.person.given; })], [['A', 'E'], ['B', 'C']]);
eq('empty', parse('  \n').roots.length, 0);

// SAMPLE validation
var S = FT.SAMPLE, ids = Object.keys(S.people), fids = Object.keys(S.families);
eq('sample top fields', [S.version, S.meta.title, typeof S.settings], [1, 'The Sharma Family (example)', 'object']);
eq('sample ~30 people', ids.length, 30);
var pf = ['id', 'given', 'surname', 'nick', 'gender', 'birth', 'death', 'living', 'photo', 'notes', 'tags', 'color'];
eq('people have all fields', ids.filter(function (i) {
  var p = S.people[i];
  return p.id !== i || !pf.every(function (k) { return k in p; }) || !p.birth || !('date' in p.birth) || !('place' in p.birth) ||
    !('date' in p.death) || !('place' in p.death) || !Array.isArray(p.tags) || ['M', 'F', 'U'].indexOf(p.gender) < 0;
}), []);
var ff = ['id', 'partners', 'children', 'childRel', 'status', 'marriage'];
eq('families have all fields', fids.filter(function (i) {
  var f = S.families[i]; return f.id !== i || !ff.every(function (k) { return k in f; });
}), []);
var bad = [];
fids.forEach(function (i) {
  var f = S.families[i];
  f.partners.concat(f.children).forEach(function (p) { if (!S.people[p]) bad.push(i + ':' + p); });
  Object.keys(f.childRel).forEach(function (p) { if (f.children.indexOf(p) < 0) bad.push(i + ' relkey ' + p); });
});
eq('all references exist', bad, []);
eq('five children of Ramlal', S.families.f01.children.length, 5);
eq('adopted child present', S.families.f06.childRel.p20, 'adopted');
var parentsOf = {};
fids.forEach(function (i) { S.families[i].children.forEach(function (c) { (parentsOf[c] = parentsOf[c] || []).push(i); }); });
eq('each child in exactly one family', Object.keys(parentsOf).filter(function (c) { return parentsOf[c].length !== 1; }), []);
var mahesh = fids.filter(function (i) { return S.families[i].partners.indexOf('p04') >= 0; });
eq('second marriage (2 families)', mahesh.length, 2);
eq('married-in spouse has parents', parentsOf.p23 && parentsOf.p23.length, 1);
eq('deceased have death dates', ids.filter(function (i) { return S.people[i].living === false; }).every(function (i) { return S.people[i].death.date; }), true);

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
