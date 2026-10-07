<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  updateExchangeInputSchema,
  type ExchangeDto,
  type UpdateExchangeInputDto,
} from '@kado/shared'
import { clone, equal, useConflict, type FormValues } from '@/composables/useConflict'
import { useDraftGuard, confirmDiscard } from '@/composables/useDraftGuard'
import ConflictReview from './ConflictReview.vue'
import BaseModal from '@/components/BaseModal.vue'

const props = defineProps<{
  updatedAt: string
  suspended?: boolean
  conflictVersion?: ExchangeDto | null
  saveError?: string | null
  fieldErrors?: Record<string, string[]>
  modelValue: boolean
  rulesLocked?: boolean
  contentLocked?: boolean
  isSubmitting?: boolean
  name: string
  organizerName?: string
  organizerEditable?: boolean
  description?: string
  eventDate?: string
  budget?: number
  minWishlistSuggestions?: number
  lockSuggestionsAfterDraw?: boolean
  noMutualAssignments?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit', payload: UpdateExchangeInputDto): void
  (event: 'dirty', value: boolean): void
}>()

const { t } = useI18n()

const editName = ref('')
const editOrganizerName = ref('')
const editDescription = ref('')
const editEventDate = ref('')
const editBudget = ref<number | null>(null)
const editMinWishlistSuggestions = ref(0)
const editLockSuggestionsAfterDraw = ref(true)
const editNoMutualAssignments = ref(false)

const baselineVersion = ref('')
const conflict = useConflict()
const { remote, fields, choices, ready } = conflict
function values(): FormValues {
  return {
    name: editName.value,
    ...(props.organizerEditable ? { organizerName: editOrganizerName.value } : {}),
    description: editDescription.value,
    eventDate: editEventDate.value,
    budget: editBudget.value,
    minWishlistSuggestions: editMinWishlistSuggestions.value,
    lockSuggestionsAfterDraw: editLockSuggestionsAfterDraw.value,
    noMutualAssignments: editNoMutualAssignments.value,
  }
}
function setValues(value: FormValues) {
  editName.value = String(value.name ?? '')
  editOrganizerName.value = String(value.organizerName ?? '')
  editDescription.value = String(value.description ?? '')
  editEventDate.value = String(value.eventDate ?? '')
  editBudget.value = value.budget == null ? null : Number(value.budget)
  editMinWishlistSuggestions.value = Number(value.minWishlistSuggestions ?? 0)
  editLockSuggestionsAfterDraw.value = Boolean(value.lockSuggestionsAfterDraw)
  editNoMutualAssignments.value = Boolean(value.noMutualAssignments)
}
function serverValues(current: ExchangeDto): FormValues {
  return {
    name: current.name,
    ...(!current.organizerId ? { organizerName: current.organizerName ?? '' } : {}),
    description: current.description ?? '',
    eventDate: current.eventDate ?? '',
    budget: current.budget ?? null,
    minWishlistSuggestions: current.minWishlistSuggestions ?? 0,
    lockSuggestionsAfterDraw: current.lockSuggestionsAfterDraw ?? true,
    noMutualAssignments: current.noMutualAssignments ?? false,
  }
}
const dirty = computed(() => props.modelValue && !equal(values(), conflict.baseline.value))
useDraftGuard(dirty)
watch(dirty, (value) => emit('dirty', value))
function beforeClose() {
  return props.suspended || (!props.isSubmitting && (!dirty.value || confirmDiscard()))
}
function payload(): UpdateExchangeInputDto {
  return {
    name: editName.value,
    ...(props.organizerEditable ? { organizerName: editOrganizerName.value } : {}),
    description: editDescription.value || undefined,
    eventDate: toDateInput(editEventDate.value) || undefined,
    budget: editBudget.value ?? undefined,
    minWishlistSuggestions: editMinWishlistSuggestions.value,
    lockSuggestionsAfterDraw: editLockSuggestionsAfterDraw.value,
    noMutualAssignments: editNoMutualAssignments.value,
    expectedUpdatedAt: baselineVersion.value,
  }
}
const isValid = computed(() => updateExchangeInputSchema.safeParse(payload()).success)

function syncFromProps() {
  editName.value = props.name || ''
  editOrganizerName.value = props.organizerName || ''
  editDescription.value = props.description || ''
  editEventDate.value = toDateInput(props.eventDate)
  editBudget.value = props.budget ?? null
  editMinWishlistSuggestions.value = props.minWishlistSuggestions ?? 0
  editLockSuggestionsAfterDraw.value = props.lockSuggestionsAfterDraw ?? true
  editNoMutualAssignments.value = props.noMutualAssignments ?? false
}

function toDateInput(value?: string) {
  if (!value) return ''

  // Keep already valid date-only values untouched.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  // Accept ISO-like values by extracting the date portion.
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      syncFromProps()
      conflict.baseline.value = clone(values())
      baselineVersion.value = props.updatedAt
      remote.value = null
    }
  },
)

watch(
  () => props.conflictVersion,
  (current) => {
    if (!current || !props.modelValue) return
    const locked = current.isArchived
      ? Object.keys(serverValues(current))
      : current.isDrawn
        ? [
            'organizerName',
            'minWishlistSuggestions',
            'lockSuggestionsAfterDraw',
            'noMutualAssignments',
          ]
        : []
    conflict.open(values(), serverValues(current), locked)
  },
)
function applyConflict() {
  const current = conflict.apply()
  if (current && props.conflictVersion) {
    setValues(current)
    baselineVersion.value = props.conflictVersion.updatedAt
  }
}
function handleSubmit() {
  if (props.isSubmitting || props.contentLocked || !isValid.value || remote.value) return
  emit('submit', payload())
}
function visibility(value: boolean) {
  if (!props.suspended) emit('update:modelValue', value)
}
</script>

<template>
  <BaseModal
    :model-value="modelValue && !suspended"
    :before-close="beforeClose"
    :title="t('exchangeDetail.editExchangeModal.title')"
    size="lg"
    @update:model-value="visibility"
  >
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
    <form id="editExchangeForm" @submit.prevent="handleSubmit">
      <fieldset :disabled="contentLocked || isSubmitting || !!remote">
        <div v-if="organizerEditable" class="mb-3">
          <label for="editOrganizerName" class="form-label">{{
            t('exchangeDetail.organizer')
          }}</label>
          <input
            id="editOrganizerName"
            :aria-invalid="!!fieldErrors?.organizerName || undefined"
            :aria-describedby="fieldErrors?.organizerName ? 'editOrganizerName-error' : undefined"
            v-model="editOrganizerName"
            :disabled="rulesLocked"
            class="form-control"
            maxlength="150"
            required
          />
          <p v-if="fieldErrors?.organizerName" id="editOrganizerName-error" class="text-danger">
            {{ t('p2.invalidField') }}
          </p>
        </div>
        <div class="mb-3">
          <label for="editExchangeName" class="form-label">{{ t('exchangeDetail.name') }}</label>
          <input
            v-model="editName"
            type="text"
            class="form-control"
            id="editExchangeName"
            :aria-invalid="!!fieldErrors?.name || undefined"
            :aria-describedby="fieldErrors?.name ? 'editExchangeName-error' : undefined"
            required
          />
          <p v-if="fieldErrors?.name" id="editExchangeName-error" class="text-danger">
            {{ t('p2.invalidField') }}
          </p>
        </div>
        <div class="mb-3">
          <label for="editExchangeDescription" class="form-label">{{
            t('exchangeDetail.description')
          }}</label>
          <textarea
            v-model="editDescription"
            class="form-control"
            id="editExchangeDescription"
            :aria-invalid="!!fieldErrors?.description || undefined"
            :aria-describedby="
              fieldErrors?.description ? 'editExchangeDescription-error' : undefined
            "
          ></textarea>
          <p v-if="fieldErrors?.description" id="editExchangeDescription-error" class="text-danger">
            {{ t('p2.invalidField') }}
          </p>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-12">
            <label for="editExchangeEventDate" class="form-label">{{
              t('exchangeDetail.exchangeMoment')
            }}</label>
            <input
              v-model="editEventDate"
              type="date"
              class="form-control"
              id="editExchangeEventDate"
              :aria-invalid="!!fieldErrors?.eventDate || undefined"
              :aria-describedby="fieldErrors?.eventDate ? 'editExchangeEventDate-error' : undefined"
            />
            <p v-if="fieldErrors?.eventDate" id="editExchangeEventDate-error" class="text-danger">
              {{ t('p2.invalidField') }}
            </p>
          </div>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-12 col-md-6">
            <label for="editExchangeBudget" class="form-label">{{
              t('exchangeDetail.budget')
            }}</label>
            <input
              v-model.number="editBudget"
              type="number"
              min="0"
              step="0.01"
              class="form-control"
              id="editExchangeBudget"
              :aria-invalid="!!fieldErrors?.budget || undefined"
              :aria-describedby="fieldErrors?.budget ? 'editExchangeBudget-error' : undefined"
            />
            <p v-if="fieldErrors?.budget" id="editExchangeBudget-error" class="text-danger">
              {{ t('p2.invalidField') }}
            </p>
          </div>
          <div class="col-12 col-md-6">
            <label for="editExchangeMinSuggestions" class="form-label">{{
              t('exchangeDetail.minWishlistSuggestions')
            }}</label>
            <input
              v-model.number="editMinWishlistSuggestions"
              type="number"
              min="0"
              max="100"
              step="1"
              class="form-control"
              id="editExchangeMinSuggestions"
              :aria-invalid="!!fieldErrors?.minWishlistSuggestions || undefined"
              :aria-describedby="
                fieldErrors?.minWishlistSuggestions ? 'editExchangeMinSuggestions-error' : undefined
              "
              :disabled="rulesLocked"
            />
            <p
              v-if="fieldErrors?.minWishlistSuggestions"
              id="editExchangeMinSuggestions-error"
              class="text-danger"
            >
              {{ t('p2.invalidField') }}
            </p>
          </div>
        </div>
        <div class="mb-3 form-check">
          <input
            id="editLockSuggestionsAfterDraw"
            :disabled="rulesLocked"
            v-model="editLockSuggestionsAfterDraw"
            type="checkbox"
            class="form-check-input"
          />
          <label class="form-check-label" for="editLockSuggestionsAfterDraw">
            {{ t('exchangeDetail.lockSuggestionsAfterDraw') }}
          </label>
        </div>
        <div class="mb-3 form-check">
          <input
            id="editNoMutualAssignments"
            :disabled="rulesLocked"
            v-model="editNoMutualAssignments"
            type="checkbox"
            class="form-check-input"
          />
          <label class="form-check-label" for="editNoMutualAssignments">
            {{ t('exchangeDetail.noMutualAssignments') }}
          </label>
        </div>
      </fieldset>
    </form>

    <template #footer>
      <button
        type="submit"
        class="btn btn-primary order-2"
        form="editExchangeForm"
        :disabled="contentLocked || !isValid || !!props.isSubmitting || !!remote"
      >
        {{ t('exchangeDetail.editExchangeModal.submit') }}
      </button>
      <button type="button" class="btn btn-link order-1" data-bs-dismiss="modal" :disabled="isSubmitting">
        {{ t('actions.cancel') }}
      </button>
    </template>
  </BaseModal>
</template>
