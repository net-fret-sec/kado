export type ParticipantStatus = 'active' | 'removed'

export interface ParticipantDto {
  id: string
  exchangeId: string
  name: string
  email?: string
  wishlist?: string
  note?: string
  status: ParticipantStatus
  createdAt: string
  updatedAt: string
}

export interface CreateParticipantInputDto {
  name: string
  email?: string
  wishlist?: string
  note?: string
}

export interface CreateParticipantResultDto {
  participant: ParticipantDto
  accessLink: string
}
