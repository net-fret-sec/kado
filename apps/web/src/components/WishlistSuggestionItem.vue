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
  if (!file || props.disabled || !limits.value) return
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
  <div ref="container" :class="asListItem ? 'list-group-item' : ''">
    <div v-if="mode === 'edit'" class="row g-2">
      <div class="col-12">
        <label :for="`${uniqueId}-title`" class="form-label">{{
          t('participant.wishlistItem.titleLabel')
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
          :aria-describedby="titleError ? `${uniqueId}-title-error` : undefined"
        />
        <p v-if="titleError" :id="`${uniqueId}-title-error`" class="text-danger">
          {{ titleError }}
        </p>
      </div>
      <div class="col-12">
        <label :for="`${uniqueId}-image`" class="form-label">{{ t('images.label') }}</label>
        <input
          :id="`${uniqueId}-image`"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          :disabled="disabled || validating || !limits"
          @change="selectFile"
          class="form-control"
          :aria-invalid="!!imageError"
          :aria-describedby="`${uniqueId}-image-help ${uniqueId}-image-error`"
        />
        <p :id="`${uniqueId}-image-help`" class="form-text">
          {{
            limits
              ? t('images.help', {
                  size: (limits.sourceBytes / 1048576).toFixed(1),
                  dimension: limits.dimension,
                  pixels: limits.pixels / 1000000,
                  output: Math.floor(limits.outputBytes / 1024),
                })
              : t('images.loadingConfig')
          }}
        </p>
        <button v-if="configError" type="button" class="btn btn-link" @click="refresh">
          {{ t('p2.retryConfig') }}
        </button>
        <p v-if="validating" role="status">{{ t('images.validating') }}</p>
        <p :id="`${uniqueId}-image-error`" class="text-danger" role="alert">{{ imageError }}</p>
        <img
          v-if="imageUrl"
          :src="imageUrl"
          :alt="modelValue.title"
          class="rounded object-fit-contain"
          width="120"
          height="120"
        />
        <button
          v-if="modelValue.imageId || modelValue.pendingImage"
          type="button"
          :disabled="disabled || validating"
          class="btn btn-sm btn-outline-secondary ms-2"
          @click="removeImage"
        >
          {{ t('images.remove') }}
        </button>
      </div>
      <div class="col-12">
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
          :aria-describedby="linkError ? `${uniqueId}-link-error` : undefined"
        />
        <p v-if="linkError" :id="`${uniqueId}-link-error`" class="text-danger">{{ linkError }}</p>
      </div>
      <button
        v-if="removable"
        type="button"
        :disabled="disabled"
        class="btn btn-outline-danger"
        @click="$emit('remove')"
      >
        {{ t('exchangeDetail.delete') }}
      </button>
    </div>
    <div v-else class="d-flex align-items-center">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="modelValue.title"
        width="40"
        height="40"
        class="rounded object-fit-cover me-2 flex-shrink-0"
      />
      <span class="flex-grow-1"
        ><a
          v-if="safeUrl(modelValue.linkUrl)"
          :href="safeUrl(modelValue.linkUrl)"
          target="_blank"
          rel="noopener noreferrer"
          >{{ modelValue.title }}</a
        ><span v-else>{{ modelValue.title }}</span></span
      >
      <span v-if="imageError" class="small text-body-secondary" role="status">{{
        imageError
      }}</span>
    </div>
  </div>
</template>
