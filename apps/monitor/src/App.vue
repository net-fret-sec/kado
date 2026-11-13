<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  categories,
  periods,
  number,
  date,
  selectedHours,
  chartBuckets,
  csvRows,
} from "./model.mjs";
const payload = ref(null),
  error = ref(null),
  loading = ref(false),
  selected = ref(periods[0].key),
  page = ref(0);
const report = computed(() => payload.value?.report);
const definition = computed(() =>
  periods.find((p) => p.key === selected.value),
);
const period = computed(() => report.value?.traffic?.periods[selected.value]);
const hours = computed(() => selectedHours(report.value, period.value));
const metricCorrections = computed(() =>
  (report.value?.serverActivity?.metricCorrections ?? []).filter(
    (item) => item.from <= period.value?.to && item.to >= period.value?.from,
  ),
);
const buckets = computed(() =>
  chartBuckets(hours.value, definition.value.days),
);
const technical = computed(() =>
  hours.value.reduce(
    (total, hour) => ({
      gaps: total.gaps + (hour.gaps ?? 0),
      restarts: total.restarts + (hour.restarts ?? 0),
      failures: total.failures + (hour.metricFailures ?? 0),
    }),
    { gaps: 0, restarts: 0, failures: 0 },
  ),
);
const maximum = computed(() =>
  Math.max(1, ...buckets.value.map((h) => h.value ?? 0)),
);
const totalHome = computed(() =>
  period.value?.home
    ? period.value.home.ok + period.value.home.notModified
    : null,
);
const quality = computed(() => period.value?.quality);
const stale = computed(
  () =>
    !!(
      error.value ||
      payload.value?.transportStale ||
      report.value?.stale ||
      report.value?.traffic?.stale
    ),
);
const incomplete = computed(
  () =>
    !!(
      period.value?.partial ||
      quality.value?.missingMinutes ||
      quality.value?.gaps ||
      quality.value?.invalidRecords ||
      technical.value.gaps ||
      technical.value.restarts ||
      technical.value.failures ||
      stale.value
    ),
);
const serviceGood = computed(
  () =>
    report.value &&
    Object.values(report.value.health).every(Boolean) &&
    Object.values(report.value.services).every((s) => s.running),
);
const backupGood = computed(
  () =>
    report.value?.backup.recent &&
    report.value?.backup.timerActive &&
    report.value?.backup.lastJobSucceeded,
);
const snapshots = computed(() =>
  (report.value?.traffic.businessSnapshots ?? [])
    .filter((s) => s.sampledAt >= period.value?.from)
    .slice(-8)
    .reverse(),
);
const visibleHours = computed(() =>
  [...hours.value].reverse().slice(page.value * 24, (page.value + 1) * 24),
);
const categoryMax = computed(() =>
  Math.max(1, ...Object.values(period.value?.categories ?? {})),
);
let interval;
async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    const response = await fetch("/api/report", {
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    const next = await response.json();
    if (next.report || !payload.value) payload.value = next;
    error.value = next.error ?? (!response.ok ? "Bilan indisponible." : null);
  } catch {
    error.value =
      "La connexion au tableau de bord est interrompue. Le dernier bilan reste affiché.";
  } finally {
    loading.value = false;
  }
}
function exportCsv() {
  const url = URL.createObjectURL(
    new Blob([csvRows(hours.value)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `kado-${definition.value.days}j.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
onMounted(() => {
  refresh();
  interval = setInterval(refresh, 60000);
});
onUnmounted(() => clearInterval(interval));
</script>

<template>
  <a class="skip" href="#main">Aller aux données</a>
  <div class="shell">
    <header class="masthead">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">k</span
        ><span>Kado<span class="brand-sub">OBSERVATOIRE</span></span>
      </div>
      <span class="private-label"
        ><span aria-hidden="true">●</span> Privé · sur cet ordinateur</span
      >
    </header>
    <main id="main">
      <div class="heading">
        <div>
          <p class="eyebrow">COMPRENDRE L’ACTIVITÉ</p>
          <h1>Un peu de recul<br /><span>sur les chiffres.</span></h1>
          <p class="intro">
            Ce que le serveur reçoit, ce que Kado contient,<br
              class="desktop-break"
            />
            et ce que les mesures permettent de savoir.
          </p>
        </div>
        <div class="refresh-block">
          <button class="button" @click="refresh" :disabled="loading">
            <span aria-hidden="true">↻</span>
            {{ loading ? "Actualisation…" : "Actualiser" }}
          </button>
          <p>
            Relevé : {{ date(report?.generatedAt) }}<br />Actualisation
            automatique chaque minute
          </p>
        </div>
      </div>
      <div v-if="error || stale" class="notice warning" role="status">
        <strong>{{
          report
            ? "Dernier bilan connu — données périmées"
            : "Bilan indisponible"
        }}</strong>
        <p>
          {{
            error || "La collecte du serveur n’a pas fourni de relevé récent."
          }}
        </p>
      </div>
      <div v-if="!report" class="empty panel">
        <h2>{{ loading ? "Lecture du bilan…" : "En attente du serveur" }}</h2>
        <p>
          Le tableau de bord utilise ton accès SSH <code>netfretsec</code>. Le
          collecteur version 2 doit être installé sur le serveur.
        </p>
        <p>Aucune donnée de démonstration ne remplace les mesures absentes.</p>
      </div>
      <template v-else>
        <section class="toolbar" aria-label="Période des mesures">
          <div class="periods" role="group" aria-label="Choisir la période">
            <button
              v-for="option in periods"
              :key="option.key"
              :aria-pressed="selected === option.key"
              @click="
                selected = option.key;
                page = 0;
              "
            >
              {{ option.label }}
            </button>
          </div>
          <button class="text-button" @click="exportCsv">
            Exporter CSV <span aria-hidden="true">↗</span>
          </button>
        </section>
        <div class="period-caption">
          {{ date(period?.from) }} — {{ date(period?.to) }} · heure de Toronto
        </div>
        <div class="cards">
          <section class="card hero-card">
            <p class="card-label">Demandes d’accueil reçues</p>
            <strong class="metric">{{ number(totalHome) }}</strong>
            <p>Réponses GET 200 et 304</p>
            <div class="card-footer">
              {{ number(period?.home?.navigation) }} signalées comme navigations
            </div>
          </section>
          <section class="card">
            <p class="card-label">Requêtes classées</p>
            <strong class="metric">{{ number(period?.requests) }}</strong>
            <p>Pages, fichiers, API et autres demandes</p>
            <div class="card-footer">Robots et tes consultations inclus</div>
          </section>
          <section class="card">
            <p class="card-label">Qualité de la période</p>
            <strong class="quality-value" :class="{ amber: incomplete }">{{
              incomplete ? "Partielle" : "Complète"
            }}</strong>
            <p>{{ number(quality?.observedMinutes) }} minutes observées</p>
            <div class="card-footer">
              {{ number(quality?.missingMinutes) }} manquantes ·
              {{ number(quality?.gaps) }} ruptures
            </div>
          </section>
        </div>
        <p class="interpretation">
          <span aria-hidden="true">ⓘ</span>
          <strong>Des demandes, pas des personnes.</strong> Le cache, les
          restaurations d’onglets et la navigation interne peuvent éviter un
          appel au serveur.
        </p>
        <div class="chart-layout">
          <section class="panel chart-panel" aria-labelledby="chart-title">
            <div class="section-heading">
              <div>
                <p class="eyebrow">DANS LE TEMPS</p>
                <h2 id="chart-title">Demandes d’accueil</h2>
              </div>
              <span class="subtle">{{
                definition.days === 1 ? "Par heure" : "Par jour"
              }}</span>
            </div>
            <div
              v-if="period.home"
              class="chart"
              :aria-label="`Demandes d’accueil ${definition.label}; valeurs détaillées dans le tableau plus bas.`"
              role="img"
            >
              <div class="chart-scale">
                <span>{{ number(maximum) }}</span
                ><span>0</span>
              </div>
              <div class="chart-columns">
                <div
                  v-for="bucket in buckets"
                  :key="bucket.at"
                  class="chart-slot"
                  :class="{ incomplete: !bucket.complete }"
                >
                  <div
                    class="bar"
                    :class="{ missing: bucket.value === null }"
                    :style="{
                      height:
                        bucket.value === null
                          ? '100%'
                          : `${Math.max(1, (bucket.value / maximum) * 100)}%`,
                    }"
                  >
                    <span class="tooltip"
                      >{{ date(bucket.at) }}<br />{{
                        bucket.value === null
                          ? "Non mesuré"
                          : number(bucket.value) + " demandes"
                      }}{{
                        !bucket.complete ? " · période partielle" : ""
                      }}</span
                    >
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="chart-empty">
              La collecte détaillée n’a pas encore commencé.
            </div>
            <div class="chart-axis">
              <span>{{ date(buckets[0]?.at, true) }}</span
              ><span>{{ date(buckets.at(-1)?.at, true) }}</span>
            </div>
            <div class="legend">
              <span><i class="dot"></i> Demandes reçues</span
              ><span
                ><i class="dot hatched"></i> Période incomplète ou absente</span
              >
            </div>
            <div class="mini-stats">
              <span
                ><strong>{{ number(period.home?.ok) }}</strong> HTML envoyé ·
                200</span
              ><span
                ><strong>{{ number(period.home?.notModified) }}</strong> Cache
                revalidé · 304</span
              ><span
                ><strong>{{ number(period.home?.other) }}</strong> Autres
                réponses accueil</span
              >
            </div>
          </section>
          <section class="panel distribution">
            <p class="eyebrow">CE QUI ARRIVE AU SERVEUR</p>
            <h2>Répartition</h2>
            <div
              v-for="(label, key) in categories"
              :key="key"
              class="distribution-row"
            >
              <div>
                <span>{{ label }}</span
                ><strong>{{ number(period.categories?.[key]) }}</strong>
              </div>
              <div class="track">
                <span
                  :style="{
                    width: `${((period.categories?.[key] ?? 0) / categoryMax) * 100}%`,
                  }"
                ></span>
              </div>
            </div>
          </section>
        </div>
        <div class="lower-layout">
          <section class="panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">UTILISATION DE KADO</p>
                <h2>Les échanges aujourd’hui</h2>
              </div>
            </div>
            <div v-if="report.exchanges" class="business-grid">
              <div>
                <strong>{{ number(report.exchanges.total) }}</strong
                ><span>échanges présents</span>
              </div>
              <div>
                <strong>{{ number(report.exchanges.activeDrawn) }}</strong
                ><span>actifs avec pige</span>
              </div>
              <div>
                <strong>{{
                  number(report.activeExchanges.participants)
                }}</strong
                ><span>participants actifs</span>
              </div>
              <div>
                <strong>{{ number(report.activeExchanges.suggestions) }}</strong
                ><span>suggestions</span>
              </div>
            </div>
            <p v-else class="notice warning">
              Les données des échanges sont indisponibles.
            </p>
            <p class="subtle">
              « Actif » signifie non archivé, pas récemment visité. Les échanges
              supprimés ne figurent plus dans le total.
            </p>
            <details v-if="snapshots.length">
              <summary>Derniers instantanés horaires</summary>
              <div class="table-scroll">
                <table>
                  <caption>
                    États successifs, sans déduction de créations ou
                    suppressions
                  </caption>
                  <thead>
                    <tr>
                      <th>Relevé</th>
                      <th>Échanges</th>
                      <th>Participants</th>
                      <th>Suggestions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in snapshots" :key="s.at">
                      <th>{{ date(s.sampledAt) }}</th>
                      <td>{{ number(s.exchanges.total) }}</td>
                      <td>{{ number(s.activeExchanges.participants) }}</td>
                      <td>{{ number(s.activeExchanges.suggestions) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section class="panel">
            <p class="eyebrow">LE SERVICE</p>
            <h2>État et sauvegarde</h2>
            <ul class="health-list">
              <li>
                <span>Site, API et base</span
                ><strong :class="{ amber: !serviceGood }">{{
                  serviceGood ? "En service" : "À vérifier"
                }}</strong>
              </li>
              <li>
                <span>Collecte chaque minute</span
                ><strong :class="{ amber: !report.monitorTimerActive }">{{
                  report.monitorTimerActive ? "Active" : "À vérifier"
                }}</strong>
              </li>
              <li>
                <span>Journal classé</span
                ><strong :class="{ amber: !report.traffic.available }">{{
                  report.traffic.available ? "Disponible" : "À vérifier"
                }}</strong>
              </li>
              <li>
                <span>Sauvegarde locale</span
                ><strong :class="{ amber: !backupGood }">{{
                  backupGood ? "À jour" : "À vérifier"
                }}</strong>
              </li>
            </ul>
            <p class="subtle">
              Sur la période : {{ number(technical.gaps) }} ruptures des
              compteurs, {{ number(technical.restarts) }} redémarrages et
              {{ number(technical.failures) }} minutes sans métriques Caddy.
            </p>
            <p v-for="item in metricCorrections" :key="item.from" class="subtle">
              Du {{ date(item.from) }} au {{ date(item.to) }}, les compteurs
              serveur mélangeaient plusieurs domaines. Cette période est exclue
              des totaux serveur fiables. Les demandes classées Kado sont conservées.
            </p>
            <p class="subtle">
              Dernière sauvegarde :
              {{ date(report.backup.latestAt) }}.<br />L’archive est vérifiée à
              sa création; ce bilan n’effectue pas de restauration.
            </p>
          </section>
        </div>
        <section class="panel confidence">
          <div>
            <p class="eyebrow">SAVOIR CE QU’ON SAIT</p>
            <h2>Couverture et limites</h2>
          </div>
          <div class="confidence-body">
            <p>
              Collecte détaillée depuis le
              <strong>{{ date(report.traffic.collectionStartedAt) }}</strong
              >.
              {{
                period.partial
                  ? "La période sélectionnée commence avant les premières mesures disponibles."
                  : ""
              }}
            </p>
            <p>
              Comparaison avec Caddy :
              <strong
                >{{ number(report.traffic.comparison.hours) }} heures
                complètes</strong
              >
              · écart
              <strong>{{
                number(report.traffic.comparison.difference)
              }}</strong>
              requêtes. Les frontières des relevés peuvent produire de petits
              écarts.
            </p>
            <p>
              {{ number(quality.invalidRecords) }} lignes invalides ·
              {{ number(quality.failures) }} minutes avec un échec de lecture.
              Les anciennes visites ne peuvent pas être reconstituées.
            </p>
            <p class="subtle">
              Aucun identifiant de visiteur, aucune IP, aucun lien personnel
              conservé. Totaux horaires sur 90 jours; détail technique sur 7
              jours. Les en-têtes de navigation ne prouvent pas qu’une demande
              vient d’une personne.
            </p>
          </div>
        </section>
        <details class="panel data-table">
          <summary>Consulter les données horaires</summary>
          <p class="subtle">
            Les premières et dernières heures sont limitées à la période choisie
            lorsque le détail par minute est disponible. Les heures restent
            identifiées explicitement dans le CSV.
          </p>
          <div class="table-scroll">
            <table>
              <caption>
                Demandes d’accueil et couverture, par heure
              </caption>
              <thead>
                <tr>
                  <th>Heure · Toronto</th>
                  <th>Accueil 200</th>
                  <th>Accueil 304</th>
                  <th>Navigations</th>
                  <th>Requêtes serveur</th>
                  <th>Qualité</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="h in visibleHours" :key="h.at">
                  <th>{{ date(h.at) }}</th>
                  <td>{{ number(h.home?.ok) }}</td>
                  <td>{{ number(h.home?.notModified) }}</td>
                  <td>{{ number(h.home?.navigation) }}</td>
                  <td>{{ number(h.requests) }}</td>
                  <td>{{ h.complete ? "Complète" : "Partielle / absente" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pagination">
            <button class="button" @click="page--" :disabled="page === 0">
              Plus récent</button
            ><span>{{ page + 1 }} / {{ Math.ceil(hours.length / 24) }}</span
            ><button
              class="button"
              @click="page++"
              :disabled="(page + 1) * 24 >= hours.length"
            >
              Plus ancien
            </button>
          </div>
        </details>
      </template>
    </main>
    <footer>
      <span>Kado · Observatoire privé</span
      ><span
        >Les chiffres éclairent l’activité. Ils ne racontent pas toute
        l’histoire.</span
      >
    </footer>
  </div>
</template>
