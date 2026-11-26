// Fictitious content for isolated tests only; never publish these documents.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function createLegalFixture(directory) {
  const documents = ['conditions-utilisation', 'confidentialite'];
  const locales = ['fr-CA', 'en-CA', 'es'];
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'legal-config.json'), JSON.stringify({
    version: 1,
    defaultLocale: 'fr-CA',
    status: 'published',
    variables: { serviceName: 'Example', operatorName: 'Example Operator', projectName: 'Example Project', domain: 'https://example.com', contactEmail: 'help@example.com' },
    documents: Object.fromEntries(documents.map(id => [id, {
      effectiveAt: '2026-11-26', updatedAt: '2026-11-26',
      titles: Object.fromEntries(locales.map(locale => [locale, `${id} (${locale})`])),
    }])),
  }, null, 2));
  for (const locale of locales) {
    const suffix = { 'fr-CA': '', 'en-CA': '-en', es: '-es' }[locale];
    for (const id of documents) {
      const basename = id === 'confidentialite' ? 'confidentiality' : 'conditions';
      await writeFile(path.join(directory, `${basename}${suffix}.md`), `## Test ${locale}\n\nFictitious ${id} for {{ serviceName }}.\n\n[Contact](mailto:{{ contactEmail }}).\n`);
    }
  }
}
