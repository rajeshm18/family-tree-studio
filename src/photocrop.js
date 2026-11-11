/* FT.PhotoCrop — place a face inside the round card photo: drag to move, wheel / slider / buttons to zoom, rotate.
   Keeps a reduced copy of the original (p.photoSrc) and the framing (p.photoCrop) so it can be re-adjusted later. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const V = 300;       // editor viewport (px)
  const OUT = 240;     // saved photo size (px)
  const MAX_SRC = 900; // longest side of the kept original

  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Not an image')); i.src = src; });
  const toCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  const PC = {
    /** Read a file into a reduced full-frame data URL (no cropping). */
    readFile(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = async () => {
          try {
            const img = await loadImg(r.result);
            const k = Math.min(1, MAX_SRC / Math.max(img.width, img.height));
            const c = toCanvas(Math.round(img.width * k), Math.round(img.height * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            res(c.toDataURL('image/jpeg', 0.86));
          } catch (e) { rej(e); }
        };
        r.onerror = rej; r.readAsDataURL(file);
      });
    },

    /** Open the editor. onSave({photo, photoSrc, photoCrop}). */
    async open(src, crop, onSave, title) {
      let img;
      try { img = await loadImg(src); } catch (e) { FT.UI.toast('Could not read that image.'); return; }
      const UI = FT.UI;
      const box = UI.modal(`<h2>📷 Position the photo${title ? ' – ' + FT.esc(title) : ''}</h2>
        <p class="pc-tip">Drag the photo to move it · scroll the mouse wheel (or use the slider) to zoom · put the face inside the circle.</p>
        <div class="pc-wrap"><canvas id="pcCv" width="${V * 2}" height="${V * 2}" style="width:${V}px;height:${V}px"></canvas>
          <div class="pc-side"><div class="pc-prev"><canvas id="pcPrev" width="128" height="128"></canvas><small>on the card</small></div></div></div>
        <div class="pc-ctl">
          <button id="pcOut" title="Zoom out">−</button><input id="pcZoom" type="range" min="0" max="1000" value="0" title="Zoom"><button id="pcIn" title="Zoom in">+</button>
          <button id="pcRot" title="Rotate 90°">⟳ Rotate</button><button id="pcFit" title="Show the whole photo">⤢ Whole photo</button><button id="pcFill" title="Fill the circle">◎ Fill circle</button>
        </div>
        <div class="acts"><button id="pcCancel">Cancel</button><button id="pcSave" class="primary">Save photo</button></div>`);
      box.classList.add('pc-box');
      const cv = box.querySelector('#pcCv'), ctx = cv.getContext('2d'), pv = box.querySelector('#pcPrev'), pctx = pv.getContext('2d');
      const zoomEl = box.querySelector('#pcZoom');
      let w, h, cover, minS, maxS, s, ox, oy;
      const setup = (keepCrop) => {
        w = img.width; h = img.height;
        cover = V / Math.min(w, h); minS = Math.min(cover, V / Math.max(w, h)) * 0.6; maxS = cover * 8;
        if (keepCrop && crop && crop.z) {
          s = Math.max(minS, Math.min(maxS, crop.z * cover));
          ox = V / 2 - crop.cx * w * s; oy = V / 2 - crop.cy * h * s;
        } else {
          s = cover; ox = (V - w * s) / 2;
          // portraits: faces are usually in the upper part, so start near the top
          oy = h > w * 1.15 ? Math.min(0, -(h * s - V) * 0.12) : (V - h * s) / 2;
        }
      };
      const sliderFromS = () => { zoomEl.value = Math.round((Math.log(s / minS) / Math.log(maxS / minS)) * 1000); };
      const draw = () => {
        const k = cv.width / V;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, ox * k, oy * k, w * s * k, h * s * k);
        // dim outside the circle
        ctx.save(); ctx.fillStyle = 'rgba(15,23,42,.55)';
        ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.arc(cv.width / 2, cv.height / 2, cv.width / 2 - 4 * k, 0, Math.PI * 2, true); ctx.fill('evenodd');
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(cv.width / 2, cv.height / 2, cv.width / 2 - 4 * k, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        render(pctx, pv.width, true);
        sliderFromS();
      };
      /** Draw the framed square into a context of size n (the saved photo, or the round preview). */
      const render = (c, n, round) => {
        const k = n / V;
        c.clearRect(0, 0, n, n); c.save();
        if (round) { c.beginPath(); c.arc(n / 2, n / 2, n / 2, 0, Math.PI * 2); c.clip(); }
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, n, n);
        c.drawImage(img, ox * k, oy * k, w * s * k, h * s * k);
        c.restore();
      };
      const zoomAt = (ns, cx, cy) => {
        ns = Math.max(minS, Math.min(maxS, ns));
        ox = cx - (cx - ox) * (ns / s); oy = cy - (cy - oy) * (ns / s); s = ns; draw();
      };
      setup(true); draw();

      // drag to pan (mouse, pen, touch); two fingers pinch to zoom
      const pts = new Map(); let pinch = null;
      cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s }; } });
      cv.addEventListener('pointermove', (e) => {
        const p = pts.get(e.pointerId); if (!p) return;
        if (pts.size === 2 && pinch) {
          pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const [a, b] = [...pts.values()], r = cv.getBoundingClientRect();
          zoomAt(pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); return;
        }
        ox += e.clientX - p.x; oy += e.clientY - p.y; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); draw();
      });
      const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(s * Math.pow(1.0015, -e.deltaY), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      cv.addEventListener('dblclick', (e) => { const r = cv.getBoundingClientRect(); zoomAt(s * 1.6, e.clientX - r.left, e.clientY - r.top); });
      zoomEl.addEventListener('input', () => zoomAt(minS * Math.pow(maxS / minS, zoomEl.value / 1000), V / 2, V / 2));
      box.querySelector('#pcIn').onclick = () => zoomAt(s * 1.2, V / 2, V / 2);
      box.querySelector('#pcOut').onclick = () => zoomAt(s / 1.2, V / 2, V / 2);
      box.querySelector('#pcFit').onclick = () => { s = V / Math.max(w, h); ox = (V - w * s) / 2; oy = (V - h * s) / 2; draw(); };
      box.querySelector('#pcFill').onclick = () => { setup(false); draw(); };
      box.querySelector('#pcRot').onclick = async () => {
        const c = toCanvas(img.height, img.width), g = c.getContext('2d');
        g.translate(c.width / 2, c.height / 2); g.rotate(Math.PI / 2); g.drawImage(img, -img.width / 2, -img.height / 2);
        src = c.toDataURL('image/jpeg', 0.88); img = await loadImg(src); setup(false); draw();
      };
      const keys = (e) => {
        if (box.closest('#modal').hidden) { document.removeEventListener('keydown', keys, true); return; }
        const step = e.shiftKey ? 20 : 4;
        if (e.key === 'ArrowLeft') ox -= step; else if (e.key === 'ArrowRight') ox += step; else if (e.key === 'ArrowUp') oy -= step; else if (e.key === 'ArrowDown') oy += step;
        else if (e.key === '+' || e.key === '=') { zoomAt(s * 1.1, V / 2, V / 2); } else if (e.key === '-') { zoomAt(s / 1.1, V / 2, V / 2); }
        else if (e.key === 'Enter') { box.querySelector('#pcSave').click(); } else return;
        e.preventDefault(); e.stopPropagation(); draw();
      };
      document.addEventListener('keydown', keys, true);
      const close = () => { document.removeEventListener('keydown', keys, true); UI.closeModal(); };
      box.querySelector('#pcCancel').onclick = close;
      box.querySelector('#pcSave').onclick = () => {
        const out = toCanvas(OUT, OUT); render(out.getContext('2d'), OUT, false);
        const photoCrop = { z: +(s / cover).toFixed(4), cx: +((V / 2 - ox) / (w * s)).toFixed(4), cy: +((V / 2 - oy) / (h * s)).toFixed(4) };
        close();
        onSave({ photo: out.toDataURL('image/jpeg', 0.86), photoSrc: src, photoCrop });
      };
    }
  };
  FT.PhotoCrop = PC;
})();
