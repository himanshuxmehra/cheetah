import { state, currentTab, envVars, persist, hydrate, newTab, newRequest, pushHistory, findRequest, METHODS, BODY_TYPES } from './state.js';
import { escapeHtml, formatBytes, formatMs, statusClass, detectLanguage, prettify, highlight, interpolate, missingVars, uid } from './format.js';
import { parseCurl, toCurl } from './curl.js';
import { ICONS } from './icons.js';

const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
const MOD = window.cheetah.platform === 'darwin' ? '⌘' : 'Ctrl';

/* ── Icons ──────────────────────────────────────────────────────
   Hugeicons (stroke style), baked into icons.js by `npm run icons`. The
   brand mark is ours: three spots at a sprint, cut by the tear line.   */
const BRAND = `
  <circle cx="6.4" cy="7.6" r="2.1" fill="currentColor"/>
  <circle cx="12.6" cy="5.2" r="1.5" fill="currentColor" opacity=".6"/>
  <circle cx="9.2" cy="13.4" r="1.5" fill="currentColor" opacity=".6"/>
  <path d="M3 19.4C7.6 19.4 14.4 17.2 21 11.4" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" fill="none"/>`;

const icon = (name, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke-width="1.6" aria-hidden="true">${
    name === 'brand' ? BRAND : ICONS[name] || ''
  }</svg>`;

/* ── Toasts ─────────────────────────────────────────────────────── */
export const toast = (message, kind = '') => {
  const id = uid();
  state.toasts.push({ id, message, kind });
  renderToasts();
  setTimeout(() => {
    state.toasts = state.toasts.filter((item) => item.id !== id);
    renderToasts();
  }, 2800);
};

const renderToasts = () => {
  let host = $('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    document.body.appendChild(host);
  }
  host.innerHTML = state.toasts
    .map((item) => `<div class="toast ${item.kind}">${escapeHtml(item.message)}</div>`)
    .join('');
};

/* ── Encoding helpers ───────────────────────────────────────────── */
const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};

const fromBase64 = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const decodeText = (base64) => new TextDecoder('utf-8').decode(fromBase64(base64));

/* ── URL ⇄ params sync ──────────────────────────────────────────── */
const splitUrl = (url) => {
  const at = url.indexOf('?');
  return at === -1 ? [url, ''] : [url.slice(0, at), url.slice(at + 1)];
};

const paramsFromUrl = (url, existing = []) => {
  const [, query] = splitUrl(url);
  const rows = query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf('=');
      const key = at === -1 ? pair : pair.slice(0, at);
      const value = at === -1 ? '' : pair.slice(at + 1);
      return { key: safeDecode(key), value: safeDecode(value), enabled: true };
    });
  // Disabled rows live only in state, so carry them across a URL edit.
  return [...rows, ...existing.filter((row) => !row.enabled && row.key)];
};

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
};

// Percent-encode, but leave {{template}} markers legible in the URL bar.
const encodeParam = (value) =>
  encodeURIComponent(value).replace(/%7B%7B(.*?)%7D%7D/gi, (_match, name) => `{{${safeDecode(name)}}}`);

const urlFromParams = (url, params) => {
  const [base] = splitUrl(url);
  const query = params
    .filter((row) => row.enabled && (row.key || row.value))
    .map((row) => `${encodeParam(row.key)}=${encodeParam(row.value)}`)
    .join('&');
  return query ? `${base}?${query}` : base;
};

/* ── Render: shell ──────────────────────────────────────────────── */
const render = () => {
  const focus = captureFocus();
  const tab = currentTab();

  app.innerHTML = `
    ${renderTitlebar()}
    <div class="workspace${state.sidebarCollapsed ? ' collapsed' : ''}">
      ${state.sidebarCollapsed ? '<div></div>' : renderSidebar()}
      <div class="main">
        ${renderTabstrip()}
        ${tab ? renderUrlbar(tab) : ''}
        ${tab ? renderPanes(tab) : ''}
      </div>
    </div>
    ${renderFooter()}
  `;

  renderOverlays();
  restoreFocus(focus);
  renderToasts();
};

const captureFocus = () => {
  const el = document.activeElement;
  if (!el || !el.dataset || !el.dataset.focusKey) return null;
  return { key: el.dataset.focusKey, start: el.selectionStart, end: el.selectionEnd, scroll: el.scrollTop };
};

const restoreFocus = (focus) => {
  if (!focus) return;
  const el = $(`[data-focus-key="${CSS.escape(focus.key)}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (focus.start !== null && el.setSelectionRange) {
    try {
      el.setSelectionRange(focus.start, focus.end);
    } catch {
      /* selection is meaningless on some input types */
    }
  }
  el.scrollTop = focus.scroll;
};

const renderTitlebar = () => `
    <div class="titlebar">
      <div class="brand">${icon('brand', 18)}<span>Cheetah</span></div>
      <button class="btn btn-ghost btn-sm" data-act="toggle-sidebar" title="Toggle sidebar (${MOD}B)">${icon('sidebar', 15)}</button>
      <div class="drag-spacer"></div>
      <button class="btn btn-ghost btn-sm" data-act="palette" title="Command palette (${MOD}K)">
        ${icon('search', 14)}<span>Search</span><kbd>${MOD}K</kbd>
      </button>
      <select class="input env-select" data-act="pick-env" title="Active environment">
        <option value="">No environment</option>
        ${state.environments
          .map((item) => `<option value="${item.id}"${item.id === state.activeEnvironment ? ' selected' : ''}>${escapeHtml(item.name)}</option>`)
          .join('')}
      </select>
      <button class="btn btn-ghost btn-sm" data-act="edit-envs" title="Manage environments">${icon('layers', 15)}</button>
      <button class="btn btn-ghost btn-sm" data-act="toggle-theme" title="Toggle theme">${icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun', 15)}</button>
    </div>`;

const renderFooter = () => {
  const tab = currentTab();
  const vars = envVars();
  const missing = tab ? missingVars(resolvableText(tab.request), vars) : new Set();
  return `
    <div class="footer">
      <button data-act="new-tab">${icon('plus', 13)} New request</button>
      <button data-act="import-curl">${icon('terminal', 13)} Import cURL</button>
      <button data-act="copy-curl">${icon('copy', 12)} Copy as cURL</button>
      <div class="spacer"></div>
      ${missing.size ? `<span class="var-missing">Unresolved: ${[...missing].map((name) => escapeHtml(name)).join(', ')}</span>` : ''}
      <span>${state.collections.reduce((total, item) => total + item.requests.length, 0)} saved</span>
      <button data-act="settings">${icon('cog', 12)} Settings</button>
    </div>`;
};

/* ── Render: sidebar ────────────────────────────────────────────── */
const renderSidebar = () => `
  <aside class="sidebar">
    <div class="sidebar-tabs" role="tablist">
      ${['collections', 'history']
        .map(
          (name) =>
            `<button class="sidebar-tab" role="tab" aria-selected="${state.sidebarTab === name}" data-act="sidebar-tab" data-name="${name}">${name[0].toUpperCase() + name.slice(1)}</button>`
        )
        .join('')}
    </div>
    <div class="sidebar-search">
      <input class="input" style="flex:1" placeholder="${state.sidebarTab === 'collections' ? 'Filter requests' : 'Filter history'}" data-act="sidebar-filter" data-focus-key="sidebar-filter" value="${escapeHtml(state.sidebarQuery)}">
      ${state.sidebarTab === 'collections' ? `<button class="btn btn-sm" data-act="new-collection" title="New collection">${icon('plus', 13)}</button>` : `<button class="btn btn-sm" data-act="clear-history" title="Clear history">${icon('trash', 13)}</button>`}
    </div>
    <div class="sidebar-list">
      ${state.sidebarTab === 'collections' ? renderCollections() : renderHistory()}
    </div>
  </aside>`;

const matches = (text) => !state.sidebarQuery || text.toLowerCase().includes(state.sidebarQuery.toLowerCase());

const renderCollections = () => {
  if (!state.collections.length) {
    return `<div class="empty-state"><strong>No collections yet</strong>Save a request with <kbd>${MOD}S</kbd> to start one.</div>`;
  }

  const html = state.collections
    .map((collection) => {
      const requests = collection.requests.filter((item) => matches(item.name) || matches(item.url));
      if (!requests.length && state.sidebarQuery && !matches(collection.name)) return '';
      const open = collection.expanded !== false || Boolean(state.sidebarQuery);
      const shown = state.sidebarQuery && !matches(collection.name) ? requests : collection.requests;

      return `
        <div class="tree-group">
          <button class="tree-row" data-act="toggle-collection" data-id="${collection.id}">
            <span class="chev ${open ? 'open' : ''}">${icon('chevron', 14)}</span>
            <span class="label">${escapeHtml(collection.name)}</span>
            <span class="count">${collection.requests.length}</span>
            <span class="row-action" data-act="collection-menu" data-id="${collection.id}" title="Rename or delete">${icon('more', 14)}</span>
          </button>
          ${open ? `<div class="tree-children">${shown.map((item) => renderSavedRequest(collection.id, item)).join('') || '<div class="empty-state">Empty</div>'}</div>` : ''}
        </div>`;
    })
    .join('');

  return html.trim() || '<div class="empty-state">No matches</div>';
};

const renderSavedRequest = (collectionId, request) => {
  const tab = currentTab();
  const active = tab && tab.origin && tab.origin.requestId === request.id;
  return `
    <button class="tree-row${active ? ' active' : ''}" data-method="${request.method}" data-act="open-request" data-collection="${collectionId}" data-id="${request.id}">
      <span class="method m-${request.method}">${request.method}</span>
      <span class="label" title="${escapeHtml(request.url)}">${escapeHtml(request.name)}</span>
      <span class="row-action" data-act="delete-request" data-collection="${collectionId}" data-id="${request.id}" title="Delete">${icon('trash', 14)}</span>
    </button>`;
};

const renderHistory = () => {
  const items = state.history.filter((item) => matches(item.url) || matches(item.method));
  if (!items.length) {
    return `<div class="empty-state"><strong>No history</strong>Requests you send appear here.</div>`;
  }
  return items
    .slice(0, 100)
    .map((item) => {
      const path = item.url.replace(/^https?:\/\//, '');
      return `
        <button class="tree-row" data-method="${item.method}" data-act="open-history" data-id="${item.id}">
          <span class="method m-${item.method}">${item.method}</span>
          <span class="label" title="${escapeHtml(item.url)}">${escapeHtml(path || '(empty)')}</span>
          <span class="count s-${statusClass(item.status)}" style="background:none">${item.status ?? '—'}</span>
        </button>`;
    })
    .join('');
};

/* ── Render: tabstrip + url bar ─────────────────────────────────── */
const renderTabstrip = () => `
  <div class="tabstrip">
    ${state.tabs
      .map(
        (tab) => `
        <div class="tab${tab.id === state.activeTab ? ' active' : ''}" data-method="${tab.request.method}" data-act="select-tab" data-id="${tab.id}" title="${escapeHtml(tab.request.url || tab.request.name)}">
          <span class="method m-${tab.request.method}">${tab.request.method}</span>
          <span class="title">${escapeHtml(tab.request.name)}</span>
          ${tab.dirty ? '<span class="dot" title="Unsaved changes"></span>' : ''}
          <span class="close" data-act="close-tab" data-id="${tab.id}">${icon('close', 12)}</span>
        </div>`
      )
      .join('')}
    <button class="tab-new" data-act="new-tab" title="New tab (${MOD}T)">${icon('plus', 14)}</button>
  </div>`;

const renderUrlbar = (tab) => {
  const vars = envVars();
  const missing = missingVars(resolvableText(tab.request), vars);
  return `
    <div class="urlbar">
      <select class="method-select" data-method="${tab.request.method}" data-act="set-method">
        ${METHODS.map((method) => `<option${method === tab.request.method ? ' selected' : ''}>${method}</option>`).join('')}
      </select>
      <div class="url-wrap">
        <input class="url-input" data-act="set-url" data-focus-key="url" spellcheck="false" autocomplete="off"
               placeholder="https://api.example.com/v1/users  —  paste a cURL command to import"
               value="${escapeHtml(tab.request.url)}">
      </div>
      ${
        tab.loading
          ? `<button class="btn btn-danger" data-act="cancel">Cancel</button>`
          : `<button class="btn btn-primary" data-act="send" ${missing.size ? `title="Unresolved variables: ${escapeHtml([...missing].join(', '))}"` : ''}>${icon('send', 14)} Send</button>`
      }
      <button class="btn" data-act="save" title="Save (${MOD}S)">${icon('save', 14)}</button>
    </div>`;
};

/* ── Render: request pane ───────────────────────────────────────── */
// The response pane's top rule reads the outcome: a sweep while in flight,
// then the status colour once the server has answered.
const responseEdge = (tab) => {
  if (tab.loading) return ' sending';
  if (!tab.response) return '';
  return ` s-${tab.response.ok ? statusClass(tab.response.status) : 'err'}`;
};

const renderPanes = (tab) => `
  <div class="panes" style="--req-h:${state.reqHeight}%">
    <section class="pane">${renderRequestPane(tab)}</section>
    <div class="splitter" data-act="split"></div>
    <section class="pane response${responseEdge(tab)}">${renderResponsePane(tab)}</section>
  </div>`;

const activeCount = (rows) => rows.filter((row) => row.enabled && row.key).length;

const renderRequestPane = (tab) => {
  const request = tab.request;
  const params = paramsFromUrl(request.url, request.params);
  const bodyCount = request.bodyType === 'none' ? 0 : request.bodyType === 'form-data' ? activeCount(request.formData) : request.body ? 1 : 0;

  const tabs = [
    ['params', 'Params', activeCount(params)],
    ['headers', 'Headers', activeCount(request.headers)],
    ['body', 'Body', bodyCount],
    ['auth', 'Auth', request.auth.type === 'none' ? 0 : 1]
  ];

  return `
    <div class="tabrow">
      ${tabs
        .map(
          ([name, label, count]) =>
            `<button class="subtab" role="tab" aria-selected="${tab.reqTab === name}" data-act="req-tab" data-name="${name}">
               ${label}${count ? `<span class="count">${count}</span>` : ''}
             </button>`
        )
        .join('')}
      <div class="spacer"></div>
      ${tab.reqTab === 'body' ? renderBodyControls(request) : ''}
    </div>
    <div class="pane-body">${renderRequestBody(tab, params)}</div>`;
};

const renderBodyControls = (request) => `
  <select class="input" style="height:26px" data-act="set-body-type">
    ${BODY_TYPES.map(([value, label]) => `<option value="${value}"${request.bodyType === value ? ' selected' : ''}>${label}</option>`).join('')}
  </select>
  ${['json', 'xml'].includes(request.bodyType) ? '<button class="btn btn-sm btn-ghost" data-act="format-body">Beautify</button>' : ''}`;

const renderRequestBody = (tab, params) => {
  const request = tab.request;
  switch (tab.reqTab) {
    case 'params':
      return kvTable(params, 'params', 'Query parameter', 'Value');
    case 'headers':
      return kvTable(request.headers, 'headers', 'Header', 'Value');
    case 'auth':
      return renderAuth(request.auth);
    case 'body':
      if (request.bodyType === 'none') {
        return `<div class="empty-state"><strong>No body</strong>Pick a body type above to send a payload.</div>`;
      }
      if (request.bodyType === 'form-data' || request.bodyType === 'form-urlencoded') {
        return kvTable(request.formData, 'formData', 'Field', 'Value');
      }
      return `<textarea class="code-editor" data-act="set-body" data-focus-key="body" spellcheck="false"
                placeholder="${request.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Request body'}">${escapeHtml(request.body)}</textarea>`;
    default:
      return '';
  }
};

const kvTable = (rows, field, keyPlaceholder, valuePlaceholder) => {
  const all = [...rows, { key: '', value: '', enabled: true, isNew: true }];
  return `
    <table class="kv">
      <tbody>
        ${all
          .map(
            (row, index) => `
          <tr class="${row.enabled ? '' : 'disabled'}">
            <td class="check">
              ${row.isNew ? '' : `<input type="checkbox" data-act="kv-toggle" data-field="${field}" data-index="${index}" ${row.enabled ? 'checked' : ''}>`}
            </td>
            <td class="key">
              <input type="text" data-act="kv-edit" data-field="${field}" data-index="${index}" data-part="key"
                     data-focus-key="${field}.${index}.key" spellcheck="false"
                     placeholder="${keyPlaceholder}" value="${escapeHtml(row.key)}">
            </td>
            <td>
              <input type="text" data-act="kv-edit" data-field="${field}" data-index="${index}" data-part="value"
                     data-focus-key="${field}.${index}.value" spellcheck="false"
                     placeholder="${valuePlaceholder}" value="${escapeHtml(row.value)}">
            </td>
            <td class="trash">
              ${row.isNew ? '' : `<button data-act="kv-remove" data-field="${field}" data-index="${index}" title="Remove">${icon('trash', 13)}</button>`}
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
};

const AUTH_TYPES = [
  ['none', 'No auth'],
  ['bearer', 'Bearer token'],
  ['basic', 'Basic'],
  ['apikey', 'API key']
];

const renderAuth = (auth) => `
  <div class="form-grid">
    <div class="field">
      <label>Type</label>
      <select class="input" data-act="set-auth" data-part="type">
        ${AUTH_TYPES.map(([value, label]) => `<option value="${value}"${auth.type === value ? ' selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>
    ${
      auth.type === 'bearer'
        ? `<div class="field"><label>Token</label>
             <input class="input" data-act="set-auth" data-part="token" data-focus-key="auth.token" spellcheck="false" placeholder="{{token}}" value="${escapeHtml(auth.token || '')}"></div>`
        : ''
    }
    ${
      auth.type === 'basic'
        ? `<div class="field"><label>Username</label>
             <input class="input" data-act="set-auth" data-part="username" data-focus-key="auth.username" spellcheck="false" value="${escapeHtml(auth.username || '')}"></div>
           <div class="field"><label>Password</label>
             <input class="input" type="password" data-act="set-auth" data-part="password" data-focus-key="auth.password" value="${escapeHtml(auth.password || '')}"></div>`
        : ''
    }
    ${
      auth.type === 'apikey'
        ? `<div class="field"><label>Key</label>
             <input class="input" data-act="set-auth" data-part="key" data-focus-key="auth.key" spellcheck="false" placeholder="X-API-Key" value="${escapeHtml(auth.key || '')}"></div>
           <div class="field"><label>Value</label>
             <input class="input" data-act="set-auth" data-part="value" data-focus-key="auth.value" spellcheck="false" value="${escapeHtml(auth.value || '')}"></div>
           <div class="field"><label>Add to</label>
             <select class="input" data-act="set-auth" data-part="addTo">
               <option value="header"${auth.addTo === 'header' ? ' selected' : ''}>Header</option>
               <option value="query"${auth.addTo === 'query' ? ' selected' : ''}>Query parameter</option>
             </select></div>`
        : ''
    }
    ${auth.type === 'none' ? '<p class="hint">Credentials are stored with the request in your local workspace file. Use <code>{{variables}}</code> from an environment to keep secrets out of shared collections.</p>' : ''}
  </div>`;

/* ── Render: response pane ──────────────────────────────────────── */
const headerValue = (headers, name) => {
  const found = (headers || []).find(([key]) => key.toLowerCase() === name);
  return found ? found[1] : '';
};

const hostOf = (url) => {
  try {
    return new URL(url).host || 'server';
  } catch {
    return 'server';
  }
};

const renderResponsePane = (tab) => {
  const response = tab.response;

  if (tab.loading) {
    return `
      <div class="tabrow"><span class="subtab" aria-selected="true">Response</span>
        <div class="status-bar"><span class="metric">Sending…</span></div></div>
      <div class="pane-body"><div class="response-placeholder">
        ${icon('flash', 30)}
        <div>Waiting for <strong>${escapeHtml(hostOf(tab.request.url))}</strong></div>
        <div class="hint">Press <kbd>Esc</kbd> to cancel</div>
      </div></div>`;
  }

  if (!response) {
    return `
      <div class="tabrow"><span class="subtab" aria-selected="true">Response</span></div>
      <div class="pane-body"><div class="response-placeholder">
        ${icon('inbox', 30)}
        <div><strong>Nothing sent yet</strong></div>
        <div class="hint">Press <kbd>${MOD}↵</kbd> to run this request.</div>
      </div></div>`;
  }

  if (!response.ok) {
    return `
      <div class="tabrow"><span class="subtab" aria-selected="true">Response</span>
        <div class="status-bar"><span class="status-chip s-err"><i class="bulb"></i>${response.cancelled ? 'Cancelled' : 'Failed'}</span></div>
      </div>
      <div class="pane-body">
        <div class="error-box">
          <h4>${response.cancelled ? 'Request cancelled' : 'Could not complete request'}</h4>
          <p>${escapeHtml(response.error)}${response.code ? ` (${escapeHtml(response.code)})` : ''}</p>
        </div>
        ${response.code === 'ENOTFOUND' ? '<p class="hint" style="padding:0 16px">Check the hostname, or whether an environment variable is unresolved.</p>' : ''}
        ${response.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || response.code === 'SELF_SIGNED_CERT_IN_CHAIN' ? '<p class="hint" style="padding:0 16px">Self-signed certificate — turn off SSL verification in Settings to accept it.</p>' : ''}
      </div>`;
  }

  const contentType = headerValue(response.headers, 'content-type');
  const lang = detectLanguage(contentType);
  const cookies = (response.headers || []).filter(([key]) => key.toLowerCase() === 'set-cookie');
  const canPreview = lang === 'html' || lang === 'image';

  const tabs = [
    ['body', 'Body', 0],
    ['headers', 'Headers', response.headers.length],
    ...(cookies.length ? [['cookies', 'Cookies', cookies.length]] : []),
    ...(canPreview ? [['preview', 'Preview', 0]] : []),
    ['timing', 'Timing', 0]
  ];

  return `
    <div class="tabrow">
      ${tabs
        .map(
          ([name, label, count]) =>
            `<button class="subtab" role="tab" aria-selected="${tab.resTab === name}" data-act="res-tab" data-name="${name}">
               ${label}${count ? `<span class="count">${count}</span>` : ''}
             </button>`
        )
        .join('')}
      <div class="status-bar">
        <span class="status-chip s-${statusClass(response.status)}"><i class="bulb"></i>${response.status} ${escapeHtml(response.statusText)}</span>
        <span class="metric"><b>${formatMs(response.timings.total)}</b></span>
        <span class="metric"><b>${formatBytes(response.size.decoded)}</b></span>
        ${response.redirects.length ? `<span class="metric" title="${escapeHtml(response.redirects.map((hop) => hop.to).join('\n'))}">${response.redirects.length}↪</span>` : ''}
        <button class="btn btn-sm btn-ghost" data-act="find" title="Find in response (${MOD}F)">${icon('search', 13)}</button>
        <button class="btn btn-sm btn-ghost" data-act="copy-response" title="Copy body">${icon('copy', 13)}</button>
        <button class="btn btn-sm btn-ghost" data-act="save-response" title="Save body to file">${icon('save', 13)}</button>
      </div>
    </div>
    ${state.find !== null && tab.resTab === 'body' ? renderFindBar() : ''}
    <div class="pane-body" id="response-body">${renderResponseBody(tab, response, lang, cookies)}</div>`;
};

const renderFindBar = () => `
  <div class="find-bar">
    <input class="input" data-act="find-input" data-focus-key="find" placeholder="Find in response…" value="${escapeHtml(state.find)}">
    <span class="tally" id="find-tally"></span>
    <button class="btn btn-sm btn-ghost" data-act="find-close">${icon('close', 13)}</button>
  </div>`;

const renderResponseBody = (tab, response, lang, cookies) => {
  if (tab.resTab === 'headers') {
    return `<table class="kv"><tbody>${response.headers
      .map(([key, value]) => `<tr><td class="key" style="padding:7px 10px;font-family:var(--mono);font-size:12px;color:var(--text-dim)">${escapeHtml(key)}</td><td style="padding:7px 10px;font-family:var(--mono);font-size:12px;word-break:break-all">${escapeHtml(value)}</td></tr>`)
      .join('')}</tbody></table>`;
  }

  if (tab.resTab === 'cookies') {
    return `<table class="kv"><tbody>${cookies
      .map(([, value]) => {
        const [pair, ...attrs] = value.split(';');
        const at = pair.indexOf('=');
        return `<tr><td class="key" style="padding:7px 10px;font-family:var(--mono);font-size:12px">${escapeHtml(pair.slice(0, at))}</td>
          <td style="padding:7px 10px;font-family:var(--mono);font-size:12px;word-break:break-all">${escapeHtml(pair.slice(at + 1))}
          <div class="hint">${escapeHtml(attrs.join(';').trim())}</div></td></tr>`;
      })
      .join('')}</tbody></table>`;
  }

  if (tab.resTab === 'timing') return renderTiming(response);

  if (tab.resTab === 'preview') {
    const contentType = headerValue(response.headers, 'content-type');
    if (lang === 'image') {
      return `<div class="preview-media"><img src="data:${contentType};base64,${response.body}" alt="Response image"></div>`;
    }
    // srcdoc keeps the preview inside a sandboxed frame: no scripts, no network.
    return `<iframe class="preview-frame" sandbox="" srcdoc="${escapeHtml(decodeText(response.body))}"></iframe>`;
  }

  // ── Body ──
  if (!response.size.decoded) {
    return `<div class="response-placeholder">${icon('inbox', 30)}<div>Empty response body</div></div>`;
  }
  if (lang === 'binary' || lang === 'media') {
    return `<div class="response-placeholder">${icon('inbox', 30)}
      <div><strong>${escapeHtml(headerValue(response.headers, 'content-type') || 'Binary data')}</strong></div>
      <div class="hint">${formatBytes(response.size.decoded)} — not previewable.</div>
      <button class="btn btn-sm" data-act="save-response">${icon('save', 13)} Save to file</button></div>`;
  }

  let text;
  try {
    text = decodeText(response.body);
  } catch {
    return '<div class="error-box"><h4>Could not decode body</h4><p>The response is not valid UTF-8 text.</p></div>';
  }

  const shown = tab.pretty ? prettify(text, lang) : text;
  const body = state.find ? markMatches(shown, state.find) : highlight(shown, lang);

  return `
    <div class="tabrow" style="border-bottom:none;min-height:30px">
      <button class="btn btn-sm btn-ghost" data-act="toggle-pretty" aria-selected="${tab.pretty}">${icon('code', 14)}${tab.pretty ? 'Formatted' : 'Raw'}</button>
      <button class="btn btn-sm btn-ghost" data-act="toggle-wrap" aria-selected="${tab.wrap}">${icon('wrap', 14)}${tab.wrap ? 'Wrapped' : 'No wrap'}</button>
      ${response.truncated ? '<span class="hint" style="color:var(--warn)">Body truncated at 25 MB</span>' : ''}
    </div>
    <pre class="code-view${tab.wrap ? ' wrap' : ''}">${body}</pre>`;
};

const markMatches = (text, query) => {
  if (!query) return escapeHtml(text);
  const parts = escapeHtml(text).split(new RegExp(`(${escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  let count = 0;
  const html = parts
    .map((part, index) => (index % 2 ? `<mark data-hit="${count++}">${part}</mark>` : part))
    .join('');
  queueMicrotask(() => {
    const tally = document.getElementById('find-tally');
    if (tally) tally.textContent = count ? `${count} match${count === 1 ? '' : 'es'}` : 'No matches';
  });
  return html;
};

const renderTiming = (response) => {
  const { timings } = response;
  const total = timings.total || 1;
  const phases = [
    ['DNS lookup', timings.dns],
    ['TCP connect', timings.connect],
    ['TLS handshake', timings.tls],
    ['First byte', timings.firstByte],
    ['Complete', timings.total]
  ].filter(([, value]) => value !== null && value !== undefined);

  return `
    <div class="timing-list">
      ${phases
        .map(
          ([name, value]) => `
        <div class="timing-row">
          <span class="name">${name}</span>
          <span class="bar"><i style="width:${Math.max(2, (value / total) * 100)}%"></i></span>
          <span class="val">${formatMs(value)}</span>
        </div>`
        )
        .join('')}
      <p class="hint">Cumulative time from the start of the request. Transfer size ${formatBytes(response.size.transfer)} over the wire, ${formatBytes(response.size.decoded)} decoded — HTTP/${escapeHtml(response.httpVersion)}.</p>
      ${
        response.redirects.length
          ? `<div class="field"><label>Redirect chain</label>${response.redirects
              .map((hop) => `<div class="hint" style="font-family:var(--mono)">${hop.status} → ${escapeHtml(hop.to)}</div>`)
              .join('')}</div>`
          : ''
      }
    </div>`;
};

/* ── Render: overlays ───────────────────────────────────────────── */
const renderOverlays = () => {
  document.querySelectorAll('.scrim').forEach((node) => node.remove());
  if (state.palette) return renderPalette();
  if (!state.modal) return;

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.dataset.act = 'scrim';
  scrim.innerHTML = MODALS[state.modal.kind](state.modal);
  document.body.appendChild(scrim);
  const first = scrim.querySelector('input, select, textarea');
  if (first) {
    first.focus();
    first.select?.();
  }
};

const MODALS = {
  save: (modal) => `
    <div class="modal">
      <header>${icon('save', 16)} Save request</header>
      <div class="body">
        <div class="field"><label>Name</label>
          <input class="input" id="save-name" value="${escapeHtml(modal.name)}" placeholder="Get users"></div>
        <div class="field"><label>Collection</label>
          <select class="input" id="save-collection" data-act="save-collection">
            ${state.collections.map((item) => `<option value="${item.id}"${item.id === modal.collectionId ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
            <option value="__new">＋ New collection…</option>
          </select></div>
        <div class="field" id="new-collection-field" ${state.collections.length ? 'hidden' : ''}>
          <label>New collection name</label>
          <input class="input" id="save-new-collection" placeholder="My API"></div>
      </div>
      <footer>
        <button class="btn" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="confirm-save">Save</button>
      </footer>
    </div>`,

  rename: (modal) => `
    <div class="modal">
      <header>Rename collection</header>
      <div class="body">
        <div class="field"><label>Name</label><input class="input" id="rename-value" value="${escapeHtml(modal.name)}"></div>
      </div>
      <footer>
        <button class="btn" data-act="delete-collection" data-id="${modal.id}" style="margin-right:auto;color:var(--err)">Delete collection</button>
        <button class="btn" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="confirm-rename" data-id="${modal.id}">Rename</button>
      </footer>
    </div>`,

  curl: () => `
    <div class="modal wide">
      <header>Import cURL</header>
      <div class="body">
        <textarea class="input" id="curl-input" style="height:180px;padding:10px;line-height:1.6" spellcheck="false"
          placeholder="curl -X POST https://api.example.com/users \\
  -H 'Content-Type: application/json' \\
  -d '{&quot;name&quot;:&quot;ada&quot;}'"></textarea>
        <p class="hint">Pasting a cURL command straight into the URL bar imports it too.</p>
      </div>
      <footer>
        <button class="btn" data-act="close-modal">Cancel</button>
        <button class="btn btn-primary" data-act="confirm-curl">Import</button>
      </footer>
    </div>`,

  envs: () => {
    const env = state.environments.find((item) => item.id === state.modal.envId) || state.environments[0];
    return `
    <div class="modal wide">
      <header>${icon('layers', 16)} Environments</header>
      <div class="body" style="gap:14px">
        <div style="display:flex;gap:8px;align-items:center">
          <select class="input" style="flex:1" data-act="modal-pick-env">
            ${state.environments.map((item) => `<option value="${item.id}"${env && item.id === env.id ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('') || '<option>No environments</option>'}
          </select>
          <button class="btn btn-sm" data-act="new-env">${icon('plus', 13)} New</button>
          ${env ? `<button class="btn btn-sm" data-act="delete-env" data-id="${env.id}">${icon('trash', 13)}</button>` : ''}
        </div>
        ${
          env
            ? `<p class="hint env-badge"><i class="bulb"></i>“${escapeHtml(env.name)}” is the active environment — its variables resolve on every send.</p>
               <div class="field"><label>Name</label>
                 <input class="input" data-act="env-name" data-id="${env.id}" data-focus-key="env-name" value="${escapeHtml(env.name)}"></div>
               <div class="field"><label>Variables</label>
                 ${kvTable(env.vars, `env:${env.id}`, 'VARIABLE_NAME', 'value')}</div>
               <p class="hint">Reference these anywhere in a request as <code>{{NAME}}</code> — URL, headers, body or auth.</p>`
            : '<div class="empty-state"><strong>No environments</strong>Create one to hold base URLs, tokens and keys.</div>'
        }
      </div>
      <footer><button class="btn btn-primary" data-act="close-modal">Done</button></footer>
    </div>`;
  },

  settings: () => `
    <div class="modal">
      <header>${icon('cog', 16)} Settings</header>
      <div class="body">
        <div class="field"><label>Theme</label>
          <select class="input" data-act="set-setting" data-key="theme">
            ${['system', 'dark', 'light'].map((value) => `<option value="${value}"${state.settings.theme === value ? ' selected' : ''}>${value[0].toUpperCase() + value.slice(1)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Request timeout (ms)</label>
          <input class="input" type="number" min="1000" step="1000" data-act="set-setting" data-key="timeout" value="${state.settings.timeout}"></div>
        <label class="checkbox-row"><input type="checkbox" data-act="set-setting" data-key="followRedirects" ${state.settings.followRedirects ? 'checked' : ''}> Follow redirects</label>
        <label class="checkbox-row"><input type="checkbox" data-act="set-setting" data-key="verifySsl" ${state.settings.verifySsl ? 'checked' : ''}> Verify SSL certificates</label>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="btn btn-sm" data-act="export-workspace">Export workspace</button>
          <button class="btn btn-sm" data-act="import-workspace">Import workspace</button>
        </div>
        <p class="hint">Turning off SSL verification exposes requests to interception — use it only against local or staging servers.</p>
      </div>
      <footer><button class="btn btn-primary" data-act="close-modal">Done</button></footer>
    </div>`
};

/* ── Command palette ────────────────────────────────────────────── */
const paletteItems = () => {
  const query = state.palette.query.toLowerCase();
  const items = [];

  for (const collection of state.collections) {
    for (const request of collection.requests) {
      items.push({
        kind: 'request',
        label: request.name,
        sub: `${collection.name} · ${request.url}`,
        method: request.method,
        collectionId: collection.id,
        id: request.id
      });
    }
  }
  for (const entry of state.history.slice(0, 40)) {
    items.push({ kind: 'history', label: entry.url || '(empty)', sub: 'History', method: entry.method, id: entry.id });
  }

  const commands = [
    { kind: 'command', label: 'New request', sub: `${MOD}T`, act: 'new-tab' },
    { kind: 'command', label: 'Save request', sub: `${MOD}S`, act: 'save' },
    { kind: 'command', label: 'Import cURL', sub: '', act: 'import-curl' },
    { kind: 'command', label: 'Copy as cURL', sub: '', act: 'copy-curl' },
    { kind: 'command', label: 'Manage environments', sub: '', act: 'edit-envs' },
    { kind: 'command', label: 'Toggle theme', sub: '', act: 'toggle-theme' },
    { kind: 'command', label: 'Settings', sub: '', act: 'settings' }
  ];
  items.push(...commands);

  return items.filter((item) => !query || `${item.label} ${item.sub}`.toLowerCase().includes(query)).slice(0, 40);
};

const renderPalette = () => {
  const items = paletteItems();
  state.palette.index = Math.min(state.palette.index, Math.max(0, items.length - 1));

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.dataset.act = 'scrim';
  scrim.innerHTML = `
    <div class="palette">
      <input id="palette-input" placeholder="Search requests, history and commands…" value="${escapeHtml(state.palette.query)}" spellcheck="false">
      <div class="palette-list">
        ${
          items.length
            ? items
                .map(
                  (item, index) => `
              <button class="palette-item${index === state.palette.index ? ' sel' : ''}" data-act="palette-run" data-index="${index}">
                ${item.method ? `<span class="method m-${item.method}">${item.method}</span>` : `<span class="method" style="color:var(--text-faint)">CMD</span>`}
                <span class="label">${escapeHtml(item.label)}</span>
                <span class="sub">${escapeHtml(item.sub)}</span>
              </button>`
                )
                .join('')
            : '<div class="palette-empty">Nothing matches</div>'
        }
      </div>
    </div>`;
  document.body.appendChild(scrim);
  const input = scrim.querySelector('#palette-input');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  scrim.querySelector('.palette-item.sel')?.scrollIntoView({ block: 'nearest' });
};

/* ── Build & send ───────────────────────────────────────────────── */
const buildRequest = (request) => {
  const vars = envVars();
  const resolve = (text) => interpolate(text || '', vars);

  let url = resolve(urlFromParams(request.url, paramsFromUrl(request.url, request.params)));
  const headers = request.headers.filter((row) => row.enabled && row.key).map((row) => [resolve(row.key), resolve(row.value)]);

  const auth = request.auth;
  if (auth.type === 'bearer' && auth.token) {
    headers.push(['Authorization', `Bearer ${resolve(auth.token)}`]);
  } else if (auth.type === 'basic') {
    headers.push(['Authorization', `Basic ${btoa(`${resolve(auth.username)}:${resolve(auth.password)}`)}`]);
  } else if (auth.type === 'apikey' && auth.key) {
    if (auth.addTo === 'query') {
      url += `${url.includes('?') ? '&' : '?'}${encodeURIComponent(resolve(auth.key))}=${encodeURIComponent(resolve(auth.value))}`;
    } else {
      headers.push([resolve(auth.key), resolve(auth.value)]);
    }
  }

  let body = null;
  const hasType = headers.some(([key]) => key.toLowerCase() === 'content-type');

  if (request.bodyType === 'form-data') {
    const boundary = `----CheetahBoundary${uid()}`;
    const parts = request.formData
      .filter((row) => row.enabled && row.key)
      .map((row) => `--${boundary}\r\nContent-Disposition: form-data; name="${resolve(row.key)}"\r\n\r\n${resolve(row.value)}\r\n`)
      .join('');
    body = toBase64(`${parts}--${boundary}--\r\n`);
    if (!hasType) headers.push(['Content-Type', `multipart/form-data; boundary=${boundary}`]);
  } else if (request.bodyType === 'form-urlencoded') {
    const encoded = request.formData
      .filter((row) => row.enabled && row.key)
      .map((row) => `${encodeURIComponent(resolve(row.key))}=${encodeURIComponent(resolve(row.value))}`)
      .join('&');
    body = toBase64(encoded);
    if (!hasType) headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
  } else if (request.bodyType !== 'none' && request.body) {
    body = toBase64(resolve(request.body));
    if (!hasType) {
      const type = { json: 'application/json', xml: 'application/xml', text: 'text/plain' }[request.bodyType] || 'text/plain';
      headers.push(['Content-Type', `${type}; charset=utf-8`]);
    }
  }

  return {
    method: request.method,
    url,
    headers,
    body,
    followRedirects: state.settings.followRedirects,
    verifySsl: state.settings.verifySsl,
    timeout: Number(state.settings.timeout) || 60000
  };
};

// Every place a {{variable}} may legally appear.
const resolvableText = (request) =>
  [
    request.url,
    request.body,
    ...request.headers.filter((row) => row.enabled).flatMap((row) => [row.key, row.value]),
    ...request.formData.filter((row) => row.enabled).flatMap((row) => [row.key, row.value]),
    ...Object.entries(request.auth)
      .filter(([key]) => key !== 'type' && key !== 'addTo')
      .map(([, value]) => value)
  ].join('\n');

const sendCurrent = async () => {
  const tab = currentTab();
  if (!tab || tab.loading) return;

  const built = buildRequest(tab.request);
  if (!built.url.trim()) return toast('Enter a URL first', 'error');

  const missing = missingVars(resolvableText(tab.request), envVars());
  if (missing.size) {
    return toast(`No value for {{${[...missing][0]}}} — check the active environment`, 'error');
  }

  const requestId = uid();
  tab.loading = true;
  tab.pendingId = requestId;
  tab.response = null;
  render();

  const response = await window.cheetah.send(requestId, built);

  // The tab may have been closed, or a newer send may have superseded this one.
  if (!state.tabs.includes(tab) || tab.pendingId !== requestId) return;

  tab.loading = false;
  tab.response = response;
  tab.resTab = 'body';
  if (response.ok) {
    const lang = detectLanguage(headerValue(response.headers, 'content-type'));
    if (lang === 'image') tab.resTab = 'preview';
  }
  pushHistory(built, response);
  persist();
  render();
};

/* ── Mutations ──────────────────────────────────────────────────── */
const touch = (tab) => {
  if (tab.origin) tab.dirty = true;
  persist();
};

// History stores the fully-built wire request, so rebuild an editable form of it.
const openHistoryEntry = (id) => {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) return;
  const request = newRequest({ method: entry.method, url: entry.url, name: guessName(entry.url) });
  request.headers = (entry.snapshot.headers || []).map(([key, value]) => ({ key, value, enabled: true }));
  request.params = paramsFromUrl(entry.url);
  request.body = entry.snapshot.body ? decodeText(entry.snapshot.body) : '';
  request.bodyType = request.body ? (/^\s*[[{]/.test(request.body) ? 'json' : 'text') : 'none';
  openRequest(request);
};

const openRequest = (request, origin = null) => {
  const existing = origin && state.tabs.find((tab) => tab.origin && tab.origin.requestId === origin.requestId);
  if (existing) {
    state.activeTab = existing.id;
  } else {
    const tab = newTab(structuredClone(request));
    tab.origin = origin;
    state.tabs.push(tab);
    state.activeTab = tab.id;
  }
  persist();
  render();
};

const closeTab = (id) => {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;
  state.tabs.splice(index, 1);
  if (!state.tabs.length) state.tabs.push(newTab());
  if (state.activeTab === id) state.activeTab = state.tabs[Math.min(index, state.tabs.length - 1)].id;
  persist();
  render();
};

const saveTab = () => {
  const tab = currentTab();
  if (!tab) return;
  if (tab.origin) {
    const target = findRequest(tab.origin.collectionId, tab.origin.requestId);
    if (target) {
      Object.assign(target, structuredClone(tab.request), { id: target.id });
      tab.dirty = false;
      persist();
      render();
      return toast(`Saved “${target.name}”`, 'success');
    }
  }
  const suggested = tab.request.name === 'Untitled request' && tab.request.url ? guessName(tab.request.url) : tab.request.name;
  state.modal = { kind: 'save', name: suggested, collectionId: state.collections[0]?.id || '__new' };
  render();
};

const guessName = (url) => {
  const segments = url.split('?')[0].replace(/^https?:\/\//, '').split('/').filter(Boolean);
  return segments.slice(1).join('/') || segments[0] || 'Untitled request';
};

const applyCurl = (text) => {
  const parsed = parseCurl(text);
  if (!parsed.url) return toast('No URL found in that cURL command', 'error');
  const tab = currentTab();
  Object.assign(tab.request, {
    method: parsed.method,
    url: parsed.url,
    headers: parsed.headers,
    body: parsed.body || '',
    bodyType: parsed.bodyType || 'none',
    formData: parsed.formData || [],
    auth: { ...tab.request.auth, ...parsed.auth },
    name: tab.request.name === 'Untitled request' ? guessName(parsed.url) : tab.request.name
  });
  tab.request.params = paramsFromUrl(parsed.url);
  if (parsed.verifySsl === false) state.settings.verifySsl = false;
  touch(tab);
  toast('cURL imported', 'success');
  render();
};

const applyTheme = () => {
  const theme = state.settings.theme;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  window.cheetah.setTheme(theme);
};

/* ── Key/value field access ─────────────────────────────────────── */
const kvTarget = (field) => {
  const tab = currentTab();
  if (field.startsWith('env:')) {
    const env = state.environments.find((item) => item.id === field.slice(4));
    return env ? { get: () => env.vars, set: (rows) => (env.vars = rows) } : null;
  }
  if (field === 'params') {
    return {
      get: () => paramsFromUrl(tab.request.url, tab.request.params),
      set: (rows) => {
        tab.request.params = rows;
        tab.request.url = urlFromParams(tab.request.url, rows);
      }
    };
  }
  return { get: () => tab.request[field], set: (rows) => (tab.request[field] = rows) };
};

/* ── Events ─────────────────────────────────────────────────────── */
const closest = (event, selector = '[data-act]') => event.target.closest(selector);

document.addEventListener('click', (event) => {
  const el = closest(event);
  if (!el) return;
  const { act, id, name, index, field } = el.dataset;
  const tab = currentTab();

  const handlers = {
    'toggle-sidebar': () => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      render();
    },
    'sidebar-tab': () => {
      state.sidebarTab = name;
      state.sidebarQuery = '';
      persist();
      render();
    },
    'new-collection': () => {
      state.collections.push({ id: uid(), name: `Collection ${state.collections.length + 1}`, expanded: true, requests: [] });
      persist();
      render();
    },
    'clear-history': () => {
      state.history = [];
      persist();
      render();
      toast('History cleared');
    },
    'toggle-collection': () => {
      const collection = state.collections.find((item) => item.id === id);
      collection.expanded = collection.expanded === false;
      persist();
      render();
    },
    'collection-menu': () => {
      event.stopPropagation();
      const collection = state.collections.find((item) => item.id === id);
      state.modal = { kind: 'rename', id, name: collection.name };
      render();
    },
    'confirm-rename': () => {
      const collection = state.collections.find((item) => item.id === id);
      collection.name = $('#rename-value').value.trim() || collection.name;
      state.modal = null;
      persist();
      render();
    },
    'delete-collection': () => {
      state.collections = state.collections.filter((item) => item.id !== id);
      for (const item of state.tabs) if (item.origin?.collectionId === id) item.origin = null;
      state.modal = null;
      persist();
      render();
      toast('Collection deleted');
    },
    'open-request': () => {
      const request = findRequest(el.dataset.collection, id);
      if (request) openRequest(request, { collectionId: el.dataset.collection, requestId: id });
    },
    'delete-request': () => {
      event.stopPropagation();
      const collection = state.collections.find((item) => item.id === el.dataset.collection);
      collection.requests = collection.requests.filter((item) => item.id !== id);
      for (const item of state.tabs) if (item.origin?.requestId === id) item.origin = null;
      persist();
      render();
      toast('Request deleted');
    },
    'open-history': () => openHistoryEntry(id),
    'select-tab': () => {
      state.activeTab = id;
      persist();
      render();
    },
    'close-tab': () => {
      event.stopPropagation();
      closeTab(id);
    },
    'new-tab': () => {
      const created = newTab();
      state.tabs.push(created);
      state.activeTab = created.id;
      state.palette = null;
      persist();
      render();
    },
    send: sendCurrent,
    cancel: () => {
      window.cheetah.cancel(tab.pendingId);
      tab.loading = false;
      tab.response = { ok: false, error: 'Request cancelled', cancelled: true };
      render();
    },
    save: () => {
      state.palette = null;
      saveTab();
    },
    'confirm-save': () => {
      const requestName = $('#save-name').value.trim() || 'Untitled request';
      let collectionId = $('#save-collection').value;
      if (collectionId === '__new' || !state.collections.length) {
        const label = $('#save-new-collection').value.trim() || 'My API';
        const collection = { id: uid(), name: label, expanded: true, requests: [] };
        state.collections.push(collection);
        collectionId = collection.id;
      }
      const collection = state.collections.find((item) => item.id === collectionId);
      const saved = structuredClone(tab.request);
      saved.id = uid();
      saved.name = requestName;
      collection.requests.push(saved);
      tab.request.name = requestName;
      tab.origin = { collectionId, requestId: saved.id };
      tab.dirty = false;
      state.modal = null;
      state.sidebarTab = 'collections';
      persist();
      render();
      toast(`Saved to ${collection.name}`, 'success');
    },
    'req-tab': () => {
      tab.reqTab = name;
      persist();
      render();
    },
    'res-tab': () => {
      tab.resTab = name;
      render();
    },
    'kv-toggle': () => {
      const target = kvTarget(field);
      const rows = target.get();
      rows[Number(index)].enabled = !rows[Number(index)].enabled;
      target.set(rows);
      touch(tab);
      render();
    },
    'kv-remove': () => {
      const target = kvTarget(field);
      const rows = target.get();
      rows.splice(Number(index), 1);
      target.set(rows);
      touch(tab);
      render();
    },
    'format-body': () => {
      tab.request.body = prettify(tab.request.body, tab.request.bodyType);
      touch(tab);
      render();
    },
    'toggle-pretty': () => {
      tab.pretty = !tab.pretty;
      render();
    },
    'toggle-wrap': () => {
      tab.wrap = !tab.wrap;
      render();
    },
    find: () => {
      state.find = state.find === null ? '' : null;
      render();
    },
    'find-close': () => {
      state.find = null;
      render();
    },
    'copy-response': () => {
      navigator.clipboard.writeText(decodeText(tab.response.body));
      toast('Response copied', 'success');
    },
    'save-response': async () => {
      const suggested = (tab.request.url.split('/').pop() || 'response').split('?')[0] || 'response';
      const result = await window.cheetah.saveBody(suggested, tab.response.body);
      if (result.ok) toast('Saved to file', 'success');
    },
    'copy-curl': () => {
      navigator.clipboard.writeText(toCurl(buildRequest(tab.request)));
      state.palette = null;
      render();
      toast('cURL copied to clipboard', 'success');
    },
    'import-curl': () => {
      state.palette = null;
      state.modal = { kind: 'curl' };
      render();
    },
    'confirm-curl': () => {
      const text = $('#curl-input').value;
      state.modal = null;
      applyCurl(text);
    },
    'edit-envs': () => {
      state.palette = null;
      state.modal = { kind: 'envs', envId: state.activeEnvironment || state.environments[0]?.id };
      render();
    },
    'new-env': () => {
      const env = { id: uid(), name: `Environment ${state.environments.length + 1}`, vars: [] };
      state.environments.push(env);
      state.activeEnvironment = env.id;
      state.modal.envId = env.id;
      persist();
      render();
    },
    'delete-env': () => {
      state.environments = state.environments.filter((item) => item.id !== id);
      if (state.activeEnvironment === id) state.activeEnvironment = state.environments[0]?.id || null;
      state.modal.envId = state.environments[0]?.id;
      persist();
      render();
    },
    settings: () => {
      state.palette = null;
      state.modal = { kind: 'settings' };
      render();
    },
    'toggle-theme': () => {
      state.settings.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      state.palette = null;
      applyTheme();
      persist();
      render();
    },
    'export-workspace': async () => {
      const payload = JSON.stringify({ collections: state.collections, environments: state.environments }, null, 2);
      const result = await window.cheetah.exportFile('cheetah-workspace.json', payload);
      if (result.ok) toast('Workspace exported', 'success');
    },
    'import-workspace': async () => {
      const result = await window.cheetah.importFile();
      if (!result.ok) return;
      try {
        const data = JSON.parse(result.contents);
        state.collections.push(...(data.collections || []));
        state.environments.push(...(data.environments || []));
        persist();
        render();
        toast(`Imported ${(data.collections || []).length} collection(s)`, 'success');
      } catch {
        toast('That file is not a valid workspace export', 'error');
      }
    },
    palette: () => {
      state.palette = { query: '', index: 0 };
      render();
    },
    'palette-run': () => runPaletteItem(Number(el.dataset.index)),
    'close-modal': () => {
      state.modal = null;
      render();
    },
    scrim: () => {
      if (event.target !== el) return;
      state.modal = null;
      state.palette = null;
      render();
    }
  };

  handlers[act]?.();
});

const runPaletteItem = (index) => {
  const item = paletteItems()[index];
  if (!item) return;
  if (item.kind === 'command') {
    state.palette = null;
    document.querySelector(`[data-act="${item.act}"]`)?.click();
    return;
  }
  state.palette = null;
  if (item.kind === 'request') {
    const request = findRequest(item.collectionId, item.id);
    if (request) return openRequest(request, { collectionId: item.collectionId, requestId: item.id });
    return render();
  }
  openHistoryEntry(item.id);
};

/* ── Input handling ─────────────────────────────────────────────── */
document.addEventListener('input', (event) => {
  const el = closest(event);
  if (!el) return;
  const { act, field, index, part, key } = el.dataset;
  const tab = currentTab();

  switch (act) {
    case 'sidebar-filter':
      state.sidebarQuery = el.value;
      return render();

    case 'set-url': {
      const value = el.value;
      // Pasting a whole cURL command into the URL bar imports it.
      if (/^\s*curl\s/i.test(value)) {
        el.value = '';
        return applyCurl(value);
      }
      tab.request.url = value;
      tab.request.params = paramsFromUrl(value, tab.request.params);
      touch(tab);
      // Params tab mirrors the URL, so keep it in step while typing.
      if (tab.reqTab === 'params') render();
      else refreshChrome();
      return;
    }

    case 'set-body':
      tab.request.body = el.value;
      touch(tab);
      return;

    case 'kv-edit': {
      const target = kvTarget(field);
      const rows = target.get();
      const position = Number(index);
      const isNew = position >= rows.length;
      if (isNew) rows.push({ key: '', value: '', enabled: true });
      rows[position][part] = el.value;
      target.set(rows);
      touch(tab);
      // A new trailing row needs to appear; existing rows edit in place.
      if (isNew) render();
      else if (field === 'params') refreshChrome();
      return;
    }

    case 'set-auth':
      tab.request.auth[part] = el.value;
      touch(tab);
      return;

    case 'env-name': {
      const env = state.environments.find((item) => item.id === el.dataset.id);
      env.name = el.value;
      persist();
      return refreshChrome();
    }

    case 'set-setting':
      state.settings[key] = el.type === 'checkbox' ? el.checked : el.value;
      if (key === 'theme') applyTheme();
      persist();
      return;

    case 'find-input':
      state.find = el.value;
      return render();

    default:
      return;
  }
});

document.addEventListener('change', (event) => {
  const el = closest(event);
  if (!el) return;
  const tab = currentTab();

  switch (el.dataset.act) {
    case 'set-method':
      tab.request.method = el.value;
      if (tab.request.bodyType === 'none' && ['POST', 'PUT', 'PATCH'].includes(el.value)) tab.request.bodyType = 'json';
      touch(tab);
      return render();

    case 'set-body-type':
      tab.request.bodyType = el.value;
      touch(tab);
      return render();

    case 'set-auth':
      tab.request.auth[el.dataset.part] = el.value;
      touch(tab);
      return render();

    case 'pick-env':
      state.activeEnvironment = el.value || null;
      persist();
      return render();

    case 'modal-pick-env':
      state.modal.envId = el.value;
      state.activeEnvironment = el.value;
      persist();
      return render();

    case 'set-setting':
      if (el.dataset.key === 'theme') return render();
      return;

    case 'save-collection': {
      const field = $('#new-collection-field');
      if (field) field.hidden = el.value !== '__new';
      return;
    }

    default:
      return;
  }
});

// Repaint only the chrome that reflects request state, so typing keeps focus.
const refreshChrome = () => {
  const tab = currentTab();
  if (!tab) return;
  const strip = $('.tabstrip');
  if (strip) strip.outerHTML = renderTabstrip();
  const footer = $('.footer');
  if (footer) footer.outerHTML = renderFooter();
  const select = $('.method-select');
  if (select) select.className = `method-select m-${tab.request.method}`;
  // Editing a param rewrites the URL; mirror it unless the user is typing there.
  const url = $('.url-input');
  if (url && url !== document.activeElement) url.value = tab.request.url;
};

/* ── Keyboard ───────────────────────────────────────────────────── */
document.addEventListener('keydown', (event) => {
  const mod = event.metaKey || event.ctrlKey;
  const tab = currentTab();

  if (state.palette) {
    const items = paletteItems();
    if (event.key === 'ArrowDown' || (mod && event.key === 'n')) {
      event.preventDefault();
      state.palette.index = (state.palette.index + 1) % Math.max(1, items.length);
      return renderOverlays();
    }
    if (event.key === 'ArrowUp' || (mod && event.key === 'p')) {
      event.preventDefault();
      state.palette.index = (state.palette.index - 1 + items.length) % Math.max(1, items.length);
      return renderOverlays();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      return runPaletteItem(state.palette.index);
    }
    if (event.key === 'Escape') {
      state.palette = null;
      return render();
    }
    if (event.target.id === 'palette-input') {
      // Let the character land, then re-filter.
      queueMicrotask(() => {
        state.palette.query = $('#palette-input').value;
        state.palette.index = 0;
        renderOverlays();
      });
    }
    return;
  }

  if (event.key === 'Escape') {
    if (state.modal) {
      state.modal = null;
      return render();
    }
    if (state.find !== null) {
      state.find = null;
      return render();
    }
    if (tab?.loading) {
      window.cheetah.cancel(tab.pendingId);
      tab.loading = false;
      tab.response = { ok: false, error: 'Request cancelled', cancelled: true };
      return render();
    }
    return;
  }

  if (state.modal && event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') {
    const confirm = document.querySelector('.modal footer .btn-primary');
    if (confirm) {
      event.preventDefault();
      confirm.click();
    }
    return;
  }

  if (!mod) return;

  const shortcuts = {
    Enter: sendCurrent,
    s: saveTab,
    t: () => document.querySelector('.tab-new').click(),
    w: () => tab && closeTab(tab.id),
    k: () => {
      state.palette = { query: '', index: 0 };
      render();
    },
    f: () => {
      if (!tab?.response?.ok) return;
      state.find = state.find === null ? '' : state.find;
      tab.resTab = 'body';
      render();
    },
    b: () => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      render();
    },
    l: () => $('.url-input')?.select()
  };

  const action = shortcuts[event.key] || shortcuts[event.key.toLowerCase()];
  if (action) {
    event.preventDefault();
    action();
  }

  // ⌘1–9 jumps to a tab.
  if (/^[1-9]$/.test(event.key) && state.tabs[Number(event.key) - 1]) {
    event.preventDefault();
    state.activeTab = state.tabs[Number(event.key) - 1].id;
    render();
  }
});

/* ── Splitter drag ──────────────────────────────────────────────── */
document.addEventListener('mousedown', (event) => {
  const handle = event.target.closest('.splitter');
  if (!handle) return;
  event.preventDefault();
  handle.classList.add('dragging');
  const panes = handle.parentElement;

  const onMove = (moveEvent) => {
    const rect = panes.getBoundingClientRect();
    const percent = ((moveEvent.clientY - rect.top) / rect.height) * 100;
    state.reqHeight = Math.min(80, Math.max(12, percent));
    panes.style.setProperty('--req-h', `${state.reqHeight}%`);
  };

  const onUp = () => {
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    persist();
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

/* ── Boot ───────────────────────────────────────────────────────── */
const boot = async () => {
  document.body.dataset.platform = window.cheetah.platform;
  hydrate(await window.cheetah.loadWorkspace());
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'system') applyTheme();
  });
  render();
};

boot();
