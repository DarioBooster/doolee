# Doolee — Générateur de badges événementiels

**Doolee** est une application web légère, rapide et confidentielle permettant de générer des badges événementiels personnalisés (*« J’y serai »*, *« J’y étais »*, *« Je participe »*, etc.) à partir de templates graphiques réutilisables.

---

## 1. Architecture technique

- **Frontend** : React 19, TypeScript, Tailwind CSS v4, HTML5 Canvas 2D, File API, Blob API, JSZip.
- **Backend** : Node.js 22+ (Express) exposant uniquement l’API REST de gestion des templates (`/api/templates`).
- **Base de données & stockage** : SQLite (`node:sqlite`, schéma dans [`db/schema.sql`](db/schema.sql)) stockant uniquement les métadonnées des templates (`id`, `name`, `filename`, dimensions et coordonnées du cadre photo).
- **Confidentialité garantie** :
  - Aucune photographie importée n’est envoyée vers le serveur.
  - Aucune photographie n’est enregistrée dans SQLite ni sur disque serveur.
  - Toutes les manipulations (validation binaire, miniatures, recadrage, zoom, rendu haute résolution, création d’archive ZIP) s’exécutent exclusivement dans la mémoire temporaire du navigateur (`URL.createObjectURL` + libération immédiate via `URL.revokeObjectURL`).

---

## 2. Structure du projet

```text
├── api/
│   └── index.ts              # Point d'entrée Serverless Vercel pour l'API Express
├── db/
│   └── schema.sql            # Schéma SQLite officiel (templates uniquement)
├── public/
│   └── assets/aistudio/      # Logo officiel Doolee et ressources statiques
├── server/
│   ├── app.ts                # API Express (/api/templates, validation binaire, sécurité)
│   ├── db.ts                 # Couche d'accès SQLite et modèles de départ
│   ├── imageMeta.ts          # Inspection d'octets magiques PNG/JPEG/WebP & modèles initiaux
│   └── types.ts              # Types partagés backend
├── src/
│   ├── components/           # Vues Accueil, Templates, Studio, Résultats, Modale template
│   ├── lib/
│   │   ├── api.ts            # Client REST pour /api/templates
│   │   ├── fileValidation.ts # Vérification octets magiques + décodage image navigateur
│   │   ├── imageEngine.ts    # Détection de zone transparente, moteur Canvas 2D & génération batch
│   │   └── zipExport.ts      # Création d'archives ZIP avec JSZip
│   ├── types/doolee.ts       # Types TypeScript frontend
│   └── App.tsx               # Orchestration de session (règle stricte : 1 template / session)
├── tests/
│   └── doolee.test.ts        # Suite de tests automatisés Vitest
├── server.ts                 # Serveur Node.js complet (dev Vite + prod dist/)
└── vercel.json               # Configuration de build et routage Vercel
```

---

## 3. Installation et lancement en local

### Prérequis
- **Node.js 22.x** (`>= 22.14.0`, requis pour `node:sqlite`)
- npm

### Installation & développement
```bash
npm install
npm run dev
```
L’application est accessible sur `http://localhost:3000`.

### Compilation & lancement en production (serveur Node persistant)
```bash
npm run build
NODE_ENV=production npm start
```

### Tests et vérifications
```bash
npm test
npm run lint
```

---

## 4. Exportation sur GitHub et déploiement

### Étape 1 : Exporter vers GitHub
```bash
git init
git add .
git commit -m "Initial commit - Doolee"
git branch -M main
git remote add origin https://github.com/<votre-compte>/<votre-depot>.git
git push -u origin main
```

### Étape 2A : Déployer sur Vercel
Le dépôt inclut [`vercel.json`](vercel.json), [`api/index.ts`](api/index.ts) et `"engines": { "node": "22.x" }` dans [`package.json`](package.json).
1. Connectez votre dépôt GitHub sur Vercel.
2. Laissez les paramètres par défaut détectés depuis `vercel.json` (`Build Command: npm run build`, `Output Directory: dist`).
3. Déployez.

> **Important concernant Vercel (architecture Serverless)** :
> - Vercel ne dispose pas de système de fichiers persistant entre les redémarrages à froid (*cold starts*) : `api/index.ts` utilise `/tmp/doolee-data` en lecture/écriture temporaire. Les 3 templates de départ sont toujours disponibles, mais les templates personnalisés importés peuvent être réinitialisés lors d’un arrêt à froid ou d’un redéploiement.
> - Les fonctions Serverless Vercel limitent la taille des requêtes HTTP entrantes à **4,5 Mo** (veillez à importer des fichiers templates inférieurs à 4 Mo sur Vercel).
> - Les **photographies** des utilisateurs ne sont pas concernées par cette limite car elles ne sont jamais envoyées au serveur.

### Étape 2B : Hébergement recommandé pour une persistance SQLite permanente
Pour conserver indéfiniment les templates importés dans `data/doolee.sqlite` et `data/templates/` conformément au cahier des charges, privilégiez un hébergeur Node.js avec disque persistant (**Render** avec *Persistent Disk*, **Railway** avec *Volume*, **Fly.io** avec *Volume*, ou un **VPS / Docker**) :
- Build : `npm install && npm run build`
- Start : `NODE_ENV=production npm start`
- Dossier persistant à monter : `/app/data` (ou `./data`).
