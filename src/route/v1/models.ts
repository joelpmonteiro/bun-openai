import { getSupportedModels } from "../../models";

export async function handleGetModels(): Promise<Response> {
	const catalog = await getSupportedModels();
	return Response.json({
		object: "list",
		data: catalog.models.map((m) => ({
			id: m.id,
			object: "model",
			created: m.created,
			owned_by: m.owned_by,
		})),
	});
}
