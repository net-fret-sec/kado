interface ParticipantRecord {
  id: string
  exchangeId: string
  name: string
  email?: string
  wishlist?: string
  note?: string
  status: 'active' | 'removed'
  createdAt: string
  updatedAt: string
}

interface ParticipantAccessRecord {
  id: string
  exchangeId: string
  participantId: string
  tokenHash: string
  tokenPreview: string
  status: 'active' | 'revoked'
  createdAt: string
  lastAccessedAt?: string
}

const participants = new Map<string, ParticipantRecord>()
const participantAccess = new Map<string, ParticipantAccessRecord>()

export const participantRepository = {
  create(participant: ParticipantRecord) {
    participants.set(participant.id, participant)
    return participant
  },

  findById(participantId: string) {
    return participants.get(participantId)
  },

  findByExchangeId(exchangeId: string) {
    return Array.from(participants.values()).filter(
      (participant) => participant.exchangeId === exchangeId,
    )
  },

  update(participantId: string, updates: Partial<ParticipantRecord>) {
    const participant = participants.get(participantId)
    if (!participant) return null
    const updated = { ...participant, ...updates, updatedAt: new Date().toISOString() }
    participants.set(participantId, updated)
    return updated
  },

  delete(participantId: string) {
    return participants.delete(participantId)
  },

  createAccess(record: ParticipantAccessRecord) {
    participantAccess.set(record.id, record)
    return record
  },

  findActiveAccessByTokenHash(tokenHash: string) {
    for (const access of participantAccess.values()) {
      if (access.tokenHash === tokenHash && access.status === 'active') {
        return access
      }
    }
    return undefined
  },

  touchAccess(accessId: string) {
    const rec = participantAccess.get(accessId)
    if (rec) {
      rec.lastAccessedAt = new Date().toISOString()
      participantAccess.set(accessId, rec)
    }
  },

  revokeActiveAccessForParticipant(participantId: string) {
    for (const access of participantAccess.values()) {
      if (access.participantId === participantId && access.status === 'active') {
        access.status = 'revoked'
      }
    }
  },

  loadTestData(data: {
    participants: ParticipantRecord[]
    participantAccess: ParticipantAccessRecord[]
  }) {
    for (const participant of data.participants) {
      participants.set(participant.id, participant)
    }
    for (const access of data.participantAccess) {
      participantAccess.set(access.id, access)
    }
  },
}
