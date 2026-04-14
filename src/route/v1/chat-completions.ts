import { getToken, unauthorized } from "../../middleware/auth";
import { isModelAllowed, unsupportedModel } from "../../models";
import { proxyToOpenAI } from "../../proxy";

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
	stream?: boolean;
}

export async function handlePostChatCompletions(
	req: Request,
): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const body = (await req.json()) as ChatCompletionsBody;

	if (!body.model || !body.messages?.length) {
		return Response.json(
			{ error: "model and messages are required" },
			{ status: 400 },
		);
	}

	if (!isModelAllowed(body.model)) return unsupportedModel(body.model);

	const { stream = false, ...rest } = body;
	const upstream = await proxyToOpenAI("/chat/completions", rest, stream);

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"content-type":
				upstream.headers.get("content-type") ?? "application/json",
		},
	});
}
