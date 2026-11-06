// @threed/http 入口：pnpm http:serve（默认 127.0.0.1:8787；骨架级，不承诺生产化——FR-019）
import { startServer } from './server.js';
import { disposeExecutor } from './render-executor.js';

const port = Number(process.env.PORT ?? 8787);
const server = startServer(port);
console.log(`@threed/http listening on http://127.0.0.1:${port} (health: GET /health, render: POST /render)`);

async function shutdown(): Promise<void> {
  await disposeExecutor();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
