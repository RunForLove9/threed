// T045：渲染执行器——进程内单例 Playwright Chromium + 临时静态服务（file:// 下 ES module 被 Chromium 阻止）
// + 每请求独立页面/运行时（状态隔离）。
import { chromium } from 'playwright';
import type { SceneDocument } from '@threed/core';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ThreedError } from '@threed/core';

const RENDER_PAGE_DIR = fileURLToPath(new URL('../render-page-dist', import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

let staticServer: Server | null = null;
let staticBase = '';

function getStaticServer(): Promise<string> {
  if (staticServer) return Promise.resolve(staticBase);
  return new Promise((resolve, reject) => {
    const srv = createServer(async (req, res) => {
      try {
        const path = new URL(req.url ?? '/', 'http://x').pathname;
        const file = join(RENDER_PAGE_DIR, path === '/' ? 'index.html' : path);
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      staticServer = srv;
      staticBase = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
      resolve(staticBase);
    });
    srv.on('error', reject);
  });
}

let browserPromise: Promise<import('playwright').Browser> | null = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], // 与 tests 探针结论一致（research R1）
    });
  }
  return browserPromise;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
}

export async function renderScene(doc: SceneDocument, opts: RenderOptions = {}): Promise<{ buffer: Buffer; contentType: string }> {
  const width = clamp(opts.width ?? 800);
  const height = clamp(opts.height ?? 600);
  const format = opts.format === 'jpeg' ? 'jpeg' : 'png';
  const [browser, base] = await Promise.all([getBrowser(), getStaticServer()]);
  const page = await browser.newPage({ viewport: { width, height } });
  try {
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => typeof (window as unknown as { __render?: unknown }).__render === 'function', null, { timeout: 10_000 });
    const dataUrl = await page.evaluate(
      ([d, o]) => (window as unknown as { __render(d: SceneDocument, o: { width: number; height: number; format: 'png' | 'jpeg' }): Promise<string> }).__render(d as SceneDocument, o as { width: number; height: number; format: 'png' | 'jpeg' }),
      [doc, { width, height, format }] as const,
    );
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return { buffer: Buffer.from(base64, 'base64'), contentType: format === 'jpeg' ? 'image/jpeg' : 'image/png' };
  } finally {
    await page.close(); // 每请求状态隔离（contracts/http-api §2.2）
  }
}

function clamp(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 4096) return 800;
  return n;
}

export async function disposeExecutor(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close().catch(() => {});
    browserPromise = null;
  }
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
}

export { ThreedError };
