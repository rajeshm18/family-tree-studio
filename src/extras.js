/* FT.Extras — Family Book (printable PDF), send a branch to a relative, merge a relative's copy back, opening reminders. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const esc = (s) => FT.esc(s);
  const $ = (id) => document.getElementById(id);

  const X = {
    get M() { return FT.UI.M; },
    get UI() { return FT.UI; },

    // ------------------------------------------------------------ F3 reminders when the tree opens
    remindOnOpen() {
      const M = this.M, UI = this.UI;
      if (!M.count() || UI.st.remind === false || !FT.Analytics) return;
      const today = new Date().toDateString();
      try { if (sessionStorage.getItem('ftstudio:reminded') === today) return; sessionStorage.setItem('ftstudio:reminded', today); } catch (e) { /* ignore */ }
      const items = FT.Analytics.calendar(M, new Date(), 7);
      if (!items.length) return;
      const first = items[0], who = (first.ids || [first.id]).map((x) => M.displayName(x)).join(' & ');
      const d = new Date(first.date); const isToday = d.toDateString() === today;
      const kind = first.kind === 'birthday' ? 'birthday' : first.kind;
      const msg = '📅 This week: ' + who + '’s ' + kind + (isToday ? ' is today' : ' on ' + d.toLocaleDateString(undefined, { weekday: 'long' })) + (items.length > 1 ? ' (+' + (items.length - 1) + ' more)' : '');
      setTimeout(() => UI.toast(msg, false, { label: 'See all', fn: () => FT.AnPanel.show('dates') }), 1200);
    },

    // ------------------------------------------------------------ F4 send a branch / merge a copy back
    sendBranch(pid) {
      const M = this.M, UI = this.UI;
      if (!pid) { UI.toast('First click the person whose branch you want to send (e.g. a cousin’s parent).'); return; }
      const data = FT.Merge.branchData(M, pid);
      const n = Object.keys(data.people).length;
      const box = UI.modal(`<h2>Send ${esc(M.displayName(pid))}’s branch to a relative</h2>
        <p>This makes a single file with <b>${n} people</b> (${esc(M.displayName(pid))}, their spouse(s), all descendants and their spouses, plus parents for context).</p>
        <ol><li>Send the file to your relative (WhatsApp, e-mail, pen drive).</li><li>They open it in any browser, add or correct their family, and use <b>File → Save</b> or <b>File → Export raw data</b>.</li>
        <li>When they send it back, use <b>File → Merge changes from a relative’s copy…</b>. You will see every change and can accept or reject each one.</li></ol>
        <label><input type="checkbox" id="sbPhotos" checked> include photos</label>
        <div class="acts"><button id="sbCancel">Cancel</button><button id="sbJson">Download data file (.json)</button><button id="sbHtml" class="primary">Download editable app file (.html)</button></div>`);
      box.querySelector('#sbCancel').onclick = () => UI.closeModal();
      const photos = () => box.querySelector('#sbPhotos').checked;
      const strip = (d) => { if (!photos()) Object.values(d.people).forEach((p) => { p.photo = ''; }); return d; };
      box.querySelector('#sbJson').onclick = () => {
        const d = strip(JSON.parse(JSON.stringify(data)));
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }));
        a.download = d.meta.title.replace(/[\\/:*?"<>|]+/g, '_') + '.json'; document.body.appendChild(a); a.click(); a.remove();
        UI.closeModal(); UI.toast('Branch file downloaded', true);
      };
      box.querySelector('#sbHtml').onclick = () => {
        try { FT.IO.shareHTML({ mode: 'edit', privacy: 'none', photos: photos(), data: strip(JSON.parse(JSON.stringify(data))) }); UI.closeModal(); UI.toast('Branch app file downloaded', true); }
        catch (e) { UI.toast(e.message); }
      };
    },
    mergeCopy() {
      const inp = $('fileInput');
      inp.onchange = async () => {
        const f = inp.files[0]; inp.value = ''; if (!f) return;
        try { this.review(FT.IO.parseText(await f.text(), f.name), f.name); } catch (e) { this.UI.toast('Could not read that file: ' + e.message); }
      };
      inp.click();
    },
    review(incoming, fname) {
      const M = this.M, UI = this.UI;
      const D = FT.Merge.diff(M.data, incoming);
      const ch = D.changes;
      const useful = ch.filter((c) => c.kind !== 'removed');
      if (!useful.length) { UI.toast('No new information in ' + fname + ' – your tree already has everything in it.'); return; }
      const group = { addPerson: '➕ New people', editPerson: '✎ Changed or added details', addFamily: '👪 New families', addPartner: '💍 New marriages', addChild: '👶 New children', editFamily: '✎ Marriage details', removed: '➖ Not in their copy (only for your information)' };
      const order = Object.keys(group);
      const html = order.map((k) => {
        const list = ch.filter((c) => c.kind === k); if (!list.length) return '';
        return `<h4>${group[k]} <small>(${list.length})</small></h4>` + list.map((c) => `<label class="mg${c.conflict ? ' conflict' : ''}"><input type="checkbox" data-id="${esc(c.id)}" ${c.kind === 'removed' || c.conflict ? '' : 'checked'}> ${esc(c.text)}${c.conflict ? ` <small>(yours: “${esc(c.from)}” → theirs: “${esc(c.to)}”)</small>` : ''}</label>`).join('');
      }).join('');
      const box = UI.modal(`<h2>Merge changes from ${esc(fname)}</h2><p>Tick what you want to bring into your tree. Clashing details (where you both wrote something different) are left unticked. You can undo the whole merge with Ctrl+Z.</p>
        <div class="mg-list">${html}</div>
        <div class="acts"><button id="mgAll">Tick all</button><button id="mgNone">Untick all</button><span style="flex:1"></span><button id="mgCancel">Cancel</button><button id="mgGo" class="primary">Merge ticked changes</button></div>`);
      const boxes = () => Array.from(box.querySelectorAll('input[data-id]'));
      box.querySelector('#mgAll').onclick = () => boxes().forEach((b) => { if (!b.dataset.id.startsWith('removed')) b.checked = true; });
      box.querySelector('#mgNone').onclick = () => boxes().forEach((b) => { b.checked = false; });
      box.querySelector('#mgCancel').onclick = () => UI.closeModal();
      box.querySelector('#mgGo').onclick = () => {
        const acc = boxes().filter((b) => b.checked).map((b) => b.dataset.id);
        let r = { applied: 0, skipped: 0 };
        M.change(() => { r = FT.Merge.apply(M, D, acc); M.cleanup(); });
        UI.closeModal();
        UI.toast('Merged ' + r.applied + ' change' + (r.applied === 1 ? '' : 's') + (r.skipped ? ' (' + r.skipped + ' skipped)' : ''), true, { label: 'Undo', fn: () => M.undo() });
      };
    },

    // ------------------------------------------------------------ F1 Family Book
    familyBook() {
      const M = this.M, A = FT.Analytics, UI = this.UI;
      const title = M.data.meta.title || 'Our Family';
      const gen = A.generations(M);
      const T = A.tree(M), h = T.headline;
      // families in reading order: walk each clan from the top, couples before their children
      const seenF = new Set(), fams = [];
      const walk = (pid) => {
        M.famsAsPartner(pid).forEach((f) => {
          if (seenF.has(f.id)) return; seenF.add(f.id); fams.push(f);
          f.children.forEach(walk);
        });
      };
      M.roots().forEach(walk);
      Object.values(M.families).forEach((f) => { if (!seenF.has(f.id) && f.partners.length) { seenF.add(f.id); fams.push(f); } });
      const life = (p) => {
        const b = [p.birth.date, p.birth.place].filter(Boolean).join(', '), d = [p.death.date, p.death.place].filter(Boolean).join(', ');
        return `${b ? 'Born ' + esc(b) : ''}${b && d ? '<br>' : ''}${d ? 'Died ' + esc(d) : (!M.isLiving(p) && !d ? 'Deceased' : '')}`;
      };
      const person = (id, big) => {
        const p = M.person(id); if (!p) return '';
        const ps = M.parents(id);
        return `<div class="bp${big ? ' big' : ''}">${p.photo ? `<img src="${p.photo}">` : `<div class="ph ${p.gender}">${esc((p.given || '?')[0])}</div>`}<div><b>${esc(M.displayName(p))}</b>${p.altName ? ` <span class="alt">${esc(p.altName)}</span>` : ''}${p.nick ? ` <i>(“${esc(p.nick)}”)</i>` : ''}
          <div class="ln">${life(p)}</div>${ps.length ? `<div class="ln">${p.gender === 'F' ? 'Daughter' : p.gender === 'M' ? 'Son' : 'Child'} of ${esc(ps.map((x) => M.displayName(x)).join(' & '))}</div>` : ''}
          ${p.gotra || p.native ? `<div class="ln">${esc([p.gotra && 'Gotra: ' + p.gotra, p.native && 'Native place: ' + p.native].filter(Boolean).join(' · '))}</div>` : ''}
          ${big && p.notes ? `<div class="nt">${esc(p.notes)}</div>` : ''}</div></div>`;
      };
      const pages = fams.map((f) => {
        const g = gen.get(f.partners[0]) || 1;
        const names = f.partners.map((x) => M.displayName(x)).join(' & ');
        return `<section class="fp"><div class="gl">Generation ${g}</div><h2>${esc(names)}${f.partners.length > 1 ? '' : '’s family'}</h2>
          ${f.marriage && (f.marriage.date || f.marriage.place) ? `<div class="ln">Married ${esc([f.marriage.date, f.marriage.place].filter(Boolean).join(', '))}</div>` : ''}
          <div class="couple">${f.partners.map((x) => person(x, true)).join('')}</div>
          ${f.children.length ? `<h3>Children (${f.children.length})</h3><div class="kids">${f.children.map((c) => person(c)).join('')}</div>` : ''}</section>`;
      }).join('');
      let treeSvg = '';
      try { treeSvg = FT.IO.svgString(UI.tree, UI.L.bbox, { title: '' }); } catch (e) { /* drawing optional */ }
      const index = Object.values(M.people).sort((a, b) => M.displayName(a).localeCompare(M.displayName(b)))
        .map((p) => `<li>${esc(M.displayName(p))} <span>${esc([p.birth.date && 'b. ' + p.birth.date, p.death.date && 'd. ' + p.death.date].filter(Boolean).join(' · '))}</span></li>`).join('');
      const css = `@page{size:A4;margin:14mm}body{font:12.5px/1.45 Georgia,'Times New Roman',serif;color:#1f2933;margin:0}
        .cover{height:250mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;page-break-after:always}
        .cover h1{font-size:40px;margin:10px 0}.cover .stats{font-size:15px;color:#52606d}.cover .tree{font-size:80px}
        .fp{page-break-before:always}.gl{font:11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#7b8794}
        h2{font-size:24px;margin:2px 0 6px;border-bottom:2px solid #e07a3f;padding-bottom:4px}h3{font-size:15px;margin:16px 0 6px;color:#52606d}
        .couple{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px}.kids{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .bp{display:flex;gap:10px;align-items:flex-start;break-inside:avoid}.bp img,.bp .ph{width:54px;height:54px;border-radius:50%;object-fit:cover;flex:none}
        .bp.big img,.bp.big .ph{width:84px;height:84px}.ph{display:flex;align-items:center;justify-content:center;background:#e6e9ee;color:#7b8794;font:600 22px system-ui}
        .ph.M{background:#dce8fb}.ph.F{background:#fbe0ea}.ln{color:#52606d;font-size:12px}.alt{color:#52606d}.nt{white-space:pre-wrap;margin-top:6px;font-size:12px}
        .tp{page-break-before:always}.tp svg{width:100%;height:auto;max-height:250mm}
        .ix{page-break-before:always;columns:2;font-size:11.5px}.ix li{break-inside:avoid}.ix span{color:#7b8794}`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} – Family Book</title><style>${css}</style></head><body>
        <div class="cover"><div class="tree">🌳</div><h1>${esc(title)}</h1><div class="stats">${h.people} people · ${h.generations} generations · ${h.couples} couples</div><div class="stats" style="margin-top:30px">${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
        ${treeSvg ? `<div class="tp"><h2>The family tree</h2>${treeSvg}</div>` : ''}
        ${pages}
        <div class="ix"><h2 style="column-span:all">Everyone in this book</h2><ul>${index}</ul></div></body></html>`;
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(f);
      f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
      UI.toast('Preparing the Family Book – choose “Save as PDF” in the print window to keep a copy.');
      setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 3000); }, 700);
    }
  };
  FT.Extras = X;
})();
