# Hódító

Magyar nyelvű, böngészős, valós idejű területfoglaló játék privát meghívólinkkel. Saját implementáció, OpenFrontból átvett kód és grafika nélkül.

## Indítás

Node.js 22 vagy újabb szükséges. Nincs telepítendő npm-függőség.

```sh
npm start
```

Nyisd meg: http://localhost:3000. Adj meg egy becenevet, hozz létre egy szobát, majd másold a meghívólinket egy másik böngészőbe vagy küldd el a barátaidnak. A gazda állítsa be a botok számát és indítsa a csatát. Legfeljebb 8 résztvevő lehet, botokkal együtt.

```sh
docker compose up -d --build
```

A barátoknak küldött linkben mindenki számára elérhető hostnév/IP kell; a localhost csak a saját gépre mutat. Internetes játékhoz tedd elérhetővé a szervert, éles használatnál HTTPS reverse proxy mögött. A proxy engedje a hosszú SSE kapcsolatot és kapcsolja ki a válaszbufferelést. A GitHub Pages önmagában nem futtatja a játékszervert.

## Szabályok

- A hadsereg és az arany automatikusan termelődik, a birtokolt terület alapján.
- Kattints egy olyan semleges területre vagy országra, amellyel közös szárazföldi határod van. A támadás ezen a közös határon terjeszkedik.
- A csúszkával a tartalék hadsereg 5–80%-át küldheted el. Több támadás egyszerre is futhat.
- Város: 100 arany, +300 katonai kapacitás és gyorsabb termelés.
- Erőd: 100 arany, erősebb helyi védelem. Építkezéshez válaszd az eszközt, majd kattints a saját területedre.
- A szárazföld 70%-ának megszerzése vagy az utolsó életben maradt birodalom győz.

## Irányítás

A térképen húzással mozoghatsz, egérgörgővel vagy a +/− gombokkal nagyíthatsz; a Teljes gomb visszaállítja a teljes térképet. Érintéses húzás is támogatott. Billentyűk: 1 támadás, 2 város, 3 erőd, +/− nagyítás, 0 visszaállítás; a fókuszált térképen nyilakkal mozoghatsz. Kapcsolatvesztéskor a műveletek szünetelnek.

Az ismételt támadási parancs ugyanazt a frontot erősíti: több csapatot küld, de nem sokszorozza a foglalás sebességét. Azonos térképből és azonos parancsokból a harc azonos eredményt számol.

## Műszaki felépítés

A Node HTTP szerver a hiteles játékállapotot 250 ms-os lépésekben számolja. A kliensek HTTP parancsokat küldenek, a szerver SSE kapcsolaton továbbítja az állapotot. A Canvas kliens rajzolja a térképet. Nem WebSocketet használ: ehhez a kis prototípushoz nincs szükség külső függőségre.

A játékost véletlen titkos token azonosítja; ez a böngésző localStorage tárában marad, más játékos nem kapja meg. A hitelesített eseményfolyam POST kéréssel és fetch-stream olvasással indul: a token a kérés törzsében utazik, nem az URL-ben. Egy játékosnak egy aktív kapcsolata lehet; ugyanazt a játékost másik lapon megnyitva a korábbi lap leáll, az új átveszi a kapcsolatot. Átmeneti hálózati hibánál automatikus újracsatlakozás történik, hibás vagy lejárt munkamenetnél a kliens visszatér a belépéshez. Ugyanabban a böngészőprofilban frissítve visszatérhetsz. Külön játékos teszteléséhez használj inkognitóablakot vagy másik böngészőt.

## Tesztek

```sh
npm test
```

A tesztcsomag a térképgenerálást, a harcot, a valódi HTTP/SSE kapcsolatot és a kliens transport modult ellenőrzi. A GUI tesztje minimális DOM-fixture-rel vizsgálja a képernyőváltásokat és a parancsokat; nem helyettesíti a tényleges böngészős vizuális, mobilos és érintéses próbát.

A feladatkörök és az integrálás leírása: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Reverse proxy példa

Meglévő HTTPS NGINX szerverblokkon belül, a saját hálózati elrendezésed szerinti upstream címmel:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 60s;
}
```

A Host fejléc megőrzése a same-origin ellenőrzéshez kell; az SSE szívverések életben tartják a kapcsolatot. Konténeres NGINX esetén a `127.0.0.1` helyett a Node szolgáltatás hálózati nevét használd.

## A prototípus korlátai és következő lépések

A szobák memóriában élnek: szerverújraindításkor megszűnnek, 6 óra után automatikusan lejárnak. A gazda szerepe nem kerül át másra. A meghívólink a váróban enged új játékost belépni; folyamatban lévő csatába csak a korábbi résztvevő kapcsolódhat vissza. Egy szerverpéldányt használj. A botok egyszerű szomszédtámadók, építkezés nélkül.

A generált térkép egy összefüggő szárazföldet tartalmaz, az induló területek mindenkinek 25 mezősek. A tenger még nem járható. Következő kör: kikötő/hajózás, gazdaátadás, visszavágó, csapatok, szövetségek, időlimit és tartós meccsmentés. A teljes állapotküldés miatt nagyobb létszám előtt mérés és deltafrissítés szükséges.
