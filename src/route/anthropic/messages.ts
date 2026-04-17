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
	thinking?: { type: string };
	stream?: boolean;
}

export async function handlePostMessages(req: Request): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	console.log("testes de handlerPostMessages");
	const version = req.headers.get("anthropic-version");
	if (!version) {
		return Response.json(
			{ error: "anthropic-version header is required" },
			{ status: 400 },
		);
	}

	const body = (await req.json()) as MessagesBody;

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
	console.log("testes de handleCountTokens");

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
