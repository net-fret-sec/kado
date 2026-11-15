import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ParticipantAccessLinkModal from '../components/ParticipantAccessLinkModal.vue'
import { useToastsStore } from '../stores/toasts'
import { i18n, setLocale } from '../i18n'

let wrapper: VueWrapper | undefined
const originalCopy = Object.getOwnPropertyDescriptor(document, 'execCommand')
const writeText = vi.fn<(text: string) => Promise<void>>()
const fallbackCopy = vi.fn(() => false)

beforeEach(async () => {
  await setLocale('fr-CA')
  vi.useFakeTimers()
  writeText.mockReset().mockResolvedValue(undefined)
  fallbackCopy.mockReset().mockReturnValue(false)
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: fallbackCopy })
})
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  if (originalCopy) Object.defineProperty(document, 'execCommand', originalCopy)
  else Reflect.deleteProperty(document, 'execCommand')
})
function open(link = 'https://example.test/p/FIRST') {
  const pinia = createPinia()
  wrapper = mount(ParticipantAccessLinkModal, {
    props: { modelValue: true, link, participantName: 'Alex' },
    attachTo: document.body,
    global: {
      plugins: [pinia, i18n],
      stubs: { BaseModal: { template: '<div><slot /><slot name="footer" /></div>' } },
    },
  })
  return { view: wrapper, toasts: useToastsStore(pinia) }
}

it('copies the currently displayed link, including after regeneration, and announces success', async () => {
  const { view, toasts } = open()
  await view.get('.input-group button').trigger('click')
  await flushPromises()
  expect(writeText).toHaveBeenLastCalledWith('https://example.test/p/FIRST')
  expect(toasts.items.at(-1)).toMatchObject({
    variant: 'success',
    message: i18n.global.t('exchangeDetail.linkCopied'),
  })
  await view.setProps({ link: 'https://example.test/p/REGENERATED' })
  await view.get('.input-group button').trigger('click')
  await flushPromises()
  expect(writeText).toHaveBeenLastCalledWith('https://example.test/p/REGENERATED')
  expect(view.get('input').element.value).toBe('https://example.test/p/REGENERATED')
  expect(fallbackCopy).not.toHaveBeenCalled()
  expect(view.emitted('update:modelValue')).toBeUndefined()
})

it('keeps the manual selection available and reports failure when both clipboard methods fail', async () => {
  writeText.mockRejectedValue(new Error('Permission denied'))
  const { view, toasts } = open()
  await view.get('.input-group button').trigger('click')
  await flushPromises()
  expect(fallbackCopy).toHaveBeenCalledWith('copy')
  expect(toasts.items.at(-1)).toMatchObject({
    variant: 'danger',
    message: i18n.global.t('exchangeDetail.copyFailed'),
  })
  const input = view.get('input').element
  expect(input.readOnly).toBe(true)
  expect(document.activeElement).toBe(input)
  expect(input.selectionStart).toBe(0)
  expect(input.selectionEnd).toBe(input.value.length)
  expect(document.querySelector('textarea')).toBeNull()
})

it('uses the existing fallback if the modern clipboard is unavailable', async () => {
  vi.stubGlobal('isSecureContext', false)
  fallbackCopy.mockReturnValue(true)
  const { view, toasts } = open()
  await view.get('.input-group button').trigger('click')
  await flushPromises()
  expect(writeText).not.toHaveBeenCalled()
  expect(fallbackCopy).toHaveBeenCalledWith('copy')
  expect(toasts.items.at(-1)?.variant).toBe('success')
})

it('disables copying an empty link', async () => {
  const { view, toasts } = open('')
  expect(view.get('.input-group button').attributes('disabled')).toBeDefined()
  await view.get('.input-group button').trigger('click')
  expect(writeText).not.toHaveBeenCalled()
  expect(toasts.items).toHaveLength(0)
})
