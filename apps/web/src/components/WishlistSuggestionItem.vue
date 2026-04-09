<template>
  <div :class="wrapperClass">
    <!-- Edit mode -->
    <template v-if="mode === 'edit'">
      <div class="row g-2 align-items-end">
        <div v-if="showHandle" class="col-auto d-flex align-items-center">
          <button
            type="button"
            class="drag-handle btn btn-link text-body-secondary p-0 me-2"
            :title="t('participant.wishlistItem.reorder')"
            tabindex="-1"
          >
            <i class="bi bi-grip-vertical"></i>
          </button>
        </div>
        <div class="col-12 col-md-5">
          <label class="form-label">{{ t('participant.wishlistItem.titleLabel') }}</label>
          <input
            :value="modelValue?.title || ''"
            @input="(e) => onChange('title', (e.target as HTMLInputElement).value)"
            type="text"
            class="form-control"
            :class="{ 'is-invalid': !!titleError }"
            aria-describedby="titleHelp"
            :aria-invalid="!!titleError || undefined"
            required
          />
          <div id="titleHelp" class="form-text">{{ t('participant.wishlistItem.titleHelp') }}</div>
          <div v-if="titleError" class="invalid-feedback">{{ titleError }}</div>
        </div>
        <div class="col-12 col-md-3">
          <label class="form-label">{{ t('participant.wishlistItem.iconLabel') }}</label>
          <IconPicker
            :modelValue="modelValue?.icon"
            @update:modelValue="(v) => onChange('icon', v)"
            :placeholder="t('participant.wishlistItem.iconPlaceholder')"
          />
          <div v-if="iconAndImageBoth" class="form-text text-warning">
            {{ t('participant.wishlistItem.iconOrImageHint') }}
          </div>
        </div>
        <div class="col-12 col-md-4">
          <label class="form-label">{{ t('participant.wishlistItem.imageUrlLabel') }}</label>
          <input
            :value="modelValue?.imageUrl || ''"
            @input="(e) => onChange('imageUrl', (e.target as HTMLInputElement).value)"
            type="url"
            class="form-control"
            :class="{ 'is-invalid': !!imageUrlError }"
            :placeholder="t('participant.wishlistItem.imageUrlPlaceholder')"
            :aria-invalid="!!imageUrlError || undefined"
          />
          <div v-if="imageUrlError" class="invalid-feedback">{{ imageUrlError }}</div>
        </div>
        <div class="col-12">
          <label class="form-label">{{ t('participant.wishlistItem.linkLabel') }}</label>
          <input
            :value="modelValue?.linkUrl || ''"
            @input="(e) => onChange('linkUrl', (e.target as HTMLInputElement).value)"
            type="url"
            class="form-control"
            :class="{ 'is-invalid': !!linkUrlError }"
            :placeholder="t('participant.wishlistItem.linkPlaceholder')"
            :aria-invalid="!!linkUrlError || undefined"
          />
          <div v-if="linkUrlError" class="invalid-feedback">{{ linkUrlError }}</div>
        </div>
        <div class="col-12 d-flex justify-content-end mt-2" v-if="removable">
          <button type="button" class="btn btn-sm btn-outline-danger" @click="$emit('remove')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </template>

    <!-- Detail/List mode -->
    <template v-else>
      <div class="d-flex align-items-center">
        <img
          v-if="modelValue?.imageUrl"
          class="rounded object-fit-cover me-2 flex-shrink-0"
          :src="modelValue.imageUrl"
          :alt="modelValue.title"
          width="40"
          height="40"
        />
        <i
          v-else-if="modelValue?.icon"
          class="me-2 bi"
          :class="`bi-${modelValue.icon}`"
          aria-hidden="true"
        ></i>
        <span class="flex-grow-1">
          <a
            v-if="modelValue?.linkUrl"
            :href="modelValue.linkUrl"
            target="_blank"
            rel="noopener noreferrer"
            >{{ modelValue?.title }}</a
          >
          <span v-else>{{ modelValue?.title }}</span>
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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

const { t } = useI18n()

const wrapperClass = computed(() => (props.asListItem ? 'list-group-item' : ''))

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
  const title = props.modelValue?.title?.trim() || ''
  return title.length === 0 ? t('participant.wishlistItem.titleRequired') : ''
})

const imageUrlError = computed(() =>
  props.modelValue?.imageUrl && !isValidUrl(props.modelValue.imageUrl)
    ? t('participant.wishlistItem.imageUrlInvalid')
    : '',
)

const linkUrlError = computed(() =>
  props.modelValue?.linkUrl && !isValidUrl(props.modelValue.linkUrl)
    ? t('participant.wishlistItem.linkUrlInvalid')
    : '',
)

const iconAndImageBoth = computed(() => !!(props.modelValue?.icon && props.modelValue?.imageUrl))
</script>
