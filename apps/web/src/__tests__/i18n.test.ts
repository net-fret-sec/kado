// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createI18n } from 'vue-i18n'
import { parse, compileTemplate } from 'vue/compiler-sfc'
import fr from '../i18n/locales/fr-CA.json'
import en from '../i18n/locales/en-CA.json'

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
const translated = flatten(en)
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
  it('has identical keys, nonempty messages, variables and plural forms in both languages', () => {
    expect(Object.keys(translated).sort()).toEqual(Object.keys(source).sort())
    for (const [key, text] of Object.entries(source)) {
      expect(text.trim(), key).not.toBe('')
      expect(translated[key]?.trim(), key).not.toBe('')
      expect(parameters(translated[key]!), key).toEqual(parameters(text))
      expect(translated[key]!.split('|').length, key).toBe(text.split('|').length)
      expect(links(translated[key]!), key).toEqual(links(text))
      expect(translated[key]!.match(/<\/?[a-z][^>]*>/gi), key).toEqual(
        text.match(/<\/?[a-z][^>]*>/gi),
      )
    }
  })

  it('only leaves shared names and words identical in English', () => {
    const shared = new Set([
      'app.title',
      'actions.changePaletteTheme',
      'languages.fr',
      'languages.en',
      'fonts.b',
      'fonts.f',
      'fonts.g',
      'fonts.h',
      'fonts.j',
      'common.participants',
      'fields.budget',
      'fields.description',
      'exchangeDetail.wishlistSuggestions',
      'exchangeDetail.linkModal.infoTitle',
      'review.detailsExclusions',
    ])
    for (const [key, message] of Object.entries(source)) {
      if (message === translated[key] && !message.startsWith('@:')) {
        expect(shared.has(key), `English message needs review: ${key}`).toBe(true)
      }
    }
  })

  it('has no duplicate JSON properties that would silently overwrite a translation', () => {
    for (const locale of ['fr-CA', 'en-CA']) {
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

  it.each([
    ['fr-CA', fr],
    ['en-CA', en],
  ] as const)(
    'renders every %s message, including variables, plurals and aliases',
    (locale, messages) => {
      const instance = createI18n({
        legacy: false,
        locale,
        fallbackLocale: false,
        warnHtmlMessage: false,
        messages: { [locale]: messages },
        missing: (_locale, key) => {
          throw new Error(`Missing ${key}`)
        },
      })
      try {
        for (const [key, message] of Object.entries(flatten(messages))) {
          for (const count of [0, 1, 2]) {
            const values = Object.fromEntries(
              parameters(message).map((name) => [name, name === 'count' ? count : 'Sample']),
            )
            const rendered = instance.global.t(key, values, count)
            expect(rendered, `${locale}: ${key}`).not.toBe(key)
            expect(rendered, `${locale}: ${key}`).not.toMatch(/\{\w+\}|@:/)
          }
        }
        for (const key of [
          'exchangeDetail.wishlistSuggestions',
          'participant.minWishlistSuggestionsHint',
          'participant.minWishlistSuggestionsError',
          'review.detailsMinimum',
        ]) {
          expect(instance.global.t(key, { count: 1 }, 1), key).toContain('1 suggestion')
          expect(instance.global.t(key, { count: 1 }, 1), key).not.toContain('1 suggestions')
          expect(instance.global.t(key, { count: 2 }, 2), key).toContain('2 suggestions')
        }
      } finally {
        instance.dispose()
      }
    },
  )
})
