interface UpstreamKey {
	index: number;
	value: string;
	cooldownUntil: number;
}

const DEFAULT_COOLDOWN_MS = 30_000;
const rawKeys = (process.env.THECLAWBAY_API_KEYS ?? "")
	.split(",")
	.map((key) => key.trim())
	.filter(Boolean);
const legacyKey = (process.env.THECLAWBAY_API_KEY ?? "").trim();
const configuredKeys = rawKeys.length > 0 ? rawKeys : legacyKey ? [legacyKey] : [];

const upstreamKeys: UpstreamKey[] = configuredKeys.map((value, index) => ({
	index,
	value,
	cooldownUntil: 0,
}));

let nextKeyIndex = 0;

function getCooldownMs(): number {
	const parsed = Number(
		process.env.THECLAWBAY_KEY_COOLDOWN_MS ?? DEFAULT_COOLDOWN_MS,
	);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_COOLDOWN_MS;
}

function isAvailable(key: UpstreamKey, now: number): boolean {
	return key.cooldownUntil <= now;
}

export function getKeyCount(): number {
	return upstreamKeys.length;
}

export function getKeyCooldownMs(): number {
	return getCooldownMs();
}

export function getKeyLabel(index: number): string {
	return `key[${index}]`;
}

export function getKeyRotationIndex(): number {
	return nextKeyIndex;
}

export function getMetadataApiKey(): string | null {
	return upstreamKeys[0]?.value ?? null;
}

export function getNextUpstreamKey(excludedIndex?: number): UpstreamKey | null {
	if (upstreamKeys.length === 0) return null;

	const now = Date.now();
	for (let offset = 0; offset < upstreamKeys.length; offset += 1) {
		const candidateIndex = (nextKeyIndex + offset) % upstreamKeys.length;
		const candidate = upstreamKeys[candidateIndex];
		if (!candidate) continue;
		if (candidate.index === excludedIndex) continue;
		if (!isAvailable(candidate, now)) continue;

		nextKeyIndex = (candidateIndex + 1) % upstreamKeys.length;
		return candidate;
	}

	for (let offset = 0; offset < upstreamKeys.length; offset += 1) {
		const candidateIndex = (nextKeyIndex + offset) % upstreamKeys.length;
		const candidate = upstreamKeys[candidateIndex];
		if (!candidate) continue;
		if (candidate.index === excludedIndex) continue;

		nextKeyIndex = (candidateIndex + 1) % upstreamKeys.length;
		return candidate;
	}

	return null;
}

export function markKeyCooldown(index: number): void {
	const key = upstreamKeys[index];
	if (!key) return;

	key.cooldownUntil = Date.now() + getCooldownMs();
}

export function getKeyStatusSnapshot(): Array<{
	label: string;
	available: boolean;
	cooldown_remaining_ms: number;
}> {
	const now = Date.now();

	return upstreamKeys.map((key) => ({
		label: getKeyLabel(key.index),
		available: key.cooldownUntil <= now,
		cooldown_remaining_ms: Math.max(key.cooldownUntil - now, 0),
	}));
}
