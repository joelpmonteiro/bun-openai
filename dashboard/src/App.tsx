import { createSignal, For, onSettled, Show } from "solid-js";
import { formatContext, formatMultiplier, formatReset, formatTokens, formatWhen, loadDashboard, readStoredKey, storeKey, type AccountUsage, type DashboardData } from "./api";
import { ModelList } from "./components/ModelList";
import "./app.css";

export default function App() {
	const [apiKey, setApiKey] = createSignal("");
	const [draft, setDraft] = createSignal("");
	const [query, setQuery] = createSignal("");
	const [data, setData] = createSignal<DashboardData | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [loading, setLoading] = createSignal(false);

	async function refresh(key = apiKey()) {
		if (!key) return;
		setLoading(true);
		setError(null);
		try {
			setData(await loadDashboard(key));
		} catch (cause) {
			setData(null);
			setError(cause instanceof Error ? cause.message : "Falha ao consultar o proxy.");
		} finally {
			setLoading(false);
		}
	}

	function connect(event: SubmitEvent) {
		event.preventDefault();
		const key = draft().trim();
		if (!key) return;
		storeKey(key);
		setApiKey(key);
		setDraft("");
		void refresh(key);
	}

	function disconnect() {
		storeKey("");
		setApiKey("");
		setData(null);
		setError(null);
	}

	onSettled(() => {
		const stored = readStoredKey();
		if (!stored) return;
		setApiKey(stored);
		void refresh(stored);
	});

	return (
		<main class="shell">
			<header class="topbar">
				<div class="brand">
					<span class="mark" aria-hidden="true">A</span>
					<div>
						<h1>APMix</h1>
						<p>Proxy local, catalogo e uso</p>
					</div>
				</div>
				<div class="actions">
					<Show when={data()}>
						{(snapshot) => <span class="stamp">Atualizado {formatWhen(snapshot().status.models.last_refreshed_at)}</span>}
					</Show>
					<button type="button" class="quiet" disabled={!apiKey() || loading()} onClick={() => void refresh()}>
						{loading() ? "Atualizando" : "Atualizar"}
					</button>
					<Show when={apiKey()}>
						<button type="button" class="quiet" onClick={disconnect}>Sair</button>
					</Show>
				</div>
			</header>

			<Show
				when={apiKey()}
				fallback={
					<form class="gate" onSubmit={connect}>
						<div>
							<h2>Conectar ao proxy</h2>
							<p>Use a chave local ou a chave APMix. Ela permanece apenas nesta sessao do navegador.</p>
						</div>
						<label>
							Chave de acesso
							<input type="password" autocomplete="off" value={draft()} onInput={(event) => setDraft(event.currentTarget.value)} />
						</label>
						<button type="submit">Entrar</button>
					</form>
				}
			>
				<Show when={error()}>
					{(message) => <p class="state bad" role="alert">{message()}</p>}
				</Show>
				<Show when={data()}>
					{(snapshot) => (
						<>
							<section class="metrics" aria-label="Resumo">
								<UsageMetrics usage={snapshot().usage} usageError={snapshot().usageError} />
								<article class="metric">
									<span>Catalogo</span>
									<strong>{snapshot().status.models.count}</strong>
									<em>{snapshot().status.models.source}</em>
								</article>
							</section>

							<section class="split">
								<article class="panel">
									<div class="panel-head">
										<div>
											<h2>Plataforma</h2>
											<p>{snapshot().status.upstream.provider} · porta {snapshot().status.server.port}</p>
										</div>
										<span class="badge">{snapshot().status.status}</span>
									</div>
									<Show when={!snapshot().usageError} fallback={<p class="state bad">{snapshot().usageError}</p>}>
										<Allowance usage={snapshot().usage} />
									</Show>
									<h2>Rotacao</h2>
									<div class="keys">
										<For each={snapshot().status.keys.entries}>
											{(key) => (
												<div class="key-row">
													<strong>{key.label}</strong>
													<small>{key.available ? "disponivel" : `${Math.ceil(key.cooldown_remaining_ms / 1000)}s`}</small>
													<i class={`dot ${key.available ? "good" : "warn"}`} />
												</div>
											)}
										</For>
									</div>
								</article>

								<article class="panel">
									<div class="panel-head">
										<div>
											<h2>Modelos</h2>
											<p>Contexto e custo em tokens ponderados</p>
										</div>
										<span class="badge">{snapshot().status.models.source}</span>
									</div>
									<div class="filters">
										<label>
											Filtrar
											<input value={query()} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="nome ou provedor" />
										</label>
									</div>
									<ModelList models={snapshot().models} query={query()} />
								</article>
							</section>
						</>
					)}
				</Show>
			</Show>
		</main>
	);
}

function UsageMetrics(props: { usage: AccountUsage | null; usageError: string | null }) {
	const usage = () => props.usage;
	const usedShare = () => {
		const allowance = usage()?.allowance;
		const used = usage()?.used;
		if (!allowance || typeof used !== "number") return 0;
		return Math.min(100, Math.round((used / allowance) * 100));
	};

	return (
		<>
			<article class="metric">
				<span>Plano</span>
				<strong>{usage()?.plan || "—"}</strong>
				<em>{props.usageError ? "uso indisponivel" : `renova ${formatReset(usage()?.resets_at)}`}</em>
			</article>
			<article class="metric">
				<span>Usado</span>
				<strong>{formatTokens(usage()?.used)}</strong>
				<em>{usedShare()}% da cota</em>
			</article>
			<article class="metric">
				<span>Restante</span>
				<strong>{formatTokens(usage()?.remaining)}</strong>
				<em>de {formatTokens(usage()?.allowance)}</em>
			</article>
		</>
	);
}

function Allowance(props: { usage: AccountUsage | null }) {
	const usage = () => props.usage;
	const width = () => {
		const allowance = usage()?.allowance;
		const used = usage()?.used;
		if (!allowance || typeof used !== "number") return "0%";
		return `${Math.min(100, (used / allowance) * 100)}%`;
	};
	const rows = () => [
		["Cota mensal", formatTokens(usage()?.allowance)],
		["Usado", formatTokens(usage()?.used)],
		["Restante", formatTokens(usage()?.remaining)],
		["Recarga", formatTokens(usage()?.topup_remaining)],
		["Dia", usage()?.limits?.daily == null ? formatTokens(usage()?.limits?.daily_used) : `${formatTokens(usage()?.limits?.daily_used)} / ${formatTokens(usage()?.limits?.daily)}`],
		["Semana", usage()?.limits?.weekly == null ? formatTokens(usage()?.limits?.weekly_used) : `${formatTokens(usage()?.limits?.weekly_used)} / ${formatTokens(usage()?.limits?.weekly)}`],
	];

	return (
		<div class="allowance">
			<div class="meter" aria-hidden="true"><span style={{ width: width() }} /></div>
			<ul class="usage-list">
				<For each={rows()}>
					{(row) => (
						<li>
							<span>{row[0]}</span>
							<strong>{row[1]}</strong>
						</li>
					)}
				</For>
			</ul>
		</div>
	);
}
