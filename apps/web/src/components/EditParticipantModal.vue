<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GiftSuggestionDto, ParticipantDto } from '@kado/shared'
import BaseModal from '@/components/BaseModal.vue'
import WishlistSuggestionItem from '@/components/WishlistSuggestionItem.vue'
import Draggable from 'vuedraggable'

const props = defineProps<{
  modelValue: boolean
  participant: ParticipantDto | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (
    event: 'submit',
    payload: {
      name: string
      email: string
      wishlist: GiftSuggestionDto[]
      note: string
    },
  ): void
}>()

const { t } = useI18n()

const name = ref('')
const email = ref('')
const note = ref('')
type EditableSuggestion = GiftSuggestionDto & { _clientId: string }

let clientIdCounter = 0

function generateClientId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) {
    return c.randomUUID()
  }

  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16)
    c.getRandomValues(bytes)
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  clientIdCounter += 1
  return `cid-${Date.now().toString(36)}-${clientIdCounter.toString(36)}`
}

function withClientId(suggestion: GiftSuggestionDto): EditableSuggestion {
  return {
    ...suggestion,
    _clientId: generateClientId(),
  }
}

const wishlist = ref<EditableSuggestion[]>([])

function isValidUrl(value?: string | null) {
  if (!value) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidSuggestion(suggestion: GiftSuggestionDto) {
  const titleOk = !!suggestion?.title && suggestion.title.trim().length > 0
  const imgOk = isValidUrl(suggestion?.imageUrl)
  const linkOk = isValidUrl(suggestion?.linkUrl)
  return titleOk && imgOk && linkOk
}

const isListModeValid = computed(() => {
  if (!wishlist.value || wishlist.value.length === 0) return false
  return wishlist.value.every(isValidSuggestion)
})

const isFormValid = computed(() => {
  const nameOk = name.value.trim().length > 0
  return nameOk && isListModeValid.value
})

function syncFromParticipant() {
  name.value = props.participant?.name || ''
  email.value = props.participant?.email || ''
  note.value = props.participant?.note || ''
  wishlist.value = (props.participant?.wishlist || []).map(withClientId)
}

watch(
  () => [props.modelValue, props.participant] as const,
  ([isOpen]) => {
    if (!isOpen) return
    syncFromParticipant()
  },
)

function handleSubmit() {
  if (!isFormValid.value) return

  emit('submit', {
    name: name.value,
    email: email.value,
    wishlist: wishlist.value.map(({ _clientId: _discardedClientId, ...suggestion }) => suggestion),
    note: note.value,
  })
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="t('exchangeDetail.editModal.title')"
    size="lg"
    @update:model-value="(value) => emit('update:modelValue', value)"
  >
    <form id="editParticipantForm" @submit.prevent="handleSubmit">
      <div class="mb-3">
        <label for="editParticipantName" class="form-label">{{
          t('exchangeDetail.addModal.name')
        }}</label>
        <input v-model="name" type="text" class="form-control" id="editParticipantName" required />
      </div>
      <!-- <div class="mb-3">
        <label for="editParticipantEmail" class="form-label">{{
          t('exchangeDetail.addModal.email')
        }}</label>
        <input v-model="email" type="email" class="form-control" id="editParticipantEmail" />
      </div> -->
      <div class="mb-3">
        <label class="form-label mb-0">{{ t('exchangeDetail.addModal.wishlist') }}</label>
        <div class="mt-2">
          <Draggable v-model="wishlist" handle=".drag-handle" :animation="200" item-key="_clientId">
            <template #item="{ element: suggestion, index: idx }">
              <WishlistSuggestionItem
                :modelValue="suggestion"
                @update:modelValue="
                  (value) => wishlist.splice(idx, 1, { ...value, _clientId: suggestion._clientId })
                "
                mode="edit"
                :removable="true"
                :showHandle="true"
                :asListItem="true"
                @remove="wishlist.splice(idx, 1)"
              />
            </template>
          </Draggable>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            @click="wishlist.push(withClientId({ title: '' }))"
          >
            <i class="bi bi-plus-lg"></i> Ajouter une suggestion
          </button>
        </div>
      </div>
      <div class="mb-3">
        <label for="editParticipantNote" class="form-label">{{
          t('exchangeDetail.addModal.note')
        }}</label>
        <textarea v-model="note" class="form-control" id="editParticipantNote"></textarea>
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
        {{ t('actions.cancel') }}
      </button>
      <button
        type="submit"
        class="btn btn-primary"
        form="editParticipantForm"
        :disabled="!isFormValid"
      >
        {{ t('exchangeDetail.editModal.submit') }}
      </button>
    </template>
  </BaseModal>
</template>
