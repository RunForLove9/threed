// 测试页面服务器：Playwright webServer 用；将 workspace 包别名到源码（免构建直测 src）
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./pages', import.meta.url)),
  server: {
    fs: {
      // 允许引用仓库根的 fixtures（如 standard-scene.json）
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
    },
  },
  resolve: {
    alias: {
      '@threed/core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
      '@threed/sdk': fileURLToPath(new URL('../packages/sdk/src/index.ts', import.meta.url)),
    },
  },
});
