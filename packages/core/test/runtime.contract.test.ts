import { describe, it, expect } from 'vitest';
import { normalizeOptions } from '../src/runtime/options';
import { ResourceTracker } from '../src/runtime/resource-tracker';
import { createMetricsRecorder } from '../src/metrics/metrics';
import { disposedGuard } from '../src/runtime/runtime';

// T011（TDD Red→Green）：运行时契约的纯 Node 侧（渲染集成由 tests/render/us1-boot.spec.ts 承担）

describe('normalizeOptions', () => {
  it('缺省 → 800x600', () => {
    expect(normalizeOptions(undefined)).toMatchObject({ width: 800, height: 600 });
    expect(normalizeOptions({})).toMatchObject({ width: 800, height: 600 });
  });
  it('显式尺寸透传', () => {
    expect(normalizeOptions({ width: 640, height: 480 })).toMatchObject({ width: 640, height: 480 });
  });
  it('非法尺寸拒绝（E_PROPS_INVALID + propPath 定位）', () => {
    for (const bad of [0, -1, NaN, 1.5]) {
      try {
        normalizeOptions({ width: bad as number });
        expect.unreachable(`width=${bad} 应被拒绝`);
      } catch (e) {
        expect((e as { code?: string }).code).toBe('E_PROPS_INVALID');
        expect((e as { details?: { propPath?: string } }).details?.propPath).toBe('width');
      }
    }
  });
});

describe('ResourceTracker（FR-016 资源记账）', () => {
  it('track 登记 + disposeAll 恰好一次调用', () => {
    const t = new ResourceTracker();
    let disposedA = 0;
    let disposedB = 0;
    t.track({ dispose: () => { disposedA++; } });
    t.track({ dispose: () => { disposedB++; } });
    expect(t.size).toBe(2);
    t.disposeAll();
    t.disposeAll(); // 幂等
    expect(disposedA).toBe(1);
    expect(disposedB).toBe(1);
    expect(t.size).toBe(0);
  });
});

describe('MetricsRecorder（FR-003 四项度量）', () => {
  it('fps 由帧间隔推导（≈60fps @16.67ms）', () => {
    const m = createMetricsRecorder();
    let t = 0;
    for (let i = 0; i < 70; i++) { t += 1000 / 60; m.recordFrame(t); }
    const fakeRenderer = { info: { render: { calls: 2, triangles: 120, frame: 70 }, memory: { geometries: 1, textures: 0 } } };
    const snap = m.snapshot(fakeRenderer as never);
    expect(snap.fps).not.toBeNull();
    expect(snap.fps!).toBeGreaterThan(55);
    expect(snap.fps!).toBeLessThan(65);
    expect(snap.drawCalls).toBe(2);
    expect(snap.triangles).toBe(120);
    expect(snap.geometries).toBe(1);
    expect(snap.textures).toBe(0);
    // jsHeapBytes：环境无 performance.memory 时为 null（不伪造——data-model §1.7）
    expect(snap.jsHeapBytes === null || typeof snap.jsHeapBytes === 'number').toBe(true);
  });
  it('首帧前 fps 为 null', () => {
    const m = createMetricsRecorder();
    const fakeRenderer = { info: { render: { calls: 0, triangles: 0, frame: 0 }, memory: { geometries: 0, textures: 0 } } };
    expect(m.snapshot(fakeRenderer as never).fps).toBeNull();
  });
});

describe('disposedGuard（E_RUNTIME_DISPOSED）', () => {
  it('dispose 前通过、dispose 后抛 E_RUNTIME_DISPOSED', () => {
    const g = disposedGuard();
    expect(() => g.check()).not.toThrow();
    g.dispose();
    try {
      g.check();
      expect.unreachable();
    } catch (e) {
      expect((e as { code?: string }).code).toBe('E_RUNTIME_DISPOSED');
    }
  });
});
