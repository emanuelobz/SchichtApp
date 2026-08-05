# Test-Mailversand einrichten

Die App kann Rechnungen zunächst ausschließlich als Testmail an deine eigene, bei Resend verwendete E-Mail-Adresse senden.

## 1. Resend vorbereiten

1. Kostenloses Konto bei Resend erstellen.
2. Unter **API Keys** einen Schlüssel erstellen.
3. Die E-Mail-Adresse merken, mit der das Resend-Konto erstellt wurde.

Mit `onboarding@resend.dev` kann Resend nur an die zum Resend-Konto gehörende E-Mail-Adresse senden. Für echte Kunden wird später eine eigene verifizierte Domain benötigt.

## 2. Lokal in `.env.local`

```env
RESEND_API_KEY=re_dein_geheimer_key
RESEND_TEST_EMAIL=deine-resend-konto-email@example.com
```

Den API-Key niemals mit `NEXT_PUBLIC_` beginnen lassen und niemals nach GitHub hochladen.

Danach den Server neu starten:

```bash
npm run dev
```

## 3. Vercel

Im Vercel-Projekt unter **Settings → Environment Variables** dieselben beiden Variablen für Production und Preview ergänzen und anschließend neu deployen.

## 4. Test

1. Eine archivierte Rechnung öffnen.
2. **Testmail an mich senden** drücken.
3. Postfach und Spam-Ordner prüfen.
4. PDF-Inhalt, IBAN, Kundendaten, Betrag und Layout prüfen.

Testmails verändern den Rechnungsstatus bewusst nicht.
