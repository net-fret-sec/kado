<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

defineProps<{ home?: boolean }>()

const { t } = useI18n()
const donationUrl = import.meta.env.VITE_DONATION_URL?.trim() || ''
const contact = z.email().safeParse(import.meta.env.VITE_CONTACT_EMAIL?.trim())
const contactEmail = contact.success ? contact.data : ''
const trustItems = [
  { label: 'home.trust.account', icon: 'bi-person' },
  { label: 'home.trust.tracking', icon: 'bi-eye-slash' },
  { label: 'home.trust.openSource', icon: 'bi-code-slash' },
] as const
</script>
<template>
  <footer v-if="home" class="home-footer container-xl mt-auto pb-4">
    <div class="px-3 px-lg-4">
      <div class="border-top pt-4">
        <ul
          class="home-trust d-flex flex-column flex-sm-row flex-wrap justify-content-lg-center gap-3 gap-lg-5 list-unstyled small text-body-secondary mb-4"
          role="list"
        >
          <li v-for="item in trustItems" :key="item.label" class="d-flex align-items-center gap-2">
            <i :class="['bi', item.icon]" aria-hidden="true" />
            <span>{{ t(item.label) }}</span>
          </li>
        </ul>
        <div
          class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3"
        >
          <div class="home-footer-copy">
            <h2 class="h6 mb-2">{{ t('home.support.title') }}</h2>
            <p class="small text-body-secondary mb-0">{{ t('home.support.contribution') }}</p>
          </div>
          <a
            v-if="donationUrl"
            :href="donationUrl"
            class="btn btn-sm btn-outline-primary align-self-start align-self-md-center flex-shrink-0"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t('home.support.button') }}
          </a>
        </div>
        <p v-if="contactEmail" class="small mt-3 mb-0">
          <a :href="`mailto:${contactEmail}`">{{ t('home.contact') }}</a>
        </p>
      </div>
    </div>
  </footer>
  <footer v-else-if="donationUrl || contactEmail" class="container-xl py-3 mt-auto">
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

<style scoped>
.home-footer {
  overflow-wrap: anywhere;
}

.home-footer-copy {
  max-width: 44rem;
  min-width: 0;
}

.home-trust .bi {
  flex: none;
  color: var(--link, var(--primary));
}
</style>
