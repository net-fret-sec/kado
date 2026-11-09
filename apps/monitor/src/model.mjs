export const categories = {
  home: "Accueil",
  organizer: "Organisation",
  participant: "Participation",
  files: "Fichiers",
  api: "API",
  technical: "Technique",
  other: "Autres demandes",
};
export const periods = [
  { key: "last24Hours", days: 1, label: "24 heures" },
  { key: "last7Days", days: 7, label: "7 jours" },
  { key: "last30Days", days: 30, label: "30 jours" },
  { key: "last90Days", days: 90, label: "90 jours" },
];
export const number = (value) =>
  value == null ? "—" : new Intl.NumberFormat("fr-CA").format(value);
export function date(value, short = false) {
  if (value == null) return "Indisponible";
  const d = new Date(typeof value === "number" ? value * 1000 : value);
  if (!Number.isFinite(d.getTime())) return "Indisponible";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto",
    ...(short
      ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { dateStyle: "medium", timeStyle: "short" }),
  }).format(d);
}
export function selectedHours(report, period) {
  if (!report || !period) return [];
  const lookup = new Map((report.traffic.hours ?? []).map((h) => [h.at, h]));
  for (const row of period.boundaryHours ?? []) lookup.set(row.at, row);
  const result = [];
  for (
    let at = Math.floor(period.from / 3600) * 3600;
    at <= Math.floor(period.to / 3600) * 3600;
    at += 3600
  ) {
    const row = lookup.get(at);
    const expected = Math.max(
      0,
      Math.min(
        60,
        Math.floor(
          (Math.min(at + 3600, period.to) -
            Math.max(at, period.effectiveFrom ?? period.to)) /
            60,
        ) + 1,
      ),
    );
    const coverage = row?.coverage;
    const complete =
      !!coverage &&
      !coverage.failures &&
      !coverage.gaps &&
      !coverage.invalidRecords &&
      coverage.observedMinutes >= expected &&
      at >= period.effectiveFrom;
    result.push({
      ...row,
      at,
      home: row?.home ?? null,
      complete,
      value: row?.home ? row.home.ok + row.home.notModified : null,
    });
  }
  return result;
}
export function chartBuckets(hours, days) {
  if (days <= 1) return hours;
  const groups = new Map();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (const h of hours) {
    const key = formatter.format(new Date(h.at * 1000));
    const group = groups.get(key) ?? { at: h.at, value: null, complete: true };
    if (h.value !== null) group.value = (group.value ?? 0) + h.value;
    group.complete = group.complete && h.complete;
    groups.set(key, group);
  }
  return [...groups.values()];
}
export function csvRows(hours) {
  const header = [
    "Heure (Toronto)",
    "Début UTC",
    "Accueil 200",
    "Accueil 304",
    "Navigations accueil",
    "Requêtes serveur",
    "Requêtes classées",
    "Qualité",
  ];
  const escape = (value) =>
    '"' + String(value ?? "").replaceAll('"', '""') + '"';
  return (
    "\uFEFF" +
    [
      header,
      ...hours.map((h) => [
        date(h.at),
        new Date(h.at * 1000).toISOString(),
        h.home?.ok,
        h.home?.notModified,
        h.home?.navigation,
        h.requests,
        h.categories
          ? Object.values(h.categories).reduce((a, b) => a + b, 0)
          : null,
        h.complete ? "Complète" : "Incomplète ou absente",
      ]),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
