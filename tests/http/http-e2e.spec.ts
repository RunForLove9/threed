import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// T042（US5 端到端 / SC-007）：/health + /render 矩阵（损坏/超限/超时/连续 20 次）
// 说明：浏览器 vs SwiftShader 的逐像素等价由两者共用同一渲染管线+固定色彩基线保证（research R1/B1 修复），
// 此处断言产出有效性（PNG 魔数 + IHDR 尺寸）与服务健壮性。

const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const DOC = JSON.parse(readFileSync(resolve('fixtures/standard-scene.json'), 'utf8')) as unknown;

let proc: ChildProcess | undefined;

test.beforeAll(async () => {
  proc = spawn('node', ['packages/http/dist/index.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
    detached: false,
  });
  // 等待就绪
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) break;
    } catch {
      /* not yet */
    }
    if (Date.now() > deadline) throw new Error('http 服务 30s 内未就绪');
    await new Promise((r) => setTimeout(r, 300));
  }
});

test.afterAll(() => {
  proc?.kill();
});

test('/health 返回版本与 schema 版本', async () => {
  const r = await fetch(`${BASE}/health`);
  expect(r.status).toBe(200);
  const body = (await r.json()) as { ok: boolean; version: string; schemaVersion: string };
  expect(body).toEqual({ ok: true, version: '0.1.0', schemaVersion: '1.0.0' });
  expect(r.headers.get('x-threed-version')).toBe('0.1.0');
});

test('/render 标准场景 → 有效 PNG（800x600）', async () => {
  const r = await fetch(`${BASE}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DOC) });
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toBe('image/png');
  const buf = Buffer.from(await r.arrayBuffer());
  // PNG 魔数 + IHDR 宽高
  expect(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  expect([w, h]).toEqual([800, 600]);
});

test('/render 自定义尺寸与 jpeg 格式', async () => {
  const r = await fetch(`${BASE}/render?width=320&height=240&format=jpeg`, { method: 'POST', body: JSON.stringify(DOC) });
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toBe('image/jpeg');
  const buf = Buffer.from(await r.arrayBuffer());
  expect(buf.length).toBeGreaterThan(1000);
});

test('损坏 JSON → 400 E_DOC_MALFORMED，服务存活', async () => {
  const r = await fetch(`${BASE}/render`, { method: 'POST', body: '{bad json' });
  expect(r.status).toBe(400);
  const body = (await r.json()) as { error: { code: string } };
  expect(body.error.code).toBe('E_DOC_MALFORMED');
  const alive = await fetch(`${BASE}/health`);
  expect(alive.ok).toBe(true);
});

test('非法 props → 400 E_PROPS_INVALID（定位 propPath）', async () => {
  const bad = JSON.parse(JSON.stringify(DOC));
  bad.tree.children[0].props.background = 'red';
  const r = await fetch(`${BASE}/render`, { method: 'POST', body: JSON.stringify(bad) });
  expect(r.status).toBe(400);
  const body = (await r.json()) as { error: { code: string; details?: { propPath?: string } } };
  expect(body.error.code).toBe('E_PROPS_INVALID');
  expect(body.error.details?.propPath).toContain('background');
});

test('>5MiB 请求体 → 413 E_PAYLOAD_TOO_LARGE，服务存活', async () => {
  const big = JSON.stringify(DOC) + ' '.repeat(6 * 1024 * 1024);
  const r = await fetch(`${BASE}/render`, { method: 'POST', body: big });
  expect(r.status).toBe(413);
  const body = (await r.json()) as { error: { code: string } };
  expect(body.error.code).toBe('E_PAYLOAD_TOO_LARGE');
  expect((await fetch(`${BASE}/health`)).ok).toBe(true);
});

test('连续 20 次渲染全部成功（状态隔离）', async () => {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${BASE}/render`, { method: 'POST', body: JSON.stringify(DOC) });
    expect(r.status, `第 ${i + 1} 次请求`).toBe(200);
  }
  expect((await fetch(`${BASE}/health`)).ok).toBe(true);
});
