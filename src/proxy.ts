import {
	CLAUDE_URL_BASE,
	DEFAULT_CLAUDE_THINKING_DISPLAY,
	DEFAULT_REASONING_EFFORT,
	OPENAI_URL_BASE,
} from "./config";

const API_KEY = process.env.THECLAWBAY_API_KEY ?? "";
const SUPPORTED_REASONING_EFFORTS = new Set([
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);
const DEFAULT_OPENAI_CHAT_MAX_TOKENS = 4096;

interface AnthropicTool {
	name: string;
	description?: string;
	input_schema: object;
}

interface AnthropicMessage {
	role: "user" | "assistant";
	content: string | Array<Record<string, unknown>>;
}

function mapAnthropicStopReason(stopReason: unknown): string | null {
	switch (stopReason) {
		case "end_turn":
		case "stop_sequence":
			return "stop";
		case "max_tokens":
			return "length";
		case "tool_use":
			return "tool_calls";
		default:
			return null;
	}
}

function effectiveReasoningEffort(value: unknown): string {
	return typeof value === "string" && SUPPORTED_REASONING_EFFORTS.has(value)
		? value
		: DEFAULT_REASONING_EFFORT;
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.flatMap((part) => {
				if (
					typeof part === "object" &&
					part !== null &&
					part.type === "text" &&
					typeof part.text === "string"
				) {
					return [part.text];
				}

				return [];
			})
			.join("");
	}
	if (
		typeof content === "object" &&
		content !== null &&
		typeof (content as { text?: unknown }).text === "string"
	) {
		return (content as { text: string }).text;
	}

	return "";
}

function contentToAnthropicBlocks(
	content: unknown,
): Array<Record<string, unknown>> {
	if (typeof content === "string") {
		return content.length > 0 ? [{ type: "text", text: content }] : [];
	}

	if (!Array.isArray(content)) {
		const text = textFromContent(content);
		return text.length > 0 ? [{ type: "text", text }] : [];
	}

	return content.flatMap((part) => {
		if (typeof part !== "object" || part === null) return [];
		if (part.type === "text" && typeof part.text === "string") {
			return [{ type: "text", text: part.text }];
		}

		return [];
	});
}

function parseToolArguments(value: unknown): object {
	if (typeof value === "object" && value !== null) {
		return value as object;
	}

	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (typeof parsed === "object" && parsed !== null) {
				return parsed as object;
			}
		} catch {
			return { input: value };
		}
	}

	return {};
}

function mapOpenAITools(tools: unknown): AnthropicTool[] | undefined {
	if (!Array.isArray(tools)) return undefined;

	const mapped = tools.flatMap((tool) => {
		if (
			typeof tool !== "object" ||
			tool === null ||
			tool.type !== "function" ||
			typeof tool.function !== "object" ||
			tool.function === null ||
			typeof tool.function.name !== "string"
		) {
			return [];
		}

		return [
			{
				name: tool.function.name,
				description:
					typeof tool.function.description === "string"
						? tool.function.description
						: undefined,
				input_schema:
					typeof tool.function.parameters === "object" &&
					tool.function.parameters !== null
						? tool.function.parameters
						: { type: "object", properties: {} },
			},
		];
	});

	return mapped.length > 0 ? mapped : undefined;
}

function mapOpenAIToolChoice(
	toolChoice: unknown,
): { type: "auto" | "none" } | undefined {
	if (toolChoice === "none") return { type: "none" };
	return { type: "auto" };
}

function mapOpenAIChatMessages(messages: unknown): {
	system?: string;
	messages: AnthropicMessage[];
} {
	if (!Array.isArray(messages)) {
		return { messages: [] };
	}

	const systemParts: string[] = [];
	const anthropicMessages: AnthropicMessage[] = [];

	for (const message of messages) {
		if (typeof message !== "object" || message === null) continue;
		const role = (message as { role?: unknown }).role;

		if (role === "system") {
			const text = textFromContent((message as { content?: unknown }).content);
			if (text.length > 0) systemParts.push(text);
			continue;
		}

		if (role === "tool") {
			const toolCallId = (message as { tool_call_id?: unknown }).tool_call_id;
			if (typeof toolCallId !== "string") continue;
			const content = textFromContent((message as { content?: unknown }).content);
			anthropicMessages.push({
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: toolCallId,
						content,
					},
				],
			});
			continue;
		}

		if (role !== "user" && role !== "assistant") continue;

		const blocks = contentToAnthropicBlocks(
			(message as { content?: unknown }).content,
		);

		if (role === "assistant") {
			const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
			if (Array.isArray(toolCalls)) {
				for (const toolCall of toolCalls) {
					if (
						typeof toolCall !== "object" ||
						toolCall === null ||
						typeof toolCall.id !== "string" ||
						typeof toolCall.function !== "object" ||
						toolCall.function === null ||
						typeof toolCall.function.name !== "string"
					) {
						continue;
					}

					blocks.push({
						type: "tool_use",
						id: toolCall.id,
						name: toolCall.function.name,
						input: parseToolArguments(toolCall.function.arguments),
					});
				}
			}
		}

		if (blocks.length === 0) continue;

		anthropicMessages.push({
			role,
			content:
				blocks.length === 1 && blocks[0]?.type === "text"
					? String(blocks[0].text ?? "")
					: blocks,
		});
	}

	return {
		system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
		messages: anthropicMessages,
	};
}

function mapOpenAIChatRequestToAnthropic(
	body: Record<string, unknown>,
): Record<string, unknown> {
	const { system, messages } = mapOpenAIChatMessages(body.messages);
	const reasoning =
		typeof body.reasoning === "object" && body.reasoning !== null
			? (body.reasoning as Record<string, unknown>)
			: null;
	const anthropicBody: Record<string, unknown> = {
		model: body.model,
		messages,
		max_tokens:
			typeof body.max_tokens === "number"
				? body.max_tokens
				: typeof body.max_completion_tokens === "number"
					? body.max_completion_tokens
					: DEFAULT_OPENAI_CHAT_MAX_TOKENS,
		output_config: {
			effort: effectiveReasoningEffort(reasoning?.effort),
		},
	};

	if (system) {
		anthropicBody.system = system;
	}

	const tools = mapOpenAITools(body.tools);
	if (tools) {
		anthropicBody.tools = tools;
		anthropicBody.tool_choice = mapOpenAIToolChoice(body.tool_choice);
	}

	if (isClaudeModel(body.model)) {
		const rawThinking =
			typeof body.thinking === "object" && body.thinking !== null
				? (body.thinking as Record<string, unknown>)
				: null;
		const requestedThinkingType = rawThinking?.type;
		anthropicBody.thinking =
			requestedThinkingType === "disabled"
				? { type: "disabled" }
				: {
					type: "adaptive",
					display:
						typeof rawThinking?.display === "string"
							? rawThinking.display
							: DEFAULT_CLAUDE_THINKING_DISPLAY,
				  };
	}

	return anthropicBody;
}

function buildOpenAIChatCompletionResponse(
	payload: Record<string, unknown>,
	model: string,
): Record<string, unknown> {
	const content = Array.isArray(payload.content) ? payload.content : [];
	const text = content
		.flatMap((block) => {
			const typedBlock =
				typeof block === "object" && block !== null
					? (block as Record<string, unknown>)
					: null;
			if (
				typedBlock?.type === "text" &&
				typeof typedBlock.text === "string"
			) {
				return [typedBlock.text];
			}

			return [];
		})
		.join("");
	const toolCalls = content.flatMap((block) => {
		const typedBlock =
			typeof block === "object" && block !== null
				? (block as Record<string, unknown>)
				: null;
		if (
			typedBlock?.type !== "tool_use" ||
			typeof typedBlock.id !== "string" ||
			typeof typedBlock.name !== "string"
		) {
			return [];
		}

		return [
			{
				id: typedBlock.id,
				type: "function",
				function: {
					name: typedBlock.name,
					arguments: JSON.stringify(typedBlock.input ?? {}),
				},
			},
		];
	});
	const typedUsage =
		typeof payload.usage === "object" && payload.usage !== null
			? (payload.usage as Record<string, unknown>)
			: null;
	const inputTokens =
		typeof typedUsage?.input_tokens === "number" ? typedUsage.input_tokens : 0;
	const outputTokens =
		typeof typedUsage?.output_tokens === "number"
			? typedUsage.output_tokens
			: 0;
	const usage = typedUsage
		? {
				prompt_tokens: inputTokens,
				completion_tokens: outputTokens,
				total_tokens: inputTokens + outputTokens,
			}
		: undefined;

	return {
		id:
			typeof payload.id === "string"
				? payload.id
				: `chatcmpl-${crypto.randomUUID()}`,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [
			{
				index: 0,
				message: {
					role: "assistant",
					content: text.length > 0 ? text : null,
					...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
				},
				finish_reason: mapAnthropicStopReason(payload.stop_reason) ?? "stop",
			},
		],
		...(usage ? { usage } : {}),
	};
}

function createSSEChunk(data: Record<string, unknown>): string {
	return `data: ${JSON.stringify(data)}\n\n`;
}

function adaptAnthropicStreamToOpenAI(
	stream: ReadableStream<Uint8Array>,
	requestedModel: string,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const reader = stream.getReader();
			let buffer = "";
			let messageId = `chatcmpl-${crypto.randomUUID()}`;
			let model = requestedModel;
			const created = Math.floor(Date.now() / 1000);
			const toolCallIndices = new Map<number, number>();
			let nextToolCallIndex = 0;
			let doneSent = false;
			let finishSent = false;

			const enqueue = (chunk: string) => {
				controller.enqueue(encoder.encode(chunk));
			};

			const enqueueDelta = (
				delta: Record<string, unknown>,
				finishReason: string | null = null,
			) => {
				enqueue(
					createSSEChunk({
						id: messageId,
						object: "chat.completion.chunk",
						created,
						model,
						choices: [
							{
								index: 0,
								delta,
								finish_reason: finishReason,
							},
						],
					}),
				);
			};

			const sendDone = () => {
				if (doneSent) return;
				doneSent = true;
				enqueue("data: [DONE]\n\n");
			};

			const handleEvent = (rawEvent: string) => {
				if (!rawEvent.trim()) return;
				let eventType = "message";
				const dataLines: string[] = [];

				for (const line of rawEvent.split(/\r?\n/)) {
					if (line.startsWith("event:")) {
						eventType = line.slice(6).trim();
					} else if (line.startsWith("data:")) {
						dataLines.push(line.slice(5).trimStart());
					}
				}

				if (dataLines.length === 0) return;
				const data = dataLines.join("\n");
				if (data === "[DONE]") {
					sendDone();
					return;
				}

				const payload = JSON.parse(data) as Record<string, unknown>;

				switch (eventType) {
					case "message_start": {
						const message =
							typeof payload.message === "object" && payload.message !== null
								? (payload.message as Record<string, unknown>)
								: null;
						if (typeof message?.id === "string") messageId = message.id;
						if (typeof message?.model === "string") model = message.model;
						enqueueDelta({ role: "assistant" });
						break;
					}
					case "content_block_start": {
						const contentBlock =
							typeof payload.content_block === "object" &&
							payload.content_block !== null
								? (payload.content_block as Record<string, unknown>)
								: null;
						if (
							contentBlock?.type === "tool_use" &&
							typeof payload.index === "number"
						) {
							const toolCallIndex = nextToolCallIndex++;
							toolCallIndices.set(payload.index, toolCallIndex);
							enqueueDelta({
								tool_calls: [
									{
										index: toolCallIndex,
										id:
											typeof contentBlock.id === "string"
												? contentBlock.id
												: `call_${toolCallIndex}`,
										type: "function",
										function: {
											name:
												typeof contentBlock.name === "string"
													? contentBlock.name
													: "tool",
											arguments: "",
										},
									},
								],
							});
						}
						break;
					}
					case "content_block_delta": {
						const delta =
							typeof payload.delta === "object" && payload.delta !== null
								? (payload.delta as Record<string, unknown>)
								: null;
						if (!delta) break;
						if (delta.type === "text_delta" && typeof delta.text === "string") {
							enqueueDelta({ content: delta.text });
							break;
						}
						if (
							delta.type === "input_json_delta" &&
							typeof payload.index === "number"
						) {
							const toolCallIndex = toolCallIndices.get(payload.index);
							if (toolCallIndex !== undefined) {
								enqueueDelta({
									tool_calls: [
										{
											index: toolCallIndex,
											function: {
												arguments:
													typeof delta.partial_json === "string"
														? delta.partial_json
														: "",
											},
										},
									],
								});
							}
						}
						break;
					}
					case "message_delta": {
						const delta =
							typeof payload.delta === "object" && payload.delta !== null
								? (payload.delta as Record<string, unknown>)
								: null;
						const finishReason = delta
							? mapAnthropicStopReason(delta.stop_reason)
							: null;
						if (finishReason !== null) {
							finishSent = true;
							enqueueDelta({}, finishReason);
						}
						break;
					}
					case "message_stop": {
						if (!finishSent) {
							finishSent = true;
							enqueueDelta({}, "stop");
						}
						sendDone();
						break;
					}
				}
			};

			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });

					let delimiterIndex = buffer.indexOf("\n\n");
					while (delimiterIndex !== -1) {
						const rawEvent = buffer.slice(0, delimiterIndex);
						buffer = buffer.slice(delimiterIndex + 2);
						handleEvent(rawEvent);
						delimiterIndex = buffer.indexOf("\n\n");
					}
				}

				buffer += decoder.decode();
				if (buffer.trim().length > 0) {
					handleEvent(buffer);
				}

				if (!finishSent) {
					enqueueDelta({}, "stop");
				}
				sendDone();
				controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
	});
}

export function isClaudeModel(model: unknown): boolean {
	return typeof model === "string" && model.startsWith("claude-");
}

export async function proxyOpenAIChatToAnthropic(
	body: Record<string, unknown>,
	stream: boolean,
): Promise<Response> {
	const anthropicBody = mapOpenAIChatRequestToAnthropic(body);
	const upstream = await proxyToAnthropic("/v1/messages", anthropicBody, stream);

	if (!stream) {
		const payload = (await upstream.json()) as Record<string, unknown>;
		if (!upstream.ok) {
			return Response.json(payload, {
				status: upstream.status,
				headers: {
					"content-type": "application/json",
				},
			});
		}

		return Response.json(
			buildOpenAIChatCompletionResponse(payload, String(body.model)),
			{
				status: upstream.status,
				headers: {
					"content-type": "application/json",
				},
			},
		);
	}

	if (!upstream.body) {
		return new Response(null, {
			status: upstream.status,
			headers: {
				"content-type":
					upstream.headers.get("content-type") ?? "text/event-stream",
			},
		});
	}

	return new Response(
		adaptAnthropicStreamToOpenAI(upstream.body, String(body.model)),
		{
			status: upstream.status,
			headers: {
				"content-type": "text/event-stream",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		},
	);
}

export async function proxyToOpenAI(
	path: string,
	body: unknown,
	stream: boolean,
): Promise<Response> {
	const url = `${OPENAI_URL_BASE}${path}`;
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

export async function proxyToAnthropic(
	path: string,
	body: unknown,
	stream: boolean,
): Promise<Response> {
	const url = `${CLAUDE_URL_BASE}${path}`;
	const requestBody = (body ?? {}) as Record<string, unknown>;
	const payload: Record<string, unknown> = { ...requestBody, stream };
	const headers: Record<string, string> = {
		"content-type": "application/json",
		"x-api-key": API_KEY,
		"anthropic-version": "2023-06-01",
	};
	if (stream) {
		headers["accept"] = "text/event-stream";
	}

	const response = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
	});
	return response;
}
