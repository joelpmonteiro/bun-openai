export interface ModelInfo {
	id: string;
	owned_by: string;
	created: number;
}

export const ALLOWED_MODELS: ModelInfo[] = [
	// Anthropic
	{ id: "claude-opus-4-6", owned_by: "anthropic", created: 1736380800 },
	{ id: "claude-opus-4-5", owned_by: "anthropic", created: 1736380800 },
	{ id: "claude-sonnet-4-6", owned_by: "anthropic", created: 1736380800 },
	{ id: "claude-sonnet-4-5", owned_by: "anthropic", created: 1736380800 },
	{ id: "claude-sonnet-4", owned_by: "anthropic", created: 1736380800 },
	{ id: "claude-haiku-4-5", owned_by: "anthropic", created: 1736380800 },

	// OpenAI
	{ id: "gpt-4.1", owned_by: "openai", created: 1736380800 },
	{ id: "gpt-4.1-mini", owned_by: "openai", created: 1736380800 },
	{ id: "gpt-4.1-nano", owned_by: "openai", created: 1736380800 },
	{ id: "gpt-4o", owned_by: "openai", created: 1736380800 },
	{ id: "gpt-4o-mini", owned_by: "openai", created: 1736380800 },
	{ id: "o3", owned_by: "openai", created: 1736380800 },
	{ id: "o3-mini", owned_by: "openai", created: 1736380800 },
	{ id: "o4-mini", owned_by: "openai", created: 1736380800 },
	{ id: "gpt-5.3-codex", owned_by: "openai", created: 1736380800 },
];

const allowedSet = new Set(ALLOWED_MODELS.map((m) => m.id));

export function isModelAllowed(model: string): boolean {
	return allowedSet.has(model);
}

export function unsupportedModel(model: string): Response {
	return Response.json(
		{
			error: `Model "${model}" is not supported. Use GET /v1/models to see available models.`,
		},
		{ status: 400 },
	);
}
