import { describe, expect, it } from 'vitest'
import { giftSuggestionSchema, updateParticipantInputSchema } from '@kado/shared'

describe('wishlist link validation', () => {
  it.each([
    'h',
    'https:',
    'https://',
    'www.example.com/gift',
    'not a link',
    'https://[',
    'ftp://example.com/gift',
    'javascript:alert(1)',
  ])('rejects %s without throwing', (linkUrl) => {
    expect(giftSuggestionSchema.safeParse({ title: 'Gift', linkUrl }).success).toBe(false)
    expect(
      updateParticipantInputSchema.safeParse({
        wishlist: [{ title: 'Gift', linkUrl }],
      }).success,
    ).toBe(false)
  })
  it.each([undefined, '', '   ', 'http://example.com/gift', 'https://example.com/gift'])(
    'accepts optional or complete HTTP links: %s',
    (linkUrl) => {
      expect(giftSuggestionSchema.safeParse({ title: 'Gift', linkUrl }).success).toBe(true)
    },
  )
  it('validates every intermediate value while typing a complete link', () => {
    const url = 'https://example.com/gift'
    for (let length = 1; length <= url.length; length++) {
      expect(() =>
        giftSuggestionSchema.safeParse({
          title: 'Gift',
          linkUrl: url.slice(0, length),
        }),
      ).not.toThrow()
    }
  })
})
