<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ParticipantSelfViewDto, ExchangeExclusionSummaryDto } from '@kado/shared'
import { formatMoney } from '@/composables/useCurrency'
import { formatCivilDate } from '@/composables/useCivilDate'
import { groupExclusions } from '@/lib/exclusionSummary'
const props = defineProps<{
  exchange: ParticipantSelfViewDto['exchange']
  exclusions?: ExchangeExclusionSummaryDto[]
  editable?: boolean
}>()
defineEmits<{ edit: [] }>()
const { t, locale } = useI18n()
const summary = computed(() => {
  const rules = props.exclusions ?? []
  const names = new Map(
    rules.flatMap(
      (r) =>
        [
          [r.giverParticipantId, r.giverName],
          [r.receiverParticipantId, r.receiverName],
        ] as [string, string][],
    ),
  )
  const collator = new Intl.Collator(locale.value, { sensitivity: 'base', numeric: true })
  const name = (id: string) => names.get(id) ?? id
  const groups = groupExclusions(
    [...rules].sort(
      (a, b) =>
        collator.compare(a.giverName, b.giverName) ||
        collator.compare(a.receiverName, b.receiverName),
    ),
    props.exchange.noMutualAssignments,
  )
  const joinNames = (values: string[]) =>
    values.length < 2
      ? values.join('')
      : `${values.slice(0, -1).join(', ')} ${locale.value.startsWith('fr') ? 'et' : 'and'} ${values[values.length - 1]}`
  return [
    ...groups.mutual.map(({ a, b }) => {
      const pair = [name(a), name(b)].sort(collator.compare)
      return t('review.mutual', { a: pair[0], b: pair[1] })
    }),
    ...groups.directional.map(({ giver, receivers }) =>
      t('review.directional', {
        name: name(giver),
        others: joinNames(receivers.map(name).sort(collator.compare)),
      }),
    ),
  ].sort(collator.compare)
})
</script>
<template>
  <section class="card border shadow-sm exchange-details-card">
    <div class="card-body">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h2 class="h4 mb-1">{{ t('exchangeDetail.dashboard.settings') }}</h2>
          <p v-if="exchange.organizerName" class="small text-body-secondary mb-0">
            {{ t('review.detailsOrganizer', { name: exchange.organizerName }) }}
          </p>
        </div>
        <button
          v-if="editable"
          type="button"
          class="btn btn-sm btn-outline-primary"
          :disabled="exchange.isArchived"
          @click="$emit('edit')"
        >
          {{ t('exchangeDetail.dashboard.editSettings') }}
        </button>
      </div>
      <p v-if="exchange.description" class="details-description">{{ exchange.description }}</p>
      <ul class="ps-3 details-rules">
        <li v-if="exchange.plannedDrawDate">
          {{ t('review.plannedDrawDate') }} : {{ formatCivilDate(exchange.plannedDrawDate) }}
        </li>
        <li v-if="exchange.eventDate">
          {{ t('exchangeDetail.exchangeMoment') }} : {{ formatCivilDate(exchange.eventDate) }}
        </li>
        <li v-if="exchange.budget != null">
          {{ t('review.detailsBudget', { amount: formatMoney(exchange.budget) }) }}
        </li>
        <li>
          {{
            exchange.minWishlistSuggestions
              ? t(
                  'review.detailsMinimum',
                  { count: exchange.minWishlistSuggestions },
                  exchange.minWishlistSuggestions,
                )
              : t('review.detailsMinimumNone')
          }}
        </li>
        <li>
          {{
            t(
              (exchange.lockSuggestionsAfterDraw ?? true)
                ? 'review.detailsLocked'
                : 'review.detailsOpen',
            )
          }}
        </li>
        <li>
          {{ t(exchange.noMutualAssignments ? 'review.detailsNoMutual' : 'review.detailsMutual') }}
        </li>
      </ul>
      <h3 class="h5 fw-semibold mt-3">{{ t('review.detailsExclusions') }}</h3>
      <p v-if="exchange.noMutualAssignments" class="small text-body-secondary">
        {{ t('review.reciprocalExclusions') }}
      </p>
      <ul v-if="summary.length" class="ps-3 mb-0 exclusions-summary">
        <li v-for="line in summary" :key="line">{{ line }}</li>
      </ul>
      <p v-else class="small text-body-secondary mb-0">{{ t('exchangeDetail.exceptions.none') }}</p>
    </div>
  </section>
</template>
<style scoped>
.details-rules li + li {
  margin-top: 0.35rem;
}
.details-description {
  white-space: pre-wrap;
}
.exchange-details-card {
  overflow-wrap: anywhere;
}
</style>
