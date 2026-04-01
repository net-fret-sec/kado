export interface Participant {
  id: string
  exchangeId: string

  name: string
  email?: string

  // Transition: accept legacy free-text or structured list
  wishlist?: string | {
    title: string
    imageUrl?: string
    icon?: string
    linkUrl?: string
  }[]
  note?: string

  status: 'active' | 'removed'

  createdAt: string
  updatedAt: string
}
