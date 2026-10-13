# HotLap — contexte pour les assistants de code

HotLap est un « Strava de la voiture » : l'utilisateur enregistre des drives (tracé GPS, stats, G-force,
photos/vidéos), les publie et interagit avec ceux des autres (likes, commentaires, fil Following,
Local Discover, Clubs). App mobile Expo + backend Supabase. Lire README.md pour l'arborescence.

## Vocabulaire du domaine

- **Drive** : un enregistrement, une session GPS d'un conducteur avec un véhicule (table `drives`).
- **Route** : tronçon de route ouverte, réutilisable par plusieurs drives pour les comparer (table `routes`).
- **Circuit** : circuit réel ou route fermée, utilisable par des drives, avec chrono (table `circuits`).
- **Post** : un drive publié dans le fil.
- **Garage / Machine** : les véhicules de l'utilisateur (table `vehicles`, un seul `is_primary`).
- **Crew** : abonnés ; **Following** : abonnements (table `follows`).

## Règles produit à respecter

- Score (`src/features/scoring`) : sur route ouverte, distance + dénivelé + virages, sans chrono.
  Formule en discussion : `npm run score:check` compare les variantes sur des tracés simulés.
  Le chrono n'entre dans le score que sur circuit, ou sur une Route avec `timing_enabled` (ex. autobahn
  sans limitation), drapeau géré côté admin. La base refuse un `lap_time_ms` ailleurs. Priorité : passer
  la revue App Store et Google Play.
- `max_speed_kmh` n'est jamais affichée publiquement. Depuis la migration 0002, `max_speed_kmh`, `path` et
  `start_point` ne sont pas lisibles directement (privilèges par colonne) : ne jamais faire `select('*')` sur
  `drives`, utiliser `DRIVE_COLUMNS` (`features/drives/api.ts`). Le tracé s'obtient par `drive_path_public`
  (complet pour le propriétaire, sans 300 m au départ et à l'arrivée pour les autres), la vitesse max du
  propriétaire par `my_drive_private`. Les points bruts (`drive_points`) ne sont lisibles que par le propriétaire.
- Un drive terminé est gardé sur le téléphone (`features/drives/pending.ts`) jusqu'à sa sauvegarde ou son abandon.
- Le profil complet (nom, date de naissance, téléphone) n'est lisible que par son propriétaire ;
  les autres passent par la vue `public_profiles`.
- Catalogue véhicules : Wikidata (`npm run catalog:import`) + saisie manuelle via `propose_vehicle`, qui
  dédoublonne (nom normalisé `catalog_key`, alias, proximité pg_trgm). Jamais d'insertion directe dans le catalogue.
- Onboarding en 5 étapes : 20 % compte (Register + code reçu par email),
  40 % identité, 60 % localisation, 80 % véhicule, 100 % GPS. `profiles.onboarded_at` non nul = terminé.
- Email obligatoire et vérifié par code ; téléphone facultatif, NON vérifié (pas de SMS : payant), privé.
- Enregistrer un drive exige l'âge minimum du pays où se trouve l'utilisateur, selon le lieu (route ouverte
  ou circuit) : table `country_rules`, fonction `recording_context`, côté app `features/recording/authorization.ts`.
  La date de naissance est verrouillée une fois saisie. Ne jamais contourner ce contrôle.
- Routes chronométrées : choisies par l'équipe, `timing_enabled` exige `legal_basis` + `legal_checked_at`.
- Drives privés par défaut ; la visibilité (`private`, `followers`, `public`) est appliquée par la RLS.
- Aucune interaction requise pendant la conduite : gros boutons, pas de saisie pendant l'enregistrement.
- Design : thème sombre unique, accent vert citron `colors.accent`, titres en Michroma, texte en Inter.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
