import { afterAll, describe, expect, test } from "bun:test";

process.env.APMIX_API_KEY = "test-server-key";
process.env.APMIX_API_KEYS = "";
process.env.PROXY_API_KEY = "test-proxy-key";
process.env.APMIX_KEY_COOLDOWN_MS = "30000";

let received: { path: string; auth: string | null; body: Record<string, unknown> } | undefined;
let catalogMode: "ok" | "unavailable" | "denied" | "empty" = "ok";
let catalogRequests = 0;
let streamClosed = false;
const encoder = new TextEncoder();
const streamStart = 'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":""}}]},"finish_reason":null}]}\n\n';
const streamEnd = 'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n';
const responsesStream = 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-test","status":"completed"}}\n\n';

const upstream = Bun.serve({
	port: 0,
	fetch: async (req) => {
		const path = new URL(req.url).pathname;
		if (path === "/v1/models") {
			catalogRequests++;
			if (catalogMode === "empty") return Response.json({ data: [] });
			if (catalogMode !== "ok") return Response.json({ error: { code: catalogMode } }, { status: catalogMode === "denied" ? 401 : 503 });
			const id = req.headers.get("authorization") === "Bearer other-plan" ? "other-plan-model" : "new-model-not-in-snapshot";
			return Response.json({ data: [{ id, owned_by: "provider", context_window: 128000 }] });
		}
		if (path === "/v1/usage") return Response.json({ weighted_tokens: 123 });
		const body = await req.json() as Record<string, unknown>;
		received = { path, auth: req.headers.get("authorization"), body };
		if (body.model === "limited") return Response.json({ error: { message: "Rate limited", code: "rate_limit_exceeded" } }, { status: 429, headers: { "retry-after": "30", "x-apmix-request-id": "req-test" } });
		if (body.stream) {
			if (path.endsWith("responses")) return new Response(responsesStream, { headers: { "content-type": "text/event-stream" } });
			streamClosed = false;
			return new Response(new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(streamStart));
					setTimeout(() => { controller.enqueue(encoder.encode(streamEnd)); streamClosed = true; controller.close(); }, 150);
				},
			}), { headers: { "content-type": "text/event-stream", "x-apmix-request-id": "req-stream" } });
		}
		return Response.json(path.endsWith("responses")
			? { id: "resp-test", object: "response", output: [{ type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}" }] }
			: { id: "chatcmpl-test", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: "{}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
	},
});
process.env.APMIX_BASE_URL = `http://127.0.0.1:${upstream.port}/v1`;
const { routes } = await import("../src/route");
const { getSupportedModels, normalizeModels } = await import("../src/catalog/model-catalog");
const { PUBLIC_MODEL_IDS } = await import("../src/catalog/public-models");
const proxy = Bun.serve({ port: 0, routes });

async function request(path: string, body?: unknown, key = "test-proxy-key"): Promise<Response> {
	return fetch(`http://127.0.0.1:${proxy.port}/v1/${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

afterAll(() => { proxy.stop(true); upstream.stop(true); });

describe("APMix Copilot wire compatibility", () => {
	test("authenticates discovery and inference", async () => {
		expect((await request("models", undefined, "wrong")).status).toBe(401);
		expect((await request("chat/completions", {}, "wrong")).status).toBe(401);
		const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/models`);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ error: { type: "authentication_error" } });
	});
	test("returns structured validation errors", async () => {
		const invalid = await fetch(`http://127.0.0.1:${proxy.port}/v1/chat/completions`, { method: "POST", headers: { authorization: "Bearer test-proxy-key" }, body: "{" });
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toMatchObject({ error: { code: "invalid_json" } });
		expect((await request("chat/completions", { model: "m", messages: [] })).status).toBe(400);
		expect((await request("responses", { model: "m", input: {}, stream: true })).status).toBe(400);
		expect((await request("responses", { model: "m", input: "hello", stream: "true" })).status).toBe(400);
	});
	test("preserves tool history, images, JSON output and explicit reasoning without blocking new models", async () => {
		const body = { model: "new-model", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/image.png" } }] }, { role: "assistant", content: null, tool_calls: [{ id: "call_old", type: "function", function: { name: "read_file", arguments: "{}" } }] }, { role: "tool", tool_call_id: "call_old", content: "contents" }], tools: [{ type: "function", function: { name: "read_file", parameters: { type: "object" } } }], tool_choice: "auto", response_format: { type: "json_object" }, reasoning_effort: "high" };
		const response = await request("chat/completions", body);
		expect(response.status).toBe(200);
		expect(received).toEqual({ path: "/v1/chat/completions", auth: "Bearer test-server-key", body });
		const result = await response.json();
		expect(result).toMatchObject({ choices: [{ message: { tool_calls: [{ id: "call_1" }] } }], usage: { total_tokens: 15 } });
	});
	test("thinking routes set high reasoning effort for both API formats", async () => {
		const chatBody = { model: "thinking-model", messages: [{ role: "user", content: "Think this through" }], reasoning_effort: "low" };
		expect((await request("thinking/chat/completions", chatBody)).status).toBe(200);
		expect(received?.path).toBe("/v1/chat/completions");
		expect(received?.body).toEqual({ ...chatBody, reasoning_effort: "high" });

		const responsesBody = { model: "thinking-model", input: "Think this through", reasoning: { effort: "low", summary: "auto" } };
		expect((await request("thinking/responses", responsesBody)).status).toBe(200);
		expect(received?.path).toBe("/v1/responses");
		expect(received?.body).toEqual({ ...responsesBody, reasoning: { effort: "high", summary: "auto" } });
	});
	test("forwards Responses array input, tools and instructions", async () => {
		const body = { model: "openai/new-model", input: [{ type: "function_call_output", call_id: "call_1", output: "done" }], instructions: "Be concise", tools: [{ type: "function", name: "read_file", parameters: { type: "object" } }], reasoning: { effort: "high" } };
		const response = await request("responses", body);
		expect(received?.body).toEqual(body);
		expect(received?.path).toBe("/v1/responses");
		expect(await response.json()).toMatchObject({ output: [{ type: "function_call" }] });
	});
	test("streams tool deltas and DONE before buffering the whole response", async () => {
		const response = await request("chat/completions", { model: "m", messages: [{ role: "user", content: "hello" }], stream: true });
		expect(response.headers.get("content-type")).toBe("text/event-stream");
		expect(response.headers.get("x-apmix-request-id")).toBe("req-stream");
		const reader = response.body!.getReader();
		const first = await reader.read();
		expect(streamClosed).toBe(false);
		let output = new TextDecoder().decode(first.value);
		for (;;) { const chunk = await reader.read(); if (chunk.done) break; output += new TextDecoder().decode(chunk.value); }
		expect(output).toBe(streamStart + streamEnd);
	});
	test("lists the complete public snapshot and preserves plan metadata with per-key caching", async () => {
		expect(PUBLIC_MODEL_IDS.length).toBe(45);
		expect(new Set(PUBLIC_MODEL_IDS).size).toBe(45);
		expect((await getSupportedModels(null)).source).toBe("public-snapshot");
		const response = await request("models");
		expect(response.headers.get("x-model-catalog-source")).toBe("upstream");
		const payload = await response.json();
		expect(payload).toMatchObject({ data: [{ context_window: 128000, object: "model" }] });
		const count = catalogRequests;
		await request("models");
		expect(catalogRequests).toBe(count);
		expect((await getSupportedModels("other-plan")).models[0]?.id).toBe("other-plan-model");
		expect(normalizeModels({ data: [null, {}, { id: "m" }, { id: "m" }] })).toHaveLength(1);
	});
	test("preserves named Responses SSE events", async () => {
		const response = await request("responses", { model: "m", input: "hello", stream: true });
		expect(response.headers.get("content-type")).toBe("text/event-stream");
		expect(await response.text()).toBe(responsesStream);
	});
	test("does not replace an empty authorized catalog with public models", async () => {
		catalogMode = "empty";
		const catalog = await getSupportedModels("empty-plan", true);
		expect(catalog.source).toBe("upstream");
		expect(catalog.models).toEqual([]);
		catalogMode = "ok";
	});
	test("keeps the successful catalog on outage and exposes authentication errors", async () => {
		catalogMode = "unavailable";
		expect((await getSupportedModels("test-server-key", true)).source).toBe("stale");
		expect((await getSupportedModels("uncached-plan", true)).source).toBe("public-snapshot");
		catalogMode = "denied";
		expect((await getSupportedModels("test-server-key", true)).error?.status).toBe(401);
		catalogMode = "ok";
	});
	test("gets usage from APMix", async () => {
		expect(await (await request("usage")).json()).toEqual({ weighted_tokens: 123 });
	});
	test("preserves upstream errors and cooldown without retrying inference", async () => {
		const response = await request("chat/completions", { model: "limited", messages: [{ role: "user", content: "hello" }] });
		expect(response.status).toBe(429);
		expect(response.headers.get("retry-after")).toBe("30");
		expect(await response.json()).toMatchObject({ error: { code: "rate_limit_exceeded" } });
		expect((await request("responses", { model: "m", input: "hello" })).status).toBe(503);
	});
});
