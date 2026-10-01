import { serve } from "bun";
import { HOST, PORT } from "./src/config/config";
import { routes } from "./src/route/";

serve({
	port: PORT,
	hostname: HOST,
	routes: routes,
	idleTimeout:255
});

console.log(`APMix proxy listening at http://${HOST}:${PORT}/v1`);
