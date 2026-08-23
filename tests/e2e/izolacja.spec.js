import { test, expect, _electron as electron } from '@playwright/test'

test('ciasteczko z jednej partycji jest niewidoczne w drugiej', async () => {
  const aplikacja = await electron.launch({ args: ['.'] })

  const wynik = await aplikacja.evaluate(async ({ session }) => {
    const pierwsza = session.fromPartition('persist:test-izolacja-a')
    const druga = session.fromPartition('persist:test-izolacja-b')

    await pierwsza.cookies.set({ url: 'https://przyklad.test', name: 'probka', value: 'wartosc-a' })

    const wPierwszej = await pierwsza.cookies.get({ name: 'probka' })
    const wDrugiej = await druga.cookies.get({ name: 'probka' })

    return { pierwsza: wPierwszej.length, druga: wDrugiej.length }
  })

  expect(wynik.pierwsza).toBe(1)
  expect(wynik.druga).toBe(0)

  await aplikacja.close()
})

test('User-Agent nie zdradza Electrona', async () => {
  const aplikacja = await electron.launch({ args: ['.'] })
  const ua = await aplikacja.evaluate(async ({ app }) => app.userAgentFallback)

  expect(ua).not.toMatch(/Electron/i)
  expect(ua).not.toMatch(/msg-hub/i)
  expect(ua).toMatch(/Chrome\/\d+/)

  await aplikacja.close()
})
