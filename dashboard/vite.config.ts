import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
	plugins: [solid({ start: true, diagnostics: true })],
	server: {
		port: 5173,
		proxy: {
			"/v1": "http://127.0.0.1:4500",
		},
	},
	build: {
		target: "esnext",
		assetsInlineLimit: 0,
	},
});
