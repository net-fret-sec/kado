<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseModal from '@/components/BaseModal.vue'

defineProps<{
  modelValue: boolean
  link: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'copy'): void
}>()

const { t } = useI18n()
const accessLinkInput = ref<HTMLInputElement | null>(null)

function selectAccessLink() {
  accessLinkInput.value?.focus()
  accessLinkInput.value?.select()
}

function handleShown() {
  void nextTick(() => {
    selectAccessLink()
  })
}

function handleCopy() {
  emit('copy')
  selectAccessLink()
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="t('exchangeDetail.linkModal.title')"
    @update:model-value="(value) => emit('update:modelValue', value)"
    @shown="handleShown"
  >
    <p class="mb-2">{{ t('exchangeDetail.linkModal.description') }}</p>
    <input
      ref="accessLinkInput"
      :value="link"
      type="text"
      class="form-control"
      readonly
      @focus="selectAccessLink"
    />

    <template #footer>
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
        {{ t('exchangeDetail.linkModal.close') }}
      </button>
      <button type="button" class="btn btn-primary" @click="handleCopy">
        {{ t('exchangeDetail.linkModal.copy') }}
      </button>
    </template>
  </BaseModal>
</template>
