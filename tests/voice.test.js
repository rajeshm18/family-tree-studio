global.window = global;
require('../src/model.js');
require('../src/paste.js');
require('../src/sample.js');
require('../src/voice.js');

var FT = global.FT;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else { fail++; console.log('FAIL: ' + name + (extra ? '\n  ' + extra : '')); }
}
function eq(name, got, exp) { ok(name, JSON.stringify(got) === JSON.stringify(exp), 'got: ' + JSON.stringify(got) + '\n  exp: ' + JSON.stringify(exp)); }

function fresh() { var m = new FT.Model(); m.load(JSON.parse(JSON.stringify(FT.SAMPLE))); return m; }
function say(m, text, ctx) { var r; m.change(function () { r = FT.Voice.run(m, text, ctx || {}); }); return r; }
function byName(m, name) { return Object.keys(m.people).filter(function (id) { return m.displayName(id) === name; }); }
function one(m, name) { var a = byName(m, name); return a.length === 1 ? a[0] : null; }
function names(m, ids) { return ids.map(function (i) { return m.displayName(i); }); }
function allOk(r) { return r.msgs.every(function (x) { return x.ok; }); }
function parentOf(m, id, g) { return m.parents(id).filter(function (p) { return m.person(p).gender === g; })[0]; }

var m, r, n, rl = 'p01';

// 1. father + mother with split name
m = fresh(); n = m.count();
r = say(m, "Ram Lal Sharma's father is Bhimrao and mother is Sita Rao");
eq('1 count', m.count(), n + 2);
eq('1 father', m.displayName(parentOf(m, rl, 'M')), 'Bhimrao Sharma');
eq('1 mother', m.displayName(parentOf(m, rl, 'F')), 'Sita Rao');
ok('1 msg text', r.msgs[0].text === 'Added father Bhimrao Sharma for Ramlal Sharma', JSON.stringify(r.msgs));
eq('1 focus', r.focusId, rl);
eq('1 no Ram Lal duplicate', byName(m, 'Ram Lal Sharma').length, 0);
eq('1 lastId is last created', m.displayName(r.lastId), 'Sita Rao');

// 2. father's name / mother's name
m = fresh(); n = m.count();
r = say(m, "Ram Lal Sharma has father's name Bimrao and mother's name Sita Rao");
eq('2 count', m.count(), n + 2);
eq('2 father', m.displayName(parentOf(m, rl, 'M')), 'Bimrao Sharma');
eq('2 mother', m.displayName(parentOf(m, rl, 'F')), 'Sita Rao');

// 3. dropped apostrophe
m = fresh(); n = m.count();
r = say(m, 'Ramlal Sharmas father is Bhimrao');
eq('3 count', m.count(), n + 1);
eq('3 father', m.displayName(parentOf(m, rl, 'M')), 'Bhimrao Sharma');

// 4. keyword first
m = fresh(); n = m.count();
r = say(m, 'father of Ramlal Sharma is Bhimrao');
eq('4 father', m.displayName(parentOf(m, rl, 'M')), 'Bhimrao Sharma');
eq('4 count', m.count(), n + 1);

// 5. couple with two daughters (plain, colon, named)
['Mahesh Sharma and Lata Sharma have two daughters Aditi Sharma and Yukti Sharma',
 'Mahesh Sharma and Lata Sharma have two daughters: Aditi Sharma and Yukti Sharma',
 'Mahesh Sharma and Lata Sharma have two daughters named Aditi Sharma and Yukti Sharma'].forEach(function (t, i) {
  m = fresh(); n = m.count();
  r = say(m, t);
  var f = m.families.f03; // Mahesh + Lata
  eq('5.' + i + ' count', m.count(), n + 2);
  eq('5.' + i + ' in Mahesh+Lata family', names(m, f.children), ['Anil Sharma', 'Aditi Sharma', 'Yukti Sharma']);
  eq('5.' + i + ' genders', [m.person(f.children[1]).gender, m.person(f.children[2]).gender], ['F', 'F']);
});

// 6. sons list inherit surname
m = fresh(); n = m.count();
r = say(m, "Mahesh Sharma's sons are Amit, Sumit and Rohit");
eq('6 count', m.count(), n + 3);
ok('6 names', ['Amit Sharma', 'Sumit Sharma', 'Rohit Sharma'].every(function (x) { return one(m, x); }));
ok('6 sons are male children of Mahesh', m.children('p04').indexOf(one(m, 'Sumit Sharma')) >= 0 && m.person(one(m, 'Amit Sharma')).gender === 'M');
// same sentence again: no duplicates
r = say(m, "Mahesh Sharma's sons are Amit, Sumit and Rohit");
eq('6 idempotent', m.count(), n + 3);

// 7. no subject
m = fresh(); n = m.count();
r = say(m, 'father is Bhimrao and mother is Sita', {});
ok('7 fails', r.msgs[0].ok === false && /Click a person first or say whose father/.test(r.msgs[0].text), JSON.stringify(r.msgs));
eq('7 no change', m.count(), n);
r = say(m, 'father is Bhimrao and mother is Sita', { selectedId: 'p10' });
eq('7b count', m.count(), n); // Priya already has parents -> renames/keeps
m = fresh(); n = m.count();
r = say(m, 'father is Bhimrao and mother is Sita', { selectedId: 'p01' });
eq('7c count', m.count(), n + 2);
eq('7c father', m.displayName(parentOf(m, 'p01', 'M')), 'Bhimrao Sharma');

// 8. pronoun, existing wife
m = fresh(); n = m.count();
r = say(m, 'his wife is Meena', { lastId: 'p03' });
eq('8 no dup', m.count(), n);
ok('8 says already', /already/.test(r.msgs[0].text), JSON.stringify(r.msgs));
// 8b new wife
m = fresh(); n = m.count();
r = say(m, 'his wife is Neha', { lastId: 'p24' });
eq('8b count', m.count(), n + 1);
var nw = m.partners('p24')[0];
eq('8b wife', [m.displayName(nw), m.person(nw).gender], ['Neha', 'F']);
// 8c pronoun without context
r = say(fresh(), 'his wife is Meena', {});
ok('8c fails', r.msgs[0].ok === false);

// 9. create both, couple, child
m = fresh(); n = m.count();
r = say(m, 'Arun Kumar and Kavita have a son named Rohit');
eq('9 count', m.count(), n + 3);
var ar = one(m, 'Arun Kumar'), kv = one(m, 'Kavita'), ro = one(m, 'Rohit Kumar');
ok('9 people', ar && kv && ro);
ok('9 partners', m.partners(ar).indexOf(kv) >= 0);
ok('9 child in couple family', m.parents(ro).sort().join() === [ar, kv].sort().join() && m.person(ro).gender === 'M');
ok('9 created msg', r.msgs.some(function (x) { return x.text === 'Created Arun Kumar'; }), JSON.stringify(r.msgs));

// 10. full correction flow
m = fresh(); n = m.count();
r = say(m, "Ram Lal Sharma has father's name Bimrao and mother's name Sita Rao");
eq('10 count after add', m.count(), n + 2);
r = say(m, 'it is not Sita Rao, it is Sita Sharma', { lastId: r.lastId });
eq('10 mother renamed', m.displayName(parentOf(m, rl, 'F')), 'Sita Sharma');
eq('10 no extra people', m.count(), n + 2);
ok('10 msg', /Renamed Sita Rao → Sita Sharma/.test(r.msgs[0].text), JSON.stringify(r.msgs));
ok('10 no Sita Rao left', byName(m, 'Sita Rao').length === 0);
// not ... but ...
m = fresh();
say(m, "Ramlal Sharma's mother is Sita Rao");
r = say(m, 'not Sita Rao but Sita Sharma');
eq('10b', m.displayName(parentOf(m, rl, 'F')), 'Sita Sharma');

// 11. "no, it's X" renames lastId
m = fresh();
r = say(m, "Ramlal Sharma's father is Bimrao and mother is Sita Rao");
r = say(m, "no, it's Sita Sharma", { lastId: r.lastId });
eq('11 rename last', m.displayName(parentOf(m, rl, 'F')), 'Sita Sharma');
r = say(m, "sorry, Sunita", { lastId: r.lastId });
eq('11b lone first name keeps surname', m.displayName(parentOf(m, rl, 'F')), 'Sunita Sharma');

// 12. change / rename / replace / should be / correct
m = fresh();
say(m, 'change Meena Sharma to Meena Verma');
ok('12 change', one(m, 'Meena Verma') === 'p08');
say(m, 'rename Kavya Iyer to Kavya Rao');
ok('12 rename', one(m, 'Kavya Rao') === 'p22');
say(m, 'replace Anil Sharma with Anil Kumar');
ok('12 replace', one(m, 'Anil Kumar') === 'p12');
say(m, 'Ishaan Sharma should be Ishan Sharma');
ok('12 should be', one(m, 'Ishan Sharma') === 'p20');
say(m, 'correct Neha Sharma to Neha Gupta');
ok('12 correct', one(m, 'Neha Gupta') === 'p14');
r = say(m, 'rename Nobody Here to Someone Else');
ok('12 not found', r.msgs[0].ok === false);

// 13. rename existing mother via relation sentence
m = fresh(); n = m.count();
r = say(m, "Rajesh Sharma's mother is Meena Verma");
eq('13 count', m.count(), n);
eq('13 renamed', m.displayName('p08'), 'Meena Verma');
ok('13 msg', r.msgs[0].text === 'Changed mother Meena Sharma → Meena Verma', JSON.stringify(r.msgs));
r = say(m, "Rajesh Sharma's mother is Meena Verma");
ok('13 repeat = already', /already/.test(r.msgs[0].text) && m.count() === n);

// 14. same sentence twice -> no duplicates
m = fresh(); n = m.count();
say(m, "Ram Lal Sharma's father is Bhimrao and mother is Sita Rao");
var n1 = m.count();
say(m, "Ram Lal Sharma's father is Bhimrao and mother is Sita Rao");
eq('14 no dup', m.count(), n1);
say(m, 'Arun Kumar and Kavita have a son named Rohit');
var n2 = m.count();
say(m, 'Arun Kumar and Kavita have a son named Rohit');
eq('14b no dup couple', m.count(), n2);

// 15. pronoun follow-up in one utterance
m = fresh(); n = m.count();
r = say(m, 'Arun Kumar has a son Rohit. His wife is Sita');
eq('15 count', m.count(), n + 3);
ro = one(m, 'Rohit Kumar');
eq('15 wife of Rohit', names(m, m.partners(ro)), ['Sita']);
r = say(m, 'she was born in 1990', { lastId: m.partners(ro)[0] });
eq('15b she', m.person(m.partners(ro)[0]).birth.date, '1990');
// "then"
m = fresh(); n = m.count();
r = say(m, "Ramlal Sharma's father is Bhimrao then Bhimrao Sharma's father is Gopal");
eq('15c then', m.count(), n + 2);
eq('15c chain', m.displayName(parentOf(m, one(m, 'Bhimrao Sharma'), 'M')), 'Gopal Sharma');

// 16. unknown sentence
m = fresh(); n = m.count();
r = say(m, 'the weather is nice today');
ok('16 unknown', r.msgs.length === 1 && r.msgs[0].ok === false && /^Sorry, I didn't understand: /.test(r.msgs[0].text), JSON.stringify(r.msgs));
eq('16 no change', m.count(), n);
eq('16 special', r.special, null);

// 17. undo / redo specials
['undo', 'undo that', 'undo last', 'go back', 'Undo.'].forEach(function (t) {
  m = fresh(); n = m.count();
  r = say(m, t);
  ok('17 ' + t, r.special === 'undo' && m.count() === n);
});
r = say(fresh(), 'redo');
eq('17 redo', r.special, 'redo');

// 18. delete / select
m = fresh(); n = m.count();
r = say(m, 'delete Kavya Iyer');
ok('18 deleted', !m.person('p22') && m.count() === n - 1);
r = say(m, 'select Ramlal');
eq('18 select', r.focusId, 'p01');
r = say(m, 'show Mahesh Sharma');
eq('18 show', r.focusId, 'p04');
r = say(m, 'go to Nobodyatall Xyz');
ok('18 missing', r.msgs[0].ok === false && r.focusId === null);

// 19. birth / death / living / gender
m = fresh();
r = say(m, 'Rohan Sharma born on 12 March 1982 in Pune');
eq('19 born', [m.person('p19').birth.date, m.person('p19').birth.place], ['12 March 1982', 'Pune']);
r = say(m, 'Rohan Sharma was born in 1983 in Mumbai');
eq('19b born', [m.person('p19').birth.date, m.person('p19').birth.place], ['1983', 'Mumbai']);
r = say(m, 'Rohan Sharma passed away in 2001 at Delhi');
eq('19c died', [m.person('p19').death.date, m.person('p19').death.place, m.person('p19').living], ['2001', 'Delhi', false]);
r = say(m, 'Priya Sharma died in 2010');
eq('19d died', [m.person('p10').death.date, m.person('p10').living], ['2010', false]);
r = say(m, 'Rajesh Sharma is no more');
eq('19e no more', m.person('p09').living, false);
r = say(m, 'Rajesh Sharma is alive');
eq('19f alive', m.person('p09').living, true);
r = say(m, 'Aditya Sharma is a girl');
eq('19g girl', m.person('p24').gender, 'F');
r = say(m, 'Aditya Sharma is male');
eq('19h male', m.person('p24').gender, 'M');
r = say(m, 'Kamla Devi is late');
eq('19i late', m.person('p02').living, false);
r = say(m, "Mahesh Sharma's father died in 1995");
eq('19j relation subject', m.person('p01').death.date, '1995');

// 20. findPerson matching
m = fresh();
eq('20 spaced', FT.Voice.findPerson(m, 'Ram Lal Sharma', {}), 'p01');
eq('20 lower', FT.Voice.findPerson(m, 'ramlal sharma', {}), 'p01');
eq('20 given', FT.Voice.findPerson(m, 'Ram Lal', {}), 'p01');
eq('20 fuzzy', FT.Voice.findPerson(m, 'Ramlall Sharmaa', {}), 'p01');
eq('20 dropped s', FT.Voice.findPerson(m, 'Ramlal Sharmas', {}), 'p01');
eq('20 pronoun', FT.Voice.findPerson(m, 'her', { lastId: 'p10', selectedId: 'p01' }), 'p10');
eq('20 pronoun fallback', FT.Voice.findPerson(m, 'this person', { selectedId: 'p01' }), 'p01');
eq('20 missing', FT.Voice.findPerson(m, 'Zzyzx Qwerty', {}), null);
eq('20 short names not fuzzy', FT.Voice.findPerson(m, 'Anja', {}), null);
// tie-break by selected
var dup = m.addPerson({ given: 'Rajesh', surname: 'Gupta', gender: 'M' });
eq('20 tie selected', FT.Voice.findPerson(m, 'Rajesh', { selectedId: dup }), dup);
eq('20 tie related', FT.Voice.findPerson(m, 'Rajesh', { selectedId: 'p24' }), 'p09'); // Aditya's father
eq('20 tie first', FT.Voice.findPerson(m, 'Rajesh', {}), 'p09');

// 21. parents keyword
m = fresh(); n = m.count();
r = say(m, "Ram Lal Sharma's parents are Bhimrao and Sita");
eq('21 count', m.count(), n + 2);
eq('21 father', m.displayName(parentOf(m, rl, 'M')), 'Bhimrao Sharma');
eq('21 mother', m.displayName(parentOf(m, rl, 'F')), 'Sita');

// 22. siblings
m = fresh(); n = m.count();
r = say(m, 'Rakesh Sharma has a brother Dinesh and a sister Seema');
eq('22 count', m.count(), n + 2);
ok('22 in family f01', names(m, m.families.f01.children).indexOf('Dinesh Sharma') >= 0 && names(m, m.families.f01.children).indexOf('Seema Sharma') >= 0);
eq('22 genders', [m.person(one(m, 'Dinesh Sharma')).gender, m.person(one(m, 'Seema Sharma')).gender], ['M', 'F']);
say(m, 'Rakesh Sharma has a brother Dinesh and a sister Seema');
eq('22 idempotent', m.count(), n + 2);

// 23. existing child is not duplicated; reversed sentence
m = fresh(); n = m.count();
r = say(m, 'Ramlal Sharma has son Suresh Sharma');
eq('23 no dup', m.count(), n);
m = fresh(); n = m.count();
r = say(m, 'Bhimrao Sharma is the father of Ramlal Sharma');
eq('23b reversed', m.displayName(parentOf(m, rl, 'M')), 'Bhimrao Sharma');

// 24. speech noise: caps, curly quotes, trailing punctuation
m = fresh(); n = m.count();
r = say(m, 'RAM LAL SHARMA’S FATHER IS bhimrao.');
eq('24 caps', m.displayName(parentOf(m, rl, 'M')), 'Bhimrao Sharma');
eq('24 count', m.count(), n + 1);

// 25. link existing orphan person as parent
m = fresh(); n = m.count();
var bh = m.addPerson({ given: 'Bhimrao', surname: 'Sharma', gender: 'M' });
r = say(m, "Ramlal Sharma's father is Bhimrao");
eq('25 linked', parentOf(m, rl, 'M'), bh);
eq('25 count', m.count(), n + 1);

// 26. no-subject child + wife keywords create genders
m = fresh(); n = m.count();
r = say(m, 'wife is Anita and daughter is Riya', { selectedId: 'p24' });
eq('26 count', m.count(), n + 2);
eq('26 wife', m.displayName(m.partners('p24')[0]), 'Anita');
eq('26 daughter', m.person(one(m, 'Riya Sharma')).gender, 'F');
ok('26 subject now male', m.person('p24').gender === 'M');

// 27. cycle guard when linking existing
m = fresh();
r = say(m, 'Ramlal Sharma has a son Rohan Sharma');
ok('27 link reported', typeof r.msgs[0].text === 'string');

// 28. empty / whitespace
r = say(fresh(), '   ');
ok('28 empty', r.msgs[0].ok === false);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
