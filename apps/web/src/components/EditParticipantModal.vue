<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  updateParticipantInputSchema,
  type ParticipantDto,
  type UpdateParticipantInputDto,
} from '@kado/shared'
import { useImageAccess } from '@/composables/useImageAccess'
import { getApiErrorMessage } from '@/composables/useApiErrorMessage'
import BaseModal from './BaseModal.vue'
import WishlistEditor from './WishlistEditor.vue'
import ConflictReview from './ConflictReview.vue'
import { useWishlist, serializeWishlist, draftWishlist } from '@/composables/useWishlist'
import { clone, equal, useConflict, type FormValues } from '@/composables/useConflict'
import { confirmDiscard, useDraftGuard } from '@/composables/useDraftGuard'
const props = defineProps<{
  modelValue: boolean
  identityLocked?: boolean
  suggestionsLocked?: boolean
  participant: ParticipantDto | null
  isSubmitting?: boolean
  suspended?: boolean
  saveError?: string | null
  conflictVersion?: ParticipantDto | null
  fieldErrors?: Record<string, string[]>
}>()
const emit = defineEmits<{
  uploading: [value: boolean]
  'upload-error': [cause: unknown]
  'update:modelValue': [value: boolean]
  submit: [payload: UpdateParticipantInputDto]
  dirty: [value: boolean]
}>()
const { t } = useI18n()
const name = ref(''),
  email = ref(''),
  note = ref('')
const { wishlist, hydrate, uploadImages, cancelUploads } = useWishlist()
const imageValidating = ref(false),
  uploading = ref(false),
  uploadError = ref('')
const imageAccess = useImageAccess()
const imagesBusy = computed(() => imageValidating.value || uploading.value)
const baselineVersion = ref('')
const conflict = useConflict()
const { remote, fields, choices, ready } = conflict
function values(): FormValues {
  return {
    name: name.value,
    email: email.value,
    note: note.value,
    wishlist: draftWishlist(wishlist.value),
  }
}
function participantValues(p: ParticipantDto): FormValues {
  return { name: p.name, email: p.email ?? '', note: p.note ?? '', wishlist: p.wishlist ?? [] }
}
function setValues(value: FormValues) {
  name.value = String(value.name ?? '')
  email.value = String(value.email ?? '')
  note.value = String(value.note ?? '')
  hydrate((value.wishlist ?? []) as NonNullable<ParticipantDto['wishlist']>)
}
const dirty = computed(() => props.modelValue && !equal(values(), conflict.baseline.value))
useDraftGuard(dirty)
watch(dirty, (value) => emit('dirty', value))
function beforeClose() {
  return (
    props.suspended ||
    (!props.isSubmitting && !imagesBusy.value && (!dirty.value || confirmDiscard()))
  )
}
function payload(): UpdateParticipantInputDto {
  return {
    name: name.value,
    email: email.value || undefined,
    note: note.value || undefined,
    wishlist: serializeWishlist(wishlist.value),
    expectedUpdatedAt: baselineVersion.value,
  }
}
const valid = computed(() => updateParticipantInputSchema.safeParse(payload()).success)
watch(
  () => props.modelValue,
  (open) => {
    if (!open || !props.participant) return
    const current = participantValues(props.participant)
    setValues(current)
    conflict.baseline.value = clone(current)
    baselineVersion.value = props.participant.updatedAt
    remote.value = null
  },
)
watch(
  () => props.conflictVersion,
  (current) => {
    if (!current || !props.modelValue) return
    const locked = props.identityLocked ? ['name', 'email'] : []
    if (props.suggestionsLocked) locked.push('note', 'wishlist')
    conflict.open(values(), participantValues(current), locked)
  },
)
function applyConflict() {
  const value = conflict.apply()
  if (value && props.conflictVersion) {
    setValues(value)
    baselineVersion.value = props.conflictVersion.updatedAt
  }
}
async function submit() {
  if (
    props.isSubmitting ||
    imagesBusy.value ||
    props.suggestionsLocked ||
    !valid.value ||
    remote.value ||
    !props.participant
  )
    return
  uploading.value = true
  uploadError.value = ''
  emit('uploading', true)
  try {
    const access = imageAccess(props.participant.id)
    if (wishlist.value.some((s) => s.pendingImage)) {
      if (!access) throw new Error('Session unavailable')
      await uploadImages(access.base, { headers: access.headers })
    }
    if (props.modelValue && !props.suspended) emit('submit', payload())
  } catch (cause) {
    if (props.modelValue) {
      uploadError.value = getApiErrorMessage(cause)
      emit('upload-error', cause)
    }
  } finally {
    uploading.value = false
    emit('uploading', false)
  }
}
function visibility(value: boolean) {
  if (!props.suspended) emit('update:modelValue', value)
}
watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      cancelUploads()
      hydrate([])
      uploadError.value = ''
    }
  },
)
</script>
<template>
  <BaseModal
    :model-value="modelValue && !suspended"
    :before-close="beforeClose"
    :title="t('exchangeDetail.editModal.title')"
    size="lg"
    @update:model-value="visibility"
  >
    <p v-if="uploadError && !saveError" class="alert alert-danger" role="alert">
      {{ uploadError }}
    </p>
    <p v-if="saveError" class="alert alert-danger" role="alert">{{ saveError }}</p>
    <p v-if="dirty" class="small text-body-secondary">{{ t('p2.unsaved') }}</p>
    <ConflictReview
      v-if="remote"
      :fields="fields"
      :choices="choices"
      :ready="ready"
      :current="remote"
      @choice="(key, choice) => (choices[key] = choice)"
      @apply="applyConflict"
    />
    <form id="editParticipantForm" @submit.prevent="submit">
      <div class="mb-3">
        <label for="editParticipantName" class="form-label">{{
          t('exchangeDetail.addModal.name')
        }}</label
        ><input
          id="editParticipantName"
          v-model="name"
          class="form-control"
          maxlength="150"
          :readonly="identityLocked"
          :disabled="isSubmitting || uploading || !!remote"
          :aria-invalid="!!fieldErrors?.name || undefined"
          :aria-describedby="fieldErrors?.name ? 'edit-name-error' : undefined"
          required
        />
        <p v-if="fieldErrors?.name" id="edit-name-error" class="text-danger">
          {{ t('p2.invalidField') }}
        </p>
      </div>
      <div class="mb-3">
        <label for="editParticipantNote" class="form-label">{{
          t('exchangeDetail.addModal.note')
        }}</label
        ><textarea
          id="editParticipantNote"
          v-model="note"
          class="form-control"
          maxlength="2000"
          :readonly="suggestionsLocked"
          :disabled="isSubmitting || uploading || !!remote"
          :aria-invalid="!!fieldErrors?.note || undefined"
          :aria-describedby="fieldErrors?.note ? 'edit-note-error' : undefined"
        ></textarea>
        <p v-if="fieldErrors?.note" id="edit-note-error" class="text-danger">
          {{ t('p2.invalidField') }}
        </p>
      </div>
      <h3 class="h6">{{ t('exchangeDetail.addModal.wishlist') }}</h3>
      <WishlistEditor
        v-model="wishlist"
        :locked="suggestionsLocked"
        :participant-id="participant?.id"
        @validating="imageValidating = $event"
        :busy="isSubmitting || uploading || !!remote"
      />
      <p v-if="fieldErrors?.wishlist" class="text-danger">{{ t('p2.invalidField') }}</p>
    </form>
    <template #footer>
      <button
        type="submit"
        class="btn btn-primary order-2"
        form="editParticipantForm"
        :disabled="suggestionsLocked || !valid || isSubmitting || imagesBusy || !!remote"
      >
        {{ t('exchangeDetail.editModal.submit') }}
      </button>
      <button
        type="button"
        class="btn btn-link order-1"
        data-bs-dismiss="modal"
        :disabled="isSubmitting || imagesBusy"
      >
        {{ t('actions.cancel') }}
      </button>
    </template>
  </BaseModal>
</template>
