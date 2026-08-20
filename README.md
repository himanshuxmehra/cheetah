# Cheetah

Cheetah is a lightweight API client — a fast, focused replacement for Postman.

Requests run in Electron's main process over Node's `http`/`https`, so there is
no CORS sandbox in the way, and you get real connection timings, redirect
chains and raw transfer sizes.

## Features

- **Requests** — all standard methods, query params kept in sync with the URL bar
  in both directions, headers, and JSON / text / XML / form-urlencoded / multipart bodies.
- **Auth** — bearer token, basic, or API key in a header or query param.
- **Response viewer** — status, time and size at a glance; pretty-printed and
  syntax-highlighted JSON, HTML and XML; headers, cookies, sandboxed HTML/image
  preview, and a per-phase timing breakdown (DNS, TCP, TLS, first byte).
- **Environments** — define `{{variables}}` once and use them in any URL, header,
  body or credential. Sends are blocked with a clear message if one is unresolved.
- **Collections & history** — save requests into collections; every send is
  recorded and replayable. Export or import a workspace as JSON.
- **cURL in and out** — paste a `curl` command straight into the URL bar to import
  it, or copy the current request as `curl`.
- **Tabs, command palette, light/dark themes.**

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘↵` | Send request |
| `⌘S` | Save request |
| `⌘K` | Command palette |
| `⌘T` / `⌘W` | New / close tab |
| `⌘1`–`⌘9` | Jump to tab |
| `⌘L` | Focus the URL bar |
| `⌘F` | Find in response |
| `⌘B` | Toggle sidebar |
| `Esc` | Cancel an in-flight request, or close a dialog |

## Development

```bash
npm install   # install dependencies
npm start     # run the app
npm run make  # build distributables
```

Your collections, environments, history and open tabs are stored as a single
JSON file in Electron's `userData` directory.

## Authors

- [@himanshuxmehra](https://github.com/himanshuxmehra)
