import { serve } from "bun";
import { HOST, PORT } from "./src/config/config";
import { routes } from "./src/route/";

const dashboard = `${import.meta.dir}/dashboard/dist/client`;

serve({
	port: PORT,
	hostname: HOST,
	routes: {
		...routes,
		"/": (req) => serveDashboard(req),
		"/assets/*": (req) => serveDashboard(req),
		"/favicon.ico": (req) => serveDashboard(req),
	},
	idleTimeout:255
});

function serveDashboard(req: Request): Response {
	const path = new URL(req.url).pathname;
	const file = path === "/" ? "/index.html" : path;
	const asset = Bun.file(`${dashboard}${file}`);
	if (asset.size === 0) return new Response("Dashboard build not found. Run bun run dashboard:build.", { status: 404 });
	return new Response(asset);
}

console.log(`APMix proxy listening at http://${HOST}:${PORT}/v1`);
