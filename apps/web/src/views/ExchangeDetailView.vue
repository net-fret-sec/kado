<script setup lang="ts">
import { formatCivilDate } from '@/composables/useCivilDate'
import { useExchangeAdmin } from '@/composables/useExchangeAdmin'
import { useI18n } from 'vue-i18n'
import EditExchangeModal from '@/components/EditExchangeModal.vue'
import EditParticipantModal from '@/components/EditParticipantModal.vue'
import ParticipantAccessLinkModal from '@/components/ParticipantAccessLinkModal.vue'
const { t } = useI18n()
const {
  exchange,
  participants,
  selectedExceptionReceiverByParticipant,
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
  isSummaryMode,
  isDetailMode,
  canTriggerDraw,
  canCancelDraw,
  isParticipantCreationLocked,
  isParticipantIdentityLocked,
  isParticipantSuggestionsLocked,
  participantCountLabel,
  publicExchangeLink,
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
} = useExchangeAdmin()
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
      <fieldset :disabled="mutationBusy" class="admin-actions-contents" style="display: contents">
        <legend class="visually-hidden">{{ t('p2.adminActions') }}</legend>
        <!-- Détails de l'échange -->
        <section id="detail" class="col-12 col-xl-7">
          <div class="card border shadow-sm">
            <div class="card-body">
              <div
                class="d-flex justify-content-between align-items-start gap-2 mb-3 flex-column flex-md-row"
              >
                <div>
                  <h2 class="mb-1">{{ exchange.name }}</h2>
                  <p class="text-muted small mb-0">
                    {{ participantCountLabel }} {{ t('exchangeDetail.participants') }} •
                    {{ statusLabel }}
                  </p>
                </div>
                <router-link
                  class="btn btn-sm btn-outline-primary text-nowrap"
                  :to="{ name: 'exchange-public', params: { id: exchange.id } }"
                >
                  {{ t('exchangeDetail.share') }}
                </router-link>
              </div>

              <div class="d-flex align-items-center gap-2 mb-3">
                <span class="small text-muted">{{ t('exchangeDetail.viewMode.summary') }}</span>
                <div class="form-check form-switch mb-0">
                  <input
                    id="exchange-view-mode-switch"
                    v-model="isDetailMode"
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    :aria-label="t('exchangeDetail.viewMode.label')"
                  />
                </div>
                <span class="small text-muted">{{ t('exchangeDetail.viewMode.detail') }}</span>
              </div>

              <p v-if="exchange.description">{{ exchange.description }}</p>
              <ul>
                <li>
                  <b>{{ t('exchangeDetail.organizer') }} :</b> {{ exchange.organizerName }}
                </li>
                <li>
                  <b>{{ t('exchangeDetail.status') }} :</b>
                  <span class="badge ms-1" :class="statusBadgeClass">{{ statusLabel }}</span>
                </li>
                <li>
                  <b>{{ t('exchangeDetail.minWishlistSuggestions') }} :</b>
                  {{ exchange.minWishlistSuggestions ?? 0 }}
                </li>

                <template v-if="!isSummaryMode">
                  <li v-if="exchange.eventDate">
                    <b>{{ t('exchangeDetail.exchangeMoment') }} :</b>
                    {{ formatCivilDate(exchange.eventDate) }}
                  </li>
                  <li v-if="exchange.budget != null">
                    <b>{{ t('exchangeDetail.budget') }} :</b> {{ exchange.budget }}
                  </li>
                  <li>
                    <b>{{ t('exchangeDetail.lockSuggestionsAfterDraw') }} :</b>
                    {{
                      (exchange.lockSuggestionsAfterDraw ?? true)
                        ? t('exchangeDetail.enabled')
                        : t('exchangeDetail.disabled')
                    }}
                  </li>
                  <li>
                    <b>{{ t('exchangeDetail.noMutualAssignments') }} :</b>
                    {{
                      exchange.noMutualAssignments
                        ? t('exchangeDetail.enabled')
                        : t('exchangeDetail.disabled')
                    }}
                  </li>
                  <li>
                    <b>{{ t('exchangeDetail.createdAt') }} :</b>
                    {{ new Date(exchange.createdAt).toLocaleString() }}
                  </li>
                </template>
              </ul>

              <div class="d-flex flex-wrap gap-2 mb-2">
                <button class="btn btn-warning" :disabled="exchange.isArchived" @click="startEdit">
                  {{ t('exchangeDetail.edit') }}
                </button>
                <button
                  v-if="canTriggerDraw"
                  class="btn btn-primary"
                  :disabled="isDrawActionLoading"
                  @click="triggerDraw"
                >
                  {{ t('exchangeDetail.triggerDraw') }}
                </button>
                <button
                  v-else-if="canCancelDraw"
                  class="btn btn-outline-warning"
                  :disabled="isDrawActionLoading"
                  @click="cancelDraw"
                >
                  {{ t('exchangeDetail.cancelDraw') }}
                </button>
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
              </div>

              <div
                v-if="exchange.isDrawn"
                class="d-flex align-items-center flex-wrap gap-1 mb-2 small fw-semibold text-success"
              >
                <span aria-hidden="true">✔</span>
                <span>{{ t('exchangeDetail.drawSuccess') }}</span>
                <router-link
                  class="link-primary text-decoration-none"
                  :to="{ name: 'exchange-public', params: { id: exchange.id } }"
                >
                  {{ t('exchangeDetail.openPublicView') }}
                </router-link>
              </div>

              <div v-if="!isSummaryMode">
                <button class="btn btn-danger" @click="handleDelete">
                  {{ t('exchangeDetail.delete') }}
                </button>
              </div>

              <div class="card border mt-3 d-none">
                <div class="card-body">
                  <details>
                    <summary>
                      <span class="h5">{{
                        t('exchangeDetail.adminAuth.changePasswordTitle')
                      }}</span>
                    </summary>

                    <p class="small text-muted mb-3">
                      {{ t('exchangeDetail.adminAuth.changePasswordDescription') }}
                    </p>

                    <div v-if="publicExchangeLink" class="small mb-2">
                      <b>{{ t('exchangeDetail.adminAuth.publicLinkLabel') }}:</b>
                      <a :href="publicExchangeLink">{{ publicExchangeLink }}</a>
                    </div>

                    <form class="row g-2" @submit.prevent="changeAdminPassword">
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
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Participants -->
        <section id="participants" class="col-12 col-xl-5">
          <div class="card border shadow-sm">
            <div class="card-body">
              <div class="d-flex">
                <h2 class="d-inline-flex align-items-center gap-2 mb-3">
                  <span>{{ t('exchangeDetail.participants') }}</span>
                  <span class="badge fs-6 text-bg-light">{{ participants.length }}</span>
                </h2>
              </div>

              <ul v-if="participants.length" class="list-group mb-3">
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

                    <div v-if="!isSummaryMode && participant.note" class="small mt-1">
                      {{ t('exchangeDetail.note') }}: {{ participant.note }}
                    </div>

                    <div v-if="!isSummaryMode" class="mt-3 pt-2 border-top">
                      <div class="d-inline-flex align-items-center gap-2 mb-2">
                        <span class="fw-semibold">{{ t('exchangeDetail.exceptions.title') }}</span>
                        <span class="badge text-bg-light">
                          {{ getParticipantExclusions(participant.id).length }}
                        </span>
                      </div>

                      <ul
                        v-if="getParticipantExclusions(participant.id).length"
                        class="list-unstyled d-grid gap-2 mb-2"
                      >
                        <li
                          v-for="rule in getParticipantExclusions(participant.id)"
                          :key="rule.id"
                          class="d-flex align-items-center justify-content-between gap-2 p-2 rounded border surface-beige"
                        >
                          <span>
                            {{ t('exchangeDetail.exceptions.cannotDraw') }}
                            <strong>
                              {{
                                participantNameById[rule.receiverParticipantId] ||
                                rule.receiverParticipantId
                              }}
                            </strong>
                          </span>
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-danger p-1"
                            :disabled="isExclusionEditingLocked"
                            :aria-label="t('exchangeDetail.exceptions.remove')"
                            :title="t('exchangeDetail.exceptions.remove')"
                            @click="removeParticipantExclusion(rule.id)"
                          >
                            <i class="bi bi-x-lg" aria-hidden="true"></i>
                            <span class="visually-hidden">{{
                              t('exchangeDetail.exceptions.remove')
                            }}</span>
                          </button>
                        </li>
                      </ul>

                      <p v-else class="mb-2 text-muted small">
                        {{ t('exchangeDetail.exceptions.none') }}
                      </p>

                      <div
                        class="d-flex align-items-center flex-wrap gap-2"
                        v-if="participant.status === 'active'"
                      >
                        <select
                          class="form-select form-select-sm flex-grow-1"
                          :disabled="
                            isExclusionEditingLocked ||
                            !getReceiverCandidates(participant.id).length
                          "
                          v-model="selectedExceptionReceiverByParticipant[participant.id]"
                        >
                          <option value="">
                            {{ t('exchangeDetail.exceptions.selectReceiver') }}
                          </option>
                          <option
                            v-for="candidate in getReceiverCandidates(participant.id)"
                            :key="candidate.id"
                            :value="candidate.id"
                          >
                            {{ candidate.name }}
                          </option>
                        </select>
                        <button
                          type="button"
                          class="btn btn-sm btn-outline-primary p-1"
                          :disabled="
                            isExclusionEditingLocked ||
                            !selectedExceptionReceiverByParticipant[participant.id]
                          "
                          :aria-label="t('exchangeDetail.exceptions.add')"
                          :title="t('exchangeDetail.exceptions.add')"
                          @click="addParticipantExclusion(participant.id)"
                        >
                          <i class="bi bi-plus-lg" aria-hidden="true"></i>
                          <span class="visually-hidden">{{
                            t('exchangeDetail.exceptions.add')
                          }}</span>
                        </button>
                      </div>

                      <p v-if="isExclusionEditingLocked" class="mb-0 text-muted small mt-2">
                        {{ t('exchangeDetail.exceptions.locked') }}
                      </p>
                    </div>
                  </div>
                  <div
                    class="d-inline-flex flex-wrap gap-2 align-items-start justify-content-start justify-content-md-end mt-2 mt-md-0 ms-md-2"
                  >
                    <button
                      class="btn btn-sm btn-outline-primary p-1"
                      :aria-label="t('exchangeDetail.edit')"
                      :title="t('exchangeDetail.edit')"
                      :disabled="isParticipantSuggestionsLocked"
                      @click="openEditParticipantModal(participant)"
                    >
                      <i class="bi bi-pencil" aria-hidden="true"></i>
                      <span class="visually-hidden">{{ t('exchangeDetail.edit') }}</span>
                    </button>
                    <button
                      class="btn btn-sm btn-outline-secondary p-1"
                      :aria-label="t('exchangeDetail.generateLink')"
                      :title="t('exchangeDetail.generateLink')"
                      @click="regenerateParticipantLink(participant.id)"
                    >
                      <i class="bi bi-link-45deg" aria-hidden="true"></i>
                      <span class="visually-hidden">{{ t('exchangeDetail.generateLink') }}</span>
                    </button>
                    <button
                      class="btn btn-sm btn-outline-danger p-1"
                      v-if="!isSummaryMode"
                      :aria-label="t('exchangeDetail.delete')"
                      :title="t('exchangeDetail.delete')"
                      :disabled="isParticipantIdentityLocked"
                      @click="deleteParticipant(participant.id)"
                    >
                      <i class="bi bi-trash" aria-hidden="true"></i>
                      <span class="visually-hidden">{{ t('exchangeDetail.delete') }}</span>
                    </button>
                  </div>
                </li>
              </ul>

              <p v-else class="mb-3">
                <em>{{ t('exchangeDetail.noParticipants') }}</em>
              </p>

              <p>{{ activeParticipants.length }} / {{ maxActiveParticipants }}</p>
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
      :budget="exchange.budget"
      :min-wishlist-suggestions="exchange.minWishlistSuggestions"
      :lock-suggestions-after-draw="exchange.lockSuggestionsAfterDraw"
      :no-mutual-assignments="exchange.noMutualAssignments"
      @update:model-value="(value) => (showEditExchangeModal = value)"
      @submit="saveEdit"
    />

    <EditParticipantModal
      v-if="exchange"
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
