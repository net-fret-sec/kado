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
const organizerName = ref('')
const organizerParticipates = ref(true)
const adminPassword = ref('')
const pendingRedirectExchangeId = ref<string | null>(null)

const fieldErrors = computed(() => exchangesStore.fieldErrors || {})
const formErrors = computed(() => exchangesStore.formErrors || [])

function resetForm() {
  name.value = ''
  organizerName.value = ''
  organizerParticipates.value = true
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

  if (!name.value.trim() || !organizerName.value.trim() || !adminPassword.value) {
    return
  }

  try {
    const exchange = await exchangesStore.createExchange({
      name: name.value.trim(),
      organizerName: organizerName.value.trim(),
      organizerParticipates: organizerParticipates.value,
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
    size="lg"
    :title="t('exchanges.createModal.title')"
    @update:model-value="(value) => emit('update:modelValue', value)"
    @hidden="handleHidden"
  >
    <form id="createExchangeForm" @submit.prevent="handleCreate">
      <div class="alert alert-light border mb-3">
        <p class="fw-semibold mb-1">{{ t('exchanges.createModal.introTitle') }}</p>
        <p class="text-body-secondary mb-0">
          {{ t('exchanges.createModal.introDescription') }}
        </p>
      </div>

      <p class="small text-body-secondary mb-3">
        <span class="text-danger fw-semibold" aria-hidden="true">*</span>
        {{ t('exchanges.createModal.requiredLegend') }}
      </p>

      <div class="mb-3">
        <label for="exchangeName" class="form-label">
          {{ t('exchanges.createModal.name') }}
          <span class="text-danger ms-1" aria-hidden="true">*</span>
          <span class="visually-hidden">{{ t('exchanges.createModal.requiredFieldA11y') }}</span>
        </label>
        <input v-model="name" type="text" class="form-control" id="exchangeName" required />
        <div v-if="fieldErrors.name" class="text-danger small">{{ fieldErrors.name[0] }}</div>
      </div>

      <div class="mb-3">
        <label for="organizerName" class="form-label">
          {{ t('exchanges.createModal.organizerName') }}
          <span class="text-danger ms-1" aria-hidden="true">*</span>
          <span class="visually-hidden">{{ t('exchanges.createModal.requiredFieldA11y') }}</span>
        </label>
        <input
          v-model="organizerName"
          type="text"
          class="form-control"
          id="organizerName"
          required
        />
        <div v-if="fieldErrors.organizerName" class="text-danger small">
          {{ fieldErrors.organizerName[0] }}
        </div>
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

      <div class="mb-3">
        <label for="adminPassword" class="form-label">
          {{ t('exchanges.createModal.adminPassword') }}
          <span class="text-danger ms-1" aria-hidden="true">*</span>
          <span class="visually-hidden">{{ t('exchanges.createModal.requiredFieldA11y') }}</span>
        </label>
        <input
          v-model="adminPassword"
          type="password"
          class="form-control"
          id="adminPassword"
          required
        />
        <p class="small text-body-secondary mt-2 mb-1">
          {{ t('exchanges.createModal.adminPasswordRulesTitle') }}
        </p>
        <ul class="small text-body-secondary mb-2 ps-3">
          <li>{{ t('exchanges.createModal.adminPasswordRuleLength') }}</li>
          <li>{{ t('exchanges.createModal.adminPasswordRuleUnique') }}</li>
          <li>{{ t('exchanges.createModal.adminPasswordRuleStoredSafely') }}</li>
        </ul>
        <div v-if="fieldErrors.adminPassword" class="text-danger small">
          {{ fieldErrors.adminPassword[0] }}
        </div>
      </div>

      <div class="alert alert-light border mb-0">
        <p class="fw-semibold mb-2">{{ t('exchanges.createModal.whatHappensTitle') }}</p>
        <ul class="mb-0 ps-3">
          <li>{{ t('exchanges.createModal.whatHappensCreated') }}</li>
          <li>{{ t('exchanges.createModal.whatHappensAdminSession') }}</li>
          <li>{{ t('exchanges.createModal.whatHappensPassword') }}</li>
          <li>{{ t('exchanges.createModal.whatHappensEditable') }}</li>
        </ul>
      </div>

      <div v-if="formErrors.length" class="text-danger mt-2">
        <div v-for="err in formErrors" :key="err">{{ err }}</div>
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
        {{ t('actions.cancel') }}
      </button>
      <button type="submit" class="btn btn-primary" form="createExchangeForm">
        {{ t('exchanges.createModal.submit') }}
      </button>
    </template>
  </BaseModal>
</template>
