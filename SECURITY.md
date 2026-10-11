# Sécurité — HotLap

## Signaler une vulnérabilité

Ne pas ouvrir d'issue publique. Écrire au mainteneur (Romain Veilleroy) avec la description,
les étapes pour reproduire et l'impact estimé. Réponse visée sous 7 jours.

## Ce qui surveille le dépôt

| Outil | Ce qu'il vérifie | Quand | Bloquant |
| --- | --- | --- | --- |
| Dependabot alerts + security updates | Vulnérabilités connues des dépendances npm, PR de correctif | En continu | Non (PR à fusionner) |
| Dependabot version updates | Mises à jour mineures groupées (Expo, autres, GitHub Actions) | Lundi 7 h | Non |
| CI : `npm audit --omit=dev` | Dépendances livrées dans l'app | Chaque push / PR | Oui si critique ; rapport complet dans le résumé du job |
| gitleaks | Clés, jetons, mots de passe commités, sur tout l'historique | Chaque push / PR + lundi | Oui |
| Semgrep (règles sécurité JS/TS/React/secrets) | Failles dans le code (injection, ReDoS, XSS…) | Chaque push / PR + lundi | Oui |

Dépôt privé sur un compte personnel : CodeQL et la détection de secrets intégrée de GitHub ne sont
pas disponibles (réservés aux dépôts publics ou aux offres Team / Enterprise), d'où gitleaks et Semgrep.

## Règles

- Aucun secret dans le code : `.env.local` est ignoré par git. La clé `service_role` Supabase
  ne sert qu'aux scripts (`scripts/`), jamais dans l'app.
- Les règles d'accès aux données vivent dans la base (RLS, `supabase/migrations`), pas seulement dans l'app.
- Changement de SDK Expo : manuel (`npx expo install expo@^XX` puis `npx expo install --fix`), pas par Dependabot.

## Vulnérabilités connues acceptées

Revue au moins à chaque changement de SDK Expo. Dernière revue : 11/10/2026 (SDK 57).

| Paquet | Gravité | Avis | Où | Pourquoi accepté | Sortie prévue |
| --- | --- | --- | --- | --- | --- |
| decode-uri-component 0.2.2 (via expo-router > query-string) | Modérée | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Dans l'app : décodage des liens profonds | Déni de service local sur un lien malformé ; pas de version corrigée compatible avec expo-router 57 | expo-router 58 (SDK 58) |
| braces 3.0.3 (via Metro) | Haute | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Outil de build uniquement | Pas livré dans l'app ; aucune version corrigée publiée | Mise à jour Metro / Expo |
| node-forge 1.4.0 (via @expo/cli) | Haute | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Outil de build (certificats de développement) | Pas livré dans l'app ; aucune version corrigée publiée | Mise à jour @expo/cli |
| uuid 7.0.3 (via @expo/config-plugins > xcode) | Modérée | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Génération du projet iOS | Pas livré dans l'app ; correctif = version majeure incompatible | Mise à jour Expo |
