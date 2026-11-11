// node tests/layout.test.js — smoke-tests model + layout on the sample family
global.window = global;
['model', 'sample', 'layout'].forEach((f) => require('../src/' + f + '.js'));
const assert = require('assert');
const M = new FT.Model(); M.load(FT.SAMPLE);
const S = FT.SIZE;
function noOverlap(L, name) {
  const byRow = {};
  L.nodes.forEach((n) => (byRow[n.y] = byRow[n.y] || []).push(n));
  Object.values(byRow).forEach((row) => {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) assert(row[i].x - row[i - 1].x >= S.W - 0.5, name + ': overlap at y=' + row[i].y + ' ' + row[i - 1].pid + '/' + row[i].pid);
  });
}
const n = M.count();
let L = FT.Layout.compute(M, { view: 'everyone' });
noOverlap(L, 'everyone');
const shown = new Set(L.nodes.map((x) => x.pid));
assert.strictEqual(shown.size, n, 'everyone shows all ' + n + ' people, got ' + shown.size);
console.log('everyone ok:', L.nodes.length, 'cards,', L.nodes.filter((x) => x.dup).length, 'links; roots', M.roots());
const root = M.roots()[0];
['descendants', 'ancestors', 'hourglass'].forEach((v) => {
  Object.keys(M.people).forEach((id) => { const l = FT.Layout.compute(M, { view: v, rootId: id }); noOverlap(l, v + ' ' + id); });
  console.log(v, 'ok for every person');
});
L = FT.Layout.compute(M, { view: 'descendants', rootId: root, collapsed: [M.children(root)[0]] });
assert(L.nodes.some((x) => x.hidden > 0), 'collapse shows hidden badge');
const leaf = Object.keys(M.people).find((id) => M.parents(id).length && M.parents(M.parents(id)[0]).length);
const allowed = FT.Layout.branchSet(M, M.parents(leaf)[0]);
L = FT.Layout.compute(M, { view: 'descendants', rootId: M.topAncestor(leaf), allowed });
assert(L.nodes.length < n, 'branch filter hides people');
console.log('relationship:', M.displayName(root), '->', M.displayName(leaf), '=', M.relationship(root, leaf));
// mutations + undo
M.change(() => M.addChild(root, { given: 'Test' }));
assert.strictEqual(M.count(), n + 1); M.undo(); assert.strictEqual(M.count(), n);
const a = M.change(() => M.addPerson({ given: 'A' })), b = M.change(() => M.addPerson({ given: 'B' }));
assert.strictEqual(M.change(() => M.link('child', a, b)), '');
assert.deepStrictEqual(M.parents(b), [a]);
assert.notStrictEqual(M.change(() => M.link('child', b, a)), '', 'cycle refused');
console.log('all layout/model tests passed');
