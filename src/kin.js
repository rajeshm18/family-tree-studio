/* FT.Kin — Indian-language kinship terms (Hindi, Telugu, Kannada, Tamil) layered over FT.Model.relationship. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const LANGS = [
    { code: 'en', name: 'English' }, { code: 'hi', name: 'Hindi' }, { code: 'te', name: 'Telugu' },
    { code: 'kn', name: 'Kannada' }, { code: 'ta', name: 'Tamil' }
  ];
  const IDX = { hi: 0, te: 1, kn: 2, ta: 3 };
  const sp = (m, f) => ({ m: m, f: f }); // depends on speaker's gender (husband's side vs wife's side)

  // key -> [hi, te, kn, ta]
  const T = {
    father: ['Pitaji', 'Nanna', 'Appa', 'Appa'],
    mother: ['Maa', 'Amma', 'Amma', 'Amma'],
    'father.father': ['Dada', 'Thatha', 'Ajja', 'Thatha'],
    'father.mother': ['Dadi', 'Nannamma', 'Ajji', 'Paati'],
    'mother.father': ['Nana', 'Thatha', 'Ajja', 'Thatha'],
    'mother.mother': ['Nani', 'Ammamma', 'Ajji', 'Paati'],
    'gg.paternal.M': ['Pardada', 'Mutthatha', 'Muttajja', 'Kollu Thatha'],
    'gg.paternal.F': ['Pardadi', 'Mutthavva', 'Muttajji', 'Kollu Paati'],
    'gg.maternal.M': ['Parnana', 'Mutthatha', 'Muttajja', 'Kollu Thatha'],
    'gg.maternal.F': ['Parnani', 'Mutthavva', 'Muttajji', 'Kollu Paati'],
    // siblings
    elderBrother: ['Bhaiya', 'Anna', 'Anna', 'Anna'],
    youngerBrother: ['Chhota bhai', 'Tammudu', 'Tamma', 'Thambi'],
    brother: ['Bhai', 'Anna/Tammudu', 'Anna/Tamma', 'Anna/Thambi'],
    elderSister: ['Didi', 'Akka', 'Akka', 'Akka'],
    youngerSister: ['Chhoti behen', 'Chelli', 'Tangi', 'Thangai'],
    sister: ['Behen', 'Akka/Chelli', 'Akka/Tangi', 'Akka/Thangai'],
    // uncles and aunts
    'father.elderBrother': ['Tau-ji', 'Pedda nanna', 'Doddappa', 'Periyappa'],
    'father.youngerBrother': ['Chacha', 'Chinnanna', 'Chikkappa', 'Chithappa'],
    'father.brother': ['Chacha/Tau-ji', 'Pedda nanna/Chinnanna', 'Doddappa/Chikkappa', 'Periyappa/Chithappa'],
    'mother.brother': ['Mama', 'Mavayya', 'Maava', 'Maama'],
    'father.sister': ['Bua', 'Atta', 'Atte', 'Athai'],
    'mother.elderSister': ['Badi Mausi', 'Pedamma', 'Doddamma', 'Periyamma'],
    'mother.youngerSister': ['Chhoti Mausi', 'Pinni', 'Chikkamma', 'Chithi'],
    'mother.sister': ['Mausi', 'Pedamma/Pinni', 'Doddamma/Chikkamma', 'Periyamma/Chithi'],
    // spouses of uncles and aunts
    'father.elderBrother.wife': ['Tai-ji', 'Pedamma', 'Doddamma', 'Periyamma'],
    'father.youngerBrother.wife': ['Chachi', 'Chinnamma', 'Chikkamma', 'Chithi'],
    'father.brother.wife': ['Tai-ji/Chachi', 'Pedamma/Chinnamma', 'Doddamma/Chikkamma', 'Periyamma/Chithi'],
    'father.sister.husband': ['Phupha', 'Mavayya', 'Maava', 'Maama'],
    'mother.brother.wife': ['Mami', 'Atta', 'Atte', 'Maami'],
    'mother.elderSister.husband': ['Mausa', 'Pedda nanna', 'Doddappa', 'Periyappa'],
    'mother.youngerSister.husband': ['Mausa', 'Chinnanna', 'Chikkappa', 'Chithappa'],
    'mother.sister.husband': ['Mausa', 'Pedda nanna/Chinnanna', 'Doddappa/Chikkappa', 'Periyappa/Chithappa'],
    // siblings' spouses
    'brother.wife': ['Bhabhi', 'Vadina', 'Atige', 'Anni'],
    'sister.husband': ['Jija', 'Bava', 'Bhava', 'Machan'],
    'elderSister.husband': ['Jija', 'Bava', 'Bhava', 'Athimber'],
    // children and their spouses
    son: ['Beta', 'Koduku', 'Maga', 'Magan'],
    daughter: ['Beti', 'Kuthuru', 'Magalu', 'Magal'],
    'son.wife': ['Bahu', 'Kodalu', 'Sose', 'Marumagal'],
    'daughter.husband': ['Damaad', 'Alludu', 'Aliya', 'Maappillai'],
    // grandchildren
    'son.son': ['Pota', 'Manavadu', 'Mommaga', 'Peran'],
    'son.daughter': ['Poti', 'Manavaralu', 'Mommagalu', 'Pethi'],
    'daughter.son': ['Nati', 'Manavadu', 'Mommaga', 'Peran'],
    'daughter.daughter': ['Natin', 'Manavaralu', 'Mommagalu', 'Pethi'],
    // nephews and nieces
    'brother.son': ['Bhatija', 'Koduku', 'Maga', 'Magan'],
    'brother.daughter': ['Bhatiji', 'Kuthuru', 'Magalu', 'Magal'],
    'sister.son': ['Bhanja', 'Menalludu', 'Aliya', 'Marumagan'],
    'sister.daughter': ['Bhanji', 'Menakodalu', 'Sose', 'Marumagal'],
    // spouse and in-laws
    husband: ['Pati', 'Mogudu', 'Ganda', 'Kanavar'],
    wife: ['Patni', 'Bharya', 'Hendati', 'Manaivi'],
    'spouse.father': ['Sasur', 'Mamagaru', 'Maava', 'Maamanaar'],
    'spouse.mother': ['Saas', 'Attagaru', 'Atte', 'Maamiyaar'],
    'spouse.elderBrother': [sp('Bada Saala', 'Jeth'), sp('Bavamaridi', 'Bava'), sp('Maiduna', 'Bhava'), sp('Machan', 'Maithunar')],
    'spouse.youngerBrother': [sp('Saala', 'Devar'), sp('Bavamaridi', 'Maridi'), sp('Maiduna', 'Maiduna'), sp('Machan', 'Kozhundhan')],
    'spouse.brother': [sp('Saala', 'Jeth/Devar'), sp('Bavamaridi', 'Bava/Maridi'), sp('Maiduna', 'Bhava/Maiduna'), sp('Machan', 'Maithunar/Kozhundhan')],
    'spouse.elderSister': [sp('Badi Saali', 'Badi Nanad'), sp('Vadina', 'Vadina'), sp('Atige', 'Naadini'), sp('Maithuni', 'Naathanaar')],
    'spouse.youngerSister': [sp('Saali', 'Nanad'), sp('Maradalu', 'Vadina'), sp('Maiduni', 'Naadini'), sp('Maithuni', 'Naathanaar')],
    'spouse.sister': [sp('Saali', 'Nanad'), sp('Vadina/Maradalu', 'Vadina'), sp('Atige/Maiduni', 'Naadini'), sp('Maithuni', 'Naathanaar')],
    'spouse.brother.wife': [sp('Sarhaj', 'Jethani/Devrani'), sp('Vadina', 'Vadina'), sp('Atige', 'Atige'), sp('Anni', 'Maithuni')],
    'spouse.sister.husband': [sp('Sadhu', 'Nandoi'), sp('Bava', 'Bava'), sp('Bhava', 'Bhava'), sp('Machan', 'Maithunar')]
  };
  // refinement for elder/younger brother's wife of spouse (Hindi Jethani vs Devrani)
  T['spouse.elderBrother.wife'] = [sp('Sarhaj', 'Jethani'), sp('Vadina', 'Vadina'), sp('Atige', 'Atige'), sp('Anni', 'Maithuni')];
  T['spouse.youngerBrother.wife'] = [sp('Sarhaj', 'Devrani'), sp('Maradalu', 'Maradalu'), sp('Atige', 'Atige'), sp('Anni', 'Maithuni')];

  // ---------- helpers ----------
  const gOf = (p) => (p && (p.gender === 'M' || p.gender === 'F') ? p.gender : null);

  /** true if x is older than y, false if younger, null if unknown. */
  function older(M, x, y) {
    const yx = FT.year(M.person(x).birth.date), yy = FT.year(M.person(y).birth.date);
    if (yx && yy && yx !== yy) return yx < yy;
    const fx = M.parentFamily(x), fy = M.parentFamily(y);
    if (fx && fx === fy) {
      const ix = fx.children.indexOf(x), iy = fx.children.indexOf(y);
      if (ix >= 0 && iy >= 0 && ix !== iy) return ix < iy;
    }
    return null;
  }
  /** Shortest chain of ids [x ... anc] walking up through parents. */
  function chain(M, x, anc) {
    const prev = new Map([[x, null]]); const q = [x];
    while (q.length) {
      const c = q.shift();
      if (c === anc) break;
      M.parents(c).forEach((p) => { if (!prev.has(p)) { prev.set(p, c); q.push(p); } });
    }
    const out = []; let c = anc;
    while (c !== null && c !== undefined) { out.unshift(c); c = prev.get(c); }
    return out;
  }
  const sibName = (g, el, plainWhenUnknown) => {
    const base = g === 'M' ? 'Brother' : 'Sister';
    return el === true ? 'elder' + base : el === false ? 'younger' + base : base.toLowerCase();
  };

  /** Blood relationship descriptor of B to A, or null. */
  function blood(M, a, b) {
    if (a === b) return null;
    const B = M.person(b), gb = gOf(B);
    if (!gb) return null;
    const upA = M._upDist(a), upB = M._upDist(b);
    let best = null;
    upA.forEach((da, anc) => { if (upB.has(anc)) { const db = upB.get(anc); if (!best || da + db < best.da + best.db) best = { anc, da, db }; } });
    if (!best) return null;
    const { anc, da, db } = best;
    const kid = gb === 'M' ? 'son' : 'daughter';
    if (da === 0) {
      if (db === 1) return { key: kid };
      if (db === 2) { const mid = gOf(M.person(chain(M, b, anc)[1])); return mid ? { key: (mid === 'M' ? 'son.' : 'daughter.') + kid } : null; }
      return { key: 'greatgrandchild' };
    }
    if (db === 0) {
      if (da === 1) return { key: gb === 'M' ? 'father' : 'mother' };
      const ch = chain(M, a, anc);
      if (da === 2) {
        const p = gOf(M.person(ch[1])); if (!p) return null;
        return { key: (p === 'M' ? 'father.' : 'mother.') + (gb === 'M' ? 'father' : 'mother'), side: p === 'M' ? 'paternal' : 'maternal' };
      }
      if (da === 3) {
        const p = gOf(M.person(ch[1])), q = gOf(M.person(ch[2])); if (!p || !q) return null;
        const side = p === 'M' ? 'paternal' : 'maternal';
        return { key: (p === 'M' ? 'father.' : 'mother.') + (q === 'M' ? 'father.' : 'mother.') + (gb === 'M' ? 'father' : 'mother'), tkey: 'gg.' + side + '.' + gb, side };
      }
      return { key: 'greatgrandparent' };
    }
    if (da === 1 && db === 1) {
      const el = older(M, b, a);
      return { key: sibName(gb, el), elder: el };
    }
    if (da === 2 && db === 1) {
      const P = chain(M, a, anc)[1], gp = gOf(M.person(P)); if (!gp) return null;
      const el = older(M, b, P), side = gp === 'M' ? 'paternal' : 'maternal';
      let key;
      if (gp === 'M') key = gb === 'M' ? 'father.' + sibName('M', el) : 'father.sister';
      else key = gb === 'M' ? 'mother.brother' : 'mother.' + sibName('F', el);
      return { key, side, elder: el };
    }
    if (da === 1 && db === 2) {
      const S = gOf(M.person(chain(M, b, anc)[1])); if (!S) return null;
      return { key: (S === 'M' ? 'brother.' : 'sister.') + kid };
    }
    if (da === 2 && db === 2) {
      const gp = gOf(M.person(chain(M, a, anc)[1])), gq = gOf(M.person(chain(M, b, anc)[1]));
      if (!gp || !gq) return null;
      const el = older(M, b, a);
      return {
        key: (gp === 'M' ? 'father.' : 'mother.') + (gq === 'M' ? 'brother.' : 'sister.') + kid + (el === true ? '.elder' : el === false ? '.younger' : ''),
        side: gp === 'M' ? 'paternal' : 'maternal', elder: el, cross: gp !== gq
      };
    }
    return null;
  }

  function classify(M, a, b) {
    const gb = gOf(M.person(b)); if (!gb) return null;
    const spouseWord = gb === 'M' ? 'husband' : 'wife';
    const ps = M.partners(a);
    if (ps.includes(b)) return { key: spouseWord };
    const r = blood(M, a, b);
    if (r) return r;
    // spouse of a blood relative (brother's wife, daughter's husband, uncle's wife ...)
    for (const p of M.partners(b)) {
      const q = blood(M, a, p);
      if (q && q.key.indexOf('greatgrand') < 0) return Object.assign({}, q, { key: q.key + '.' + spouseWord, tkey: undefined, cross: undefined });
    }
    // blood relative of my spouse
    const base = /^(father|mother|(elder|younger)?(Brother|Sister)|brother|sister)$/;
    for (const p of ps) {
      const q = blood(M, p, b);
      if (q && base.test(q.key)) return { key: 'spouse.' + q.key, elder: q.elder };
    }
    // spouse of my spouse's sibling
    for (const p of ps) {
      for (const s of M.partners(b)) {
        const q = blood(M, p, s);
        if (q && /^((elder|younger)?(Brother|Sister)|brother|sister)$/.test(q.key)) return { key: 'spouse.' + q.key + '.' + spouseWord, elder: q.elder };
      }
    }
    return null;
  }

  function describe(M, a, b) {
    if (!M || !M.person(a) || !M.person(b) || a === b) return null;
    const en = M.relationship(a, b);
    if (!en) return null;
    const c = classify(M, a, b);
    if (!c) return null;
    return { key: c.key, side: c.side || null, elder: c.elder === undefined ? null : c.elder, en: en, tkey: c.tkey || c.key, cross: c.cross };
  }

  const generic = (k) => k.replace(/(elder|younger)([BS])/g, (m, e, l) => l.toLowerCase());
  function pick(v, i, speaker) {
    let s = v[i];
    if (s && typeof s === 'object') {
      const sg = gOf(speaker);
      s = sg === 'M' ? s.m : sg === 'F' ? s.f : (s.m === s.f ? s.m : s.m + ' / ' + s.f);
    }
    return s || '';
  }

  const SIB = ['elderBrother', 'youngerBrother', 'brother', 'elderSister', 'youngerSister', 'sister'];
  function cousinTerm(d, i, gbKey) {
    const m = d.key.match(/^(father|mother)\.(brother|sister)\.(son|daughter)(?:\.(elder|younger))?$/);
    if (!m) return '';
    const male = m[3] === 'son', el = m[4] === 'elder' ? true : m[4] === 'younger' ? false : null;
    const parallel = (m[1] === 'father') === (m[2] === 'brother');
    if (parallel) {
      if (i === 0) return (m[1] === 'father' ? 'Chachera' : 'Mausera') + (male ? ' bhai' : ' behen');
      return T[sibName(male ? 'M' : 'F', el)][i];
    }
    const fside = m[1] === 'father'; // father's sister's child, else mother's brother's child
    if (i === 0) return (fside ? 'Phuphera' : 'Mamera') + (male ? ' bhai' : ' behen');
    if (i === 1) return male ? (el ? 'Bava' : 'Bavamaridi') : (el ? 'Vadina' : 'Maradalu');
    if (i === 2) return male ? (el ? 'Bhava' : 'Maiduna') : (el ? 'Atige' : 'Maiduni');
    return male ? (el ? 'Athan' : 'Machan') : (el ? (fside ? 'Athai magal' : 'Maama magal') : 'Machini');
  }

  function term(M, a, b, lang) {
    if (lang === 'en') return M.relationship(a, b);
    const i = IDX[lang]; if (i === undefined) return '';
    const d = describe(M, a, b); if (!d) return '';
    if (/\.(son|daughter)(\.(elder|younger))?$/.test(d.key) && /^(father|mother)\.(brother|sister)\./.test(d.key)) return cousinTerm(d, i);
    const v = T[d.tkey] || T[generic(d.tkey)];
    return v ? pick(v, i, M.person(a)) : '';
  }

  function all(M, a, b) {
    const o = {};
    LANGS.forEach((l) => { o[l.code] = term(M, a, b, l.code); });
    return o;
  }

  FT.Kin = { LANGS: LANGS, describe: describe, term: term, all: all };
})();
