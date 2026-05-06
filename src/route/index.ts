import { handleGetModels } from "./v1/models";
import { handlePostResponses } from "./v1/responses";
import { handlePostChatCompletions } from "./v1/chat-completions";
import { handleGetQuota } from "./v1/quota";
import { handleGetStatus } from "./v1/status";

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
	"/v1/status": {
		GET: handleGetStatus,
	},
};
