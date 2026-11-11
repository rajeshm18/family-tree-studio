/* FT.VoicePanel: the "Tell the Tree" column. Speech (or typed text) → FT.Voice → tree, each sentence one undo step. */
window.FT = window.FT || {};
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => FT.esc(s);
  // A final speech chunk that ends like this is incomplete ("Ramlal Sharma's father is …"), so wait for the rest.
  const DANGLING = /\b(is|are|was|were|named|called|name|names|and|of|has|have|had|to|with|father|mother|parents|sons?|daughters?|child|children|kids?|wife|husband|spouse|partner|brothers?|sisters?|siblings?)\s*$/i;
  const EXAMPLES = [
    ['Parents', 'Ramlal Sharma’s father is Bhimrao and mother is Sita Rao'],
    ['Correct a mistake', 'It is not Sita Rao, it is Sita Sharma'],
    ['', 'Change the name of Ramlal Sharma to R.S. Sengar and Kamla Devi to Patamma'],
    ['Other ways to say it', 'Create Bimrao and Sita Devi as Ramlal Sharma’s parents'],
    ['', 'Add Aditi as daughter of Mahesh Sharma'],
    ['Children of a couple', 'Mahesh Sharma and Lata Sharma have two daughters Aditi and Yukti'],
    ['Click a card first, then', 'father is Bhimrao and mother is Sita'],
    ['Spouse (he/she = last person)', 'his wife is Meena'],
    ['Brothers & sisters', 'Suresh Sharma’s sisters are Geeta and Sunita'],
    ['Dates & places', 'Aditi was born in 1998 in Pune'],
    ['', 'Bhimrao died in 1975'],
    ['Rename', 'change Yukti Sharma to Yukta Sharma'],
    ['Undo / delete', 'undo'],
    ['', 'delete Yukta Sharma']
  ];

  const VP = {
    open: false, listening: false, rec: null, log: [], lastId: null, pending: '', pendingTimer: null,

    init() {
      if (!$('voice')) return;
      $('btnVoice').onclick = () => this.toggle();
      $('fabVoice').onclick = () => this.toggle(true);
      $('vClose').onclick = () => this.toggle(false);
      $('vMic').onclick = () => (this.listening ? this.stop() : this.start());
      $('vUndo').onclick = () => this.undoLast();
      // drag the left edge to resize the column; the width is remembered
      const root = document.documentElement;
      try { const w = +localStorage.getItem('ftstudio:voiceW'); if (w) root.style.setProperty('--voiceW', w + 'px'); } catch (e) { /* ignore */ }
      $('vGrip').onpointerdown = (e) => {
        e.preventDefault(); $('vGrip').classList.add('on');
        const move = (ev) => {
          const w = Math.max(280, Math.min(window.innerWidth * 0.8, window.innerWidth - ev.clientX));
          root.style.setProperty('--voiceW', Math.round(w) + 'px'); FT.UI.applyView();
        };
        const up = () => {
          $('vGrip').classList.remove('on');
          document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
          try { localStorage.setItem('ftstudio:voiceW', parseInt(getComputedStyle(root).getPropertyValue('--voiceW'), 10) || 360); } catch (x) { /* ignore */ }
        };
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      };
      $('vClear').onclick =() => { this.log = []; $('vLive').textContent = ''; this.state('History cleared. Your tree is unchanged.'); this.renderLog(); };
      $('vEx').onclick = () => { $('vExamples').hidden = !$('vExamples').hidden; };
      $('vExamples').innerHTML = EXAMPLES.map(([h, t]) => (h ? `<div class="vh">${esc(h)}</div>` : '') + `<div data-t="${esc(t)}">“${esc(t)}”</div>`).join('');
      $('vExamples').addEventListener('click', (e) => { const d = e.target.closest('[data-t]'); if (d) { $('vText').value = d.dataset.t; $('vText').focus(); } });
      const ta = $('vText');
      ta.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = ta.value.trim(); if (t) { ta.value = ''; this.execute(t, 'typed'); } }
        if (e.key === 'Escape') ta.blur();
      });
      try { $('vLang').value = localStorage.getItem('ftstudio:voiceLang') || 'en-IN'; } catch (e) { /* ignore */ }
      $('vLang').onchange = () => {
        try { localStorage.setItem('ftstudio:voiceLang', $('vLang').value); } catch (e) { /* ignore */ }
        if (this.listening) { this.stop(); this.start(); }
      };
      document.addEventListener('keydown', (e) => {
        if (e.key === 'F8' && !FT.UI.readOnly) { e.preventDefault(); if (!this.open) this.toggle(true); this.listening ? this.stop() : this.start(); }
      });
      try { $('vEngine').value = localStorage.getItem('ftstudio:voiceEngine') || 'whisper'; } catch (e) { /* ignore */ }
      $('vEngine').onchange = () => {
        try { localStorage.setItem('ftstudio:voiceEngine', $('vEngine').value); } catch (e) { /* ignore */ }
        const was = this.listening; if (was) this.stop();
        this.engineUI(); if (was) this.start();
      };
      this.engineUI();
      FT.app.on(() => this.renderLog());
    },
    toggle(force) {
      this.open = force === undefined ? !this.open : force;
      $('voice').hidden = !this.open;
      document.body.classList.toggle('voice-open', this.open);
      if (FT.AnPanel && FT.AnPanel.open) FT.AnPanel.apply();
      $('btnVoice').classList.toggle('primary', this.open);
      if (!this.open) this.stop();
      else { this.refresh(); setTimeout(() => $('vText').focus(), 50); }
      FT.UI.applyView();
    },
    state(msg, err) { const s = $('vState'); s.textContent = msg; s.classList.toggle('err', !!err); },

    // ---------- speech ----------
    /** Show which voice engine is in use and whether it is ready. */
    async engineUI() {
      const w = $('vEngine').value === 'whisper';
      $('vLang').hidden = w;
      $('vNote').textContent = w
        ? 'Offline Whisper: your voice is turned into text on this PC only. Nothing is sent to the internet.'
        : 'Browser voice: your voice is sent to Google (Chrome) or Microsoft (Edge) to be turned into text, so it needs internet. Typed sentences never leave your PC.';
      if (w) {
        const ok = await FT.Whisper.available(true);
        this.state(ok ? '✔ Offline Whisper engine is running. Click the mic and speak; pause briefly after each sentence.'
          : 'Offline voice engine is not running. Double-click “Start Voice Engine” in the Family Tree folder, then click the mic again.', !ok);
      } else if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
        this.state('This browser has no built-in speech recognition. Choose Offline Whisper, or type below.', true);
      } else this.state('Click the mic and say a sentence.');
    },
    async startWhisper() {
      if (!(await FT.Whisper.available(true))) { this.engineUI(); return; }
      this.listening = true; this.micUI();
      this.state('Listening (offline Whisper)… say a sentence, then pause. Say “undo” to take back the last change.');
      const ctl = await FT.Whisper.listen({
        onState: (st) => {
          if (!this.listening) return;
          if (st === 'hearing') $('vLive').innerHTML = (this.pending ? esc(this.pending) + ' ' : '') + '<i>🎤 hearing you…</i>';
          if (st === 'transcribing') $('vLive').innerHTML = (this.pending ? esc(this.pending) + ' ' : '') + '<i>⏳ writing it down…</i>';
        },
        onLevel: (v) => { $('vMic').style.boxShadow = this.listening ? '0 0 0 ' + Math.round(v * 10) + 'px rgba(220,38,38,.25)' : ''; },
        onText: (t) => this.heard(t),
        onError: (e) => { this.stop(); this.state(e.message, true); }
      });
      if (!this.listening) ctl.stop(); else this.wctl = ctl;
    },
    start() {
      if ($('vEngine').value === 'whisper') return this.startWhisper();
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { this.engineUI(); return; }
      const rec = this.rec = new SR();
      rec.lang = $('vLang').value; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) this.heard(r[0].transcript.trim()); else interim += r[0].transcript;
        }
        $('vLive').innerHTML = (this.pending ? esc(this.pending) + ' ' : '') + (interim ? '<i>' + esc(interim) + '</i>' : '');
      };
      rec.onerror = (e) => {
        const m = {
          'not-allowed': 'Microphone is blocked. Click the camera/mic icon in the address bar and allow the microphone.',
          'service-not-allowed': 'Speech service not allowed in this browser window.',
          network: 'Speech service unreachable. Voice needs an internet connection (typing still works).',
          'audio-capture': 'No microphone found.',
          'no-speech': null, aborted: null
        }[e.error];
        if (m === undefined) this.state('Voice error: ' + e.error, true);
        else if (m) { this.state(m, true); this.listening = false; this.micUI(); }
      };
      rec.onend = () => { if (this.listening) { try { rec.start(); } catch (x) { this.listening = false; this.micUI(); } } else this.micUI(); };
      try { rec.start(); this.listening = true; this.state('Listening… speak one sentence at a time. Say “undo” to take back the last change.'); }
      catch (x) { this.state('Could not start the microphone: ' + x.message, true); }
      this.micUI();
    },
    stop() {
      this.listening = false;
      if (this.rec) { try { this.rec.stop(); } catch (x) { /* ignore */ } }
      if (this.wctl) { this.wctl.stop(); this.wctl = null; }
      $('vMic').style.boxShadow = '';
      this.micUI();
      if (this.pending) this.flushPending();
    },
    micUI() {
      $('vMic').classList.toggle('on', this.listening);
      $('vMicLabel').textContent = this.listening ? 'Listening… click to stop' : 'Start speaking';
      if (!this.listening && !$('vState').classList.contains('err')) this.state('Click the mic and say a sentence.');
    },
    /** A final chunk of speech arrived. Hold it if the sentence clearly isn't finished yet. */
    heard(t) {
      if (!t) return;
      const text = (this.pending ? this.pending + ' ' : '') + t;
      clearTimeout(this.pendingTimer);
      if (DANGLING.test(text)) {
        this.pending = text;
        $('vLive').textContent = text + ' …';
        this.state('Waiting for the rest of the sentence…');
        this.pendingTimer = setTimeout(() => this.flushPending(), 8000);
        return;
      }
      this.pending = '';
      $('vLive').textContent = text;
      this.execute(text, 'voice');
    },
    flushPending() {
      clearTimeout(this.pendingTimer);
      const t = this.pending; this.pending = '';
      if (t) this.execute(t, 'voice');
    },

    // ---------- run a sentence ----------
    execute(text, source) {
      const M = FT.app, U = FT.UI;
      if (M.readOnly) return;
      if (U.editing) U.commitInline();
      // If the user clicked a different card since the last sentence, "he / she / father is …" means that card.
      const clicked = U.sel && U.sel !== this.lastFocus;
      const ctx = { selectedId: U.sel, lastId: !clicked && this.lastId && M.person(this.lastId) ? this.lastId : null };
      const before = M.undoStack.length;
      let res;
      try { M.change(() => { res = FT.Voice.run(M, text, ctx); }); }
      catch (e) { res = { msgs: [{ ok: false, text: 'Something went wrong: ' + e.message }] }; }
      res = res || { msgs: [] };
      if (res.special === 'undo') { this.undoLast(); this.addEntry(text, [{ ok: true, text: 'Undid the last change' }], null); return; }
      if (res.special === 'redo') { M.redo(); this.addEntry(text, [{ ok: true, text: 'Redone' }], null); return; }
      const changed = M.undoStack.length > before;
      this.addEntry(text, res.msgs && res.msgs.length ? res.msgs : [{ ok: false, text: 'Nothing to change.' }], changed ? M.undoStack.length : null);
      if (res.lastId) this.lastId = res.lastId;
      const f = res.focusId && M.person(res.focusId) ? res.focusId : null;
      if (f) {
        if (!U.nodeOf(f)) { U.render(); if (!U.nodeOf(f)) { U.st.view = 'hourglass'; U.st.rootId = f; } }
        U.select(f, { reveal: true });
      } else U.render();
      this.lastFocus = U.sel;
      if (source === 'typed') setTimeout(() => $('vText').focus(), 0);
    },
    addEntry(text, msgs, undoLen) {
      this.log.unshift({ text, msgs, undoLen, undone: false });
      this.log = this.log.slice(0, 60);
      this.renderLog();
    },
    undoLast() {
      const M = FT.app; if (!M.canUndo()) { this.state('Nothing to undo.'); return; }
      const len = M.undoStack.length;
      const e = this.log.find((x) => x.undoLen === len && !x.undone);
      M.undo();
      if (e) e.undone = true;
      this.renderLog();
      FT.UI.toast('Undone' + (e ? ': “' + e.text + '”' : ''), true, { label: 'Redo', fn: () => { M.redo(); if (e) e.undone = false; this.renderLog(); } });
    },
    renderLog() {
      if (!this.open) return;
      const M = FT.app, top = M.undoStack.length;
      $('vUndo').disabled = !M.canUndo();
      $('vLog').innerHTML = this.log.map((e, i) => {
        const can = e.undoLen === top && !e.undone;
        return `<div class="v-entry${e.undone ? ' undone' : ''}">${can ? `<button class="eu" data-i="${i}">↶ Undo</button>` : ''}<div class="said">${esc(e.text)}</div>` +
          e.msgs.map((m) => `<div class="m${m.ok ? '' : ' bad'}">${m.ok ? '✔' : '⚠'} ${esc(m.text)}</div>`).join('') + '</div>';
      }).join('') || '<div class="v-state">Nothing yet. Try an example ↑</div>';
      $('vLog').querySelectorAll('.eu').forEach((b) => { b.onclick = () => this.undoLast(); });
    },
    /** Called after every tree render: show who "he / she / father is …" refers to. */
    refresh() {
      if (!this.open) return;
      const M = FT.app, id = FT.UI.sel || (this.lastId && M.person(this.lastId) ? this.lastId : null);
      $('vCtx').textContent = id ? M.displayName(id) + (FT.UI.sel ? ' (selected)' : ' (last mentioned)') : 'nobody selected – click a card';
      this.renderLog();
    }
  };
  FT.VoicePanel = VP;
})();
