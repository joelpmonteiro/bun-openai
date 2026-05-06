export const PORT = Number(process.env.PORT ?? "4500");
export const OPENAI_URL_BASE =
	process.env.OPENAI_URL_BASE ?? "https://api.theclawbay.com/v1";
export const CLAUDE_URL_BASE =
	process.env.CLAUDE_URL_BASE ?? "https://api.theclawbay.com/anthropic";
export const MODELS_CACHE_TTL_MS = Number(
	process.env.THECLAWBAY_MODELS_CACHE_TTL_MS ?? "60000",
);
export const DEFAULT_REASONING_EFFORT =
	process.env.DEFAULT_REASONING_EFFORT ?? "max";
export const DEFAULT_CLAUDE_THINKING_DISPLAY =
	process.env.DEFAULT_CLAUDE_THINKING_DISPLAY ?? "omitted";
