/* FT.Voice — offline, rule-based English interpreter for "Tell the Tree" voice/typed commands.
 * Mutates the model directly; the caller wraps run() in model.change(). */
window.FT = window.FT || {};

FT.Voice = (function () {
  'use strict';

  // ---------- small text helpers ----------
  var NUMW = /^(one|two|three|four|five|six|seven|eight|nine|ten)$/i;
  function isNum(w) { return NUMW.test(w) || /^\d+$/.test(w); }
  function compact(s) { return String(s || '').toLowerCase().replace(/[^\p{L}]/gu, ''); }
  function titleCase(s) {
    return String(s || '').replace(/(^|[\s-])(\p{L})(\p{L}*)/gu, function (_, pre, a, b) { return pre + a.toUpperCase() + b.toLowerCase(); });
  }
  function normalise(t) {
    return String(t == null ? '' : t).replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  }
  function lev(a, b) {
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function toks(str) { return String(str).replace(/:/g, ' : ').replace(/,/g, ' , ').split(/\s+/).filter(Boolean); }

  /** parseName + title-casing; returns person fields (+ explicit: a surname was spoken). */
  function fieldsFrom(str) {
    var p = FT.Paste.parseName(str);
    var f = {
      given: titleCase(p.given), surname: titleCase(p.surname), nick: p.nick || '', gender: p.gender || 'U',
      birth: p.birth, death: p.death, living: p.living
    };
    f.explicit = !!f.surname;
    return f;
  }
  function fullC(p) { return compact((p.given || '') + (p.surname || '')); }
  function givenC(p) { return compact(p.given); }
  function strip(f) { var o = Object.assign({}, f); delete o.explicit; return o; }

  // ---------- name lookup ----------
  var PRON = /^(he|she|him|her|his|hers|their|they|them|it|its|this person|this one|selected|selected person)$/i;

  function relatedSet(model, id) {
    var s = new Set();
    [model.parents(id), model.partners(id), model.children(id), model.siblings(id)].forEach(function (a) { a.forEach(function (x) { s.add(x); }); });
    return s;
  }
  function pick(model, cands, ctx) {
    if (cands.length === 1) return cands[0];
    ctx = ctx || {};
    var prefer = ctx.prefer ? ctx.prefer.slice() : [ctx.selectedId, ctx.lastId];
    prefer = prefer.filter(function (x) { return x && model.person(x); });
    var i, j;
    for (i = 0; i < prefer.length; i++) if (cands.indexOf(prefer[i]) >= 0) return prefer[i];
    for (i = 0; i < prefer.length; i++) {
      var rel = relatedSet(model, prefer[i]);
      for (j = 0; j < cands.length; j++) if (rel.has(cands[j])) return cands[j];
    }
    return cands[0];
  }

  /** Lenient lookup: exact compact name, unique given name, fuzzy (Levenshtein <= 2), with "Sharmas" -> "Sharma" retry. */
  function findPerson(model, name, ctx) {
    ctx = ctx || {};
    var raw = normalise(name).replace(/['’]s$/i, '').replace(/^the\s+/i, '').trim();
    if (!raw) return null;
    if (PRON.test(raw)) {
      var pid = ctx.lastId || ctx.selectedId;
      return pid && model.person(pid) ? pid : null;
    }
    var pn = FT.Paste.parseName(raw);
    var c = compact(pn.given + pn.surname);
    if (!c) return null;
    var single = !pn.surname;
    var all = Object.keys(model.people).map(function (id) { return model.people[id]; });

    function stage(key, fn) { var cs = all.filter(function (p) { return fn(p) === key; }).map(function (p) { return p.id; }); return cs.length ? pick(model, cs, ctx) : null; }
    function exactOrGiven(k) { return stage(k, fullC) || stage(k, givenC); }
    function fuzzy(k) {
      if (k.length < 6) return null;
      var best = 3, cs = [];
      all.forEach(function (p) {
        var ds = [];
        if (fullC(p).length >= 6) ds.push(lev(fullC(p), k));
        if (single && givenC(p).length >= 6) ds.push(lev(givenC(p), k));
        var d = ds.length ? Math.min.apply(null, ds) : 9;
        if (d <= 2) { if (d < best) { best = d; cs = [p.id]; } else if (d === best) cs.push(p.id); }
      });
      return cs.length ? pick(model, cs, ctx) : null;
    }
    var r = exactOrGiven(c);
    if (r) return r;
    var c2 = c.length > 3 && c.slice(-1) === 's' ? c.slice(0, -1) : null; // speech dropped the apostrophe
    if (c2 && (r = exactOrGiven(c2))) return r;
    return fuzzy(c) || (c2 ? fuzzy(c2) : null);
  }

  /** Person with the exact full compact name (never the excluded ids). */
  function findExact(model, f, exclude) {
    var k = compact(f.given + f.surname);
    if (!k) return null;
    var cs = Object.keys(model.people).filter(function (id) { return (exclude || []).indexOf(id) < 0 && fullC(model.people[id]) === k; });
    return cs.length ? cs[0] : null;
  }
  /** Same person by name? Single spoken names compare against given names only. */
  function sameName(p, f) { return f.surname ? fullC(p) === compact(f.given + f.surname) : givenC(p) === compact(f.given); }

  // ---------- relation vocabulary ----------
  var KW = {};
  function kw(words, rel, g, label) { words.split(' ').forEach(function (w) { KW[w] = { rel: rel, g: g, label: label }; }); }
  kw('father fathers dad dads papa papas', 'father', 'M', 'father');
  kw('mother mothers mom moms mum mums mummy maa', 'mother', 'F', 'mother');
  kw('parents', 'parents', 'U', 'parents');
  kw('son sons', 'child', 'M', 'son');
  kw('daughter daughters', 'child', 'F', 'daughter');
  kw('child children kid kids', 'child', 'U', 'child');
  kw('brother brothers', 'sibling', 'M', 'brother');
  kw('sister sisters', 'sibling', 'F', 'sister');
  kw('sibling siblings', 'sibling', 'U', 'sibling');
  kw('wife', 'partner', 'F', 'wife');
  kw('husband', 'partner', 'M', 'husband');
  kw('spouse partner', 'partner', 'U', 'partner');
  var KWRX = Object.keys(KW).sort(function (a, b) { return b.length - a.length; }).join('|');
  function kwRegex() { return new RegExp("\\b(" + KWRX + ")(?![-\\w])(?:\\s*'s\\b)?", 'gi'); }

  var STOP = /^(is|are|was|were|am|be|my|your|our|what|who|whom|which|where|when|how|not|no|it|its|to|of|for|in|on|at|by|with|has|have|had|does|do|did|can|will|would|should|please|tree)$/i;
  var SUBJ_LEAD = /^(and|also|so|now|ok|okay|please|add|note|that|the|then|for|about|tell|tree)$/i;

  // ---------- value / subject cleaning ----------
  var LEADW = /^(is|are|was|were|named|called|namely|name|names|whose|as|being|also|the|:|,|-)$/i;
  function stripLead(t) {
    while (t.length) {
      var w = t[0];
      if (LEADW.test(w) || isNum(w)) { t.shift(); continue; }
      if (/^(a|an)$/i.test(w) && t.length > 1 && t[1].length > 1) { t.shift(); continue; } // keep initials like "A K Sharma"
      break;
    }
  }
  function stripTrail(t) {
    while (t.length) {
      var w = t[t.length - 1], prev = t[t.length - 2];
      if (/^(,|&|and|the|his|her|their|also|then|has|have|had|with|an)$/i.test(w) || isNum(w)) { t.pop(); continue; }
      if (/^a$/i.test(w) && prev && /^(and|,|&)$/i.test(prev)) { t.pop(); continue; }
      break;
    }
  }
  /** "name Amit, Sumit and Rohit and a" -> ["Amit","Sumit","Rohit"] */
  function cleanValues(seg) {
    var t = toks(seg);
    stripLead(t); stripTrail(t);
    var groups = [[]];
    t.forEach(function (w) { if (/^(,|&|and)$/i.test(w)) groups.push([]); else groups[groups.length - 1].push(w); });
    return groups.map(function (g) { stripLead(g); stripTrail(g); return g.join(' ').trim(); }).filter(Boolean);
  }
  /** Text before the first relation word -> {type:'none'|'pron'|'names'|'invalid', names}. */
  function cleanSubject(prefix) {
    var t = toks(prefix);
    while (t.length && (SUBJ_LEAD.test(t[0]) || t[0] === ',' || t[0] === ':')) t.shift();
    while (t.length) {
      var w = t[t.length - 1];
      if (/^(has|have|had|having|with|a|an|the|also|,|:)$/i.test(w) || isNum(w)) t.pop(); else break;
    }
    if (t.length) t[t.length - 1] = t[t.length - 1].replace(/'s$/i, '');
    if (!t.length || !t[t.length - 1]) return { type: 'none' };
    var s = t.join(' ');
    if (PRON.test(s)) return { type: 'pron' };
    var names = [[]];
    t.forEach(function (w) { if (/^(and|&)$/i.test(w)) names.push([]); else names[names.length - 1].push(w); });
    names = names.map(function (g) { return g.join(' ').trim(); }).filter(Boolean);
    if (!names.length) return { type: 'none' };
    for (var i = 0; i < names.length; i++) {
      var ws = names[i].split(' ');
      if (ws.length > 5) return { type: 'invalid' };
      for (var j = 0; j < ws.length; j++) {
        if (STOP.test(ws[j]) || !/^[\p{L}][\p{L}.'-]*$/u.test(ws[j])) return { type: 'invalid' };
      }
    }
    return { type: 'names', names: names.slice(0, 2) };
  }

  /** Parse a relation sentence into {subject, entries:[{kw, values}]} or null. */
  function parseRelation(s) {
    // "Bhimrao is the father of Ramlal" -> "Ramlal's father is Bhimrao"
    var rev = new RegExp('^(.+?)\\s+(?:is|are|was|were)\\s+(?:the\\s+|a\\s+|an\\s+)?(' + KWRX + ')\\s+of\\s+(.+)$', 'i').exec(s);
    if (rev && !kwRegex().test(rev[1])) s = rev[3] + "'s " + rev[2] + ' is ' + rev[1];

    var re = kwRegex(), ms = [], m;
    while ((m = re.exec(s))) ms.push({ idx: m.index, end: m.index + m[0].length, def: KW[m[1].toLowerCase()] });
    if (!ms.length) return null;
    var prefix = s.slice(0, ms[0].idx);
    var segs = ms.map(function (k, i) { return s.slice(k.end, i + 1 < ms.length ? ms[i + 1].idx : s.length); });

    var subject;
    if (!cleanSubject(prefix).names && cleanSubject(prefix).type === 'none' && /^\s*of\s+/i.test(segs[0])) {
      // keyword first: "father of Ramlal Sharma is Bhimrao"
      var txt = segs[0].replace(/^\s*of\s+/i, '');
      var d = /\s*(?::|\b(?:is|are|was|were|named|called|namely)\b)\s*/i.exec(txt);
      var subjTxt = d ? txt.slice(0, d.index) : txt;
      segs[0] = d ? txt.slice(d.index) : '';
      subject = cleanSubject(subjTxt);
      if (subject.type === 'none') subject = { type: 'invalid' };
    } else subject = cleanSubject(prefix);
    if (subject.type === 'invalid') return null;

    // pair keywords with their values; "father and mother are A and B" shares one value list
    var entries = [], pending = [];
    ms.forEach(function (k, i) {
      var vals = cleanValues(segs[i]);
      if (!vals.length) { pending.push(k.def); return; }
      var ks = pending.concat([k.def]); pending = [];
      ks.forEach(function (d2, idx) { entries.push({ kw: d2, values: idx === ks.length - 1 ? vals.slice(idx) : vals.slice(idx, idx + 1) }); });
    });
    entries = entries.filter(function (e) { return e.values.length; });
    if (!entries.length) return null;
    return { subject: subject, entries: entries };
  }

  // ---------- execution state ----------
  function say(st, ok, text) { st.msgs.push({ ok: ok, text: text }); }
  function note(st, id) { st.created.push(id); st.recent = [id].concat(st.recent.filter(function (x) { return x !== id; })).slice(0, 12); }
  function ctxOf(st, correcting) {
    var prefer = correcting ? [st.lastId].concat(st.recent, [st.selectedId]) : [st.selectedId, st.lastId].concat(st.recent);
    return { selectedId: st.selectedId, lastId: st.lastId, prefer: prefer };
  }
  function lookup(st, name, correcting) { return findPerson(st.model, name, ctxOf(st, correcting)); }
  function nm(st, id) { return st.model.displayName(id); }

  function resolveOrCreate(st, name) {
    var id = lookup(st, name);
    if (id) return id;
    var f = fieldsFrom(name);
    if (!f.given && !f.surname) return null;
    id = st.model.addPerson(strip(f));
    note(st, id);
    say(st, true, 'Created ' + nm(st, id));
    return id;
  }

  /** Family (of sid) shared with partner pid, or the default family for new children (not created here). */
  function peekFamily(m, sid, pid) {
    var fs = m.famsAsPartner(sid);
    if (pid) return fs.find(function (f) { return f.partners.indexOf(pid) >= 0; }) || null;
    if (!fs.length) return null;
    return fs.slice().reverse().find(function (f) { return f.partners.length === 2; }) || fs[0];
  }

  function doParent(st, sid, g, nameStr, allowU) {
    var m = st.model, s = m.person(sid), label = g === 'M' ? 'father' : 'mother';
    var f = fieldsFrom(nameStr);
    if (!f.given && !f.surname) return;
    f.gender = g;
    // patrilineal convention (fathers only) – but not for a married woman, whose surname is usually her husband's
    var marriedWoman = s.gender === 'F' && m.partners(sid).length > 0;
    if (g === 'M' && !f.surname && !marriedWoman) f.surname = s.surname;
    var ps = m.parents(sid).map(function (x) { return m.person(x); });
    var ex = ps.find(function (p) { return p.gender === g; });
    if (!ex && allowU && ps.length === 1 && ps[0].gender === 'U') ex = ps[0];
    if (ex) {
      var explicit = f.explicit;
      var same = explicit ? fullC(ex) === compact(f.given + f.surname) : givenC(ex) === compact(f.given);
      if (same) { say(st, true, nm(st, sid) + ' already has ' + label + ' ' + nm(st, ex.id)); note(st, ex.id); return; }
      var old = nm(st, ex.id);
      ex.given = f.given; if (explicit) ex.surname = f.surname; if (ex.gender === 'U') ex.gender = g;
      say(st, true, 'Changed ' + label + ' ' + old + ' → ' + nm(st, ex.id));
      note(st, ex.id); return;
    }
    var cand = findExact(m, f, [sid]);
    if (cand) {
      var err = m.link('parent', sid, cand);
      if (err) { say(st, false, 'Could not link ' + nm(st, cand) + ' as ' + label + ': ' + err); return; }
      if (m.person(cand).gender === 'U') m.person(cand).gender = g;
      say(st, true, 'Linked existing ' + nm(st, cand) + ' as ' + label + ' of ' + nm(st, sid));
      note(st, cand); return;
    }
    var id = m.addParent(sid, strip(f));
    if (!id) { say(st, false, nm(st, sid) + ' already has two parents'); return; }
    note(st, id);
    say(st, true, 'Added ' + label + ' ' + nm(st, id) + ' for ' + nm(st, sid));
  }

  function doChildren(st, sid, partnerId, names, def) {
    var m = st.model, s = m.person(sid);
    var fam = peekFamily(m, sid, partnerId);
    var forTxt = nm(st, sid) + (partnerId ? ' and ' + nm(st, partnerId) : '');
    if (partnerId && !fam) return;
    var male = fam && fam.partners.map(function (x) { return m.person(x); }).find(function (p) { return p && p.gender === 'M'; });
    var sur = male ? male.surname : (s.gender !== 'F' ? s.surname : '');
    names.forEach(function (n) {
      var f = fieldsFrom(n);
      if (!f.given && !f.surname) return;
      if (!f.surname) f.surname = sur;
      if (def.g !== 'U') f.gender = def.g;
      var label = f.gender === 'M' ? 'son' : f.gender === 'F' ? 'daughter' : 'child';
      var dup = m.children(sid).map(function (x) { return m.person(x); }).find(function (p) { return sameName(p, f.explicit ? f : { given: f.given, surname: '' }); });
      if (dup) { say(st, true, nm(st, dup.id) + ' is already a child of ' + forTxt); note(st, dup.id); return; }
      var cand = findExact(m, f, [sid, partnerId]);
      var cp = cand && m.parentFamily(cand);
      if (cand && (f.explicit || !cp) && (!cp || cp.partners.length < 2)) {
        var err = '';
        if (m.ancestors(sid).has(cand) || (partnerId && m.ancestors(partnerId).has(cand))) err = 'That would create a loop (they are already an ancestor).';
        else if (partnerId) { m.unlinkFromParents(cand); fam = peekFamily(m, sid, partnerId) || fam; fam.children.push(cand); }
        else err = m.link('child', sid, cand);
        if (err) { say(st, false, 'Could not link ' + nm(st, cand) + ' as ' + label + ': ' + err); return; }
        if (m.person(cand).gender === 'U' && f.gender !== 'U') m.person(cand).gender = f.gender;
        say(st, true, 'Linked existing ' + nm(st, cand) + ' as ' + label + ' of ' + forTxt);
        note(st, cand); return;
      }
      var id = m.addChild(sid, strip(f), fam && fam.id);
      note(st, id);
      say(st, true, 'Added ' + label + ' ' + nm(st, id) + ' for ' + forTxt);
    });
  }

  function doSiblings(st, sid, names, def) {
    var m = st.model, s = m.person(sid);
    names.forEach(function (n) {
      var f = fieldsFrom(n);
      if (!f.given && !f.surname) return;
      if (!f.surname) f.surname = s.surname;
      if (def.g !== 'U') f.gender = def.g;
      var label = f.gender === 'M' ? 'brother' : f.gender === 'F' ? 'sister' : 'sibling';
      var dup = m.siblings(sid).map(function (x) { return m.person(x); }).find(function (p) { return sameName(p, f.explicit ? f : { given: f.given, surname: '' }); });
      if (dup) { say(st, true, nm(st, dup.id) + ' is already a sibling of ' + nm(st, sid)); note(st, dup.id); return; }
      var cand = findExact(m, f, [sid]);
      if (cand && (!m.parentFamily(cand) || !m.parentFamily(sid))) {
        var err = m.link('sibling', sid, cand);
        if (err) { say(st, false, 'Could not link ' + nm(st, cand) + ' as ' + label + ': ' + err); return; }
        say(st, true, 'Linked existing ' + nm(st, cand) + ' as ' + label + ' of ' + nm(st, sid));
        note(st, cand); return;
      }
      var id = m.addSibling(sid, strip(f));
      note(st, id);
      say(st, true, 'Added ' + label + ' ' + nm(st, id) + ' for ' + nm(st, sid));
    });
  }

  function doPartners(st, sid, names, def) {
    var m = st.model;
    names.forEach(function (n) {
      var f = fieldsFrom(n);
      if (!f.given && !f.surname) return;
      if (def.g !== 'U') f.gender = def.g;
      var label = def.label;
      var dup = m.partners(sid).map(function (x) { return m.person(x); }).find(function (p) { return sameName(p, f); });
      if (dup) { say(st, true, nm(st, dup.id) + ' is already ' + nm(st, sid) + "'s " + label); note(st, dup.id); return; }
      var me = m.person(sid);
      if (me.gender === 'U' && def.g !== 'U') me.gender = def.g === 'F' ? 'M' : 'F'; // "his wife" implies a man
      var cand = findExact(m, f, [sid]);
      if (cand) {
        var err = m.link('partner', sid, cand);
        if (err) { say(st, false, 'Could not link ' + nm(st, cand) + ' as ' + label + ': ' + err); return; }
        say(st, true, 'Linked existing ' + nm(st, cand) + ' as ' + label + ' of ' + nm(st, sid));
        note(st, cand); return;
      }
      var id = m.addPartner(sid, strip(f));
      note(st, id);
      say(st, true, 'Added ' + label + ' ' + nm(st, id) + ' for ' + nm(st, sid));
    });
  }

  function execRelation(st, rel) {
    var m = st.model, ids = [], subj = rel.subject;
    var firstLabel = rel.entries[0].kw.label;
    if (subj.type === 'none' || subj.type === 'pron') {
      var id = subj.type === 'none' ? (st.selectedId || st.lastId) : (st.lastId || st.selectedId);
      if (!id || !m.person(id)) { say(st, false, 'Click a person first or say whose ' + firstLabel); return; }
      ids = [id];
    } else {
      subj.names.forEach(function (n) { var x = resolveOrCreate(st, n); if (x && ids.indexOf(x) < 0) ids.push(x); });
      if (!ids.length) { say(st, false, 'I could not make out whose ' + firstLabel + ' that is'); return; }
    }
    var sid = ids[0], partnerId = null;
    if (ids.length > 1 && rel.entries.some(function (e) { return e.kw.rel === 'child'; })) {
      partnerId = ids[1];
      if (m.partners(sid).indexOf(partnerId) < 0) {
        var le = m.link('partner', sid, partnerId);
        if (le) { say(st, false, le); return; }
        say(st, true, 'Linked ' + nm(st, sid) + ' and ' + nm(st, partnerId) + ' as partners');
      }
    }
    st.focusId = sid;
    rel.entries.forEach(function (e) {
      var d = e.kw;
      if (d.rel === 'father') doParent(st, sid, 'M', e.values[0], false);
      else if (d.rel === 'mother') doParent(st, sid, 'F', e.values[0], false);
      else if (d.rel === 'parents') {
        doParent(st, sid, 'M', e.values[0], true);
        if (e.values[1]) doParent(st, sid, 'F', e.values[1], true);
      }
      else if (d.rel === 'child') doChildren(st, sid, partnerId, e.values, d);
      else if (d.rel === 'sibling') doSiblings(st, sid, e.values, d);
      else if (d.rel === 'partner') doPartners(st, sid, e.values, d);
    });
    st.lastId = st.created.length ? st.created[st.created.length - 1] : sid;
  }

  // ---------- other commands ----------
  var MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  var DATE_RX = new RegExp('\\b(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MONTH + ',?\\s+\\d{4}|' + MONTH + '\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|' + MONTH + ',?\\s+\\d{4}|\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|\\d{4})\\b', 'i');

  /** "in 1950 in Pune" / "on 12 March 1950" / "at Delhi in 2001" -> {date, place} */
  function dateAndPlace(rest) {
    var date = '', m = DATE_RX.exec(rest);
    if (m) { date = titleCase(m[0].replace(/\bof\s+/i, '')); rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length); }
    var t = toks(rest).filter(function (w) { return w !== ',' && w !== ':'; });
    while (t.length && /^(in|at|on|the|year|near|from|of|and)$/i.test(t[0])) t.shift();
    while (t.length && /^(in|at|on|the|year|near|from|of|and)$/i.test(t[t.length - 1])) t.pop();
    return { date: date, place: titleCase(t.join(' ')) };
  }

  /** Person for a phrase; understands "Ram's father", "mother of Ram", pronouns and plain names. */
  function resolvePerson(st, text) {
    text = normalise(text).replace(/^the\s+/i, '');
    var m = st.model;
    var rm = /^(.*?)\s*(?:'s|s)?\s+(father|dad|papa|mother|mom|mum|mummy|maa|wife|husband|spouse|partner|brother|sister|son|daughter)$/i.exec(text) ||
             /^(father|dad|papa|mother|mom|mum|mummy|maa|wife|husband|spouse|partner|brother|sister|son|daughter)\s+of\s+(.+)$/i.exec(text);
    if (rm) {
      var swap = /^(father|dad|papa|mother|mom|mum|mummy|maa|wife|husband|spouse|partner|brother|sister|son|daughter)$/i.test(rm[1]);
      var base = swap ? rm[2] : rm[1], word = (swap ? rm[1] : rm[2]).toLowerCase();
      var bid = base.trim() ? resolvePerson(st, base) : (st.selectedId || st.lastId);
      if (bid && m.person(bid)) {
        var d = KW[word], pool;
        if (d.rel === 'father' || d.rel === 'mother') pool = m.parents(bid);
        else if (d.rel === 'partner') pool = m.partners(bid);
        else if (d.rel === 'sibling') pool = m.siblings(bid);
        else pool = m.children(bid);
        var hit = pool.find(function (x) { return d.g === 'U' || m.person(x).gender === d.g; });
        if (hit) return hit;
        if (pool.length === 1 && d.g === 'U') return pool[0];
        return null;
      }
    }
    return lookup(st, text);
  }

  function doRename(st, id, newStr, exact) {
    var m = st.model, p = m.person(id), f = fieldsFrom(newStr);
    if (!f.given && !f.surname) { say(st, false, 'I did not catch the new name'); return; }
    // a lone first name keeps the existing surname, except for "change A to B", where B is taken exactly as said
    if (!f.surname && !exact) f.surname = p.surname;
    var old = nm(st, id);
    p.given = f.given; p.surname = f.surname;
    if (f.gender !== 'U') p.gender = f.gender;
    if (f.living === false) p.living = false;
    var now = nm(st, id);
    say(st, true, old === now ? now + ' is already named that' : 'Renamed ' + old + ' → ' + now);
    note(st, id); st.focusId = id; st.lastId = id;
  }

  /** Corrections, in all phrasings. Returns true if handled. */
  function tryCorrection(st, s, hadLead) {
    var m, id, IT = "(?:it\\s+is|it's|its|it\\s+was|that\\s+is|that's|that\\s+was)";
    // "(it is) not OLD [,/but/it is] NEW"
    m = new RegExp('^(?:' + IT + '\\s+)?not\\s+(.+?)\\s*(?:,|\\bbut\\b|\\brather\\b|\\bactually\\b|(?=\\b' + IT + '\\s))\\s*(?:(?:' + IT + '|but|rather|actually)\\s+)*(.+)$', 'i').exec(s);
    if (m) {
      id = lookup(st, m[1], true);
      if (!id && st.lastId && st.model.person(st.lastId)) id = st.lastId;
      if (!id) { say(st, false, 'I could not find ' + m[1] + ' to correct'); return true; }
      doRename(st, id, m[2]); return true;
    }
    // "change (the name of) A to B (and C to D …)" / "rename A's name to B"
    var cm = /^(?:please\s+)?(?:change|rename|correct|edit|fix|update|modify|make)\s+(.+\s(?:to|as|into)\s.+)$/i.exec(s);
    if (cm) {
      var rest = cm[1], pairs = [], pr, PAIR = /(.+?)\s+(?:to|as|into)\s+(.+?)(?=\s+and\s+.+?\s+(?:to|as|into)\s+|$)/gi;
      rest = rest.replace(/^(?:the\s+)?names?\s+of\s+/i, '');
      while ((pr = PAIR.exec(rest))) pairs.push([pr[1].replace(/^\s*(?:and\s+)?(?:the\s+)?(?:names?\s+of\s+)?/i, ''), pr[2]]);
      if (pairs.length) {
        pairs.forEach(function (pp) {
          var who = pp[0].replace(/(?:'s|s')?\s+names?$/i, '').trim();
          var target = lookup(st, who, true);
          if (!target) { say(st, false, 'I could not find ' + who + ' in the tree'); return; }
          doRename(st, target, pp[1], true);
        });
        return true;
      }
    }
    m = /^replace\s+(.+?)\s+with\s+(.+)$/i.exec(s) ||
        /^(.+?)\s+should\s+(?:be|read)\s+(.+)$/i.exec(s);
    if (m) {
      id = lookup(st, m[1], true);
      if (!id) { say(st, false, 'I could not find ' + m[1] + ' in the tree'); return true; }
      doRename(st, id, m[2]); return true;
    }
    // "no, it's NEW" / "sorry, NEW" / "correction NEW" -> rename the person touched last
    var nameOnly = s.replace(new RegExp('^' + IT + '\\s+', 'i'), '');
    var looksName = /^[\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*){0,3}$/u.test(nameOnly) && !kwRegex().test(nameOnly);
    if (looksName && (hadLead || nameOnly !== s)) {
      if (!st.lastId || !st.model.person(st.lastId)) { say(st, false, 'Nothing to correct yet. Say whose name to change.'); return true; }
      doRename(st, st.lastId, nameOnly); return true;
    }
    return false;
  }

  /** Facts about a person. Returns true if handled. */
  function tryFact(st, s) {
    var m = st.model, r, id, dp;
    function subject(txt) { return resolvePerson(st, txt); }
    function miss(txt) { say(st, false, 'I could not find ' + txt + ' in the tree'); return true; }

    if ((r = /^(.+?)\s+(?:was\s+|is\s+)?born\b\s*(.*)$/i.exec(s))) {
      id = subject(r[1]); if (!id) return false;
      dp = dateAndPlace(r[2]);
      if (!dp.date && !dp.place) { say(st, false, 'When or where was ' + nm(st, id) + ' born?'); return true; }
      var p = m.person(id);
      if (dp.date) p.birth.date = dp.date;
      if (dp.place) p.birth.place = dp.place;
      say(st, true, 'Set birth of ' + nm(st, id) + [dp.date, dp.place].filter(Boolean).map(function (x, i) { return (i ? ' in ' : ': ') + x; }).join(''));
      st.focusId = id; st.lastId = id; return true;
    }
    if ((r = /^(.+?)\s+(?:has\s+|had\s+)?(?:died|passed\s+away|passed\s+on|passed|expired|breathed\s+his\s+last|breathed\s+her\s+last)\b\s*(.*)$/i.exec(s))) {
      id = subject(r[1]); if (!id) return false;
      dp = dateAndPlace(r[2]);
      var q = m.person(id);
      q.living = false;
      if (dp.date) q.death.date = dp.date;
      if (dp.place) q.death.place = dp.place;
      say(st, true, 'Marked ' + nm(st, id) + ' as deceased' + [dp.date, dp.place].filter(Boolean).map(function (x, i) { return (i ? ' in ' : ': ') + x; }).join(''));
      st.focusId = id; st.lastId = id; return true;
    }
    if ((r = /^(.+?)\s+(?:is|was)\s+(?:no\s+more|late|dead|deceased|gone)$/i.exec(s))) {
      id = subject(r[1]); if (!id) return false;
      m.person(id).living = false;
      say(st, true, 'Marked ' + nm(st, id) + ' as deceased'); st.focusId = id; st.lastId = id; return true;
    }
    if ((r = /^(.+?)\s+(?:is|was)\s+(?:still\s+)?(?:alive|living)$/i.exec(s))) {
      id = subject(r[1]); if (!id) return false;
      m.person(id).living = true;
      say(st, true, 'Marked ' + nm(st, id) + ' as living'); st.focusId = id; st.lastId = id; return true;
    }
    if ((r = /^(.+?)\s+(?:is|was)\s+(?:a\s+|an\s+)?(male|female|boy|girl|man|woman|gentleman|lady)$/i.exec(s))) {
      id = subject(r[1]); if (!id) return false;
      var g = /^(male|boy|man|gentleman)$/i.test(r[2]) ? 'M' : 'F';
      m.person(id).gender = g;
      say(st, true, 'Set ' + nm(st, id) + ' as ' + (g === 'M' ? 'male' : 'female')); st.focusId = id; st.lastId = id; return true;
    }
    return false;
  }

  function trySimple(st, s) {
    var r;
    if ((r = /^(?:delete|remove|erase)\s+(.+)$/i.exec(s))) {
      var id = resolvePerson(st, r[1]);
      if (!id) { say(st, false, 'I could not find ' + r[1] + ' in the tree'); return true; }
      var name = nm(st, id);
      st.model.deletePerson(id);
      if (st.lastId === id) st.lastId = null;
      if (st.focusId === id) st.focusId = null;
      st.recent = st.recent.filter(function (x) { return x !== id; });
      say(st, true, 'Deleted ' + name); return true;
    }
    if ((r = /^(?:select|show|go\s+to|goto|find|focus(?:\s+on)?|where\s+is|open)\s+(.+)$/i.exec(s))) {
      var sid = resolvePerson(st, r[1]);
      if (!sid) { say(st, false, 'I could not find ' + r[1] + ' in the tree'); return true; }
      st.focusId = sid; st.lastId = sid;
      say(st, true, 'Showing ' + nm(st, sid)); return true;
    }
    return false;
  }

  /** Turn other common word orders into "X's REL is NAMES", which parseRelation understands. */
  var RELW = '(?:father|dad|papa|mother|mom|mum|mummy|maa|parents?|sons?|daughters?|child|children|kids?|brothers?|sisters?|siblings?|wife|husband|spouse|partner)';
  function rephrase(s) {
    var r, VERB = '(?:create|add|make|set|put|insert|enter|include|record|mark|show)';
    // "create A and B as X's parents" / "add Aditi as Mahesh's daughter"
    if ((r = new RegExp('^(?:' + VERB + '\\s+)?(.+?)\\s+as\\s+(?:the\\s+|a\\s+|an\\s+)?(.+?)(?:\'s|s\')\\s+(' + RELW + ')$', 'i').exec(s))) return r[2] + "'s " + r[3] + ' is ' + r[1];
    // "add Aditi as (a) daughter of/to/for Mahesh"
    if ((r = new RegExp('^(?:' + VERB + '\\s+)?(.+?)\\s+as\\s+(?:the\\s+|a\\s+|an\\s+)?(' + RELW + ')\\s+(?:of|to|for)\\s+(.+)$', 'i').exec(s))) return r[3] + "'s " + r[2] + ' is ' + r[1];
    // "A and B are X's parents" / "Bhimrao is Ramlal's father"
    if ((r = new RegExp('^(.+?)\\s+(?:is|are|was|were)\\s+(?:the\\s+)?(.+?)(?:\'s|s\')\\s+(' + RELW + ')$', 'i').exec(s))) return r[2] + "'s " + r[3] + ' is ' + r[1];
    // "A and B are the parents of X"
    if ((r = new RegExp('^(.+?)\\s+(?:is|are|was|were)\\s+(?:the\\s+|a\\s+|an\\s+)?(' + RELW + ')\\s+(?:of|to)\\s+(.+)$', 'i').exec(s))) return r[3] + "'s " + r[2] + ' is ' + r[1];
    return s;
  }

  var LEAD = /^(?:no|nope|sorry|oops|wait|correction|i\s+mean|i\s+meant|make\s+that|actually)\b[\s,:-]*/i;
  var POLITE = /^(?:ok(?:ay)?|please|and|also|so|now|hey\s+tree|tell\s+the\s+tree|tree|add|note\s+that)\b[\s,]*/i;

  /** Returns 'undo' | 'redo' | undefined. */
  function doSentence(st, s) {
    while (POLITE.test(s) && s.replace(POLITE, '')) s = s.replace(POLITE, '');
    if (/^(?:please\s+)?(?:undo(?:\s+(?:that|last|it|the\s+last(?:\s+one)?|last\s+change))?|go\s+back|step\s+back)$/i.test(s)) return 'undo';
    if (/^(?:redo(?:\s+(?:that|it))?|do\s+it\s+again)$/i.test(s)) return 'redo';

    var hadLead = LEAD.test(s);
    var body = hadLead ? s.replace(LEAD, '') : s;
    // order: explicit correction patterns, simple commands, facts, relations, bare-name correction
    if (body && tryCorrection(st, body, false)) return;
    if (body && trySimple(st, body)) return;
    if (body && tryFact(st, body)) return;
    if (body) body = rephrase(body);
    var rel = body ? parseRelation(body) : null;
    if (rel) { execRelation(st, rel); return; }
    if (hadLead && body && tryCorrection(st, body, true)) return;
    if (!hadLead && /^(?:it\s+is|it's|that\s+is|that's)\s+\S/i.test(s) && tryCorrection(st, s, false)) return;
    say(st, false, 'Sorry, I didn\'t understand: "' + s + '". Try: "Ram Sharma\'s father is Bhimrao and mother is Sita", "Mahesh has a son named Amit", or "undo".');
  }

  function run(model, text, ctx) {
    ctx = ctx || {};
    var st = {
      model: model, msgs: [], focusId: null, lastId: ctx.lastId || null, selectedId: ctx.selectedId || null,
      created: [], recent: []
    };
    if (st.lastId && !model.person(st.lastId)) st.lastId = null;
    if (st.selectedId && !model.person(st.selectedId)) st.selectedId = null;
    var t = normalise(text);
    // split into sentences, but never on the dots of initials ("R.S. Sengar") or titles ("Dr. Rao")
    var sentences = t.split(/;+|(?<!(?:^|[\s.])\p{L})(?<!\b(?:Dr|Mr|Mrs|Ms|Smt|Shri|Sri|Lt|St|Jr|Sr|Prof|Capt|Col|Maj|Gen))[.!?]+(?=\s|$)|\bthen\b/iu)
      .map(function (x) { return x.replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '').replace(/\s+and$/i, '').trim(); })
      .filter(Boolean);
    if (!sentences.length) { say(st, false, 'I did not hear anything.'); return { msgs: st.msgs, special: null, focusId: null, lastId: st.lastId }; }
    var special = null;
    for (var i = 0; i < sentences.length; i++) {
      st.created = []; // lastId = last person created in this sentence, else its subject
      var r = doSentence(st, sentences[i]);
      if (r) { special = r; say(st, true, r === 'undo' ? 'Undoing the last change' : 'Redoing'); break; }
    }
    if (st.focusId && !model.person(st.focusId)) st.focusId = null;
    return { msgs: st.msgs, special: special, focusId: st.focusId, lastId: st.lastId };
  }

  return { run: run, findPerson: findPerson };
})();
