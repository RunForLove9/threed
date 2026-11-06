import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Demo 的 Vite 配置：workspace 包别名到源码（开发态免构建直用 src）
export default defineConfig({
  resolve: {
    alias: {
      '@threed/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@threed/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
    },
  },
});
