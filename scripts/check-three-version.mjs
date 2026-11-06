#!/usr/bin/env node
// 宪法门禁（FR-001 / 宪法 II）：全仓 three 解析版本必须唯一，且等于 catalog 锁定版本。
// 期望版本从 pnpm-workspace.yaml 读取（单一真源），本脚本不重复声明版本号。
import { readFileSync, existsSync } from 'node:fs';

/** 从 pnpm-lock.yaml 文本中提取全部已解析的 three 版本。
 *  依据 pnpm-lock v9 格式：每个被解析的包在 packages/snaps 段都有 `three@<version>` 键
 *  （catalog 引用亦如此），因此按 `three@x.y.z` 提取即覆盖全仓解析结果；`three@npm:x` 别名亦兼容。
 *  注意：`@types/three@x.y.z` 是类型包，不是渲染内核——必须排除（负向后行断言）。 */
export function extractThreeVersions(lockfileText) {
  const versions = new Set();
  const re = /(?<![\/\w@.-])three@(?:npm:)?(\d+\.\d+\.\d+(?:-[^\s"'`,}]+)?)/g;
  for (const m of lockfileText.matchAll(re)) versions.add(m[1]);
  return versions;
}

/** 断言：恰好一个版本且等于 expected；任何违规抛错（供 CLI 与测试共用）。 */
export function assertSingleThreeVersion(lockfileText, expected) {
  const versions = extractThreeVersions(lockfileText);
  if (versions.size === 0) {
    throw new Error('lockfile 中未发现 three 依赖——请先 pnpm install');
  }
  if (versions.size > 1) {
    throw new Error(
      `检出多个 three 版本: ${[...versions].sort().join(', ')}——违反宪法 II / FR-001（仓库内 MUST NOT 多版本共存）`,
    );
  }
  const [v] = versions;
  if (v !== expected) {
    throw new Error(
      `three 解析版本为 ${v}，catalog 锁定为 ${expected}——升级仅允许改 pnpm-workspace.yaml 并通过全量回归（research.md R2）`,
    );
  }
  return v;
}

/** 从 pnpm-workspace.yaml catalog 段读取 three 的锁定版本（单一真源）。 */
export function readCatalogThreeVersion(workspaceYamlText) {
  const m = workspaceYamlText.match(/^\s*three:\s*"?(\d+\.\d+\.\d+)"?\s*$/m);
  if (!m) throw new Error('pnpm-workspace.yaml catalog 中未找到 three 锁定版本');
  return m[1];
}

// ---- CLI ----
const lockPath = 'pnpm-lock.yaml';
const wsPath = 'pnpm-workspace.yaml';
if (!existsSync(lockPath) || !existsSync(wsPath)) {
  console.error('✗ 需在仓库根运行（缺 pnpm-lock.yaml / pnpm-workspace.yaml）');
  process.exit(1);
}
try {
  const expected = readCatalogThreeVersion(readFileSync(wsPath, 'utf8'));
  const v = assertSingleThreeVersion(readFileSync(lockPath, 'utf8'), expected);
  console.log(`✓ three 唯一解析版本: ${v}（catalog 锁定一致）`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
