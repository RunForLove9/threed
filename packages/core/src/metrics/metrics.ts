// T014：性能度量（FR-003 / data-model §1.7）
// fps：帧间隔 EMA 推导；drawCalls/triangles：renderer.info.render；geometries/textures：renderer.info.memory；
// jsHeapBytes：仅环境提供 performance.memory 时非 null（不伪造）。

export interface MetricsSnapshot {
  fps: number | null;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  jsHeapBytes: number | null;
}

export interface RendererInfoLike {
  info: {
    render: { calls: number; triangles: number; frame: number };
    memory: { geometries: number; textures: number };
  };
}

export interface MetricsRecorder {
  recordFrame(nowMs: number): void;
  snapshot(renderer: RendererInfoLike): MetricsSnapshot;
}

export function createMetricsRecorder(): MetricsRecorder {
  let lastT: number | null = null;
  let emaDt: number | null = null;

  return {
    recordFrame(nowMs: number): void {
      if (lastT !== null) {
        const dt = nowMs - lastT;
        if (dt > 0) emaDt = emaDt === null ? dt : emaDt * 0.9 + dt * 0.1;
      }
      lastT = nowMs;
    },
    snapshot(renderer: RendererInfoLike): MetricsSnapshot {
      const heap = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      return {
        fps: emaDt !== null ? 1000 / emaDt : null,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        jsHeapBytes: heap ? heap.usedJSHeapSize : null,
      };
    },
  };
}
