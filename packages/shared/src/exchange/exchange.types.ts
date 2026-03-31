export type ExchangeStatus =
  | 'draft'
  | 'ready'
  | 'drawn'
  | 'archived'

export interface ExchangeDto {
  id: string
  name: string
  description?: string
  organizerId: string
  organizerName?: string
  status: ExchangeStatus
  eventDate?: string
  budget?: number
  budgetCurrency?: string
  drawAt?: string
  createdAt: string
  updatedAt: string
}

export interface CreateExchangeInputDto {
  name: string
  description?: string
  organizerName?: string
  organizerParticipates?: boolean
  eventDate?: string
  budget?: number
  budgetCurrency?: string
  adminPassword: string
}

export interface CreateExchangeResultDto {
  exchange: ExchangeDto
  adminSessionToken: string
}
