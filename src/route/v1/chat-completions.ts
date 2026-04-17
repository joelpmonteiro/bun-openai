import { DEFAULT_REASONING_EFFORT } from "../../config";
import { getToken, unauthorized } from "../../middleware/auth";
import { isModelAllowed, unsupportedModel } from "../../models";
import { isClaudeModel, proxyOpenAIChatToAnthropic, proxyToOpenAI } from "../../proxy";

interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

interface ToolDefinition {
	type: "function";
	function: { name: string; description?: string; parameters?: object };
}

interface ChatCompletionsBody {
	model: string;
	messages: ChatMessage[];
	tools?: ToolDefinition[];
	tool_choice?: string;
	reasoning?: { effort?: unknown };
	stream?: boolean;
}

const SUPPORTED_REASONING_EFFORTS = new Set([
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

const EFFECTIVE_DEFAULT_REASONING_EFFORT = SUPPORTED_REASONING_EFFORTS.has(
	DEFAULT_REASONING_EFFORT,
)
	? DEFAULT_REASONING_EFFORT
	: "max";

function withDefaultReasoning(
	body: ChatCompletionsBody,
): ChatCompletionsBody {
	const effort = body.reasoning?.effort;

	if (typeof effort === "string" && SUPPORTED_REASONING_EFFORTS.has(effort)) {
		return body;
	}

	return {
		...body,
		reasoning: { effort: EFFECTIVE_DEFAULT_REASONING_EFFORT },
	};
}

export async function handlePostChatCompletions(
	req: Request,
): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const rawBody = (await req.json()) as ChatCompletionsBody;
	console.log(
		"[chat-completions] incoming controls",
		JSON.stringify({
			model: rawBody.model,
			hasReasoning: rawBody.reasoning !== undefined,
			reasoningEffort: rawBody.reasoning?.effort ?? null,
			stream: rawBody.stream ?? false,
			hasTools: Array.isArray(rawBody.tools) && rawBody.tools.length > 0,
			toolChoice: rawBody.tool_choice ?? null,
		}),
	);
	const body = withDefaultReasoning(rawBody);

	if (!body.model || !body.messages?.length) {
		return Response.json(
			{ error: "model and messages are required" },
			{ status: 400 },
		);
	}

	if (!(await isModelAllowed(body.model))) return unsupportedModel(body.model);

	const { stream = false, ...rest } = body;
	const upstream = isClaudeModel(body.model)
		? await proxyOpenAIChatToAnthropic(rest as Record<string, unknown>, stream)
		: await proxyToOpenAI("/chat/completions", rest, stream);

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"content-type":
				upstream.headers.get("content-type") ??
				(stream ? "text/event-stream" : "application/json"),
		},
	});
}
