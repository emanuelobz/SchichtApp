# SchichtApp V3 – finale Monatsversion

## Wechsel von V2
1. V2 im Terminal mit `Ctrl + C` stoppen.
2. Diesen Ordner in VS Code öffnen.
3. Die funktionierende `.env.local` aus V2 in diesen Ordner kopieren. Die URL muss auf `.supabase.co` enden, ohne `/rest/v1/`.
4. In Supabase → SQL Editor den kompletten Inhalt von `supabase/v3-migration.sql` ausführen.
5. Im Terminal: `npm install`
6. Danach: `npm run dev`
7. `http://localhost:3000` öffnen.

## Was V3 kann
### Für Mama
- Kundensuche und automatisch häufig genutzte Kunden oben
- Datum per Kalender oder Schnellwahl
- große Stundenbuttons plus freie Stundenzahl
- optionale Notiz
- Zukunftsdatum-Warnung
- doppelte Einträge werden verhindert
- letzte 30 Einträge ansehen, bearbeiten und löschen
- Handy- und Dark-Mode-optimiert

### Für Emanuel
- Monatsübersicht mit Terminen, Stunden und Gesamtbetrag
- Monatswechsel lädt Daten direkt aus Supabase
- Copy-Paste exakt in 8 Numbers-Spalten, standardmäßig ohne Überschrift
- CSV und optionaler Export mit Überschrift
- Sicherheitswarnung und Export-Sperre bei mehr als 5 Terminen pro Kunde, damit keine Stunden verloren gehen
- Einträge ergänzen, bearbeiten und löschen
- Kunden anlegen, Preis ändern und deaktivieren

## Wichtig für Numbers
Der blaue Button `Für Numbers kopieren` kopiert nur die Datenzeilen in dieser Reihenfolge:
Name | Leistungsdatum | Einzelpreis | 1. Stunden | 2. Stunden | 3. Stunden | 4. Stunden | 5. Stunden

In Numbers zuerst die erste leere Zelle in der Spalte `Name` anklicken und dann `Cmd + V`.

## Online stellen
Für die Nutzung auf zwei Geräten muss die App danach noch bei Vercel veröffentlicht werden. Lokal funktioniert sie nur, solange der Mac und `npm run dev` laufen.
