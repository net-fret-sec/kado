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
}

const participants = new Map<string, ParticipantRecord>()
const participantAccess = new Map<string, ParticipantAccessRecord>()

export const participantRepository = {
  create(participant: ParticipantRecord) {
    participants.set(participant.id, participant)
    return participant
  },

  findByExchangeId(exchangeId: string) {
    return Array.from(participants.values()).filter(
      (participant) => participant.exchangeId === exchangeId,
    )
  },

  createAccess(record: ParticipantAccessRecord) {
    participantAccess.set(record.id, record)
    return record
  },

  revokeActiveAccessForParticipant(participantId: string) {
    for (const access of participantAccess.values()) {
      if (access.participantId === participantId && access.status === 'active') {
        access.status = 'revoked'
      }
    }
  },
}
