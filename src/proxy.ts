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
		const typedPart = part as Record<string, unknown>;
		if (
			(typedPart.type === "text" || typedPart.type === "input_text") &&
			typeof typedPart.text === "string"
		) {
			return [{ type: "text", text: typedPart.text }];
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

function mapOpenAIResponsesInput(input: unknown): {
	system?: string;
	messages: AnthropicMessage[];
} {
	if (typeof input === "string") {
		return {
			messages: input.length > 0 ? [{ role: "user", content: input }] : [],
		};
	}

	if (!Array.isArray(input)) {
		return { messages: [] };
	}

	const systemParts: string[] = [];
	const anthropicMessages: AnthropicMessage[] = [];

	for (const item of input) {
		if (typeof item === "string") {
			if (item.length > 0) {
				anthropicMessages.push({ role: "user", content: item });
			}
			continue;
		}

		if (typeof item !== "object" || item === null) continue;
		const typedItem = item as Record<string, unknown>;
		const role = typedItem.role;
		const content = typedItem.content;

		if (role === "system" || role === "developer") {
			const text = textFromContent(content);
			if (text.length > 0) systemParts.push(text);
			continue;
		}

		if (role === "tool") {
			const toolCallId = typedItem.tool_call_id;
			if (typeof toolCallId !== "string") continue;
			const text = textFromContent(content);
			anthropicMessages.push({
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: toolCallId,
						content: text,
					},
				],
			});
			continue;
		}

		if (role !== "user" && role !== "assistant") continue;

		const blocks = contentToAnthropicBlocks(content);
		if (blocks.length === 0) continue;

		anthropicMessages.push({
			role: role as "user" | "assistant",
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

function mapOpenAIResponsesRequestToAnthropic(
	body: Record<string, unknown>,
): Record<string, unknown> {
	const { system: inputSystem, messages } = mapOpenAIResponsesInput(body.input);
	const instructions = textFromContent(body.instructions);
	const systemParts = [inputSystem, instructions].filter(
		(part): part is string => typeof part === "string" && part.length > 0,
	);
	const reasoning =
		typeof body.reasoning === "object" && body.reasoning !== null
			? (body.reasoning as Record<string, unknown>)
			: null;
	const anthropicBody: Record<string, unknown> = {
		model: body.model,
		messages,
		max_tokens:
			typeof body.max_output_tokens === "number"
				? body.max_output_tokens
				: typeof body.max_tokens === "number"
					? body.max_tokens
					: DEFAULT_OPENAI_CHAT_MAX_TOKENS,
		output_config: {
			effort: effectiveReasoningEffort(reasoning?.effort),
		},
	};

	if (systemParts.length > 0) {
		anthropicBody.system = systemParts.join("\n\n");
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

function buildOpenAIResponsesResponse(
	body: Record<string, unknown>,
	options: {
		responseId?: string;
		status: "in_progress" | "completed" | "incomplete";
		outputText?: string;
		usage?: { inputTokens: number; outputTokens: number } | null;
		completedAt?: number | null;
		incompleteReason?: string | null;
	} = { status: "completed" },
): Record<string, unknown> {
	const createdAt = Math.floor(Date.now() / 1000);
	const responseId = options.responseId ?? `resp_${crypto.randomUUID()}`;
	const reasoning =
		typeof body.reasoning === "object" && body.reasoning !== null
			? (body.reasoning as Record<string, unknown>)
			: null;
	const maxOutputTokens =
		typeof body.max_output_tokens === "number"
			? body.max_output_tokens
			: typeof body.max_tokens === "number"
				? body.max_tokens
				: null;
	const usage =
		options.usage === null || options.usage === undefined
			? null
			: {
				input_tokens: options.usage.inputTokens,
				output_tokens: options.usage.outputTokens,
				total_tokens:
					options.usage.inputTokens + options.usage.outputTokens,
				output_tokens_details: {
					reasoning_tokens: 0,
				},
			};

	return {
		id: responseId,
		object: "response",
		created_at: createdAt,
		status: options.status,
		completed_at:
			options.status === "completed"
				? options.completedAt ?? createdAt
				: null,
		error: null,
		incomplete_details:
			options.status === "incomplete"
				? { reason: options.incompleteReason ?? "max_output_tokens" }
				: null,
		instructions:
			typeof body.instructions === "string" ? body.instructions : null,
		max_output_tokens: maxOutputTokens,
		model: typeof body.model === "string" ? body.model : "unknown",
		output:
			options.status === "in_progress"
				? []
				: [
					{
						id: `msg_${crypto.randomUUID()}`,
						type: "message",
						role: "assistant",
						status:
							options.status === "incomplete" ? "incomplete" : "completed",
						content: [
							{
								type: "output_text",
								text: options.outputText ?? "",
								annotations: [],
							},
						],
					},
				],
		parallel_tool_calls: true,
		previous_response_id:
			typeof body.previous_response_id === "string"
				? body.previous_response_id
				: null,
		reasoning: {
			effort: effectiveReasoningEffort(reasoning?.effort),
			summary: null,
		},
		store: typeof body.store === "boolean" ? body.store : false,
		temperature: typeof body.temperature === "number" ? body.temperature : 1,
		text: {
			format: {
				type: "text",
			},
		},
		tool_choice: body.tool_choice ?? "auto",
		tools: mapOpenAITools(body.tools) ?? [],
		top_p: typeof body.top_p === "number" ? body.top_p : 1,
		truncation:
			typeof body.truncation === "string" ? body.truncation : "disabled",
		usage,
		user: typeof body.user === "string" ? body.user : null,
		metadata:
			typeof body.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata)
				? body.metadata
				: {},
	};
}

function adaptAnthropicResponsesStreamToOpenAI(
	stream: ReadableStream<Uint8Array>,
	requestedBody: Record<string, unknown>,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const reader = stream.getReader();
			let buffer = "";
			let responseId = `resp_${crypto.randomUUID()}`;
			let messageId = `msg_${crypto.randomUUID()}`;
			let model = typeof requestedBody.model === "string" ? requestedBody.model : "unknown";
			const createdAt = Math.floor(Date.now() / 1000);
			let sequenceNumber = 1;
			let started = false;
			let outputItemAdded = false;
			let contentPartAdded = false;
			let text = "";
			let usage: { inputTokens: number; outputTokens: number } | null = null;
			let finalStatus: "completed" | "incomplete" = "completed";
			let incompleteReason: string | null = null;
			const baseResponse = (status: "in_progress" | "completed" | "incomplete") =>
				buildOpenAIResponsesResponse(requestedBody, {
					responseId,
					status,
					outputText: text,
					usage,
					completedAt: createdAt,
					incompleteReason,
				});

			const enqueue = (payload: Record<string, unknown>) => {
				controller.enqueue(encoder.encode(createSSEChunk(payload)));
			};

			const emit = (
				type: string,
				payload: Record<string, unknown> = {},
			) => {
				enqueue({ type, sequence_number: sequenceNumber++, ...payload });
			};

			const ensureStarted = () => {
				if (started) return;
				started = true;
				emit("response.created", { response: baseResponse("in_progress") });
				emit("response.in_progress", { response: baseResponse("in_progress") });
				if (!outputItemAdded) {
					outputItemAdded = true;
					emit("response.output_item.added", {
						output_index: 0,
						item: {
							id: messageId,
							status: "in_progress",
							type: "message",
							role: "assistant",
							content: [],
						},
					});
				}
			};

			const ensureContentPart = () => {
				if (contentPartAdded) return;
				contentPartAdded = true;
				emit("response.content_part.added", {
					item_id: messageId,
					output_index: 0,
					content_index: 0,
					part: {
						type: "output_text",
						text: "",
						annotations: [],
					},
				});
			};

			const finalize = () => {
				ensureStarted();
				ensureContentPart();
				const finalItem = {
					id: messageId,
					status: finalStatus === "incomplete" ? "incomplete" : "completed",
					type: "message",
					role: "assistant",
					content: [
						{
							type: "output_text",
							text,
							annotations: [],
						},
					],
				};

				emit("response.output_text.done", {
					item_id: messageId,
					output_index: 0,
					content_index: 0,
					text,
				});
				emit("response.content_part.done", {
					item_id: messageId,
					output_index: 0,
					content_index: 0,
					part: {
						type: "output_text",
						text,
						annotations: [],
					},
				});
				emit("response.output_item.done", {
					output_index: 0,
					item: finalItem,
				});
				emit(
					finalStatus === "incomplete"
						? "response.incomplete"
						: "response.completed",
					{
						response: buildOpenAIResponsesResponse(requestedBody, {
							responseId,
							status: finalStatus,
							outputText: text,
							usage,
							completedAt: createdAt,
							incompleteReason,
						}),
					},
				);
				enqueue({ type: "done", sequence_number: sequenceNumber++ });
				controller.close();
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
					finalize();
					return;
				}

				const payload = JSON.parse(data) as Record<string, unknown>;
				if (typeof payload.usage === "object" && payload.usage !== null) {
					const typedUsage = payload.usage as Record<string, unknown>;
					usage = {
						inputTokens:
							typeof typedUsage.input_tokens === "number" ? typedUsage.input_tokens : 0,
						outputTokens:
							typeof typedUsage.output_tokens === "number" ? typedUsage.output_tokens : 0,
					};
				}

				switch (eventType) {
					case "message_start": {
						const message =
							typeof payload.message === "object" && payload.message !== null
								? (payload.message as Record<string, unknown>)
								: null;
						if (typeof message?.id === "string") messageId = message.id;
						if (typeof message?.model === "string") model = message.model;
						ensureStarted();
						break;
					}
					case "content_block_start": {
						ensureStarted();
						const contentBlock =
							typeof payload.content_block === "object" &&
							payload.content_block !== null
								? (payload.content_block as Record<string, unknown>)
								: null;
						if (contentBlock?.type === "text") {
							ensureContentPart();
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
							ensureStarted();
							ensureContentPart();
							text += delta.text;
							emit("response.output_text.delta", {
								item_id: messageId,
								output_index: 0,
								content_index: 0,
								delta: delta.text,
							});
						}
						break;
					}
					case "message_delta": {
						const delta =
							typeof payload.delta === "object" && payload.delta !== null
								? (payload.delta as Record<string, unknown>)
								: null;
						const stopReason = delta?.stop_reason;
						if (stopReason === "max_tokens") {
							finalStatus = "incomplete";
							incompleteReason = "max_output_tokens";
						}
						break;
					}
					case "message_stop": {
						finalize();
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

				if (started && sequenceNumber === 1) {
					finalize();
				}
			} catch (error) {
				controller.error(error);
			}
		},
	});
}

export async function proxyOpenAIResponsesToAnthropic(
	body: Record<string, unknown>,
	stream: boolean,
): Promise<Response> {
	const anthropicBody = mapOpenAIResponsesRequestToAnthropic(body);
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

		const typedUsage =
			typeof payload.usage === "object" && payload.usage !== null
				? (payload.usage as Record<string, unknown>)
				: null;
		const outputText = Array.isArray(payload.content)
			? payload.content
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
					.join("")
			: "";

		return Response.json(
			buildOpenAIResponsesResponse(body, {
				responseId: typeof payload.id === "string" ? payload.id : undefined,
				status:
					payload.stop_reason === "max_tokens" ? "incomplete" : "completed",
				outputText,
				usage: typedUsage
					? {
						inputTokens:
							typeof typedUsage.input_tokens === "number"
								? typedUsage.input_tokens
								: 0,
						outputTokens:
							typeof typedUsage.output_tokens === "number"
								? typedUsage.output_tokens
								: 0,
					}
					: null,
				completedAt: Math.floor(Date.now() / 1000),
				incompleteReason:
					payload.stop_reason === "max_tokens" ? "max_output_tokens" : null,
			}),
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
		adaptAnthropicResponsesStreamToOpenAI(upstream.body, body),
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
