export interface CreateParticipantInput {
  name: string
  email?: string
  wishlist?: string
  note?: string
}

export interface CreateParticipantResult {
  participant: Participant
  accessLink: string
}

export interface RegenerateParticipantAccessInput {
  participantId: string
  revokeExisting: boolean
}

export interface RegenerateParticipantAccessResult {
  participantId: string
  accessLink: string
}
