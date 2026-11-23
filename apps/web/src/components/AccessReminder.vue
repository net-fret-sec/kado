<script setup lang="ts">
import { ref, watch, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { readStorage, writeStorage } from '@/composables/useStorage'
import { copyText } from '@/composables/useClipboard'
import { useToastsStore } from '@/stores/toasts'

const props = defineProps<{ accessId: string; organizer?: boolean; link?: string }>()
const { t } = useI18n()
const toasts = useToastsStore()
const dismissed = ref(false)
const linkInput = ref<HTMLInputElement | null>(null)
const linkInputId = `organizer-access-link-${useId()}`
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
async function copyLink() {
  const copied = await copyText(props.link ?? '')
  toasts[copied ? 'success' : 'error'](
    t(copied ? 'exchangeDetail.linkCopied' : 'exchangeDetail.copyFailed'),
  )
  if (!copied) {
    linkInput.value?.focus()
    linkInput.value?.select()
  }
}
</script>
<template>
  <aside
    class="access-reminder alert alert-info d-flex flex-column align-items-start gap-3 w-100"
    :class="organizer ? 'mb-0' : 'mb-4'"
    v-if="!dismissed"
  >
    <div>
      <p class="fw-semibold mb-1">{{ t('review.keepAccess') }}</p>
      <p class="small mb-0">
        {{ t(organizer ? 'review.keepOrganizer' : 'review.keepParticipant') }}
      </p>
    </div>
    <div v-if="organizer && link" class="input-group w-100">
      <div class="form-floating">
        <input
          :id="linkInputId"
          ref="linkInput"
          :value="link"
          type="text"
          class="form-control"
          placeholder=" "
          readonly
        />
        <label :for="linkInputId">{{ t('review.organizerLinkLabel') }}</label>
      </div>
      <button type="button" class="btn btn-primary" @click="copyLink">
        {{ t('actions.copy') }}
      </button>
    </div>
    <button
      type="button"
      class="btn btn-sm btn-outline-primary access-reminder-confirm"
      @click="dismiss"
    >
      {{ t(organizer ? 'review.accessSaved' : 'review.participantLinkSaved') }}
    </button>
  </aside>
</template>
