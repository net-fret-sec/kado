<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ExchangeStatus } from '@kado/shared'
import BaseModal from '@/components/BaseModal.vue'

const props = defineProps<{
  modelValue: boolean
  name: string
  description?: string
  status?: ExchangeStatus
  eventDate?: string
  drawDeadlineAt?: string
  suggestionsDeadlineAt?: string
  budget?: number
  budgetCurrency?: string
  minWishlistSuggestions?: number
  lockSuggestionsAfterDraw?: boolean
  noMutualAssignments?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (
    event: 'submit',
    payload: {
      name: string
      description: string
      status: ExchangeStatus
      eventDate?: string
      drawDeadlineAt?: string
      suggestionsDeadlineAt?: string
      budget?: number
      budgetCurrency?: string
      minWishlistSuggestions: number
      lockSuggestionsAfterDraw: boolean
      noMutualAssignments: boolean
    },
  ): void
}>()

const { t } = useI18n()

const editName = ref('')
const editDescription = ref('')
const editStatus = ref<ExchangeStatus>('draft')
const editEventDate = ref('')
const editDrawDeadlineAtLocal = ref('')
const editSuggestionsDeadlineAtLocal = ref('')
const editBudget = ref<number | null>(null)
const editBudgetCurrency = ref('CAD')
const editMinWishlistSuggestions = ref(0)
const editLockSuggestionsAfterDraw = ref(true)
const editNoMutualAssignments = ref(false)

const showSuggestionsDeadlineInput = computed(() => !editLockSuggestionsAfterDraw.value)

const isSuggestionsDeadlineAfterExchangeMoment = computed(() => {
  if (editLockSuggestionsAfterDraw.value) return false
  if (!editEventDate.value || !editSuggestionsDeadlineAtLocal.value) return false

  const suggestionsDeadline = new Date(editSuggestionsDeadlineAtLocal.value)
  const exchangeMomentEnd = new Date(`${editEventDate.value}T23:59:59.999Z`)

  if (Number.isNaN(suggestionsDeadline.getTime()) || Number.isNaN(exchangeMomentEnd.getTime())) {
    return false
  }

  return suggestionsDeadline.getTime() > exchangeMomentEnd.getTime()
})

const isValid = computed(() => editName.value.trim().length > 0)

function syncFromProps() {
  editName.value = props.name || ''
  editDescription.value = props.description || ''
  editStatus.value = props.status || 'draft'
  editEventDate.value = props.eventDate || ''
  editDrawDeadlineAtLocal.value = props.drawDeadlineAt
    ? toLocalDateTimeInput(props.drawDeadlineAt)
    : ''
  editSuggestionsDeadlineAtLocal.value = props.suggestionsDeadlineAt
    ? toLocalDateTimeInput(props.suggestionsDeadlineAt)
    : ''
  editBudget.value = props.budget ?? null
  editBudgetCurrency.value = props.budgetCurrency || 'CAD'
  editMinWishlistSuggestions.value = props.minWishlistSuggestions ?? 0
  editLockSuggestionsAfterDraw.value = props.lockSuggestionsAfterDraw ?? true
  editNoMutualAssignments.value = props.noMutualAssignments ?? false
}

function toLocalDateTimeInput(isoValue: string) {
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return ''

  const tzOffsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16)
}

function localDateTimeToIso(value: string) {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      syncFromProps()
    }
  },
)

watch(editLockSuggestionsAfterDraw, (isLocked) => {
  if (isLocked) {
    editSuggestionsDeadlineAtLocal.value = ''
  }
})

function handleSubmit() {
  if (!isValid.value) return
  if (isSuggestionsDeadlineAfterExchangeMoment.value) return

  emit('submit', {
    name: editName.value,
    description: editDescription.value,
    status: editStatus.value,
    eventDate: editEventDate.value || undefined,
    drawDeadlineAt: localDateTimeToIso(editDrawDeadlineAtLocal.value),
    suggestionsDeadlineAt: editLockSuggestionsAfterDraw.value
      ? undefined
      : localDateTimeToIso(editSuggestionsDeadlineAtLocal.value),
    budget: editBudget.value ?? undefined,
    budgetCurrency: editBudgetCurrency.value || undefined,
    minWishlistSuggestions: editMinWishlistSuggestions.value,
    lockSuggestionsAfterDraw: editLockSuggestionsAfterDraw.value,
    noMutualAssignments: editNoMutualAssignments.value,
  })
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="t('exchangeDetail.editExchangeModal.title')"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <form id="editExchangeForm" @submit.prevent="handleSubmit">
      <div class="mb-3">
        <label for="editExchangeName" class="form-label">{{ t('exchangeDetail.name') }}</label>
        <input v-model="editName" type="text" class="form-control" id="editExchangeName" required />
      </div>
      <div class="mb-3">
        <label for="editExchangeDescription" class="form-label">{{
          t('exchangeDetail.description')
        }}</label>
        <textarea
          v-model="editDescription"
          class="form-control"
          id="editExchangeDescription"
        ></textarea>
      </div>
      <div class="mb-3">
        <label for="editExchangeStatus" class="form-label">{{ t('exchangeDetail.status') }}</label>
        <select v-model="editStatus" class="form-select" id="editExchangeStatus">
          <option value="draft">{{ t('exchangeDetail.statusValues.draft') }}</option>
          <option value="ready">{{ t('exchangeDetail.statusValues.ready') }}</option>
          <option value="drawn">{{ t('exchangeDetail.statusValues.drawn') }}</option>
          <option value="archived">{{ t('exchangeDetail.statusValues.archived') }}</option>
        </select>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-12 col-md-6">
          <label for="editExchangeEventDate" class="form-label">{{
            t('exchangeDetail.exchangeMoment')
          }}</label>
          <input
            v-model="editEventDate"
            type="date"
            class="form-control"
            id="editExchangeEventDate"
          />
        </div>
        <div class="col-12 col-md-6">
          <label for="editExchangeDrawDeadline" class="form-label">{{
            t('exchangeDetail.drawDeadlineAt')
          }}</label>
          <input
            v-model="editDrawDeadlineAtLocal"
            type="datetime-local"
            class="form-control"
            id="editExchangeDrawDeadline"
          />
        </div>
        <div v-if="showSuggestionsDeadlineInput" class="col-12 col-md-6">
          <label for="editExchangeSuggestionsDeadline" class="form-label">{{
            t('exchangeDetail.suggestionsDeadlineAt')
          }}</label>
          <input
            v-model="editSuggestionsDeadlineAtLocal"
            type="datetime-local"
            class="form-control"
            id="editExchangeSuggestionsDeadline"
          />
          <div v-if="isSuggestionsDeadlineAfterExchangeMoment" class="text-danger small mt-1">
            {{ t('apiErrors.SUGGESTIONS_DEADLINE_AFTER_EXCHANGE_MOMENT') }}
          </div>
        </div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-12 col-md-4">
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
          />
        </div>
        <div class="col-12 col-md-4">
          <label for="editExchangeBudgetCurrency" class="form-label">{{
            t('exchangeDetail.budgetCurrency')
          }}</label>
          <input
            v-model="editBudgetCurrency"
            type="text"
            maxlength="3"
            class="form-control text-uppercase"
            id="editExchangeBudgetCurrency"
          />
        </div>
        <div class="col-12 col-md-4">
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
          />
        </div>
      </div>
      <div class="mb-3">
        <label class="form-label d-block">{{ t('exchangeDetail.suggestionsLockModeLabel') }}</label>

        <div class="form-check">
          <input
            id="editLockSuggestionsModeFreeze"
            v-model="editLockSuggestionsAfterDraw"
            :value="true"
            class="form-check-input"
            type="radio"
            name="editLockSuggestionsMode"
          />
          <label class="form-check-label" for="editLockSuggestionsModeFreeze">
            {{ t('exchangeDetail.suggestionsLockModeFreeze') }}
          </label>
        </div>

        <div class="form-check">
          <input
            id="editLockSuggestionsModeNoFreeze"
            v-model="editLockSuggestionsAfterDraw"
            :value="false"
            class="form-check-input"
            type="radio"
            name="editLockSuggestionsMode"
          />
          <label class="form-check-label" for="editLockSuggestionsModeNoFreeze">
            {{ t('exchangeDetail.suggestionsLockModeNoFreeze') }}
          </label>
        </div>
      </div>
      <div class="mb-3 form-check">
        <input
          id="editNoMutualAssignments"
          v-model="editNoMutualAssignments"
          type="checkbox"
          class="form-check-input"
        />
        <label class="form-check-label" for="editNoMutualAssignments">
          {{ t('exchangeDetail.noMutualAssignments') }}
        </label>
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
        {{ t('actions.cancel') }}
      </button>
      <button type="submit" class="btn btn-primary" form="editExchangeForm" :disabled="!isValid">
        {{ t('exchangeDetail.editExchangeModal.submit') }}
      </button>
    </template>
  </BaseModal>
</template>
