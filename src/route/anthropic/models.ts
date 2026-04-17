import { getToken, unauthorized } from "../../middleware/auth";
import { getSupportedModels } from "../../models";

export async function handleGetAnthropicModels(
	req: Request,
): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const catalog = await getSupportedModels();
	const models = catalog.models.filter((model) => model.owned_by === "anthropic");

	return Response.json({
		data: models.map((m) => {
			return {
				id: m.id,
				type: "model",
				display_name: m.id,
				created_at: m.created,
			};
		}),
	});
}
