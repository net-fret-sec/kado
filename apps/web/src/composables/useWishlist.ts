import { ref } from 'vue'
import { giftSuggestionSchema, type GiftSuggestionDto } from '@kado/shared'

export type EditableSuggestion = GiftSuggestionDto & { _clientId: string }
export function serializeWishlist(items: GiftSuggestionDto[]): GiftSuggestionDto[] {
  return items.map(({ title, imageUrl, linkUrl, icon }) => ({ title, imageUrl, linkUrl, icon }))
}
export function isValidSuggestion(item: GiftSuggestionDto) {
  return giftSuggestionSchema.safeParse(item).success
}
export function useWishlist() {
  const wishlist = ref<EditableSuggestion[]>([])
  function withClientId(item: GiftSuggestionDto): EditableSuggestion {
    return { ...item, _clientId: crypto.randomUUID() }
  }
  function hydrate(items: GiftSuggestionDto[] = []) {
    wishlist.value = items.map(withClientId)
  }
  function add() {
    if (wishlist.value.length < 100) wishlist.value.push(withClientId({ title: '' }))
  }
  return { wishlist, withClientId, hydrate, add }
}
