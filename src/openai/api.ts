import { APMIX_BASE_URL, PROXY_API_KEY, UPSTREAM_TIMEOUT_MS } from "../config/config";
import { getKeyCount, getMetadataApiKey, getNextUpstreamKey, markKeyCooldown } from "../config/key-pool";
import { apiError, getToken } from "../middleware/auth";

export function metadataKey(req: Request): string | null {
	return getMetadataApiKey() ?? (PROXY_API_KEY ? null : getToken(req));
}

export async function requestApmix(path: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set("authorization", `Bearer ${apiKey}`);
	return fetch(`${APMIX_BASE_URL}/${path}`, {
		...init,
		headers,
		signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]) : AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
	});
}

export async function proxyApmix(req: Request, path: string, payload?: Record<string, unknown>): Promise<Response> {
	const key = payload ? getNextUpstreamKey() : null;
	const apiKey = payload ? key?.value ?? (getKeyCount() === 0 && !PROXY_API_KEY ? getToken(req) : null) : metadataKey(req);

	if (!apiKey) return apiError(503, "Configure an APMIX_API_KEY or wait for the configured keys to leave cooldown.", "upstream_unavailable");

	try {
		const upstream = await requestApmix(path, apiKey, {
			method: payload ? "POST" : "GET",
			headers: payload ? { "content-type": "application/json" } : undefined,
			body: payload ? JSON.stringify(payload) : undefined,
			signal: req.signal,
		});

		if (key && upstream.status === 429) markKeyCooldown(key.index);
		const headers = new Headers();
		for (const [name, value] of upstream.headers) {
			if (["content-type", "retry-after", "x-request-id"].includes(name) || name.startsWith("x-apmix-") || name.startsWith("x-ratelimit-")) headers.set(name, value);
		}
		if (payload?.stream === true && upstream.ok) {
			headers.set("content-type", "text/event-stream");
			headers.set("cache-control", "no-cache");
			headers.set("x-accel-buffering", "no");
		}
		return new Response(upstream.body, { status: upstream.status, headers });
	} catch {
		return apiError(502, "The APMix upstream request failed or timed out.", "upstream_error");
	}
}
