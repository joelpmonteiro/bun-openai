import { authenticate } from "../../middleware/auth";
import { getSupportedModels } from "../../catalog/model-catalog";
import { metadataKey } from "../../openai/api";

export async function handleGetModels(req: Request): Promise<Response> {
	const denied = authenticate(req);
	if (denied) return denied;
	const catalog = await getSupportedModels(metadataKey(req));
	if (catalog.error) return catalog.error;
	return Response.json({ object: "list", data: catalog.models }, {
		headers: { "x-model-catalog-source": catalog.source },
	});
}
