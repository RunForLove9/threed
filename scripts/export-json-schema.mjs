#!/usr/bin/env node
// T031：导出 SceneDocument 的 JSON Schema（契约机器可读形态）→ docs/schema/scene-schema.v1.json
// 前置：pnpm build（从 dist 读取，与发布形态一致）。
import { writeFileSync, mkdirSync } from 'node:fs';
import { documentJsonSchema, CURRENT_SCHEMA_VERSION } from '../packages/core/dist/index.js';

mkdirSync('docs/schema', { recursive: true });
const json = JSON.stringify(documentJsonSchema(), null, 2);
const file = `docs/schema/scene-schema.v${CURRENT_SCHEMA_VERSION.split('.').slice(0, 2).join('.')}.json`;
writeFileSync(file, json + '\n');
console.log(`✓ ${file}（schemaVersion ${CURRENT_SCHEMA_VERSION}）`);
