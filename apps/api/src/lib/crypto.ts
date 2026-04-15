import crypto from "node:crypto";

const PARTICIPANT_ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PARTICIPANT_ACCESS_CODE_LENGTH = 12;
const PARTICIPANT_ACCESS_CODE_REGEX = /^[A-Z2-9]{12}$/;

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function generateOpaqueToken(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

export function generateParticipantAccessCode(
  length: number = PARTICIPANT_ACCESS_CODE_LENGTH,
): string {
  const bytes = crypto.randomBytes(length);
  let token = "";

  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index];
    token +=
      PARTICIPANT_ACCESS_CODE_ALPHABET[
        byte % PARTICIPANT_ACCESS_CODE_ALPHABET.length
      ];
  }

  return token;
}

export function normalizeParticipantAccessCode(input: string): string {
  const normalized = input.toUpperCase().replace(/[\s-]/g, "");
  if (!PARTICIPANT_ACCESS_CODE_REGEX.test(normalized)) {
    throw new Error("INVALID_PARTICIPANT_ACCESS_CODE");
  }

  return normalized;
}

export function formatParticipantAccessCode(input: string): string {
  const normalized = normalizeParticipantAccessCode(input);
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, originalKey] = stored.split(":");
  if (!salt || !originalKey) return false;

  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(originalKey, "hex"),
    Buffer.from(derivedKey, "hex"),
  );
}
