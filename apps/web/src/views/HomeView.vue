<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CreateExchangeModal from '@/components/CreateExchangeModal.vue'

const { t } = useI18n()
const isCreateModalOpen = ref(false)
</script>

<template>
  <section class="home-view py-4">

    <!-- Hero -->
    <section class="text-center py-4 mb-4 content-center">
      <p class="lead">{{ t('home.hero.intro') }}</p>
      <p class="text-muted">{{ t('home.hero.principles') }}</p>
    </section>

    <!-- Caractéristiques -->
    <section class="row g-3 mb-5 text-center">
      <div class="col-md-4">
        <div class="card h-100 bg-light border-0">
          <div class="card-body p-3">
          <div class="fs-2 mb-2">🔓</div>
          <strong>{{ t('home.features.openSource') }}</strong>
          <p class="small text-muted mt-1 mb-0">{{ t('home.features.openSourceDesc') }}</p>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100 bg-light border-0">
          <div class="card-body p-3">
          <div class="fs-2 mb-2">🕶️</div>
          <strong>{{ t('home.features.anonymous') }}</strong>
          <p class="small text-muted mt-1 mb-0">{{ t('home.features.anonymousDesc') }}</p>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100 bg-light border-0">
          <div class="card-body p-3">
          <div class="fs-2 mb-2">🚫</div>
          <strong>{{ t('home.features.noAds') }}</strong>
          <p class="small text-muted mt-1 mb-0">{{ t('home.features.noAdsDesc') }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Deux profils -->
    <section class="row g-4 mb-5">
      <div class="col-md-6">
        <div class="card h-100 border border-2 border-primary">
          <div class="card-body d-flex flex-column">
            <h2 class="card-title h4">{{ t('home.cta.organizerTitle') }}</h2>
            <p class="card-text text-muted flex-grow-1">{{ t('home.cta.organizerDesc') }}</p>
            <button type="button" class="btn btn-primary mt-3 align-self-start" @click="isCreateModalOpen = true">
              {{ t('home.cta.organizerAction') }}
            </button>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card h-100 border border-2 border-secondary">
          <div class="card-body d-flex flex-column">
            <h2 class="card-title h4">{{ t('home.cta.participantTitle') }}</h2>
            <p class="card-text text-muted flex-grow-1">{{ t('home.cta.participantDesc') }}</p>
            <p class="small text-muted fst-italic mt-auto pt-3 mb-0">{{ t('home.cta.participantHint') }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Soutien -->
    <section class="row justify-content-center mb-4">
      <div class="col-12 col-md-10 col-lg-7">
        <div class="text-center bg-light rounded-3 py-4 px-3">
          <p class="mb-1">{{ t('home.support.text') }}</p>
          <p class="small text-muted mb-3">{{ t('home.support.subtext') }}</p>
          <a
            href="#"
            class="btn btn-outline-warning btn-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            ☕ {{ t('home.support.button') }}
          </a>
        </div>
      </div>
    </section>

    <!-- Lien admin discret -->
    <div class="text-center mb-5">
      <router-link to="/exchanges" class="text-muted small">
        {{ t('home.adminLink') }}
      </router-link>
    </div>

    <CreateExchangeModal v-model="isCreateModalOpen" />

  </section>
</template>
