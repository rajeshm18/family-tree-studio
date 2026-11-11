/* Boot: load embedded / saved tree and start the UI. */
(function () {
  'use strict';
  const M = new FT.Model();
  FT.app = M;
  FT.IO.init(M, (msg) => FT.UI.status(msg));
  const start = FT.IO.initial();
  if (start.mode === 'viewer') {
    M.readOnly = true; FT.UI.readOnly = true;
    document.body.classList.add('viewer', 'has-banner');
    const b = document.getElementById('banner'); b.hidden = false;
    b.textContent = '👁 View-only family tree. Click anyone for details, right-click for views, Shift+click two people to see how they are related.';
    document.querySelectorAll('.edit-only').forEach((e) => { e.style.display = 'none'; });
  }
  // First open on a computer with no tree saved yet: show the example family so people see what it looks like.
  const firstTime = !start.data && start.mode !== 'viewer';
  if (firstTime) { const ex = JSON.parse(JSON.stringify(FT.SAMPLE)); ex.meta.id = FT.uid('t'); ex.meta.example = true; start.data = ex; }
  M.load(start.data || FT.emptyData());
  FT.UI.init(M);
  if (!M.readOnly && FT.VoicePanel) FT.VoicePanel.init();
  if (FT.AnPanel) FT.AnPanel.init();
  FT.UI.render();
  if (FT.Extras) FT.Extras.remindOnOpen();
  if (firstTime) FT.UI.status('Example family');
  else if (!start.data || !M.count()) FT.UI.status('Nothing saved yet');
  else if (!M.readOnly) FT.UI.status('Loaded from this browser');
  window.addEventListener('beforeunload', () => { if (!M.readOnly) FT.IO.saveNow(); });
})();
