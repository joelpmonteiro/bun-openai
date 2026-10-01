import { MODELS_CACHE_TTL_MS } from "../config/config";
import { requestApmix } from "../openai/api";
import { PUBLIC_MODEL_IDS } from "./public-models";

export interface ModelInfo {
	id: string;
	object: "model";
	owned_by: string;
	created: number;
	[key: string]: unknown;
}

export interface ModelCatalog {
	fetchedAt: number | null;
	models: ModelInfo[];
	source: "public-snapshot" | "upstream" | "stale";
	error?: Response;
}

const fallback: ModelCatalog = {
	fetchedAt: null,
	source: "public-snapshot",
	models: PUBLIC_MODEL_IDS.map((id) => ({ id, object: "model", owned_by: id.split("/")[0]!, created: 0 })),
};
const cache = new Map<string, ModelCatalog>();
const pending = new Map<string, Promise<ModelCatalog>>();

export function normalizeModels(payload: unknown): ModelInfo[] {
	if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) return [];
	const seen = new Set<string>();
	return payload.data.flatMap((entry: unknown) => {
		if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string" || !entry.id.trim() || seen.has(entry.id)) return [];
		seen.add(entry.id);
		const model = entry as Record<string, unknown>;
		return [{
			...model,
			id: entry.id,
			object: "model" as const,
			owned_by: typeof model.owned_by === "string" ? model.owned_by : entry.id.split("/")[0]!,
			created: typeof model.created === "number" ? model.created : 0,
		}];
	});
}

async function refresh(apiKey: string, previous?: ModelCatalog): Promise<ModelCatalog> {
	try {
		const response = await requestApmix("models", apiKey);
		// Authentication and plan errors must remain visible to the client.
		if (!response.ok && response.status < 500) return { ...fallback, error: response };
		if (!response.ok) throw new Error("Upstream unavailable");
		const payload: unknown = await response.json();
		if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data)) throw new Error("Invalid model catalog");
		const models = normalizeModels(payload);
		if (payload.data.length > 0 && !models.length) throw new Error("Invalid model catalog");
		const catalog: ModelCatalog = { fetchedAt: Date.now(), models, source: "upstream" };
		if (cache.size >= 128) cache.delete(cache.keys().next().value!);
		cache.set(apiKey, catalog);
		return catalog;
	} catch {
		return previous ? { ...previous, source: "stale" } : fallback;
	}
}

export async function getSupportedModels(apiKey: string | null, forceRefresh = false): Promise<ModelCatalog> {
	if (!apiKey) return fallback;
	const previous = cache.get(apiKey);
	if (!forceRefresh && previous?.fetchedAt && Date.now() - previous.fetchedAt < MODELS_CACHE_TTL_MS) return previous;
	const inFlight = pending.get(apiKey);
	if (inFlight) return inFlight;
	const promise = refresh(apiKey, previous);
	pending.set(apiKey, promise);
	try {
		return await promise;
	} finally {
		pending.delete(apiKey);
	}
}
