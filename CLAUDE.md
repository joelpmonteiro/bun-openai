# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Backend API server for "The Claw Bay" built with Bun's native HTTP server (`Bun.serve`) and TypeScript.

## Commands

- **Install dependencies:** `bun install`
- **Run dev server (with watch):** `bun run start` (runs on port 3000)
- **Run directly:** `bun run index.ts`
- **Type check:** `bunx tsc --noEmit`

## Architecture

- **`index.ts`** — Entry point. Creates the Bun HTTP server on port 3000 using Bun's built-in route-based `serve()` API.
- **`src/route/`** — Route definitions exported as a routes object consumed by `Bun.serve({ routes })`.
- Uses Bun's built-in `sql` (Postgres) for database access — no external ORM.

## Key Conventions

- Runtime is **Bun** (not Node). Use Bun-native APIs (`Bun.serve`, `bun:sql`, etc.) over Node equivalents.
- TypeScript strict mode is enabled with `noUncheckedIndexedAccess` and `noImplicitOverride`.
- Module system: ESNext with bundler-style resolution (`"module": "Preserve"`).
- Environment variables go in `.env` files (gitignored).
