<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import BaseModal from '@/components/BaseModal.vue'
import AccessReminder from '@/components/AccessReminder.vue'
import { formatMoney } from '@/composables/useCurrency'
import { groupExclusions } from '@/lib/exclusionSummary'
import { useRoute } from 'vue-router'
import { useAdminAuthStore } from '@/stores/useAdminAuthStore'
import { provideImageAccess } from '@/composables/useImageAccess'
import { formatCivilDate } from '@/composables/useCivilDate'
import { useExchangeAdmin } from '@/composables/useExchangeAdmin'
import { useI18n } from 'vue-i18n'
import EditExchangeModal from '@/components/EditExchangeModal.vue'
import EditParticipantModal from '@/components/EditParticipantModal.vue'
import ParticipantAccessLinkModal from '@/components/ParticipantAccessLinkModal.vue'
const { t, locale } = useI18n()
const showDelete = ref(false)
const deleteName = ref('')
const route = useRoute(),
  auth = useAdminAuthStore()
const imageUploading = ref(false)
provideImageAccess((participantId) => {
  const id = String(route.params.id),
    token = auth.getSessionToken(id)
  return !requiresAdminAuth.value && token && participantId
    ? {
        base: `/api/exchanges/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantId)}`,
        headers: { Authorization: `Bearer ${token}` },
        scope: id + ':' + token,
        onError: handleParticipantUploadError,
      }
    : null
})
const {
  exchange,
  participants,
  exclusionRules,
  selectedExclusionReceiver,
  isLoading,
  error,
  requiresAdminAuth,
  adminPassword,
  isAuthenticatingAdmin,
  showEditExchangeModal,
  maxActiveParticipants,
  configError,
  configLoading,
  mutationBusy,
  actionError,
  addParticipantError,
  addParticipantFieldErrors,
  editExchangeError,
  editParticipantError,
  editExchangeCurrent,
  editParticipantCurrent,
  exchangeDirty,
  isSavingExchange,
  isDrawActionLoading,
  isLoggingOutAdmin,
  showEditParticipantModal,
  showAccessLinkModal,
  editingParticipant,
  latestAccessLink,
  latestAccessName,
  newParticipantName,
  newParticipantNameInput,
  isAddingParticipant,
  isExclusionEditingLocked,
  activeParticipants,
  participantNameById,
  canTriggerDraw,
  canCancelDraw,
  isParticipantCreationLocked,
  isParticipantIdentityLocked,
  isParticipantSuggestionsLocked,
  participantCountLabel,
  statusBadgeClass,
  statusLabel,
  refreshPaused,
  connectionLost,
  addParticipantExclusion,
  removeParticipantExclusion,
  authenticateAdmin,
  logoutAdmin,
  saveEdit,
  handleDelete,
  updateParticipant,
  deleteParticipant,
  regenerateParticipantLink,
  triggerDraw,
  cancelDraw,
  loadConfig,
  manualRefresh,
  getParticipantExclusions,
  getReceiverCandidates,
  startEdit,
  openEditParticipantModal,
  setEditParticipantModalVisibility,
  setAccessLinkModalVisibility,
  handleAddNewParticipant,
  editExchangeFieldErrors,
  editParticipantFieldErrors,
  participantDirty,
  handleParticipantUploadError,
} = useExchangeAdmin()
watch(imageUploading, (value) => {
  participantDirty.value = value || showEditParticipantModal.value
})
const exclusionSummary = computed(() => {
  const groups = groupExclusions(exclusionRules.value)
  const name = (id: string) => participantNameById.value[id] ?? id
  const joinNames = (names: string[]) =>
    names.length < 2
      ? names.join('')
      : `${names.slice(0, -1).join(', ')} ${locale.value.startsWith('fr') ? 'et' : 'and'} ${names[names.length - 1]}`
  return [
    ...groups.mutual.map(({ a, b }) => t('review.mutual', { a: name(a), b: name(b) })),
    ...groups.directional.map(({ giver, receivers }) =>
      t('review.directional', { name: name(giver), others: joinNames(receivers.map(name)) }),
    ),
  ]
})
watch(showDelete, () => {
  deleteName.value = ''
})
watch(
  () => editingParticipant.value?.id,
  () => {
    selectedExclusionReceiver.value = ''
  },
)
watch(requiresAdminAuth, (value) => {
  if (value) showDelete.value = false
})
</script>

<template>
  <section id="exchange-detail-view">
    <div v-if="requiresAdminAuth" class="card border shadow-sm mb-3">
      <div class="card-body">
        <h3 class="h5 mb-2">{{ t('exchangeDetail.adminAuth.title') }}</h3>
        <p class="text-muted mb-3">{{ t('exchangeDetail.adminAuth.description') }}</p>
        <form class="d-grid gap-3" @submit.prevent="authenticateAdmin">
          <div class="form-field">
            <label for="exchange-admin-password" class="form-label mb-1">{{
              t('exchangeDetail.adminAuth.passwordLabel')
            }}</label>
            <input
              id="exchange-admin-password"
              v-model="adminPassword"
              class="form-control"
              type="password"
              autocomplete="current-password"
              minlength="8"
              maxlength="256"
              aria-describedby="login-password-help"
              required
            />
          </div>
          <div class="d-flex justify-content-end">
            <button
              class="btn btn-primary"
              type="submit"
              :disabled="
                isAuthenticatingAdmin || adminPassword.length < 8 || adminPassword.length > 256
              "
            >
              {{
                isAuthenticatingAdmin
                  ? t('exchangeDetail.adminAuth.loggingIn')
                  : t('exchangeDetail.adminAuth.login')
              }}
            </button>
          </div>
        </form>
        <p id="login-password-help" class="form-text">{{ t('review.passwordHelp') }}</p>
      </div>
    </div>

    <p v-if="configError" class="alert alert-warning" role="status">
      {{ configError }}
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary"
        :disabled="configLoading"
        @click="loadConfig"
      >
        {{ t('p2.retryConfig') }}
      </button>
    </p>
    <p v-if="refreshPaused && !requiresAdminAuth" class="small text-body-secondary" role="status">
      {{ t('p2.refreshPaused') }}
    </p>
    <p v-if="error && exchange && !requiresAdminAuth" class="alert alert-warning" role="alert">
      {{ error }}
    </p>
    <p v-if="actionError" class="alert alert-danger" role="alert">{{ actionError }}</p>
    <button
      v-if="connectionLost && !requiresAdminAuth"
      type="button"
      class="btn btn-outline-secondary mb-3"
      :disabled="mutationBusy || isLoading || showEditExchangeModal || showEditParticipantModal"
      @click="manualRefresh"
    >
      {{ t('p2.refresh') }}
    </button>
    <div v-if="isLoading" role="status">{{ t('exchangeDetail.loading') }}</div>
    <div v-else-if="error && !exchange" class="alert alert-danger" role="alert">
      {{ error }} <router-link to="/">{{ t('p2.home') }}</router-link>
    </div>
    <div v-else-if="exchange && !requiresAdminAuth" class="row g-4 align-items-start">
      <fieldset
        :disabled="mutationBusy || imageUploading"
        class="admin-actions-contents"
        style="display: contents"
      >
        <legend class="visually-hidden">{{ t('p2.adminActions') }}</legend>
        <div class="col-12"><AccessReminder :access-id="exchange.id" organizer /></div>
        <section id="detail" class="col-12">
          <div class="card border shadow-sm">
            <div class="card-body">
              <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
                <div>
                  <h1 class="h2 mb-2">{{ exchange.name }}</h1>
                  <div class="d-flex flex-wrap gap-3 align-items-center">
                    <span class="badge" :class="statusBadgeClass">{{ statusLabel }}</span>
                    <span>{{ participantCountLabel }} {{ t('exchangeDetail.participants') }}</span>
                    <span v-if="exchange.eventDate">{{ formatCivilDate(exchange.eventDate) }}</span>
                    <span v-if="exchange.budget != null"
                      >{{ t('exchangeDetail.budget') }} : {{ formatMoney(exchange.budget) }}</span
                    >
                  </div>
                </div>
                <button
                  v-if="canTriggerDraw"
                  class="btn btn-primary"
                  :disabled="isDrawActionLoading || activeParticipants.length < 2"
                  @click="triggerDraw"
                >
                  {{ t('exchangeDetail.triggerDraw') }}
                </button>
                <button
                  v-else-if="canCancelDraw"
                  class="btn btn-outline-secondary"
                  :disabled="isDrawActionLoading"
                  @click="cancelDraw"
                >
                  {{ t('exchangeDetail.cancelDraw') }}
                </button>
              </div>
              <div class="d-flex flex-wrap justify-content-end gap-3 mt-3">
                <button
                  type="button"
                  class="btn btn-sm btn-link"
                  :disabled="isLoggingOutAdmin"
                  @click="logoutAdmin"
                >
                  {{ t('exchangeDetail.adminAuth.logout') }}
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-link text-danger"
                  @click="showDelete = true"
                >
                  {{ t('exchangeDetail.dashboard.deleteExchange') }}
                </button>
              </div>
              <p v-if="exchange.isDrawn" class="text-success fw-semibold mt-3 mb-0" role="status">
                {{ t('exchangeDetail.drawSuccess') }}
              </p>
              <p
                v-else-if="!exchange.isArchived && activeParticipants.length < 2"
                class="small text-body-secondary mt-3 mb-0"
              >
                {{ t('exchangeDetail.dashboard.minimumParticipants') }}
              </p>
            </div>
          </div>
        </section>
        <section id="exchange-details" class="col-12 col-xl-5">
          <div class="card border shadow-sm">
            <div class="card-body">
              <h2 class="h4">{{ t('exchangeDetail.dashboard.settings') }}</h2>
              <p class="small text-body-secondary">
                {{ t('exchangeDetail.organizer') }} : {{ exchange.organizerName }}
              </p>
              <dl class="small">
                <template v-if="exchange.plannedDrawDate"
                  ><dt>{{ t('review.plannedDrawDate') }}</dt>
                  <dd>{{ formatCivilDate(exchange.plannedDrawDate) }}</dd></template
                >
                <template v-if="exchange.eventDate"
                  ><dt>{{ t('exchangeDetail.exchangeMoment') }}</dt>
                  <dd>{{ formatCivilDate(exchange.eventDate) }}</dd></template
                >
              </dl>
              <p v-if="exchange.description" class="dashboard-description">
                {{ exchange.description }}
              </p>
              <button
                class="btn btn-outline-primary mb-3"
                :disabled="exchange.isArchived"
                @click="startEdit"
              >
                {{ t('exchangeDetail.dashboard.editSettings') }}
              </button>
              <section class="border-top py-3">
                <h3 class="h6">{{ t('exchangeDetail.dashboard.suggestions') }}</h3>
                <dl class="mt-3 mb-0">
                  <dt>{{ t('exchangeDetail.minWishlistSuggestions') }}</dt>
                  <dd>{{ exchange.minWishlistSuggestions ?? 0 }}</dd>
                  <dt>{{ t('exchangeDetail.lockSuggestionsAfterDraw') }}</dt>
                  <dd>
                    {{
                      (exchange.lockSuggestionsAfterDraw ?? true)
                        ? t('exchangeDetail.enabled')
                        : t('exchangeDetail.disabled')
                    }}
                  </dd>
                </dl>
              </section>
              <div class="border-top pt-3">
                <h3 class="h6">{{ t('exchangeDetail.dashboard.rules') }}</h3>
                <p class="small mb-1">
                  {{ t('exchangeDetail.noMutualAssignments') }} :
                  {{
                    exchange.noMutualAssignments
                      ? t('exchangeDetail.enabled')
                      : t('exchangeDetail.disabled')
                  }}
                </p>
                <p class="small">
                  {{ t('exchangeDetail.dashboard.exclusionCount', exclusionRules.length) }}
                </p>
                <ul v-if="exclusionSummary.length" class="ps-3 small">
                  <li v-for="line in exclusionSummary" :key="line">{{ line }}</li>
                </ul>
                <p v-else class="small text-body-secondary">
                  {{ t('exchangeDetail.exceptions.none') }}
                </p>
              </div>
            </div>
          </div>
        </section>
        <!-- Participants -->
        <section id="participants" class="col-12 col-xl-7">
          <div class="card border shadow-sm">
            <div class="card-body">
              <div class="d-flex">
                <h2 class="d-inline-flex align-items-center gap-2 mb-3">
                  <span>{{ t('exchangeDetail.participants') }}</span>
                  <span class="badge fs-6 text-bg-light">{{ participants.length }}</span>
                </h2>
              </div>

              <!-- Formulaire d'ajout de participant inline -->
              <form v-if="!isParticipantCreationLocked" @submit.prevent="handleAddNewParticipant">
                <p
                  v-if="addParticipantError"
                  id="add-participant-error"
                  class="alert alert-danger"
                  role="alert"
                >
                  {{ addParticipantError }}
                </p>
                <label for="new-participant-name" class="visually-hidden">{{
                  t('exchangeDetail.addModal.name')
                }}</label>
                <div class="input-group mb-3">
                  <input
                    id="new-participant-name"
                    :aria-invalid="!!addParticipantFieldErrors.name || undefined"
                    :aria-describedby="addParticipantError ? 'add-participant-error' : undefined"
                    ref="newParticipantNameInput"
                    :aria-label="t('exchangeDetail.addModal.name')"
                    maxlength="150"
                    v-model="newParticipantName"
                    type="text"
                    class="form-control"
                    :placeholder="t('exchangeDetail.addModal.name')"
                    :disabled="isAddingParticipant"
                    required
                  />
                  <button
                    type="submit"
                    class="btn btn-outline-secondary rounded-end"
                    :disabled="!newParticipantName.trim() || isAddingParticipant"
                  >
                    {{ t('exchangeDetail.addParticipant') }} ({{ activeParticipants.length }}/{{
                      maxActiveParticipants
                    }})
                  </button>
                </div>
              </form>
              <ul
                v-if="participants.length"
                class="list-group mb-3 participant-list"
                :aria-label="t('exchangeDetail.participants')"
              >
                <li
                  v-for="participant in participants"
                  :key="participant.id"
                  class="list-group-item d-flex flex-column flex-md-row justify-content-between align-items-start gap-3"
                >
                  <div class="flex-grow-1">
                    <strong class="d-inline-block mb-0">{{ participant.name }}</strong>

                    <div v-if="participant.wishlist?.length" class="small mt-1">
                      <span class="badge text-bg-light">{{
                        t('exchangeDetail.wishlistSuggestions', participant.wishlist.length)
                      }}</span>
                    </div>

                    <span
                      v-if="getParticipantExclusions(participant.id).length"
                      class="small text-body-secondary ms-2"
                      >{{
                        t(
                          'exchangeDetail.dashboard.exclusionCount',
                          getParticipantExclusions(participant.id).length,
                        )
                      }}</span
                    >
                    <details class="mt-1">
                      <summary class="small">
                        {{
                          t('exchangeDetail.dashboard.participantDetails', {
                            name: participant.name,
                          })
                        }}
                      </summary>
                      <p v-if="participant.note" class="small mt-2 dashboard-description">
                        {{ t('exchangeDetail.note') }} : {{ participant.note }}
                      </p>
                      <div class="d-flex flex-wrap gap-2 mt-2">
                        <button
                          class="btn btn-sm btn-outline-primary"
                          :disabled="isParticipantSuggestionsLocked"
                          @click="openEditParticipantModal(participant)"
                        >
                          {{ t('exchangeDetail.edit') }}
                        </button>
                        <button
                          class="btn btn-sm btn-outline-secondary"
                          @click="regenerateParticipantLink(participant.id)"
                        >
                          {{ t('exchangeDetail.generateLink') }}
                        </button>
                        <button
                          class="btn btn-sm btn-outline-secondary"
                          :disabled="isParticipantIdentityLocked"
                          @click="deleteParticipant(participant.id)"
                        >
                          {{ t('exchangeDetail.delete') }}
                        </button>
                      </div>
                    </details>
                  </div>
                </li>
              </ul>

              <p v-else class="mb-3">
                <em>{{ t('exchangeDetail.noParticipants') }}</em>
              </p>
            </div>
          </div>
        </section>
      </fieldset>
    </div>
    <EditExchangeModal
      v-if="exchange"
      :updated-at="exchange.updatedAt"
      :suspended="requiresAdminAuth"
      :save-error="editExchangeError"
      :field-errors="editExchangeFieldErrors"
      :conflict-version="editExchangeCurrent"
      @dirty="exchangeDirty = $event"
      :model-value="showEditExchangeModal"
      :is-submitting="isSavingExchange"
      :rules-locked="exchange.isDrawn"
      :content-locked="exchange.isArchived"
      :name="exchange.name"
      :organizer-name="exchange.organizerName"
      :organizer-editable="!exchange.organizerId"
      :description="exchange.description || ''"
      :event-date="exchange.eventDate"
      :planned-draw-date="exchange.plannedDrawDate"
      :budget="exchange.budget"
      :min-wishlist-suggestions="exchange.minWishlistSuggestions"
      :lock-suggestions-after-draw="exchange.lockSuggestionsAfterDraw"
      :no-mutual-assignments="exchange.noMutualAssignments"
      @update:model-value="(value) => (showEditExchangeModal = value)"
      @submit="saveEdit"
    />

    <EditParticipantModal
      v-if="exchange"
      @uploading="imageUploading = $event"
      @upload-error="handleParticipantUploadError"
      :is-submitting="mutationBusy"
      :suspended="requiresAdminAuth"
      :save-error="editParticipantError"
      :field-errors="editParticipantFieldErrors"
      :conflict-version="editParticipantCurrent"
      @dirty="participantDirty = $event"
      :model-value="showEditParticipantModal"
      :participant="editingParticipant"
      :identity-locked="isParticipantIdentityLocked"
      :suggestions-locked="isParticipantSuggestionsLocked"
      @update:model-value="setEditParticipantModalVisibility"
      @submit="updateParticipant"
    >
      <template #exclusions>
        <section v-if="editingParticipant" class="border-top mt-3 pt-3">
          <h3 class="h6">{{ t('review.editExclusions') }}</h3>
          <p class="small text-body-secondary">{{ t('review.exclusionsHelp') }}</p>
          <p v-if="isExclusionEditingLocked" class="small">
            {{ t('exchangeDetail.exceptions.locked') }}
          </p>
          <ul class="list-unstyled">
            <li
              v-for="rule in getParticipantExclusions(editingParticipant.id)"
              :key="rule.id"
              class="d-flex justify-content-between align-items-center gap-2 mb-2"
            >
              <span>{{ participantNameById[rule.receiverParticipantId] }}</span>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :disabled="isExclusionEditingLocked || mutationBusy || imageUploading"
                @click="removeParticipantExclusion(rule.id)"
              >
                {{ t('exchangeDetail.exceptions.remove') }}
              </button>
            </li>
          </ul>
          <form
            v-if="!isExclusionEditingLocked"
            @submit.prevent="addParticipantExclusion(editingParticipant.id)"
          >
            <div class="form-field mb-2">
              <label for="exclusion-receiver" class="form-label">{{
                t('exchangeDetail.dashboard.receiver')
              }}</label>
              <select
                id="exclusion-receiver"
                v-model="selectedExclusionReceiver"
                class="form-select"
                :disabled="
                  mutationBusy ||
                  imageUploading ||
                  !getReceiverCandidates(editingParticipant.id).length
                "
                required
              >
                <option value="">{{ t('exchangeDetail.exceptions.selectReceiver') }}</option>
                <option
                  v-for="candidate in getReceiverCandidates(editingParticipant.id)"
                  :key="candidate.id"
                  :value="candidate.id"
                >
                  {{ candidate.name }}
                </option>
              </select>
            </div>
            <button
              type="submit"
              class="btn btn-sm btn-outline-primary"
              :disabled="!selectedExclusionReceiver || mutationBusy || imageUploading"
            >
              {{ t('exchangeDetail.exceptions.add') }}
            </button>
          </form>
        </section>
      </template>
    </EditParticipantModal>

    <BaseModal
      v-if="exchange && !requiresAdminAuth"
      v-model="showDelete"
      :title="t('review.deleteTitle')"
      :before-close="() => !mutationBusy"
    >
      <p>{{ t('review.deleteHelp', { name: exchange.name }) }}</p>
      <form class="form-field" id="delete-exchange-form" @submit.prevent="handleDelete(deleteName)">
        <label for="delete-exchange-name" class="form-label">{{ t('review.confirmName') }}</label>
        <input
          id="delete-exchange-name"
          v-model="deleteName"
          class="form-control"
          autocomplete="off"
          :disabled="mutationBusy"
          required
        />
        <p v-if="error && exchange && !requiresAdminAuth" class="alert alert-warning" role="alert">
          {{ error }}
        </p>
        <p v-if="actionError" class="text-danger" role="alert">{{ actionError }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-link" data-bs-dismiss="modal" :disabled="mutationBusy">
          {{ t('actions.cancel') }}
        </button>
        <button
          type="submit"
          form="delete-exchange-form"
          class="btn btn-danger"
          :disabled="deleteName !== exchange.name || mutationBusy"
        >
          {{ t('exchangeDetail.delete') }}
        </button>
      </template>
    </BaseModal>
    <ParticipantAccessLinkModal
      v-if="!requiresAdminAuth"
      :model-value="showAccessLinkModal"
      :link="latestAccessLink"
      :participant-name="latestAccessName"
      @update:model-value="setAccessLinkModalVisibility"
    />
  </section>
</template>

<style scoped>
summary {
  cursor: pointer;
}
summary:focus-visible,
.participant-list:focus-visible {
  outline: 3px solid var(--bs-primary);
  outline-offset: 4px;
  border-radius: 0.25rem;
}
.dashboard-description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.participant-list {
  overflow: visible;
}
.list-group-item {
  overflow-wrap: anywhere;
}
</style>
