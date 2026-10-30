<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { readStorage, writeStorage } from '@/composables/useStorage'
const props = defineProps<{ accessId: string; organizer?: boolean }>()
const { t } = useI18n()
const dismissed = ref(false)
const key = () =>
  `kado:access-saved:${props.organizer ? 'organizer' : 'participant'}:${props.accessId}`
watch(
  () => [props.accessId, props.organizer],
  () => {
    dismissed.value = readStorage(key()) === 'yes'
  },
  { immediate: true },
)
function dismiss() {
  writeStorage(key(), 'yes')
  dismissed.value = true
}
</script>
<template>
  <aside
    v-if="!dismissed"
    class="access-reminder alert alert-info d-flex flex-wrap gap-3 align-items-center"
  >
    <div class="flex-grow-1">
      <p class="fw-semibold mb-1">{{ t('review.keepAccess') }}</p>
      <p class="small mb-0">
        {{ t(organizer ? 'review.keepOrganizer' : 'review.keepParticipant') }}
      </p>
    </div>
    <button type="button" class="btn btn-sm btn-outline-primary" @click="dismiss">
      {{ t('review.accessSaved') }}
    </button>
  </aside>
</template>
