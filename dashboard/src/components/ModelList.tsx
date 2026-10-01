import { For, Show } from "solid-js";
import { formatContext, formatMultiplier, type ModelInfo } from "../api";

export function ModelList(props: { models: ModelInfo[]; query: string }) {
	const visible = () => {
		const query = props.query.trim().toLowerCase();
		if (!query) return props.models;
		return props.models.filter((model) => [model.id, model.display_name, model.owned_by, model.plan].some((value) => value?.toLowerCase().includes(query)));
	};

	return (
		<Show when={visible().length > 0} fallback={<p class="state">Nenhum modelo encontrado.</p>}>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Modelo</th>
							<th>Contexto</th>
							<th>Custo</th>
							<th>Plano</th>
						</tr>
					</thead>
					<tbody>
						<For each={visible()}>
							{(model) => (
								<tr>
									<td>
										<strong>{model.display_name || model.id}</strong>
										<small>{model.id}</small>
									</td>
									<td>{formatContext(model.context_window)}</td>
									<td>{formatMultiplier(model.multiplier)}</td>
									<td>{model.plan || "—"}</td>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</div>
		</Show>
	);
}
