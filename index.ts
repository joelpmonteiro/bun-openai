import { serve } from "bun";
import { PORT } from "./src/config";
import { routes } from "./src/route/";

serve({
	port: PORT,
	routes: routes,
});

console.log(`Server Bun ${PORT}`);
