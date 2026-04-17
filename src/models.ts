import { MODELS_CACHE_TTL_MS, OPENAI_URL_BASE } from "./config";
import { getMetadataApiKey } from "./key-pool";

export interface ModelInfo {
	id: string;
	owned_by: string;
	created: number;
}

const FALLBACK_MODELS: ModelInfo[] = [
	// Anthropic
	{ id: "claude-opus-4-7", owned_by: "anthropic", created: 1773290000 },
	{ id: "claude-opus-4-6", owned_by: "anthropic", created: 1773290000 },
	{ id: "claude-opus-4-5", owned_by: "anthropic", created: 1773290000 },
	{ id: "claude-sonnet-4-6", owned_by: "anthropic", created: 1773290000 },
	{ id: "claude-sonnet-4-5", owned_by: "anthropic", created: 1773290000 },
	{ id: "claude-sonnet-4", owned_by: "anthropic", created: 1773290000 },
	{ id: "claude-haiku-4-5", owned_by: "anthropic", created: 1773290000 },

	// OpenAI
	{ id: "gpt-5.4", owned_by: "openai", created: 1773290000 },
	{ id: "gpt-5.4-mini", owned_by: "openai", created: 1773290000 },
	{ id: "gpt-5.3-codex", owned_by: "openai", created: 1773290000 },
	{ id: "gpt-5.2-codex", owned_by: "openai", created: 1773290000 },
	{ id: "gpt-5.2", owned_by: "openai", created: 1773290000 },
	{ id: "gpt-5.1-codex-max", owned_by: "openai", created: 1773290000 },
	{ id: "gpt-5.1-codex-mini", owned_by: "openai", created: 1773290000 },
];

interface UpstreamModelResponse {
	data?: Array<{
		id?: unknown;
		created?: unknown;
		owned_by?: unknown;
	}>;
}

interface ModelCatalogCache {
	fetchedAt: number | null;
	models: ModelInfo[];
	source: "fallback" | "upstream";
}

const modelCache: ModelCatalogCache = {
	fetchedAt: null,
	models: FALLBACK_MODELS,
	source: "fallback",
};

function normalizeOwnedBy(value: unknown, id: string): string {
	if (typeof value === "string" && value.length > 0) {
		if (value === "theclawbay") {
			return id.startsWith("claude-") ? "anthropic" : "openai";
		}

		return value;
	}

	return id.startsWith("claude-") ? "anthropic" : "openai";
}

function normalizeModels(payload: UpstreamModelResponse): ModelInfo[] {
	if (!Array.isArray(payload.data)) return [];

	return payload.data.flatMap((model) => {
		if (typeof model.id !== "string" || model.id.length === 0) return [];

		return [
			{
				id: model.id,
				owned_by: normalizeOwnedBy(model.owned_by, model.id),
				created:
					typeof model.created === "number" ? model.created : 1773290000,
			},
		];
	});
}

export async function getSupportedModels(
	forceRefresh = false,
): Promise<ModelCatalogCache> {
	const ttl = Number.isFinite(MODELS_CACHE_TTL_MS) && MODELS_CACHE_TTL_MS >= 0
		? MODELS_CACHE_TTL_MS
		: 60_000;
	const now = Date.now();

	if (
		!forceRefresh &&
		modelCache.fetchedAt !== null &&
		now - modelCache.fetchedAt < ttl
	) {
		return modelCache;
	}

	const apiKey = getMetadataApiKey();
	if (!apiKey) {
		modelCache.fetchedAt = now;
		modelCache.models = FALLBACK_MODELS;
		modelCache.source = "fallback";
		return modelCache;
	}

	try {
		const response = await fetch(`${OPENAI_URL_BASE}/models`, {
			headers: {
				authorization: `Bearer ${apiKey}`,
			},
		});
		if (!response.ok) {
			throw new Error(`Upstream models request failed with status ${response.status}`);
		}

		const payload = (await response.json()) as UpstreamModelResponse;
		const models = normalizeModels(payload);
		if (models.length === 0) {
			throw new Error("Upstream models payload did not contain valid models");
		}

		modelCache.fetchedAt = now;
		modelCache.models = models;
		modelCache.source = "upstream";
		return modelCache;
	} catch {
		modelCache.fetchedAt = now;
		modelCache.models = FALLBACK_MODELS;
		modelCache.source = "fallback";
		return modelCache;
	}
}

export async function isModelAllowed(model: string): Promise<boolean> {
	const catalog = await getSupportedModels();
	return new Set(catalog.models.map((entry) => entry.id)).has(model);
}

export async function unsupportedModel(model: string): Promise<Response> {
	const catalog = await getSupportedModels();
	return Response.json(
		{
			error: `Model "${model}" is not supported. Use GET /v1/models to see available models.`,
			supportedModels: catalog.models.map((entry) => entry.id),
		},
		{ status: 400 },
	);
}
