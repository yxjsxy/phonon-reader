import type { PhononTTS } from 'phonon-tts';

export type PlaybackState = 'idle' | 'playing' | 'paused';

export interface PlayerHooks {
  onSentence: (index: number | null) => void;
  onState: (state: PlaybackState) => void;
  onError: (message: string) => void;
}

interface SentenceRange {
  index: number;
  start: number;
  end: number;
}

/**
 * Speak one sentence per `stream()` call. PCM is scheduled on an AudioContext
 * clock at the model's sample rate (24 kHz for Phonon). Pause suspends that
 * context, so the highlight stays on the sentence the clock is inside.
 */
export class SentencePlayer {
  #generation = 0;
  #state: PlaybackState = 'idle';
  #context: AudioContext | null = null;
  #sources: AudioBufferSourceNode[] = [];
  #abort: AbortController | null = null;
  #ranges: SentenceRange[] = [];
  #active: number | null = null;
  #clockTimer = 0;

  constructor(
    private readonly tts: PhononTTS,
    private readonly hooks: PlayerHooks,
  ) {}

  get state(): PlaybackState {
    return this.#state;
  }

  async play(sentences: readonly string[], voice?: string): Promise<void> {
    this.stop();
    const generation = this.#generation;
    const context = createContext(this.tts.sampleRate);
    this.#context = context;
    this.#ranges = [];
    this.#active = null;
    this.#abort = new AbortController();

    if (context.state === 'suspended') await context.resume();
    if (generation !== this.#generation) return;

    this.#setState('playing');
    this.#watchClock(generation);

    let cursor = context.currentTime;
    try {
      for (let index = 0; index < sentences.length; index += 1) {
        if (generation !== this.#generation) return;
        const text = sentences[index]?.trim() ?? '';
        if (!text) continue;
        cursor = await this.#speakSentence(generation, context, index, text, voice, cursor);
      }
      await this.#waitUntilPlayed(generation, cursor);
      if (generation !== this.#generation) return;
      this.stop();
    } catch (error) {
      if (generation !== this.#generation || isAbort(error)) return;
      this.hooks.onError(error instanceof Error ? error.message : String(error));
      this.stop();
    }
  }

  pause(): void {
    if (this.#state !== 'playing' || !this.#context) return;
    void this.#context.suspend();
    this.#setState('paused');
  }

  resume(): void {
    if (this.#state !== 'paused' || !this.#context) return;
    void this.#context.resume();
    this.#setState('playing');
  }

  stop(): void {
    this.#generation += 1;
    this.#abort?.abort();
    this.#abort = null;
    window.clearInterval(this.#clockTimer);
    this.#clockTimer = 0;

    for (const source of this.#sources) {
      try {
        source.stop();
      } catch {
        // Already finished.
      }
      source.disconnect();
    }
    this.#sources = [];

    const context = this.#context;
    this.#context = null;
    if (context && context.state !== 'closed') void context.close();

    this.#ranges = [];
    this.#publishSentence(null);
    this.#setState('idle');
  }

  async #speakSentence(
    generation: number,
    context: AudioContext,
    index: number,
    text: string,
    voice: string | undefined,
    cursor: number,
  ): Promise<number> {
    const speech = this.tts.stream(text, {
      voice,
      signal: this.#abort?.signal,
    });
    let start: number | null = null;

    try {
      for await (const pcm of speech) {
        if (generation !== this.#generation) {
          speech.cancel();
          return cursor;
        }
        if (pcm.length === 0) continue;

        const buffer = context.createBuffer(1, pcm.length, this.tts.sampleRate);
        buffer.getChannelData(0).set(pcm);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const at = Math.max(cursor, context.currentTime);
        source.start(at);
        source.onended = () => source.disconnect();
        this.#sources.push(source);

        if (start === null) start = at;
        cursor = at + buffer.duration;
        this.#setRange(index, start, cursor);
      }
    } catch (error) {
      if (generation !== this.#generation || isAbort(error)) return cursor;
      throw error;
    }

    return cursor;
  }

  #setRange(index: number, start: number, end: number): void {
    const existing = this.#ranges.find((range) => range.index === index);
    if (existing) {
      existing.start = start;
      existing.end = end;
      return;
    }
    this.#ranges.push({ index, start, end });
  }

  #watchClock(generation: number): void {
    window.clearInterval(this.#clockTimer);
    this.#clockTimer = window.setInterval(() => {
      if (generation !== this.#generation || !this.#context) return;
      const time = this.#context.currentTime;
      let active: number | null = null;
      for (const range of this.#ranges) {
        if (time >= range.start && time < range.end) active = range.index;
      }
      this.#publishSentence(active);
    }, 50);
  }

  #waitUntilPlayed(generation: number, end: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = window.setInterval(() => {
        if (generation !== this.#generation || !this.#context) {
          window.clearInterval(timer);
          resolve();
          return;
        }
        if (this.#context.currentTime >= end - 0.02) {
          window.clearInterval(timer);
          resolve();
        }
      }, 50);
    });
  }

  #publishSentence(index: number | null): void {
    if (index === this.#active) return;
    this.#active = index;
    this.hooks.onSentence(index);
  }

  #setState(state: PlaybackState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.hooks.onState(state);
  }
}

function createContext(sampleRate: number): AudioContext {
  try {
    return new AudioContext({ sampleRate });
  } catch {
    return new AudioContext();
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
