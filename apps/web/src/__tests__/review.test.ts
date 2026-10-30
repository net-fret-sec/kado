import { describe, expect, it, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  adminPasswordSchema,
  normalizeAdminPassword,
  updateExchangeInputSchema,
  type ExclusionRule,
} from '@kado/shared'
import { groupExclusions } from '../lib/exclusionSummary'
import AccessReminder from '../components/AccessReminder.vue'
import { i18n } from '../i18n'

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
