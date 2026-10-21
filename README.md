# Phonon Reader

Phonon Reader is a privacy-first English text-to-speech page. Speech is synthesized in your browser with [Phonon 31m](https://huggingface.co/gradium/phonon-31m-en) through the official [`phonon-tts`](https://www.npmjs.com/package/phonon-tts) package (0.4.0). The text you paste is not uploaded, and there is no server-side voice.

The checkpoint is Apache-2.0 `gradium/phonon-31m-en`. This app does not load the CC BY-NC Phonon 40m models.

The first visit downloads the model from Hugging Face. `phonon-tts` stores those files in the browser [Cache API](https://developer.mozilla.org/docs/Web/API/Cache), so the next visit in the same browser starts from disk. Caching needs `https://` or `localhost`.

## Requirements

- Node.js 22 or newer
- A current Chromium or Firefox with WebAssembly SIMD
- WebGPU is used when the browser exposes a hardware adapter (`device: 'auto'`). If WebGPU is missing, Phonon runs on the CPU and the page says so. It never falls back to the Web Speech API.

## Run

```sh
npm install
npm run dev
```

The dev server is fixed at [http://127.0.0.1:5173](http://127.0.0.1:5173).

```sh
npm run build
npm run preview
```

The preview server is fixed at [http://127.0.0.1:4173](http://127.0.0.1:4173).

`npm test` checks sentence splitting. `npm run typecheck` runs the TypeScript compiler.

## Use

1. Wait until the weights finish loading. A cached file is marked Cached.
2. Paste plain text, or HTML. Navigation and scripts are removed; the body text is kept.
3. Press Play, Pause, or Stop. Pause suspends the audio clock. The sentence being spoken is highlighted in time with that clock.
4. The voice menu starts on the checkpoint's default voice. Picking a voice from [`gradium/phonon-voices`](https://huggingface.co/gradium/phonon-voices) downloads that voice, and only that voice.

## Licence

Application code in this repository is released under Apache-2.0. `phonon-tts` is MIT OR Apache-2.0. Phonon 31m weights are Apache-2.0 and are downloaded by the browser, not vendored here. Catalog voices have their own terms on the Hugging Face repo.
