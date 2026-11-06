import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// 渲染页静态打包（http 服务经 file:// 加载，Playwright 内运行 @threed/core）
export default defineConfig({
  root: fileURLToPath(new URL('./render-page', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('./render-page-dist', import.meta.url)),
    emptyOutDir: true,
  },
});
