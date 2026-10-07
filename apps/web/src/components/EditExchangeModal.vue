<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/BaseModal.vue'

const props = defineProps<{
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
  (
    event: 'submit',
    payload: {
      name: string
      organizerName?: string
      description: string
      eventDate?: string
      budget?: number
      minWishlistSuggestions: number
      lockSuggestionsAfterDraw: boolean
      noMutualAssignments: boolean
    },
  ): void
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

const isValid = computed(() => editName.value.trim().length > 0)

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
    }
  },
)

function handleSubmit() {
  if (props.isSubmitting || props.contentLocked) return
  if (!isValid.value) return

  emit('submit', {
    name: editName.value,
    ...(props.organizerEditable ? { organizerName: editOrganizerName.value } : {}),
    description: editDescription.value,
    eventDate: toDateInput(editEventDate.value) || undefined,
    budget: editBudget.value ?? undefined,
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
    size="lg"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <form id="editExchangeForm" @submit.prevent="handleSubmit">
      <fieldset :disabled="contentLocked">
        <div v-if="organizerEditable" class="mb-3">
          <label for="editOrganizerName" class="form-label">{{
            t('exchangeDetail.organizer')
          }}</label>
          <input
            id="editOrganizerName"
            v-model="editOrganizerName"
            :disabled="rulesLocked"
            class="form-control"
            maxlength="150"
            required
          />
        </div>
        <div class="mb-3">
          <label for="editExchangeName" class="form-label">{{ t('exchangeDetail.name') }}</label>
          <input
            v-model="editName"
            type="text"
            class="form-control"
            id="editExchangeName"
            required
          />
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
            />
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
            />
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
              :disabled="rulesLocked"
            />
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
        :disabled="contentLocked || !isValid || !!props.isSubmitting"
      >
        {{ t('exchangeDetail.editExchangeModal.submit') }}
      </button>
      <button type="button" class="btn btn-link order-1" data-bs-dismiss="modal">
        {{ t('actions.cancel') }}
      </button>
    </template>
  </BaseModal>
</template>
