<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useExchangesStore } from '@/stores/exchanges'
import type { ExchangeDto } from '@kado/shared'
import type { ParticipantDto, GiftSuggestionDto } from '@kado/shared'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import WishlistSuggestionItem from '@/components/WishlistSuggestionItem.vue'
import Draggable from 'vuedraggable'
import { useToastsStore } from '@/stores/toasts'

const api = useApi()
const toasts = useToastsStore()

const { t } = useI18n()
const route = useRoute()
const exchangesStore = useExchangesStore()
const exchange = ref<ExchangeDto | null>(null)
const participants = ref<ParticipantDto[]>([])
const isLoading = ref(true)
const error = ref<string | null>(null)
const editName = ref('')
const editDescription = ref('')
const editStatus = ref('active')
const showEditExchangeModal = ref(false)

// Pour les participants
const showAddParticipantModal = ref(false)
const showEditParticipantModal = ref(false)
const editingParticipant = ref<ParticipantDto | null>(null)
const newParticipantName = ref('')
const newParticipantEmail = ref('')
const newParticipantWishlist = ref('')
const newParticipantNote = ref('')
const wishlistMode = ref<'text' | 'list'>('text')
const newParticipantWishlistList = ref<GiftSuggestionDto[]>([])

function isSuggestionList(val: unknown): val is GiftSuggestionDto[] {
  return Array.isArray(val) && val.every((v) => v && typeof v === 'object' && 'title' in v)
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toasts.success(t('exchangeDetail.linkCopied'))
  } catch {
    toasts.error(t('exchangeDetail.copyFailed'))
  }
}

async function fetchExchange() {
  isLoading.value = true
  error.value = null
  try {
    const id = route.params.id as string
    exchange.value = await api.get<ExchangeDto>(`/api/exchanges/${id}`)
    participants.value = await api.get<ParticipantDto[]>(`/api/exchanges/${id}/participants`)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Erreur inconnue'
    toasts.error(error.value || 'Erreur inconnue')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  // S'assurer que les modales ne sont jamais ouvertes au chargement
  showAddParticipantModal.value = false;
  showEditParticipantModal.value = false;
  editingParticipant.value = null;
  fetchExchange();
})

function startEdit() {
  if (!exchange.value) return
  editName.value = exchange.value.name
  editDescription.value = exchange.value.description || ''
  editStatus.value = exchange.value.status || 'active'
  showEditExchangeModal.value = true
}

async function saveEdit() {
  if (!exchange.value) return
  try {
    await exchangesStore.updateExchange(exchange.value.id, {
      name: editName.value,
      description: editDescription.value
    })
    showEditExchangeModal.value = false
    await fetchExchange()
  } catch (err) {
    console.error(err)
    toasts.error(err instanceof Error ? err.message : 'Erreur lors de l\'ajout')
  }
}

async function handleDelete() {
  if (!exchange.value) return
  if (!confirm(t('exchangeDetail.confirmDeleteExchange'))) return
  try {
    await exchangesStore.deleteExchange(exchange.value.id)
    window.location.href = '/exchanges'
  } catch (err) {
    console.error(err)
    toasts.error(err instanceof Error ? err.message : 'Erreur lors de la modification')
  }
}

// Fonctions pour les participants
function openAddParticipantModal() {
  newParticipantName.value = ''
  newParticipantEmail.value = ''
  newParticipantWishlist.value = ''
  newParticipantWishlistList.value = []
  wishlistMode.value = 'text'
  newParticipantNote.value = ''
  showAddParticipantModal.value = true
}

function openEditParticipantModal(participant: ParticipantDto) {
  editingParticipant.value = participant
  newParticipantName.value = participant.name
  newParticipantEmail.value = participant.email || ''
  if (isSuggestionList(participant.wishlist)) {
    wishlistMode.value = 'list'
    newParticipantWishlistList.value = [...participant.wishlist]
    newParticipantWishlist.value = ''
  } else {
    wishlistMode.value = 'text'
    newParticipantWishlist.value = participant.wishlist || ''
    newParticipantWishlistList.value = []
  }
  newParticipantNote.value = participant.note || ''
  showEditParticipantModal.value = true
}

async function addParticipant() {
  if (!exchange.value) return
  try {
    const wishlistPayload = wishlistMode.value === 'list' ? newParticipantWishlistList.value : newParticipantWishlist.value
    const result = await api.post<{ participant: ParticipantDto; accessLink: string }>(`/api/exchanges/${exchange.value.id}/participants`, {
      name: newParticipantName.value,
      email: newParticipantEmail.value,
      wishlist: wishlistPayload,
      note: newParticipantNote.value,
    })
    showAddParticipantModal.value = false
    if (result?.accessLink) {
      await copyToClipboard(result.accessLink)
    }
    await fetchExchange()
  } catch (err) {
    console.error(err)
  }
}

async function updateParticipant() {
  if (!editingParticipant.value || !exchange.value) return
  try {
    const wishlistPayload = wishlistMode.value === 'list' ? newParticipantWishlistList.value : newParticipantWishlist.value
    await api.put(`/api/exchanges/${exchange.value.id}/participants/${editingParticipant.value.id}`, {
      name: newParticipantName.value,
      email: newParticipantEmail.value,
      wishlist: wishlistPayload,
      note: newParticipantNote.value,
    })
    showEditParticipantModal.value = false
    editingParticipant.value = null
    await fetchExchange()
  } catch (err) {
    console.error(err)
  }
}

async function deleteParticipant(participantId: string) {
  if (!exchange.value) return
  if (!confirm(t('exchangeDetail.confirmDeleteParticipant'))) return
  try {
    await api.delete(`/api/exchanges/${exchange.value.id}/participants/${participantId}`)
    await fetchExchange()
  } catch (err) {
    console.error(err)
    toasts.error(err instanceof Error ? err.message : 'Erreur lors de la suppression')
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function moveSuggestionUp(idx: number) {
  const arr = newParticipantWishlistList.value
  if (idx <= 0 || idx >= arr.length) return
  const prev = arr[idx - 1]
  const curr = arr[idx]
  if (!prev || !curr) return
  arr[idx - 1] = curr
  arr[idx] = prev
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function moveSuggestionDown(idx: number) {
  const arr = newParticipantWishlistList.value
  if (idx < 0 || idx >= arr.length - 1) return
  const next = arr[idx + 1]
  const curr = arr[idx]
  if (!next || !curr) return
  arr[idx + 1] = curr
  arr[idx] = next
}

async function regenerateParticipantLink(participantId: string) {
  if (!exchange.value) return
  try {
    const payload = { revokeExisting: true }
    const result = await api.post<{ participantId: string; accessLink: string }, typeof payload>(
      `/api/exchanges/${exchange.value.id}/participants/${participantId}/access/regenerate`,
      payload,
    )
    if (result?.accessLink) {
      await copyToClipboard(result.accessLink)
    }
  } catch (err) {
    console.error(err)
    toasts.error(err instanceof Error ? err.message : t('exchangeDetail.generateFailed'))
  }
}
</script>

<template>
  <main class="container py-4">
    <div v-if="isLoading">{{ t('exchangeDetail.loading') }}</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="exchange">
      <div>
        <h2>{{ exchange.name }}</h2>
        <p>{{ exchange.description }}</p>
        <ul>
          <li><b>{{ t('exchangeDetail.organizer') }} :</b> {{ exchange.organizerName }}</li>
          <li><b>{{ t('exchangeDetail.status') }} :</b> {{ exchange.status }}</li>
          <li v-if="exchange.eventDate"><b>{{ t('exchangeDetail.eventDate') }} :</b> {{ exchange.eventDate }}</li>
          <li v-if="exchange.budget"><b>{{ t('exchangeDetail.budget') }} :</b> {{ exchange.budget }} {{ exchange.budgetCurrency }}</li>
          <li><b>{{ t('exchangeDetail.createdAt') }} :</b> {{ new Date(exchange.createdAt).toLocaleString() }}</li>
        </ul>
        <button class="btn btn-warning me-2" @click="startEdit">{{ t('exchangeDetail.edit') }}</button>
        <button class="btn btn-danger" @click="handleDelete">{{ t('exchangeDetail.delete') }}</button>
      </div>
      <div v-if="exchange.participants && exchange.participants.length">
        <h3>{{ t('exchangeDetail.participants') }}</h3>
        <button class="btn btn-primary mb-3" @click="openAddParticipantModal">{{ t('exchangeDetail.addParticipant') }}</button>
        <ul class="list-group">
          <li v-for="participant in participants" :key="participant.id" class="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <strong>{{ participant.name }}</strong>
              <span v-if="participant.email" class="text-muted"> ({{ participant.email }})</span>
              <div v-if="participant.wishlist" class="small">
                <span class="me-1">{{ t('exchangeDetail.wishlist') }}:</span>
                <template v-if="isSuggestionList(participant.wishlist)">
                  <span class="badge text-bg-light">{{ participant.wishlist.length }} suggestions</span>
                </template>
                <template v-else>
                  <span>{{ participant.wishlist }}</span>
                </template>
              </div>
              <div v-if="participant.note" class="small">{{ t('exchangeDetail.note') }}: {{ participant.note }}</div>
            </div>
            <div>
              <button class="btn btn-sm btn-outline-primary me-2" @click="openEditParticipantModal(participant)">{{ t('exchangeDetail.edit') }}</button>
              <button class="btn btn-sm btn-outline-secondary me-2" @click="regenerateParticipantLink(participant.id)">{{ t('exchangeDetail.generateLink') }}</button>
              <button class="btn btn-sm btn-outline-danger" @click="deleteParticipant(participant.id)">{{ t('exchangeDetail.delete') }}</button>
            </div>
          </li>
        </ul>
      </div>
      <div v-else>
        <h3>{{ t('exchangeDetail.participants') }}</h3>
        <p><em>{{ t('exchangeDetail.noParticipants') }}</em></p>
        <button class="btn btn-primary" @click="openAddParticipantModal">{{ t('exchangeDetail.addParticipant') }}</button>
      </div>

      <!-- Modale pour modifier l'échange -->
      <dialog v-if="showEditExchangeModal" open class="modal" @close="showEditExchangeModal = false">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">{{ t('exchangeDetail.editExchangeModal.title') }}</h5>
              <button type="button" class="btn-close" @click="showEditExchangeModal = false"></button>
            </div>
            <div class="modal-body">
              <form @submit.prevent="saveEdit">
                <div class="mb-3">
                  <label for="editExchangeName" class="form-label">{{ t('exchangeDetail.name') }}</label>
                  <input v-model="editName" type="text" class="form-control" id="editExchangeName" required />
                </div>
                <div class="mb-3">
                  <label for="editExchangeDescription" class="form-label">{{ t('exchangeDetail.description') }}</label>
                  <input v-model="editDescription" type="text" class="form-control" id="editExchangeDescription" />
                </div>
                <div class="mb-3">
                  <label for="editExchangeStatus" class="form-label">{{ t('exchangeDetail.status') }}</label>
                  <select v-model="editStatus" class="form-select" id="editExchangeStatus">
                    <option value="active">{{ t('exchangeDetail.active') }}</option>
                    <option value="inactive">{{ t('exchangeDetail.inactive') }}</option>
                  </select>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" @click="showEditExchangeModal = false">{{ t('actions.cancel') }}</button>
              <button type="submit" class="btn btn-primary" @click="saveEdit">{{ t('exchangeDetail.editExchangeModal.submit') }}</button>
            </div>
          </div>
        </div>
      </dialog>

      <!-- Modale pour ajouter un participant -->
      <dialog v-if="showAddParticipantModal" open class="modal" @close="showAddParticipantModal = false">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">{{ t('exchangeDetail.addModal.title') }}</h5>
              <button type="button" class="btn-close" @click="showAddParticipantModal = false"></button>
            </div>
            <div class="modal-body">
              <form @submit.prevent="addParticipant">
                <div class="mb-3">
                  <label for="participantName" class="form-label">{{ t('exchangeDetail.addModal.name') }}</label>
                  <input v-model="newParticipantName" type="text" class="form-control" id="participantName" required />
                </div>
                <div class="mb-3">
                  <label for="participantEmail" class="form-label">{{ t('exchangeDetail.addModal.email') }}</label>
                  <input v-model="newParticipantEmail" type="email" class="form-control" id="participantEmail" />
                </div>
                <div class="mb-3">
                  <div class="d-flex justify-content-between align-items-center">
                    <label class="form-label mb-0">{{ t('exchangeDetail.addModal.wishlist') }}</label>
                    <div class="btn-group btn-group-sm" role="group" aria-label="wishlist mode">
                      <button type="button" class="btn" :class="wishlistMode === 'text' ? 'btn-primary' : 'btn-outline-primary'" @click="wishlistMode = 'text'">Texte</button>
                      <button type="button" class="btn" :class="wishlistMode === 'list' ? 'btn-primary' : 'btn-outline-primary'" @click="wishlistMode = 'list'">Liste</button>
                    </div>
                  </div>
                  <div v-if="wishlistMode === 'text'" class="mt-2">
                    <textarea v-model="newParticipantWishlist" class="form-control" id="participantWishlist"></textarea>
                  </div>
                  <div v-else class="mt-2">
                    <Draggable v-model="newParticipantWishlistList" handle=".drag-handle" :animation="200" ghost-class="drag-ghost">
                      <template #item="{ element: s, index: idx }">
                        <WishlistSuggestionItem
                          :modelValue="s"
                          @update:modelValue="v => newParticipantWishlistList.splice(idx, 1, v)"
                          mode="edit"
                          :removable="true"
                          :showHandle="true"
                          :asListItem="true"
                          @remove="newParticipantWishlistList.splice(idx, 1)"
                        />
                      </template>
                    </Draggable>
                    <button type="button" class="btn btn-sm btn-outline-primary" @click="newParticipantWishlistList.push({ title: '' })"><i class="bi bi-plus-lg"></i> Ajouter une suggestion</button>
                  </div>
                </div>
                <div class="mb-3">
                  <label for="participantNote" class="form-label">{{ t('exchangeDetail.addModal.note') }}</label>
                  <textarea v-model="newParticipantNote" class="form-control" id="participantNote"></textarea>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" @click="showAddParticipantModal = false">{{ t('actions.cancel') }}</button>
              <button type="submit" class="btn btn-primary" @click="addParticipant">{{ t('exchangeDetail.addModal.submit') }}</button>
            </div>
          </div>
        </div>
      </dialog>

      <!-- Modale pour modifier un participant -->
      <dialog v-if="showEditParticipantModal" open class="modal" @close="showEditParticipantModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ t('exchangeDetail.editModal.title') }}</h5>
            <button type="button" class="btn-close" @click="showEditParticipantModal = false"></button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="updateParticipant">
              <div class="mb-3">
                <label for="editParticipantName" class="form-label">{{ t('exchangeDetail.addModal.name') }}</label>
                <input v-model="newParticipantName" type="text" class="form-control" id="editParticipantName" required />
              </div>
              <div class="mb-3">
                <label for="editParticipantEmail" class="form-label">{{ t('exchangeDetail.addModal.email') }}</label>
                <input v-model="newParticipantEmail" type="email" class="form-control" id="editParticipantEmail" />
              </div>
              <div class="mb-3">
                <div class="d-flex justify-content-between align-items-center">
                  <label class="form-label mb-0">{{ t('exchangeDetail.addModal.wishlist') }}</label>
                  <div class="btn-group btn-group-sm" role="group" aria-label="wishlist mode">
                    <button type="button" class="btn" :class="wishlistMode === 'text' ? 'btn-primary' : 'btn-outline-primary'" @click="wishlistMode = 'text'">Texte</button>
                    <button type="button" class="btn" :class="wishlistMode === 'list' ? 'btn-primary' : 'btn-outline-primary'" @click="wishlistMode = 'list'">Liste</button>
                  </div>
                </div>
                <div v-if="wishlistMode === 'text'" class="mt-2">
                  <textarea v-model="newParticipantWishlist" class="form-control" id="editParticipantWishlist"></textarea>
                </div>
                <div v-else class="mt-2">
                  <Draggable v-model="newParticipantWishlistList" handle=".drag-handle" :animation="200" ghost-class="drag-ghost">
                    <template #item="{ element: s, index: idx }">
                      <WishlistSuggestionItem
                        :modelValue="s"
                        @update:modelValue="v => newParticipantWishlistList.splice(idx, 1, v)"
                        mode="edit"
                        :removable="true"
                        :showHandle="true"
                        :asListItem="true"
                        @remove="newParticipantWishlistList.splice(idx, 1)"
                      />
                    </template>
                  </Draggable>
                  <button type="button" class="btn btn-sm btn-outline-primary" @click="newParticipantWishlistList.push({ title: '' })"><i class="bi bi-plus-lg"></i> Ajouter une suggestion</button>
                </div>
              </div>
              <div class="mb-3">
                <label for="editParticipantNote" class="form-label">{{ t('exchangeDetail.addModal.note') }}</label>
                <textarea v-model="newParticipantNote" class="form-control" id="editParticipantNote"></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showEditParticipantModal = false">{{ t('actions.cancel') }}</button>
            <button type="submit" class="btn btn-primary" @click="updateParticipant">{{ t('exchangeDetail.editModal.submit') }}</button>
          </div>
        </div>
      </dialog>
    </div>
  </main>
</template>

<style scoped>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}

.modal-dialog {
  max-width: 500px;
  width: 90%;
}

.modal-content {
  background: white;
  border-radius: 0.375rem;
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
}

.modal-body {
  padding: 1rem;
}

.drag-ghost {
  background-color: rgba(0,0,0,0.03);
}
</style>
