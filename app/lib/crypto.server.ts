import crypto from "node:crypto";

const ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY;
const HASH_PEPPER = process.env.HASH_PEPPER || "callmemaybe-pepper";

function getKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    // In dev/fake mode, derive a key from the pepper
    return crypto.scryptSync(HASH_PEPPER, "callmemaybe-salt", 32);
  }
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be a 64-character hex string");
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }
  const [ivHex, tagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

export function hashForMatching(value: string): string {
  return crypto
    .createHmac("sha256", HASH_PEPPER)
    .update(value.toLowerCase().trim())
    .digest("hex");
}

export function hashSecret(value: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHmac("sha256", HASH_PEPPER)
    .update(`${salt}:${value}`)
    .digest("hex");
  return `${salt}:${hash}`;
}

export function verifySecretHash(value: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const expected = crypto
    .createHmac("sha256", HASH_PEPPER)
    .update(`${salt}:${value}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
}

export function generateVerificationCode(): string {
  // 6-digit numeric code
  const digits = crypto.randomInt(0, 1000000);
  return digits.toString().padStart(6, "0");
}

export function hashVerificationCode(code: string): string {
  return hashSecret(code);
}

export function verifyCode(code: string, storedHash: string): boolean {
  return verifySecretHash(code, storedHash);
}

export function generatePublicReference(): string {
  // RL-XXXX-XXXX
  const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `RL-${part1}-${part2}`;
}

export function generateIdempotencyKey(
  shopInternalId: string,
  supportCaseId: string,
  callAttemptNumber: number,
  callPlanVersion: number,
): string {
  const canonical = `resolve-line:${shopInternalId}:${supportCaseId}:${callAttemptNumber}:${callPlanVersion}`;
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function redactPhone(phone: string): string {
  if (phone.length < 7) return "***";
  return phone.slice(0, phone.length - 4) + "****";
}

export function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

export function lastFour(phone: string): string {
  return phone.slice(-4);
}

export function sha256Hash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
