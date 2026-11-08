# Budget

En webbapp för månadsbudget, byggd på samma upplägg som `Budgetkalkyl_mall.xlsx`: inkomster, fasta och rörliga
utgifter samt sparande, med budgeterat och faktiskt per rad.

- **Smidig inmatning:** skriv belopp direkt eller som uttryck, t.ex. `6170+1005+2286`. Enter hoppar till nästa fält.
- **Kommer ihåg förra månaden:** en ny månad skapas som en kopia av den föregående, och varje rad visar historiken.
- **Följ upp löpande:** logga köp med +-knappen så summeras de under Faktiskt, eller skriv in en slutsumma. Tryck på
  ett loggat köp för att ändra det i samma meny.
  "Resten enligt budget" fyller i fasta räkningar med ett klick.
- **Lön till lön:** budgetmånaden börjar som standard den 25:e (går att ändra under Inställningar).
- **Flera personer + hushållsvy** som summerar allt automatiskt. Köp kan delas mellan personerna (50/50, 40/60 …).
- **Apple Pay:** köp man blippar med iPhone kan skickas till appen automatiskt via en genväg (se nedan).
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
households/{hid}                         namn, ownerId, personer, inställningar, kända handlare
households/{hid}/members/{uid}           roll (owner | member)
households/{hid}/invites/{kod}           ägarens lista över aktiva koder
households/{hid}/months/{personId:YYYY-MM}
households/{hid}/transactions/{id}
households/{hid}/inboxKeys/{nyckel}      personId (eller __household__), skapad av
households/{hid}/inbox/{nyckel}/items/{id}   { kop: "Belopp;Handlare;Datum" }
```

All läsning och skrivning går genom `StorageAdapter` (`src/store/storage.ts`). `FirestoreAdapter`
(`src/cloud/firestoreAdapter.ts`) skriver bara de dokument som ändrats och tar emot ändringar från andra enheter i
realtid.

## Apple Pay via Genvägar

En automation i Genvägar på iPhone (utlösaren **Transaktion**) skickar varje Apple Pay-köp till hushållets inkorg med
Firestores REST-API. Genvägen är inte inloggad: adressen innehåller en lång slumpad nyckel och reglerna tillåter bara
att nya köp läggs till för en nyckel som finns – ingen kan läsa något med den.

- Adresser skapas under **Inställningar → Apple Pay**: en per person för de egna korten och en för hushållets
  gemensamma kort. Där finns också steg-för-steg-guiden för genvägen och felsökning.
- Kortet (adressen) avgör vems köpet är. Köp på det gemensamma kortet delas efter inkomst, lika eller en egen
  fördelning (inställning i hushållet, `settings.householdSplit`).
- Köpen hamnar under **Att kategorisera** på sidan Köp. Första gången man väljer kategori för en handlare minns appen
  den, och nästa köp där bokförs automatiskt (går att stänga av). Köp i utländsk valuta väntar alltid på en
  bekräftelse.
- Köp bokförs med fasta id:n (`w-{id}`), så samma köp kan inte hamna dubbelt även om två enheter är öppna samtidigt.
- Genvägen skickar fältet `kop` som text: `Belopp;Handlare;Datum`, t.ex.
  `129,00 kr;ICA Nära;2026-10-25T14:03:00+02:00`. Beloppet och datumet tolkas i appen (`src/lib/inbox.ts`).

## Struktur

```
src/
  lib/        uttrycksparser, perioder, beräkningar, formatering
  store/      state (reducer), lagring, UI-state
  views/      Budget, Köp, Analys, Inställningar
  components/ inmatningsfält, rader, snabbregistrering, diagramdelar
  import/     Excel-import (.xlsx tolkas i webbläsaren)
  cloud/      Firebase: inloggning, hushåll, inbjudningar, Firestore-lagring, Apple Pay-inkorg
```
