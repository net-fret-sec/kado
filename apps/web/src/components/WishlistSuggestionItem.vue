<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { giftSuggestionSchema } from '@kado/shared'
import { safeUrl } from '@/composables/useSafeUrl'
import { useApi, isRequestAborted } from '@/composables/useApi'
import { useImageAccess, useImageLimits } from '@/composables/useImageAccess'
import { useSuggestionFiles, type SuggestionDraft } from '@/composables/useWishlist'
export type Mode = 'edit' | 'detail' | 'list'
const props = defineProps<{
  modelValue: SuggestionDraft
  mode?: Mode
  removable?: boolean
  showHandle?: boolean
  asListItem?: boolean
  disabled?: boolean
  participantId?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: SuggestionDraft]
  remove: []
  validating: [value: boolean]
}>()
const { t } = useI18n()
const uniqueId = `suggestion-${useId()}`
const files = useSuggestionFiles(),
  access = useImageAccess(),
  api = useApi()
const { limits, error: configError, refresh } = useImageLimits()
const container = ref<HTMLElement | null>(null),
  near = ref(typeof IntersectionObserver === 'undefined')
let observer: IntersectionObserver | undefined
onMounted(() => {
  if (typeof IntersectionObserver !== 'undefined' && container.value) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          near.value = true
          observer?.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(container.value)
  }
})
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const imageError = ref(''),
  imageUrl = ref(''),
  validating = ref(false)
let controller: AbortController | undefined,
  selection = 0
const titleError = computed(() =>
  giftSuggestionSchema.shape.title.safeParse(props.modelValue.title?.trim()).success
    ? ''
    : t('participant.wishlistItem.titleRequired'),
)
const linkError = computed(() =>
  giftSuggestionSchema.shape.linkUrl.safeParse(props.modelValue.linkUrl).success
    ? ''
    : t('participant.wishlistItem.linkUrlInvalid'),
)
function change(key: 'title' | 'linkUrl', value: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: value || undefined })
}
function clearPreview() {
  controller?.abort()
  controller = undefined
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}
watch(
  () => [
    near.value,
    props.modelValue.imageId,
    props.modelValue.pendingImage,
    access(props.participantId)?.scope,
  ],
  async () => {
    clearPreview()
    imageError.value = ''
    const file = props.modelValue.pendingImage
      ? files.get(props.modelValue.pendingImage)
      : undefined
    const authorization = access(props.participantId)
    if (file && authorization) {
      imageUrl.value = URL.createObjectURL(file)
      return
    }
    if (!near.value || !props.modelValue.imageId || !authorization) return
    const current = new AbortController()
    controller = current
    try {
      const blob = await api.blob(
        authorization.base + '/images/' + encodeURIComponent(props.modelValue.imageId),
        { headers: authorization.headers, signal: current.signal },
      )
      if (!current.signal.aborted) imageUrl.value = URL.createObjectURL(blob)
    } catch (cause) {
      if (!current.signal.aborted && !isRequestAborted(cause)) {
        imageError.value = t('images.unavailable')
        authorization.onError?.(cause)
      }
    }
  },
  { immediate: true },
)
async function selectFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (file) await acceptFile(file)
}
async function dropFile(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) await acceptFile(file)
}
async function acceptFile(file: File) {
  if (props.mode !== 'edit' || props.disabled || !limits.value) return
  const id = ++selection
  validating.value = true
  emit('validating', true)
  imageError.value = ''
  try {
    if (file.type && !limits.value.formats.includes(file.type)) throw new Error('format')
    if (file.size > limits.value.sourceBytes) throw new Error('size')
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      const pixels = bitmap.width * bitmap.height
      bitmap.close()
      if (pixels > limits.value.pixels) throw new Error('size')
    }
    if (id !== selection || props.disabled) return
    emit('update:modelValue', { ...props.modelValue, pendingImage: files.select(file) })
  } catch (cause) {
    if (id === selection)
      imageError.value = t(
        cause instanceof Error && cause.message === 'size'
          ? 'apiErrors.IMAGE_TOO_LARGE'
          : 'apiErrors.IMAGE_INVALID_FILE',
      )
  } finally {
    if (id === selection) {
      validating.value = false
      emit('validating', false)
    }
  }
}
function removeImage() {
  selection++
  emit('update:modelValue', { ...props.modelValue, imageId: undefined, pendingImage: undefined })
  imageError.value = ''
}
onBeforeUnmount(() => {
  selection++
  observer?.disconnect()
  clearPreview()
  emit('validating', false)
})
</script>
<template>
  <div ref="container" class="suggestion-item" :class="asListItem ? 'list-group-item' : ''">
    <div>
      <template v-if="mode === 'edit'">
        <input
          ref="fileInput"
          :id="`${uniqueId}-image`"
          type="file"
          class="visually-hidden"
          tabindex="-1"
          accept="image/jpeg,image/png,image/webp"
          :disabled="disabled || validating || !limits"
          @change="selectFile"
          :aria-label="t('images.label')"
        />
        <button
          type="button"
          class="suggestion-image-button"
          :class="{ 'is-dragging': dragging }"
          :disabled="disabled || validating || !limits"
          :title="t('review.imageHint')"
          :aria-label="t(imageUrl ? 'review.replaceImage' : 'review.addImage')"
          :aria-describedby="`${uniqueId}-image-help ${uniqueId}-image-error`"
          @click="fileInput?.click()"
          @dragover.prevent="dragging = !disabled"
          @dragleave.prevent="dragging = false"
          @drop.prevent="dropFile"
        >
          <img v-if="imageUrl" :src="imageUrl" alt="" class="suggestion-image" />
          <span v-else class="d-grid gap-1"
            ><i class="bi bi-gift suggestion-placeholder" aria-hidden="true"></i
            ><span class="small">{{ t('review.addImage') }}</span></span
          >
        </button>
        <button
          v-if="modelValue.imageId || modelValue.pendingImage"
          type="button"
          class="btn btn-sm btn-link p-0 mt-1"
          :disabled="disabled || validating"
          @click="removeImage"
        >
          {{ t('images.remove') }}
        </button>
      </template>
      <template v-else>
        <img v-if="imageUrl" :src="imageUrl" :alt="modelValue.title" class="suggestion-image" />
        <div v-else class="suggestion-image-button" aria-hidden="true">
          <i class="bi bi-gift suggestion-placeholder"></i>
        </div>
      </template>
    </div>
    <div class="suggestion-fields">
      <template v-if="mode === 'edit'">
        <div class="form-field mb-2">
          <label :for="`${uniqueId}-title`" class="form-label">{{
            t('fields.title')
          }}</label>
          <input
            :id="`${uniqueId}-title`"
            :value="modelValue.title"
            @input="change('title', ($event.target as HTMLInputElement).value)"
            :disabled="disabled"
            maxlength="200"
            required
            class="form-control"
            :aria-invalid="!!titleError"
            :aria-describedby="`${uniqueId}-title-error`"
          />
          <p v-if="titleError" :id="`${uniqueId}-title-error`" class="text-danger">
            {{ titleError }}
          </p>
        </div>
        <div class="form-field">
          <label :for="`${uniqueId}-linkUrl`" class="form-label">{{
            t('participant.wishlistItem.linkLabel')
          }}</label>
          <input
            :id="`${uniqueId}-linkUrl`"
            :value="modelValue.linkUrl || ''"
            @input="change('linkUrl', ($event.target as HTMLInputElement).value)"
            :disabled="disabled"
            maxlength="2048"
            type="url"
            class="form-control"
            :placeholder="t('participant.wishlistItem.linkPlaceholder')"
            :aria-invalid="!!linkError"
            :aria-describedby="`${uniqueId}-link-error`"
          />
          <p v-if="linkError" :id="`${uniqueId}-link-error`" class="text-danger">{{ linkError }}</p>
        </div>
      </template>
      <template v-else>
        <p class="fw-semibold mb-1">{{ modelValue.title }}</p>
        <a
          v-if="safeUrl(modelValue.linkUrl)"
          :href="safeUrl(modelValue.linkUrl)"
          target="_blank"
          rel="noopener noreferrer"
          >{{ modelValue.linkUrl }}</a
        >
      </template>
    </div>
    <div class="suggestion-help">
      <p v-if="mode === 'edit'" :id="`${uniqueId}-image-help`" class="visually-hidden">
        {{ t('review.imageHint') }}
        <span v-if="limits">{{
          t('review.imageLimit', {
            size: (limits.sourceBytes / 1048576).toFixed(1),
            pixels: limits.pixels / 1000000,
          })
        }}</span>
      </p>
      <button
        v-if="mode === 'edit' && configError"
        type="button"
        class="btn btn-link"
        @click="refresh"
      >
        {{ t('p2.retryConfig') }}
      </button>
      <p v-if="validating" role="status" class="form-text">{{ t('images.validating') }}</p>
      <p v-if="imageError" :id="`${uniqueId}-image-error`" class="text-danger mb-0" role="alert">
        {{ imageError }}
      </p>
    </div>
  </div>
</template>
