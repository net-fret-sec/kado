<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import GiftIllustration from '@/components/GiftIllustration.vue'

defineEmits<{ create: [] }>()
const { t } = useI18n()
const steps = [
  { title: 'home.steps.prepare.title', body: 'home.steps.prepare.body', art: 'prepare' },
  { title: 'home.steps.invite.title', body: 'home.steps.invite.body', art: 'invite' },
  { title: 'home.steps.surprise.title', body: 'home.steps.surprise.body', art: 'surprise' },
] as const
const faqItems = [
  ['home.faq.try.question', 'home.faq.try.answer'],
  ['home.faq.exclusions.question', 'home.faq.exclusions.answer'],
  ['home.faq.access.question', 'home.faq.access.answer'],
] as const
</script>

<template>
  <section aria-labelledby="home-steps-title" class="home-steps-section px-3 px-lg-4 py-3 py-lg-4">
    <h2 id="home-steps-title" class="h4 mb-4">{{ t('home.steps.title') }}</h2>
    <ol class="home-steps d-grid gap-3 list-unstyled mb-0" role="list">
      <li
        v-for="(step, i) in steps"
        :key="step.title"
        class="home-step d-grid p-3 p-lg-4 rounded-4"
      >
        <span :class="['paper', 'paper--' + step.art]" aria-hidden="true" />
        <p class="step-label kado-ui-label mb-0">
          {{ t('home.stepLabel', { number: String(i + 1).padStart(2, '0') }) }}
        </p>
        <h3 class="h5 mb-0">{{ t(step.title) }}</h3>
        <p class="text-body-secondary mb-0">{{ t(step.body) }}</p>
      </li>
    </ol>
  </section>

  <section aria-labelledby="home-privacy-title" class="px-3 px-lg-4 py-3 py-lg-4">
    <div class="home-reading-width mx-auto">
      <h2 id="home-privacy-title" class="h4 mb-3">{{ t('home.privacy.title') }}</h2>
      <p class="mb-2">{{ t('home.privacy.body') }}</p>
      <p class="text-body-secondary mb-0">{{ t('home.privacy.data') }}</p>
    </div>
  </section>

  <section aria-labelledby="home-faq-title" class="px-3 px-lg-4 py-3 py-lg-4">
    <div class="home-reading-width d-flex flex-column gap-4 mx-auto">
      <h2 id="home-faq-title" class="h4 mb-0">{{ t('home.faq.title') }}</h2>
      <article v-for="[question, answer] in faqItems" :key="question">
        <h3 class="h5 mb-2">{{ t(question) }}</h3>
        <p class="text-body-secondary mb-0">{{ t(answer) }}</p>
      </article>
    </div>
  </section>

  <section
    aria-labelledby="home-closing-title"
    class="closing d-flex flex-column align-items-center gap-3 px-3 py-4 text-center"
  >
    <GiftIllustration kind="hero" class="closing-gifts" />
    <h2 id="home-closing-title" class="h4 mb-0">{{ t('home.closing.title') }}</h2>
    <button class="btn btn-primary px-4" type="button" @click="$emit('create')">
      {{ t('actions.createExchange') }}
    </button>
  </section>
</template>

<style scoped>
.home-steps-section {
  container-type: inline-size;
}

.home-step {
  min-width: 0;
  grid-template-columns: minmax(0, 5rem) minmax(0, 1fr);
  column-gap: 1rem;
  row-gap: 0.5rem;
  align-content: start;
  background: var(--surface);
}

.home-reading-width {
  max-width: 45rem;
}

.step-label {
  color: var(--link, var(--primary));
}

.paper {
  display: block;
  grid-row: span 3;
  place-self: center;
  width: 100%;
  aspect-ratio: 1;
  background: url('../assets/illustrations/kado-paper.webp') 0 0 / 300% 300% no-repeat;
}

.paper--prepare {
  background-position: 50% 0;
}

.paper--invite {
  background-position: 0 50%;
}

.paper--surprise {
  /* The bowl of folded draw slips, distinct from the hero's open gift. */
  background-position: 0 0;
}

.closing-gifts {
  width: 5.25rem;
  max-width: 100%;
}

@container (min-width: 52rem) {
  .home-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  /* Shared tracks align artwork, labels, titles and copy even when titles wrap. */
  .home-step {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: subgrid;
    grid-row: span 4;
    row-gap: 0.75rem;
  }

  .paper {
    grid-row: auto;
    width: 7rem;
    max-width: 100%;
    margin-bottom: 0.25rem;
  }
}

/* Also stacks when enlarged text leaves too little room beside the artwork. */
@container (max-width: 18rem) {
  .home-step {
    grid-template-columns: minmax(0, 1fr);
  }

  .paper {
    grid-row: auto;
    width: 4.5rem;
    max-width: 100%;
  }
}

.closing h2 {
  font-size: clamp(1.6rem, 3vw, 2.35rem);
}
</style>
