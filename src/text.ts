const NAV_AND_SCRIPTS = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'nav',
  '[role="navigation"]',
].join(', ');

const BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tr',
  'ul',
]);

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'etc',
  'fig',
  'no',
  'vol',
  'pp',
  'eg',
  'ie',
  'us',
  'uk',
]);

/** True when the paste looks like markup rather than prose. */
export function looksLikeHtml(source: string): boolean {
  return /<\/?[a-z!][^>]*>/i.test(source);
}

/** Collapse runs of spaces and keep paragraph breaks. */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Plain text is kept. HTML is parsed, then nav, scripts, and other non-body
 * chrome are removed. The returned string is the remaining body text.
 */
export function extractReadableText(input: string): string {
  const source = input.replace(/^\uFEFF/, '').trim();
  if (!source) return '';
  if (!looksLikeHtml(source)) return normalizeWhitespace(source);

  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll(NAV_AND_SCRIPTS).forEach((node) => node.remove());
  // A document from DOMParser is not laid out, so innerText would glue
  // neighbouring blocks together. Walk the tree and break on blocks instead.
  const text = doc.body ? blockText(doc.body) : '';
  return normalizeWhitespace(text);
}

function blockText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';

  const name = node.tagName.toLowerCase();
  if (name === 'br' || name === 'hr') return '\n';

  let text = '';
  for (const child of node.childNodes) text += blockText(child);
  return BLOCKS.has(name) ? `\n${text}\n` : text;
}

/**
 * Split English prose into sentences for one `stream()` call each.
 * Abbreviations, initials, decimals, and URLs stay inside the sentence.
 */
export function splitSentences(text: string): string[] {
  const clean = normalizeWhitespace(text);
  if (!clean) return [];

  const sentences: string[] = [];
  for (const paragraph of clean.split(/\n{2,}/)) {
    const flat = paragraph.replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    sentences.push(...splitParagraph(flat));
  }
  return sentences;
}

function splitParagraph(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    if (ch === '.' && skipDot(text, i)) continue;

    let end = i + 1;
    while (end < text.length && /["”'’)\]]/.test(text[end]!)) end += 1;

    const rest = text.slice(end);
    const atEnd = rest.trim() === '';
    const nextSentence = /^\s+[A-Z0-9]/.test(rest);
    if (!atEnd && !nextSentence) continue;

    const sentence = text.slice(start, end).trim();
    if (sentence) sentences.push(sentence);
    start = end;
    i = end - 1;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

function skipDot(text: string, index: number): boolean {
  const before = text[index - 1] ?? '';
  const after = text[index + 1] ?? '';
  if (/\d/.test(before) && /\d/.test(after)) return true;

  const token = tokenAt(text, index);
  if (token.includes('://') || token.includes('@') || token.startsWith('www.')) return true;

  const key = abbreviationKey(text, index);
  if (ABBREVIATIONS.has(key)) return true;

  const word = wordBeforeDot(text, index);
  return /^[A-Z]$/.test(word);
}

function tokenAt(text: string, index: number): string {
  let start = index;
  let end = index + 1;
  while (start > 0 && !/\s/.test(text[start - 1]!)) start -= 1;
  while (end < text.length && !/\s/.test(text[end]!)) end += 1;
  return text.slice(start, end);
}

function wordBeforeDot(text: string, index: number): string {
  let start = index;
  while (start > 0 && /[A-Za-z]/.test(text[start - 1]!)) start -= 1;
  return text.slice(start, index);
}

function abbreviationKey(text: string, index: number): string {
  let start = index;
  while (start > 0 && /[A-Za-z.]/.test(text[start - 1]!)) start -= 1;
  return text
    .slice(start, index + 1)
    .replace(/\./g, '')
    .toLowerCase();
}
