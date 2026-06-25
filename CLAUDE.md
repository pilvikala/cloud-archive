# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Run without building (ts-node)
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
```

To run a single test file:
```bash
npx jest src/lib/sync-client.test.ts
```

Standalone binaries (uses `@yao-pkg/pkg`):
```bash
npm run build:linux-x64    # Also: macos-x64, macos-arm64, linux-arm64, win-x64, win-arm64
```

## Architecture

Three-layer CLI built with `commander`:

- **`src/index.ts`** — CLI entry point. Defines `upload`, `list`, and `sync` commands. Wires `GcpClient` and `SyncClient` together.
- **`src/lib/gcp-client.ts`** — Thin wrapper around `@google-cloud/storage`. Handles credential validation (checks `GOOGLE_APPLICATION_CREDENTIALS` env var, skips file existence check in `NODE_ENV=test`), file upload with cache headers, and bucket listing.
- **`src/lib/sync-client.ts`** — Sync logic. Walks the local directory tree, compares against bucket contents by file size (not hash), and uploads only new or changed files. Skips re-uploading if sizes match; warns and re-uploads if remote size is 0. Continues on per-file upload failures.
- **`src/lib/display-file-size.ts`** — Pure utility for human-readable sizes.

## Environment

Requires `GOOGLE_APPLICATION_CREDENTIALS` pointing to a GCP service account JSON key with read/write access to the target bucket. See `.env.example`. The `dotenv` package loads `.env` automatically if present.

## Testing

Tests use Jest with `ts-jest`. `GcpClient` is mocked in `sync-client.test.ts` via `jest.mock('./gcp-client')` — tests do not hit GCP. The `NODE_ENV=test` flag suppresses the credentials file existence check in `GcpClient`.
