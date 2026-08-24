import { test, expect, _electron as electron } from '@playwright/test'

test('a cookie from one partition is invisible in the other', async () => {
  const electronApp = await electron.launch({ args: ['.'] })

  const result = await electronApp.evaluate(async ({ session }) => {
    const pierwsza = session.fromPartition('persist:test-izolacja-a')
    const druga = session.fromPartition('persist:test-izolacja-b')

    await pierwsza.cookies.set({ url: 'https://przyklad.test', name: 'probka', value: 'wartosc-a' })

    const wPierwszej = await pierwsza.cookies.get({ name: 'probka' })
    const wDrugiej = await druga.cookies.get({ name: 'probka' })

    return { pierwsza: wPierwszej.length, druga: wDrugiej.length }
  })

  expect(result.pierwsza).toBe(1)
  expect(result.druga).toBe(0)

  await electronApp.close()
})

test('the User-Agent does not give Electron away', async () => {
  const electronApp = await electron.launch({ args: ['.'] })
  const ua = await electronApp.evaluate(async ({ app }) => app.userAgentFallback)

  expect(ua).not.toMatch(/Electron/i)
  expect(ua).not.toMatch(/msg-hub/i)
  expect(ua).toMatch(/Chrome\/\d+/)

  await electronApp.close()
})
