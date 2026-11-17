import { describe, expect, it } from 'vitest'
import type { ZodType } from 'zod'
import * as shared from '@kado/shared'

const strings = [
  '',
  ' ',
  '\n',
  'a',
  'abcdefgh',
  'Élodie 🎁',
  '\ud800',
  '\u0000',
  '2026-11-15',
  '2024-02-29',
  '2026-02-29',
  '2026-13-01',
  '2026-01-32',
  '0000-01-01',
  '0001-01-01',
  '9999-12-31',
  '10000-01-01',
  '+275760-09-13',
  '2026-11-15T00:00:00.000Z',
  'not a date',
  'person@example.com',
  'a@',
  '@example.com',
  'https://example.com/gift',
  'http://example.com',
  'www.example.com',
  'https://[',
  'https://%',
  'ftp://example.com',
  'javascript:alert(1)',
  'img_00000000-0000-4000-8000-000000000001',
  '0',
  '-1',
  '.',
  '1e',
  '1e999',
  '1,50',
  ...[150, 151, 200, 201, 256, 257, 2000, 2001, 2048, 2049].map((n) => 'x'.repeat(n)),
  ...['https://example.com/gift', '2026-11-15', 'person@example.com'].flatMap((s) =>
    Array.from({ length: s.length }, (_, i) => s.slice(0, i + 1)),
  ),
]
const samples: unknown[] = [
  ...new Set(strings),
  undefined,
  null,
  true,
  false,
  0,
  -1,
  0.5,
  100,
  101,
  Number.MAX_VALUE,
  NaN,
  Infinity,
  -Infinity,
  [],
  {},
  ['a'],
  { value: 'a' },
  [{ title: 'Gift' }],
  [{ title: '' }],
  [{ title: 'Gift', linkUrl: 'https://' }],
  Array.from({ length: 101 }, () => ({ title: 'Gift' })),
]
const schemas = Object.entries(shared).filter(
  ([name, value]) =>
    name.endsWith('Schema') && value && typeof value === 'object' && 'safeParse' in value,
) as Array<[string, ZodType]>

// Exercise callbacks independently, then inside a valid request body so another
// missing required field cannot mask a throwing custom validator.
describe('form validation must return errors instead of throwing', () => {
  it.each(schemas)('%s handles malformed, partial and cleared input', (name, schema) => {
    const fields = 'shape' in schema ? (schema.shape as Record<string, ZodType>) : {}
    const baseline: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(fields)) {
      const accepted = samples.find((value) => field.safeParse(value).success)
      expect(field.safeParse(accepted).success, `${name}.${key} baseline`).toBe(true)
      baseline[key] = accepted
    }
    if (Object.keys(fields).length) expect(schema.safeParse(baseline).success).toBe(true)
    for (const value of samples) {
      expect(() => schema.safeParse(value), `${name} whole input`).not.toThrow()
      for (const [key, field] of Object.entries(fields)) {
        expect(() => field.safeParse(value), `${name}.${key} field`).not.toThrow()
        expect(
          () => schema.safeParse({ ...baseline, [key]: value }),
          `${name}.${key} body`,
        ).not.toThrow()
      }
    }
  })
  it.each(['eventDate', 'plannedDrawDate'] as const)(
    '%s rejects impossible dates and accepts clearing',
    (field) => {
      for (const value of [
        '2026-02-29',
        '2026-04-31',
        '2026-13-01',
        '0000-01-01',
        '2026-',
        '2026-11-',
      ])
        expect(shared.updateExchangeInputSchema.safeParse({ [field]: value }).success).toBe(false)
      for (const value of ['2024-02-29', '2026-11-15', '', null, undefined])
        expect(shared.updateExchangeInputSchema.safeParse({ [field]: value }).success).toBe(true)
    },
  )
  it('rejects invalid numbers without throwing and preserves valid zeroes', () => {
    for (const value of [NaN, Infinity, -Infinity, -1, '', '1e', '1,50'])
      expect(shared.updateExchangeInputSchema.safeParse({ budget: value }).success).toBe(false)
    for (const value of [0, 0.5, 100])
      expect(shared.updateExchangeInputSchema.safeParse({ budget: value }).success).toBe(true)
    for (const value of [-1, 0.5, 101, '', NaN])
      expect(
        shared.updateExchangeInputSchema.safeParse({ minWishlistSuggestions: value }).success,
      ).toBe(false)
  })
})
