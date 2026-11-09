<script setup lang="ts">
import { ref, onBeforeUnmount, nextTick, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Draggable from 'vuedraggable'
import WishlistSuggestionItem from './WishlistSuggestionItem.vue'
import type { EditableSuggestion } from '@/composables/useWishlist'
const props = defineProps<{
  modelValue: EditableSuggestion[]
  locked?: boolean
  busy?: boolean
  participantId?: string
}>()
const emit = defineEmits<{
  commit: []
  validating: [value: boolean]
  'update:modelValue': [value: EditableSuggestion[]]
}>()
const { t } = useI18n()
const validatingItems = new Set<string>()
function validating(key: string, value: boolean) {
  if (value) validatingItems.add(key)
  else validatingItems.delete(key)
  emit('validating', validatingItems.size > 0)
}
const announcement = ref('')
const helpId = `reorder-${useId()}`
const listElement = ref<HTMLElement | null>(null)
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
const reducedMotion = ref(motionPreference?.matches ?? false)
const updateMotion = (event: MediaQueryListEvent) => {
  reducedMotion.value = event.matches
}
motionPreference?.addEventListener('change', updateMotion)
onBeforeUnmount(() => motionPreference?.removeEventListener('change', updateMotion))
function reorder(value: EditableSuggestion[]) {
  if (!props.locked && !props.busy) {
    emit('update:modelValue', value)
    emit('commit')
  }
}
function change(index: number, value: Partial<EditableSuggestion>) {
  if (props.locked || props.busy) return
  emit(
    'update:modelValue',
    props.modelValue.map((s, i) => (i === index ? { ...s, ...value } : s)),
  )
}
function remove(index: number) {
  if (!props.locked && !props.busy && window.confirm(t('review.confirmDeleteSuggestion'))) {
    emit(
      'update:modelValue',
      props.modelValue.filter((_, i) => i !== index),
    )
    emit('commit')
  }
}
function leaveItem(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
    emit('commit')
}
async function move(index: number, delta: number) {
  const target = index + delta
  if (props.locked || props.busy || target < 0 || target >= props.modelValue.length) return
  const list = [...props.modelValue]
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item!)
  emit('update:modelValue', list)
  emit('commit')
  announcement.value = t('p2.moved', {
    title: item!.title || t('participant.wishlist'),
    position: target + 1,
  })
  await nextTick()
  listElement.value?.querySelectorAll<HTMLButtonElement>('.drag-handle')[target]?.focus()
}
function add() {
  if (props.locked || props.busy || props.modelValue.length >= 100) return
  emit('update:modelValue', [...props.modelValue, { title: '', _clientId: crypto.randomUUID() }])
}
</script>
<template>
  <div ref="listElement">
    <p v-if="!locked && modelValue.length" :id="helpId" class="visually-hidden">
      {{ t('review.reorderHelp') }}
    </p>
    <p class="visually-hidden" role="status">{{ announcement }}</p>
    <Draggable
      :model-value="modelValue"
      @update:model-value="reorder"
      item-key="_clientId"
      handle=".drag-handle"
      :disabled="locked || busy"
      :animation="reducedMotion ? 0 : 200"
      class="d-flex flex-column gap-3 mb-2"
    >
      <template #item="{ element, index }">
        <article @focusout="leaveItem" class="suggestion-shell d-flex">
          <div v-if="!locked" class="suggestion-controls">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary drag-handle"
              :disabled="busy"
              :aria-label="t('participant.wishlistItem.reorder')"
              :aria-describedby="helpId"
              @keydown.up.prevent="move(index, -1)"
              @keydown.down.prevent="move(index, 1)"
            >
              <i class="bi bi-grip-vertical" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              :disabled="busy"
              :aria-label="t('actions.delete')"
              @click="remove(index)"
            >
              <i class="bi bi-trash" aria-hidden="true"></i>
            </button>
          </div>
          <div class="suggestion-content">
            <WishlistSuggestionItem
              @commit="emit('commit')"
              :model-value="element"
              :participant-id="participantId"
              @validating="validating(element._clientId, $event)"
              :mode="locked ? 'detail' : 'edit'"
              :disabled="locked || busy"
              @update:model-value="change(index, $event)"
            />
          </div>
        </article>
      </template>
    </Draggable>
    <p v-if="!modelValue.length" class="text-body-secondary">
      {{ t('participant.noSuggestions') }}
    </p>
    <button
      v-if="!locked"
      type="button"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy || modelValue.length >= 100"
      @click="add"
    >
      {{ t('participant.addSuggestion') }}
    </button>
  </div>
</template>
