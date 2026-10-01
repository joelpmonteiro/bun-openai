import { handleGetModels } from "./v1/models";
import { handlePostResponses } from "./v1/responses";
import { handlePostChatCompletions } from "./v1/chat-completions";
import { handleGetUsage } from "./v1/usage";
import { handleGetStatus } from "./v1/status";
import { handleThinkingChatCompletions, handleThinkingResponses } from "./v1/thinking";

export const routes = {
	// OpenAI-compatible endpoints
	"/v1/models": {
		GET: handleGetModels,
	},
	"/v1/responses": {
		POST: handlePostResponses,
	},
	"/v1/chat/completions": {
		POST: handlePostChatCompletions,
	},
	"/v1/thinking/chat/completions": {
		POST: handleThinkingChatCompletions,
	},
	"/v1/thinking/responses": {
		POST: handleThinkingResponses,
	},
	"/v1/usage": {
		GET: handleGetUsage,
	},
	"/v1/status": {
		GET: handleGetStatus,
	},
};
