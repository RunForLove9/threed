import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 单元 + 契约测试（纯 Node：schema/注册表/错误/ID/值域）。
// 浏览器/渲染/交互测试由根 playwright.config.ts 承担（tests/ 目录）。
export default defineConfig({
  resolve: {
    alias: {
      // 测试态直接指向 workspace 源码（不依赖 dist 构建）
      '@threed/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
});
