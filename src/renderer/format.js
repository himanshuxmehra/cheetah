export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

export const formatMs = (ms) => {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
};

export const statusClass = (status) => {
  if (!status) return 'err';
  if (status < 300) return 'ok';
  if (status < 400) return 'redirect';
  if (status < 500) return 'warn';
  return 'err';
};

const LANG_BY_TYPE = [
  [/json/, 'json'],
  [/html/, 'html'],
  [/xml|svg/, 'xml'],
  [/javascript/, 'js'],
  [/css/, 'css'],
  [/^image\//, 'image'],
  [/^audio\/|^video\//, 'media'],
  [/^text\//, 'text']
];

export const detectLanguage = (contentType = '') => {
  const type = contentType.toLowerCase();
  for (const [pattern, lang] of LANG_BY_TYPE) if (pattern.test(type)) return lang;
  return 'binary';
};

export const prettify = (text, lang) => {
  if (lang === 'json') {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  if (lang === 'html' || lang === 'xml') return prettifyMarkup(text);
  return text;
};

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const prettifyMarkup = (text) => {
  const parts = text.replace(/>\s*</g, '><').split(/(<[^>]+>)/).filter((part) => part.trim());
  let depth = 0;
  const out = [];
  for (const part of parts) {
    const isClose = /^<\//.test(part);
    const isSelfClosing = /\/>$/.test(part) || VOID_TAGS.has((part.match(/^<([\w-]+)/) || [])[1]);
    const isMeta = /^<[!?]/.test(part);
    if (isClose) depth = Math.max(0, depth - 1);
    out.push('  '.repeat(depth) + part.trim());
    if (/^</.test(part) && !isClose && !isSelfClosing && !isMeta) depth += 1;
  }
  return out.join('\n');
};

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

// Tokenize the raw text and escape each span's contents — escaping first would
// turn every quote into &quot; and leave the string pattern unmatchable.
const highlightJson = (text) => {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(JSON_TOKEN)) {
    const [full, str, colon, literal, number] = match;
    out += escapeHtml(text.slice(last, match.index));
    if (str) {
      const cls = colon ? 't-key' : 't-str';
      out += `<span class="${cls}">${escapeHtml(str)}</span>${colon || ''}`;
    } else if (literal) {
      out += `<span class="t-lit">${literal}</span>`;
    } else {
      out += `<span class="t-num">${number}</span>`;
    }
    last = match.index + full.length;
  }
  return out + escapeHtml(text.slice(last));
};

// Lightweight tokenizer — enough for readable colour on the payloads an API
// client actually shows, without pulling in a highlighting dependency.
export const highlight = (text, lang) => {
  if (lang === 'json') return highlightJson(text);
  if (lang === 'html' || lang === 'xml') {
    return escapeHtml(text)
      .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="t-tag">$2</span>')
      .replace(/([\w:-]+)=(&quot;.*?&quot;)/g, '<span class="t-key">$1</span>=<span class="t-str">$2</span>');
  }
  return escapeHtml(text);
};

// Substitute {{variable}} references from the active environment.
export const interpolate = (text, vars) => {
  if (!text || !text.includes('{{')) return text;
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, name) => (name in vars ? vars[name] : match));
};

export const missingVars = (text, vars) => {
  const found = new Set();
  if (!text) return found;
  for (const match of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    if (!(match[1] in vars)) found.add(match[1]);
  }
  return found;
};

export const uid = () => Math.random().toString(36).slice(2, 10);
