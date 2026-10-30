<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
const donationUrl = import.meta.env.VITE_DONATION_URL?.trim() || ''
</script>
<template>
  <footer v-if="donationUrl" class="container-xl my-4">
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
  </footer>
</template>
