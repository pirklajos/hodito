# Fejlesztési területek

A projekt három fő része külön fejleszthető, de a közös adatmodellt minden módosításkor egyeztetni kell.

| Terület | Fájlok | Feladat |
| --- | --- | --- |
| GUI | `public/index.html`, `public/style.css`, `public/app.js` | Képernyők, interakciók, Canvas megjelenítés, mobilos kezelés |
| Játékmenet | `game.js`, `test/gameplay.test.js` | Térkép, kezdés, harc, termelés, győzelem |
| Kommunikáció | `server.js`, `public/transport.js`, `test/communication.test.js` | HTTP parancsok, SSE pillanatképek, hitelesítés és kapcsolatéletciklus |

## Integrálás

1. Tartsd a játékszabályokat a motorban: a kliens csak parancsot kér, a szerver ellenőriz és módosít.
2. A játékos titkos tokenje nem kerülhet más játékos pillanatképébe vagy meghívólinkbe.
3. A hálózati kapcsolatok kezelése a transport modul feladata; a GUI állapotot és hibát kap tőle.
4. API-változásnál módosítsd a megfelelő integrációs teszteket és a dokumentációt is.
5. Futtasd az `npm test` parancsot, majd két elkülönített böngészőprofilból ellenőrizd a teljes szobalétrehozás–csatlakozás–indítás–támadás folyamatot.

A fejlesztési ág változásai pull requestben ellenőrizhetők. A tesztek sikere nem jelenti automatikusan a telepítést: a nyilvános játékhoz külön futó Node szerver szükséges.
