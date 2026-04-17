# Cloudflare Workers Migration — Design Spec

**Date:** 2026-04-14
**Status:** Implemented
**Project:** cloudflare-theclawbay

## Summary

Migrate the Bun-based proxy server (`bun-theclawbay`) to a Cloudflare Worker (`cloudflare-theclawbay`), running on Cloudflare's edge network. The Worker proxies requests to `api.theclawbay.com` for both OpenAI and Anthropic APIs, with D1 replacing `bun:sqlite` for quota and model storage.

## Architecture

```
Claude Code / SDK clients
        |
        v
Cloudflare Worker (edge)
   +-- /v1/*                -> proxy OpenAI (api.theclawbay.com/v1)
   +-- /anthropic/v1/*      -> proxy Anthropic (api.theclawbay.com/anthropic)
   +-- D1 SQLite            -> quotas + models
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/models` | List allowed models (static) |
| POST | `/v1/responses` | Proxy to OpenAI responses |
| POST | `/v1/chat/completions` | Proxy to OpenAI chat completions |
| GET | `/v1/quota` | Query quota from D1 |
| GET | `/anthropic/v1/models` | List Anthropic models from D1 |
| POST | `/anthropic/v1/messages` | Proxy to Anthropic messages |
| POST | `/anthropic/v1/messages/count_tokens` | Proxy to Anthropic token count |

## Key Decisions

1. **D1 for persistence** — near-identical SQL to the original `bun:sqlite` schema
2. **Worker URL as base** — `https://theclawbay-proxy.<user>.workers.dev`
3. **Standard Cloudflare secrets** — `wrangler.toml` for non-sensitive vars, `wrangler secret put` for API keys
4. **Env injection** — all handlers receive `(req, env)` instead of reading `process.env`

## Migration Map

| Bun component | Cloudflare equivalent |
|---|---|
| `Bun.serve({ routes })` | `export default { fetch() }` + pathname router |
| `bun:sqlite` | D1 binding (`env.DB`) |
| `process.env` | `env` parameter (vars + secrets) |
| `.env` file | `wrangler.toml` [vars] + `wrangler secret put` |
| `bun run --watch` | `wrangler dev` |

## Deploy Steps

```bash
cd cloudflare-theclawbay
npm install
wrangler d1 create theclawbay          # copy database_id to wrangler.toml
wrangler d1 migrations apply theclawbay
wrangler secret put THECLAWBAY_API_KEY
wrangler dev                            # local test
wrangler deploy                         # production
```
