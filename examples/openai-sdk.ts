import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.THECLAWBAY_API_KEY,
  baseURL: "https://api.theclawbay.com/v1",
});

const models = await client.models.list();
const model = models.data[0]?.id ?? "gpt-5.4";

const response = await client.responses.create({
  model,
  input: "Write a short launch note for a new SaaS feature.",
  reasoning: { effort: "medium" },
});

console.log(response.output_text);
