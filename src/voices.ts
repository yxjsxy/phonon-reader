/** Hub commit of gradium/phonon-voices inspected for this reader. */
export const VOICES_REPO = 'gradium/phonon-voices';
export const VOICES_REVISION = '0ee17205f254b5abc43b266c8a0f215565c352f7';

export interface CatalogVoice {
  id: string;
  name: string;
  locale: string;
  gender: string;
  age: string;
  description: string;
  /** Resolved only when the voice is selected. The file is not fetched here. */
  url: string;
}

interface VoiceRow {
  filename?: string;
  name?: string;
  voice_id?: string;
  language?: string;
  locale?: string;
  gender?: string;
  age?: string;
  description?: string;
}

/**
 * Read the English catalog index. This downloads `voices.jsonl` only.
 * A voice embedding is fetched later, when that voice is selected.
 */
export async function loadEnglishVoices(): Promise<CatalogVoice[]> {
  const indexUrl = hubFile('voices.jsonl');
  const response = await fetch(indexUrl);
  if (!response.ok) {
    throw new Error(`Could not read ${VOICES_REPO} (HTTP ${response.status}).`);
  }

  const voices: CatalogVoice[] = [];
  for (const line of (await response.text()).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed) as VoiceRow;
    if (row.language !== 'en') continue;
    if (!row.filename || !row.name || !row.voice_id) continue;
    voices.push({
      id: row.voice_id,
      name: row.name,
      locale: row.locale ?? 'en',
      gender: row.gender ?? '',
      age: row.age ?? '',
      description: row.description ?? '',
      url: hubFile(row.filename),
    });
  }

  voices.sort((a, b) => a.name.localeCompare(b.name) || a.locale.localeCompare(b.locale));
  return voices;
}

export function localeLabel(locale: string): string {
  if (locale === 'en-us') return 'English (US)';
  if (locale === 'en-gb') return 'English (UK)';
  if (locale === 'characters') return 'Characters';
  return locale;
}

function hubFile(path: string): string {
  const encoded = path.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://huggingface.co/${VOICES_REPO}/resolve/${VOICES_REVISION}/${encoded}`;
}
