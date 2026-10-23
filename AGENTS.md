# HotLap — contexte pour les assistants de code

HotLap est un « Strava de la voiture » : l'utilisateur enregistre des drives (tracé GPS, stats, G-force,
photos/vidéos), les publie et interagit avec ceux des autres (likes, commentaires, fil Following,
Local Discover, World, Crews). App mobile Expo + backend Supabase. Lire README.md pour l'arborescence.

## Vocabulaire du domaine

- **Drive** : un enregistrement, une session GPS d'un conducteur avec un véhicule (table `drives`).
- **Route** : tronçon de route ouverte, réutilisable par plusieurs drives pour les comparer (table `routes`).
- **Circuit** : circuit réel ou route fermée, utilisable par des drives, avec chrono (table `circuits`).
- **Post** : un drive publié dans le fil.
- **Garage / Machine** : les véhicules de l'utilisateur (table `vehicles`, 20 max, un seul favori `is_primary`).
  Chaque drive a son véhicule (`drives.vehicle_id`), choisi avant le départ et modifiable au récap.
- **Followers / Following** : abonnés / abonnements (table `follows`). La visibilité `followers` d'un drive
  s'affiche « Followers ».
- **Crew** : groupe de conducteurs (tables `crews`, `crew_members`), ouvert ou sur demande, rôles owner / admin /
  member. Écritures uniquement via les fonctions SQL (`create_crew`, `join_crew`…), fil `feed_crews`.
  Invitations (0022) : `invite_to_crew` (admin, ou tout membre d'un crew ouvert), `respond_crew_invite` (entrée
  directe, même dans un crew sur demande), `cancel_crew_invite` ; notification `crew_invite`.

## Règles produit à respecter

- Score (`src/features/scoring`) : sur route ouverte, distance + dénivelé + virages, sans chrono.
  Formule en discussion : `npm run score:check` compare les variantes sur des tracés simulés.
  Le chrono n'entre dans le score que sur circuit, ou sur une Route avec `timing_enabled` (ex. autobahn
  sans limitation), drapeau géré côté admin. La base refuse un `lap_time_ms` ailleurs. Priorité : passer
  la revue App Store et Google Play.
- Vitesse max visible par tous depuis la migration 0023 (décision du 23/10, à revoir si les stores l'exigent) : `drives.max_speed_kmh` lisible selon la RLS, garage via `user_vehicle_stats` (drives visibles seulement). La vitesse moyenne et la télémétrie point par point (`drive_points`, composant `DriveTelemetry`) restent au seul propriétaire. Depuis la migration 0002, `path` et
  `start_point` ne sont pas lisibles directement (privilèges par colonne) : ne jamais faire `select('*')` sur
  `drives`, utiliser `DRIVE_COLUMNS` (`features/drives/api.ts`). Le tracé s'obtient par `drive_path_public`
  (complet pour le propriétaire ; pour les autres, `path_public`, sans la zone privée du domicile, en
  LineString ou MultiLineString), la vitesse max du propriétaire par `my_drive_private`. Les points bruts (`drive_points`) ne sont lisibles que par le propriétaire.
- Un drive terminé est gardé sur le téléphone (`features/drives/pending.ts`) jusqu'à sa sauvegarde ou son abandon.
- Le profil complet (nom, date de naissance, téléphone) n'est lisible que par son propriétaire ;
  les autres passent par la vue `public_profiles`. Photo de profil : bucket public `avatars/<user_id>/`.
- Connexion par email ou pseudo via l'Edge Function `sign-in` (l'email n'est jamais renvoyé à l'app,
  essais limités par `login_attempts`). Le profil est rattaché à l'utilisateur pour lequel il a été lu :
  ne jamais considérer `profile === null` comme « onboarding à faire » avant la fin du chargement.
- Fil : l'aperçu du tracé de chaque post vient de `drive_path_previews` (une requête par page, mêmes zones
  de confidentialité que `drive_path_public`).
- Catalogue véhicules : Wikidata (`npm run catalog:import`) + saisie manuelle via `propose_vehicle`, qui
  dédoublonne (nom normalisé `catalog_key`, alias, proximité pg_trgm). Jamais d'insertion directe dans le catalogue.
- Onboarding en 5 étapes : 20 % compte (Register + code reçu par email),
  40 % identité, 60 % localisation, 80 % véhicule, 100 % GPS. `profiles.onboarded_at` non nul = terminé.
- Email obligatoire et vérifié par code ; téléphone facultatif, NON vérifié (pas de SMS : payant), privé.
- Enregistrer un drive exige l'âge minimum du pays où se trouve l'utilisateur, selon le lieu (route ouverte
  ou circuit) : table `country_rules`, fonction `recording_context`, côté app `features/recording/authorization.ts`.
  La date de naissance est verrouillée une fois saisie. Ne jamais contourner ce contrôle.
- Routes chronométrées : choisies par l'équipe, `timing_enabled` exige `legal_basis` + `legal_checked_at`.
- Zone privée du domicile (migration 0014, `features/privacy`) : option activée par défaut, désactivable,
  demandée à l'étape localisation de l'onboarding et réglable depuis le profil. L'adresse est géocodée sur le
  téléphone ; la base ne garde qu'un centre décalé au hasard (≤ 300 m) et masque 1 300 m autour, donc au
  moins 1 km autour du domicile. Ne jamais stocker l'adresse ni le point exact du domicile. `path_public` et
  `start_point_public` sont calculés par trigger (jamais écrits par l'app) ; Local Discover cherche sur
  `start_point_public`.
- Drives privés par défaut ; la visibilité (`private`, `friends`, `followers`, `public`) est appliquée par
  `can_see_drive` et la RLS (migration 0013). Friends = abonnement réciproque ; followers = ceux qui suivent
  le propriétaire. Options et textes communs dans `features/drives/visibility.ts`.
- Abonnements (0013) : passer par `follow_user` (direct si `profiles.follow_policy = 'open'`, sinon demande
  dans `follow_requests`, acceptée par `answer_follow_request`). Les listes followers / following ne sont
  lisibles que par la personne concernée (`my_people`) ; les nombres d'un profil viennent de `profile_stats`.
- Garage (dont puissance et poids, `user_garage`), ville et région suivent `profiles.details_visibility` (public / followers / private) via `can_see_details` ;
  pseudo, nom affiché, bio et photo sont toujours publics.
- Modération (exigée par les stores) : tout contenu d'un autre utilisateur (drive, commentaire, profil, crew) doit
  offrir « Signaler » et « Bloquer » (`ModerationSheet`, table `reports`, table `blocks`). Le blocage est
  appliqué par `can_see_drive` et la RLS des commentaires. Suppression du compte : `delete_my_account`.
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
