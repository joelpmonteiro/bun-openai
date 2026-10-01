import { PORT } from "../src/config/config";
import { getMetadataApiKey } from "../src/config/key-pool";
import { getSupportedModels } from "../src/catalog/model-catalog";

const catalog = await getSupportedModels(getMetadataApiKey());
if (catalog.error) throw new Error(`APMix model discovery failed: HTTP ${catalog.error.status}`);

const endpoint = `http://127.0.0.1:${PORT}/v1/chat/completions`;
const thinkingEndpoint = `http://127.0.0.1:${PORT}/v1/thinking/chat/completions`;
function provider(name: string, modelEndpoint: string, thinking = false) {
	return {
		name,
		vendor: "customendpoint",
		apiKey: "${input:apmixProxyApiKey}",
		apiType: "chat-completions",
		models: catalog.models.map((model) => ({
			id: model.id,
			name: `${typeof model.name === "string" ? model.name : model.id}${thinking ? " (Thinking)" : ""}`,
			url: modelEndpoint,
			// Client settings, not claims about each model's maximum capacity.
			toolCalling: true,
			vision: false,
			streaming: true,
			maxInputTokens: 16384,
			maxOutputTokens: 4096,
		})),
	};
}
const configuration = [
	provider("APMix", endpoint),
	provider("APMix Thinking", thinkingEndpoint, true),
];

const output = "examples/chatLanguageModels.json";
await Bun.write(output, JSON.stringify(configuration, null, 2) + "\n");
console.log(`Exported ${catalog.models.length} models in normal and thinking modes (${catalog.source}) to ${output}`);
