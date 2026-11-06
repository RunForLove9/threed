// T016：显式 three 逃生舱（FR-012 / contracts/sdk-api §5）
// ⚠ 逃生舱是公共 API 中唯一暴露 three 类型的地方；返回对象不承诺跨 three 版本兼容。
// v1 所有权语义：仅"借用视图"（renderer 归运行时所有，dispose 时照常释放）；不发生所有权转移。
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';

export interface EscapeHatch {
  /** three 模块本体（内核版本与运行时一致，由 catalog 锁定）。⚠ 不承诺跨版本兼容。 */
  readonly THREE: typeof THREE;
  /** 运行时渲染器（借用视图，非所有权转移；runtime.dispose 仍会释放它）。⚠ 不承诺跨版本兼容。 */
  renderer(): WebGLRenderer;
}

export function createEscape(renderer: WebGLRenderer): EscapeHatch {
  return Object.freeze({
    THREE,
    renderer: () => renderer,
  });
}
