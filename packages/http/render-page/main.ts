// 无头渲染页（由 vite 打包为静态产物，Playwright 经 file:// 加载）
// 契约：window.__render(doc, {width,height,format}) → dataURL；每请求独立 runtime 并 dispose。
import { createRuntime, type SceneDocument } from '@threed/core';

declare global {
  interface Window {
    __render(doc: SceneDocument, opts: { width: number; height: number; format: 'png' | 'jpeg' }): Promise<string>;
  }
}

window.__render = async (doc, opts) => {
  const rt = createRuntime({ width: opts.width, height: opts.height });
  try {
    rt.scene.deserialize(doc);
    rt.start();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return rt.escape.renderer().domElement.toDataURL(opts.format === 'jpeg' ? 'image/jpeg' : 'image/png');
  } finally {
    rt.dispose();
  }
};
