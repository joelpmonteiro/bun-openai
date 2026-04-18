import { DEFAULT_REASONING_EFFORT } from "../../config";
import { getToken, unauthorized } from "../../middleware/auth";
import { isModelAllowed, unsupportedModel } from "../../models";
import { isClaudeModel, proxyOpenAIResponsesToAnthropic, proxyToOpenAI } from "../../proxy";

interface ResponsesBody {
	model: string;
	input: unknown;
	reasoning?: { effort?: unknown };
	stream?: boolean;
	instructions?: unknown;
	max_output_tokens?: number;
	tools?: unknown[];
	tool_choice?: unknown;
	thinking?: { type?: unknown; display?: unknown };
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

function withDefaultReasoning(body: ResponsesBody): ResponsesBody {
	const effort = body.reasoning?.effort;

	if (typeof effort === "string" && SUPPORTED_REASONING_EFFORTS.has(effort)) {
		return body;
	}

	return {
		...body,
		reasoning: { effort: EFFECTIVE_DEFAULT_REASONING_EFFORT },
	};
}

export async function handlePostResponses(req: Request): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const rawBody = (await req.json()) as ResponsesBody;
	const body = withDefaultReasoning(rawBody);

	if (!body.model || body.input === undefined || body.input === null) {
		return Response.json(
			{ error: "model and input are required" },
			{ status: 400 },
		);
	}

	if (!(await isModelAllowed(body.model))) return unsupportedModel(body.model);

	const { stream = false, ...rest } = body;
	const upstream = isClaudeModel(body.model)
		? await proxyOpenAIResponsesToAnthropic(
			(rest as Record<string, unknown>),
			stream,
		)
		: await proxyToOpenAI("/responses", rest, stream);

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"content-type":
				upstream.headers.get("content-type") ?? "application/json",
		},
	});
}
