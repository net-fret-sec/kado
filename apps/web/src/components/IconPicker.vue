<template>
  <div class="icon-picker">
    <div class="input-group">
      <span class="input-group-text">
        <i class="bi fs-5" :class="iconClass" aria-hidden="true"></i>
      </span>
      <input
        :list="datalistId"
        class="form-control"
        type="text"
        :placeholder="placeholder"
        :value="modelValue || ''"
        @input="onInput"
      />
      <button
        class="btn btn-outline-secondary"
        type="button"
        @click="$emit('update:modelValue', undefined)"
      >
        <i class="bi bi-x-circle"></i>
      </button>
    </div>
    <datalist :id="datalistId">
      <option v-for="name in suggestions" :key="name" :value="name" />
    </datalist>
    <div v-if="modelValue && !isKnown(modelValue)" class="form-text text-warning">
      {{ $t('iconPicker.unknownIcon') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  id?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v?: string): void
}>()

const baseList: string[] = [
  // Cadeaux / shopping
  'gift',
  'gift-fill',
  'box',
  'box-seam',
  'bag',
  'bag-heart',
  'bag-fill',
  'basket2',
  'cart',
  'cart-check',
  // Coeurs & fêtes
  'heart',
  'heart-fill',
  'balloon-heart',
  'balloon-heart-fill',
  'balloon',
  'balloon-fill',
  // Livre & culture
  'book',
  'book-half',
  'bookmarks',
  'bookmark',
  'journal',
  'music-note',
  'music-note-beamed',
  // Tech & jeu
  'cpu',
  'device-hdd',
  'controller',
  'controller',
  'headphones',
  'phone',
  'laptop',
  'smartwatch',
  // Maison & déco
  'house',
  'lamp',
  'paint-bucket',
  'palette',
  'box2-heart',
  // Mode & beauté
  'bag',
  'bag-check',
  'bag-plus',
  'suit-heart',
  'gem',
  'stars',
  // Loisirs
  'bicycle',
  'camera',
  'camera-video',
  'film',
  'tree',
  'cup-hot',
  'wine',
  'emoji-smile',
  'emoji-sunglasses',
  // Autres utiles
  'link-45deg',
  'star',
  'star-fill',
  'star-half',
  'bookmark-heart',
  'truck',
  'wallet',
  'cash',
  'credit-card',
]

const suggestions = computed(() => Array.from(new Set(baseList)).sort())

const datalistId = computed(() => (props.id ? `${props.id}-icons` : 'icon-picker-list'))
const iconClass = computed(() => (props.modelValue ? `bi-${props.modelValue}` : 'bi-emoji-neutral'))

function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  emit('update:modelValue', v || undefined)
}

function isKnown(name: string) {
  return suggestions.value.includes(name)
}
</script>
