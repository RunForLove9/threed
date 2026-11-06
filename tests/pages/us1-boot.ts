// US1 集成测试页：boot 空场景 + 度量 + resize + dispose（由 tests/render/us1-boot.spec.ts 驱动）
import { createRuntime, type Runtime } from '@threed/core';

declare global {
  interface Window {
    __rt?: Runtime;
  }
}

const rt = createRuntime({ parent: document.getElementById('host')!, width: 800, height: 600 });
window.__rt = rt;
rt.start();
