# Project Guidance

Bun and TypeScript proxy for APMix with OpenAI-compatible Chat Completions,
Responses, model discovery and usage. Copilot Chat uses the Custom Endpoint
provider in VS Code.

## Commands

- Install: `bun install`
- Development server: `bun run start` (127.0.0.1:4500)
- Tests: `bun test`
- Type checking: `bun run typecheck`

## Architecture

- `index.ts`: Bun.serve entry point.
- `src/route/`: HTTP routes and validation.
- `src/openai/api.ts`: shared native-fetch APMix transport.
- `src/catalog/`: model catalog retrieval, normalization, per-key cache and public snapshot.
- `src/config/`: environment configuration and API key rotation.

Use Bun-native APIs, strict TypeScript and repository-local conventions.
Never log or commit credentials. Preserve tool calls, multimodal input,
reasoning options and SSE bytes; do not force provider-specific defaults.
Models are validated by APMix, whose plan-scoped catalog is authoritative.
