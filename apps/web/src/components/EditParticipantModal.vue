<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  updateParticipantInputSchema,
  type ParticipantDto,
  type UpdateParticipantInputDto,
} from '@kado/shared'
import { useImageAccess } from '@/composables/useImageAccess'
import { getApiErrorMessage } from '@/composables/useApiErrorMessage'
import { useAutosave } from '@/composables/useAutosave'
import AutosaveStatus from './AutosaveStatus.vue'
import BaseModal from './BaseModal.vue'
import WishlistEditor from './WishlistEditor.vue'
import ConflictReview from './ConflictReview.vue'
import { useWishlist, serializeWishlist, draftWishlist } from '@/composables/useWishlist'
import { clone, equal, useConflict, type FormValues } from '@/composables/useConflict'
import { confirmDiscard, useDraftGuard } from '@/composables/useDraftGuard'
const props = defineProps<{
  modelValue: boolean
  saveParticipant: (payload: UpdateParticipantInputDto) => Promise<ParticipantDto | undefined>
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
  dirty: [value: boolean]
}>()
const { t } = useI18n()
const name = ref(''),
  email = ref(''),
  note = ref('')
const { wishlist, hydrate, acknowledge, uploadImages, cancelUploads } = useWishlist()
const imageValidating = ref(false),
  saving = ref(false),
  closing = ref(false),
  uploadError = ref('')
const imageAccess = useImageAccess()
const imagesBusy = computed(() => imageValidating.value || saving.value)
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
  if (props.suspended) return true
  if (props.isSubmitting || imagesBusy.value || closing.value) return false
  if (!dirty.value) return true
  void nextTick(close)
  return false
}
function profilePayload(): UpdateParticipantInputDto {
  return { ...(props.identityLocked ? {} : { name: name.value.trim() }), note: note.value.trim() }
}
const profileDirty = computed(
  () =>
    props.modelValue &&
    (name.value !== conflict.baseline.value.name || note.value !== conflict.baseline.value.note),
)
const profileValid = computed(
  () =>
    name.value.trim().length > 0 &&
    updateParticipantInputSchema.safeParse(profilePayload()).success,
)
const suggestionsDirty = computed(
  () => props.modelValue && !equal(draftWishlist(wishlist.value), conflict.baseline.value.wishlist),
)
const suggestionsValid = computed(
  () =>
    updateParticipantInputSchema.safeParse({ wishlist: serializeWishlist(wishlist.value) }).success,
)
const autosave = useAutosave({
  dirty: suggestionsDirty,
  valid: suggestionsValid,
  active: computed(() => props.modelValue && !props.suspended && !props.suggestionsLocked),
  blocked: computed(() => !!props.isSubmitting || imagesBusy.value || !!remote.value),
  save: () => submit('suggestions'),
})
const { status: autosaveStatus } = autosave
const profileAutosave = useAutosave({
  dirty: profileDirty,
  valid: profileValid,
  active: computed(() => props.modelValue && !props.suspended && !props.suggestionsLocked),
  blocked: computed(() => !!props.isSubmitting || imagesBusy.value || !!remote.value),
  save: () => submit('profile'),
})
const { status: profileStatus } = profileAutosave
const canSaveBeforeClose = computed(
  () =>
    !remote.value &&
    ((profileDirty.value && profileValid.value) ||
      (suggestionsDirty.value && suggestionsValid.value)),
)
async function close() {
  if (props.isSubmitting || imagesBusy.value || closing.value || props.suspended) return
  autosave.cancel()
  profileAutosave.cancel()
  closing.value = true
  try {
    if (!remote.value) {
      if (profileDirty.value && profileValid.value && !(await profileAutosave.saveNow())) return
      if (suggestionsDirty.value && suggestionsValid.value && !(await autosave.saveNow())) return
    }
    if (dirty.value && !confirmDiscard()) return
    emit('update:modelValue', false)
  } finally {
    closing.value = false
  }
}
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
async function submit(scope: 'profile' | 'suggestions'): Promise<boolean> {
  const suggestionsOnly = scope === 'suggestions'
  if (
    props.isSubmitting ||
    saving.value ||
    imageValidating.value ||
    props.suggestionsLocked ||
    !(suggestionsOnly ? suggestionsDirty.value : profileDirty.value) ||
    !(suggestionsOnly ? suggestionsValid.value : profileValid.value) ||
    remote.value ||
    !props.participant
  )
    return false
  if (suggestionsOnly) autosave.cancel()
  else profileAutosave.cancel()
  saving.value = true
  uploadError.value = ''
  emit('uploading', true)
  try {
    const access = imageAccess(props.participant.id)
    if (suggestionsOnly && wishlist.value.some((s) => s.pendingImage)) {
      if (!access) throw new Error('Session unavailable')
      await uploadImages(access.base, { headers: access.headers })
    }
    if (!props.modelValue || props.suspended) return false
    const current = await props.saveParticipant({
      ...(suggestionsOnly ? { wishlist: serializeWishlist(wishlist.value) } : profilePayload()),
      expectedUpdatedAt: baselineVersion.value,
    })
    if (!current || !props.modelValue) return false
    if (suggestionsOnly) {
      acknowledge(current.wishlist ?? [])
      conflict.baseline.value.wishlist = clone(current.wishlist ?? [])
    } else {
      name.value = current.name
      note.value = current.note ?? ''
      conflict.baseline.value.name = name.value
      conflict.baseline.value.note = note.value
    }
    baselineVersion.value = current.updatedAt
    return true
  } catch (cause) {
    if (props.modelValue) {
      uploadError.value = getApiErrorMessage(cause)
      emit('upload-error', cause)
    }
    return false
  } finally {
    saving.value = false
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
    <form id="editParticipantForm" novalidate @submit.prevent="profileAutosave.saveNow()">
      <div class="mb-3 form-field">
        <label for="editParticipantName" class="form-label">{{ t('fields.name') }}</label
        ><input
          id="editParticipantName"
          v-model="name"
          @blur="profileAutosave.request"
          class="form-control"
          maxlength="150"
          :readonly="identityLocked"
          :disabled="isSubmitting || saving || !!remote"
          :aria-invalid="!name.trim() || !!fieldErrors?.name || undefined"
          :aria-describedby="!name.trim() || fieldErrors?.name ? 'edit-name-error' : undefined"
          required
        />
        <p v-if="!name.trim() || fieldErrors?.name" id="edit-name-error" class="text-danger">
          {{ t('p2.invalidField') }}
        </p>
      </div>
      <div class="mb-3 form-field">
        <label for="editParticipantNote" class="form-label">{{ t('common.comment') }}</label
        ><textarea
          id="editParticipantNote"
          v-model="note"
          @blur="profileAutosave.request"
          class="form-control"
          maxlength="2000"
          :readonly="suggestionsLocked"
          :disabled="isSubmitting || saving || !!remote"
          :aria-invalid="!!fieldErrors?.note || undefined"
          :aria-describedby="fieldErrors?.note ? 'edit-note-error' : undefined"
        ></textarea>
        <p v-if="fieldErrors?.note" id="edit-note-error" class="text-danger">
          {{ t('p2.invalidField') }}
        </p>
      </div>
      <AutosaveStatus
        v-if="!suggestionsLocked"
        profile
        :status="profileStatus"
        :retry-disabled="!profileValid || isSubmitting || saving || !!remote"
        @retry="profileAutosave.saveNow"
      />
    </form>
    <div class="mt-3">
      <h3 class="h6">{{ t('fields.wishlist') }}</h3>
      <WishlistEditor
        @commit="autosave.request"
        v-model="wishlist"
        :locked="suggestionsLocked"
        :participant-id="participant?.id"
        @validating="imageValidating = $event"
        :busy="isSubmitting || saving || !!remote"
      />
      <AutosaveStatus
        v-if="!suggestionsLocked"
        :status="autosaveStatus"
        :retry-disabled="!suggestionsValid || isSubmitting || imagesBusy || !!remote"
        @retry="autosave.request"
      />
      <p v-if="fieldErrors?.wishlist" class="text-danger">{{ t('p2.invalidField') }}</p>
    </div>
    <slot name="exclusions" />
    <template #footer>
      <button
        type="button"
        class="btn btn-primary participant-close"
        :disabled="isSubmitting || imagesBusy || closing"
        @click="close"
      >
        {{
          isSubmitting || saving || closing
            ? t('autosave.savingChanges')
            : canSaveBeforeClose
              ? t('autosave.saveAndClose')
              : t('actions.close')
        }}
      </button>
    </template>
  </BaseModal>
</template>
