<template>
  <div :class="wrapperClass">
    <!-- Edit mode -->
    <template v-if="mode === 'edit'">
      <div class="row g-2 align-items-end">
        <div v-if="showHandle" class="col-auto d-flex align-items-center">
          <span class="drag-handle me-2" title="Réordonner" style="cursor: grab"><i class="bi bi-grip-vertical"></i></span>
        </div>
        <div class="col-12 col-md-5">
          <label class="form-label">Titre</label>
          <input
            :value="modelValue?.title || ''"
            @input="e => onChange('title', (e.target as HTMLInputElement).value)"
            type="text"
            class="form-control"
            :class="{ 'is-invalid': !!titleError }"
            aria-describedby="titleHelp"
            :aria-invalid="!!titleError || undefined"
            required
          />
          <div id="titleHelp" class="form-text">Titre descriptif de la suggestion.</div>
          <div v-if="titleError" class="invalid-feedback">{{ titleError }}</div>
        </div>
        <div class="col-12 col-md-3">
          <label class="form-label">Icône</label>
          <IconPicker :modelValue="modelValue?.icon" @update:modelValue="v => onChange('icon', v)" placeholder="ex: gift, heart" />
          <div v-if="iconAndImageBoth" class="form-text text-warning">Astuce: utilisez une icône <em>ou</em> une image.</div>
        </div>
        <div class="col-12 col-md-4">
          <label class="form-label">Image URL</label>
          <input
            :value="modelValue?.imageUrl || ''"
            @input="e => onChange('imageUrl', (e.target as HTMLInputElement).value)"
            type="url"
            class="form-control"
            :class="{ 'is-invalid': !!imageUrlError }"
            placeholder="https://exemple.com/image.png"
            :aria-invalid="!!imageUrlError || undefined"
          />
          <div v-if="imageUrlError" class="invalid-feedback">{{ imageUrlError }}</div>
        </div>
        <div class="col-12">
          <label class="form-label">Lien</label>
          <input
            :value="modelValue?.linkUrl || ''"
            @input="e => onChange('linkUrl', (e.target as HTMLInputElement).value)"
            type="url"
            class="form-control"
            :class="{ 'is-invalid': !!linkUrlError }"
            placeholder="https://exemple.com/produit"
            :aria-invalid="!!linkUrlError || undefined"
          />
          <div v-if="linkUrlError" class="invalid-feedback">{{ linkUrlError }}</div>
        </div>
        <div class="col-12 d-flex justify-content-end mt-2" v-if="removable">
          <button type="button" class="btn btn-sm btn-outline-danger" @click="$emit('remove')"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    </template>

    <!-- Detail/List mode -->
    <template v-else>
      <div class="d-flex align-items-center">
        <img
          v-if="modelValue?.imageUrl"
          class="rounded me-2 flex-shrink-0"
          :src="modelValue.imageUrl"
          :alt="modelValue.title"
          width="40"
          height="40"
          style="object-fit: cover;"
        />
        <i v-else-if="modelValue?.icon" class="me-2 bi" :class="`bi-${modelValue.icon}`" aria-hidden="true"></i>
        <span class="flex-grow-1">
          <a v-if="modelValue?.linkUrl" :href="modelValue.linkUrl" target="_blank" rel="noopener noreferrer">{{ modelValue?.title }}</a>
          <span v-else>{{ modelValue?.title }}</span>
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import IconPicker from '@/components/IconPicker.vue'

export type Mode = 'edit' | 'detail' | 'list'

interface Suggestion {
  title: string
  imageUrl?: string
  icon?: string
  linkUrl?: string
}

const props = defineProps<{
  modelValue: Suggestion
  mode?: Mode
  removable?: boolean
  showHandle?: boolean
  asListItem?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: Suggestion): void
  (e: 'remove'): void
}>()

const wrapperClass = computed(() => props.asListItem ? 'list-group-item' : '')

function onChange<K extends keyof Suggestion>(key: K, value: Suggestion[K] | undefined) {
  const v = (typeof value === 'string' ? value.trim() : value) as Suggestion[K] | undefined
  const next: Suggestion = {
    ...props.modelValue,
    [key]: (v === '' ? undefined : v) as unknown,
  }
  emit('update:modelValue', next)
}

function isValidUrl(u?: string) {
  if (!u) return true
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const titleError = computed(() => {
  const t = props.modelValue?.title?.trim() || ''
  return t.length === 0 ? 'Le titre est requis.' : ''
})

const imageUrlError = computed(() =>
  props.modelValue?.imageUrl && !isValidUrl(props.modelValue.imageUrl)
    ? "URL d’image invalide (http/https requis)."
    : ''
)

const linkUrlError = computed(() =>
  props.modelValue?.linkUrl && !isValidUrl(props.modelValue.linkUrl)
    ? 'URL de lien invalide (http/https requis).'
    : ''
)

const iconAndImageBoth = computed(() => !!(props.modelValue?.icon && props.modelValue?.imageUrl))
</script>

<style scoped>
</style>
