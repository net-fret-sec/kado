<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAdminAuthStore } from '@/stores/useAdminAuthStore'
import { provideImageAccess } from '@/composables/useImageAccess'
import { formatCivilDate } from '@/composables/useCivilDate'
import { useExchangeAdmin } from '@/composables/useExchangeAdmin'
import { useI18n } from 'vue-i18n'
import EditExchangeModal from '@/components/EditExchangeModal.vue'
import EditParticipantModal from '@/components/EditParticipantModal.vue'
import ParticipantAccessLinkModal from '@/components/ParticipantAccessLinkModal.vue'
const { t } = useI18n()
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
  selectedExclusionGiver,
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
  passwordError,
  passwordFieldErrors,
  editExchangeError,
  editParticipantError,
  editExchangeCurrent,
  editParticipantCurrent,
  exchangeDirty,
  isSavingExchange,
  isDrawActionLoading,
  isLoggingOutAdmin,
  isChangingAdminPassword,
  currentAdminPassword,
  newAdminPassword,
  confirmAdminPassword,
  showEditParticipantModal,
  showAccessLinkModal,
  editingParticipant,
  latestAccessLink,
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
  addParticipantExclusion,
  removeParticipantExclusion,
  authenticateAdmin,
  changeAdminPassword,
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
</script>

<template>
  <section id="exchange-detail-view">
    <div v-if="requiresAdminAuth" class="card border shadow-sm mb-3">
      <div class="card-body">
        <h3 class="h5 mb-2">{{ t('exchangeDetail.adminAuth.title') }}</h3>
        <p class="text-muted mb-3">{{ t('exchangeDetail.adminAuth.description') }}</p>
        <form class="row g-2 align-items-end" @submit.prevent="authenticateAdmin">
          <div class="col-12 col-md-8">
            <label for="exchange-admin-password" class="form-label mb-1">{{
              t('exchangeDetail.adminAuth.passwordLabel')
            }}</label>
            <input
              id="exchange-admin-password"
              v-model="adminPassword"
              class="form-control"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
          <div class="col-12 col-md-4 d-grid">
            <button class="btn btn-primary" type="submit" :disabled="isAuthenticatingAdmin">
              {{
                isAuthenticatingAdmin
                  ? t('exchangeDetail.adminAuth.loggingIn')
                  : t('exchangeDetail.adminAuth.login')
              }}
            </button>
          </div>
        </form>
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
    <p v-if="actionError" class="alert alert-danger" role="alert">{{ actionError }}</p>
    <button
      v-if="!requiresAdminAuth"
      type="button"
      class="btn btn-outline-secondary mb-3"
      :disabled="mutationBusy || isLoading || showEditExchangeModal || showEditParticipantModal"
      @click="manualRefresh"
    >
      {{ t('p2.refresh') }}
    </button>
    <div v-if="isLoading" role="status">{{ t('exchangeDetail.loading') }}</div>
    <div v-else-if="error" class="alert alert-danger" role="alert">
      {{ error }} <router-link to="/">{{ t('p2.home') }}</router-link>
    </div>
    <div v-else-if="exchange && !requiresAdminAuth" class="row g-4 align-items-start">
      <fieldset
        :disabled="mutationBusy || imageUploading"
        class="admin-actions-contents"
        style="display: contents"
      >
        <legend class="visually-hidden">{{ t('p2.adminActions') }}</legend>
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
                      >{{ t('exchangeDetail.budget') }} : {{ exchange.budget }}</span
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
                tabindex="0"
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
        <section id="settings" class="col-12 col-xl-5">
          <div class="card border shadow-sm">
            <div class="card-body">
              <h2 class="h4">{{ t('exchangeDetail.dashboard.settings') }}</h2>
              <p class="small text-body-secondary">
                {{ t('exchangeDetail.organizer') }} : {{ exchange.organizerName }}
              </p>
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
              <details class="border-top py-3">
                <summary class="fw-semibold">
                  {{ t('exchangeDetail.dashboard.suggestions') }}
                </summary>
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
              </details>
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
                <details>
                  <summary class="fw-semibold">
                    {{ t('exchangeDetail.dashboard.manageExclusions') }}
                  </summary>
                  <p class="small text-body-secondary mt-3">
                    {{ t('exchangeDetail.dashboard.directional') }}
                  </p>
                  <p v-if="isExclusionEditingLocked" class="alert alert-info small">
                    {{ t('exchangeDetail.exceptions.locked') }}
                  </p>
                  <ul v-if="exclusionRules.length" class="list-unstyled d-grid gap-2">
                    <li
                      v-for="rule in exclusionRules"
                      :key="rule.id"
                      class="border rounded p-2 d-flex flex-wrap align-items-center justify-content-between gap-2"
                    >
                      <span
                        >{{
                          participantNameById[rule.giverParticipantId] || rule.giverParticipantId
                        }}
                        {{ t('exchangeDetail.exceptions.cannotDraw') }}
                        <strong>{{
                          participantNameById[rule.receiverParticipantId] ||
                          rule.receiverParticipantId
                        }}</strong></span
                      >
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        :disabled="isExclusionEditingLocked"
                        :aria-label="
                          t('exchangeDetail.dashboard.removeExclusion', {
                            giver: participantNameById[rule.giverParticipantId],
                            receiver: participantNameById[rule.receiverParticipantId],
                          })
                        "
                        @click="removeParticipantExclusion(rule.id)"
                      >
                        {{ t('exchangeDetail.exceptions.remove') }}
                      </button>
                    </li>
                  </ul>
                  <p v-else class="small text-body-secondary">
                    {{ t('exchangeDetail.exceptions.none') }}
                  </p>
                  <form
                    v-if="!isExclusionEditingLocked"
                    class="d-grid gap-2"
                    @submit.prevent="addParticipantExclusion(selectedExclusionGiver)"
                  >
                    <label for="exclusion-giver">{{ t('exchangeDetail.dashboard.giver') }}</label>
                    <select
                      id="exclusion-giver"
                      v-model="selectedExclusionGiver"
                      class="form-select"
                      required
                    >
                      <option value="">{{ t('exchangeDetail.dashboard.selectGiver') }}</option>
                      <option
                        v-for="participant in activeParticipants"
                        :key="participant.id"
                        :value="participant.id"
                      >
                        {{ participant.name }}
                      </option>
                    </select>
                    <label for="exclusion-receiver">{{
                      t('exchangeDetail.dashboard.receiver')
                    }}</label>
                    <select
                      id="exclusion-receiver"
                      v-model="selectedExclusionReceiver"
                      class="form-select"
                      :disabled="
                        !selectedExclusionGiver ||
                        !getReceiverCandidates(selectedExclusionGiver).length
                      "
                      required
                    >
                      <option value="">{{ t('exchangeDetail.exceptions.selectReceiver') }}</option>
                      <option
                        v-for="candidate in getReceiverCandidates(selectedExclusionGiver)"
                        :key="candidate.id"
                        :value="candidate.id"
                      >
                        {{ candidate.name }}
                      </option>
                    </select>
                    <button
                      class="btn btn-outline-primary"
                      :disabled="!selectedExclusionGiver || !selectedExclusionReceiver"
                    >
                      {{ t('exchangeDetail.exceptions.add') }}
                    </button>
                  </form>
                </details>
              </div>
            </div>
          </div>
        </section>
        <section class="col-12">
          <details class="card border shadow-sm">
            <summary class="p-3 fw-semibold">
              {{ t('exchangeDetail.dashboard.administration') }}
            </summary>
            <div class="card-body pt-0">
              <details class="mb-3">
                <summary>{{ t('exchangeDetail.adminAuth.changePasswordTitle') }}</summary>
                <p class="small text-body-secondary mt-3">
                  {{ t('exchangeDetail.adminAuth.changePasswordDescription') }}
                </p>
                <form
                  id="admin-password-form"
                  class="row g-2"
                  @submit.prevent="changeAdminPassword"
                >
                  <p
                    v-if="passwordError"
                    id="admin-password-error"
                    class="alert alert-danger"
                    role="alert"
                  >
                    {{ passwordError }}
                  </p>
                  <div class="col-12">
                    <label for="current-admin-password" class="form-label">
                      {{ t('exchangeDetail.adminAuth.currentPasswordLabel') }}
                    </label>
                    <input
                      id="current-admin-password"
                      :aria-invalid="!!passwordFieldErrors.currentPassword || undefined"
                      :aria-describedby="passwordError ? 'admin-password-error' : undefined"
                      v-model="currentAdminPassword"
                      type="password"
                      class="form-control"
                      minlength="10"
                      required
                    />
                  </div>
                  <div class="col-12 col-md-6">
                    <label for="new-admin-password" class="form-label">
                      {{ t('exchangeDetail.adminAuth.newPasswordLabel') }}
                    </label>
                    <input
                      id="new-admin-password"
                      :aria-invalid="!!passwordFieldErrors.newPassword || undefined"
                      :aria-describedby="passwordError ? 'admin-password-error' : undefined"
                      v-model="newAdminPassword"
                      type="password"
                      class="form-control"
                      minlength="10"
                      required
                    />
                  </div>
                  <div class="col-12 col-md-6">
                    <label for="confirm-admin-password" class="form-label">
                      {{ t('exchangeDetail.adminAuth.confirmPasswordLabel') }}
                    </label>
                    <input
                      id="confirm-admin-password"
                      :aria-invalid="!!passwordFieldErrors.confirmPassword || undefined"
                      :aria-describedby="passwordError ? 'admin-password-error' : undefined"
                      v-model="confirmAdminPassword"
                      type="password"
                      class="form-control"
                      minlength="10"
                      required
                    />
                  </div>
                  <div class="col-12 d-grid d-md-flex justify-content-md-end">
                    <button
                      class="btn btn-outline-secondary"
                      type="submit"
                      :disabled="isChangingAdminPassword"
                    >
                      {{
                        isChangingAdminPassword
                          ? t('exchangeDetail.adminAuth.changingPassword')
                          : t('exchangeDetail.adminAuth.changePassword')
                      }}
                    </button>
                  </div>
                </form>
              </details>
              <div class="d-flex flex-wrap gap-2">
                <button
                  class="btn btn-outline-secondary"
                  :disabled="isLoggingOutAdmin"
                  @click="logoutAdmin"
                >
                  {{
                    isLoggingOutAdmin
                      ? t('exchangeDetail.adminAuth.loggingOut')
                      : t('exchangeDetail.adminAuth.logout')
                  }}
                </button>
                <button class="btn btn-outline-secondary" @click="handleDelete">
                  {{ t('exchangeDetail.dashboard.deleteExchange') }}
                </button>
              </div>
            </div>
          </details>
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
    />

    <ParticipantAccessLinkModal
      v-if="!requiresAdminAuth"
      :model-value="showAccessLinkModal"
      :link="latestAccessLink"
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
  max-height: 28rem;
  overflow-y: auto;
}
.list-group-item {
  overflow-wrap: anywhere;
}
</style>
