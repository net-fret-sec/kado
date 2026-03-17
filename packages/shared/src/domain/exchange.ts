export type ExchangeStatus =
  | 'draft'
  | 'ready'
  | 'drawn'
  | 'archived'

export interface Exchange {
  id: string

  name: string
  description?: string

  status: ExchangeStatus

  eventDate?: string
  budget?: number
  budgetCurrency?: string
  organizerName?: string

  drawAt?: string
  createdAt: string
  updatedAt: string
}
