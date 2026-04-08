<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CreateExchangeModal from '@/components/CreateExchangeModal.vue'

const { t } = useI18n()
const isCreateModalOpen = ref(false)
const showAdminLink = import.meta.env.DEV
</script>

<template>
  <section id="home-view" class="home-landing">
    <section
      class="home-hero position-relative overflow-hidden rounded-4 px-4 px-lg-5 py-5 py-lg-6"
    >
      <div class="home-hero__glow home-hero__glow--warm"></div>
      <div class="home-hero__glow home-hero__glow--cool"></div>

      <div
        class="position-relative row justify-content-center text-center text-lg-start align-items-center g-4"
      >
        <div class="col-lg-8 col-xl-7">
          <p class="home-eyebrow text-uppercase fw-semibold mb-3">{{ t('home.hero.eyebrow') }}</p>
          <h2 class="display-4 fw-semibold mb-3 text-light">{{ t('home.hero.title') }}</h2>
          <p class="lead text-white-50 mb-4">{{ t('home.hero.description') }}</p>

          <div class="d-grid d-sm-flex justify-content-center justify-content-lg-start gap-3 mb-3">
            <button
              type="button"
              class="btn btn-primary btn-lg px-4"
              @click="isCreateModalOpen = true"
            >
              {{ t('home.hero.primaryAction') }}
            </button>

            <a href="#received-link" class="btn btn-outline-light btn-lg px-4">
              {{ t('home.hero.secondaryAction') }}
            </a>
          </div>

          <p class="small fw-semibold text-white mb-2">{{ t('home.hero.micro') }}</p>
          <p class="small text-white-50 mb-0">{{ t('home.hero.audience') }}</p>
        </div>
      </div>
    </section>

    <section class="home-trust-strip">
      <div class="row g-4 text-center text-md-start">
        <div class="col-md-4">
          <div class="card h-100 shadow-sm border-0">
            <div class="card-body p-4">
              <div class="home-icon-badge mb-3">
                <i class="bi bi-code-slash" aria-hidden="true"></i>
              </div>
              <h3 class="h5">{{ t('home.trustStrip.openSource.title') }}</h3>
              <p class="text-body-secondary mb-0">
                {{ t('home.trustStrip.openSource.description') }}
              </p>
            </div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card h-100 shadow-sm border-0">
            <div class="card-body p-4">
              <div class="home-icon-badge mb-3">
                <i class="bi bi-shield-lock" aria-hidden="true"></i>
              </div>
              <h3 class="h5">{{ t('home.trustStrip.privacy.title') }}</h3>
              <p class="text-body-secondary mb-0">{{ t('home.trustStrip.privacy.description') }}</p>
            </div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card h-100 shadow-sm border-0">
            <div class="card-body p-4">
              <div class="home-icon-badge mb-3">
                <i class="bi bi-badge-ad" aria-hidden="true"></i>
              </div>
              <h3 class="h5">{{ t('home.trustStrip.noMonetization.title') }}</h3>
              <p class="text-body-secondary mb-0">
                {{ t('home.trustStrip.noMonetization.description') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="row g-4 home-actions align-items-stretch">
      <div class="col-lg-7">
        <div
          class="card h-100 border border-primary-subtle home-action-card home-action-card--primary"
        >
          <div class="card-body p-4 p-lg-5 d-flex flex-column">
            <p class="text-uppercase small fw-semibold text-primary mb-2">
              {{ t('home.cta.primaryLabel') }}
            </p>
            <h2 class="card-title h2">{{ t('home.cta.organizerTitle') }}</h2>
            <p class="card-text text-body-secondary flex-grow-1 mb-4">
              {{ t('home.cta.organizerDesc') }}
            </p>
            <button
              type="button"
              class="btn btn-primary btn-lg align-self-start"
              @click="isCreateModalOpen = true"
            >
              {{ t('home.cta.organizerAction') }}
            </button>
          </div>
        </div>
      </div>

      <div class="col-lg-5" id="received-link">
        <div class="card h-100 border home-action-card home-action-card--secondary">
          <div class="card-body p-4 p-lg-5 d-flex flex-column">
            <p class="text-uppercase small fw-semibold text-body-secondary mb-2">
              {{ t('home.cta.secondaryLabel') }}
            </p>
            <h2 class="card-title h3">{{ t('home.cta.participantTitle') }}</h2>
            <p class="card-text text-body-secondary flex-grow-1 mb-4">
              {{ t('home.cta.participantDesc') }}
            </p>
            <p class="small text-body-secondary fst-italic mt-auto mb-0">
              {{ t('home.cta.participantHint') }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="home-why bg-body-tertiary rounded-4 px-4 px-lg-5 py-5">
      <div class="row justify-content-center text-center mb-4">
        <div class="col-lg-8">
          <h2 class="mb-3">{{ t('home.why.title') }}</h2>
          <p class="text-body-secondary mb-0 mx-auto">{{ t('home.why.description') }}</p>
        </div>
      </div>

      <div class="row g-4 text-center text-md-start">
        <div class="col-md-4">
          <div class="home-why__item h-100">
            <h3 class="h5">{{ t('home.why.simple.title') }}</h3>
            <p class="text-body-secondary mb-0">{{ t('home.why.simple.description') }}</p>
          </div>
        </div>

        <div class="col-md-4">
          <div class="home-why__item h-100">
            <h3 class="h5">{{ t('home.why.transparent.title') }}</h3>
            <p class="text-body-secondary mb-0">{{ t('home.why.transparent.description') }}</p>
          </div>
        </div>

        <div class="col-md-4">
          <div class="home-why__item h-100">
            <h3 class="h5">{{ t('home.why.independent.title') }}</h3>
            <p class="text-body-secondary mb-0">{{ t('home.why.independent.description') }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="home-support text-center px-3 py-4">
      <h2 class="h3 mb-3">{{ t('home.support.title') }}</h2>
      <p class="text-body-secondary mx-auto mb-4 home-support__copy">
        {{ t('home.support.subtext') }}
      </p>
      <a href="#" class="btn btn-outline-primary" target="_blank" rel="noopener noreferrer">
        {{ t('home.support.button') }}
      </a>
    </section>

    <footer class="home-footer text-center text-body-secondary small">
      <p class="mb-2">{{ t('home.footer.tagline') }}</p>

      <router-link
        v-if="showAdminLink"
        to="/exchanges"
        class="text-body-secondary home-footer__admin-link"
      >
        {{ t('home.adminLink') }}
      </router-link>
    </footer>

    <CreateExchangeModal v-model="isCreateModalOpen" />
  </section>
</template>

<style scoped>
.home-landing {
  display: grid;
  gap: clamp(2rem, 4vw, 4rem);
}

.py-lg-6 {
  padding-top: 5rem;
  padding-bottom: 5rem;
}

.home-hero {
  background:
    radial-gradient(circle at top right, rgba(251, 191, 36, 0.18), transparent 24rem),
    radial-gradient(circle at left center, rgba(34, 197, 94, 0.12), transparent 22rem),
    linear-gradient(135deg, #102033 0%, #17314a 52%, #0f1c2c 100%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
}

.home-hero__glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(12px);
  opacity: 0.8;
}

.home-hero__glow--warm {
  inset: auto 8% 10% auto;
  width: 9rem;
  height: 9rem;
  background: rgba(245, 158, 11, 0.18);
}

.home-hero__glow--cool {
  inset: 12% auto auto 6%;
  width: 7rem;
  height: 7rem;
  background: rgba(45, 212, 191, 0.12);
}

.home-eyebrow {
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.72);
}

.home-icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 0.9rem;
  background: linear-gradient(135deg, rgba(79, 70, 229, 0.14), rgba(6, 182, 212, 0.18));
  color: #1e293b;
  font-size: 1.25rem;
}

.home-action-card {
  overflow: hidden;
}

.home-action-card--primary {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(239, 246, 255, 0.96));
}

.home-action-card--secondary {
  background: rgba(255, 255, 255, 0.94);
}

.home-why {
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.home-why__item {
  padding: 0.5rem 0.25rem;
}

.home-support__copy {
  max-width: 42rem;
}

.home-footer {
  padding-bottom: 1rem;
}

.home-footer__admin-link {
  opacity: 0.7;
}

.home-footer__admin-link:hover,
.home-footer__admin-link:focus-visible {
  opacity: 1;
}

@media (max-width: 991.98px) {
  .home-hero {
    text-align: center;
  }
}
</style>
