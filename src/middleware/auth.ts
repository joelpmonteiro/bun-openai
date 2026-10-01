import { PROXY_API_KEY } from "../config/config";

export function getToken(req: Request): string | null {
	const auth = req.headers.get("authorization");
	const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1] ?? req.headers.get("x-api-key");
	return token?.trim() || null;
}

export function apiError(status: number, message: string, code: string): Response {
	return Response.json({ error: { message, type: status === 401 ? "authentication_error" : status >= 500 ? "api_error" : "invalid_request_error", param: null, code } }, { status });
}

export function unauthorized(): Response {
	return apiError(401, "A valid API key is required.", "invalid_api_key");
}

export function authenticate(req: Request): Response | null {
	const token = getToken(req);
	return !token || (PROXY_API_KEY && token !== PROXY_API_KEY) ? unauthorized() : null;
}
