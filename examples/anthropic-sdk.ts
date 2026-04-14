import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.THECLAWBAY_API_KEY,
  baseURL: "https://api.theclawbay.com/anthropic",
});

const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  messages: [
    {
      role: "user",
      content: "Write a short launch note for a new SaaS feature.",
    },
  ],
});

for (const block of response.content) {
  if (block.type === "thinking") {
    console.log("[Thinking]", block.thinking);
  } else if (block.type === "text") {
    console.log(block.text);
  }
}
