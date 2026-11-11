/* FT.Render — draws a layout into an SVG <g>. Styling lives inside the SVG so exports keep it. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const S = FT.SIZE;
  FT.BRANCH_COLORS = ['#e07a3f', '#2f9e8f', '#7b61c9', '#d4a017', '#3a7fd0', '#c2477a', '#5d9c3a', '#9a6b3f', '#2b8fb3', '#b85450'];
  const GEN_COLORS = ['#6c5ce7', '#0984e3', '#00a085', '#e1a100', '#e17055', '#d63081', '#636e72'];
  const GENDER = { M: '#3f7fd8', F: '#d9578b', U: '#9aa0a6' };

  FT.SVG_STYLE = `
  .card .bg{fill:var(--card,#fff);stroke:var(--card-line,#d9dde3);stroke-width:1.2}
  .card .stripe{}
  .card .nm{font:600 13.5px system-ui,Segoe UI,sans-serif;fill:var(--ink,#1d2430)}
  .card .sub{font:12px system-ui,Segoe UI,sans-serif;fill:var(--ink2,#5d6673)}
  .card .ini{font:600 15px system-ui,Segoe UI,sans-serif;fill:#fff}
  .card.dead .bg{fill:var(--card-dead,#f3f1ee)}
  .card.dup .bg{stroke-dasharray:5 4;fill:var(--card-dup,#fafbfc)}
  .card.sel .bg{stroke:var(--accent,#2563eb);stroke-width:3}
  .card.root .bg{stroke:var(--accent2,#f59e0b);stroke-width:2.4}
  .card.sel.root .bg{stroke:var(--accent,#2563eb)}
  .card.rel .bg{stroke:#16a34a;stroke-width:3}
  .card.dim{opacity:.16}
  .card.hit .bg{stroke:#f59e0b;stroke-width:3.5}
  .card.drop .bg{stroke:#16a34a;stroke-width:4}
  .ln{fill:none;stroke:var(--line,#8a94a3);stroke-width:1.6}
  .ln.adopted,.ln.step,.ln.foster{stroke-dasharray:6 4}
  .ln.couple{stroke:var(--couple,#c27b9c);stroke-width:2.2}
  .ln.divorced,.ln.separated{stroke-dasharray:3 4}
  .ln.dim{opacity:.12}
  .ln.sib{stroke:#0d9488;stroke-width:2;stroke-dasharray:2 5;stroke-linecap:round}
  .sibt{font:italic 11px system-ui,Segoe UI,sans-serif;fill:#0d9488}
  .badge rect{fill:var(--badge,#334155)} .badge text{font:600 11px system-ui,sans-serif;fill:#fff}
  .badge{cursor:pointer}
  .up rect{fill:var(--chip,#e8eefc);stroke:var(--chip-line,#b9c8ef)} .up text{font:600 11px system-ui,sans-serif;fill:var(--accent,#2563eb)}
  .up{cursor:pointer}
  .h{cursor:pointer;opacity:0;transition:opacity .12s}
  .h circle{fill:var(--accent,#2563eb);stroke:#fff;stroke-width:2}
  .h text{font:700 15px system-ui,sans-serif;fill:#fff;pointer-events:none}
  .card:hover .h,.card.sel .h{opacity:.92}
  .h:hover{opacity:1!important} .h:hover circle{fill:#16a34a}
  .ro .h{display:none}
  .ch{cursor:grab;opacity:0;transition:opacity .12s}
  .ch circle{fill:#f59e0b;stroke:#fff;stroke-width:2}
  .card:hover .ch,.card.sel .ch{opacity:.95}
  .ch:hover circle{fill:#16a34a}
  .card.moving{opacity:.75}
  .lines.moving{opacity:.25}
  .edit-ic{opacity:0;cursor:pointer} .card:hover .edit-ic{opacity:.75} .edit-ic:hover{opacity:1}
  .edit-ic circle{fill:var(--card,#fff);stroke:var(--card-line,#cbd2db)} .edit-ic text{font:12px system-ui;fill:var(--ink2,#5d6673)}
  `;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  FT.svgEl = el;

  function fit(text, max) { return text.length > max ? text.slice(0, max - 1) + '…' : text; }
  function initials(p) { return ((p.given || '?')[0] + ((p.surname || '')[0] || '')).toUpperCase(); }
  function years(M, p) {
    const b = FT.year(p.birth.date), dd = FT.year(p.death.date);
    const living = M.isLiving(p);
    if (b && dd) return b + ' – ' + dd;
    if (b && !living) return b + ' – †';
    if (b) return 'b. ' + b + (living ? '  ·  ' + (new Date().getFullYear() - b) + ' yrs' : '');
    if (dd) return '† ' + dd;
    if (!living) return 'Late';
    return p.nick ? '“' + p.nick + '”' : '';
  }

  /** Smooth elbow from (x1,y1) down to (x2,y2) via a bus at yb. */
  function elbow(x1, y1, x2, y2, yb) {
    if (Math.abs(x1 - x2) < 1) return `M${x1},${y1}V${y2}`;
    const r = Math.min(10, Math.abs(x2 - x1) / 2, Math.abs(y2 - yb), Math.abs(yb - y1));
    const s = x2 > x1 ? 1 : -1;
    return `M${x1},${y1}V${yb - r}Q${x1},${yb} ${x1 + s * r},${yb}H${x2 - s * r}Q${x2},${yb} ${x2},${yb + r}V${y2}`;
  }

  FT.Render = {
    /**
     * draw(g, layout, state) — state: {model, selected:Set, focusSet, colorBy, readOnly, relId, hit}
     */
    draw(g, L, st) {
      const M = st.model;
      while (g.firstChild) g.removeChild(g.firstChild);
      const lines = el('g', { class: 'lines' }, g);
      const cards = el('g', { class: 'cards' }, g);
      const dimOf = (pid) => st.focusSet && !st.focusSet.has(pid);

      L.edges.forEach((e) => {
        if (e.type === 'couple') {
          const y = e.y + S.H / 2;
          const fam = M.families[e.fam];
          const a = fam && fam.partners[0], b = fam && fam.partners[1];
          const dim = st.focusSet && (dimOf(a) || dimOf(b));
          el('path', { d: `M${e.x1},${y}H${e.x2}`, class: 'ln couple ' + (e.status || '') + (dim ? ' dim' : '') }, lines);
          if (e.status === 'divorced' || e.status === 'separated') {
            const mx = (e.x1 + e.x2) / 2;
            el('path', { d: `M${mx - 5},${y + 7}L${mx - 1},${y - 7}M${mx + 1},${y + 7}L${mx + 5},${y - 7}`, class: 'ln couple' }, lines);
          }
          return;
        }
        const y1 = e.couple ? e.y + S.H / 2 : e.y + S.H;
        const yb = e.y + S.H + S.V / 2;
        e.kids.forEach((k) => {
          const dim = st.focusSet && k.pid && dimOf(k.pid);
          // a freely placed child can be anywhere, so use a smooth curve instead of the right-angled elbow
          const d = k.free || k.y < yb + 4
            ? `M${e.x},${y1}C${e.x},${y1 + 90} ${k.x},${k.y - 90} ${k.x},${k.y}`
            : elbow(e.x, y1, k.x, k.y, yb);
          el('path', { d, class: 'ln ' + (k.rel || '') + (dim ? ' dim' : '') }, lines);
        });
      });

      // brothers/sisters whose parents are not in the tree: join them with a bracket over their cards
      Object.values(M.families).forEach((f) => {
        if (f.partners.length || f.children.length < 2) return;
        const ns = f.children.map((c) => L.nodes.find((n) => n.pid === c && !n.dup)).filter(Boolean);
        if (ns.length < 2) return;
        const top = Math.min.apply(null, ns.map((n) => n.y)) - 26;
        const xs = ns.map((n) => n.x);
        let d = `M${Math.min.apply(null, xs)},${top}H${Math.max.apply(null, xs)}`;
        ns.forEach((n) => { d += `M${n.x + 12},${top}V${n.y}`; });
        const dim = st.focusSet && ns.some((n) => dimOf(n.pid));
        el('path', { d, class: 'ln sib' + (dim ? ' dim' : '') }, lines);
        const mid = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
        const t = el('text', { x: mid, y: top - 5, 'text-anchor': 'middle', class: 'sibt' }, lines);
        t.textContent = 'siblings (parents not added yet)';
      });

      const gen0 = Math.min.apply(null, L.nodes.map((n) => n.d).concat([0]));
      // people drawn as somebody's child (their card has an incoming line from above)
      const drawnAsChild = new Set();
      L.edges.forEach((e) => { if (e.kids) e.kids.forEach((k) => { if (k.pid) drawnAsChild.add(k.pid); }); });
      L.nodes.forEach((n) => {
        const p = M.person(n.pid); if (!p) return;
        const living = M.isLiving(p);
        const cls = ['card'];
        if (!living) cls.push('dead');
        if (n.dup) cls.push('dup');
        if (st.selected && st.selected.has(n.pid)) cls.push('sel');
        if (n.root) cls.push('root');
        if (st.relId === n.pid) cls.push('rel');
        if (st.hit && st.hit.has(n.pid)) cls.push('hit');
        if (dimOf(n.pid)) cls.push('dim');
        const c = el('g', { class: cls.join(' '), transform: `translate(${n.x - S.W / 2},${n.y})`, 'data-id': n.pid, 'data-dup': n.dup ? 1 : 0 }, cards);
        let color = GENDER[p.gender] || GENDER.U;
        if (st.colorBy === 'branch' && n.branch != null) color = FT.BRANCH_COLORS[n.branch % FT.BRANCH_COLORS.length];
        if (st.colorBy === 'generation') color = GEN_COLORS[(n.d - gen0) % GEN_COLORS.length];
        if (p.color) color = p.color;
        el('rect', { class: 'bg', width: S.W, height: S.H, rx: 12 }, c);
        el('rect', { class: 'stripe', width: 6, height: S.H - 16, x: 0, y: 8, rx: 3, fill: color }, c);
        // avatar
        const ax = 30, ay = S.H / 2, ar = 19;
        if (p.photo) {
          const cid = 'cp' + n.pid + (n.dup ? 'd' : '');
          const cp = el('clipPath', { id: cid }, c); el('circle', { cx: ax, cy: ay, r: ar }, cp);
          el('image', { href: p.photo, x: ax - ar, y: ay - ar, width: ar * 2, height: ar * 2, 'clip-path': `url(#${cid})`, preserveAspectRatio: 'xMidYMid slice' }, c);
        } else {
          el('circle', { cx: ax, cy: ay, r: ar, fill: color, opacity: living ? 1 : 0.55 }, c);
          const t = el('text', { x: ax, y: ay + 5, 'text-anchor': 'middle', class: 'ini' }, c); t.textContent = initials(p);
        }
        const name = M.displayName(p);
        const tx = 56;
        const nm = el('text', { x: tx, y: 27, class: 'nm' }, c);
        nm.textContent = (n.dup ? '↪ ' : '') + fit(name, 17);
        const sub = el('text', { x: tx, y: 46, class: 'sub' }, c);
        sub.textContent = fit(years(M, p), 22);
        const tt = el('title', null, c); tt.textContent = name + (n.dup ? ' (shown elsewhere – click to jump)' : '');

        if (n.hidden) {
          const b = el('g', { class: 'badge', 'data-act': 'expand', transform: `translate(${S.W / 2 + 16},${S.H + 3})` }, c);
          el('rect', { width: 44, height: 18, rx: 9 }, b);
          const t = el('text', { x: 22, y: 13, 'text-anchor': 'middle' }, b); t.textContent = '+' + n.hidden;
          el('title', null, b).textContent = n.hidden + ' descendants hidden – click to expand';
        }
        if (n.parentsHidden && !n.dup) {
          const b = el('g', { class: 'up', 'data-act': 'show-parents', transform: `translate(${S.W - 58},-11)` }, c);
          el('rect', { width: 54, height: 18, rx: 9 }, b);
          const t = el('text', { x: 27, y: 13, 'text-anchor': 'middle' }, b); t.textContent = '▲ parents';
        }
        if (!st.readOnly && !n.dup) {
          // + handles: parent (top), child (bottom), partner (right), sibling (left)
          const H = [['parent', S.W / 2 - 34, -2, '▲'], ['child', S.W / 2, S.H + 2, '▼'], ['partner', S.W + 2, S.H / 2, '♥'], ['sibling', -2, S.H / 2, '◀']];
          H.forEach(([rel, x, y, sym]) => {
            if (rel === 'parent' && M.parents(n.pid).length >= 2) return;
            const h = el('g', { class: 'h', 'data-h': rel, transform: `translate(${x},${y})` }, c);
            el('circle', { r: 11 }, h);
            const t = el('text', { y: 5, 'text-anchor': 'middle' }, h); t.textContent = '+';
            const tip = el('title', null, h);
            tip.textContent = { parent: 'Add parent (click) · drag onto someone to make them a parent', child: 'Add child (click) · drag onto someone to make them a child', partner: 'Add partner/spouse (click) · drag onto someone to marry them', sibling: 'Add brother/sister (click) · drag onto someone to make them siblings' }[rel];
          });
          if (n.expanded) {
            const b = el('g', { class: 'badge', 'data-act': 'collapse', transform: `translate(${S.W / 2 + 16},${S.H + 4})`, opacity: 0.55 }, c);
            el('rect', { width: 22, height: 16, rx: 8 }, b);
            const t = el('text', { x: 11, y: 12, 'text-anchor': 'middle' }, b); t.textContent = '−';
            el('title', null, b).textContent = 'Collapse this branch';
          }
          if (drawnAsChild.has(n.pid)) {
            // orange dot where the parents' line arrives: drag it onto another card to make THAT person the child
            const ch = el('g', { class: 'ch', transform: `translate(${S.W / 2},0)` }, c);
            el('circle', { r: 7 }, ch);
            el('title', null, ch).textContent = 'Wrong person linked as the child? Drag this dot onto the right person (e.g. the spouse) to move the parents’ line to them.';
          }
          const ei = el('g', { class: 'edit-ic', 'data-act': 'details', transform: `translate(${S.W - 14},14)` }, c);
          el('circle', { r: 10 }, ei);
          const t = el('text', { y: 4, 'text-anchor': 'middle' }, ei); t.textContent = '✎';
          el('title', null, ei).textContent = 'Details: dates, places, photo, notes';
        }
      });
    }
  };
})();
