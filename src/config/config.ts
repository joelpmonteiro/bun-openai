function positiveNumber(name: string, fallback: number): number {
	const value = Number(process.env[name] ?? fallback);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const PORT = positiveNumber("PORT", 4500);
export const HOST = process.env.HOST ?? "127.0.0.1";
export const APMIX_BASE_URL = (process.env.APMIX_BASE_URL ?? "https://api.apmix.ai/v1").replace(/\/+$/, "");
export const MODELS_CACHE_TTL_MS = positiveNumber("APMIX_MODELS_CACHE_TTL_MS", 60_000);
export const UPSTREAM_TIMEOUT_MS = positiveNumber("APMIX_TIMEOUT_MS", 120_000);
export const PROXY_API_KEY = process.env.PROXY_API_KEY?.trim() ?? "";
