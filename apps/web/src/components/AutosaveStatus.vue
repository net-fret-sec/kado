<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const props = defineProps<{ status: string; retryDisabled?: boolean; profile?: boolean }>()
defineEmits<{ retry: [] }>()
const { t } = useI18n()
const messages = computed<Record<string, string>>(() =>
  props.profile
    ? {
        help: t('autosave.profileHelp'),
        pending: t('autosave.profilePending'),
        saving: t('autosave.profileSaving'),
        saved: t('autosave.profileSaved'),
        failed: t('autosave.profileFailed'),
      }
    : {
        help: t('autosave.help'),
        pending: t('autosave.pending'),
        saving: t('autosave.saving'),
        saved: t('autosave.saved'),
        failed: t('autosave.failed'),
      },
)
</script>
<template>
  <div
    class="small mt-2"
    :class="profile ? 'profile-save-status' : 'suggestion-save-status'"
    role="status"
    aria-live="polite"
  >
    <span :class="status === 'failed' ? 'text-danger' : 'text-body-secondary'">{{
      messages[status]
    }}</span>
    <button
      v-if="status === 'failed'"
      type="button"
      class="btn btn-sm btn-link"
      :disabled="retryDisabled"
      @click="$emit('retry')"
    >
      {{ t('autosave.retry') }}
    </button>
  </div>
</template>
