import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { useDraftGuard } from '../composables/useDraftGuard'
import { i18n, setLocale } from '../i18n'
import HomeView from '../views/HomeView.vue'

let wrapper: VueWrapper | undefined
beforeEach(async () => { await setLocale('fr-CA') })
const emptyPage = defineComponent({ render: () => h('div') })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

async function open(component: ReturnType<typeof defineComponent>, path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component }, { path: '/p/:token', component }, { path: '/other', component: emptyPage }],
  })
  await router.push(path)
  await router.isReady()
  wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
    global: { plugins: [router, createPinia(), i18n], stubs: { BaseModal: { template: '<div><slot /></div>' } } },
  })
  await flushPromises()
  return router
}

describe('draft guards and in-page navigation', () => {
  it('keeps a draft without prompting when navigating to an anchor on the same page', async () => {
    const dirty = ref(true)
    const page = defineComponent({ setup() { useDraftGuard(dirty); return () => h('div') } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = await open(page)
    await router.push('/#received-link')
    expect(router.currentRoute.value.hash).toBe('#received-link')
    expect(dirty.value).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('still prompts and cancels when changing a participant link with an active draft', async () => {
    const page = defineComponent({ setup() { useDraftGuard(ref(true)); return () => h('div') } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = await open(page, '/p/first')
    await router.push('/p/second')
    expect(router.currentRoute.value.path).toBe('/p/first')
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('ignores autofilled creation fields while the home modal is closed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = await open(HomeView)
    await wrapper!.get('#adminPassword').setValue('autofilled-password')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/other')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('protects a creation draft when its modal is open', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = await open(HomeView)
    await wrapper!.findAll('button')[0]!.trigger('click')
    await wrapper!.get('#exchangeName').setValue('New exchange')
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/')
    expect(confirm).toHaveBeenCalledTimes(1)
  })
})
