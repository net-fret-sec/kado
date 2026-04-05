<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="home-view">

    <!-- Hero -->
    <section class="text-center py-4 mb-4">
      <p class="lead">{{ t('home.hero.intro') }}</p>
      <p class="text-muted">{{ t('home.hero.principles') }}</p>
    </section>

    <!-- Caractéristiques -->
    <section class="row g-3 mb-5 text-center">
      <div class="col-md-4">
        <div class="feature-item p-3">
          <div class="fs-2 mb-2">🔓</div>
          <strong>{{ t('home.features.openSource') }}</strong>
          <p class="small text-muted mt-1 mb-0">{{ t('home.features.openSourceDesc') }}</p>
        </div>
      </div>
      <div class="col-md-4">
        <div class="feature-item p-3">
          <div class="fs-2 mb-2">🕶️</div>
          <strong>{{ t('home.features.anonymous') }}</strong>
          <p class="small text-muted mt-1 mb-0">{{ t('home.features.anonymousDesc') }}</p>
        </div>
      </div>
      <div class="col-md-4">
        <div class="feature-item p-3">
          <div class="fs-2 mb-2">🚫</div>
          <strong>{{ t('home.features.noAds') }}</strong>
          <p class="small text-muted mt-1 mb-0">{{ t('home.features.noAdsDesc') }}</p>
        </div>
      </div>
    </section>

    <!-- Deux profils -->
    <section class="row g-4 mb-5">
      <div class="col-md-6">
        <div class="card h-100 cta-card cta-organizer">
          <div class="card-body d-flex flex-column">
            <h2 class="card-title h4">{{ t('home.cta.organizerTitle') }}</h2>
            <p class="card-text text-muted flex-grow-1">{{ t('home.cta.organizerDesc') }}</p>
            <router-link to="/exchanges" class="btn btn-primary mt-3 align-self-start">
              {{ t('home.cta.organizerAction') }}
            </router-link>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card h-100 cta-card cta-participant">
          <div class="card-body d-flex flex-column">
            <h2 class="card-title h4">{{ t('home.cta.participantTitle') }}</h2>
            <p class="card-text text-muted flex-grow-1">{{ t('home.cta.participantDesc') }}</p>
            <p class="small text-muted fst-italic mt-auto pt-3 mb-0">{{ t('home.cta.participantHint') }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Lien admin discret -->
    <div class="text-center mb-5">
      <router-link to="/exchanges" class="text-muted small">
        {{ t('home.adminLink') }}
      </router-link>
    </div>

  </div>
</template>

<style scoped>
.feature-item {
  border-radius: 0.5rem;
  background: var(--bs-light);
}

.cta-card {
  border-width: 2px;
  transition: box-shadow 0.15s;
}

.cta-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.cta-organizer {
  border-color: var(--bs-primary);
}

.cta-participant {
  border-color: var(--bs-secondary);
}
</style>
