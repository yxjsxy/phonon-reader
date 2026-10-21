import { DEFAULT_MODEL, PhononTTS, type LoadProgress } from 'phonon-tts';

/** Apache-2.0 English checkpoint. The CC BY-NC 40m models are never loaded. */
export const MODEL_REPO = 'gradium/phonon-31m-en';

export interface FileProgress {
  file: string;
  label: string;
  loaded: number;
  total: number | null;
  cached: boolean;
}

export interface ReadyModel {
  tts: PhononTTS;
  sampleRate: number;
  device: 'webgpu' | 'cpu';
  deviceReason: string;
  threads: number;
  threadsReason: string;
}

/**
 * Download Phonon 31m from Hugging Face (or the browser Cache API) and start it.
 * `device: 'auto'` uses WebGPU when the browser has a hardware adapter, and the
 * CPU otherwise. A missing GPU is reported by the caller; this function never
 * substitutes the Web Speech API.
 */
export async function loadReaderModel(
  onProgress: (files: FileProgress[]) => void,
): Promise<ReadyModel> {
  assertApacheModel(DEFAULT_MODEL);

  const files = new Map<string, FileProgress>();
  const tts = await PhononTTS.load({
    lang: 'en',
    quant: 'q8',
    model: DEFAULT_MODEL,
    device: 'auto',
    onProgress(progress) {
      files.set(progress.file, toFileProgress(progress));
      onProgress([...files.values()]);
    },
  });

  return {
    tts,
    sampleRate: tts.sampleRate,
    device: tts.device,
    deviceReason: tts.deviceReason,
    threads: tts.threads,
    threadsReason: tts.threadsReason,
  };
}

export function deviceNotice(model: ReadyModel): { level: 'ok' | 'warn'; message: string } {
  if (model.device === 'webgpu') {
    return {
      level: 'ok',
      message: `WebGPU is on. ${model.deviceReason}.`,
    };
  }

  const missing = /no WebGPU|WebGPU failed|software fallback/i.test(model.deviceReason);
  if (missing) {
    return {
      level: 'warn',
      message:
        `WebGPU is missing or unusable (${model.deviceReason}). ` +
        'Phonon is running on the CPU in this browser. ' +
        'This reader does not fall back to the Web Speech API.',
    };
  }

  return {
    level: 'ok',
    message: `Running on the CPU. ${model.deviceReason}.`,
  };
}

export function formatLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/webgpu/i.test(message)) {
    return `WebGPU could not start. ${message} Playback stays off. This reader does not fall back to the Web Speech API.`;
  }
  if (/simd/i.test(message)) {
    return `This browser cannot run Phonon. ${message}`;
  }
  return message;
}

function assertApacheModel(model: string): void {
  const allowed = model === `hf://${MODEL_REPO}` || model.startsWith(`hf://${MODEL_REPO}@`);
  if (!allowed || model.includes('40m')) {
    throw new Error(
      `Refusing to load ${model}. Phonon Reader only loads Apache-2.0 ${MODEL_REPO}.`,
    );
  }
}

function toFileProgress(progress: LoadProgress): FileProgress {
  return {
    file: progress.file,
    label: fileLabel(progress.file),
    loaded: progress.loaded,
    total: progress.total,
    cached: progress.cached,
  };
}

function fileLabel(file: string): string {
  if (file === 'weights') return 'Model weights';
  if (file === 'tokenizer') return 'Tokenizer';
  if (file === 'config') return 'Config';
  if (file.startsWith('voice:')) {
    const name = file.slice('voice:'.length);
    return name === 'default' ? 'Default voice' : `Voice ${name}`;
  }
  return file;
}
