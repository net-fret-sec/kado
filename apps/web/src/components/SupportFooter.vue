<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
const donationUrl = import.meta.env.VITE_DONATION_URL?.trim() || ''
</script>
<template>
  <footer v-if="donationUrl" class="container-xl py-3 mt-auto">
    <section
      v-if="donationUrl"
      class="home-support d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-2"
    >
      <div>
        <h2 class="h6 mb-1">{{ t('home.support.title') }}</h2>
        <p class="text-body-secondary small mb-0">{{ t('home.support.subtext') }}</p>
      </div>
      <a
        :href="donationUrl"
        class="btn btn-sm btn-outline-primary align-self-start align-self-lg-center flex-shrink-0"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('home.support.button') }}
      </a>
    </section>
  </footer>
</template>
