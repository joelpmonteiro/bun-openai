export function getToken(req: Request): string | null {
	const auth = req.headers.get("authorization");
	if (auth?.startsWith("Bearer ")) return auth.slice(7);

	return req.headers.get("x-api-key");
}

export function unauthorized(): Response {
	return Response.json({ error: "Unauthorized" }, { status: 401 });
}
