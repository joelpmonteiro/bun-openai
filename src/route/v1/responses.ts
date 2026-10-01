import { handleCompletion } from "./completion";

export function handlePostResponses(req: Request): Promise<Response> {
	return handleCompletion(req, "responses");
}
