<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Modal } from 'bootstrap'

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
  }>(),
  {
    title: '',
    size: 'md',
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'shown'): void
  (event: 'hidden'): void
}>()

const modalRef = ref<HTMLElement | null>(null)
let modalInstance: ModalController | null = null

const dialogClass = computed(() => {
  if (props.size === 'md') return 'modal-dialog'
  return `modal-dialog modal-${props.size}`
})

function handleShown() {
  emit('shown')
}

function handleHidden() {
  emit('update:modelValue', false)
  emit('hidden')
}

onMounted(() => {
  if (!modalRef.value) return

  modalInstance = new Modal(modalRef.value) as unknown as ModalController
  modalRef.value.addEventListener('shown.bs.modal', handleShown)
  modalRef.value.addEventListener('hidden.bs.modal', handleHidden)

  if (props.modelValue) {
    modalInstance.show()
  }
})

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!modalInstance) return
    if (isOpen) {
      modalInstance.show()
      return
    }
    modalInstance.hide()
  },
)

onBeforeUnmount(() => {
  if (!modalRef.value) return

  modalRef.value.removeEventListener('shown.bs.modal', handleShown)
  modalRef.value.removeEventListener('hidden.bs.modal', handleHidden)
  modalInstance?.dispose()
  modalInstance = null
})
</script>

<template>
  <section ref="modalRef" class="modal fade" tabindex="-1" aria-hidden="true">
    <div :class="dialogClass" class="modal-fullscreen-md-down">
      <div class="modal-content">
        <div class="modal-header bg-dark text-white">
          <slot name="header">
            <h5 class="modal-title">{{ title }}</h5>
            <!-- <button
              type="button"
              class="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button> -->
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
