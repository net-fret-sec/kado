<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { ExchangeDto } from '@kado/shared'
import BaseModal from '@/components/BaseModal.vue'
import { useExchangesStore } from '@/stores/exchanges'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'created', exchange: ExchangeDto): void
}>()

const { t } = useI18n()
const router = useRouter()
const exchangesStore = useExchangesStore()

const name = ref('')
const description = ref('')
const organizerName = ref('')
const organizerParticipates = ref(true)
const noMutualAssignments = ref(false)
const adminPassword = ref('')
const pendingRedirectExchangeId = ref<string | null>(null)

const fieldErrors = computed(() => exchangesStore.fieldErrors || {})
const formErrors = computed(() => exchangesStore.formErrors || [])

function resetForm() {
  name.value = ''
  description.value = ''
  organizerName.value = ''
  organizerParticipates.value = true
  noMutualAssignments.value = false
  adminPassword.value = ''
  exchangesStore.fieldErrors = null
  exchangesStore.formErrors = null
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      exchangesStore.fieldErrors = null
      exchangesStore.formErrors = null
    }
  },
)

async function handleCreate() {
  exchangesStore.fieldErrors = null
  exchangesStore.formErrors = null

  if (!name.value.trim()) {
    return
  }

  try {
    const exchange = await exchangesStore.createExchange({
      name: name.value,
      description: description.value,
      organizerName: organizerName.value,
      organizerParticipates: organizerParticipates.value,
      noMutualAssignments: noMutualAssignments.value,
      adminPassword: adminPassword.value,
    })

    pendingRedirectExchangeId.value = exchange.id
    emit('created', exchange)
    emit('update:modelValue', false)
    resetForm()
  } catch {
    // Error state is managed in the store and displayed in the modal.
  }
}

async function handleHidden() {
  if (!pendingRedirectExchangeId.value) {
    return
  }

  const exchangeId = pendingRedirectExchangeId.value
  pendingRedirectExchangeId.value = null
  await router.push({ name: 'exchange-detail', params: { id: exchangeId } })
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="t('exchanges.createModal.title')"
    @update:model-value="(value) => emit('update:modelValue', value)"
    @hidden="handleHidden"
  >
    <form id="createExchangeForm" @submit.prevent="handleCreate">
      <div class="mb-3">
        <label for="exchangeName" class="form-label">{{ t('exchanges.createModal.name') }}</label>
        <input v-model="name" type="text" class="form-control" id="exchangeName" required />
        <div v-if="fieldErrors.name" class="text-danger small">{{ fieldErrors.name[0] }}</div>
      </div>

      <div class="mb-3">
        <label for="exchangeDescription" class="form-label">{{ t('exchanges.createModal.description') }}</label>
        <input v-model="description" type="text" class="form-control" id="exchangeDescription" />
        <div v-if="fieldErrors.description" class="text-danger small">{{ fieldErrors.description[0] }}</div>
      </div>

      <div class="mb-3">
        <label for="organizerName" class="form-label">{{ t('exchanges.createModal.organizerName') }}</label>
        <input v-model="organizerName" type="text" class="form-control" id="organizerName" required />
        <div v-if="fieldErrors.organizerName" class="text-danger small">{{ fieldErrors.organizerName[0] }}</div>
      </div>

      <div class="mb-3 form-check">
        <input
          v-model="organizerParticipates"
          type="checkbox"
          class="form-check-input"
          id="organizerParticipates"
        />
        <label class="form-check-label" for="organizerParticipates">
          {{ t('exchanges.createModal.organizerParticipates') }}
        </label>
      </div>

      <div class="mb-3 form-check">
        <input
          v-model="noMutualAssignments"
          type="checkbox"
          class="form-check-input"
          id="noMutualAssignments"
        />
        <label class="form-check-label" for="noMutualAssignments">
          {{ t('exchanges.createModal.noMutualAssignments') }}
        </label>
      </div>

      <div class="mb-3">
        <label for="adminPassword" class="form-label">{{ t('exchanges.createModal.adminPassword') }}</label>
        <input v-model="adminPassword" type="password" class="form-control" id="adminPassword" required />
        <div v-if="fieldErrors.adminPassword" class="text-danger small">{{ fieldErrors.adminPassword[0] }}</div>
      </div>

      <div v-if="formErrors.length" class="text-danger mt-2">
        <div v-for="err in formErrors" :key="err">{{ err }}</div>
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ t('actions.cancel') }}</button>
      <button type="submit" class="btn btn-primary" form="createExchangeForm">
        {{ t('exchanges.createModal.submit') }}
      </button>
    </template>
  </BaseModal>
</template>
