<script setup lang="ts">
import { usePageTitle } from '@/composables/usePageTitle'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CreateExchangeModal from '@/components/CreateExchangeModal.vue'
import celebrateGift from '@/assets/illustrations/kado-celebrate.webp'

import HomeContent from '@/components/HomeContent.vue'

const { t } = useI18n()
const isCreateModalOpen = ref(false)
usePageTitle(() => [t('pageTitles.home')])
</script>

<template>
  <section id="home-view" class="d-flex flex-column gap-4">
    <section class="home-hero px-3 px-lg-4 pt-4 pb-2 py-lg-5">
      <div class="d-flex flex-column flex-md-row align-items-center gap-4">
        <div class="home-hero__copy">
          <p class="home-hero__eyebrow kado-ui-label mb-3">{{ t('home.hero.eyebrow') }}</p>
          <h2 class="home-hero__title fw-semibold mb-4">{{ t('home.hero.title') }}</h2>
          <p class="text-body-secondary mb-4">{{ t('home.hero.description') }}</p>
          <button type="button" class="btn btn-primary px-4" @click="isCreateModalOpen = true">
            {{ t('actions.createExchange') }}
          </button>
          <p class="home-hero__micro small mt-3 mb-0">{{ t('home.hero.micro') }}</p>
        </div>
        <div class="home-hero__art">
          <img
            :src="celebrateGift"
            class="home-hero__illustration d-block h-auto mw-100 mx-auto"
            alt=""
            aria-hidden="true"
            width="1254"
            height="1254"
          />
        </div>
      </div>
    </section>

    <HomeContent @create="isCreateModalOpen = true" />

    <CreateExchangeModal v-model="isCreateModalOpen" />
  </section>
</template>

<style scoped>
#home-view {
  overflow-wrap: anywhere;
}
</style>
