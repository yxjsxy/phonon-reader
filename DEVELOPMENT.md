# Development

Phonon Reader is a Vite + TypeScript single-page app. Synthesis stays in the page. There is no backend, no API key, and no Web Speech API fallback.

## Layout

| File | Role |
| --- | --- |
| `src/model.ts` | Loads the checkpoint and reports download progress. |
| `src/player.ts` | Turns `stream()` PCM into scheduled `AudioContext` buffers and tracks the sentence clock. |
| `src/voices.ts` | Lists English voices from `gradium/phonon-voices`. Embeddings are not fetched here. |
| `src/text.ts` | Strips HTML chrome and splits prose into sentences. |
| `src/main.ts` | Wires the page: progress, Play / Pause / Stop, voice picker, highlight. |

## Model load

`src/model.ts` calls the official 0.4.0 loader:

```ts
PhononTTS.load({
  lang: 'en',
  quant: 'q8',
  model: DEFAULT_MODEL,
  device: 'auto',
  onProgress,
})
```

`DEFAULT_MODEL` is exported by `phonon-tts` as `hf://gradium/phonon-31m-en@<commit>`. The loader refuses any other repo, including the gated CC BY-NC 40m checkpoints. The package resolves that repo to `config.json`, `tokenizer.json`, `model.q8.gguf`, and `default-voice.safetensors`, then keeps the bytes in the Cache API (`phonon-tts-v1`). `onProgress` reports each file as `weights`, `tokenizer`, `config`, or `voice:<name>`, with `cached: true` on a cache hit.

`device: 'auto'` follows the package: a hardware WebGPU adapter runs the q8 GGUF weights on the GPU; otherwise generation stays on the WASM CPU path. The page prints `tts.deviceReason`. If WebGPU is missing, that line is a warning and playback still uses Phonon on the CPU. `speechSynthesis` is never called. If `load` rejects (no SIMD, a hard WebGPU failure, a Hub error), Play stays disabled and the error is shown.

CPU threads need cross-origin isolation. `vite.config.ts` sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on the dev server (port 5173) and the preview server (port 4173). Hugging Face allows the page origin via CORS, so the checkpoint download still succeeds. Without isolation the package runs on one thread and `tts.threadsReason` explains why.

## Playback

`SentencePlayer` splits the passage with `splitSentences` and calls `tts.stream(sentence)` once per sentence. Each call yields mono `Float32Array` chunks at `tts.sampleRate` (24000). Chunks are copied into `AudioBuffer`s and started on an `AudioContext` timeline, the same scheduling pattern as the `phonon-tts` README.

The highlight does not use wall-clock timers. A 50 ms poll reads `AudioContext.currentTime` and marks the sentence whose scheduled `[start, end)` contains that time. Pause calls `AudioContext.suspend()`, which freezes `currentTime`, so the highlight stays put. Resume calls `resume()`. Stop aborts the stream, stops scheduled sources, and closes the context.

Changing the voice does not rewrite audio already scheduled. The next Play uses the new voice.

## Voices

The checkpoint contributes one voice, registered by `phonon-tts` as `default`. The picker labels it Default and omits a `voice` option so the package default is used.

The rest of the menu is English rows from `voices.jsonl` in `gradium/phonon-voices`, pinned to commit `0ee17205f254b5abc43b266c8a0f215565c352f7`. Selecting a row calls `tts.addVoice(name, url)` with that voice's `.safetensors` URL. Unselected voices are not requested. `addVoice` goes through the same Cache API, so a later visit reuses the file.

## Text

Paste prefers `text/html` when the clipboard has it. `extractReadableText` parses with `DOMParser` (scripts do not run), removes `script`, `style`, `noscript`, `template`, `iframe`, `object`, `embed`, `nav`, and `[role=navigation]`, then reads `body.innerText`. Plain text is only whitespace-normalized. Play runs the same extractor, so HTML pasted as source is stripped too.

Sentence boundaries are `.`, `!`, and `?`, including a closing quote, when the next word starts with a capital or digit. Dots inside abbreviations (`Dr.`, `e.g.`, `U.S.`), initials (`J. K.`), decimals (`3.14`), and URLs are not boundaries.

## What this app does not do

- No Voxtral, no hosted TTS, no proxy that could see the text.
- No secrets and no deploy config.
- No vendored weights. The browser fetches them from Hugging Face.
