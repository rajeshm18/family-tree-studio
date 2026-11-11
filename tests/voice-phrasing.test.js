// node tests/voice-phrasing.test.js: extra sentence shapes users actually said
global.window = global;
['model', 'paste', 'sample', 'voice'].forEach((f) => require('../src/' + f + '.js'));
const assert = require('assert');
const M = new FT.Model(); M.load(FT.SAMPLE);
let ctx = {}, pass = 0;
const say = (t) => { let r; M.change(() => { r = FT.Voice.run(M, t, ctx); }); ctx.lastId = r.lastId; return r; };
const ok = (r) => assert(r.msgs.length && r.msgs.every((m) => m.ok), JSON.stringify(r.msgs));
const n0 = M.count();

ok(say("Create Bimrao and Sita Devi as Ramlal Sharma's parents."));
assert.deepStrictEqual(M.parents('p01').map((x) => M.displayName(x)), ['Bimrao Sharma', 'Sita Devi']); pass++;
ok(say('Change the name of Ramlal Sharma to R.S. Sengar and Kamla Devi to Patamma.'));
assert.strictEqual(M.displayName('p01'), 'R.S. Sengar');
assert(Object.values(M.people).some((p) => M.displayName(p) === 'Patamma')); pass++;
ok(say('Add Aditi as daughter of Mahesh Sharma'));
ok(say("add Yukti as Mahesh Sharma's daughter"));
const kids = M.children(Object.values(M.people).find((p) => M.displayName(p) === 'Mahesh Sharma').id).map((x) => M.displayName(x));
assert(kids.includes('Aditi Sharma') && kids.includes('Yukti Sharma'), kids); pass++;
ok(say('Bimrao Sharma and Sita Devi are the parents of R.S. Sengar'));
assert.strictEqual(M.count(), n0 + 4, 'no duplicates'); pass++;
ok(say("rename Patamma's name to Kamla Devi"));
assert(Object.values(M.people).some((p) => M.displayName(p) === 'Kamla Devi')); pass++;
ok(say('Dr. Anand Rao is the husband of Geeta Iyer. Then Anand Rao was born in 1950'));
pass++;
console.log(pass + ' phrasing tests passed');
