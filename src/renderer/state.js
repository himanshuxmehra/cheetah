import { uid } from './format.js';

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
export const BODY_TYPES = [
  ['none', 'None'],
  ['json', 'JSON'],
  ['text', 'Text'],
  ['xml', 'XML'],
  ['form-urlencoded', 'Form URL-encoded'],
  ['form-data', 'Multipart form']
];

export const blankRow = () => ({ key: '', value: '', enabled: true });

export const newRequest = (overrides = {}) => ({
  id: uid(),
  name: 'Untitled request',
  method: 'GET',
  url: '',
  params: [],
  headers: [],
  bodyType: 'none',
  body: '',
  formData: [],
  auth: { type: 'none', token: '', username: '', password: '', key: '', value: '', addTo: 'header' },
  ...overrides
});

export const newTab = (request = newRequest()) => ({
  id: uid(),
  request,
  origin: null, // { collectionId, requestId } once saved
  dirty: false,
  loading: false,
  response: null,
  reqTab: 'params',
  resTab: 'body',
  wrap: true,
  pretty: true
});

export const state = {
  collections: [],
  environments: [],
  activeEnvironment: null,
  history: [],
  tabs: [],
  activeTab: null,
  settings: { theme: 'system', followRedirects: true, verifySsl: true, timeout: 60000 },
  sidebarTab: 'collections',
  sidebarQuery: '',
  sidebarCollapsed: false,
  reqHeight: 42,
  modal: null,
  palette: null,
  find: null,
  toasts: []
};

export const currentTab = () => state.tabs.find((tab) => tab.id === state.activeTab) || null;

export const activeEnv = () => state.environments.find((env) => env.id === state.activeEnvironment) || null;

export const envVars = () => {
  const env = activeEnv();
  if (!env) return {};
  const vars = {};
  for (const row of env.vars) if (row.enabled && row.key) vars[row.key] = row.value;
  return vars;
};

// Only the durable slice is persisted; transient UI (modals, toasts, in-flight
// responses) is deliberately excluded so a reload starts clean.
const PERSIST = ['collections', 'environments', 'activeEnvironment', 'history', 'settings', 'sidebarTab', 'reqHeight'];

let saveTimer = null;

export const persist = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const payload = {};
    for (const key of PERSIST) payload[key] = state[key];
    payload.tabs = state.tabs.map((tab) => ({
      id: tab.id,
      request: tab.request,
      origin: tab.origin,
      dirty: tab.dirty,
      reqTab: tab.reqTab,
      resTab: tab.resTab
    }));
    payload.activeTab = state.activeTab;
    window.cheetah.saveWorkspace(payload);
  }, 250);
};

export const hydrate = (data) => {
  Object.assign(state, {
    collections: data.collections || [],
    environments: data.environments || [],
    activeEnvironment: data.activeEnvironment || null,
    history: data.history || [],
    settings: { ...state.settings, ...(data.settings || {}) },
    sidebarTab: data.sidebarTab || 'collections',
    reqHeight: data.reqHeight || 42
  });

  state.tabs = (data.tabs || []).map((tab) => ({ ...newTab(tab.request), ...tab, loading: false, response: null }));
  if (!state.tabs.length) state.tabs = [newTab()];
  state.activeTab = state.tabs.some((tab) => tab.id === data.activeTab) ? data.activeTab : state.tabs[0].id;
};

export const findRequest = (collectionId, requestId) => {
  const collection = state.collections.find((item) => item.id === collectionId);
  return collection ? collection.requests.find((item) => item.id === requestId) : null;
};

export const pushHistory = (request, response) => {
  state.history.unshift({
    id: uid(),
    at: Date.now(),
    method: request.method,
    url: request.url,
    status: response?.status ?? null,
    time: response?.timings?.total ?? null,
    snapshot: structuredClone(request)
  });
  state.history = state.history.slice(0, 200);
};
