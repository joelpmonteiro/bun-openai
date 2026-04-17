import { getToken, unauthorized } from "../../middleware/auth";
import { isModelAllowed, unsupportedModel } from "../../models";
import { proxyToOpenAI } from "../../proxy";

interface ResponsesBody {
	model: string;
	input: string;
	reasoning?: { effort: "low" | "medium" | "high" };
	stream?: boolean;
}

export async function handlePostResponses(req: Request): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const body = (await req.json()) as ResponsesBody;

	if (!body.model || !body.input) {
		return Response.json(
			{ error: "model and input are required" },
			{ status: 400 },
		);
	}

	if (!(await isModelAllowed(body.model))) return unsupportedModel(body.model);

	const { stream = false, ...rest } = body;
	const upstream = await proxyToOpenAI("/responses", rest, stream);

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"content-type":
				upstream.headers.get("content-type") ?? "application/json",
		},
	});
}
