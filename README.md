<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Projet97 — App de protection (Cloudflare)

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Mode local (sans API payante)

L'application peut fonctionner sans backend/DB :

- aucun endpoint externe n'est requis pour afficher l'interface ;
- le compteur communautaire est calculé localement dans l'app ;
- aucun paramétrage `DATABASE_URL` n'est nécessaire pour l'usage local.

## Setup Cloudflare uniquement (DB + domaine)

### 1) Endpoint API utilisé
- Endpoint principal: `/api/presence` (Cloudflare Pages Function).

### 2) Base de données
- Crée une base **Cloudflare D1**.
- Dans Pages > Settings > Functions > Bindings, ajoute un binding D1 nommé **`DB`**.
- Si le binding `DB` est absent, l'API renvoie `CLOUD_DATABASE_UNAVAILABLE`.

### 3) Domaine personnalisé (pour éviter `*.workers.dev`)
Dans le dashboard Cloudflare:
1. Pages > ton projet > **Custom domains**.
2. Clique **Set up a custom domain**.
3. Ajoute un domaine type `app.projet97.com`.
4. Mets à jour DNS chez ton registrar (CNAME/A selon l'assistant Cloudflare).

### 4) URL API externe optionnelle
Si tu veux forcer une API distante (ex: domaine custom), crée `.env`:
`VITE_PRESENCE_BASE_URL=https://api.projet97.com`


## Checklist exacte pour que ça marche
Donne-moi ces 4 infos et je te fais la config finale:
1. ton **nom de domaine** final (ex: `app.projet97.com`),
2. si tu veux API sur le même domaine ou sous-domaine (ex: `api.projet97.com`),
3. le **database_id D1** Cloudflare,
4. confirmation que le binding D1 s'appelle bien `DB`.

Test rapide après déploiement:
- Ouvre `https://<ton-domaine>/api/presence`.
- Tu dois voir `{"ok":true,...}` et `dbBinding:true`.


### Création DB rapide (CLI)
```bash
wrangler d1 create db_projet97
# copie le database_id retourné puis mets-le dans wrangler.toml
wrangler d1 execute db_projet97 --remote --file=./migrations/0001_init.sql --config=wrangler.toml
```


### Déploiement Worker (commande CI)
```bash
npm run build
npm run deploy:worker
```
> `wrangler.toml` inclut `main = "src/worker.ts"` et `[assets]` avec `not_found_handling = "single-page-application"` pour les routes React SPA.


### Si Cloudflare dit "Missing entry-point"
Utilise une commande explicite (déjà ajoutée dans `package.json`) :
```bash
npm run build
npm run deploy:worker
```
Cette commande utilise `wrangler deploy` (recommandé) et lit la config complète de `wrangler.toml`.

### Init D1 (tables)
```bash
npm run d1:init
```
Puis vérifie:
```bash
curl https://<ton-domaine>/api/presence
```
Tu dois voir `dbBinding: true`, `schemaReady: true`, et `tables` avec `presence` + `guardian_alerts`.
