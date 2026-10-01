import { apiError, authenticate } from "../../middleware/auth";
import { proxyApmix } from "../../openai/api";

export async function handleCompletion(
	req: Request,
	api: "chat/completions" | "responses",
	reasoningMode: "default" | "thinking" = "default",
): Promise<Response> {
	const denied = authenticate(req);
	if (denied) return denied;
	let body: Record<string, unknown>;
	try {
		const parsed: unknown = await req.json();
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
		body = parsed as Record<string, unknown>;
	} catch {
		return apiError(400, "The request body must be a JSON object.", "invalid_json");
	}
	if (typeof body.model !== "string" || !body.model.trim()) return apiError(400, "model is required.", "missing_model");
	if (api === "chat/completions" && (!Array.isArray(body.messages) || body.messages.length === 0)) return apiError(400, "messages must be a non-empty array.", "bad_request");
	if (api === "responses" && typeof body.input !== "string" && !Array.isArray(body.input)) return apiError(400, "input must be a string or an array.", "bad_request");
	if (body.stream !== undefined && typeof body.stream !== "boolean") return apiError(400, "stream must be a boolean.", "bad_request");
	if (reasoningMode === "thinking") {
		if (api === "chat/completions") {
			body = { ...body, reasoning_effort: "high" };
		} else {
			const reasoning = body.reasoning && typeof body.reasoning === "object" && !Array.isArray(body.reasoning)
				? body.reasoning
				: {};
			body = { ...body, reasoning: { ...reasoning, effort: "high" } };
		}
	}
	return proxyApmix(req, api, body);
}
