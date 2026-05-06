import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";

// const dataDir = process.env.NODE_ENV === "production" ? "/app/data" : ".";
// if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database("theclawbay.sqlite", { create: true, strict: true });
db.run("PRAGMA journal_mode = WAL;");

db.run(`
	CREATE TABLE IF NOT EXISTS models (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		owned_by TEXT NOT NULL,
		created INTEGER NOT NULL DEFAULT (unixepoch()),
		active INTEGER NOT NULL DEFAULT 1
	)
`);

db.run(`
	CREATE TABLE IF NOT EXISTS quotas (
		api_key TEXT PRIMARY KEY,
		five_hour_used REAL NOT NULL DEFAULT 0,
		five_hour_limit REAL NOT NULL DEFAULT 100,
		weekly_used REAL NOT NULL DEFAULT 0,
		weekly_limit REAL NOT NULL DEFAULT 1000
	)
`);

export { db };
