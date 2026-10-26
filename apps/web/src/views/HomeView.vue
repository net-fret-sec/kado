<script setup lang="ts">
import { ref } from 'vue'
import { localAdminToolsEnabled } from '@/local-admin-tools'
import { useI18n } from 'vue-i18n'
import CreateExchangeModal from '@/components/CreateExchangeModal.vue'
import GiftIllustration from '@/components/GiftIllustration.vue'

const { t } = useI18n()
const isCreateModalOpen = ref(false)
const showAdminLink = localAdminToolsEnabled
const donationUrl = ((import.meta.env.VITE_DONATION_URL as string | undefined) ?? '').trim()
const commitments = [
  { key: 'privacy', illustration: 'private' },
  { key: 'noMonetization', illustration: 'giving' },
  { key: 'openSource', illustration: 'open' },
] as const
</script>

<template>
  <section id="home-view" class="d-grid gap-4">
    <section class="home-hero px-3 px-lg-4 py-4 py-lg-5">
      <div class="row align-items-center g-4">
        <div class="col-md-7">
          <p class="home-hero__eyebrow kado-ui-label mb-3">{{ t('home.hero.eyebrow') }}</p>
          <h2 class="home-hero__title fw-semibold mb-4">{{ t('home.hero.title') }}</h2>
          <p class="text-body-secondary mb-4">{{ t('home.hero.description') }}</p>
          <button type="button" class="btn btn-primary px-4" @click="isCreateModalOpen = true">
            {{ t('home.hero.primaryAction') }}
          </button>
          <p class="home-hero__micro small mt-3 mb-0">{{ t('home.hero.micro') }}</p>
        </div>
        <div class="col-md-5">
          <GiftIllustration kind="hero" class="home-hero__illustration mx-auto" />
        </div>
      </div>
    </section>

    <section class="row g-3">
      <div v-for="commitment in commitments" :key="commitment.key" class="col-md-4">
        <article class="home-trust-card card h-100 border-0">
          <div class="card-body p-4">
            <GiftIllustration
              :kind="commitment.illustration"
              class="home-trust-card__illustration mx-auto"
            />
            <h3 class="h5">{{ t(`home.trustStrip.${commitment.key}.title`) }}</h3>
            <p class="text-body-secondary mb-0">
              {{ t(`home.trustStrip.${commitment.key}.description`) }}
            </p>
          </div>
        </article>
      </div>
    </section>

    <section
      v-if="donationUrl"
      class="home-support rounded-4 p-4 d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3"
    >
      <div>
        <h2 class="h5 mb-2">{{ t('home.support.title') }}</h2>
        <p class="text-body-secondary small mb-0">{{ t('home.support.subtext') }}</p>
      </div>
      <a
        :href="donationUrl"
        class="btn btn-outline-primary align-self-start align-self-lg-center flex-shrink-0"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('home.support.button') }}
      </a>
    </section>

    <footer v-if="showAdminLink" class="text-center small">
      <router-link to="/exchanges" class="text-body-secondary">
        {{ t('home.adminLink') }}
      </router-link>
    </footer>

    <CreateExchangeModal v-model="isCreateModalOpen" />
  </section>
</template>
