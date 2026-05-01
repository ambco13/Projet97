<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/157ltf4KM_wA2ZfBowJDiYBy9ykMAoRL_

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key.
3. Run the app:
   `npm run dev`

## Mode local (sans API payante)

L'application peut fonctionner sans backend/DB :

- aucun endpoint externe n'est requis pour afficher l'interface ;
- le compteur communautaire est calculé localement dans l'app ;
- aucun paramétrage `DATABASE_URL` n'est nécessaire pour l'usage local.

## Migration Cloudflare (DB + domaine)

### 1) Endpoint API utilisé
- Endpoint principal: `/api/presence` (Cloudflare Pages Function).
- Fallback legacy conservé: `/.netlify/functions/presence`.

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
