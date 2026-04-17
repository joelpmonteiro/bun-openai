#!/usr/bin/env bun
/**
 * sync-oai-models.ts
 *
 * Busca os modelos do proxy TheClawBay e gera a config
 * `oaicopilot.models` pronta pra colar no settings.json do VS Code.
 *
 * Uso:
 *   bun run sync-oai-models.ts                          # usa localhost:3000
 *   bun run sync-oai-models.ts http://localhost:4500     # URL custom
 *   bun run sync-oai-models.ts --apply                  # aplica direto no settings.json
 */

const CONTEXT_LENGTHS: Record<string, number> = {
	anthropic: 200000,
	openai: 128000,
};
const DEFAULT_CONTEXT = 128000;
const DEFAULT_MAX_TOKENS = 16000;

interface UpstreamModel {
	id: string;
	owned_by?: string;
	created?: number;
}

interface OAIModel {
	id: string;
	owned_by: string;
	context_length: number;
	max_tokens: number;
}

async function fetchModels(baseUrl: string): Promise<UpstreamModel[]> {
	const res = await fetch(`${baseUrl}/models`);
	if (!res.ok) throw new Error(`GET /models failed: ${res.status}`);
	const json = (await res.json()) as { data?: UpstreamModel[] };
	return json.data ?? [];
}

function toOAIConfig(models: UpstreamModel[]): OAIModel[] {
	return models.map((m) => ({
		id: m.id,
		owned_by: m.owned_by ?? "unknown",
		context_length: CONTEXT_LENGTHS[m.owned_by ?? ""] ?? DEFAULT_CONTEXT,
		max_tokens: DEFAULT_MAX_TOKENS,
	}));
}

async function applyToSettings(models: OAIModel[]): Promise<void> {
	const os = await import("node:os");
	const fs = await import("node:fs");
	const path = await import("node:path");

	const settingsPath = path.join(
		os.homedir(),
		"AppData",
		"Roaming",
		"Code - Insiders",
		"User",
		"settings.json",
	);

	if (!fs.existsSync(settingsPath)) {
		console.error(`❌ settings.json não encontrado em: ${settingsPath}`);
		process.exit(1);
	}

	const raw = fs.readFileSync(settingsPath, "utf-8");
	// Remove comments for JSON parsing (simple // style)
	const cleaned = raw
		.replace(/^\s*\/\/.*$/gm, "")
		.replace(/,(\s*[}\]])/g, "$1");
	const settings = JSON.parse(cleaned);

	settings["oaicopilot.models"] = models;

	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), "utf-8");
	console.log(`✅ settings.json atualizado com ${models.length} modelos`);
	console.log(`📁 ${settingsPath}`);
}

async function main() {
	const args = process.argv.slice(2);
	const apply = args.includes("--apply");
	const urlArg = args.find((a) => !a.startsWith("--"));
	const baseUrl = urlArg ?? "http://localhost:3000/v1";

	console.log(`🔍 Buscando modelos em ${baseUrl}/models ...\n`);

	const upstream = await fetchModels(baseUrl);
	if (upstream.length === 0) {
		console.error("❌ Nenhum modelo encontrado!");
		process.exit(1);
	}

	const models = toOAIConfig(upstream);

	console.log(`✅ ${models.length} modelos encontrados:\n`);
	models.forEach((m) => console.log(`   • ${m.id} (${m.owned_by})`));

	const config = JSON.stringify(models, null, 4);

	if (apply) {
		await applyToSettings(models);
	} else {
		console.log(`\n📋 Cole isso no seu settings.json:\n`);
		console.log(`"oaicopilot.models": ${config}`);
		console.log(`\n💡 Ou rode com --apply pra atualizar automaticamente:`);
		console.log(`   bun run sync-oai-models.ts --apply`);
	}
}

main().catch((err) => {
	console.error("❌ Erro:", err.message);
	process.exit(1);
});
