import { handleGetModels } from "./v1/models";
import { handlePostResponses } from "./v1/responses";
import { handlePostChatCompletions } from "./v1/chat-completions";
import { handleGetQuota } from "./v1/quota";
import { handleGetAnthropicModels } from "./anthropic/models";
import { handlePostMessages, handleCountTokens } from "./anthropic/messages";

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
	"/v1/quota": {
		GET: handleGetQuota,
	},

	// Anthropic-compatible endpoints
	"/anthropic/v1/models": {
		GET: handleGetAnthropicModels,
	},
	"/anthropic/v1/messages": {
		POST: handlePostMessages,
	},
	"/anthropic/v1/messages/count_tokens": {
		POST: handleCountTokens,
	},
};
