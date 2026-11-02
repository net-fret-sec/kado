<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GiftIllustration from './GiftIllustration.vue'

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
    // {
    //   title: 'home.benefits.title',
    //   cards: [
    //     ['home.benefits.draw.title', 'home.benefits.draw.body'],
    //     ['home.benefits.wish.title', 'home.benefits.wish.body'],
    //     ['home.benefits.link.title', 'home.benefits.link.body'],
    //   ],
    //   paper: ['draw', 'wish', 'link'],
    // },
  ]
</script>
<template>
  <section v-for="section in sections" :key="section.title">
    <div class="d-flex align-items-center" :class="section.emblem ? 'feature-row' : 'gap-3'">
      <GiftIllustration v-if="section.emblem" :kind="section.emblem" class="section-emblem flex-shrink-0" />
      <div>
        <h2 class="h4 mb-3">{{ t(section.title) }}</h2>
        <p v-if="section.intro" class="text-body-secondary">{{ t(section.intro) }}</p>
      </div>
    </div>
    <div class="row g-3">
      <div v-for="([title, body], i) in section.cards" :key="title" class="col-md-4">
        <article class="home-trust-card card h-100 border-0">
          <div class="card-body p-4">
            <span v-if="section.paper" aria-hidden="true" :class="['paper', 'paper--' + section.paper[i]]" />
            <div :class="{ 'step-copy': section.numbered }">
              <span v-if="section.numbered" class="step-number" aria-hidden="true">{{
                i + 1
                }}</span>
              <div>
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
    <GiftIllustration kind="open" class="section-emblem flex-shrink-0" />
    <div>
      <h2 class="h4">{{ t('home.open.title') }}</h2>
      <p class="text-body-secondary">
        {{ t('home.open.body') }}
      </p>
      <!-- <a href="https://github.com/net-fret-sec/kado">{{ t('home.open.link') }}</a> -->
    </div>
  </section>
  <section class="closing py-4">
    <span aria-hidden="true" class="paper paper--celebrate" />
    <h2 class="h4">{{ t('home.closing.title') }}</h2>
    <p>{{ t('home.closing.body') }}</p>
    <button class="btn btn-primary px-4" type="button" @click="$emit('create')">
      {{ t('actions.createExchange') }}
    </button>
  </section>
</template>

<style scoped>
.step-copy {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.75rem;
}

.step-number {
  display: grid;
  place-items: center;
  width: 2rem;
  font-size: 1.0625rem;
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
    max-width: 54rem;
    margin-inline: auto;
    padding: 2rem 1.5rem;
    column-gap: 2rem;
  }

  .feature-row p:last-child {
    margin-bottom: 0;
  }
}

.section-emblem {
  width: clamp(4rem, 10vw, 8rem);
}

.paper {
  display: block;
  width: 5rem;
  aspect-ratio: 1;
  background: url('../assets/illustrations/kado-paper.webp') 0 0 / 300% 300% no-repeat;
  margin-bottom: 0.85rem;
}

.paper--wish {
  background-position: 50% 0;
}

.paper--link {
  background-position: 100% 0;
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

.paper--celebrate {
  background-position: 50% 100%;
  width: 7rem;
  margin: 0;
}

.closing {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
}

.closing p,
.closing h2 {
  margin: 0 auto;
}

.closing h2 {
  font-size: clamp(1.6rem, 3vw, 2.35rem);
}

.closing p {
  font-size: 1.125rem;
}
</style>
