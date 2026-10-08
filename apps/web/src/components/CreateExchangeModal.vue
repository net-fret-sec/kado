<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { ExchangeDto } from '@kado/shared'
import { copyText } from '@/composables/useClipboard'
import { computed as draftComputed } from 'vue'
import { useDraftGuard, confirmDiscard } from '@/composables/useDraftGuard'
import BaseModal from '@/components/BaseModal.vue'
import { useExchangesStore } from '@/stores/exchanges'
import { useToastsStore } from '@/stores/toasts'

enum ModalState {
  FORM = 'form',
  SUCCESS = 'success',
}

const DEFAULT_CONTINUE_COUNTDOWN_SECONDS = 5

function resolveContinueCountdownSeconds() {
  const rawValue = import.meta.env.VITE_ADMIN_LINK_CONTINUE_COUNTDOWN_SECONDS
  const parsedValue = Number.parseInt(rawValue ?? '', 10)

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return DEFAULT_CONTINUE_COUNTDOWN_SECONDS
  }

  return parsedValue
}

const CONTINUE_COUNTDOWN_SECONDS = resolveContinueCountdownSeconds()

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
const toasts = useToastsStore()

const name = ref('')
const organizerName = ref('')
const organizerParticipates = ref(true)
const adminPassword = ref('')
const pendingRedirectExchangeId = ref<string | null>(null)
const modalState = ref<ModalState>(ModalState.FORM)
const adminLink = ref('')
const countdownSeconds = ref(CONTINUE_COUNTDOWN_SECONDS)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const fieldErrors = computed(() => exchangesStore.fieldErrors || {})
const formErrors = computed(() => exchangesStore.formErrors || [])
const isCountdownActive = computed(() => countdownSeconds.value > 0)
const isContinueDisabled = computed(() => isCountdownActive.value)

function resetForm() {
  name.value = ''
  organizerName.value = ''
  organizerParticipates.value = true
  adminPassword.value = ''
  adminLink.value = ''
  modalState.value = ModalState.FORM
  countdownSeconds.value = CONTINUE_COUNTDOWN_SECONDS
  stopCountdown()
  exchangesStore.fieldErrors = null
  exchangesStore.formErrors = null
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function startCountdown() {
  stopCountdown()
  countdownSeconds.value = CONTINUE_COUNTDOWN_SECONDS

  countdownTimer = setInterval(() => {
    countdownSeconds.value -= 1
    if (countdownSeconds.value <= 0) {
      stopCountdown()
    }
  }, 1000)
}

const dirty = draftComputed(
  () =>
    props.modelValue &&
    modalState.value === ModalState.FORM &&
    Boolean(name.value || organizerName.value || adminPassword.value),
)
useDraftGuard(dirty)
function beforeClose() {
  return !exchangesStore.isLoading && (!dirty.value || confirmDiscard())
}
async function copyAdminLink() {
  const copied = await copyText(adminLink.value)
  toasts[copied ? 'success' : 'error'](
    t(copied ? 'exchangeDetail.linkCopied' : 'exchangeDetail.copyFailed'),
  )
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      exchangesStore.fieldErrors = null
      exchangesStore.formErrors = null
    } else {
      stopCountdown()
    }
  },
)

onUnmounted(() => {
  stopCountdown()
})

async function handleCreate() {
  if (exchangesStore.isLoading) return
  exchangesStore.fieldErrors = null
  exchangesStore.formErrors = null

  if (!name.value.trim() || !organizerName.value.trim() || !adminPassword.value) {
    return
  }

  try {
    const result = await exchangesStore.createExchange({
      name: name.value.trim(),
      organizerName: organizerName.value.trim(),
      organizerParticipates: organizerParticipates.value,
      adminPassword: adminPassword.value,
    })

    pendingRedirectExchangeId.value = result.id
    emit('created', result)

    // Build the admin link with full URL
    adminLink.value =
      window.location.origin +
      router.resolve({
        name: 'exchange-detail',
        params: { id: result.id },
      }).href

    // Switch to success state and start countdown
    modalState.value = ModalState.SUCCESS
    await nextTick()
    startCountdown()
  } catch {
    // Error state is managed in the store and displayed in the modal.
  }
}

function handleContinue() {
  stopCountdown()
  emit('update:modelValue', false)
}

async function handleHidden() {
  if (!pendingRedirectExchangeId.value) {
    resetForm()
    return
  }

  const exchangeId = pendingRedirectExchangeId.value
  pendingRedirectExchangeId.value = null
  await router.push({ name: 'exchange-detail', params: { id: exchangeId } })
  resetForm()
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :before-close="beforeClose"
    size="lg"
    :closeOnBackdrop="false"
    :closeOnEscape="false"
    :title="
      modalState === ModalState.FORM
        ? t('exchanges.createModal.title')
        : t('exchanges.createModal.successTitle')
    "
    @update:model-value="(value) => emit('update:modelValue', value)"
    @hidden="handleHidden"
  >
    <!-- FORM STATE -->
    <form
      v-if="modalState === ModalState.FORM"
      id="createExchangeForm"
      @submit.prevent="handleCreate"
    >
      <div class="mb-3">
        <label for="exchangeName" class="form-label">
          {{ t('exchanges.createModal.name') }}
        </label>
        <input
          v-model="name"
          type="text"
          class="form-control"
          id="exchangeName"
          :aria-invalid="!!fieldErrors.name || undefined"
          :aria-describedby="fieldErrors.name ? 'create-name-error' : undefined"
          required
        />
        <div v-if="fieldErrors.name" id="create-name-error" class="text-danger small">
          {{ t('p2.invalidField') }}
        </div>
      </div>

      <div class="row">
        <div class="col-lg-6 mb-lg-0 mb-3">
          <label for="organizerName" class="form-label">
            {{ t('exchanges.createModal.organizerName') }}
          </label>
          <input
            v-model="organizerName"
            type="text"
            class="form-control"
            id="organizerName"
            :aria-invalid="!!fieldErrors.organizerName || undefined"
            :aria-describedby="fieldErrors.organizerName ? 'create-organizerName-error' : undefined"
            required
          />
          <div
            v-if="fieldErrors.organizerName"
            id="create-organizerName-error"
            class="text-danger small"
          >
            {{ t('p2.invalidField') }}
          </div>
        </div>
        <div class="col-lg-6">
          <div class="mb-3">
            <label for="adminPassword" class="form-label">
              {{ t('exchanges.createModal.adminPassword') }}
            </label>
            <input
              v-model="adminPassword"
              type="password"
              class="form-control"
              id="adminPassword"
              :aria-invalid="!!fieldErrors.adminPassword || undefined"
              :aria-describedby="
                fieldErrors.adminPassword ? 'create-adminPassword-error' : undefined
              "
              required
            />
            <div class="d-none">
              <p class="small text-body-secondary mt-2 mb-1">
                {{ t('exchanges.createModal.adminPasswordRulesTitle') }}
              </p>
              <ul class="small text-body-secondary mb-2 ps-3">
                <li>{{ t('exchanges.createModal.adminPasswordRuleLength') }}</li>
                <li>{{ t('exchanges.createModal.adminPasswordRuleUnique') }}</li>
                <li>{{ t('exchanges.createModal.adminPasswordRuleStoredSafely') }}</li>
              </ul>
            </div>
            <div
              v-if="fieldErrors.adminPassword"
              id="create-adminPassword-error"
              class="text-danger small"
            >
              {{ t('p2.invalidField') }}
            </div>
          </div>
        </div>
      </div>

      <div class="col mb-3 form-check">
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

      <div class="alert alert-light border mb-0">
        <p class="fw-semibold mb-2">{{ t('exchanges.createModal.whatHappensTitle') }}</p>
        <ul class="mb-0 ps-3">
          <li>{{ t('exchanges.createModal.whatHappensCreated') }}</li>
          <li>{{ t('exchanges.createModal.whatHappensAdminSession') }}</li>
          <li v-html="t('exchanges.createModal.whatHappensPassword')"></li>
          <li>{{ t('exchanges.createModal.whatHappensEditable') }}</li>
        </ul>
      </div>

      <div v-if="formErrors.length" class="text-danger mt-2">
        <div v-for="err in formErrors" :key="err">{{ t('p2.invalidField') }}</div>
      </div>
    </form>

    <!-- SUCCESS STATE -->
    <div v-else-if="modalState === ModalState.SUCCESS">
      <div class="alert alert-warning border-0 mb-3">
        <div class="d-flex align-items-start gap-2">
          <span class="text-warning fw-bold" style="font-size: 1.2em">⚠️</span>
          <div>
            <p class="fw-semibold mb-1">{{ t('exchanges.createModal.successWarningTitle') }}</p>
            <p class="mb-0 small">
              {{ t('exchanges.createModal.successWarningText') }}
            </p>
          </div>
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label text-uppercase small fw-semibold text-body-secondary">
          {{ t('exchanges.createModal.adminLinkLabel') }}
        </label>
        <div class="input-group">
          <input
            :value="adminLink"
            type="text"
            class="form-control font-monospace small"
            readonly
          />
          <button type="button" class="btn btn-primary rounded-end" @click="copyAdminLink">
            {{ t('exchanges.createModal.copyButton') }}
          </button>
        </div>
        <small class="text-body-secondary d-block mt-2">
          {{ t('exchanges.createModal.adminLinkHint') }}
        </small>
      </div>
    </div>

    <template #footer>
      <template v-if="modalState === ModalState.FORM">
        <button
          type="submit"
          class="btn btn-primary order-2"
          form="createExchangeForm"
          :disabled="exchangesStore.isLoading"
        >
          {{ t('exchanges.createModal.submit') }}
        </button>
        <button type="button" class="btn btn-link order-1" data-bs-dismiss="modal">
          {{ t('actions.cancel') }}
        </button>
      </template>

      <template v-else-if="modalState === ModalState.SUCCESS">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="isContinueDisabled"
          @click="handleContinue"
        >
          {{ t('exchanges.createModal.continueButton') }}
          <span v-if="isCountdownActive" class="ms-2"> ({{ countdownSeconds }}) </span>
        </button>
      </template>
    </template>
  </BaseModal>
</template>
