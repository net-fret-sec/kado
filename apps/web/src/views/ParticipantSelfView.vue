<script setup lang="ts">
import ExchangeHeader from '@/components/ExchangeHeader.vue'
import AutosaveStatus from '@/components/AutosaveStatus.vue'
import { useAutosave } from '@/composables/useAutosave'
import AccessReminder from '@/components/AccessReminder.vue'
import ExchangeDetails from '@/components/ExchangeDetails.vue'
import { sortParticipants } from '@/lib/participantOrder'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  updateParticipantInputSchema,
  type ParticipantSelfViewDto,
  type UpdateParticipantInputDto,
} from '@kado/shared'
import { useApi, HttpError, isRequestAborted } from '@/composables/useApi'
import { useWishlist, serializeWishlist, draftWishlist } from '@/composables/useWishlist'
import { clone, equal, useConflict, type FormValues } from '@/composables/useConflict'
import { useDraftGuard } from '@/composables/useDraftGuard'
import { useRefresh } from '@/composables/useRefresh'
import { useFormErrors } from '@/composables/useFormErrors'
import WishlistEditor from '@/components/WishlistEditor.vue'
import { provideImageAccess } from '@/composables/useImageAccess'
import WishlistSuggestionItem from '@/components/WishlistSuggestionItem.vue'
import ConflictReview from '@/components/ConflictReview.vue'

const { t, locale } = useI18n()
const route = useRoute()
const api = useApi()
const view = ref<ParticipantSelfViewDto | null>(null)
const sortedParticipants = computed(() =>
  sortParticipants(view.value?.participants ?? [], locale.value),
)
const name = ref(''),
  email = ref(''),
  note = ref('')
const { wishlist, hydrate, acknowledge, uploadImages, cancelUploads } = useWishlist()
const imageValidating = ref(false)
provideImageAccess(() =>
  view.value
    ? {
        base: `/api/p/${encodeURIComponent(String(route.params.token))}`,
        scope: String(route.params.token),
        onError: (cause) => {
          if (cause instanceof HttpError && cause.code === 'PARTICIPANT_LINK_INVALID_OR_EXPIRED') {
            view.value = null
            setValues({})
            remote.value = null
            form.capture(cause)
          }
        },
      }
    : null,
)
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
    wishlist: draftWishlist(wishlist.value),
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
function profilePayload(): UpdateParticipantInputDto {
  return { ...(identityLocked.value ? {} : { name: name.value.trim() }), note: note.value.trim() }
}
const profileDirty = computed(
  () =>
    !!view.value &&
    (name.value !== conflict.baseline.value.name || note.value !== conflict.baseline.value.note),
)
const profileValid = computed(
  () =>
    name.value.trim().length > 0 &&
    updateParticipantInputSchema.safeParse(profilePayload()).success,
)
const suggestionsDirty = computed(
  () => !!view.value && !equal(draftWishlist(wishlist.value), conflict.baseline.value.wishlist),
)
const suggestionsValid = computed(
  () =>
    updateParticipantInputSchema.safeParse({ wishlist: serializeWishlist(wishlist.value) }).success,
)
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
const { busy: isRefreshing, paused, connectionLost } = refreshState
const autosave = useAutosave({
  dirty: suggestionsDirty,
  valid: suggestionsValid,
  active: canEdit,
  blocked: computed(
    () => imageValidating.value || isSaving.value || isRefreshing.value || !!remote.value,
  ),
  save: () => saveSelf('suggestions'),
})
const { status: autosaveStatus } = autosave
const profileAutosave = useAutosave({
  dirty: profileDirty,
  valid: profileValid,
  active: canEdit,
  blocked: computed(
    () => imageValidating.value || isSaving.value || isRefreshing.value || !!remote.value,
  ),
  save: () => saveSelf('profile'),
})
const { status: profileStatus } = profileAutosave
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
async function saveSelf(scope: 'profile' | 'suggestions'): Promise<boolean> {
  const suggestionsOnly = scope === 'suggestions'
  if (
    imageValidating.value ||
    isSaving.value ||
    isRefreshing.value ||
    !canEdit.value ||
    !(suggestionsOnly ? suggestionsDirty.value : profileDirty.value) ||
    !(suggestionsOnly ? suggestionsValid.value : profileValid.value) ||
    remote.value
  )
    return false
  if (suggestionsOnly) autosave.cancel()
  else profileAutosave.cancel()
  isSaving.value = true
  form.clear()
  refreshState.cancel()
  const token = String(route.params.token)
  try {
    if (suggestionsOnly) await uploadImages(`/api/p/${encodeURIComponent(token)}`)
    if (token !== route.params.token) return false
    const current = await api.put<ParticipantSelfViewDto>(
      `/api/p/${encodeURIComponent(token)}`,
      suggestionsOnly
        ? { wishlist: serializeWishlist(wishlist.value), expectedUpdatedAt: baselineVersion.value }
        : { ...profilePayload(), expectedUpdatedAt: baselineVersion.value },
    )
    if (token !== route.params.token) return false
    view.value = current
    if (suggestionsOnly) {
      acknowledge(current.participant.wishlist ?? [])
      conflict.baseline.value.wishlist = clone(current.participant.wishlist ?? [])
      baselineVersion.value = current.participant.updatedAt
    } else {
      name.value = current.participant.name
      note.value = current.participant.note ?? ''
      conflict.baseline.value.name = name.value
      conflict.baseline.value.note = note.value
      baselineVersion.value = current.participant.updatedAt
    }
    return true
  } catch (cause) {
    if (token !== route.params.token) return false
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
    return false
  } finally {
    isSaving.value = false
  }
}
onMounted(refresh)
watch(
  () => route.params.token,
  () => {
    autosave.reset()
    profileAutosave.reset()
    refreshState.cancel(true)
    cancelUploads()
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
    <ExchangeHeader
      class="mb-3"
      :title="view?.exchange.name || t('participant.profileSectionTitle')"
      :label="view?.participant.name"
    >
      <template v-if="connectionLost" #actions>
        <button
          class="btn btn-outline-secondary"
          type="button"
          :disabled="isSaving || isRefreshing"
          @click="refresh"
        >
          {{ t('p2.refresh') }}
        </button>
      </template>
      <p v-if="view" class="mb-0">
        {{ canEdit ? t('participant.editingOpen') : t('participant.editingClosed') }}
      </p>
    </ExchangeHeader>
    <p v-if="isLoading" role="status">{{ t('common.loading') }}</p>
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <p v-if="paused && view" class="text-body-secondary" role="status">
      {{ t('p2.refreshPaused') }}
    </p>
    <router-link v-if="!view && !isLoading" to="/" class="btn btn-outline-primary">{{
      t('p2.home')
    }}</router-link>
    <div v-if="view">
      <AccessReminder
        :key="String(route.params.token)"
        :access-id="`${view.exchange.id}:${view.participant.id}:${String(route.params.token).slice(-4)}`"
      />
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
      <div class="participant-self-form">
        <div class="participant-columns">
          <aside class="participant-details-column">
            <ExchangeDetails :exchange="view.exchange" :exclusions="view.exclusions" />
            <section v-if="!view.exchange.isDrawn && view.participants?.length" class="card mt-3">
              <div class="card-body">
                <h2 class="h6">{{ t('review.participantList') }}</h2>
                <ul class="mb-0">
                  <li v-for="person in sortedParticipants" :key="person.id">{{ person.name }}</li>
                </ul>
              </div>
            </section>
          </aside>
          <div class="participant-content-column">
            <section class="card mb-3 participant-profile-card">
              <form class="card-body" novalidate @submit.prevent="profileAutosave.saveNow()">
                <h2 class="h5">{{ t('participant.profileSectionTitle') }}</h2>
                <div class="form-field mb-3">
                  <label for="participant-name" class="form-label">{{ t('fields.name') }}</label
                  ><input
                    id="participant-name"
                    v-model="name"
                    @blur="profileAutosave.request"
                    class="form-control"
                    maxlength="150"
                    :readonly="identityLocked"
                    :disabled="isSaving || !!remote"
                    :aria-invalid="!name.trim() || !!fieldErrors.name || undefined"
                    :aria-describedby="
                      !name.trim() || fieldErrors.name ? 'participant-name-error' : undefined
                    "
                    required
                  />
                  <p
                    v-if="!name.trim() || fieldErrors.name"
                    id="participant-name-error"
                    class="text-danger"
                  >
                    {{ t('p2.invalidField') }}
                  </p>
                </div>
                <div class="form-field">
                  <label for="participant-note" class="form-label">{{
                    t('participant.note')
                  }}</label
                  ><textarea
                    id="participant-note"
                    v-model="note"
                    @blur="profileAutosave.request"
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
                <AutosaveStatus
                  v-if="canEdit"
                  profile
                  :status="profileStatus"
                  :retry-disabled="!profileValid || isSaving || isRefreshing || !!remote"
                  @retry="profileAutosave.saveNow"
                />
              </form>
            </section>
            <section class="card mb-3 participant-suggestions-card">
              <div class="card-body">
                <h2 class="h5">{{ t('participant.suggestionsSectionTitle') }}</h2>
                <p v-if="requiredMinSuggestions > 0" class="small">
                  {{
                    t(
                      'participant.minWishlistSuggestionsHint',
                      { count: requiredMinSuggestions },
                      requiredMinSuggestions,
                    )
                  }}
                </p>
                <WishlistEditor
                  @commit="autosave.request"
                  @validating="imageValidating = $event"
                  v-model="wishlist"
                  :locked="suggestionsLocked"
                  :busy="isSaving || !!remote"
                />
                <AutosaveStatus
                  v-if="canEdit"
                  :status="autosaveStatus"
                  :retry-disabled="!suggestionsValid || isSaving || imageValidating || !!remote"
                  @retry="autosave.request"
                />
                <p v-if="fieldErrors.wishlist" class="text-danger">{{ t('p2.invalidField') }}</p>
                <p
                  v-if="wishlist.length < requiredMinSuggestions"
                  class="text-body-secondary small"
                >
                  {{
                    t(
                      'participant.minWishlistSuggestionsError',
                      { count: requiredMinSuggestions },
                      requiredMinSuggestions,
                    )
                  }}
                </p>
              </div>
            </section>
            <section
              v-if="view.assignment && (view.exchange.isDrawn || view.exchange.isArchived)"
              class="card mb-3"
            >
              <div class="card-body">
                <h2 class="h5">{{ t('participant.recipientSectionTitle') }}</h2>
                <p>
                  <strong>{{ t('fields.name') }}:</strong>
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
                  <strong>{{ t('common.comment') }}:</strong>
                  {{ view.assignment.receiverNote }}
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
