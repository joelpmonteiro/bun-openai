import { getToken, unauthorized } from "../../middleware/auth";
import { isModelAllowed, unsupportedModel } from "../../models";
import { proxyToAnthropic } from "../../proxy";

interface AnthropicMessage {
	role: "user" | "assistant";
	content: string;
}

interface MessagesBody {
	model: string;
	max_tokens: number;
	messages: AnthropicMessage[];
	thinking?: { type?: unknown; budget_tokens?: unknown; display?: unknown };
	output_config?: { effort?: unknown };
	stream?: boolean;
}

const SUPPORTED_OUTPUT_EFFORTS = new Set([
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

function supportsAdaptiveThinking(model: string): boolean {
	return (
		model === "claude-opus-4-7" ||
		model === "claude-opus-4-6" ||
		model === "claude-sonnet-4-6"
	);
}

function withClaudeThinkingDefaults(body: MessagesBody): MessagesBody {
	const effort = body.output_config?.effort;
	const nextBody: MessagesBody = { ...body };

	if (
		typeof effort !== "string" ||
		!SUPPORTED_OUTPUT_EFFORTS.has(effort)
	) {
		nextBody.output_config = { ...nextBody.output_config, effort: "high" };
	}

	if (supportsAdaptiveThinking(body.model)) {
		nextBody.thinking = {
			type: "adaptive",
			display:
				typeof body.thinking?.display === "string"
					? body.thinking.display
					: "omitted",
		};
		return nextBody;
	}

	if (body.thinking?.type === undefined) {
		nextBody.thinking = { type: "enabled", budget_tokens: 4096 };
	}

	return nextBody;
}

export async function handlePostMessages(req: Request): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const version = req.headers.get("anthropic-version");
	if (!version) {
		return Response.json(
			{ error: "anthropic-version header is required" },
			{ status: 400 },
		);
	}

	const rawBody = (await req.json()) as MessagesBody;
	console.log(
		"[anthropic-messages] incoming controls",
		JSON.stringify({
			model: rawBody.model,
			hasThinking: rawBody.thinking !== undefined,
			thinkingType: rawBody.thinking?.type ?? null,
			thinkingBudget: rawBody.thinking?.budget_tokens ?? null,
			thinkingDisplay: rawBody.thinking?.display ?? null,
			hasOutputConfig: rawBody.output_config !== undefined,
			outputEffort: rawBody.output_config?.effort ?? null,
			stream: rawBody.stream ?? false,
		}),
	);
	const body = withClaudeThinkingDefaults(rawBody);

	if (!body.model || !body.max_tokens || !body.messages?.length) {
		return Response.json(
			{ error: "model, max_tokens, and messages are required" },
			{ status: 400 },
		);
	}

	if (!(await isModelAllowed(body.model))) return unsupportedModel(body.model);

	const { stream = false, ...rest } = body;
	const upstream = await proxyToAnthropic("/v1/messages", rest, stream);

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"content-type":
				upstream.headers.get("content-type") ?? "application/json",
		},
	});
}

export async function handleCountTokens(req: Request): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const body = await req.json();
	const upstream = await proxyToAnthropic(
		"/v1/messages/count_tokens",
		body,
		false,
	);

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"content-type":
				upstream.headers.get("content-type") ?? "application/json",
		},
	});
}
