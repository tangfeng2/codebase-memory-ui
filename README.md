# Codebase Memory UI

Vue 3 interface for exploring and operating a `codebase-memory-mcp` graph index.

Repository: [tangfeng2/codebase-memory-ui](https://github.com/tangfeng2/codebase-memory-ui)

This app is a Vue 3 port of the original React `graph-ui` from
[DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp),
under the upstream `graph-ui/` directory.

The upstream project is licensed under MIT. This port keeps the same MIT license
and copyright notice, with `tangfeng2` credited for the Vue 3 port.

## What It Does

- Lists indexed codebase-memory projects.
- Shows project graph statistics and health.
- Renders a 3D code graph with node and edge filters.
- Supports node selection, path highlighting, camera fly-to, labels, tooltips,
  and idle auto-rotation.
- Provides project indexing controls, ADR editing, process metrics, and logs.
- Talks to the MCP-compatible JSON-RPC endpoint at `/rpc`.

## Stack

- Vue 3
- Vite
- TypeScript
- Tailwind CSS
- Three.js
- pnpm

## Development

Install dependencies:

```bash
pnpm install
```

Run the dev server:

```bash
pnpm dev
```

The Vite dev server proxies backend calls to:

```text
http://127.0.0.1:9749
```

Configured routes:

- `/rpc`
- `/api`

## Build

```bash
pnpm build
```

The build runs:

```bash
vue-tsc -b && vite build
```

## Project Layout

```text
src/
  api/             JSON-RPC client
  components/      Vue application components
  components/ui/   Reusable Vue UI primitives
  hooks/           Vue composables
  lib/             Shared types, colors, camera helpers, i18n
```


## License

MIT. See [LICENSE](./LICENSE).

Copyright:

- Original upstream: Copyright (c) 2025 DeusData
- Vue 3 port: Copyright (c) 2026 tangfeng2
