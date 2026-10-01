import { authenticate } from "../../middleware/auth";
import { proxyApmix } from "../../openai/api";

export async function handleGetUsage(req: Request): Promise<Response> {
	const denied = authenticate(req);
	return denied ?? proxyApmix(req, "usage");
}
