<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import BaseModal from '@/components/BaseModal.vue'
import AccessReminder from '@/components/AccessReminder.vue'
import ExchangeHeader from '@/components/ExchangeHeader.vue'
import ExchangeDetails from '@/components/ExchangeDetails.vue'
import { useRoute } from 'vue-router'
import { useAdminAuthStore } from '@/stores/useAdminAuthStore'
import { provideImageAccess } from '@/composables/useImageAccess'
import { useExchangeAdmin } from '@/composables/useExchangeAdmin'
import { useI18n } from 'vue-i18n'
import EditExchangeModal from '@/components/EditExchangeModal.vue'
import EditParticipantModal from '@/components/EditParticipantModal.vue'
import ParticipantAccessLinkModal from '@/components/ParticipantAccessLinkModal.vue'
const { t } = useI18n()
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
const namedExclusions = computed(() =>
  exclusionRules.value.map((rule) => ({
    ...rule,
    giverName: participantNameById.value[rule.giverParticipantId] ?? rule.giverParticipantId,
    receiverName:
      participantNameById.value[rule.receiverParticipantId] ?? rule.receiverParticipantId,
  })),
)
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
        <form class="d-flex flex-column gap-3" @submit.prevent="authenticateAdmin">
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
    <div v-if="isLoading" role="status">{{ t('common.loading') }}</div>
    <div v-else-if="error && !exchange" class="alert alert-danger" role="alert">
      {{ error }} <router-link to="/">{{ t('p2.home') }}</router-link>
    </div>
    <div v-else-if="exchange && !requiresAdminAuth">
      <fieldset
        :disabled="mutationBusy || imageUploading"
        class="admin-actions-contents d-flex flex-wrap align-items-start gap-4"
      >
        <legend class="visually-hidden">{{ t('p2.adminActions') }}</legend>
        <div class="w-100"><AccessReminder :access-id="exchange.id" organizer /></div>
        <section id="detail" class="w-100">
          <ExchangeHeader
            :title="exchange.name"
            :label="t('fields.organizerName')"
            :status="statusLabel"
            :status-class="statusBadgeClass"
          >
            <template #actions>
              <button
                v-if="canTriggerDraw"
                type="button"
                class="btn btn-primary"
                :disabled="isDrawActionLoading || activeParticipants.length < 3"
                @click="triggerDraw"
              >
                <i class="bi bi-shuffle" aria-hidden="true"></i
                >{{ t('exchangeDetail.triggerDraw') }}
              </button>
              <button
                v-else-if="canCancelDraw"
                type="button"
                class="btn btn-outline-secondary"
                :disabled="isDrawActionLoading"
                @click="cancelDraw"
              >
                {{ t('exchangeDetail.cancelDraw') }}
              </button>
            </template>
            <template #tools>
              <button
                type="button"
                class="btn btn-sm btn-link"
                :disabled="isLoggingOutAdmin"
                @click="logoutAdmin"
              >
                <i class="bi bi-box-arrow-right" aria-hidden="true"></i
                >{{ t('exchangeDetail.adminAuth.logout') }}
              </button>
              <button
                type="button"
                class="btn btn-sm btn-link text-danger"
                @click="showDelete = true"
              >
                <i class="bi bi-trash" aria-hidden="true"></i
                >{{ t('exchangeDetail.dashboard.deleteExchange') }}
              </button>
            </template>
            <p v-if="exchange.isDrawn" class="text-success mb-0" role="status">
              {{ t('exchangeDetail.drawSuccess') }}
            </p>
            <p v-else-if="!exchange.isArchived && activeParticipants.length < 3" class="mb-0">
              {{ t('exchangeDetail.dashboard.minimumParticipants') }}
            </p>
          </ExchangeHeader>
        </section>
        <section id="exchange-details" class="organizer-summary">
          <ExchangeDetails
            :exchange="exchange"
            :exclusions="namedExclusions"
            editable
            @edit="startEdit"
          />
        </section>
        <!-- Participants -->
        <section id="participants" class="organizer-participants">
          <div class="card border shadow-sm">
            <div class="card-body">
              <div class="d-flex">
                <h2 class="d-inline-flex align-items-center gap-2 mb-3">
                  <span>{{ t('common.participants') }}</span>
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
                  t('fields.name')
                }}</label>
                <div class="input-group mb-3">
                  <input
                    id="new-participant-name"
                    :aria-invalid="!!addParticipantFieldErrors.name || undefined"
                    :aria-describedby="addParticipantError ? 'add-participant-error' : undefined"
                    ref="newParticipantNameInput"
                    :aria-label="t('fields.name')"
                    maxlength="150"
                    v-model="newParticipantName"
                    type="text"
                    class="form-control"
                    :placeholder="t('fields.name')"
                    :disabled="isAddingParticipant"
                    required
                  />
                  <button
                    type="submit"
                    class="btn btn-outline-secondary rounded-end"
                    :disabled="!newParticipantName.trim() || isAddingParticipant"
                  >
                    {{ t('actions.add') }}
                  </button>
                </div>
              </form>
              <ul
                v-if="participants.length"
                class="list-group mb-3 participant-list overflow-visible"
                :aria-label="t('common.participants')"
              >
                <li
                  v-for="participant in participants"
                  :key="participant.id"
                  class="list-group-item participant-row d-flex align-items-center justify-content-between gap-2 py-2"
                >
                  <div class="participant-info flex-grow-1">
                    <div class="participant-identity d-flex flex-wrap align-items-center gap-2">
                      <strong>{{ participant.name }}</strong>
                      <span v-if="participant.wishlist?.length" class="badge text-bg-light">{{
                        t('exchangeDetail.wishlistSuggestions', participant.wishlist.length)
                      }}</span>
                      <span
                        v-if="getParticipantExclusions(participant.id).length"
                        class="small text-body-secondary"
                        >{{
                          t(
                            'exchangeDetail.dashboard.exclusionCount',
                            getParticipantExclusions(participant.id).length,
                          )
                        }}</span
                      >
                    </div>
                    <p
                      v-if="participant.note"
                      class="preserve-lines small text-body-secondary mt-1 mb-0"
                    >
                      {{ participant.note }}
                    </p>
                  </div>
                  <div
                    class="btn-group btn-group-sm participant-actions flex-shrink-0"
                    role="group"
                    :aria-label="t('review.participantActions', { name: participant.name })"
                  >
                    <button
                      type="button"
                      class="btn btn-outline-primary"
                      :disabled="isParticipantSuggestionsLocked"
                      :title="t('actions.edit')"
                      @click="openEditParticipantModal(participant)"
                    >
                      <i class="bi bi-pencil" aria-hidden="true"></i
                      ><span class="visually-hidden">{{ t('actions.edit') }}</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      :title="t('exchangeDetail.generateLink')"
                      @click="regenerateParticipantLink(participant.id)"
                    >
                      <i class="bi bi-link-45deg" aria-hidden="true"></i
                      ><span class="visually-hidden">{{ t('exchangeDetail.generateLink') }}</span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-danger"
                      :disabled="isParticipantIdentityLocked"
                      :title="t('actions.delete')"
                      @click="deleteParticipant(participant.id)"
                    >
                      <i class="bi bi-trash" aria-hidden="true"></i
                      ><span class="visually-hidden">{{ t('actions.delete') }}</span>
                    </button>
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
      :save-participant="updateParticipant"
      :identity-locked="isParticipantIdentityLocked"
      :suggestions-locked="isParticipantSuggestionsLocked"
      @update:model-value="setEditParticipantModalVisibility"
    >
      <template #exclusions>
        <section v-if="editingParticipant" class="border-top mt-3 pt-3">
          <h3 class="h6">{{ t('review.editExclusions') }}</h3>
          <p class="small text-body-secondary">{{ t('review.exclusionsHelp') }}</p>
          <p v-if="exchange?.noMutualAssignments" class="small text-body-secondary">
            {{ t('review.reciprocalExclusions') }}
          </p>
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
                {{ t('actions.delete') }}
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
              {{ t('actions.add') }}
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
          {{ t('actions.delete') }}
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
.participant-info {
  min-width: 0;
}
.participant-identity {
  min-width: 0;
  overflow-wrap: anywhere;
}
.participant-actions .btn {
  min-width: 2.5rem;
  min-height: 2.5rem;
}
@media (hover: hover) and (pointer: fine) {
  .participant-actions {
    opacity: 0;
    pointer-events: none;
  }
  .participant-row:hover .participant-actions,
  .participant-row:focus-within .participant-actions {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
