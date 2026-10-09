export interface Participant {
  id: string
  exchangeId: string

  name: string
  email?: string

  wishlist?: {
    title: string
    imageId?: string
    linkUrl?: string
  }[]
  note?: string

  status: 'active' | 'removed'

  createdAt: string
  updatedAt: string
}
