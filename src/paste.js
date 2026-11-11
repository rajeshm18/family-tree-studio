window.FT = window.FT || {};

FT.Paste = (function () {
  'use strict';

  var TITLES = /^(late|lt|swargiya|mr|mrs|ms|miss|smt|shri|shree|sri|kumari)\.?$/i;
  var FEMALE_T = /^(mrs|ms|miss|smt|kumari)\.?$/i;
  var MALE_T = /^(mr|shri|shree|sri)\.?$/i;
  var DEATH_T = /^(late|lt|swargiya)\.?$/i;
  var MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
  var DATE_RE = '(?:\\d{1,2}\\s+' + MONTH + '\\s+\\d{3,4}|' + MONTH + '\\s+\\d{1,2},?\\s+\\d{3,4}|' + MONTH + '\\s+\\d{3,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[\\/.]\\d{1,2}[\\/.]\\d{3,4}|(?:abt|about|c|ca|circa|est)\\.?\\s*\\d{3,4}|\\d{3,4})';

  function emptyPerson() {
    return {
      given: '', surname: '', nick: '', gender: 'U',
      birth: { date: '', place: '' }, death: { date: '', place: '' }, living: null
    };
  }

  // "1950, Mumbai" -> {date, place}
  function datePlace(s) {
    s = (s || '').trim();
    var i = s.indexOf(',');
    var d = s, p = '';
    // a comma inside "12 Mar, 1950" style is rare; split only if text after comma is not a year
    if (i >= 0 && !/^\s*\d{3,4}\s*$/.test(s.slice(i + 1))) { d = s.slice(0, i); p = s.slice(i + 1); }
    return { date: d.trim().replace(/[.\s]+$/, ''), place: p.trim() };
  }

  function parseParen(c, r) {
    c = c.trim();
    if (!c) return;
    if (/^(m|male)$/i.test(c)) { r.gender = 'M'; r._g = true; return; }
    if (/^(f|female)$/i.test(c)) { r.gender = 'F'; r._g = true; return; }
    if (/^(u|unknown)$/i.test(c)) { r._g = true; return; }
    if (/^(late|deceased|dec\.?|expired|died)$/i.test(c)) { r.living = false; return; }
    if (/^(living|alive)$/i.test(c)) { r.living = true; return; }
    var m;
    if ((m = /^(?:b\.?|born)\s*(.*)$/i.exec(c))) { r.birth = datePlace(m[1]); return; }
    if ((m = /^(?:d\.?|died|death)\s*(.*)$/i.exec(c))) { r.death = datePlace(m[1]); r.living = false; return; }
    if (!/\d/.test(c)) return; // unknown non-date note: dropped
    // range "a - b"
    m = /^(.*?)\s*(?:[–—]|-(?!\d{1,2}\b)|\s-\s)\s*(.*)$/.exec(c);
    if (m) {
      var a = datePlace(m[1]), b = datePlace(m[2]);
      r.birth = a;
      if (b.date || b.place) { r.death = b; r.living = false; }
      return;
    }
    r.birth = datePlace(c);
  }

  function parseName(str) {
    var r = emptyPerson();
    var s = String(str == null ? '' : str).trim();
    // bullets / numbering
    s = s.replace(/^(?:[-*•·–●▪>]+|\d+[.)]|[a-zA-Z]\))\s+/, '');
    s = s.replace(/^(?:[-*•·●]+)(?=\S)/, '');
    // gender symbols
    if (/♂/.test(s)) { r.gender = 'M'; r._g = true; s = s.replace(/♂️?/g, ' '); }
    if (/♀/.test(s)) { r.gender = 'F'; r._g = true; s = s.replace(/♀️?/g, ' '); }
    // nickname in quotes
    s = s.replace(/["“”]([^"“”]+)["“”]/, function (_, n) { r.nick = n.trim(); return ' '; });
    // parenthetical / bracket groups
    s = s.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, function (_, a, b) {
      parseParen(a != null ? a : b, r);
      return ' ';
    });
    // bare b.1950 / d.2001
    var bare = new RegExp('(^|[\\s,;])([bd])\\.\\s*(' + DATE_RE + ')(?=$|[\\s,;])', 'ig');
    s = s.replace(bare, function (_, pre, k, d) {
      if (k.toLowerCase() === 'b') r.birth.date = d.trim();
      else { r.death.date = d.trim(); r.living = false; }
      return pre + ' ';
    });
    s = s.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^[-–—:]+\s*|\s*[-–—:]+$/g, '').trim();

    var toks = s ? s.split(' ') : [];
    var hint = '';
    while (toks.length > 1 && TITLES.test(toks[0])) {
      var t = toks.shift();
      if (DEATH_T.test(t)) r.living = false;
      else if (FEMALE_T.test(t)) hint = 'F';
      else if (MALE_T.test(t)) hint = 'M';
    }
    if (!r._g && hint) r.gender = hint;
    if (r.death.date) r.living = false;
    if (toks.length === 1) r.given = toks[0];
    else if (toks.length > 1) { r.surname = toks[toks.length - 1]; r.given = toks.slice(0, -1).join(' '); }
    delete r._g;
    return r;
  }

  // Positions of partner separators outside brackets/quotes.
  function splitPartners(line) {
    var masked = '', depth = 0, q = false, i, ch;
    for (i = 0; i < line.length; i++) {
      ch = line[i];
      if (ch === '(' || ch === '[') depth++;
      if ((ch === '"' || ch === '“' || ch === '”')) q = !q;
      masked += (depth > 0 || q) ? '_' : ch;
      if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    }
    var re = /\s+(?:\+|&|married\s+to|weds)\s+|\s*\+\s*(?=\S)/ig, parts = [], last = 0, m;
    while ((m = re.exec(masked))) {
      parts.push(line.slice(last, m.index));
      last = m.index + m[0].length;
    }
    parts.push(line.slice(last));
    return parts;
  }
  function hasPartnerSep(line) { return splitPartners(line).length > 1; }

  function splitTopLevel(line, seps) {
    var out = [], cur = '', depth = 0, i, ch;
    for (i = 0; i < line.length; i++) {
      ch = line[i];
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      if (depth === 0 && seps.indexOf(ch) >= 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  var SPOUSE_RE = /^\s*(?:[-*•·]\s+)?(?:spouse|wife|husband|partner)\s*:\s*/i;

  function lineToNode(text) {
    var parts = splitPartners(text), people = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parseName(parts[i]);
      if (p.given || p.surname) people.push(p);
    }
    if (!people.length) return null;
    return { person: people[0], partners: people.slice(1), children: [] };
  }

  function parse(text) {
    var raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var lines = [];
    raw.forEach(function (l) {
      l = l.replace(/\t/g, '    ');
      if (!l.trim()) return;
      lines.push({ indent: /^ */.exec(l)[0].length, text: l.trim() });
    });
    if (!lines.length) return { kind: 'list', roots: [] };

    // single line with commas / semicolons -> list
    if (lines.length === 1 && !hasPartnerSep(lines[0].text) && !SPOUSE_RE.test(lines[0].text)) {
      var bits = splitTopLevel(lines[0].text, ',;');
      if (bits.length > 1) {
        var roots1 = [];
        bits.forEach(function (b) { var n = lineToNode(b); if (n) roots1.push(n); });
        return { kind: 'list', roots: roots1 };
      }
    }

    var sameIndent = lines.every(function (l) { return l.indent === lines[0].indent; });
    var anyComplex = lines.some(function (l) { return hasPartnerSep(l.text) || SPOUSE_RE.test(l.text); });
    var kind = (sameIndent && !anyComplex) ? 'list' : 'outline';

    var roots = [], stack = [];
    lines.forEach(function (l) {
      var isSpouse = SPOUSE_RE.test(l.text);
      var body = isSpouse ? l.text.replace(SPOUSE_RE, '') : l.text;
      var node = lineToNode(body);
      if (!node) return;
      if (kind === 'list') { roots.push(node); return; }
      while (stack.length && stack[stack.length - 1].indent >= l.indent) stack.pop();
      var parent = stack.length ? stack[stack.length - 1].node : null;
      if (isSpouse) {
        var target = parent || roots[roots.length - 1];
        if (target) {
          target.partners.push(node.person);
          node.partners.forEach(function (p) { target.partners.push(p); });
          return; // not pushed on stack
        }
      }
      if (parent) parent.children.push(node); else roots.push(node);
      stack.push({ indent: l.indent, node: node });
    });
    return { kind: kind, roots: roots };
  }

  return { parseName: parseName, parse: parse };
})();
