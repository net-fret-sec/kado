import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import EditExchangeModal from '../components/EditExchangeModal.vue'
import { i18n, setLocale } from '../i18n'

let wrapper: VueWrapper
beforeEach(async () => {
  await setLocale('fr-CA')
})
afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
})
it('survives partial dates and numeric input, and can save after correction', async () => {
  const errors: unknown[] = []
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  })
  await router.push('/')
  wrapper = mount(EditExchangeModal, {
    props: {
      modelValue: false,
      name: 'Échange',
      updatedAt: '2026-11-15T00:00:00.000Z',
      budget: 100,
      eventDate: '2026-12-25',
    },
    global: {
      plugins: [router, i18n],
      config: { errorHandler: (error) => errors.push(error) },
      stubs: { BaseModal: { template: '<div><slot/><slot name="footer"/></div>' } },
    },
  })
  await wrapper.setProps({ modelValue: true })
  await wrapper.get('#editExchangeName').setValue('Échange modifié')
  const button = wrapper.get('button[type=submit]')
  expect(button.attributes('disabled')).toBeUndefined()
  for (const id of ['#editExchangeEventDate', '#editPlannedDrawDate']) {
    for (const value of ['', '2', '2026-', '2026-02-29', '2026-12-25']) {
      await wrapper.get(id).setValue(value)
      await flushPromises()
      expect(errors).toEqual([])
    }
  }
  for (const value of ['-1', '1e', '1,50', '1e999']) {
    await wrapper.get('#editExchangeBudget').setValue(value)
    await flushPromises()
    expect(errors).toEqual([])
  }
  await wrapper.get('#editExchangeBudget').setValue('25')
  expect(button.attributes('disabled')).toBeUndefined()
  for (const value of ['', '-1', '0.5', '101']) {
    await wrapper.get('#editExchangeMinSuggestions').setValue(value)
    expect(button.attributes('disabled')).toBeDefined()
    expect(errors).toEqual([])
  }
  await wrapper.get('#editExchangeMinSuggestions').setValue('0')
  expect(button.attributes('disabled')).toBeUndefined()
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
    budget: 25,
    minWishlistSuggestions: 0,
  })
  expect(errors).toEqual([])
})
