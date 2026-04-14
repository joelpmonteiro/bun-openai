import { ALLOWED_MODELS } from "../../models";

export async function handleGetModels(): Promise<Response> {
	return Response.json({
		object: "list",
		data: ALLOWED_MODELS.map((m) => ({
			id: m.id,
			object: "model",
			created: m.created,
			owned_by: m.owned_by,
		})),
	});
}
