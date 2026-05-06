import OpenAI from 'openai';

import {
	DEFAULT_REASONING_EFFORT,
	OPENAI_URL_BASE,
} from "../config/config";

const client = new OpenAI({
	apiKey:process.env.OPENAI_API_KEY
})



const API_KEY = process.env.OPENAI_API_KEY ?? "";
const SUPPORTED_REASONING_EFFORTS = new Set([
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);
const DEFAULT_OPENAI_CHAT_MAX_TOKENS = 4096;

function effectiveReasoningEffort(value: unknown): string {
	return typeof value === "string" && SUPPORTED_REASONING_EFFORTS.has(value)
		? value
		: DEFAULT_REASONING_EFFORT;
}

export async function openAI_(
	path: string,
	body: unknown,
	stream: boolean,
): Promise<Response> {
	const url = `https://api.openai.com/v1/${path}`
	const requestBody = (body ?? {}) as Record<string, unknown>;
	const payload: Record<string, unknown> = { ...requestBody, stream };
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${API_KEY}`,
		},
		body: JSON.stringify(payload),
	});
	return response;
}

export {
	client as openAI
}