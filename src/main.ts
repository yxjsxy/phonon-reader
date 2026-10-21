import { deviceNotice, formatLoadError, loadReaderModel, type FileProgress, type ReadyModel } from './model';
import { SentencePlayer, type PlaybackState } from './player';
import { extractReadableText, splitSentences } from './text';
import { loadEnglishVoices, localeLabel, type CatalogVoice } from './voices';

const SAMPLE = [
  'Phonon Reader speaks English on this device.',
  'Paste a paragraph, or a page of HTML, and the nav and scripts are left out.',
  'The model stays in this browser. The words are not uploaded.',
].join(' ');

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <main class="app">
    <header>
      <h1>Phonon Reader</h1>
      <p>English, read aloud in this tab by Phonon 31m. The text stays on your device.</p>
    </header>
    <section id="status" class="status" role="status" aria-live="polite">
      <p id="status-text">Loading Phonon 31m…</p>
      <div id="files" class="files"></div>
    </section>
    <div class="controls">
      <button id="play" type="button" disabled>Play</button>
      <button id="pause" type="button" class="secondary" disabled>Pause</button>
      <button id="stop" type="button" class="secondary" disabled>Stop</button>
      <label class="voice">
        Voice
        <select id="voice" disabled>
          <option value="">Default</option>
        </select>
      </label>
    </div>
    <div class="stage">
      <textarea id="source" spellcheck="true">${SAMPLE}</textarea>
      <article id="passage" class="passage" aria-live="off"></article>
    </div>
    <footer>
      Weights come from gradium/phonon-31m-en (Apache-2.0) and are cached in this browser after the first download.
      Extra voices come from gradium/phonon-voices and download only when you pick one.
    </footer>
  </main>
`;

const statusEl = required<HTMLElement>('#status');
const statusText = required<HTMLParagraphElement>('#status-text');
const filesEl = required<HTMLDivElement>('#files');
const playButton = required<HTMLButtonElement>('#play');
const pauseButton = required<HTMLButtonElement>('#pause');
const stopButton = required<HTMLButtonElement>('#stop');
const voiceSelect = required<HTMLSelectElement>('#voice');
const source = required<HTMLTextAreaElement>('#source');
const passage = required<HTMLElement>('#passage');

const catalog = new Map<string, CatalogVoice>();
const voiceJobs = new Map<string, Promise<void>>();
let model: ReadyModel | null = null;
let player: SentencePlayer | null = null;
let playback: PlaybackState = 'idle';

source.addEventListener('paste', onPaste);
source.addEventListener('input', () => {
  if (playback === 'idle') renderPassage(null);
});
playButton.addEventListener('click', () => void onPlay());
pauseButton.addEventListener('click', () => {
  if (!player) return;
  if (player.state === 'paused') player.resume();
  else player.pause();
});
stopButton.addEventListener('click', () => player?.stop());
voiceSelect.addEventListener('change', () => {
  void ensureSelectedVoice().catch((error: unknown) => {
    setStatus('error', error instanceof Error ? error.message : String(error));
  });
});

let latestFiles: FileProgress[] = [];
let progressDone = false;

renderPassage(null);
void boot();

async function boot(): Promise<void> {
  try {
    model = await loadReaderModel(renderProgress);
    player = new SentencePlayer(model.tts, {
      onSentence: (index) => renderPassage(index),
      onState: (state) => setPlayback(state),
      onError: (message) => setStatus('error', message),
    });
    progressDone = true;
    renderProgress(latestFiles);
    const notice = deviceNotice(model);
    const thread =
      model.device === 'cpu'
        ? ` ${model.threads} CPU thread${model.threads === 1 ? '' : 's'} (${model.threadsReason}).`
        : '';
    setStatus(notice.level === 'warn' ? 'warn' : 'ok', `${notice.message}${thread} Ready to read.`);
    playButton.disabled = false;
    voiceSelect.disabled = false;
    void loadVoices();
  } catch (error) {
    setStatus('error', formatLoadError(error));
    playButton.disabled = true;
  }
}

async function loadVoices(): Promise<void> {
  try {
    const voices = await loadEnglishVoices();
    const groups = new Map<string, CatalogVoice[]>();
    for (const voice of voices) {
      const list = groups.get(voice.locale) ?? [];
      list.push(voice);
      groups.set(voice.locale, list);
      catalog.set(voice.id, voice);
    }
    for (const locale of ['en-us', 'en-gb', 'characters', ...groups.keys()]) {
      const list = groups.get(locale);
      if (!list) continue;
      groups.delete(locale);
      const group = document.createElement('optgroup');
      group.label = localeLabel(locale);
      for (const voice of list) {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = `${voice.name} · ${voice.gender} · ${voice.age}`;
        option.title = voice.description;
        group.append(option);
      }
      voiceSelect.append(group);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus('warn', `The default voice is ready. The voice catalog did not load: ${message}`);
  }
}

async function onPlay(): Promise<void> {
  if (!model || !player) return;
  if (player.state === 'paused') {
    player.resume();
    return;
  }

  const text = extractReadableText(source.value);
  source.value = text;
  const sentences = splitSentences(text);
  renderPassage(null);
  if (sentences.length === 0) {
    setStatus('warn', 'Paste some text to read.');
    return;
  }

  try {
    const voice = await ensureSelectedVoice();
    await player.play(sentences, voice);
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : String(error));
  }
}

async function ensureSelectedVoice(): Promise<string | undefined> {
  const id = voiceSelect.value;
  if (!id) return undefined;
  const voice = catalog.get(id);
  const tts = model?.tts;
  if (!voice || !tts) return undefined;

  let job = voiceJobs.get(id);
  if (!job) {
    setStatus('ok', `Downloading ${voice.name}…`);
    playButton.disabled = true;
    job = tts.addVoice(voice.name, voice.url).then(() => undefined);
    voiceJobs.set(id, job);
    job.catch(() => voiceJobs.delete(id));
  }

  try {
    await job;
    playButton.disabled = playback !== 'idle';
    if (playback === 'idle') {
      setStatus('ok', `${voice.name} is ready.`);
    }
    return voice.name;
  } catch (error) {
    voiceSelect.value = '';
    if (playback === 'idle') playButton.disabled = model === null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not download ${voice.name}. ${message}`);
  }
}

function onPaste(event: ClipboardEvent): void {
  const html = event.clipboardData?.getData('text/html') ?? '';
  if (!html || !html.includes('<')) return;
  event.preventDefault();
  const text = extractReadableText(html);
  insertText(source, text);
  if (playback === 'idle') renderPassage(null);
}

function renderPassage(index: number | null): void {
  const sentences = splitSentences(extractReadableText(source.value));
  passage.replaceChildren();
  if (sentences.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Sentences show up here, and the one being spoken is highlighted.';
    passage.append(empty);
    return;
  }

  sentences.forEach((sentence, sentenceIndex) => {
    const span = document.createElement('span');
    span.className = 'sentence';
    span.dataset.index = String(sentenceIndex);
    span.textContent = sentence;
    if (sentenceIndex === index) span.classList.add('is-active');
    passage.append(span);
    if (sentenceIndex < sentences.length - 1) passage.append(' ');
  });

  if (index !== null) {
    passage.querySelector('.sentence.is-active')?.scrollIntoView({ block: 'nearest' });
  }
}

function renderProgress(files: FileProgress[]): void {
  latestFiles = files;
  filesEl.replaceChildren();
  files.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'file';
    const name = document.createElement('span');
    name.textContent = file.label;
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'progressbar');
    const finished =
      progressDone ||
      file.cached ||
      index < files.length - 1 ||
      (file.total !== null && file.loaded >= file.total);
    const ratio = finished ? 1 : file.total ? Math.min(1, file.loaded / file.total) : 0.12;
    const fill = document.createElement('span');
    fill.style.width = `${Math.round(ratio * 100)}%`;
    bar.append(fill);
    bar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    const detail = document.createElement('span');
    detail.textContent = file.cached
      ? 'Cached'
      : file.total
        ? `${formatBytes(file.loaded)} / ${formatBytes(file.total)}`
        : formatBytes(file.loaded);
    row.append(name, bar, detail);
    filesEl.append(row);
  });
  const current = files[files.length - 1];
  if (current && !progressDone) {
    statusText.textContent = current.cached
      ? `${current.label} loaded from the browser cache.`
      : `Downloading ${current.label.toLowerCase()}…`;
  }
}

function setPlayback(state: PlaybackState): void {
  playback = state;
  const busy = state !== 'idle';
  source.readOnly = busy;
  playButton.disabled = !model || state === 'playing';
  pauseButton.disabled = state !== 'playing' && state !== 'paused';
  pauseButton.textContent = state === 'paused' ? 'Resume' : 'Pause';
  stopButton.disabled = state === 'idle';
  voiceSelect.disabled = busy;
  if (state === 'idle') renderPassage(null);
}

function setStatus(level: 'ok' | 'warn' | 'error', message: string): void {
  statusEl.classList.remove('warn', 'error');
  if (level === 'warn') statusEl.classList.add('warn');
  if (level === 'error') statusEl.classList.add('error');
  statusEl.setAttribute('role', level === 'ok' ? 'status' : 'alert');
  statusText.textContent = message;
  if (level === 'error') filesEl.replaceChildren();
}

function insertText(field: HTMLTextAreaElement, text: string): void {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.setRangeText(text, start, end, 'end');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function required<T extends Element>(selector: string): T {
  const node = app?.querySelector<T>(selector) ?? document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}
