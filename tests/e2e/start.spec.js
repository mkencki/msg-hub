import { test, expect, _electron as electron } from '@playwright/test'

test('aplikacja startuje i otwiera jedno okno', async () => {
  const aplikacja = await electron.launch({ args: ['.'] })

  // Okno bez zaladowanej tresci nie jest dla Playwrighta strona, wiec firstWindow()
  // czekaloby w nieskonczonosc. Stan czytamy z procesu glownego.
  const tytuly = await aplikacja.evaluate(async ({ app, BrowserWindow }) => {
    await app.whenReady()
    for (let proba = 0; proba < 50 && BrowserWindow.getAllWindows().length === 0; proba += 1) {
      await new Promise((gotowe) => setTimeout(gotowe, 100))
    }
    return BrowserWindow.getAllWindows().map((okno) => okno.getTitle())
  })

  expect(tytuly).toEqual(['msg-hub'])

  await aplikacja.close()
})
