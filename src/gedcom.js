/* gedcom.js - GEDCOM 5.5.1 import/export (classic script, no modules).
 * Exposes FT.Gedcom.parse(text) -> data and FT.Gedcom.write(data) -> string.
 * See PLAN.md "Data model" for the data contract. */
(function () {
  'use strict';
  window.FT = window.FT || {};

  // ---------- helpers ----------
  var used = {};
  function newId(prefix) {
    var id;
    do {
      id = prefix;
      for (var i = 0; i < 8; i++) id += Math.floor(Math.random() * 36).toString(36);
    } while (used[id]);
    used[id] = true;
    return id;
  }
  // First child node with a given tag (or null).
  function child(node, tag) {
    for (var i = 0; i < node.children.length; i++) if (node.children[i].tag === tag) return node.children[i];
    return null;
  }
  function children(node, tag) {
    return node.children.filter(function (c) { return c.tag === tag; });
  }
  function val(node, tag) {
    var c = child(node, tag);
    return c ? c.value : '';
  }

  // ---------- parsing ----------
  // Turn raw text into a forest of {level, xref, tag, value, children}, merging CONT/CONC.
  function buildTree(text) {
    text = String(text || '').replace(/^﻿/, '');
    var lines = text.split(/\r\n|\r|\n/);
    var roots = [], stack = [];
    var re = /^\s*(\d+)\s+(?:(@[^@\s]+@)\s+)?([^\s]+)(?: (.*))?$/;
    lines.forEach(function (line) {
      var m = re.exec(line);
      if (!m) return;
      var level = parseInt(m[1], 10), tag = m[3].toUpperCase();
      var value = m[4] === undefined ? '' : m[4];
      var parent = level > 0 ? stack[level - 1] : null;
      if ((tag === 'CONT' || tag === 'CONC') && parent) {
        parent.value += (tag === 'CONT' ? '\n' : '') + value;
        return;
      }
      var node = { level: level, xref: m[2] || '', tag: tag, value: value, children: [] };
      if (level === 0) roots.push(node);
      else if (parent) parent.children.push(node);
      else return; // orphan line (bad nesting) - ignore
      stack.length = level;
      stack[level] = node;
    });
    return roots;
  }

  function emptyPerson(id) {
    return {
      id: id, given: '', surname: '', nick: '', gender: 'U',
      birth: { date: '', place: '' }, death: { date: '', place: '' },
      living: null, photo: '', notes: '', tags: [], color: ''
    };
  }

  function parse(text) {
    used = {};
    var roots = buildTree(text);
    var noteRecs = {}, indis = [], fams = [], head = null;
    roots.forEach(function (r) {
      if (r.tag === 'HEAD') head = r;
      else if (r.tag === 'NOTE' && r.xref) noteRecs[r.xref] = r.value;
      else if (r.tag === 'INDI') indis.push(r);
      else if (r.tag === 'FAM') fams.push(r);
    });

    var now = new Date().toISOString();
    var title = 'Imported tree';
    if (head) {
      var f = val(head, 'FILE').replace(/^.*[\\\/]/, '').replace(/\.ged$/i, '').trim();
      if (f) title = f;
    }
    var data = { version: 1, meta: { title: title, created: now, modified: now }, people: {}, families: {}, settings: {} };

    // INDI -> people; remember xref -> id and each person's FAMC links (with PEDI).
    var pid = {}, famcLinks = {}; // famcLinks[famXref][personId] = pedi
    indis.forEach(function (rec) {
      var id = newId('p');
      pid[rec.xref] = id;
      var p = emptyPerson(id);
      var nameNode = child(rec, 'NAME');
      if (nameNode) {
        var m = /^([^\/]*)(?:\/([^\/]*)\/?)?(.*)$/.exec(nameNode.value);
        p.given = (m[1] || '').trim();
        p.surname = (m[2] || '').trim();
        var givn = val(nameNode, 'GIVN').trim(), surn = val(nameNode, 'SURN').trim();
        if (givn) p.given = givn;
        if (surn) p.surname = surn;
        p.nick = val(nameNode, 'NICK').trim();
      }
      if (!p.nick) p.nick = val(rec, 'NICK').trim();
      var sex = val(rec, 'SEX').trim().toUpperCase().charAt(0);
      p.gender = sex === 'M' || sex === 'F' ? sex : 'U';
      var b = child(rec, 'BIRT');
      if (b) p.birth = { date: val(b, 'DATE').trim(), place: val(b, 'PLAC').trim() };
      var d = child(rec, 'DEAT');
      if (d) {
        p.death = { date: val(d, 'DATE').trim(), place: val(d, 'PLAC').trim() };
        if (!p.death.date) p.living = false;
      }
      // Notes: inline text or pointer to a NOTE record.
      p.notes = children(rec, 'NOTE').map(function (n) {
        return /^@[^@]+@$/.test(n.value.trim()) ? (noteRecs[n.value.trim()] || '') : n.value;
      }).filter(Boolean).join('\n\n');
      children(rec, 'FAMC').forEach(function (fc) {
        var x = fc.value.trim();
        (famcLinks[x] = famcLinks[x] || {})[id] = val(fc, 'PEDI').trim().toLowerCase();
      });
      data.people[id] = p;
    });

    // FAM -> families
    fams.forEach(function (rec) {
      var id = newId('f');
      var partners = [];
      ['HUSB', 'WIFE'].forEach(function (t) {
        var x = val(rec, t).trim();
        if (pid[x]) partners.push(pid[x]);
      });
      var kids = [], rel = {};
      var links = famcLinks[rec.xref] || {};
      children(rec, 'CHIL').forEach(function (c) {
        var cid = pid[c.value.trim()];
        if (!cid || kids.indexOf(cid) >= 0) return;
        kids.push(cid);
        var pedi = links[cid];
        rel[cid] = /^(adopted|step|foster)$/.test(pedi) ? pedi : 'birth';
      });
      // Children that only declare FAMC (no CHIL in the FAM) are still added.
      Object.keys(links).forEach(function (cid) {
        if (kids.indexOf(cid) < 0) {
          kids.push(cid);
          rel[cid] = /^(adopted|step|foster)$/.test(links[cid]) ? links[cid] : 'birth';
        }
      });
      var marr = child(rec, 'MARR');
      var status = child(rec, 'DIV') ? 'divorced' : marr ? 'married' : '';
      var custom = val(rec, '_STATUS').trim().toLowerCase(); // our own round-trip tag
      if (/^(married|partner|divorced|separated|widowed)$/.test(custom)) status = custom;
      data.families[id] = {
        id: id, partners: partners, children: kids, childRel: rel, status: status,
        marriage: marr ? { date: val(marr, 'DATE').trim(), place: val(marr, 'PLAC').trim() } : { date: '', place: '' }
      };
    });
    return data;
  }

  // ---------- writing ----------
  // Emit a value at `level`, using CONT for newlines and CONC for chunks over 200 chars.
  function emit(out, level, tag, value) {
    var parts = String(value).split(/\r\n|\r|\n/);
    parts.forEach(function (part, i) {
      var lvl = i === 0 ? level : level + 1, t = i === 0 ? tag : 'CONT';
      var chunk = part.slice(0, 200);
      // don't split a surrogate pair
      if (part.length > 200 && /[\uD800-\uDBFF]$/.test(chunk)) chunk = part.slice(0, 199);
      var rest = part.slice(chunk.length);
      out.push(lvl + ' ' + t + (chunk ? ' ' + chunk : ''));
      while (rest.length) {
        var c = rest.slice(0, 200);
        if (rest.length > 200 && /[\uD800-\uDBFF]$/.test(c)) c = rest.slice(0, 199);
        rest = rest.slice(c.length);
        out.push((level + 1) + ' CONC ' + c);
      }
    });
  }
  function simple(out, level, tag, v) {
    if (v) emit(out, level, tag, v);
  }
  // Event block (BIRT/DEAT/MARR). `flag` writes "Y" if the event has no detail.
  function event(out, tag, ev, flag) {
    var date = ev && ev.date, place = ev && ev.place;
    if (!date && !place) { if (flag) out.push('1 ' + tag + ' Y'); return; }
    out.push('1 ' + tag);
    simple(out, 2, 'DATE', date);
    simple(out, 2, 'PLAC', place);
  }

  function write(data) {
    var people = data.people || {}, families = data.families || {};
    var pids = Object.keys(people), fids = Object.keys(families);
    var ix = {}, fx = {};
    pids.forEach(function (id, i) { ix[id] = '@I' + (i + 1) + '@'; });
    fids.forEach(function (id, i) { fx[id] = '@F' + (i + 1) + '@'; });

    // Decide which partner is HUSB / WIFE.
    function roles(fam) {
      var ps = (fam.partners || []).filter(function (id) { return people[id]; });
      var g = function (id) { return people[id].gender; };
      if (ps.length === 1) return g(ps[0]) === 'F' ? { w: ps[0] } : { h: ps[0] };
      if (ps.length >= 2) {
        var a = ps[0], b = ps[1];
        if ((g(a) === 'F' && g(b) !== 'F') || (g(b) === 'M' && g(a) !== 'M')) return { h: b, w: a };
        return { h: a, w: b };
      }
      return {};
    }

    var famsOf = {}, famcOf = {};
    fids.forEach(function (fid) {
      var fam = families[fid];
      (fam.partners || []).forEach(function (p) { if (people[p]) (famsOf[p] = famsOf[p] || []).push(fid); });
      (fam.children || []).forEach(function (c) { if (people[c]) (famcOf[c] = famcOf[c] || []).push(fid); });
    });

    var title = ((data.meta && data.meta.title) || 'Family Tree').replace(/[\\\/:*?"<>|\r\n]/g, ' ').trim() || 'Family Tree';
    var out = [
      '0 HEAD',
      '1 SOUR FamilyTreeStudio',
      '1 GEDC',
      '2 VERS 5.5.1',
      '2 FORM LINEAGE-LINKED',
      '1 CHAR UTF-8',
      '1 FILE ' + title + '.ged'
    ];

    pids.forEach(function (id) {
      var p = people[id];
      out.push('0 ' + ix[id] + ' INDI');
      var given = p.given || '', sur = p.surname || '';
      if (given || sur) {
        out.push('1 NAME ' + (given + ' /' + sur + '/').trim());
        simple(out, 2, 'GIVN', given);
        simple(out, 2, 'SURN', sur);
        simple(out, 2, 'NICK', p.nick);
      } else if (p.nick) {
        out.push('1 NAME //');
        emit(out, 2, 'NICK', p.nick);
      }
      if (p.gender === 'M' || p.gender === 'F') out.push('1 SEX ' + p.gender);
      event(out, 'BIRT', p.birth, false);
      event(out, 'DEAT', p.death, p.living === false);
      (famcOf[id] || []).forEach(function (fid) {
        out.push('1 FAMC ' + fx[fid]);
        var rel = (families[fid].childRel || {})[id];
        if (rel && rel !== 'birth') out.push('2 PEDI ' + rel);
      });
      (famsOf[id] || []).forEach(function (fid) { out.push('1 FAMS ' + fx[fid]); });
      simple(out, 1, 'NOTE', p.notes);
    });

    fids.forEach(function (fid) {
      var fam = families[fid], r = roles(fam);
      out.push('0 ' + fx[fid] + ' FAM');
      if (r.h) out.push('1 HUSB ' + ix[r.h]);
      if (r.w) out.push('1 WIFE ' + ix[r.w]);
      (fam.children || []).forEach(function (c) { if (people[c]) out.push('1 CHIL ' + ix[c]); });
      var m = fam.marriage || {};
      if (m.date || m.place || fam.status === 'married' || fam.status === 'divorced') {
        out.push('1 MARR' + (m.date || m.place ? '' : ' Y'));
        simple(out, 2, 'DATE', m.date);
        simple(out, 2, 'PLAC', m.place);
      }
      if (fam.status === 'divorced') out.push('1 DIV Y');
      simple(out, 1, '_STATUS', fam.status); // custom tag preserves partner/separated/widowed
    });

    out.push('0 TRLR');
    return out.join('\n') + '\n';
  }

  FT.Gedcom = { parse: parse, write: write };
})();
