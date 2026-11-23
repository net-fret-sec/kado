<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { createExchangeInputSchema, type ExchangeDto } from '@kado/shared'
import { useDraftGuard, confirmDiscard } from '@/composables/useDraftGuard'
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
const passwordVisible = ref(true)
const adminPassword = ref('')
const pendingRedirectExchangeId = ref<string | null>(null)
const valid = computed(
  () =>
    !!organizerName.value.trim() &&
    createExchangeInputSchema.safeParse({
      name: name.value,
      organizerName: organizerName.value,
      adminPassword: adminPassword.value,
    }).success,
)
const fieldErrors = computed(() => exchangesStore.fieldErrors || {})
const formErrors = computed(() => exchangesStore.formErrors || [])

function resetForm() {
  name.value = ''
  organizerName.value = ''
  passwordVisible.value = true
  adminPassword.value = ''
  exchangesStore.fieldErrors = null
  exchangesStore.formErrors = null
}

const dirty = computed(
  () =>
    props.modelValue &&
    !pendingRedirectExchangeId.value &&
    Boolean(name.value || organizerName.value || adminPassword.value),
)
useDraftGuard(dirty)
function beforeClose() {
  return !exchangesStore.isLoading && (!dirty.value || confirmDiscard())
}
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      exchangesStore.error = null
      exchangesStore.fieldErrors = null
      exchangesStore.formErrors = null
    }
  },
)

async function handleCreate() {
  if (exchangesStore.isLoading || pendingRedirectExchangeId.value || !valid.value) return
  exchangesStore.fieldErrors = null
  exchangesStore.formErrors = null

  if (!name.value.trim() || !organizerName.value.trim() || !adminPassword.value) {
    return
  }

  try {
    const result = await exchangesStore.createExchange({
      name: name.value.trim(),
      organizerName: organizerName.value.trim(),
      organizerParticipates: true,
      adminPassword: adminPassword.value,
    })

    pendingRedirectExchangeId.value = result.id
    emit('created', result)

    emit('update:modelValue', false)
  } catch {
    // Error state is managed in the store and displayed in the modal.
  }
}

async function handleHidden() {
  if (!pendingRedirectExchangeId.value) {
    resetForm()
    return
  }

  const exchangeId = pendingRedirectExchangeId.value
  resetForm()
  pendingRedirectExchangeId.value = null
  await router.push({ name: 'exchange-detail', params: { id: exchangeId } })
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :before-close="beforeClose"
    :close-on-backdrop="false"
    :title="t('exchanges.createModal.title')"
    @update:model-value="(value) => emit('update:modelValue', value)"
    @hidden="handleHidden"
  >
    <form id="createExchangeForm" @submit.prevent="handleCreate">
      <div class="form-field mb-3">
        <div class="form-floating">
          <input
            placeholder=" "
            id="exchangeName"
            v-model="name"
            class="form-control"
            maxlength="150"
            required
            aria-describedby="creation-required"
            :aria-invalid="!!fieldErrors.name || undefined"
          />
          <label for="exchangeName">{{ t('exchanges.createModal.name') }}</label>
        </div>
      </div>
      <div class="form-field mb-3">
        <div class="form-floating">
          <input
            placeholder=" "
            id="organizerName"
            v-model="organizerName"
            class="form-control"
            maxlength="150"
            required
            aria-describedby="creation-required"
            :aria-invalid="!!fieldErrors.organizerName || undefined"
          />
          <label for="organizerName">{{ t('exchanges.createModal.organizerName') }}</label>
        </div>
      </div>
      <p id="creation-required" class="visually-hidden">{{ t('review.requiredNames') }}</p>
      <div class="form-field mb-3">
        <div class="input-group">
          <div class="form-floating">
            <input
              placeholder=" "
              id="adminPassword"
              v-model="adminPassword"
              :type="passwordVisible ? 'text' : 'password'"
              class="form-control"
              minlength="8"
              maxlength="256"
              autocomplete="new-password"
              autocapitalize="off"
              :spellcheck="false"
              required
              aria-describedby="password-help"
              :aria-invalid="!!fieldErrors.adminPassword || undefined"
            />
            <label for="adminPassword">{{ t('exchanges.createModal.adminPassword') }}</label>
          </div>
          <button
            type="button"
            class="btn btn-outline-secondary"
            :aria-pressed="passwordVisible"
            @click="passwordVisible = !passwordVisible"
          >
            {{ t(passwordVisible ? 'review.hide' : 'review.show') }}
          </button>
        </div>
        <p id="password-help" class="form-text">{{ t('review.passwordHelp') }}</p>
      </div>

      <p class="text-body-secondary mb-0">{{ t('exchanges.createModal.afterCreationHint') }}</p>

      <p v-if="exchangesStore.error" class="text-danger mt-2" role="alert">
        {{ exchangesStore.error }}
      </p>
      <div v-else-if="formErrors.length" class="text-danger mt-2" role="alert">
        <div v-for="err in formErrors" :key="err">{{ t('p2.invalidField') }}</div>
      </div>
    </form>

    <template #footer>
      <button
        type="submit"
        class="btn btn-primary order-2"
        form="createExchangeForm"
        :disabled="exchangesStore.isLoading || !!pendingRedirectExchangeId || !valid"
      >
        {{ t('exchanges.createModal.submit') }}
      </button>
      <button
        type="button"
        class="btn btn-link order-1"
        data-bs-dismiss="modal"
        :disabled="exchangesStore.isLoading || !!pendingRedirectExchangeId"
      >
        {{ t('actions.discardChanges') }}
      </button>
    </template>
  </BaseModal>
</template>
