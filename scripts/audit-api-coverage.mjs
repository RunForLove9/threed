#!/usr/bin/env node
// T049（SC-006）：文档-测试覆盖审计——每个公共值导出必须有文档条目 ∧ 至少被一条测试引用。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function extractExportNames(sdkSource) {
  const names = new Set();
  for (const m of sdkSource.matchAll(/^export \{ ([^}]+) \} from/gm)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (n) names.add(n);
    }
  }
  return [...names];
}

function listFiles(dir, ext, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) listFiles(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

export function auditCoverage({ exportNames, docsText, testTexts }) {
  const missingDocs = exportNames.filter((n) => !new RegExp(`\\b${n}\\b`).test(docsText));
  const missingTests = exportNames.filter((n) => !testTexts.some((t) => new RegExp(`\\b${n}\\b`).test(t)));
  return { missingDocs, missingTests, ok: missingDocs.length === 0 && missingTests.length === 0 };
}

// ---- CLI / 仓库实况 ----
try {
  const sdkSource = readFileSync(join(ROOT, 'packages/sdk/src/index.ts'), 'utf8');
  const exportNames = extractExportNames(sdkSource);
  const docsText = readFileSync(join(ROOT, 'docs/api/README.md'), 'utf8');
  const testTexts = [
    ...listFiles(join(ROOT, 'packages/sdk/test'), '.ts'),
    ...listFiles(join(ROOT, 'tests'), '.ts'),
  ].map((p) => readFileSync(p, 'utf8'));
  const { missingDocs, missingTests, ok } = auditCoverage({ exportNames, docsText, testTexts });
  if (!ok) {
    const parts = [];
    if (missingDocs.length) parts.push(`缺文档: ${missingDocs.join(', ')}`);
    if (missingTests.length) parts.push(`缺测试引用: ${missingTests.join(', ')}`);
    console.error(`✗ 公共 API 覆盖审计失败——${parts.join('；')}（SC-006）`);
    process.exit(1);
  }
  console.log(`✓ 公共 API 覆盖审计：${exportNames.length} 个值导出全部有文档与测试引用`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
