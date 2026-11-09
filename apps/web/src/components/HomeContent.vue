<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import celebrateGift from '@/assets/illustrations/kado-celebrate.webp'

defineEmits<{ create: [] }>()
const { t } = useI18n()
const sections: {
  title: string
  cards: [string, string][]
  numbered?: boolean
  paper?: string[]
  emblem?: 'private'
  intro?: string
}[] = [
    {
      title: 'home.steps.title',
      cards: [
        ['home.steps.prepare.title', 'home.steps.prepare.body'],
        ['home.steps.invite.title', 'home.steps.invite.body'],
        ['home.steps.surprise.title', 'home.steps.surprise.body'],
      ],
      numbered: true,
    },
    {
      title: 'home.privacy.title',
      cards: [
        ['home.privacy.share.title', 'home.privacy.share.body'],
        ['home.privacy.tracking.title', 'home.privacy.tracking.body'],
        ['home.privacy.manage.title', 'home.privacy.manage.body'],
      ],
      paper: ['invite', 'shield', 'keys'],
      emblem: 'private' as const,
      intro: 'home.privacy.intro',
    },
  ]
</script>
<template>
  <section v-for="section in sections" :key="section.title">

    <div :class="section.emblem ? 'feature-row' : 'gap-3'">
      <div class="text-center">
        <h2 class="h4 mb-3">{{ t(section.title) }}</h2>
        <p v-if="section.intro" class="text-body-secondary">{{ t(section.intro) }}</p>
      </div>
    </div>

    <div class="d-flex flex-column flex-md-row gap-3">
      <div v-for="([title, body], i) in section.cards" :key="title" class="home-trust-slot">

        <article class="home-trust-card card h-100 border-0">
          <div class="card-body p-4">
            <div class="d-flex align-items-start gap-3" :class="{ 'flex-wrap': section.paper }">
              <span
                v-if="section.paper"
                aria-hidden="true"
                :class="['paper', 'paper--' + section.paper[i]]"
              />
              <span v-if="section.numbered" class="step-number" aria-hidden="true">{{
                i + 1
                }}</span>
              <div :class="section.paper ? 'home-card-copy' : 'flex-grow-1'">
                <h3 class="h5">
                  <span v-if="section.numbered" class="visually-hidden">{{ t('home.stepLabel', { number: i + 1 }) }}
                  </span>{{ t(title) }}
                </h3>
                <p class="text-body-secondary mb-0">{{ t(body) }}</p>
              </div>
            </div>
          </div>
        </article>

      </div>
    </div>
  </section>

  <section class="feature-row d-flex align-items-center">
    <div class="text-center">
      <h2 class="h4">{{ t('home.open.title') }}</h2>
      <p class="text-body-secondary">
        {{ t('home.open.body') }}
      </p>
    </div>
  </section>

  <section class="closing d-flex flex-column align-items-center gap-3 py-4 text-center">
    <img :src="celebrateGift" alt="" aria-hidden="true" width="112" height="112" />
    <h2 class="h4 mb-0 mx-auto">{{ t('home.closing.title') }}</h2>
    <p class="mb-0 mx-auto">{{ t('home.closing.body') }}</p>
    <button class="btn btn-primary px-4" type="button" @click="$emit('create')">
      {{ t('actions.createExchange') }}
    </button>
  </section>
</template>

<style scoped>
.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 3rem;
  font-size: 1.5rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--primary);
  color: var(--on-primary, #fff);
  font-weight: 700;
  line-height: 1;
}

@media (min-width: 992px) {
  .feature-row {
    width: 100%;
    max-width: 40rem;
    margin-inline: auto;
    padding: 2rem 1.5rem;
    column-gap: 2rem;
  }

  .feature-row p:last-child {
    margin-bottom: 0;
  }
}

.home-card-copy {
  flex: 1 1 9rem;
  min-width: 0;
}

.paper {
  display: block;
  width: 5rem;
  aspect-ratio: 1;
  background: url('../assets/illustrations/kado-paper.webp') 0 0 / 300% 300% no-repeat;
}

.paper--invite {
  background-position: 0 50%;
}

.paper--shield {
  background-position: 50% 50%;
}

.paper--keys {
  background-position: 100% 50%;
}

.closing h2 {
  font-size: clamp(1.6rem, 3vw, 2.35rem);
}

.closing p {
  font-size: 1.125rem;
}
</style>
