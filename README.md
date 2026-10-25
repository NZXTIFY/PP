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

## Konton, hushåll och synk (Firebase)

Utan Firebase-konfiguration körs appen helt lokalt (`localStorage`). Med konfiguration:

- Man skapar ett eget konto med **e-post och lösenord**.
- Den som skapar ett hushåll blir **ägare** och bjuder in de andra med en **kod eller länk** (gäller 7 dagar).
- Alla i hushållet ser och ändrar samma budgetar, med realtidssynk mellan telefon och dator. Det fungerar även offline.
- Ägaren kan ta bort medlemmar och återkalla inbjudningar, och medlemmar kan lämna själva.
- Vid första hushållet kan budgetar som redan finns lokalt på enheten följa med upp.

### Sätta upp Firebase

1. Skapa ett projekt på [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method:** aktivera **E-post/lösenord**.
3. **Authentication → Settings → Authorized domains:** lägg till `nzxtify.github.io`.
4. **Firestore Database:** skapa en databas (t.ex. region `eur3`), i produktionsläge.
5. **Firestore → Regler:** klistra in innehållet i [`firestore.rules`](firestore.rules) och publicera.
6. **Project settings → Your apps:** lägg till en webbapp och kopiera `firebaseConfig` till
   [`src/cloud/config.ts`](src/cloud/config.ts).

Konfigurationen är inte hemlig och kan ligga i repot – det är säkerhetsreglerna som skyddar datan.

### Datamodell i Firestore

```
users/{uid}                              namn, e-post, householdId
invites/{kod}                            householdId, utgångsdatum
households/{hid}                         namn, ownerId, personer, inställningar
households/{hid}/members/{uid}           roll (owner | member)
households/{hid}/invites/{kod}           ägarens lista över aktiva koder
households/{hid}/months/{personId:YYYY-MM}
households/{hid}/transactions/{id}
```

All läsning och skrivning går genom `StorageAdapter` (`src/store/storage.ts`). `FirestoreAdapter`
(`src/cloud/firestoreAdapter.ts`) skriver bara de dokument som ändrats och tar emot ändringar från andra enheter i
realtid.

## Struktur

```
src/
  lib/        uttrycksparser, perioder, beräkningar, formatering
  store/      state (reducer), lagring, UI-state
  views/      Budget, Köp, Analys, Inställningar
  components/ inmatningsfält, rader, snabbregistrering, diagramdelar
  import/     Excel-import (.xlsx tolkas i webbläsaren)
  cloud/      Firebase: inloggning, hushåll, inbjudningar, Firestore-lagring
```
