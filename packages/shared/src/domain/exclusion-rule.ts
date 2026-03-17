export interface ExclusionRule {
  id: string
  exchangeId: string

  giverParticipantId: string
  receiverParticipantId: string

  type: 'manual'

  createdAt: string
}
