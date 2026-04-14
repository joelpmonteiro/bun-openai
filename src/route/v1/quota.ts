import { db } from "../../db";
import { getToken, unauthorized } from "../../middleware/auth";

export async function handleGetQuota(req: Request): Promise<Response> {
	const token = getToken(req);
	if (!token) return unauthorized();

	const url = new URL(req.url);
	const format = url.searchParams.get("format");

	const quota = db
		.query(
			"SELECT five_hour_used, five_hour_limit, weekly_used, weekly_limit FROM quotas WHERE api_key = $key",
		)
		.get({ key: token });

	if (!quota) {
		return Response.json({ error: "Quota not found" }, { status: 404 });
	}

	const q = quota as {
		five_hour_used: number;
		five_hour_limit: number;
		weekly_used: number;
		weekly_limit: number;
	};

	if (format === "legacy_codex") {
		return Response.json({
			used: q.weekly_used,
			limit: q.weekly_limit,
		});
	}

	return Response.json({
		five_hour: {
			used: q.five_hour_used,
			limit: q.five_hour_limit,
			percent: (q.five_hour_used / q.five_hour_limit) * 100,
		},
		weekly: {
			used: q.weekly_used,
			limit: q.weekly_limit,
			percent: (q.weekly_used / q.weekly_limit) * 100,
		},
	});
}
