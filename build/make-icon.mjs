// Sklada plik .ico z gotowego PNG 256x256. Format ICO od Visty dopuszcza
// osadzenie PNG w calosci, wiec wystarczy naglowek ICONDIR + ICONDIRENTRY.
// Uruchamiane recznie po podmianie build/ikona.png:  node build/zrob-ikone.mjs
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KATALOG = path.dirname(fileURLToPath(import.meta.url))
const png = await readFile(path.join(KATALOG, 'ikona.png'))

const naglowek = Buffer.alloc(6)
naglowek.writeUInt16LE(0, 0) // zarezerwowane
naglowek.writeUInt16LE(1, 2) // typ: 1 = ikona
naglowek.writeUInt16LE(1, 4) // liczba obrazow

const pozycja = Buffer.alloc(16)
pozycja.writeUInt8(0, 0) // szerokosc 0 = 256
pozycja.writeUInt8(0, 1) // wysokosc 0 = 256
pozycja.writeUInt8(0, 2) // paleta: brak
pozycja.writeUInt8(0, 3) // zarezerwowane
pozycja.writeUInt16LE(1, 4) // plaszczyzny
pozycja.writeUInt16LE(32, 6) // bity na piksel
pozycja.writeUInt32LE(png.length, 8)
pozycja.writeUInt32LE(naglowek.length + pozycja.length, 12)

await writeFile(path.join(KATALOG, 'ikona.ico'), Buffer.concat([naglowek, pozycja, png]))
console.log('build/ikona.ico:', naglowek.length + pozycja.length + png.length, 'bajtow')
