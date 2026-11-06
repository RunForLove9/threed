// T013：RuntimeOptions 归一化（contracts/sdk-api §1）
import { ThreedError } from '../errors';

export interface RuntimeOptions {
  /** 浏览器画布；缺省时由运行时创建并挂载到 parent（或 document.body） */
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  parent?: HTMLElement;
  width?: number;
  height?: number;
}

export interface NormalizedOptions {
  width: number;
  height: number;
}

const MAX_DIM = 16384;

function positiveDim(v: unknown, name: 'width' | 'height'): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > MAX_DIM) {
    throw new ThreedError('E_PROPS_INVALID', `${name} 必须为 (0, ${MAX_DIM}] 内的整数`, { propPath: name });
  }
  return v;
}

export function normalizeOptions(options?: RuntimeOptions): NormalizedOptions {
  const o = options ?? {};
  return {
    width: positiveDim(o.width ?? 800, 'width'),
    height: positiveDim(o.height ?? 600, 'height'),
  };
}
