// T033：schema 版本策略（FR-009）——语义化比较 + 迁移注册表骨架。
import { ThreedError } from '../errors';
import type { SceneDocument } from './document';

export const CURRENT_SCHEMA_VERSION = '1.0.0';

function parseSemver(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new ThreedError('E_DOC_MALFORMED', `非法 schemaVersion: ${v}`, { path: 'schemaVersion' });
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** 版本判定（data-model §4）：MINOR = 加法兼容——同 major 的高 minor 数据可读（未知字段"认识才解释"）；
 *  MAJOR 更高 = 不兼容 → E_SCHEMA_FUTURE。 */
export function assertReadableVersion(docVersion: string, current = CURRENT_SCHEMA_VERSION): void {
  const [dMaj] = parseSemver(docVersion);
  const [cMaj] = parseSemver(current);
  if (dMaj > cMaj) {
    throw new ThreedError('E_SCHEMA_FUTURE', `数据 schema 版本（${docVersion}）高于运行时支持（${current}）`, {
      requiredVersion: docVersion,
    });
  }
}

type Migration = (doc: SceneDocument) => SceneDocument;

/** 迁移器注册表：from 版本 → 升一级的迁移函数（首个真实迁移器随首个格式演进交付——FR-009 骨架）。 */
const migrations = new Map<string, { to: string; migrate: Migration }>();

export function registerMigration(from: string, to: string, migrate: Migration): void {
  migrations.set(from, { to, migrate });
}

/** 按链路应用迁移直到达到 targetVersion；无匹配迁移器时原样返回（已兼容可直接读取）。 */
export function migrateDocument(doc: SceneDocument, targetVersion = CURRENT_SCHEMA_VERSION): SceneDocument {
  let cur = doc;
  let guard = 0;
  while (cur.schemaVersion !== targetVersion && guard++ < 32) {
    const step = migrations.get(cur.schemaVersion);
    if (!step) break; // 无迁移器：交给 assertReadableVersion 判定可读性
    cur = step.migrate(cur);
    cur.schemaVersion = step.to;
  }
  return cur;
}
