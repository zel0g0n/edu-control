// Ikki bosqichli kirish: TOTP (RFC 6238) — Google Authenticator, Microsoft Authenticator va h.k.
// Brauzerda ham, serverda ham ishlaydi (Web Crypto).

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Yangi maxfiy kalit (160 bit, base32). */
export function newTotpSecret(): string {
  const b = new Uint8Array(20);
  globalThis.crypto.getRandomValues(b);
  return base32Encode(b);
}

export const TOTP_STEP_S = 30;

/** Bitta qadam uchun 6 xonali kod. */
export async function totpCode(secret: string, step: number): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", base32Decode(secret).slice().buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8);
  let x = step;
  for (let i = 7; i >= 0; i--) {
    msg[i] = x & 255;
    x = Math.floor(x / 256);
  }
  const h = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP_STEP_S);

/**
 * Kodni tekshiradi (soat farqi uchun ±1 qadam). Mos kelgan qadam qaytadi:
 * u oxirgi ishlatilgan qadamdan katta bo'lishi kerak (bir kodni ikki marta ishlatib bo'lmaydi).
 */
export async function verifyTotp(secret: string, code: string, nowMs: number, lastStep = -1): Promise<number | null> {
  const c = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = totpStep(nowMs);
  for (const step of [now, now - 1, now + 1]) {
    if (step <= lastStep) continue;
    if ((await totpCode(secret, step)) === c) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string, issuer = "EduControl"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_S}`;
}

/** Zaxira kodlar: telefon yo'qolganda bir martalik (10 ta, "k7m2-9xqp"). */
export function newBackupCodes(n = 10): string[] {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(8 * n);
  globalThis.crypto.getRandomValues(buf);
  return Array.from({ length: n }, (_, i) => {
    const s = Array.from(buf.slice(i * 8, i * 8 + 8), (x) => abc[x % abc.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export const normalizeBackupCode = (c: string) => String(c ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
