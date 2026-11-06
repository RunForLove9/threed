import { describe, it, expect } from 'vitest';
import { extractExportNames, auditCoverage } from '../../scripts/audit-api-coverage.mjs';
import { readFileSync } from 'node:fs';

// T049：失败 fixture（植入缺口必须报红）→ 仓库实况必须全绿

describe('audit-api-coverage（SC-006）', () => {
  it('extractExportNames 解析 sdk 面具名导出（含 as 别名）', () => {
    const src = `export { createRuntime } from '@threed/core';\nexport { CORE_VERSION as SDK_VERSION } from '@threed/core';\nexport type { Runtime } from '@threed/core';`;
    expect(extractExportNames(src).sort()).toEqual(['SDK_VERSION', 'createRuntime']);
  });

  it('fixture：缺文档/缺测试引用必须被检出（红）', () => {
    const r = auditCoverage({
      exportNames: ['createRuntime', 'defineComponent', 'ThreedError'],
      docsText: '# docs\n- createRuntime: ...\n- ThreedError: ...', // 缺 defineComponent
      testTexts: ['createRuntime used', 'ThreedError used'], // 缺 defineComponent
    });
    expect(r.ok).toBe(false);
    expect(r.missingDocs).toEqual(['defineComponent']);
    expect(r.missingTests).toEqual(['defineComponent']);
  });

  it('仓库实况：全部公共值导出有文档与测试引用（绿）', () => {
    const sdkSource = readFileSync('packages/sdk/src/index.ts', 'utf8');
    const exportNames = extractExportNames(sdkSource);
    expect(exportNames.length).toBeGreaterThanOrEqual(8);
    const docsText = readFileSync('docs/api/README.md', 'utf8');
    const testTexts = [
      readFileSync('packages/sdk/test/exports.test.ts', 'utf8'),
      readFileSync('tests/unit/audit-api-coverage.test.ts', 'utf8'),
    ];
    const r = auditCoverage({ exportNames, docsText, testTexts });
    expect(r.ok, `missingDocs=${r.missingDocs} missingTests=${r.missingTests}`).toBe(true);
  });
});
