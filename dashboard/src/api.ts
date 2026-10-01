export interface ModelInfo {
	id: string;
	owned_by?: string;
	display_name?: string;
	context_window?: number;
	multiplier?: number;
	plan?: string;
}

export interface AccountUsage {
	object?: string;
	plan?: string;
	allowance?: number;
	used?: number;
	remaining?: number;
	topup_remaining?: number;
	resets_at?: string;
	limits?: {
		daily?: number | null;
		daily_used?: number;
		weekly?: number | null;
		weekly_used?: number;
	};
}

export interface KeyStatus {
	label: string;
	available: boolean;
	cooldown_remaining_ms: number;
}

export interface ProxyStatus {
	status: "ok" | "degraded";
	server: { port: number };
	upstream: { provider: string; base_url: string };
	keys: { configured: number; cooldown_ms: number; entries: KeyStatus[] };
	models: {
		source: "upstream" | "stale" | "public-snapshot";
		count: number;
		cache_ttl_ms: number;
		last_refreshed_at: number | null;
		ids: string[];
	};
}

export interface DashboardData {
	status: ProxyStatus;
	models: ModelInfo[];
	usage: AccountUsage | null;
	usageError: string | null;
}

const KEY = "apmix-dashboard-key";

export function readStoredKey(): string {
	return sessionStorage.getItem(KEY) ?? "";
}

export function storeKey(value: string): void {
	if (value) sessionStorage.setItem(KEY, value);
	else sessionStorage.removeItem(KEY);
}

export async function loadDashboard(apiKey: string): Promise<DashboardData> {
	const headers = { authorization: `Bearer ${apiKey}` };
	const [statusResponse, modelsResponse, usageResponse] = await Promise.all([
		fetch("/v1/status", { headers }),
		fetch("/v1/models", { headers }),
		fetch("/v1/usage", { headers }),
	]);
	if (!statusResponse.ok) throw new Error(await errorMessage(statusResponse));
	if (!modelsResponse.ok) throw new Error(await errorMessage(modelsResponse));

	const status = (await statusResponse.json()) as ProxyStatus;
	const modelsPayload = (await modelsResponse.json()) as { data?: ModelInfo[] };
	const usagePayload = usageResponse.ok ? (await usageResponse.json()) as AccountUsage : null;
	return {
		status,
		models: Array.isArray(modelsPayload.data) ? modelsPayload.data : [],
		usage: usagePayload,
		usageError: usageResponse.ok ? null : await errorMessage(usageResponse),
	};
}

async function errorMessage(response: Response): Promise<string> {
	const payload: unknown = await response.json().catch(() => null);
	if (payload && typeof payload === "object" && "error" in payload) {
		const error = payload.error;
		if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
	}
	return `HTTP ${response.status}`;
}

export function formatWhen(value: number | null): string {
	if (!value) return "sem atualizacao";
	return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

const tokens = new Intl.NumberFormat("pt-BR");

export function formatTokens(value: number | null | undefined): string {
	return typeof value === "number" ? tokens.format(value) : "—";
}

export function formatContext(value: number | null | undefined): string {
	if (typeof value !== "number" || value <= 0) return "—";
	if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`;
	if (value >= 1_000) return `${trim(value / 1_000)}K`;
	return tokens.format(value);
}

export function formatMultiplier(value: number | null | undefined): string {
	return typeof value === "number" ? `${trim(value)}×` : "—";
}

export function formatReset(value: string | undefined): string {
	if (!value) return "sem data";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function trim(value: number): string {
	return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}
