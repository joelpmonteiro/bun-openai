import { PORT, APMIX_BASE_URL, MODELS_CACHE_TTL_MS } from "../../config/config";
import { getKeyCooldownMs, getKeyCount, getKeyStatusSnapshot } from "../../config/key-pool";
import { authenticate } from "../../middleware/auth";
import { getSupportedModels } from "../../catalog/model-catalog";
import { metadataKey } from "../../openai/api";

export async function handleGetStatus(req: Request): Promise<Response> {
	const denied = authenticate(req);
	if (denied) return denied;
	const models = await getSupportedModels(metadataKey(req));
	if (models.error) return models.error;
	return Response.json({
		status: models.source === "upstream" ? "ok" : "degraded",
		server: { port: PORT },
		upstream: { provider: "apmix", base_url: APMIX_BASE_URL },
		keys: { configured: getKeyCount(), cooldown_ms: getKeyCooldownMs(), entries: getKeyStatusSnapshot() },
		models: { source: models.source, count: models.models.length, cache_ttl_ms: MODELS_CACHE_TTL_MS, last_refreshed_at: models.fetchedAt, ids: models.models.map((model) => model.id) },
	});
}
