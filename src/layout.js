/* FT.Layout — contour-packed tidy tree layouts for descendants, ancestors, hourglass and whole family. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const S = FT.SIZE = { W: 176, H: 64, CG: 26, SG: 26, FG: 46, CLAN: 110, V: 78 };
  S.ROW = S.H + S.V;

  function unit() { return { nodes: [], edges: [], l: {}, r: {} }; }
  function addNode(u, n) {
    u.nodes.push(n);
    const L = n.x - S.W / 2, R = n.x + S.W / 2;
    u.l[n.d] = u.l[n.d] === undefined ? L : Math.min(u.l[n.d], L);
    u.r[n.d] = u.r[n.d] === undefined ? R : Math.max(u.r[n.d], R);
  }
  function shiftX(u, dx) {
    if (!dx) return u;
    u.nodes.forEach((n) => { n.x += dx; });
    u.edges.forEach((e) => {
      if (e.type === 'couple') { e.x1 += dx; e.x2 += dx; }
      else { e.x += dx; e.kids.forEach((k) => { k.x += dx; }); }
    });
    Object.keys(u.l).forEach((k) => { u.l[k] += dx; u.r[k] += dx; });
    return u;
  }
  /** Minimum shift so that b sits right of a with gap at every shared depth. */
  function separation(a, b, gap) {
    let s = -Infinity;
    Object.keys(b.l).forEach((k) => { if (a.r[k] !== undefined) s = Math.max(s, a.r[k] - b.l[k] + gap); });
    return s === -Infinity ? 0 : s;
  }
  function absorb(a, b) {
    a.nodes.push.apply(a.nodes, b.nodes); a.edges.push.apply(a.edges, b.edges);
    Object.keys(b.l).forEach((k) => {
      a.l[k] = a.l[k] === undefined ? b.l[k] : Math.min(a.l[k], b.l[k]);
      a.r[k] = a.r[k] === undefined ? b.r[k] : Math.max(a.r[k], b.r[k]);
    });
  }

  // ---------------- manual spacing ----------------
  // settings.gaps[pid] = extra sideways space (px) the user dragged in front of that person's branch.
  // Negative values pull the branch closer, but never so close that cards overlap.
  const MIN_GAP = 10;
  function gapOf(ctx, pid) { return (ctx.gaps && ctx.gaps[pid]) || 0; }
  function placeAfter(acc, u, gap, extra) {
    const normal = separation(acc, u, gap);
    if (!extra) return normal;
    return Math.max(separation(acc, u, MIN_GAP), normal + extra);
  }

  // ---------------- descendants ----------------
  function desc(pid, ctx, d, branch) {
    const M = ctx.model, u = unit();
    if (ctx.placed.has(pid)) { addNode(u, { pid, x: 0, d, dup: true, branch }); return u; }
    ctx.placed.add(pid);
    const me = M.person(pid);
    const node = { pid, x: 0, d, branch, root: d === ctx.rootDepth };
    addNode(u, node);

    const fams = M.famsAsPartner(pid);
    const withPartner = fams.filter((f) => f.partners.some((x) => x !== pid));
    const anchor = {}; let left = 0, right = 0, k = 0;
    fams.forEach((f) => {
      const other = f.partners.find((x) => x !== pid);
      if (!other) { anchor[f.id] = 0; return; }
      let s;
      if (withPartner.length === 1) { const o = M.person(other); s = me.gender === 'F' && o && o.gender === 'M' ? -1 : 1; }
      else s = k % 2 === 0 ? 1 : -1;
      k++;
      const x = s > 0 ? (right += S.W + S.CG) : -(left += S.W + S.CG);
      const dup = ctx.placed.has(other);
      if (!dup) ctx.placed.add(other);
      addNode(u, { pid: other, x, d, dup, branch, partnerOf: pid });
      anchor[f.id] = x - s * (S.W + S.CG) / 2;
      u.edges.push({ type: 'couple', x1: Math.min(0, x) + S.W / 2, x2: Math.max(0, x) - S.W / 2, d, status: f.status, fam: f.id });
    });

    const kidsOf = (f) => f.children.filter((c) => !ctx.allowed || ctx.allowed.has(c));
    const total = fams.reduce((n, f) => n + kidsOf(f).length, 0);
    if (!total) return u;
    if (ctx.collapsed.has(pid) || (ctx.maxDown && d - ctx.rootDepth >= ctx.maxDown)) {
      node.hidden = M.descendants(pid).size; return u;
    }
    node.expanded = true;
    // lay children of each family left→right, ordered by where that family's partner sits
    const ordered = fams.slice().sort((a, b) => anchor[a.id] - anchor[b.id]);
    const kidsU = unit(); const groups = []; let first = true, prevFam = null, firstGap = 0, manual = 0;
    const natural = []; // children's positions as if nobody had been dragged, used for centring
    ordered.forEach((f) => {
      const g = { fam: f, anchor: anchor[f.id], kids: [] };
      kidsOf(f).forEach((c) => {
        const br = branch == null && d === ctx.rootDepth && ctx.branching ? ctx.nextBranch++ : branch;
        const cu = desc(c, ctx, d + 1, br);
        const extra = gapOf(ctx, c);
        let x = 0;
        if (!first) {
          const gap = prevFam === f ? S.SG : S.FG;
          const normal = separation(kidsU, cu, gap);
          x = placeAfter(kidsU, cu, gap, extra);
          manual += x - normal; // how far user spacing pushed this child beyond the automatic layout
          shiftX(cu, x);
        } else firstGap = extra;
        natural.push(x - manual);
        absorb(kidsU, cu); first = false; prevFam = f;
        g.kids.push({ x, d: d + 1, rel: f.childRel[c] || 'birth', pid: c });
      });
      if (g.kids.length) groups.push(g);
    });
    const allKids = groups.reduce((a, g) => a.concat(g.kids), []);
    // centre on the automatic positions so a dragged branch moves alone (with everything to its right)
    const kidCenter = (natural[0] + natural[natural.length - 1]) / 2;
    const target = groups.reduce((s, g) => s + g.anchor, 0) / groups.length;
    const dx = target - kidCenter + firstGap; // a manual shift on the first child moves the whole row of children
    shiftX(kidsU, dx);
    groups.forEach((g) => {
      g.kids.forEach((kk) => { kk.x += dx; });
      const f = g.fam;
      u.edges.push({ type: 'kids', x: g.anchor, d, couple: f.partners.length === 2, kids: g.kids, fam: f.id });
    });
    absorb(u, kidsU);
    return u;
  }

  // ---------------- ancestors ----------------
  /** Ancestors above pid (pid at x=0, depth d). Returns {u, mid} or null. mid = x of parents' midpoint. */
  function ancAbove(pid, ctx, d) {
    const M = ctx.model;
    if (ctx.collapsedUp.has(pid)) return null;
    if (ctx.maxUp && ctx.rootDepth - (d - 1) > ctx.maxUp) return null;
    const pf = M.parentFamily(pid);
    if (!pf || !pf.partners.length) return null;
    const parts = pf.partners.map((p, i) => {
      const u = unit();
      const dup = ctx.placed.has(p);
      addNode(u, { pid: p, x: 0, d: d - 1, dup, side: i });
      if (!dup) {
        ctx.placed.add(p);
        const up = ancAbove(p, ctx, d - 1);
        if (up) {
          absorb(u, up.u);
          u.edges.push({ type: 'kids', x: up.mid, d: d - 2, couple: up.couple, kids: [{ x: 0, d: d - 1, rel: up.rel }] });
        }
      }
      return u;
    });
    const u = parts[0]; let px = 0;
    if (parts[1]) {
      px = Math.max(separation(u, parts[1], S.SG * 2), S.W + S.CG);
      shiftX(parts[1], px); absorb(u, parts[1]);
      u.edges.push({ type: 'couple', x1: S.W / 2, x2: px - S.W / 2, d: d - 1, status: pf.status, fam: pf.id });
    }
    const mid = px / 2;
    // centre parents over the child, but report where the connector starts
    shiftX(u, -mid);
    return { u, mid: 0, couple: pf.partners.length === 2, rel: pf.childRel[pid] || 'birth' };
  }

  // ---------------- composition ----------------
  function finalize(u, ctx) {
    const M = ctx.model;
    const shown = new Set(u.nodes.filter((n) => !n.dup).map((n) => n.pid));
    u.nodes.forEach((n) => {
      n.y = n.d * S.ROW;
      if (!n.dup) {
        const ps = M.parents(n.pid);
        n.parentsHidden = ps.length > 0 && !ps.some((p) => shown.has(p));
      }
    });
    u.edges.forEach((e) => { e.y = e.d * S.ROW; if (e.kids) e.kids.forEach((k) => { k.y = k.d * S.ROW; }); });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    u.nodes.forEach((n) => {
      x0 = Math.min(x0, n.x - S.W / 2); x1 = Math.max(x1, n.x + S.W / 2);
      y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y + S.H);
    });
    if (!u.nodes.length) { x0 = y0 = 0; x1 = y1 = 1; }
    u.bbox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    return u;
  }

  /**
   * Free moves: opts.free[pid] = {dx, dy} shifts that person, their partners and everyone below them
   * anywhere on the canvas (no collision rules). Lines into the moved branch stretch to follow it.
   */
  function applyFree(L, model, free) {
    const ids = Object.keys(free || {}).filter((id) => model.person(id));
    if (!ids.length) return;
    const nodeOf = (id) => L.nodes.find((n) => n.pid === id && !n.dup);
    // parents' moves first, so moves inside a moved branch add up
    ids.sort((a, b) => ((nodeOf(a) || { d: 0 }).d - (nodeOf(b) || { d: 0 }).d));
    ids.forEach((id) => {
      const n = nodeOf(id), off = free[id];
      if (!n || !off || (!off.dx && !off.dy)) return;
      const set = new Set([id]);
      model.descendants(id).forEach((x) => set.add(x));
      Array.from(set).forEach((x) => model.partners(x).forEach((p) => set.add(p)));
      const y0 = n.y; // remember before n itself moves
      const inBranch = (pid, y) => set.has(pid) && y >= y0;
      L.nodes.forEach((m) => { if (inBranch(m.pid, m.y)) { m.x += off.dx; m.y += off.dy; } });
      L.edges.forEach((e) => {
        if (e.type === 'couple') {
          const f = model.families[e.fam];
          if (f && f.partners.every((p) => set.has(p)) && e.y >= y0) { e.x1 += off.dx; e.x2 += off.dx; e.y += off.dy; }
          return;
        }
        const f = model.families[e.fam];
        const parentsIn = f && f.partners.length && f.partners.some((p) => set.has(p)) && e.y >= y0;
        if (parentsIn) { e.x += off.dx; e.y += off.dy; }
        e.kids.forEach((k) => { if (k.pid ? set.has(k.pid) && k.y >= y0 : parentsIn) { k.x += off.dx; k.y += off.dy; k.free = true; } });
      });
    });
    let x0 = Infinity, x1 = -Infinity, ya = Infinity, yb = -Infinity;
    L.nodes.forEach((m) => { x0 = Math.min(x0, m.x - S.W / 2); x1 = Math.max(x1, m.x + S.W / 2); ya = Math.min(ya, m.y); yb = Math.max(yb, m.y + S.H); });
    L.bbox = { x: x0, y: ya, w: x1 - x0, h: yb - ya };
  }

  function makeCtx(model, opts) {
    return {
      model, placed: new Set(), rootDepth: 0, nextBranch: 0,
      collapsed: new Set(opts.collapsed || []), collapsedUp: new Set(opts.collapsedUp || []),
      maxDown: opts.maxDown || 0, maxUp: opts.maxUp || 0, allowed: opts.allowed || null, gaps: opts.gaps || null,
      branching: opts.branching !== false
    };
  }

  /**
   * compute(model, opts) -> {nodes, edges, bbox}
   * opts.view: 'everyone' | 'descendants' | 'ancestors' | 'hourglass'; opts.rootId
   */
  FT.Layout = {
    compute(model, opts) {
      const L = this._compute(model, opts || {});
      applyFree(L, model, (opts || {}).free);
      return L;
    },
    _compute(model, opts) {
      opts = opts || {};
      const ctx = makeCtx(model, opts);
      const view = opts.view || 'everyone';
      let root = opts.rootId && model.person(opts.rootId) ? opts.rootId : null;
      if (!model.count()) return finalize(unit(), ctx);
      if (view === 'everyone' || !root) {
        const all = unit(); let first = true;
        const place = (r) => {
          const u = desc(r, ctx, 0, null);
          if (!first) shiftX(u, placeAfter(all, u, S.CLAN, gapOf(ctx, r)));
          absorb(all, u); first = false;
        };
        model.roots().forEach(place);
        // people folded away inside a collapsed branch must stay hidden
        const folded = new Set();
        ctx.collapsed.forEach((c) => {
          if (!ctx.placed.has(c)) return;
          model.descendants(c).forEach((d) => { folded.add(d); model.partners(d).forEach((p) => folded.add(p)); });
        });
        // safety: anybody unreachable from a root
        Object.keys(model.people).forEach((id) => { if (!ctx.placed.has(id) && !folded.has(id)) place(id); });
        return finalize(all, ctx);
      }
      if (view === 'descendants') return finalize(desc(root, ctx, 0, null), ctx);
      if (view === 'ancestors') {
        const u = unit(); ctx.placed.add(root); ctx.branching = false;
        addNode(u, { pid: root, x: 0, d: 0, root: true });
        const up = ancAbove(root, ctx, 0);
        if (up) { absorb(u, up.u); u.edges.push({ type: 'kids', x: up.mid, d: -1, couple: up.couple, kids: [{ x: 0, d: 0, rel: up.rel }] }); }
        return finalize(u, ctx);
      }
      // hourglass: parents' family (with siblings) + descendants, ancestors above both parents
      ctx.branching = false;
      const pf = model.parentFamily(root);
      if (!pf || !pf.partners.length || ctx.collapsedUp.has(root)) return finalize(desc(root, ctx, 0, null), ctx);
      ctx.rootDepth = 0;
      const lower = desc(pf.partners[0], ctx, 0, null);
      ctx.rootDepth = 0;
      const parentNodes = pf.partners.map((p) => lower.nodes.find((n) => n.pid === p && !n.dup)).filter(Boolean);
      const ups = parentNodes.map((n) => {
        const a = ancAbove(n.pid, ctx, 0);
        if (!a) return null;
        shiftX(a.u, n.x); return { a, n };
      }).filter(Boolean);
      if (ups.length === 2) {
        const need = separation(ups[0].a.u, ups[1].a.u, S.SG * 2);
        if (need > 0) { shiftX(ups[0].a.u, -need / 2); shiftX(ups[1].a.u, need / 2); ups[0].off = -need / 2; ups[1].off = need / 2; }
      }
      ups.forEach((x) => {
        absorb(lower, x.a.u);
        lower.edges.push({ type: 'kids', x: x.n.x + (x.off || 0), d: -1, couple: x.a.couple, kids: [{ x: x.n.x, d: 0, rel: x.a.rel }] });
      });
      // focus person's siblings are all in "lower"; mark the focus as root for emphasis
      lower.nodes.forEach((n) => { n.root = n.pid === root && !n.dup; });
      return finalize(lower, ctx);
    },
    /** People kept when "show only this branch" is on. */
    branchSet(model, pid) {
      const s = new Set([pid]);
      model.descendants(pid).forEach((x) => s.add(x));
      model.ancestors(pid).forEach((x) => s.add(x));
      Array.from(s).forEach((x) => model.partners(x).forEach((p) => s.add(p)));
      return s;
    }
  };
})();
