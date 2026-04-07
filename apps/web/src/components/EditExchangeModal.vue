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
      noMutualAssignments: boolean
    },
  ): void
}>()

const { t } = useI18n()

const editName = ref('')
const editDescription = ref('')
const editStatus = ref<ExchangeStatus>('draft')
const editNoMutualAssignments = ref(false)

const isValid = computed(() => editName.value.trim().length > 0)

function syncFromProps() {
  editName.value = props.name || ''
  editDescription.value = props.description || ''
  editStatus.value = props.status || 'draft'
  editNoMutualAssignments.value = props.noMutualAssignments ?? false
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
  if (!isValid.value) return

  emit('submit', {
    name: editName.value,
    description: editDescription.value,
    status: editStatus.value,
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
        <input
          v-model="editDescription"
          type="text"
          class="form-control"
          id="editExchangeDescription"
        />
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
