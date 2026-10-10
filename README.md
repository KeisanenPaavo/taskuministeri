# Suomen talous

Verkkosivu, joka näyttää Suomen julkisen talouden tulot ja menot. Sivulla on myös simulaattori, jolla voi kokeilla, miten talouskasvu, korot, verot ja menot vaikuttavat alijäämään ja velkaan seuraavan kymmenen vuoden aikana.

## Käynnistys

```bash
npm install
npm run dev
```

## Datan päivitys

Data haetaan Tilastokeskuksen StatFin-rajapinnasta (PxWeb, ei vaadi avainta) ja tallennetaan tiedostoon `public/data/finance.json`. Sivu on staattinen eikä tee kutsuja rajapintaan ajon aikana.

```bash
npm run fetch-data
```

| Taulu | Sisältö |
|---|---|
| `ntp/15ah` | Julkisyhteisöjen tulot ja menot (yhteensä, korot, etuudet) |
| `ntp/15aj` | Verot ja veronluonteiset maksut verolajeittain |
| `jmete/12a6` | Julkisyhteisöjen menot tehtävittäin (COFOG) |
| `jali/122g` | EDP-alijäämä ja -velka 1975– |
| `ntp/15a9` | BKT ja palkkasumma |

## Simulaattorin malli

Malli ([src/model.ts](src/model.ts)) on tarkoituksella yksinkertainen ja läpinäkyvä:

- Verotulot kasvavat nimellisen BKT:n mukana.
- Menot (pl. korot) kasvavat inflaation ja luontaisen menokasvun verran (oletus 1,2 % vuodessa). Ne eivät seuraa talouskasvua.
- Velasta hinnoitellaan uudelleen 18,5 % vuodessa (Valtiokonttori: uudelleenhinnoitteluaika 5,39 v), joten korkomuutos näkyy korkomenoissa viiveellä.
- Veromuutosten tuotot on kalibroitu VM:n vaikutusarvioihin (tuloveroasteikko: VM 2023, ALV: HE 61/2024, yhteisövero: VM 2026). Käyttäytymisvaikutus vie osan staattisesta tuotosta.

Kaikki kertoimet lähteineen ovat `COEFFICIENTS`-listassa tiedostossa `src/model.ts`, ja ne näytetään myös sivun alalaidassa. Omat arviot on merkitty erikseen.

Rajoitukset: malli ei huomioi finanssipolitiikan kerroinvaikutuksia, työllisyysvaikutuksia eikä suhdannevaihtelua.

## Rakentaminen

```bash
npm run build   # tuottaa dist/-kansion, jonka voi julkaista mille tahansa staattiselle palvelimelle
```
