// node build.js  ->  two self-contained files built from the same code:
//   FamilyTree.html          everything, including "Tell the Tree" voice
//   FamilyTree-NoVoice.html  the same app without the voice feature (lighter, nothing to set up)
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const ORDER = ['model.js', 'gedcom.js', 'paste.js', 'sample.js', 'layout.js', 'render.js', 'io.js', 'ui.js', 'voice.js', 'whisper.js', 'voicepanel.js', 'analytics.js', 'merge.js', 'kin.js', 'analyticspanel.js', 'extras.js', 'photocrop.js', 'main.js'];
const VOICE_FILES = ['voice.js', 'whisper.js', 'voicepanel.js'];
// First statement captures the untouched page so "Share copy" can clone the whole app.
const pristine = "window.FT_PRISTINE = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;\n";

function build(withVoice, out) {
  const files = ORDER.filter((f) => withVoice || !VOICE_FILES.includes(f));
  const js = pristine + files.map((f) => '/* ==== ' + f + ' ==== */\n' + src(f)).join('\n').replace(/<\/script/gi, '<\\/script');
  let html = src('template.html');
  html = withVoice
    ? html.replace(/<!--\/?VOICE-->/g, '')
    : html.replace(/<!--VOICE-->[\s\S]*?<!--\/VOICE-->\n?/g, '');
  html = html.replace('/*CSS*/', () => src('app.css') + '\n' + src('analytics.css'));
  html = html.replace('<!--SCRIPTS-->', () => '<script>\n' + js + '\n</script>');
  fs.writeFileSync(path.join(__dirname, out), html);
  console.log('Built ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');
}

build(true, 'FamilyTree.html');
build(false, 'FamilyTree-NoVoice.html');
