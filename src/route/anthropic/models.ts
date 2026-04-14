import { db } from "../../db";
import { getToken, unauthorized } from "../../middleware/auth";

export async function handleGetAnthropicModels(
	req: Request,
): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const models = db
		.query(
			"SELECT id, name, created FROM models WHERE active = 1 AND owned_by = 'anthropic'",
		)
		.all();

	return Response.json({
		data: models.map((m) => {
			const model = m as { id: string; name: string; created: number };
			return {
				id: model.id,
				type: "model",
				display_name: model.name,
				created_at: model.created,
			};
		}),
	});
}
