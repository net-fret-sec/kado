<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/BaseModal.vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit', payload: { name: string; email: string }): void
}>()

const { t } = useI18n()

const name = ref('')
const email = ref('')

function isValidEmail(value: string) {
  const normalized = value.trim()
  if (!normalized) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

const isFormValid = computed(() => {
  const nameOk = name.value.trim().length > 0
  return nameOk && isValidEmail(email.value)
})

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) return
    name.value = ''
    email.value = ''
  },
)

function handleSubmit() {
  if (!isFormValid.value) return
  emit('submit', {
    name: name.value,
    email: email.value,
  })
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="t('exchangeDetail.addModal.title')"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <form id="addParticipantForm" @submit.prevent="handleSubmit">
      <div class="mb-3">
        <label for="participantName" class="form-label">{{
          t('exchangeDetail.addModal.name')
        }}</label>
        <input v-model="name" type="text" class="form-control" id="participantName" required />
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
        {{ t('actions.cancel') }}
      </button>
      <button
        type="submit"
        class="btn btn-primary"
        form="addParticipantForm"
        :disabled="!isFormValid"
      >
        {{ t('exchangeDetail.addModal.submit') }}
      </button>
    </template>
  </BaseModal>
</template>
