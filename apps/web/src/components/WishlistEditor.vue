<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import Draggable from 'vuedraggable'
import WishlistSuggestionItem from './WishlistSuggestionItem.vue'
import type { EditableSuggestion } from '@/composables/useWishlist'
const props = defineProps<{ modelValue: EditableSuggestion[]; locked?: boolean; busy?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: EditableSuggestion[]] }>()
const { t } = useI18n()
const announcement = ref('')
const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
const reducedMotion = ref(motionPreference?.matches ?? false)
const updateMotion = (event: MediaQueryListEvent) => {
  reducedMotion.value = event.matches
}
motionPreference?.addEventListener('change', updateMotion)
onBeforeUnmount(() => motionPreference?.removeEventListener('change', updateMotion))
function reorder(value: EditableSuggestion[]) {
  if (!props.locked && !props.busy) emit('update:modelValue', value)
}
function change(index: number, value: Partial<EditableSuggestion>) {
  if (props.locked || props.busy) return
  emit(
    'update:modelValue',
    props.modelValue.map((s, i) => (i === index ? { ...s, ...value } : s)),
  )
}
function remove(index: number) {
  if (!props.locked && !props.busy)
    emit(
      'update:modelValue',
      props.modelValue.filter((_, i) => i !== index),
    )
}
function move(index: number, delta: number) {
  const target = index + delta
  if (props.locked || props.busy || target < 0 || target >= props.modelValue.length) return
  const list = [...props.modelValue]
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item!)
  emit('update:modelValue', list)
  announcement.value = t('p2.moved', {
    title: item!.title || t('participant.wishlist'),
    position: target + 1,
  })
}
function add() {
  if (props.locked || props.busy || props.modelValue.length >= 100) return
  emit('update:modelValue', [...props.modelValue, { title: '', _clientId: crypto.randomUUID() }])
}
</script>
<template>
  <div>
    <p class="visually-hidden" role="status">{{ announcement }}</p>
    <Draggable
      :model-value="modelValue"
      @update:model-value="reorder"
      item-key="_clientId"
      handle=".drag-handle"
      :disabled="locked || busy"
      :animation="reducedMotion ? 0 : 200"
      class="d-grid gap-3 mb-2"
    >
      <template #item="{ element, index }">
        <article class="border rounded p-3">
          <div v-if="!locked" class="wishlist-controls d-flex flex-wrap gap-1 mb-2">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary drag-handle"
              :disabled="busy"
              :aria-label="t('participant.wishlistItem.reorder')"
            >
              <i class="bi bi-grip-vertical" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              :disabled="busy || index === 0"
              @click="move(index, -1)"
            >
              {{ t('p2.moveUp') }}
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              :disabled="busy || index === modelValue.length - 1"
              @click="move(index, 1)"
            >
              {{ t('p2.moveDown') }}
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger ms-auto"
              :disabled="busy"
              :aria-label="t('exchangeDetail.delete')"
              @click="remove(index)"
            >
              <i class="bi bi-trash" aria-hidden="true"></i>
            </button>
          </div>
          <WishlistSuggestionItem
            :model-value="element"
            :mode="locked ? 'detail' : 'edit'"
            :disabled="busy"
            @update:model-value="change(index, $event)"
          />
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
