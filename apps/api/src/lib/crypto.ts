import crypto from 'node:crypto'

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function generateOpaqueToken(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${derivedKey}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, originalKey] = stored.split(':')
  if (!salt || !originalKey) return false

  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(
    Buffer.from(originalKey, 'hex'),
    Buffer.from(derivedKey, 'hex'),
  )
}
