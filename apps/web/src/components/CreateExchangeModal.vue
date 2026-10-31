<script setup lang="ts">
import { computed, ref, watch, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { createExchangeInputSchema, type ExchangeDto } from '@kado/shared'
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
const passwordVisible = ref(true)
const adminPassword = ref('')
const pendingRedirectExchangeId = ref<string | null>(null)
const modalState = ref<ModalState>(ModalState.FORM)
const adminLink = ref('')
const countdownSeconds = ref(CONTINUE_COUNTDOWN_SECONDS)
let countdownTimer: ReturnType<typeof setInterval> | null = null

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
const isCountdownActive = computed(() => countdownSeconds.value > 0)
const isContinueDisabled = computed(() => isCountdownActive.value)

function resetForm() {
  name.value = ''
  organizerName.value = ''
  passwordVisible.value = true
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
  if (exchangesStore.isLoading || !valid.value) return
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
  <BaseModal :model-value="modelValue" :before-close="beforeClose" size="lg" :closeOnBackdrop="false"
    :closeOnEscape="false" :title="modalState === ModalState.FORM
        ? t('exchanges.createModal.title')
        : t('exchanges.createModal.successTitle')
      " @update:model-value="(value) => emit('update:modelValue', value)" @hidden="handleHidden">
    <!-- FORM STATE -->
    <form v-if="modalState === ModalState.FORM" id="createExchangeForm" @submit.prevent="handleCreate">
      <div class="form-field mb-3">
        <label for="exchangeName" class="form-label">{{ t('exchanges.createModal.name') }}</label>
        <input id="exchangeName" v-model="name" class="form-control" maxlength="150" required
          aria-describedby="creation-required" :aria-invalid="!!fieldErrors.name || undefined" />
      </div>
      <div class="form-field mb-3">
        <label for="organizerName" class="form-label">{{
          t('exchanges.createModal.organizerName')
          }}</label>
        <input id="organizerName" v-model="organizerName" class="form-control" maxlength="150" required
          aria-describedby="creation-required" :aria-invalid="!!fieldErrors.organizerName || undefined" />
      </div>
      <p id="creation-required" class="visually-hidden">{{ t('review.requiredNames') }}</p>
      <div class="form-field mb-3">
        <label for="adminPassword" class="form-label">{{
          t('exchanges.createModal.adminPassword')
          }}</label>
        <div class="input-group">
          <input id="adminPassword" v-model="adminPassword" :type="passwordVisible ? 'text' : 'password'"
            class="form-control" minlength="8" maxlength="256" autocomplete="new-password" autocapitalize="off"
            :spellcheck="false" required aria-describedby="password-help"
            :aria-invalid="!!fieldErrors.adminPassword || undefined" />
          <button type="button" class="btn btn-outline-secondary" :aria-pressed="passwordVisible"
            @click="passwordVisible = !passwordVisible">
            {{ t(passwordVisible ? 'review.hide' : 'review.show') }}
          </button>
        </div>
        <p id="password-help" class="form-text">{{ t('review.passwordHelp') }}</p>
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
          <input :value="adminLink" type="text" class="form-control font-monospace small" readonly />
          <button type="button" class="btn btn-primary rounded-end" @click="copyAdminLink">
            {{ t('actions.copy') }}
          </button>
        </div>
        <small class="text-body-secondary d-block mt-2">
          {{ t('exchanges.createModal.adminLinkHint') }}
        </small>
      </div>
    </div>

    <template #footer>
      <template v-if="modalState === ModalState.FORM">
        <button type="submit" class="btn btn-primary order-2" form="createExchangeForm"
          :disabled="exchangesStore.isLoading || !valid">
          {{ t('exchanges.createModal.submit') }}
        </button>
        <button type="button" class="btn btn-link order-1" data-bs-dismiss="modal">
          {{ t('actions.discardChanges') }}
        </button>
      </template>

      <template v-else-if="modalState === ModalState.SUCCESS">
        <button type="button" class="btn btn-primary" :disabled="isContinueDisabled" @click="handleContinue">
          {{ t('exchanges.createModal.continueButton') }}
          <span v-if="isCountdownActive" class="ms-2"> ({{ countdownSeconds }}) </span>
        </button>
      </template>
    </template>
  </BaseModal>
</template>
