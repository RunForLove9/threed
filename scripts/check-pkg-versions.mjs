#!/usr/bin/env node
// T047 宪法门禁（FR-017）：core/sdk/http 三包版本必须同号（版本统一治理）。
import { readFileSync } from 'node:fs';

export const PACKAGES = ['packages/core/package.json', 'packages/sdk/package.json', 'packages/http/package.json'];

export function assertSameVersions(versionsByName) {
  const versions = new Set(Object.values(versionsByName));
  if (versions.size === 0) throw new Error('未读取到任何包版本');
  if (versions.size > 1) {
    const detail = Object.entries(versionsByName).map(([k, v]) => `${k}=${v}`).join(', ');
    throw new Error(`三包版本漂移: ${detail}——FR-017 要求统一治理（同步升版后重试）`);
  }
  return Object.values(versionsByName)[0];
}

// ---- CLI ----
try {
  const versionsByName = Object.fromEntries(
    PACKAGES.map((p) => {
      const pkg = JSON.parse(readFileSync(p, 'utf8'));
      return [pkg.name, pkg.version];
    }),
  );
  const v = assertSameVersions(versionsByName);
  console.log(`✓ 三包版本统一: ${v}（${Object.keys(versionsByName).join(' / ')}）`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
