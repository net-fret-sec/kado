<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/BaseModal.vue'

defineProps<{
  modelValue: boolean
  link: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()
const accessLinkInput = ref<HTMLInputElement | null>(null)
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="t('exchangeDetail.linkModal.title')"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <p class="mb-2">{{ t('exchangeDetail.linkModal.description') }}</p>
    <input ref="accessLinkInput" :value="link" type="text" class="form-control" readonly />

    <div class="alert alert-info mt-3 mb-0 small">
      <p class="mb-2">
        <strong>{{ t('exchangeDetail.linkModal.infoTitle') }}</strong>
      </p>
      <ul class="mb-0">
        <li>{{ t('exchangeDetail.linkModal.infoNotRecoverable') }}</li>
        <li>{{ t('exchangeDetail.linkModal.infoNewLinksAllowed') }}</li>
        <li>{{ t('exchangeDetail.linkModal.infoPreviousExpired') }}</li>
      </ul>
    </div>

    <template #footer>
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
        {{ t('exchangeDetail.linkModal.close') }}
      </button>
    </template>
  </BaseModal>
</template>
