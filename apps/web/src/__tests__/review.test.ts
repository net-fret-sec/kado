import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  adminPasswordSchema,
  normalizeAdminPassword,
  updateExchangeInputSchema,
  type ExclusionRule,
} from '@kado/shared'
import { groupExclusions } from '../lib/exclusionSummary'
import { sortParticipants } from '../lib/participantOrder'
import WishlistEditor from '../components/WishlistEditor.vue'
import ExchangeDetails from '../components/ExchangeDetails.vue'
import AccessReminder from '../components/AccessReminder.vue'
import { i18n, setLocale } from '../i18n'

beforeEach(() => setLocale('fr-CA'))
afterEach(() => localStorage.clear())
describe('UI review shared contracts', () => {
  it('validates entered length before case normalization, including expanding Unicode', () => {
    expect(adminPasswordSchema.safeParse('abcdefgh').success).toBe(true)
    expect(adminPasswordSchema.safeParse('12345678').success).toBe(true)
    expect(adminPasswordSchema.safeParse('ßßßß').success).toBe(false)
    expect(normalizeAdminPassword('aBcDéfgh')).toBe(normalizeAdminPassword('AbCdÉFGH'))
  })
  it('distinguishes an omitted date from an explicit clear', () => {
    const omitted = updateExchangeInputSchema.parse({ name: 'New' })
    expect(Object.hasOwn(omitted, 'plannedDrawDate')).toBe(false)
    const cleared = updateExchangeInputSchema.parse({ plannedDrawDate: null, eventDate: '' })
    expect(Object.hasOwn(cleared, 'plannedDrawDate')).toBe(true)
    expect(Object.hasOwn(cleared, 'eventDate')).toBe(true)
    expect(cleared.plannedDrawDate).toBeUndefined()
  })
  it('groups mutual pairs once without losing remaining directional exclusions', () => {
    const pairs = [
      ['a', 'b'],
      ['b', 'a'],
      ['a', 'c'],
      ['a', 'd'],
      ['d', 'b'],
    ]
    const rules = pairs.map(([giverParticipantId, receiverParticipantId], i) => ({
      id: String(i),
      giverParticipantId,
      receiverParticipantId,
    })) as ExclusionRule[]
    expect(groupExclusions(rules)).toEqual({
      mutual: [{ a: 'a', b: 'b' }],
      directional: [
        { giver: 'a', receivers: ['c', 'd'] },
        { giver: 'd', receivers: ['b'] },
      ],
    })
  })
  it('remembers confirmation per access and shows the reminder for a different access', async () => {
    const wrapper = mount(AccessReminder, {
      props: { accessId: 'one', organizer: true },
      global: { plugins: [i18n] },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('aside').exists()).toBe(false)
    wrapper.unmount()
    const reopened = mount(AccessReminder, {
      props: { accessId: 'one', organizer: true },
      global: { plugins: [i18n] },
    })
    expect(reopened.find('aside').exists()).toBe(false)
    await reopened.setProps({ accessId: 'two' })
    expect(reopened.find('aside').exists()).toBe(true)
    reopened.unmount()
  })
})

describe('Follow-up review', () => {
  it('sorts participant names naturally without mutating source, ignoring case and accents', () => {
    const people = [
      { name: 'Zoé' },
      { name: 'élise' },
      { name: 'alice' },
      { name: 'Bob 10' },
      { name: 'bob 2' },
    ]
    expect(sortParticipants(people).map((p) => p.name)).toEqual([
      'alice',
      'bob 2',
      'Bob 10',
      'élise',
      'Zoé',
    ])
    expect(people[0]!.name).toBe('Zoé')
  })
  it('requires confirmation before removing a suggestion', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mount(WishlistEditor, {
      props: { modelValue: [{ _clientId: 'gift', title: 'Book' }] },
      global: { plugins: [i18n], stubs: { WishlistSuggestionItem: true } },
    })
    await wrapper.get('.btn-outline-danger').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    confirm.mockReturnValue(true)
    await wrapper.get('.btn-outline-danger').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[[]]])
    wrapper.unmount()
    confirm.mockRestore()
  })
  it('summarizes inverse exclusions only in reciprocal mode and deduplicates explicit inverses', () => {
    const pair = { giverParticipantId: 'a', receiverParticipantId: 'b' }
    expect(groupExclusions([pair], false).directional).toEqual([{ giver: 'a', receivers: ['b'] }])
    expect(groupExclusions([pair], true)).toEqual({ mutual: [{ a: 'a', b: 'b' }], directional: [] })
    expect(
      groupExclusions([pair, { giverParticipantId: 'b', receiverParticipantId: 'a' }], true).mutual,
    ).toHaveLength(1)
  })
  it('shows the same readable details with editing available only to the organizer', async () => {
    const wrapper = mount(ExchangeDetails, {
      props: {
        exchange: {
          id: 'e',
          name: 'Test',
          isDrawn: false,
          isArchived: false,
          organizerName: 'Alice',
          budget: 0,
          minWishlistSuggestions: 2,
          noMutualAssignments: true,
        },
        exclusions: [
          {
            giverParticipantId: 'a',
            giverName: 'Alice',
            receiverParticipantId: 'b',
            receiverName: 'Bob',
          },
        ],
      },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('Organisé par Alice')
    expect(wrapper.text()).toContain('Alice et Bob ne peuvent pas se piger.')
    expect(wrapper.text()).toContain('2 suggestions')
    expect(wrapper.find('button').exists()).toBe(false)
    await wrapper.setProps({ editable: true })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(1)
    wrapper.unmount()
  })
})
