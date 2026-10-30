import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadBuiltHtml, shareMiddleware } from './server/shareHttp';

export default defineConfig({
	plugins: [react(), {
		name: 'planner-share-previews',
		configureServer(server) {
			server.middlewares.use(shareMiddleware(async (url) => server.transformIndexHtml(
				url, await readFile(resolve(server.config.root, 'index.html'), 'utf8'),
			)));
		},
		configurePreviewServer(server) {
			server.middlewares.use(shareMiddleware(loadBuiltHtml));
		},
	}],
	server: {
		port: 3000,
		proxy: {
			'/api': 'http://localhost:3001',
		},
	},
});
