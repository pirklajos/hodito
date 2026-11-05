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

## Műszaki felépítés

A Node HTTP szerver a hiteles játékállapotot 250 ms-os lépésekben számolja. A kliensek HTTP parancsokat küldenek, a szerver SSE kapcsolaton továbbítja az állapotot. A Canvas kliens rajzolja a térképet. Nem WebSocketet használ: ehhez a kis prototípushoz nincs szükség külső függőségre.

A játékost véletlen titkos token azonosítja; ez a böngésző localStorage tárában marad, más játékos nem kapja meg. Ugyanabban a böngészőprofilban frissítve visszatérhetsz. Külön játékos teszteléséhez használj inkognitóablakot vagy másik böngészőt.

## Tesztek

```sh
npm test
```

## A prototípus korlátai és következő lépések

A szobák memóriában élnek: szerverújraindításkor megszűnnek, 6 óra után automatikusan lejárnak. A gazda szerepe nem kerül át másra. A meghívólink a váróban enged új játékost belépni; folyamatban lévő csatába csak a korábbi résztvevő kapcsolódhat vissza. Egy szerverpéldányt használj. A botok egyszerű szomszédtámadók, építkezés nélkül.

A térkép generált, a tenger nem járható, ezért elszigetelt földdarabok elérhetetlenek lehetnek. Következő kör: összefüggő térképek és kikötő/hajózás, gazdaátadás, visszavágó, csapatok, szövetségek, időlimit és tartós meccsmentés. Telefonon kattintható, nagyítás és térképmozgatás még nincs. A kezdeti állapotküldés teljes pillanatképet küld, ezért nagyobb létszám előtt mérés és deltafrissítés szükséges.
