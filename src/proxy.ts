const OPENAI_URL_BASE =
	process.env.OPENAI_URL_BASE ?? "https://api.theclawbay.com/v1";
const CLAUDE_URL_BASE =
	process.env.CLAUDE_URL_BASE ?? "https://api.theclawbay.com/anthropic";
const API_KEY = process.env.THECLAWBAY_API_KEY ?? "";

export async function proxyToOpenAI(
	path: string,
	body: unknown,
	stream: boolean,
): Promise<Response> {
	const url = `${OPENAI_URL_BASE}${path}`;
	const model = (body as Record<string, unknown>).model ?? "unknown";
	console.log(`[proxy] → OpenAI  ${path}  model=${model}  stream=${stream}`);
	const start = performance.now();
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${API_KEY}`,
		},
		body: JSON.stringify({ ...(body as object), stream }),
	});
	const ms = (performance.now() - start).toFixed(0);
	console.log(`[proxy] ← OpenAI  ${path}  status=${response.status}  ${ms}ms`);
	return response;
}

export async function proxyToAnthropic(
	path: string,
	body: unknown,
	stream: boolean,
): Promise<Response> {
	const url = `${CLAUDE_URL_BASE}${path}`;
	const model = (body as Record<string, unknown>).model ?? "unknown";
	console.log(`[proxy] → Anthropic  ${path}  model=${model}  stream=${stream}`);
	const start = performance.now();
	const headers: Record<string, string> = {
		"content-type": "application/json",
		"x-api-key": API_KEY,
		"anthropic-version": "2023-06-01",
	};
	if (stream) {
		headers["accept"] = "text/event-stream";
	}

	console.log("testes de proxyToAnthropic");

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify({ ...(body as object), stream }),
	});
	const ms = (performance.now() - start).toFixed(0);
	console.log(
		`[proxy] ← Anthropic  ${path}  status=${response.status}  ${ms}ms`,
	);
	return response;
}
