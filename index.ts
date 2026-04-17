import { serve } from "bun";
import { PORT } from "./src/config";
import { routes } from "./src/route/";

serve({
	port: PORT,
	routes: routes,
	idleTimeout:255
});

console.log(`Server Bun ${PORT}`);
