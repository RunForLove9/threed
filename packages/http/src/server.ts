// T044：node:http 零框架服务（contracts/http-api.md）
// /health + /render（结构化错误 / 5MiB 上限 / 30s 超时 / X-Threed-Version）。
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { CORE_VERSION, CURRENT_SCHEMA_VERSION, deserializeIntoGraph, SceneGraph, registerBuiltinComponents } from '@threed/core';
import { renderScene } from './render-executor.js';

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MiB
const RENDER_TIMEOUT_MS = 30_000; // v1 不承诺性能指标，但必有上限（契约 §2.3）

interface HttpErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'X-Threed-Version': CORE_VERSION });
  res.end(text);
}

function sendError(res: ServerResponse, status: number, code: string, message: string, details?: Record<string, unknown>): void {
  const body: HttpErrorBody = { error: details ? { code, message, details } : { code, message } };
  if (!res.headersSent) sendJson(res, status, body);
  else res.end();
}

async function readBody(req: IncomingMessage, res: ServerResponse): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  let oversize = false;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      oversize = true;
      continue; // 排空剩余请求体后再回包（提前断开会触发客户端 ECONNRESET / 服务端 socket 异常）
    }
    if (!oversize) chunks.push(chunk as Buffer);
  }
  if (oversize) {
    sendError(res, 413, 'E_PAYLOAD_TOO_LARGE', `请求体超过上限 ${MAX_BODY_BYTES} 字节`);
    return null;
  }
  return Buffer.concat(chunks);
}

/** 校验场景文档（不构建场景——校验复用 serializer 的纯校验段：临时图上反序列化，失败即 400）。 */
function validateDocument(raw: unknown): { ok: true } | { ok: false; code: string; message: string; details?: Record<string, unknown> } {
  const g = new SceneGraph();
  registerBuiltinComponents(g.registry);
  try {
    deserializeIntoGraph(g, raw);
    return { ok: true };
  } catch (e) {
    const te = e as { code?: string; message?: string; details?: Record<string, unknown> };
    return { ok: false, code: te.code ?? 'E_DOC_MALFORMED', message: te.message ?? '文档校验失败', details: te.details };
  }
}

export function startServer(port = Number(process.env.PORT ?? 8787), host = '127.0.0.1'): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    req.on('error', () => undefined); // 请求流异常：静默并由 fetch 端感知，不进未处理异常
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, version: CORE_VERSION, schemaVersion: CURRENT_SCHEMA_VERSION });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/render') {
      const body = await readBody(req, res);
      if (!body) return; // 413 已回

      let doc: unknown;
      try {
        doc = JSON.parse(body.toString('utf8'));
      } catch {
        sendError(res, 400, 'E_DOC_MALFORMED', '请求体不是合法 JSON');
        return;
      }
      const validated = validateDocument(doc);
      if (!validated.ok) {
        sendError(res, 400, validated.code, validated.message, validated.details);
        return;
      }

      const width = Number(url.searchParams.get('width') ?? 800);
      const height = Number(url.searchParams.get('height') ?? 600);
      const format = url.searchParams.get('format') === 'jpeg' ? 'jpeg' : 'png';

      const timeout = setTimeout(() => {
        sendError(res, 500, 'E_RENDER_FAILED', `渲染超时（上限 ${RENDER_TIMEOUT_MS / 1000}s）`);
      }, RENDER_TIMEOUT_MS);
      try {
        const { buffer, contentType } = await renderScene(doc as never, {
          width: Number.isInteger(width) ? width : undefined,
          height: Number.isInteger(height) ? height : undefined,
          format,
        });
        clearTimeout(timeout);
        res.writeHead(200, { 'Content-Type': contentType, 'X-Threed-Version': CORE_VERSION });
        res.end(buffer);
      } catch (e) {
        clearTimeout(timeout);
        if (!res.headersSent) sendError(res, 500, 'E_RENDER_FAILED', (e as Error).message?.slice(0, 200) ?? '渲染失败');
        else res.end();
      }
      return;
    }

    sendError(res, 404, 'E_DOC_MALFORMED', `未知路由: ${req.method} ${url.pathname}`);
  });

  server.listen(port, host);
  // 连接级异常兜底：单连接故障不拖垮服务（spec 边界场景：服务保持存活）
  server.on('clientError', (_err, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
  return server;
}
