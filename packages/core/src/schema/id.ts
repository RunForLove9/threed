// 实例 ID 生成与校验（research R6 / FR-020）
// 系统 ID：'i' + 11 位 base36（Web Crypto，无额外依赖）；显式 ID：用户指定、禁用系统形态。
import { ThreedError } from '../errors';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'; // 36
const SYSTEM_RE = /^i[A-Za-z0-9]{11}$/;
const EXPLICIT_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function isSystemId(id: string): boolean {
  return SYSTEM_RE.test(id);
}

/** 生成系统 ID（i + 11 位 base36，拒绝采样保证均匀）。 */
export function generateSystemId(): string {
  const limit = 256 - (256 % ALPHABET.length); // 252：拒绝高位避免取模偏差
  let out = 'i';
  const buf = new Uint8Array(64);
  crypto.getRandomValues(buf);
  let p = 0;
  while (out.length < 12) {
    if (p >= buf.length) {
      crypto.getRandomValues(buf);
      p = 0;
    }
    const b = buf[p++]!;
    if (b < limit) out += ALPHABET[b % ALPHABET.length];
  }
  return out;
}

/** 校验显式指定 ID；非法抛 E_ID_INVALID（含系统形态伪装拒绝）。 */
export function validateExplicitId(id: string): void {
  if (!EXPLICIT_RE.test(id) || SYSTEM_RE.test(id)) {
    throw new ThreedError('E_ID_INVALID', `非法的显式实例 ID: "${id}"`, { id });
  }
}

/** 断言 ID 在文档内唯一；冲突抛 E_ID_CONFLICT。 */
export function assertUniqueId(id: string, existing: ReadonlySet<string>): void {
  if (existing.has(id)) {
    throw new ThreedError('E_ID_CONFLICT', `实例 ID 已存在: "${id}"`, { id });
  }
}
