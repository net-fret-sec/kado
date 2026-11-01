// Fed to Node on stdin by status.sh; no application restart or public endpoint.
import pg from "pg";
import { IANAZone } from "luxon";

const format = process.argv[2] ?? "text";
const zone = process.env.EXCHANGE_TIME_ZONE ?? "America/Toronto";
if (!["text", "json"].includes(format) || !IANAZone.isValidZone(zone)) {
  console.error("Bilan impossible : format ou fuseau horaire invalide.");
  process.exit(2);
}
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL?.trim() || undefined,
  connectionTimeoutMillis: 3000,
  statement_timeout: 10000,
  lock_timeout: 2000,
  application_name: "kado-status",
});
try {
  await db.connect();
  await db.query("BEGIN READ ONLY");
  // Match apps/api/src/lib/exchange-state.ts: midnight + 31 calendar days in
  // EXCHANGE_TIME_ZONE, not 31 * 24 hours (daylight-saving transitions matter).
  const { rows: [{ report }] } = await db.query(`
    WITH exchange_state AS (
      SELECT id, event_date, draw_at, created_at,
        COALESCE(CURRENT_TIMESTAMP >=
          ((event_date + 31)::timestamp AT TIME ZONE $1), false) AS archived
      FROM exchanges
    ), active_participants AS (
      SELECT p.exchange_id,
        CASE WHEN jsonb_typeof(p.wishlist) = 'array'
          THEN jsonb_array_length(p.wishlist) ELSE 0 END AS suggestions
      FROM participants p JOIN exchange_state e ON e.id = p.exchange_id
      WHERE p.status = 'active' AND NOT e.archived
    )
    SELECT json_build_object(
      'generatedAt', CURRENT_TIMESTAMP,
      'timeZone', $1::text,
      'exchanges', json_build_object(
        'total', count(*),
        'active', count(*) FILTER (WHERE NOT archived),
        'activeUndrawn', count(*) FILTER (WHERE NOT archived AND draw_at IS NULL),
        'activeDrawn', count(*) FILTER (WHERE NOT archived AND draw_at IS NOT NULL),
        'archived', count(*) FILTER (WHERE archived),
        'activeWithoutEventDate', count(*) FILTER (WHERE NOT archived AND event_date IS NULL),
        'activeWithAtLeastThreeParticipants', (
          SELECT count(*) FROM (
            SELECT exchange_id FROM active_participants GROUP BY exchange_id HAVING count(*) >= 3
          ) eligible
        ),
        'createdLast24Hours', count(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - interval '24 hours'),
        'createdLast7Days', count(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - interval '168 hours'),
        'createdLast30Days', count(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - interval '720 hours')
      ),
      'activeExchanges', json_build_object(
        'participants', (SELECT count(*) FROM active_participants),
        'suggestions', (SELECT COALESCE(sum(suggestions), 0) FROM active_participants)
      )
    ) AS report FROM exchange_state
  `, [zone]);
  const { rows: [{ traffic }] } = await db.query(`
    WITH recent AS (
      SELECT minute, page, views FROM page_view_counts
      WHERE minute >= CURRENT_TIMESTAMP - interval '7 days'
        AND minute <= CURRENT_TIMESTAMP
    )
    SELECT json_build_object(
      'collectionStartedAt', (SELECT started_at FROM page_view_collection WHERE singleton),
      'retentionDays', 7,
      'last24HoursFrom', date_trunc('minute', CURRENT_TIMESTAMP) - interval '24 hours',
      'last24Hours', (SELECT COALESCE(sum(views), 0) FROM recent
        WHERE minute >= date_trunc('minute', CURRENT_TIMESTAMP) - interval '24 hours'),
      'byPageLast24Hours', (SELECT json_object_agg(page, total) FROM (
        SELECT kinds.page, COALESCE(sum(r.views), 0) AS total
        FROM (VALUES ('home'), ('organizer'), ('participant')) kinds(page)
        LEFT JOIN recent r ON r.page = kinds.page
          AND r.minute >= date_trunc('minute', CURRENT_TIMESTAMP) - interval '24 hours'
        GROUP BY kinds.page
      ) categories),
      'last7Days', (SELECT COALESCE(sum(views), 0) FROM recent),
      'byDay', (SELECT COALESCE(json_agg(days ORDER BY days.date DESC), '[]'::json) FROM (
        SELECT (minute AT TIME ZONE $1)::date AS date, sum(views) AS views
        FROM recent GROUP BY (minute AT TIME ZONE $1)::date
      ) days)
    ) AS traffic
  `, [zone]);
  report.traffic = traffic;
  await db.query("COMMIT");
  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const { generatedAt, timeZone, exchanges: e, activeExchanges: a } = report;
    const date = new Intl.DateTimeFormat("fr-CA", {
      timeZone, dateStyle: "long", timeStyle: "medium",
    }).format(new Date(generatedAt));
    const n = value => new Intl.NumberFormat("fr-CA").format(value);
    console.log(`Kado — bilan des échanges
${date} (${timeZone})

Échanges présents : ${n(e.total)}
  Actifs (non archivés) : ${n(e.active)}
    Sans pige : ${n(e.activeUndrawn)}
    Pige effectuée : ${n(e.activeDrawn)}
  Archivés : ${n(e.archived)}

Parmi les échanges actifs :
  Sans date de remise : ${n(e.activeWithoutEventDate)}
  Avec au moins 3 participants : ${n(e.activeWithAtLeastThreeParticipants)}
  Participants inscrits : ${n(a.participants)}
  Suggestions enregistrées : ${n(a.suggestions)}

Échanges créés et encore présents :
  Dernières 24 heures : ${n(e.createdLast24Hours)}
  7 derniers jours : ${n(e.createdLast7Days)}
  30 derniers jours : ${n(e.createdLast30Days)}

Actif = non archivé, sans mesure des visites ou de l’activité récente.
Archivage : 31 jours après la date de remise, à minuit dans le fuseau indiqué.
Sans date de remise, un échange reste actif. Les échanges supprimés ne sont pas comptés.

Chargements de pages signalés (pas des visiteurs uniques) :
  Collecte depuis : ${traffic.collectionStartedAt ? new Intl.DateTimeFormat("fr-CA", {
    timeZone, dateStyle: "long", timeStyle: "medium",
  }).format(new Date(traffic.collectionStartedAt)) : "indisponible"}
  Dernières 24 heures, à la minute près : ${n(traffic.last24Hours)}
    Accueil : ${n(traffic.byPageLast24Hours.home)}
    Organisateur : ${n(traffic.byPageLast24Hours.organizer)}
    Participant : ${n(traffic.byPageLast24Hours.participant)}
  7 derniers jours : ${n(traffic.last7Days)}
  Par date locale (jours partiels aux bornes) :
${traffic.byDay.length ? traffic.byDay.map(day => `    ${day.date} : ${n(day.views)}`).join("\n") : "    Aucun chargement signalé."}

Compteurs agrégés uniquement, conservés 7 jours et exclus des sauvegardes.
Rechargements et robots possibles inclus ; sans JavaScript, hors ligne,
avec blocage de la requête ou DNT/GPC activé : chargements non comptés.
Aucune IP, URL personnelle ou identité de visiteur conservée dans ces compteurs.
Une consultation ne prouve ni une connexion réussie ni une création d’échange.`);
  }
} catch (error) {
  // Do not print SQL, connection strings, credentials or database error details.
  const code = /^[A-Z0-9_]+$/.test(error?.code ?? "") ? ` (${error.code})` : "";
  console.error(`Bilan impossible : vérifier la connexion et le schéma de la base${code}.`);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
