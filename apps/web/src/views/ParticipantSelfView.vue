<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  updateParticipantInputSchema,
  type ParticipantSelfViewDto,
  type UpdateParticipantInputDto,
} from '@kado/shared'
import { useApi, HttpError, isRequestAborted } from '@/composables/useApi'
import { useWishlist, serializeWishlist } from '@/composables/useWishlist'
import { clone, equal, useConflict, type FormValues } from '@/composables/useConflict'
import { useDraftGuard } from '@/composables/useDraftGuard'
import { useRefresh } from '@/composables/useRefresh'
import { useFormErrors } from '@/composables/useFormErrors'
import { useToastsStore } from '@/stores/toasts'
import WishlistEditor from '@/components/WishlistEditor.vue'
import WishlistSuggestionItem from '@/components/WishlistSuggestionItem.vue'
import ConflictReview from '@/components/ConflictReview.vue'

const { t } = useI18n()
const route = useRoute()
const api = useApi()
const toasts = useToastsStore()
const view = ref<ParticipantSelfViewDto | null>(null)
const name = ref(''),
  email = ref(''),
  note = ref('')
const { wishlist, hydrate } = useWishlist()
const isLoading = ref(true),
  isSaving = ref(false)
const baselineVersion = ref('')
const form = useFormErrors()
const { error, fieldErrors } = form
const conflict = useConflict()
const { remote, fields, choices, ready } = conflict
function values(): FormValues {
  return {
    name: name.value,
    email: email.value,
    note: note.value,
    wishlist: serializeWishlist(wishlist.value),
  }
}
function serverValues(current: ParticipantSelfViewDto): FormValues {
  return {
    name: current.participant.name,
    email: current.participant.email ?? '',
    note: current.participant.note ?? '',
    wishlist: current.participant.wishlist ?? [],
  }
}
const dirty = computed(() => Boolean(view.value) && !equal(values(), conflict.baseline.value))
useDraftGuard(dirty)
const identityLocked = computed(
  () => !view.value || view.value.exchange.isDrawn || view.value.exchange.isArchived,
)
const suggestionsLocked = computed(
  () =>
    !view.value ||
    view.value.exchange.isArchived ||
    (view.value.exchange.isDrawn && view.value.exchange.lockSuggestionsAfterDraw),
)
const canEdit = computed(() => !suggestionsLocked.value)
const enabled = computed(() => !isSaving.value)
const requiredMinSuggestions = computed(() => view.value?.exchange.minWishlistSuggestions ?? 0)
function payload(): UpdateParticipantInputDto {
  return {
    name: name.value.trim(),
    email: email.value.trim() || undefined,
    note: note.value.trim() || undefined,
    wishlist: wishlist.value.length ? serializeWishlist(wishlist.value) : undefined,
    expectedUpdatedAt: baselineVersion.value,
  }
}
const valid = computed(() => updateParticipantInputSchema.safeParse(payload()).success)
function setValues(value: FormValues) {
  name.value = String(value.name ?? '')
  email.value = String(value.email ?? '')
  note.value = String(value.note ?? '')
  hydrate((value.wishlist ?? []) as NonNullable<ParticipantSelfViewDto['participant']['wishlist']>)
}
function initialize(current: ParticipantSelfViewDto) {
  const currentValues = serverValues(current)
  setValues(currentValues)
  conflict.baseline.value = clone(currentValues)
  baselineVersion.value = current.participant.updatedAt
  remote.value = null
}
function lockedFields(current: ParticipantSelfViewDto) {
  const locked = current.exchange.isDrawn || current.exchange.isArchived ? ['name', 'email'] : []
  if (
    current.exchange.isArchived ||
    (current.exchange.isDrawn && current.exchange.lockSuggestionsAfterDraw)
  )
    locked.push('note', 'wishlist')
  return locked
}
async function load(signal: AbortSignal) {
  const token = String(route.params.token)
  try {
    const current = await api.get<ParticipantSelfViewDto>(`/api/p/${encodeURIComponent(token)}`, {
      signal,
    })
    if (signal.aborted || token !== route.params.token) return
    const wasDirty = dirty.value
    view.value = current
    if (!wasDirty) initialize(current)
    else if (
      current.participant.updatedAt !== baselineVersion.value ||
      current.exchange.isArchived ||
      current.exchange.isDrawn
    )
      conflict.open(values(), serverValues(current), lockedFields(current))
    form.clear()
  } catch (cause) {
    if (signal.aborted || token !== route.params.token || isRequestAborted(cause)) return
    if (cause instanceof HttpError && cause.status === 404) {
      view.value = null
      setValues({})
      conflict.baseline.value = {}
      remote.value = null
    }
    form.capture(cause)
    throw cause
  } finally {
    if (token === route.params.token) isLoading.value = false
  }
}
const refreshState = useRefresh(load, enabled)
const { busy: isRefreshing, paused } = refreshState
async function refresh() {
  try {
    await refreshState.refresh()
  } catch {
    /* Inline error keeps the draft visible. */
  }
}
function applyConflict() {
  const result = conflict.apply()
  if (!result || !view.value) return
  setValues(result)
  baselineVersion.value = view.value.participant.updatedAt
  form.clear()
}
async function saveSelf() {
  if (isSaving.value || isRefreshing.value || !canEdit.value || !valid.value || remote.value) return
  isSaving.value = true
  form.clear()
  refreshState.cancel()
  const token = String(route.params.token)
  try {
    const current = await api.put<ParticipantSelfViewDto>(
      `/api/p/${encodeURIComponent(token)}`,
      payload(),
    )
    if (token !== route.params.token) return
    view.value = current
    initialize(current)
    toasts.success(t('participant.saveSuccess'))
  } catch (cause) {
    form.capture(cause)
    if (
      cause instanceof HttpError &&
      (cause.status === 409 ||
        [
          'PARTICIPANT_IDENTITY_LOCKED',
          'PARTICIPANT_SUGGESTIONS_LOCKED',
          'EXCHANGE_ARCHIVED_CANNOT_MODIFY',
        ].includes(cause.code ?? ''))
    ) {
      const controller = new AbortController()
      try {
        await load(controller.signal)
      } catch {
        /* Keep the first error and draft. */
      }
    } else if (cause instanceof HttpError && cause.status === 404) {
      view.value = null
      setValues({})
      remote.value = null
    }
  } finally {
    isSaving.value = false
  }
}
onMounted(refresh)
watch(
  () => route.params.token,
  () => {
    refreshState.cancel(true)
    view.value = null
    conflict.baseline.value = {}
    remote.value = null
    setValues({})
    isLoading.value = true
    form.clear()
    void refresh()
  },
)
</script>

<template>
  <section id="participant-self-view" :aria-busy="isLoading || isSaving || isRefreshing">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h1 class="h3">{{ view?.exchange.name || t('participant.profileSectionTitle') }}</h1>
      <button
        class="btn btn-outline-secondary"
        type="button"
        :disabled="isSaving || isRefreshing"
        @click="refresh"
      >
        {{ t('p2.refresh') }}
      </button>
    </div>
    <p v-if="isLoading" role="status">{{ t('participant.loading') }}</p>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <p v-if="paused && view" class="text-body-secondary" role="status">
      {{ t('p2.refreshPaused') }}
    </p>
    <router-link v-if="!view && !isLoading" to="/" class="btn btn-outline-primary">{{
      t('p2.home')
    }}</router-link>
    <div v-if="view">
      <p v-if="view.exchange.description" class="text-muted">{{ view.exchange.description }}</p>
      <p class="alert" :class="canEdit ? 'alert-info' : 'alert-secondary'">
        {{ canEdit ? t('participant.editingOpen') : t('participant.editingClosed') }}
      </p>
      <p v-if="dirty" class="small text-body-secondary">{{ t('p2.unsaved') }}</p>
      <ConflictReview
        v-if="remote"
        :fields="fields"
        :choices="choices"
        :ready="ready"
        :current="remote"
        @choice="(key, choice) => (choices[key] = choice)"
        @apply="applyConflict"
      />
      <form class="participant-self-form" @submit.prevent="saveSelf">
        <div class="row g-3 align-items-start">
          <section class="card mb-3 col-12 col-lg-4 participant-profile-card">
            <div class="card-body">
              <h2 class="h5">{{ t('participant.profileSectionTitle') }}</h2>
              <div class="mb-3">
                <label for="participant-name" class="form-label">{{ t('participant.name') }}</label
                ><input
                  id="participant-name"
                  v-model="name"
                  class="form-control"
                  maxlength="150"
                  :readonly="identityLocked"
                  :disabled="isSaving || !!remote"
                  :aria-invalid="!!fieldErrors.name || undefined"
                  :aria-describedby="fieldErrors.name ? 'participant-name-error' : undefined"
                  required
                />
                <p v-if="fieldErrors.name" id="participant-name-error" class="text-danger">
                  {{ t('p2.invalidField') }}
                </p>
              </div>
              <label for="participant-note" class="form-label">{{ t('participant.note') }}</label
              ><textarea
                id="participant-note"
                v-model="note"
                class="form-control"
                rows="3"
                maxlength="2000"
                :readonly="suggestionsLocked"
                :disabled="isSaving || !!remote"
                :aria-invalid="!!fieldErrors.note || undefined"
                :aria-describedby="fieldErrors.note ? 'participant-note-error' : undefined"
              ></textarea>
              <p v-if="fieldErrors.note" id="participant-note-error" class="text-danger">
                {{ t('p2.invalidField') }}
              </p>
            </div>
          </section>
          <section class="card mb-3 col-12 col-lg-8 participant-suggestions-card">
            <div class="card-body">
              <h2 class="h5">{{ t('participant.suggestionsSectionTitle') }}</h2>
              <p v-if="requiredMinSuggestions > 0" class="small">
                {{ t('participant.minWishlistSuggestionsHint', { count: requiredMinSuggestions }) }}
              </p>
              <WishlistEditor v-model="wishlist" :locked="suggestionsLocked" :busy="isSaving || !!remote" />
              <p v-if="fieldErrors.wishlist" class="text-danger">{{ t('p2.invalidField') }}</p>
              <p v-if="wishlist.length < requiredMinSuggestions" class="text-danger small">
                {{
                  t('participant.minWishlistSuggestionsError', { count: requiredMinSuggestions })
                }}
              </p>
              <button
                v-if="canEdit"
                type="submit"
                class="btn btn-primary mt-3"
                :disabled="!valid || isSaving || isRefreshing || !!remote"
              >
                {{ isSaving ? t('participant.saving') : t('participant.save') }}
              </button>
            </div>
          </section>
        </div>
        <section
          v-if="view.assignment && (view.exchange.isDrawn || view.exchange.isArchived)"
          class="card mb-3"
        >
          <div class="card-body">
            <h2 class="h5">{{ t('participant.recipientSectionTitle') }}</h2>
            <p>
              <strong>{{ t('participant.recipientName') }}:</strong>
              {{ view.assignment.receiverName }}
            </p>
            <ol
              v-if="view.assignment.receiverWishlist?.length"
              class="list-group list-group-numbered"
            >
              <li
                v-for="(suggestion, index) in view.assignment.receiverWishlist"
                :key="index"
                class="list-group-item"
              >
                <WishlistSuggestionItem :model-value="suggestion" mode="detail" />
              </li>
            </ol>
            <p v-if="view.assignment.receiverNote">
              <strong>{{ t('participant.recipientNote') }}:</strong>
              {{ view.assignment.receiverNote }}
            </p>
          </div>
        </section>
      </form>
    </div>
  </section>
</template>
