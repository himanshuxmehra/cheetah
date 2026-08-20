const http = require('node:http');
const https = require('node:https');
const zlib = require('node:zlib');
const { URL } = require('node:url');
const { performance } = require('node:perf_hooks');

const MAX_REDIRECTS = 10;
// Anything larger than this is kept as a size/type summary instead of a body we
// try to render — the renderer chokes long before the process does.
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const decompress = (buffer, encoding) => {
  if (!buffer.length) return buffer;
  try {
    switch ((encoding || '').toLowerCase()) {
      case 'gzip':
      case 'x-gzip':
        return zlib.gunzipSync(buffer);
      case 'deflate':
        return zlib.inflateSync(buffer);
      case 'br':
        return zlib.brotliDecompressSync(buffer);
      default:
        return buffer;
    }
  } catch {
    // A truncated or mislabelled stream shouldn't lose the response entirely.
    return buffer;
  }
};

const headerEntries = (rawHeaders) => {
  const out = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    out.push([rawHeaders[i], rawHeaders[i + 1]]);
  }
  return out;
};

const isRedirect = (status) => status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

const send = (request, onProgress) =>
  new Promise((resolve) => {
    const started = performance.now();
    const timings = { dns: null, connect: null, tls: null, firstByte: null, total: null };
    const redirects = [];

    const run = (url, method, headers, body, depth) => {
      let target;
      try {
        target = new URL(url);
      } catch {
        return resolve({ ok: false, error: `Invalid URL: ${url || '(empty)'}` });
      }
      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        return resolve({ ok: false, error: `Unsupported protocol: ${target.protocol}` });
      }

      const transport = target.protocol === 'https:' ? https : http;
      const req = transport.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || (target.protocol === 'https:' ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          method,
          headers,
          rejectUnauthorized: request.verifySsl !== false,
          timeout: request.timeout || 60000
        },
        (res) => {
          if (timings.firstByte === null) timings.firstByte = performance.now() - started;

          const chunks = [];
          let received = 0;
          let truncated = false;

          res.on('data', (chunk) => {
            received += chunk.length;
            if (received > MAX_BODY_BYTES) {
              truncated = true;
              res.destroy();
              return;
            }
            chunks.push(chunk);
            if (onProgress) onProgress(received);
          });

          res.on('end', () => finish());
          res.on('close', () => finish());

          let settled = false;
          function finish() {
            if (settled) return;
            settled = true;

            const location = res.headers.location;
            if (isRedirect(res.statusCode) && location && request.followRedirects !== false) {
              if (depth >= MAX_REDIRECTS) {
                return resolve({ ok: false, error: `Too many redirects (${MAX_REDIRECTS})` });
              }
              const next = new URL(location, target).toString();
              redirects.push({ from: target.toString(), to: next, status: res.statusCode });

              // 303 always downgrades to GET; 301/302 do so for everything but HEAD
              // by near-universal convention. 307/308 preserve method and body.
              const keepMethod = res.statusCode === 307 || res.statusCode === 308;
              const nextMethod = keepMethod ? method : method === 'HEAD' ? 'HEAD' : 'GET';
              const nextHeaders = { ...headers };
              if (!keepMethod) {
                delete nextHeaders['content-length'];
                delete nextHeaders['content-type'];
              }
              // Don't leak credentials across an origin change.
              if (new URL(next).host !== target.host) {
                delete nextHeaders.authorization;
                delete nextHeaders.cookie;
              }
              return run(next, nextMethod, nextHeaders, keepMethod ? body : null, depth + 1);
            }

            const raw = Buffer.concat(chunks);
            const decoded = decompress(raw, res.headers['content-encoding']);
            timings.total = performance.now() - started;

            resolve({
              ok: true,
              status: res.statusCode,
              statusText: res.statusMessage || '',
              httpVersion: res.httpVersion,
              headers: headerEntries(res.rawHeaders),
              body: decoded.toString('base64'),
              bodyEncoding: 'base64',
              size: { transfer: raw.length, decoded: decoded.length },
              truncated,
              timings,
              redirects,
              url: target.toString()
            });
          }
        }
      );

      req.on('socket', (socket) => {
        socket.on('lookup', () => {
          if (timings.dns === null) timings.dns = performance.now() - started;
        });
        socket.on('connect', () => {
          if (timings.connect === null) timings.connect = performance.now() - started;
        });
        socket.on('secureConnect', () => {
          if (timings.tls === null) timings.tls = performance.now() - started;
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Request timed out after ${request.timeout || 60000}ms`));
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message, code: err.code, timings });
      });

      if (body) req.write(Buffer.from(body, 'base64'));
      req.end();
    };

    const headers = {};
    for (const [key, value] of request.headers || []) {
      if (!key) continue;
      headers[key.toLowerCase()] = value;
    }
    if (request.body && !headers['content-length']) {
      headers['content-length'] = String(Buffer.from(request.body, 'base64').length);
    }
    if (!headers['user-agent']) headers['user-agent'] = 'Cheetah/1.0';
    if (!headers.accept) headers.accept = '*/*';
    if (!headers['accept-encoding']) headers['accept-encoding'] = 'gzip, deflate, br';

    run(request.url, (request.method || 'GET').toUpperCase(), headers, request.body, 0);
  });

module.exports = { send };
