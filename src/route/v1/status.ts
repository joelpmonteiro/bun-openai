import { PORT, CLAUDE_URL_BASE, MODELS_CACHE_TTL_MS, OPENAI_URL_BASE } from "../../config";
import { getKeyCooldownMs, getKeyCount, getKeyRotationIndex, getKeyStatusSnapshot } from "../../key-pool";
import { getToken, unauthorized } from "../../middleware/auth";
import { getSupportedModels } from "../../models";

export async function handleGetStatus(req: Request): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const models = await getSupportedModels();

	return Response.json({
		status: "ok",
		server: {
			port: PORT,
		},
		upstream: {
			openai_base: OPENAI_URL_BASE,
			claude_base: CLAUDE_URL_BASE,
		},
		keys: {
			configured: getKeyCount(),
			cooldown_ms: getKeyCooldownMs(),
			next_rotation_index: getKeyRotationIndex(),
			entries: getKeyStatusSnapshot(),
		},
		models: {
			source: models.source,
			count: models.models.length,
			cache_ttl_ms: MODELS_CACHE_TTL_MS,
			last_refreshed_at: models.fetchedAt,
			ids: models.models.map((model) => model.id),
		},
	});
}
