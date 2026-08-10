import crypto from "node:crypto";

function getHashPepper(): string {
  if (process.env.HASH_PEPPER) return process.env.HASH_PEPPER;
  if (process.env.NODE_ENV === "production") {
    throw new Error("HASH_PEPPER is required in production");
  }
  return "callmemaybe-development-pepper";
}

function getEncryptionKeys(): Map<string, Buffer> {
  const currentVersion = process.env.APP_ENCRYPTION_KEY_VERSION || "1";
  const configuredKeys = new Map<string, string>();
  if (process.env.APP_ENCRYPTION_KEY) {
    configuredKeys.set(currentVersion, process.env.APP_ENCRYPTION_KEY);
  }

  if (process.env.APP_PREVIOUS_ENCRYPTION_KEYS_JSON) {
    let previous: unknown;
    try {
      previous = JSON.parse(process.env.APP_PREVIOUS_ENCRYPTION_KEYS_JSON);
    } catch {
      throw new Error("APP_PREVIOUS_ENCRYPTION_KEYS_JSON must be valid JSON");
    }
    if (!previous || typeof previous !== "object" || Array.isArray(previous)) {
      throw new Error(
        "APP_PREVIOUS_ENCRYPTION_KEYS_JSON must be an object of version-to-hex-key entries",
      );
    }
    for (const [version, key] of Object.entries(previous)) {
      if (typeof key !== "string") {
        throw new Error(`Encryption key version ${version} must be a string`);
      }
      configuredKeys.set(version, key);
    }
  }

  if (configuredKeys.size === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_ENCRYPTION_KEY is required in production");
    }
    configuredKeys.set(
      "1",
      crypto
        .scryptSync(getHashPepper(), "callmemaybe-salt", 32)
        .toString("hex"),
    );
  }

  const keys = new Map<string, Buffer>();
  for (const [version, hex] of configuredKeys) {
    const key = Buffer.from(hex, "hex");
    if (!/^\d+$/.test(version) || key.length !== 32 || hex.length !== 64) {
      throw new Error(
        `Encryption key version ${version} must be a 64-character hex string`,
      );
    }
    keys.set(version, key);
  }
  return keys;
}

function currentEncryptionKey(): { version: string; key: Buffer } {
  const version = process.env.APP_ENCRYPTION_KEY_VERSION || "1";
  const key = getEncryptionKeys().get(version);
  if (!key)
    throw new Error(
      `No encryption key is configured for current version ${version}`,
    );
  return { version, key };
}

export function encrypt(plaintext: string): string {
  const { version, key } = currentEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Versioned envelope: v<version>:iv:tag:ciphertext (all binary fields hex).
  return `v${version}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":");
  const versioned = parts[0]?.startsWith("v") && parts.length === 4;
  const version = versioned ? parts[0].slice(1) : "1";
  const payload = versioned ? parts.slice(1) : parts;
  if (payload.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }
  const key = getEncryptionKeys().get(version);
  if (!key)
    throw new Error(
      `No encryption key is available for ciphertext version ${version}`,
    );
  const [ivHex, tagHex, encHex] = payload;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

export function encryptionKeyVersion(ciphertext: string): string {
  const prefix = ciphertext.split(":", 1)[0];
  return prefix.startsWith("v") ? prefix.slice(1) : "1";
}

export function rotateCiphertext(ciphertext: string): string {
  const currentVersion = process.env.APP_ENCRYPTION_KEY_VERSION || "1";
  if (
    encryptionKeyVersion(ciphertext) === currentVersion &&
    ciphertext.startsWith("v")
  ) {
    return ciphertext;
  }
  return encrypt(decrypt(ciphertext));
}

export function hashForMatching(value: string): string {
  return crypto
    .createHmac("sha256", getHashPepper())
    .update(value.toLowerCase().trim())
    .digest("hex");
}

export function hashSecret(value: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHmac("sha256", getHashPepper())
    .update(`${salt}:${value}`)
    .digest("hex");
  return `${salt}:${hash}`;
}

export function verifySecretHash(value: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const expected = crypto
    .createHmac("sha256", getHashPepper())
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
  // CMM-XXXX-XXXX
  const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `CMM-${part1}-${part2}`;
}

export function generateIdempotencyKey(
  shopInternalId: string,
  supportCaseId: string,
  callAttemptNumber: number,
  callPlanVersion: number,
): string {
  const canonical = `callmemaybe:${shopInternalId}:${supportCaseId}:${callAttemptNumber}:${callPlanVersion}`;
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function generateRequestId(): string {
  return crypto.randomUUID();
}

export function generateSecretToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
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

/**
 * Produce the transcript copy that is safe to render in the merchant UI.
 *
 * Transcripts are not persisted in production. This helper is retained for
 * transient redaction and provider-contract tests before the original string is
 * discarded.
 */
export function redactTranscript(
  transcript: string,
  sensitiveValues: Array<string | null | undefined> = [],
): string {
  let redacted = transcript;

  const exactValues = [
    ...new Set(
      sensitiveValues
        .map((value) => value?.trim())
        .filter((value): value is string =>
          Boolean(value && value.length >= 4),
        ),
    ),
  ].sort((a, b) => b.length - a.length);

  for (const value of exactValues) {
    redacted = redacted.replaceAll(value, "[redacted]");
  }

  return redacted
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/(?<!\w)(?:\+?\d[\d().\s-]{7,}\d)(?!\w)/g, (candidate) => {
      const digits = candidate.replace(/\D/g, "");
      if (digits.length >= 13 && digits.length <= 19) {
        return "[payment number redacted]";
      }
      if (digits.length >= 10 && digits.length <= 15) {
        return "[phone redacted]";
      }
      return candidate;
    })
    .replace(
      /\b(?:code|pin|verification code)(\s*(?:is|:)?\s*)\d{4,8}\b/gi,
      (_match, separator) => `verification code${separator}[redacted]`,
    );
}

export function lastFour(phone: string): string {
  return phone.slice(-4);
}

export function sha256Hash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
