/**
 * 출근 체크 시 사내 네트워크 여부를 확인하기 위한 IPv4 CIDR 매칭.
 * allowedCidrs가 비어 있으면 제한하지 않습니다.
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split('/');
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  const ipInt = ipv4ToInt(normalizeIp(ip));
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const size = 2 ** (32 - bits);
  return Math.floor(ipInt / size) === Math.floor(rangeInt / size);
}

export function isAllowedNetwork(ip: string | undefined, allowedCidrs: readonly string[]): boolean {
  if (allowedCidrs.length === 0) return true;
  if (!ip) return false;
  return allowedCidrs.some((cidr) => ipInCidr(ip, cidr));
}
