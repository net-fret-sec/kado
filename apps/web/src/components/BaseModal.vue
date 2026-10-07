<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, useId } from 'vue'
import { Modal } from 'bootstrap'
import { useI18n } from 'vue-i18n'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'
type ModalController = {
  show: () => void
  hide: () => void
  dispose: () => void
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    size?: ModalSize
    closeButton?: boolean
    closeOnBackdrop?: boolean
    closeOnEscape?: boolean
    beforeClose?: () => boolean
  }>(),
  {
    title: '',
    size: 'md',
    closeButton: false,
    closeOnBackdrop: true,
    closeOnEscape: true,
  },
)
const { t } = useI18n()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'shown'): void
  (event: 'hidden'): void
}>()

const titleId = `modal-title-${useId()}`
const modalRef = ref<HTMLElement | null>(null)
let modalInstance: ModalController | null = null
let previousFocusedElement: HTMLElement | null = null

const dialogClass = computed(() => {
  if (props.size === 'md') return 'modal-dialog'
  return `modal-dialog modal-${props.size}`
})

const backdropBehavior = computed(() => (props.closeOnBackdrop ? null : 'static'))
const keyboardBehavior = computed(() => (props.closeOnEscape ? null : 'false'))

function handleShown() {
  const first =
    modalRef.value?.querySelector<HTMLElement>('[autofocus]:not(:disabled)') ??
    modalRef.value?.querySelector<HTMLElement>(
      'input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)',
    ) ??
    modalRef.value?.querySelector<HTMLElement>('button:not(:disabled)')
  first?.focus()
  emit('shown')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !modalRef.value) return
  const focusable = Array.from(
    modalRef.value.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length && !element.closest('[inert]'))
  const first = focusable[0],
    last = focusable[focusable.length - 1]
  if (!first) {
    event.preventDefault()
    modalRef.value.focus()
    return
  }
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === modalRef.value)
  ) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function handleHide(event: Event) {
  if (props.modelValue && props.beforeClose && !props.beforeClose()) {
    event.preventDefault()
    emit('update:modelValue', true)
    return
  }
  if (!modalRef.value) return

  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement && modalRef.value.contains(activeElement)) {
    activeElement.blur()
  }
}

function handleHidden() {
  if (previousFocusedElement?.isConnected) {
    previousFocusedElement.focus()
  }
  previousFocusedElement = null

  emit('update:modelValue', false)
  emit('hidden')
}

onMounted(() => {
  if (!modalRef.value) return

  modalInstance = new Modal(modalRef.value) as unknown as ModalController
  modalRef.value.addEventListener('keydown', handleKeydown)
  modalRef.value.addEventListener('shown.bs.modal', handleShown)
  modalRef.value.addEventListener('hide.bs.modal', handleHide)
  modalRef.value.addEventListener('hidden.bs.modal', handleHidden)

  if (props.modelValue) {
    previousFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    modalInstance.show()
  }
})

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!modalInstance) return
    if (isOpen) {
      if (document.activeElement instanceof HTMLElement) {
        previousFocusedElement = document.activeElement
      }
      modalInstance.show()
      return
    }
    modalInstance.hide()
  },
)

onBeforeUnmount(() => {
  if (!modalRef.value) return

  modalRef.value.removeEventListener('keydown', handleKeydown)
  modalRef.value.removeEventListener('shown.bs.modal', handleShown)
  modalRef.value.removeEventListener('hide.bs.modal', handleHide)
  modalRef.value.removeEventListener('hidden.bs.modal', handleHidden)
  modalInstance?.dispose()
  modalInstance = null
})
</script>

<template>
  <section
    ref="modalRef"
    class="modal fade"
    tabindex="-1"
    role="dialog"
    :aria-labelledby="titleId"
    aria-hidden="true"
    :data-bs-backdrop="backdropBehavior"
    :data-bs-keyboard="keyboardBehavior"
  >
    <div :class="dialogClass" class="modal-fullscreen-md-down">
      <div class="modal-content">
        <div class="modal-header bg-dark text-white">
          <slot name="header">
            <h2 :id="titleId" class="modal-title h5">{{ title }}</h2>
            <button
              v-if="props.closeButton"
              type="button"
              class="btn-close bg-white"
              data-bs-dismiss="modal"
              :aria-label="t('common.close')"
            ></button>
          </slot>
        </div>

        <div class="modal-body">
          <slot />
        </div>

        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </section>
</template>
