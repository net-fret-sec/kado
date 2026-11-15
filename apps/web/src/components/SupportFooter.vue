<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
const { t } = useI18n()
const donationUrl = import.meta.env.VITE_DONATION_URL?.trim() || ''
const contact = z.email().safeParse(import.meta.env.VITE_CONTACT_EMAIL?.trim())
const contactEmail = contact.success ? contact.data : ''
</script>
<template>
  <footer v-if="donationUrl || contactEmail" class="container-xl py-3 mt-auto">
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
        class="btn btn-sm btn-link align-self-start align-self-lg-center flex-shrink-0"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('home.support.button') }}
      </a>
    </section>
    <p v-if="contactEmail" class="small mb-0" :class="{ 'mt-3': donationUrl }">
      <a :href="`mailto:${contactEmail}`">{{ t('home.contact') }}</a>
    </p>
  </footer>
</template>
