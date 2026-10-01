import { handleCompletion } from "./completion";

export function handleThinkingChatCompletions(req: Request): Promise<Response> {
	return handleCompletion(req, "chat/completions", "thinking");
}

export function handleThinkingResponses(req: Request): Promise<Response> {
	return handleCompletion(req, "responses", "thinking");
}
