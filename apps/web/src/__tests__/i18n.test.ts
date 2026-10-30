// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createI18n } from 'vue-i18n'
import { parse, compileTemplate } from 'vue/compiler-sfc'
import fr from '../i18n/locales/fr-CA.json'
import { pluralRules } from '../i18n/plurals'

type Messages = { [key: string]: string | Messages }
function flatten(messages: Messages, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(messages).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[prefix + key, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  )
}
const source = flatten(fr)
const catalogues = Object.entries(
  import.meta.glob<Messages>('../i18n/locales/*.json', { eager: true, import: 'default' }),
).map(([filename, messages]) => [path.basename(filename, '.json'), messages] as const)
const parameters = (message: string) => [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()
const links = (message: string) => [...message.matchAll(/@:(\w+(?:\.\w+)+)/g)].map((m) => m[1]!)
const src = path.resolve('src')
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__') return []
    const filename = path.join(directory, entry.name)
    return entry.isDirectory()
      ? sourceFiles(filename)
      : /\.(vue|ts)$/.test(entry.name)
        ? [filename]
        : []
  })
}
const implementation = sourceFiles(src).map((filename) => {
  let text = readFileSync(filename, 'utf8')
  if (filename.endsWith('.vue')) {
    const { descriptor } = parse(text, { filename })
    text = [
      descriptor.script?.content,
      descriptor.scriptSetup?.content,
      descriptor.template
        ? compileTemplate({ source: descriptor.template.content, filename, id: filename }).code
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  return {
    filename,
    ast: ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
  }
})

describe('French source of truth and translation integrity', () => {
  it.each(catalogues)(
    'keeps %s aligned with the French source and its grammar',
    (locale, messages) => {
      const translated = flatten(messages)
      expect(Object.keys(translated).sort()).toEqual(Object.keys(source).sort())
      for (const [key, text] of Object.entries(source)) {
        const translation = translated[key]!
        expect(text.trim(), key).not.toBe('')
        expect(translation.trim(), key).not.toBe('')
        // A language may repeat a variable in more plural branches than French.
        expect([...new Set(parameters(translation))], key).toEqual([...new Set(parameters(text))])
        const forms = text.split('|').length
        expect(translation.split('|').length, key).toBe(
          locale === 'ru' && forms > 1 ? forms + 1 : forms,
        )
        expect(links(translation), key).toEqual(links(text))
        expect(translation.match(/<\/?[a-z][^>]*>/gi), key).toEqual(text.match(/<\/?[a-z][^>]*>/gi))
      }
    },
  )

  it.each(catalogues.filter(([locale]) => locale !== 'fr-CA'))(
    'only leaves reviewed names and shared words identical in %s',
    (locale, messages) => {
      const shared = new Set([
        'app.title',
        'languages.fr',
        'languages.en',
        'languages.es',
        'languages.it',
        'languages.ru',
        'languages.de',
        'fonts.b',
        'fonts.f',
        'fonts.g',
        'fonts.h',
        'fonts.j',
      ])
      const exceptions: Record<string, string[]> = {
        'en-CA': [
          'actions.changePaletteTheme',
          'common.participants',
          'fields.budget',
          'fields.description',
          'exchangeDetail.wishlistSuggestions',
          'exchangeDetail.linkModal.infoTitle',
          'review.detailsExclusions',
        ],
        es: ['palettes.j'],
        it: ['palettes.j', 'fields.budget'],
        ru: [],
        de: ['fonts.a', 'fields.budget'],
      }
      for (const key of exceptions[locale] ?? []) shared.add(key)
      for (const [key, message] of Object.entries(flatten(messages))) {
        if (message === source[key] && !message.startsWith('@:')) {
          expect(shared.has(key), `${locale} message needs review: ${key}`).toBe(true)
        }
      }
    },
  )

  it('has no duplicate JSON properties that would silently overwrite a translation', () => {
    for (const [locale] of catalogues) {
      const filename = path.join(src, 'i18n/locales', `${locale}.json`)
      const ast = ts.parseJsonText(filename, readFileSync(filename, 'utf8'))
      function inspect(node: ts.Node) {
        if (ts.isObjectLiteralExpression(node)) {
          const names = node.properties.map((property) => property.name?.getText(ast))
          expect(new Set(names).size, `${locale}: ${node.getText(ast)}`).toBe(names.length)
        }
        ts.forEachChild(node, inspect)
      }
      inspect(ast)
    }
  })

  it('stores each shared French label once and resolves aliases without cycles', () => {
    const labels = new Map<string, string>()
    for (const [key, value] of Object.entries(source)) {
      if (!value.startsWith('@:')) {
        expect(labels.get(value), `Repeated label: ${key} and ${labels.get(value)}`).toBeUndefined()
        labels.set(value, key)
      }
      function checkLinks(current: string, visited: string[]) {
        expect(visited, `Alias cycle at ${current}`).not.toContain(current)
        expect(source[current], `Missing linked message: ${current}`).toBeDefined()
        for (const linked of links(source[current]!)) checkLinks(linked, [...visited, current])
      }
      checkLinks(key, [])
    }
  })

  it('keeps static call sites valid and removes orphaned messages', () => {
    const roots = new Set(Object.keys(source).map((key) => key.split('.')[0]))
    const referenced = new Set<string>()
    for (const { filename, ast } of implementation) {
      function inspect(node: ts.Node) {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          const key = node.text
          if (key.includes('.') && roots.has(key.split('.')[0])) {
            expect(source[key], `${filename}: missing ${key}`).toBeDefined()
            referenced.add(key)
          }
        }
        if (ts.isCallExpression(node)) {
          const name = ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text
            : node.expression.getText(ast)
          const first = node.arguments[0]
          if (['t', 'te', 'translate'].includes(name) && first && ts.isStringLiteral(first)) {
            expect(source[first.text], `${filename}: missing ${first.text}`).toBeDefined()
          }
        }
        ts.forEachChild(node, inspect)
      }
      inspect(ast)
    }
    // These namespaces are addressed by API codes, conflict-field names or template loops.
    const dynamic = ['apiErrors.', 'fields.', 'home.trustStrip.', 'development.palette.']
    for (const [key, value] of Object.entries(source)) {
      for (const linked of links(value)) referenced.add(linked)
      if (dynamic.some((prefix) => key.startsWith(prefix))) referenced.add(key)
    }
    expect(Object.keys(source).filter((key) => !referenced.has(key))).toEqual([])
  })

  it.each(catalogues)(
    'renders every %s message, including variables, plurals and aliases',
    (locale, messages) => {
      const instance = createI18n({
        legacy: false,
        locale,
        fallbackLocale: false,
        warnHtmlMessage: false,
        messages: { [locale]: messages },
        pluralRules,
        missing: (_locale, key) => {
          throw new Error(`Missing ${key}`)
        },
      })
      try {
        for (const [key, message] of Object.entries(flatten(messages))) {
          for (const count of [0, 1, 2, 5, 11, 21, 22, 25, 101]) {
            const values = Object.fromEntries(
              parameters(message).map((name) => [name, name === 'count' ? count : 'Sample']),
            )
            const rendered = instance.global.t(key, values, count)
            expect(rendered, `${locale}: ${key}`).not.toBe(key)
            expect(rendered, `${locale}: ${key}`).not.toMatch(/\{\w+\}|@:/)
          }
        }
        const words: Record<string, [string, string]> = {
          'fr-CA': ['suggestion', 'suggestions'],
          'en-CA': ['suggestion', 'suggestions'],
          es: ['sugerencia', 'sugerencias'],
          it: ['suggerimento', 'suggerimenti'],
          ru: ['пожелание', 'пожелания'],
          de: ['Wunsch', 'Wünsche'],
        }
        for (const key of [
          'exchangeDetail.wishlistSuggestions',
          'participant.minWishlistSuggestionsHint',
          'participant.minWishlistSuggestionsError',
          'review.detailsMinimum',
        ]) {
          expect(instance.global.t(key, { count: 1 }, 1), key).toContain(`1 ${words[locale]![0]}`)
          expect(instance.global.t(key, { count: 2 }, 2), key).toContain(`2 ${words[locale]![1]}`)
          if (locale === 'ru') {
            for (const [count, word] of [
              [0, 'пожеланий'],
              [5, 'пожеланий'],
              [11, 'пожеланий'],
              [21, 'пожелание'],
              [22, 'пожелания'],
              [25, 'пожеланий'],
              [101, 'пожелание'],
            ] as const) {
              expect(instance.global.t(key, { count }, count), key).toContain(`${count} ${word}`)
            }
          }
        }
        if (locale === 'ru') {
          for (const [count, text] of [
            [0, 'Нет ограничений'],
            [1, '1 ограничение'],
            [2, '2 ограничения'],
            [5, '5 ограничений'],
            [11, '11 ограничений'],
            [21, '21 ограничение'],
            [22, '22 ограничения'],
            [25, '25 ограничений'],
          ] as const) {
            expect(
              instance.global.t('exchangeDetail.dashboard.exclusionCount', { count }, count),
            ).toBe(text)
          }
        }
      } finally {
        instance.dispose()
      }
    },
  )
})
