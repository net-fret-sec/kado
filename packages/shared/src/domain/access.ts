export interface AdminAccess {
  exchangeId: string

  passwordHash: string
  passwordAlgo: 'argon2id'

  createdAt: string
  updatedAt: string
}

export interface ParticipantAccess {
  id: string

  exchangeId: string
  participantId: string

  tokenHash: string
  tokenPreview: string

  status: 'active' | 'revoked'

  createdAt: string
  revokedAt?: string
  lastAccessedAt?: string
}
