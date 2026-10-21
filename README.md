# HotLap

Réseau social pour passionnés d'automobile : enregistre tes drives (tracé GPS, stats, G-force, médias),
retrouve-les sur ton profil et partage-les avec tes amis, ta région ou le monde.

> Cadrage complet (vision, écrans, périmètre MVP, modèle de données, roadmap) : doc « HotLap — Cadrage du projet ».

## Stack

| Couche | Choix |
| --- | --- |
| App mobile | Expo SDK 57 (React Native 0.86), TypeScript, Expo Router |
| Backend | Supabase : Auth, Postgres + PostGIS, Storage, Row Level Security |
| Carte | react-native-maps (Apple Maps sur iOS, Google Maps sur Android) |
| GPS | expo-location + expo-task-manager (enregistrement écran verrouillé) |
| Capteurs | expo-sensors (G-force) |

## Démarrer

```bash
npm install
cp .env.example .env.local       # puis remplir les clés (facultatif, voir mode démo)
npx expo run:android             # ou npx expo run:ios (Mac + Xcode)
```

L'app utilise du GPS en arrière-plan et des cartes natives : **Expo Go ne suffit pas**, il faut un
*development build* (`npx expo run:*` en local, ou `npx eas-cli@latest build --profile development` dans le cloud,
sans Mac pour iOS).

**Mode démo.** Tant que `.env.local` n'a pas de clés Supabase, l'app démarre en mode démo : n'importe quel
identifiant permet de se connecter, les écrans sont alimentés par `src/data/mock.ts` et l'enregistrement
d'un drive fonctionne sans être sauvegardé en ligne.

## Tester sur un téléphone (EAS Build)

Le GPS en arrière-plan et les cartes natives demandent une app de développement (*development build*) :
Expo Go ne suffit pas. Elle est compilée dans le cloud par EAS (gratuit), sans Android Studio ni Xcode.

```bash
npx eas-cli@latest login                 # compte Expo
npx eas-cli@latest init                  # crée le projet EAS, copier l'ID dans EAS_PROJECT_ID (app.config.ts)
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co --environment development --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <clé anon> --environment development --visibility sensitive
npm run build:dev:android                # ~15 min, donne un lien d'installation (APK)
npm start                                # sur le PC ; l'app installée se connecte au serveur de dev
```

### Trois versions installables côte à côte

| Profil EAS | App | Identifiant | Pour qui | Outils de test |
| --- | --- | --- | --- | --- |
| `development` | HotLap Dev | `com.hotlap.app.dev` | développement, se connecte à `npm start` | oui |
| `preview` | HotLap Test | `com.hotlap.app.test` | tests autonomes (sans PC) | oui (drive simulé) |
| `beta` | HotLap | `com.hotlap.app` | testeurs (amis) | non |

```bash
npm run build:dev:android     # HotLap Dev
npm run build:test:android    # HotLap Test
npm run build:beta:android    # HotLap (testeurs) : partager le lien d'installation donné à la fin
```

Chaque identifiant a sa propre clé de signature EAS : son empreinte SHA-1 doit être ajoutée à la clé
Google Maps (Google Cloud > Identifiants > clé > Restrictions Android), sinon la carte reste grise.
Les drives simulés sont marqués `drives.is_simulated` (titre « Test · … ») ; ils peuvent être publics pendant
la phase de test et seront supprimés avant l'ouverture : `delete from drives where is_simulated`.

### Droits de la base (Data API)

Depuis le 30 octobre 2026, Supabase n'ouvre plus automatiquement les nouvelles tables à l'API. **Toute
nouvelle table reçoit ses `GRANT` dans la migration qui la crée** (voir `0010_explicit_grants.sql`) :
`authenticated` pour l'app (filtré par la RLS), `service_role` pour l'administration, rien pour `anon`.

Les variables de `.env.local` ne partent pas sur EAS : celles de l'app compilée viennent de `eas env`.
L'app de développement ne se recompile que si une dépendance native change ; le reste se recharge à chaud.

## Brancher Supabase

1. Créer un projet sur supabase.com, récupérer l'URL et la clé `anon` (Project Settings > API) dans `.env.local`.
2. Appliquer le schéma : coller dans l'ordre les fichiers de `supabase/migrations/` (0001, 0002…) puis `supabase/seed.sql` dans le SQL Editor,
   ou `npx supabase link` puis `npx supabase db push`.
3. Générer les types : `npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts`.

## Arborescence

```
src/
  app/                    écrans (Expo Router : chaque fichier = une route)
    _layout.tsx           polices, AuthProvider, aiguillage auth / onboarding / app
    (auth)/index.tsx      Login + Register
    (auth)/verify-email   saisie du code reçu par email
    onboarding/index.tsx  Account Setup : identité, localisation, véhicule, GPS (40 → 100 %)
    (tabs)/               Discover, Community, Record (+), Map, Profile
    drive/[id].tsx        détail d'un drive (véhicule, visibilité, suppression pour le propriétaire)
    drive/finish.tsx      récap de fin de drive : véhicule, titre, photos, visibilité
    edit-profile.tsx      modifier son profil (photo, bio, ville ; nom et téléphone privés)
    garage/               garage : véhicule favori, ajout, modification, suppression
    crews/                crews : mes crews, recherche, création, détail et gestion des membres
    user/[id].tsx         profil public d'un autre conducteur
  components/             TabBar, DriveCard, GForceCard, Picker, ui/ (Button, Card, TextField…)
  features/
    auth/                 AuthProvider (session, profil, garage et véhicule favori)
    garage/               formulaire véhicule (catalogue ou saisie manuelle)
    crews/                accès aux crews (fonctions SQL)
    recording/            tâche GPS d'arrière-plan, filtre GPS, stats, G-force, autorisation d'enregistrer
    drives/               sauvegarde d'un drive dans Supabase
    onboarding/           étapes de l'onboarding et validation (âge minimum dans src/config.ts)
    scoring/              score d'un drive : distance, sinuosité, dénivelé, chrono si autorisé
  lib/                    client Supabase, types de la base
  theme/                  couleurs, typo, espacements, style de carte
  data/                   données factices et catalogue véhicules
supabase/
  migrations/0001_init.sql  15 tables, RLS, fil, autour de moi, profils publics, règles d'âge, catalogue dédoublonné
  migrations/0002…0006      confidentialité des tracés, photos, fil World, modération, durcissement
  migrations/0007…          garage, crews, aperçu des tracés du fil, photo de profil, essais de connexion
  functions/sign-in/        Edge Function : connexion par email ou pseudo (déployée sans vérification JWT)
  seed.sql                  catalogue marques et modèles
scripts/
  score-scenarios.ts        compare les formules de score (npm run score:check)
  import-wikidata.ts        importe le catalogue depuis Wikidata (npm run catalog:import -- --dry-run)
  catalog.test.ts           tests hors ligne du dédoublonnage (npm run catalog:test)
```

### Réglages Supabase nécessaires

- Auth > Providers > Email : « Confirm email » activé ; le modèle « Confirm signup » doit contenir `{{ .Token }}`
  (l'app demande un code à 6 chiffres, pas un lien).
- Catalogue : `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local` pour l'import Wikidata (jamais dans l'app),
  puis traiter la vue `catalog_review_queue` (valider, ou fusionner avec `merge_vehicle_model`).
- Table `country_rules` : une ligne par pays de lancement, âges vérifiés légalement (sinon défaut 18 ans).

## Sécurité

Dépôt GitHub privé `Desperoma/hotlap-app`. Dependabot, la CI et les scans gitleaks / Semgrep sont décrits
dans [SECURITY.md](SECURITY.md), avec la liste des vulnérabilités connues acceptées.

## Conventions

- Couleurs, typo et espacements uniquement via `@/theme` ; pas de valeur en dur dans les écrans.
- Imports avec l'alias `@/` (= `src/`).
- Les règles d'accès vivent dans la base (RLS), jamais seulement dans l'app.
- `npx expo install <paquet>` pour ajouter une dépendance (versions compatibles avec le SDK).
- Avant de pousser : `npm run typecheck`.

## État

Phase 1 (fondations) faite : navigation, thème, écrans de la maquette, enregistrement GPS, onboarding en
5 étapes, premier calcul de score, schéma de base.
Les écrans Discover, Community et Drive utilisent encore des données factices (phases 2 à 4 du cadrage).

### Serveur Expo Go permanent (testeurs iPhone)

Sur la machine serveur (Windows, Tailscale installé), une seule fois :

1. `npm install`, `.env.local` rempli, `npx expo login` avec le compte Expo partagé avec les testeurs
   (depuis le SDK 57, Expo Go exige le même compte côté serveur et côté iPhone).
2. Dans un PowerShell **administrateur** : `powershell -ExecutionPolicy Bypass -File scripts\server\install-autostart.ps1`
   (option `-AtLogon` pour démarrer à l'ouverture de session, sans mot de passe ; `-Uninstall` pour retirer).
3. `Start-ScheduledTask -TaskName 'HotLap Expo Go'`, puis vérifier `logs\serve-go.log`.

La tâche démarre `npm run start:go` sur l'IP Tailscale au démarrage de Windows, le relance s'il s'arrête,
récupère `main` toutes les 10 minutes et n'ouvre le port 8081 qu'aux adresses Tailscale.
