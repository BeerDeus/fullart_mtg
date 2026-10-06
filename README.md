# Classeur Full Art

Site (PWA React/Vite) qui répertorie tous les terrains full art de Magic, avec suivi de collection et n° de page du classeur.
Données et images : API Scryfall (récupérées par le navigateur, mises en cache 7 jours). Sauvegarde : Firestore, projet `m2s-mtg`, connexion Google.

## Mise en ligne (site statique sur Hostinger)

1. **Règles Firestore** : Firebase Console > Firestore > Règles > coller le contenu de `firestore.rules` (= tes règles actuelles + un bloc `users/{uid}/binder/lands`) > Publier.
2. **Domaine autorisé** : Firebase Console > Authentication > Paramètres > Domaines autorisés > ajouter le sous-domaine (ex `lands.m2s-photo.fr`). Sans ça, la connexion Google échoue (`auth/unauthorized-domain`).
3. **Hostinger** : créer le sous-domaine, activer le SSL, puis envoyer le **contenu** de `dist/` à la racine du sous-domaine (`public_html`). Pas de Node.js nécessaire.
4. **Prix CardTrader (optionnel)** : copier `cardtrader-config.example.php` en `cardtrader-config.php` **au-dessus** de `public_html` (ex `domains/<domaine>/cardtrader-config.php`), y coller le token (CardTrader > Paramètres > API). `dist/api/cardtrader.php` part avec le reste de `dist/`. Sans config, les prix sont simplement masqués.
5. Ouvrir le site, se connecter. Sur Android : menu du navigateur > Installer l'application.

## Dev

```
npm install
npm run dev      # http://localhost:5173 (localhost est autorisé d'office par Firebase Auth)
npm test         # tests de la logique (tri, filtres, stats)
npm run build    # génère dist/
```

`dist/` est versionné : après chaque modif, `npm run build` puis commit, pour avoir toujours le contenu à envoyer sur Hostinger.

## Structure

- `src/main.jsx` : point d'entrée React
- `src/App.jsx` : app (auth, chargement, filtres, lightbox)
- `src/SetSection.jsx` : bloc d'une extension, tuile carte, lien Cardmarket
- `src/lib.js` : logique pure (tri, filtres, stats, CSV, URL Cardmarket), testée dans `tests/`
- `src/ExportDialog.jsx` : export des manquantes pour une liste d'envies Cardmarket
- `src/cardtrader.js` : appel du proxy prix CardTrader
- `public/api/cardtrader.php` : proxy PHP CardTrader
- `src/scryfall.js` : récupération + cache du catalogue Scryfall
- `src/firebase.js` : config Firebase
- `src/styles.css` : styles
- `public/` : icônes / favicon copiés tels quels dans `dist/`

## Données

- Lien Cardmarket : page produit via `cardmarket_id` Scryfall ; à défaut, recherche « CODE numéro » (ex `FRA 386`).

- Requête Scryfall : `t:basic is:full game:paper` (terrains de base full art existant en papier : Plains/Island/Swamp/Mountain/Forest, neige, Wastes, promos, Secret Lair…), une ligne par impression (`unique=prints`).
- Les impressions « foil only » (sans version non-foil) sont écartées côté client (`keepCard` dans `src/lib.js`).
- Une case par impression = par n° de collector. Les variantes d'un même set (ex 250 / 250a) sont des cartes distinctes.
- « Actualiser » recharge le catalogue (sinon rechargé automatiquement après 7 jours). Si Scryfall est injoignable, le dernier cache est utilisé.
- Un terrain full art absent de la liste = Scryfall ne le marque pas `full_art`.

## Prix CardTrader Zero

- `public/api/cardtrader.php` (proxy PHP, le token ne quitte jamais le serveur) : `GET /api/cardtrader.php?set=<code>` → prix min par carte (id Scryfall) et par état, uniquement vendeurs CardTrader Zero, hors foil / gradées / signées / altérées. Cache 6 h dans `cardtrader-cache/` à côté de la config.
- Correspondance exacte via le `scryfall_id` des blueprints CardTrader ; extension retrouvée par son code.
- État minimum selon l'âge de l'extension (`CT_AGE_RULES` dans `src/lib.js`) : < 4 ans NM, 4–10 ans Slightly Played (≈ Excellent), ≥ 10 ans Moderately Played (≈ Good / Light Played).
- Prix chargés à l'ouverture d'une extension ; total des manquantes hors frais de port du colis Zero.

## Export Cardmarket

- Bouton « Manquantes → Cardmarket » (extensions affichées, selon les filtres) et bouton par extension ouverte.
- Formats : `1 Island (FRA) 386`, `1 Island (Reality Fracture)`, nom seul regroupé, ou liens Cardmarket par carte.
- Cardmarket : Wants › créer une liste › ajouter une liste de cartes › coller, puis Assistant d'achat (optimise vendeurs + frais de port).

## Modèle Firestore

`users/{uid}/binder/lands` = `{ owned: { <idScryfall>: true }, pages: { <codeSet>: "12" }, updatedAt }`
