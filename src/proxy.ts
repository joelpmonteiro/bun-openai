import {
	getKeyCount,
	getKeyLabel,
	getNextUpstreamKey,
	markKeyCooldown,
} from "./key-pool";
import { CLAUDE_URL_BASE, OPENAI_URL_BASE } from "./config";
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type ProxyHeaders = Record<string, string>;

interface AttemptResult {
	error?: unknown;
	keyIndex: number;
	response: Response | null;
}

function createMissingKeyResponse(): Response {
	return Response.json(
		{
			error:
				'No upstream API keys configured. Set THECLAWBAY_API_KEYS="key1,key2" or THECLAWBAY_API_KEY.',
		},
		{ status: 500 },
	);
}

function createUpstreamUnavailableResponse(): Response {
	return Response.json(
		{
			error: "All upstream key attempts failed.",
		},
		{ status: 502 },
	);
}

function shouldRetry(status: number): boolean {
	return RETRYABLE_STATUS_CODES.has(status);
}

async function sendProxyRequest(
	url: string,
	path: string,
	body: unknown,
	stream: boolean,
	headersFactory: (apiKey: string, stream: boolean) => ProxyHeaders,
	excludedKeyIndex?: number,
): Promise<AttemptResult | null> {
	const key = getNextUpstreamKey(excludedKeyIndex);
	if (!key) return null;

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: headersFactory(key.value, stream),
			body: JSON.stringify({ ...(body as object), stream }),
		});

		return {
			keyIndex: key.index,
			response,
		};
	} catch (error) {
		console.log(
			`[proxy] xx request failed  ${path}  using=${getKeyLabel(key.index)}`,
		);
		return {
			error,
			keyIndex: key.index,
			response: null,
		};
	}
}

async function proxyRequest(
	provider: "OpenAI" | "Anthropic",
	path: string,
	url: string,
	body: unknown,
	stream: boolean,
	headersFactory: (apiKey: string, stream: boolean) => ProxyHeaders,
): Promise<Response> {
	if (getKeyCount() === 0) return createMissingKeyResponse();

	const model = (body as Record<string, unknown>).model ?? "unknown";
	const start = performance.now();

	const firstAttempt = await sendProxyRequest(
		url,
		path,
		body,
		stream,
		headersFactory,
	);
	if (!firstAttempt) return createMissingKeyResponse();

	console.log(
		`[proxy] -> ${provider}  ${path}  model=${model}  stream=${stream}  using=${getKeyLabel(firstAttempt.keyIndex)}`,
	);

	if (firstAttempt.response && !shouldRetry(firstAttempt.response.status)) {
		const ms = (performance.now() - start).toFixed(0);
		console.log(
			`[proxy] <- ${provider}  ${path}  status=${firstAttempt.response.status}  ${ms}ms  using=${getKeyLabel(firstAttempt.keyIndex)}`,
		);
		return firstAttempt.response;
	}

	if (getKeyCount() === 1) {
		if (firstAttempt.response) return firstAttempt.response;
		return createUpstreamUnavailableResponse();
	}

	markKeyCooldown(firstAttempt.keyIndex);
	const firstFailureReason =
		firstAttempt.response?.status ?? "network-error";
	console.log(
		`[proxy] retry ${provider}  ${path}  reason=${firstFailureReason}  cooling=${getKeyLabel(firstAttempt.keyIndex)}`,
	);

	const retryAttempt = await sendProxyRequest(
		url,
		path,
		body,
		stream,
		headersFactory,
		firstAttempt.keyIndex,
	);

	if (retryAttempt?.response) {
		const ms = (performance.now() - start).toFixed(0);
		console.log(
			`[proxy] <- ${provider}  ${path}  status=${retryAttempt.response.status}  ${ms}ms  using=${getKeyLabel(retryAttempt.keyIndex)}`,
		);
		return retryAttempt.response;
	}

	if (firstAttempt.response) return firstAttempt.response;
	if (retryAttempt?.error) return createUpstreamUnavailableResponse();
	return createUpstreamUnavailableResponse();
}

export async function proxyToOpenAI(
	path: string,
	body: unknown,
	stream: boolean,
): Promise<Response> {
	const url = `${OPENAI_URL_BASE}${path}`;
	return proxyRequest(
		"OpenAI",
		path,
		url,
		body,
		stream,
		(apiKey) => ({
			"content-type": "application/json",
			authorization: `Bearer ${apiKey}`,
		}),
	);
}

export async function proxyToAnthropic(
	path: string,
	body: unknown,
	stream: boolean,
): Promise<Response> {
	const url = `${CLAUDE_URL_BASE}${path}`;
	return proxyRequest(
		"Anthropic",
		path,
		url,
		body,
		stream,
		(apiKey, isStream) => {
			const headers: ProxyHeaders = {
				"content-type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			};
			if (isStream) {
				headers.accept = "text/event-stream";
			}

			return headers;
		},
	);
}
