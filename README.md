# Idealtherm

Az idealtherm.hu weboldal: klímák, hőszivattyúk és szellőztetéstechnika.

## Felépítés

- `index.html` – az összes oldal (Kezdőlap, Klímák, Hőszivattyúk, Szellőztetéstechnika, Kapcsolat, Kosár, dokumentumok)
- `css/stilus.css` – a kinézet
- `js/oldal.js` – menü, oldalváltás, süti ablak, termosztát
- `kepek/` – logó
- `fonts/` – Plus Jakarta Sans betűtípus (OFL licenc)

## Elérhetőségek

A telefonszám, az e-mail cím és a cím a `js/oldal.js` elején, a `CEG` résznél adható meg. Amíg üres, az oldalon „hamarosan” látszik.

## Kapcsolat űrlap

Az űrlap a `/api/uzenet` címre küld, ezt a `szerver/uzenet.js` fogadja (Node.js, külső csomag nélkül), és a RackHostos postafiókból (smtp.rackhost.hu, 465-ös port) továbbítja a kapcsolat@idealtherm.hu címre. A levélre válaszolva közvetlenül az érdeklődőnek lehet írni.

A postafiók jelszavát a VPS-en ez kéri be (rejtve), és küld egy próbalevelet:

```
bash /opt/idealtherm/email-beallitas.sh
```

A jelszó a `/var/lib/idealtherm/uzenet.env` fájlba kerül, a GitHubra soha.

## Sütik

A látogató döntése a böngészőben, `idealtherm-suti` néven tárolódik. Később egy statisztika vagy hirdetés kód az `idealtherm:suti` eseményre, illetve a `window.idealthermSuti` értékre figyelve indulhat, csak ha a látogató engedélyezte.

## Telepítés a VPS-re

Rootként, egyszer:

```
curl -fsSL https://raw.githubusercontent.com/ingyen-200-koveto/Idealtherm/main/telepites.sh | bash
```

Utána a szerver 5 percenként magától frissül a GitHubról. Azonnal: `idealtherm-frissites --most`
