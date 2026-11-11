/* FT.IO — autosave, files, GEDCOM, share copy, image export, print. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const KEY_LAST = 'ftstudio:last', KEY_TREE = 'ftstudio:tree:', KEY_BAK = 'ftstudio:backups';
  const EMBED_OPEN = '<script type="application/json" id="ft-embed">';
  const EMBED_RE = new RegExp(EMBED_OPEN.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '[\\s\\S]*?<\\/script>');

  function download(name, text, type) {
    const blob = text instanceof Blob ? text : new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const safeName = (s) => (s || 'family-tree').replace(/[\\/:*?"<>|]+/g, '').trim() || 'family-tree';

  const IO = {
    model: null, fileHandle: null, saveTimer: null, onStatus: () => {}, embedded: null,

    init(model, onStatus) {
      this.model = model; this.onStatus = onStatus || this.onStatus;
      const el = document.getElementById('ft-embed');
      const txt = el && el.textContent.trim();
      if (txt) { try { this.embedded = JSON.parse(txt); } catch (e) { this.embedded = null; } }
    },
    /** Returns {data, mode} to start with. */
    initial() {
      if (this.embedded && this.embedded.mode === 'viewer') return { data: this.embedded.data, mode: 'viewer' };
      let data = null;
      const last = LS.get(KEY_LAST);
      if (last) { try { data = JSON.parse(LS.get(KEY_TREE + last)); } catch (e) { data = null; } }
      if (this.embedded && this.embedded.data) {
        const e = this.embedded.data;
        let mine = null; try { mine = JSON.parse(LS.get(KEY_TREE + e.meta.id)); } catch (x) { mine = null; }
        data = mine && mine.meta.modified >= e.meta.modified ? mine : e;
      }
      if (data) this.backup(data);
      return { data, mode: 'editor' };
    },
    /** Rolling backups (last 8 sessions) so a bad edit can always be recovered. */
    backup(data) {
      let list = []; try { list = JSON.parse(LS.get(KEY_BAK)) || []; } catch (e) { list = []; }
      const json = JSON.stringify(data);
      if (list.length && list[0].json === json) return;
      list.unshift({ t: new Date().toISOString(), title: data.meta && data.meta.title, n: Object.keys(data.people || {}).length, json });
      list = list.slice(0, 8);
      while (list.length && !LS.set(KEY_BAK, JSON.stringify(list))) list.pop();
    },
    backups() { try { return JSON.parse(LS.get(KEY_BAK)) || []; } catch (e) { return []; } },

    saveSoon() {
      if (this.model.readOnly) return;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveNow(), 400);
    },
    saveNow() {
      if (this.model.readOnly) return;
      const d = this.model.data;
      const ok = LS.set(KEY_TREE + d.meta.id, JSON.stringify(d)) && LS.set(KEY_LAST, d.meta.id);
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (this.fileHandle) {
        this.writeHandle().then(() => this.onStatus('Saved to ' + this.fileHandle.name + ' · ' + time))
          .catch(() => this.onStatus('⚠ Could not write ' + this.fileHandle.name + ' – use File → Save'));
      } else this.onStatus(ok ? 'Auto-saved in this browser · ' + time : '⚠ Browser storage unavailable or full – use File → Save to file');
    },
    async writeHandle() {
      const w = await this.fileHandle.createWritable();
      await w.write(JSON.stringify(this.model.data, null, 1)); await w.close();
    },
    /** Save to a .json file. Uses the File System Access API (Chrome/Edge) so later saves go to the same file. */
    async saveFile(asNew) {
      const name = safeName(this.model.data.meta.title) + '.json';
      if (window.showSaveFilePicker) {
        try {
          if (!this.fileHandle || asNew) {
            this.fileHandle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Family tree', accept: { 'application/json': ['.json'] } }] });
          }
          await this.writeHandle();
          this.onStatus('Saved to ' + this.fileHandle.name + ' – changes now auto-save to this file');
          return true;
        } catch (e) { if (e && e.name === 'AbortError') return false; }
      }
      download(name, JSON.stringify(this.model.data, null, 1), 'application/json');
      this.onStatus('Downloaded ' + name);
      return true;
    },
    /** Parse any supported file text into a data object. */
    parseText(text, name) {
      name = (name || '').toLowerCase();
      const t = text.replace(/^﻿/, '');
      if (/\.ged(com)?$/.test(name) || /^\s*0\s+HEAD/.test(t)) return FT.Gedcom.parse(t);
      if (/<html|<!doctype/i.test(t.slice(0, 500))) {
        const m = t.match(EMBED_RE);
        if (!m) throw new Error('This HTML file has no family tree inside.');
        const j = JSON.parse(m[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
        return j.data;
      }
      const j = JSON.parse(t);
      if (j.people && j.families) return j;
      if (j.data && j.data.people) return j.data;
      throw new Error('Not a family tree file.');
    },
    async openWithPicker() {
      if (window.showOpenFilePicker) {
        try {
          const [h] = await window.showOpenFilePicker({ types: [{ description: 'Family tree / GEDCOM', accept: { 'application/json': ['.json'], 'text/plain': ['.ged', '.gedcom'], 'text/html': ['.html', '.htm'] } }] });
          const f = await h.getFile();
          const data = this.parseText(await f.text(), f.name);
          this.fileHandle = /\.json$/i.test(f.name) ? h : null;
          return { data, name: f.name };
        } catch (e) { if (e && e.name === 'AbortError') return null; throw e; }
      }
      return 'fallback';
    },
    exportGedcom() {
      download(safeName(this.model.data.meta.title) + '.ged', FT.Gedcom.write(this.model.data), 'text/plain');
    },
    exportJSON() {
      download(safeName(this.model.data.meta.title) + '.json', JSON.stringify(this.model.data, null, 1), 'application/json');
    },

    /** Build a stand-alone copy of this app with the tree embedded. */
    shareHTML(opts) {
      const M = this.model;
      const d = JSON.parse(JSON.stringify(opts.data || M.data));
      if (opts.privacy !== 'none') {
        Object.values(d.people).forEach((p) => {
          if (!M.isLiving(M.person(p.id))) return;
          p.birth = { date: '', place: '' }; p.notes = ''; p.photo = opts.privacy === 'names' ? '' : p.photo;
          if (opts.privacy === 'names') { p.given = 'Living'; p.surname = p.surname || ''; p.nick = ''; }
          p.living = true;
        });
      }
      Object.values(d.people).forEach((p) => { if (!opts.photos || !p.photo) p.photo = ''; p.photoSrc = ''; p.photoCrop = null; }); // shared copies only need the framed photo
      d.settings = Object.assign({}, d.settings);
      const payload = JSON.stringify({ mode: opts.mode, data: d }).replace(/</g, '\\u003c');
      const html = (window.FT_PRISTINE || '').replace(EMBED_RE, () => EMBED_OPEN + payload + '<\/script>');
      if (!html) throw new Error('Share copies can only be made from the built FamilyTree.html file.');
      const suffix = opts.mode === 'viewer' ? ' (view only)' : ' (editable)';
      download(safeName(opts.data ? d.meta.title : M.data.meta.title) + suffix + '.html', html, 'text/html');
    },

    /** Standalone SVG string of the current drawing. */
    svgString(treeG, bbox, opts) {
      const pad = 40, W = bbox.w + pad * 2, H = bbox.h + pad * 2 + (opts.title ? 50 : 0);
      const clone = treeG.cloneNode(true);
      clone.querySelectorAll('.h,.ch,.edit-ic,[data-act="collapse"],title').forEach((n) => n.remove());
      clone.querySelectorAll('.card').forEach((c) => { c.classList.remove('sel', 'hit', 'rel'); });
      const ty = opts.title ? 50 : 0;
      const head = opts.title ? `<text x="${W / 2}" y="40" text-anchor="middle" style="font:700 26px system-ui,Segoe UI,sans-serif;fill:#1d2430">${esc(opts.title)}</text>` : '';
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
        `<style>${FT.SVG_STYLE}</style><rect width="100%" height="100%" fill="#ffffff"/>${head}` +
        `<g transform="translate(${pad - bbox.x},${pad - bbox.y + ty})">${clone.innerHTML}</g></svg>`;
    },
    exportSVG(treeG, bbox) {
      const t = this.model.data.meta.title;
      download(safeName(t) + '.svg', this.svgString(treeG, bbox, { title: t }), 'image/svg+xml');
    },
    exportPNG(treeG, bbox) {
      const t = this.model.data.meta.title;
      const svg = this.svgString(treeG, bbox, { title: t });
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      return new Promise((res, rej) => {
        img.onload = () => {
          const scale = Math.min(2, 16000 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          const ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          c.toBlob((b) => { download(safeName(t) + '.png', b); res(); }, 'image/png');
        };
        img.onerror = () => rej(new Error('Image export failed'));
        img.src = url;
      });
    },
    print(treeG, bbox) {
      const svg = this.svgString(treeG, bbox, { title: this.model.data.meta.title });
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(f);
      const landscape = bbox.w > bbox.h;
      f.contentDocument.open();
      f.contentDocument.write(`<!doctype html><html><head><title>${esc(this.model.data.meta.title)}</title><style>@page{size:${landscape ? 'landscape' : 'portrait'};margin:10mm}html,body{margin:0}svg{width:100%;height:auto;max-height:100vh}</style></head><body>${svg}</body></html>`);
      f.contentDocument.close();
      setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300);
    },
    /** Read an image file, centre-crop to a square and shrink so the tree file stays small. */
    readPhoto(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => {
          const img = new Image();
          img.onload = () => {
            const s = Math.min(img.width, img.height), size = Math.min(220, s);
            const c = document.createElement('canvas'); c.width = c.height = size;
            c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
            res(c.toDataURL('image/jpeg', 0.84));
          };
          img.onerror = () => rej(new Error('Not an image'));
          img.src = r.result;
        };
        r.onerror = rej; r.readAsDataURL(file);
      });
    },
    download
  };
  function esc(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  FT.esc = esc;
  FT.IO = IO;
})();
