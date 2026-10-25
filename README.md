# Budget

En webbapp för månadsbudget, byggd på samma upplägg som `Budgetkalkyl_mall.xlsx`: inkomster, fasta och rörliga
utgifter samt sparande, med budgeterat och faktiskt per rad.

- **Smidig inmatning:** skriv belopp direkt eller som uttryck, t.ex. `6170+1005+2286`. Enter hoppar till nästa fält.
- **Kommer ihåg förra månaden:** en ny månad skapas som en kopia av den föregående, och varje rad visar historiken.
- **Följ upp löpande:** logga köp med +-knappen så summeras de under Faktiskt, eller skriv in en slutsumma.
  "Resten enligt budget" fyller i fasta räkningar med ett klick.
- **Lön till lön:** budgetmånaden börjar som standard den 25:e (går att ändra under Inställningar).
- **Flera personer + hushållsvy** som summerar allt automatiskt.
- **Analys:** utgifter mot budget, över/underskott, fördelning, avvikelse per kategori, trender och årsöversikt.
- **Import från Excel** (läses lokalt i webbläsaren) samt export/import av backup som JSON.

## Kom igång

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

## Publicera på GitHub Pages

1. Skapa ett repo på GitHub och pusha till `main`.
2. Under **Settings → Pages**, välj **Source: GitHub Actions**.
3. Workflowen i `.github/workflows/deploy.yml` bygger och publicerar vid varje push till `main`.

Bygget använder relativa sökvägar (`base: './'`), så reponamnet spelar ingen roll.

> Excel-filer och backupfiler (`*.xlsx`, `budget-backup*.json`) är ignorerade i `.gitignore` så att er ekonomi inte
> hamnar i ett publikt repo.

## Data och framtida Firebase

All data sparas i dag i webbläsarens `localStorage` och finns alltså bara på den enheten. Lagringen går genom ett
`StorageAdapter`-gränssnitt (`src/store/storage.ts`) med två metoder, `load()` och `save()`. För molnsynk och separata
användare:

1. Lägg till Firebase Auth + Firestore.
2. Skriv en `FirestoreAdapter` som implementerar samma gränssnitt (t.ex. ett dokument per hushåll).
3. Byt adapter i `src/main.tsx`.

Datamodellen (`src/types.ts`) är redan uppdelad på personer, månader och köp, så den kan delas upp i
Firestore-dokument utan att vyerna behöver ändras.

## Struktur

```
src/
  lib/        uttrycksparser, perioder, beräkningar, formatering
  store/      state (reducer), lagring, UI-state
  views/      Budget, Köp, Analys, Inställningar
  components/ inmatningsfält, rader, snabbregistrering, diagramdelar
  import/     Excel-import (.xlsx tolkas i webbläsaren)
```
