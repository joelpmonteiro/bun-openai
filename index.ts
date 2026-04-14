import { serve } from "bun";
import { routes } from "./src/route/";

serve({
	port: 3000,
	routes: routes,
});

console.log(`Server Bun ${3000}`);
