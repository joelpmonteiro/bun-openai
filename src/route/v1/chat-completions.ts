import { handleCompletion } from "./completion";

export function handlePostChatCompletions(req: Request): Promise<Response> {
	return handleCompletion(req, "chat/completions");
}
