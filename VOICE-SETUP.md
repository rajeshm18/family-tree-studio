# Offline voice (OpenAI Whisper) for Family Tree Studio

The voice version can understand you in two ways:
- **Browser voice:** works straight away in Chrome or Edge. It needs internet, and the browser's speech service hears the audio.
- **Offline voice engine (recommended):** uses OpenAI's open-source **Whisper** speech model through **whisper.cpp**, a free program that runs fully offline on Windows. Your voice never leaves your PC, and it handles Indian names and accents very well.

This page sets up the offline engine. It is a one-time setup of about 15 minutes.

## One-time setup (Windows)
1. Download the **voice kit** (`FamilyTree-Voice-Kit.zip`) from the project's Releases page and unzip it anywhere, e.g. `Documents\Family Tree`. It holds `FamilyTree.html`, the two `.bat` files and an empty `voice-engine` folder.
2. **The program.** Open <https://github.com/ggml-org/whisper.cpp/releases>. Under **Assets** of the latest release, download **`whisper-bin-x64.zip`**. Unzip it. From its `Release` folder, copy `whisper-server.exe` and **all the `.dll` files** into `voice-engine\bin` (create the `bin` folder).
3. **The speech model.** Open <https://huggingface.co/ggerganov/whisper.cpp/tree/main> and download **`ggml-large-v3-turbo-q5_0.bin`** (about 574 MB). Put it in `voice-engine\models` (create the `models` folder).
   - On an older or slower PC, use **`ggml-small-q5_1.bin`** (about 190 MB) instead. Then open `Start Voice Engine.bat` in Notepad and change the `MODEL=` line to that file name.
4. *(Optional, much faster on NVIDIA graphics cards)* From the same whisper.cpp release, download **`whisper-bin-win-cuda-12.4.0-x64.zip`** (or the newest CUDA build listed). Copy its `Release` files into `voice-engine\bin-gpu`. It is used automatically when an NVIDIA card is present: about 0.2 s per sentence instead of about 4 s. The very first start takes about 40 s while the graphics driver prepares itself.

Your folder should now look like this:
```
Family Tree\
  FamilyTree.html
  Open Family Tree with Voice.bat
  Start Voice Engine.bat
  voice-engine\
    bin\whisper-server.exe  (+ .dll files)
    models\ggml-large-v3-turbo-q5_0.bin
    bin-gpu\...             (optional)
```

## Daily use
1. Double-click **`Open Family Tree with Voice.bat`**. It starts the voice engine in a small minimised window and opens `FamilyTree.html`.
   - Or double-click **`Start Voice Engine.bat`** yourself, then open `FamilyTree.html` as usual.
2. Using voice:
   - **Name box mic:** hover a card, click a **+**, then click the **🎙** next to the name box (or press **F8**). Say the name, check it, and press **Enter**.
   - **Tell the Tree:** open it, keep the engine set to "Offline Whisper", click the mic and speak a sentence. Pause briefly after each sentence.
3. The first time, the browser asks to use the microphone. Click **Allow**.
4. When finished, close the black "Voice Engine" window.

Whisper is given the names already in your tree as hints, so it learns your family's spellings as the tree grows.

## Troubleshooting
* **"Offline voice engine is not running"**: the black engine window isn't open. Start it with `Start Voice Engine.bat`.
* **"The voice model file is missing"**: the model file isn't in `voice-engine\models`, or its name doesn't match the `MODEL=` line in `Start Voice Engine.bat`.
* **Mic blocked**: click the mic or lock icon in the browser's address bar and allow the microphone.
* **Engine window closes at once**: another copy is probably already running on port 8178, or a `.dll` file is missing from `voice-engine\bin`.
* **Windows warns about the `.bat` file or `whisper-server.exe`**: they are unsigned free programs. Click "More info → Run anyway" only if you downloaded them from the links above.
* You can still switch the voice panel to "Browser voice (online)" at any time.
