// node tests/kin.test.js — kinship terms in Indian languages
global.window = global;
['model', 'kin'].forEach((f) => require('../src/' + f + '.js'));
const assert = require('assert');

const people = {}; const families = {};
const P = (id, gender, year) => { people[id] = { id, given: id, gender, birth: { date: year ? String(year) : '' } }; };
const F = (id, partners, children) => { families[id] = { id, partners, children: children || [] }; };
// paternal grandparents; children: uncle(elder), dad, uncle(younger), aunt
P('gf', 'M', 1925); P('gm', 'F', 1930);
P('ueb', 'M', 1952); P('dad', 'M', 1955); P('uyb', 'M', 1958); P('aunt', 'F', 1960);
F('f_g', ['gf', 'gm'], ['ueb', 'dad', 'uyb', 'aunt']);
// maternal grandparents; children: elder sister, mom, brother, younger sister
P('ngf', 'M', 1928); P('ngm', 'F', 1932);
P('msise', 'F', 1954); P('mom', 'F', 1957); P('mbro', 'M', 1960); P('msisy', 'F', 1963);
F('f_n', ['ngf', 'ngm'], ['msise', 'mom', 'mbro', 'msisy']);
// spouses of uncles / aunts
P('uebw', 'F', 1954); F('f_ue', ['ueb', 'uebw'], ['cu1']);
P('uybw', 'F', 1960); F('f_uy', ['uyb', 'uybw']);
P('auntH', 'M', 1958); F('f_au', ['auntH', 'aunt'], ['cu2']);
P('mbroW', 'F', 1962); F('f_mb', ['mbro', 'mbroW'], ['cu3']);
P('msisyH', 'M', 1960); F('f_ms', ['msisyH', 'msisy'], ['cu4']);
P('msiseH', 'M', 1952); F('f_mse', ['msiseH', 'msise']);
// cousins
P('cu1', 'M', 1980); P('cu2', 'M', 1984); P('cu3', 'F', 1990); P('cu4', 'F', 1986);
// my family: sister (elder), me, brother (younger)
P('sis', 'F', 1982); P('me', 'M', 1985); P('bro', 'M', 1988);
F('f_me', ['dad', 'mom'], ['sis', 'me', 'bro']);
P('sisH', 'M', 1980); F('f_sis', ['sisH', 'sis'], ['nepS']); P('nepS', 'M', 2010);
P('broW', 'F', 1989); F('f_bro', ['bro', 'broW'], ['nepB']); P('nepB', 'M', 2015);
// my wife and her family: her elder brother, her
P('wife', 'F', 1987); P('fil', 'M', 1955); P('mil', 'F', 1958);
P('wbro', 'M', 1983);
F('f_w', ['fil', 'mil'], ['wbro', 'wife']);
P('wbroW', 'F', 1985); F('f_wb', ['wbro', 'wbroW']);
F('f_mw', ['me', 'wife'], ['kid', 'dau']);
P('kid', 'M', 2012); P('dau', 'F', 2015);
P('kidW', 'F', 2012); F('f_kid', ['kid', 'kidW'], ['gs']); P('gs', 'M', 2040);
P('dauH', 'M', 2013); F('f_dau', ['dauH', 'dau'], ['ds']); P('ds', 'M', 2041);

const M = new FT.Model(); M.load({ people, families });
let n = 0;
const eq = (a, b, lang, want) => { assert.strictEqual(FT.Kin.term(M, a, b, lang), want, a + '->' + b + ' ' + lang); n++; };

assert.deepStrictEqual(FT.Kin.LANGS.map((l) => l.code), ['en', 'hi', 'te', 'kn', 'ta']); n++;
// describe keys
let d = FT.Kin.describe(M, 'me', 'ueb');
assert.strictEqual(d.key, 'father.elderBrother'); assert.strictEqual(d.side, 'paternal'); assert.strictEqual(d.elder, true); assert.strictEqual(d.en, 'uncle'); n += 4;
assert.strictEqual(FT.Kin.describe(M, 'me', 'mbro').key, 'mother.brother'); n++;
assert.strictEqual(FT.Kin.describe(M, 'me', 'mbro').side, 'maternal'); n++;
assert.strictEqual(FT.Kin.describe(M, 'me', 'cu1').key, 'father.brother.son.elder'); n++;
assert.strictEqual(FT.Kin.describe(M, 'me', 'broW').key, 'youngerBrother.wife'); n++;
assert.strictEqual(FT.Kin.describe(M, 'me', 'ueb').elder, true);
assert.strictEqual(FT.Kin.describe(M, 'me', 'uyb').elder, false); n++;
assert.strictEqual(FT.Kin.describe(M, 'me', 'sis').elder, true); n++;
assert.strictEqual(FT.Kin.describe(M, 'me', 'nobody-here'), null); n++;
// terms
eq('me', 'ueb', 'kn', 'Doddappa'); eq('me', 'ueb', 'ta', 'Periyappa'); eq('me', 'ueb', 'hi', 'Tau-ji'); eq('me', 'ueb', 'te', 'Pedda nanna');
eq('me', 'uyb', 'ta', 'Chithappa'); eq('me', 'uyb', 'hi', 'Chacha'); eq('me', 'uyb', 'kn', 'Chikkappa');
eq('me', 'uebw', 'ta', 'Periyamma'); eq('me', 'uybw', 'hi', 'Chachi');
eq('me', 'aunt', 'hi', 'Bua'); eq('me', 'aunt', 'ta', 'Athai'); eq('me', 'auntH', 'ta', 'Maama'); eq('me', 'auntH', 'hi', 'Phupha');
eq('me', 'mbro', 'te', 'Mavayya'); eq('me', 'mbro', 'kn', 'Maava'); eq('me', 'mbroW', 'ta', 'Maami');
eq('me', 'msise', 'ta', 'Periyamma'); eq('me', 'msisy', 'ta', 'Chithi'); eq('me', 'msisy', 'hi', 'Chhoti Mausi'); eq('me', 'msisyH', 'hi', 'Mausa');
eq('me', 'sis', 'ta', 'Akka'); eq('me', 'bro', 'ta', 'Thambi'); eq('me', 'bro', 'te', 'Tammudu'); eq('me', 'sis', 'hi', 'Didi');
eq('me', 'broW', 'hi', 'Bhabhi'); eq('me', 'broW', 'te', 'Vadina'); eq('me', 'sisH', 'te', 'Bava'); eq('me', 'sisH', 'hi', 'Jija');
// grandparents
eq('me', 'gf', 'kn', 'Ajja'); eq('me', 'gm', 'ta', 'Paati'); eq('me', 'gm', 'hi', 'Dadi'); eq('me', 'ngm', 'te', 'Ammamma'); eq('me', 'ngf', 'hi', 'Nana');
// spouse side
eq('me', 'wife', 'kn', 'Hendati'); eq('me', 'fil', 'kn', 'Maava'); eq('me', 'fil', 'hi', 'Sasur'); eq('me', 'mil', 'te', 'Attagaru'); eq('me', 'mil', 'ta', 'Maamiyaar');
eq('me', 'wbro', 'ta', 'Machan'); eq('wife', 'bro', 'hi', 'Devar'); eq('wife', 'me', 'hi', 'Pati');
eq('wife', 'ueb', 'hi', ''); // husband's uncle: not covered -> fall back to English in the UI
// children, in-laws, grandchildren
eq('me', 'dauH', 'ta', 'Maappillai'); eq('me', 'kidW', 'kn', 'Sose'); eq('me', 'kid', 'ta', 'Magan'); eq('me', 'dau', 'te', 'Kuthuru');
eq('me', 'gs', 'hi', 'Pota'); eq('me', 'ds', 'hi', 'Nati'); eq('me', 'gs', 'ta', 'Peran');
// nephews
eq('me', 'nepS', 'hi', 'Bhanja'); eq('me', 'nepB', 'hi', 'Bhatija'); eq('me', 'nepS', 'ta', 'Marumagan'); eq('me', 'nepB', 'ta', 'Magan');
// cousins: parallel vs cross
eq('me', 'cu1', 'ta', 'Anna'); eq('me', 'cu2', 'ta', 'Athan'); eq('me', 'cu3', 'ta', 'Machini'); eq('me', 'cu4', 'ta', 'Thangai'); eq('me', 'cu1', 'hi', 'Chachera bhai');
eq('me', 'cu2', 'hi', 'Phuphera bhai');
assert.notStrictEqual(FT.Kin.term(M, 'me', 'cu1', 'ta'), FT.Kin.term(M, 'me', 'cu2', 'ta')); n++;
// english and all()
eq('me', 'ueb', 'en', 'uncle');
const a = FT.Kin.all(M, 'me', 'mbro');
assert.deepStrictEqual(a, { en: 'uncle', hi: 'Mama', te: 'Mavayya', kn: 'Maava', ta: 'Maama' }); n++;
console.log(n + ' kin tests passed');
