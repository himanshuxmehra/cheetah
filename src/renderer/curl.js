// Tokenize a shell-ish command line: honours quotes, escapes and line continuations.
const tokenize = (input) => {
  const tokens = [];
  let current = '';
  let quote = null;
  let has = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      if (char === '\\' && quote === '"' && i + 1 < input.length) {
        current += input[++i];
      } else if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      has = true;
    } else if (char === '\\' && (input[i + 1] === '\n' || input[i + 1] === '\r')) {
      i += input[i + 1] === '\r' ? 2 : 1;
    } else if (char === '\\' && i + 1 < input.length) {
      current += input[++i];
      has = true;
    } else if (/\s/.test(char)) {
      if (current || has) tokens.push(current);
      current = '';
      has = false;
    } else {
      current += char;
      has = true;
    }
  }
  if (current || has) tokens.push(current);
  return tokens;
};

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const parseCurl = (text) => {
  const tokens = tokenize(text.trim().replace(/^\s*curl\s+/, ''));
  const request = { method: null, url: '', headers: [], body: '', auth: { type: 'none' } };
  const bodyParts = [];
  let isForm = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = () => tokens[++i] ?? '';

    if (token === '-X' || token === '--request') {
      request.method = next().toUpperCase();
    } else if (token === '-H' || token === '--header') {
      const raw = next();
      const at = raw.indexOf(':');
      if (at > 0) request.headers.push({ key: raw.slice(0, at).trim(), value: raw.slice(at + 1).trim(), enabled: true });
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-ascii') {
      bodyParts.push(next());
    } else if (token === '--data-urlencode') {
      bodyParts.push(next());
    } else if (token === '-F' || token === '--form') {
      isForm = true;
      bodyParts.push(next());
    } else if (token === '-u' || token === '--user') {
      const [username, ...rest] = next().split(':');
      request.auth = { type: 'basic', username, password: rest.join(':') };
    } else if (token === '-A' || token === '--user-agent') {
      request.headers.push({ key: 'User-Agent', value: next(), enabled: true });
    } else if (token === '-b' || token === '--cookie') {
      request.headers.push({ key: 'Cookie', value: next(), enabled: true });
    } else if (token === '-k' || token === '--insecure') {
      request.verifySsl = false;
    } else if (token === '-L' || token === '--location') {
      request.followRedirects = true;
    } else if (token === '-I' || token === '--head') {
      request.method = 'HEAD';
    } else if (token === '--url') {
      request.url = next();
    } else if (token.startsWith('-')) {
      // Unknown flags that take a value would otherwise swallow the URL.
      if (/^--?(o|output|w|write-out|m|max-time|x|proxy|E|cert|connect-timeout|retry)$/.test(token)) next();
    } else if (!request.url) {
      request.url = token;
    }
  }

  if (request.url && !/^https?:\/\//i.test(request.url)) request.url = `https://${request.url}`;

  if (bodyParts.length) {
    if (isForm) {
      request.bodyType = 'form-data';
      request.formData = bodyParts.map((part) => {
        const at = part.indexOf('=');
        return { key: part.slice(0, at), value: part.slice(at + 1), enabled: true };
      });
    } else {
      request.body = bodyParts.join('&');
      const contentType = request.headers.find((h) => h.key.toLowerCase() === 'content-type')?.value || '';
      request.bodyType = contentType.includes('json')
        ? 'json'
        : contentType.includes('x-www-form-urlencoded')
          ? 'form-urlencoded'
          : /^\s*[[{]/.test(request.body)
            ? 'json'
            : 'text';
    }
  }

  if (!request.method) request.method = bodyParts.length ? 'POST' : 'GET';
  if (!BODY_METHODS.has(request.method)) request.bodyType = request.bodyType || 'none';

  const auth = request.headers.find((h) => h.key.toLowerCase() === 'authorization');
  if (auth && /^bearer /i.test(auth.value)) {
    request.auth = { type: 'bearer', token: auth.value.slice(7) };
    request.headers = request.headers.filter((h) => h !== auth);
  }

  return request;
};

const shellQuote = (value) => (/^[\w@%+=:,./-]+$/.test(value) ? value : `'${String(value).replace(/'/g, `'\\''`)}'`);

export const toCurl = (request) => {
  const lines = [`curl -X ${request.method} ${shellQuote(request.url)}`];
  for (const header of request.headers) {
    lines.push(`  -H ${shellQuote(`${header.key}: ${header.value}`)}`);
  }
  if (request.body) lines.push(`  -d ${shellQuote(request.body)}`);
  if (request.verifySsl === false) lines.push('  --insecure');
  if (request.followRedirects !== false) lines.push('  -L');
  return lines.join(' \\\n');
};
