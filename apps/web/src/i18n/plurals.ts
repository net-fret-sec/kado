const russian = new Intl.PluralRules('ru')

// Russian catalogues use one/few/many, with an optional explicit zero first.
export const pluralRules = {
  ru: (choice: number, choicesLength: number): number => {
    if (choicesLength <= 1) return 0
    const hasZero = choicesLength === 4
    if (hasZero && choice === 0) return 0
    const category = russian.select(choice)
    const index = category === 'one' ? 0 : category === 'few' ? 1 : 2
    return index + (hasZero ? 1 : 0)
  },
}
