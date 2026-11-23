import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { budgetSchema, updateExchangeInputSchema, type UpdateExchangeInputDto } from '@kado/shared'
import EditExchangeModal from '../components/EditExchangeModal.vue'
import { i18n, setLocale } from '../i18n'
let wrapper: VueWrapper | undefined
beforeEach(() => setLocale('fr-CA'))
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); document.body.innerHTML = '' })
async function open(budget?: number) {
  const props = reactive({ modelValue: false, name: 'Test', description: 'Description', budget, updatedAt: '2026-11-23T12:00:00.000Z' })
  const submissions: UpdateExchangeInputDto[] = []
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: defineComponent({ setup: () => () => h(EditExchangeModal, { ...props, onSubmit: v => submissions.push(v) }) }) }] })
  await router.push('/'); await router.isReady()
  wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), { global: { plugins: [router, i18n] }, attachTo: document.body })
  props.modelValue = true
  await flushPromises()
  return { view: wrapper, submissions }
}
it('keeps omission distinct from explicit null in the update contract', () => {
  expect(Object.hasOwn(updateExchangeInputSchema.parse({}), 'budget')).toBe(false)
  expect(updateExchangeInputSchema.parse({ budget: null }).budget).toBeNull()
  for (const value of [0, 1, 1000]) expect(budgetSchema.safeParse(value).success).toBe(true)
  for (const value of [-1, 0.1, 1001, 99999999.99, Infinity, NaN]) expect(budgetSchema.safeParse(value).success).toBe(false)
})
it.each([25.75, 1500])('omits an unchanged legacy budget %s while saving another field', async budget => {
  const { view, submissions } = await open(budget)
  expect(view.get<HTMLInputElement>('#editExchangeBudget').element.value).toBe(String(budget))
  await view.get('#editExchangeDescription').setValue('Changed')
  await view.get('form').trigger('submit')
  expect(submissions).toHaveLength(1)
  expect(Object.hasOwn(submissions[0]!, 'budget')).toBe(false)
})
it('sends explicit clearing for budget and description, while retaining zero', async () => {
  const { view, submissions } = await open(25)
  await view.get('#editExchangeBudget').setValue('')
  await view.get('#editExchangeDescription').setValue('')
  await view.get('form').trigger('submit')
  expect(submissions[0]).toMatchObject({ budget: null, description: '' })
  await view.get('#editExchangeBudget').setValue('0')
  await view.get('form').trigger('submit')
  expect(submissions[1]?.budget).toBe(0)
})
it('explains invalid amounts in each language, preserves the input and permits correction', async () => {
  const { view, submissions } = await open(25)
  for (const amount of ['-1', '25.5', '1001', '100000000']) {
    await view.get('#editExchangeBudget').setValue(amount)
    await view.get('form').trigger('submit')
    expect(submissions).toHaveLength(0)
    expect(view.get('#editExchangeBudget').attributes('aria-invalid')).toBe('true')
    for (const locale of ['fr-CA', 'en-CA', 'es'] as const) {
      await setLocale(locale)
      expect(view.get('#editExchangeBudget-error').text()).toBe(i18n.global.t('review.budgetInvalid'))
    }
    expect(view.get<HTMLInputElement>('#editExchangeBudget').element.value).toBe(amount)
  }
  await view.get('#editExchangeBudget').setValue('1000')
  await view.get('form').trigger('submit')
  expect(submissions[0]?.budget).toBe(1000)
})
