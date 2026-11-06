// T053：性能基线页——标准测试场景连续渲染，采样四项度量
import { createRuntime, type Runtime, type MetricsSnapshot } from '@threed/core';
import standardScene from '../../fixtures/standard-scene.json';

declare global {
  interface Window {
    __perf?: () => Promise<MetricsSnapshot>;
  }
}

const rt: Runtime = createRuntime({ parent: document.getElementById('host')!, width: 800, height: 600 });
rt.scene.deserialize(standardScene as never);
rt.start();

window.__perf = async () => {
  await new Promise((r) => setTimeout(r, 2000)); // 预热 + 采样窗口
  return rt.metrics.snapshot();
};
