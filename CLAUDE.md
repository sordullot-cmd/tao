# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js + server.js (concurrently)
npm run build            # next build — vérifie aussi le prérendu des routes
npx vitest run           # suite complète (72 fichiers)
npx vitest run tests/focus.test.ts        # un seul fichier
npx vitest run -t "nom du cas"            # un seul cas
npm run lint             # eslint
npm run tauri:build      # binaire de bureau (nécessite cargo)
```

Rust : `cargo` n'est pas dans le `PATH` par défaut sur cette machine — utiliser
`PATH="$HOME/.cargo/bin:$PATH" cargo check --manifest-path src-tauri/Cargo.toml`.

**Bruit préexistant.** `npx tsc --noEmit` et `npm run lint:strict` remontent des
centaines d'erreurs dans les fichiers hérités (`lib/hooks/useTradeData.ts`,
`tests/*.test.tsx` anciens…). Ce ne sont pas des régressions : filtrer sur les
fichiers touchés (`npx tsc --noEmit | grep '^lib/focus'`) plutôt que de lire le
total.

## Architecture

### L'app est une SPA déguisée en App Router

`app/dashboard/page.tsx` ne fait que monter `components/DashboardNew.jsx`, qui
est **la** coquille : un objet associe une chaîne (`page`) à un composant de
`components/pages/`, et `setPage()` navigue. Ajouter un écran = ajouter une
entrée dans cet objet, **pas** une route Next.

Les vraies routes sont réservées à ce qui doit vivre hors de la coquille et sans
authentification : `/login`, `/privacy`, `/terms`, `/blocked`, et `app/api/*`.

Conséquence à garder en tête : seule la page courante est montée. Tout ce qui
doit continuer à tourner quand on navigue ailleurs doit être monté **dans la
coquille**, pas dans une page. C'est le rôle de `components/focus/FocusSentinel.jsx`
(blocage et programmes de la page Focus) — le modèle à suivre pour toute
surveillance de fond.

### Deux étages de persistance

1. **Tables Supabase typées** — trades, comptes, firmes, stratégies. Migrations
   SQL dans `supabase/`.
2. **`useCloudState(storageKey, cloudKey, default)`** (`lib/hooks/useCloudState.ts`)
   — un JSON quelconque dans la table générique `user_productivity`.
   localStorage d'abord (instantané), upsert Supabase débouncé ensuite, et un
   **relais entre instances qui partagent une clé** : deux composants appelant le
   hook avec la même clé voient les mêmes écritures.

Le second étage est la voie normale pour toute nouvelle fonctionnalité de
productivité : aucune migration SQL, aucun schéma à décrire. Le magasin est
normalisé à la lecture (`normalizeStore`) au lieu d'être migré — un champ ajouté
prend sa valeur par défaut chez les anciens utilisateurs.

⚠️ Un mock de `useCloudState` dans un test **doit relayer entre instances**
(cf. `tests/focusPage.test.tsx`), sinon deux composants divergent et le test
échoue pour une raison qui n'a rien à voir avec ce qu'il vérifie.

### Coquille de bureau (Tauri v2)

`src-tauri/` — `frontendDist` pointe vers l'URL Vercel déployée : le binaire
n'embarque **aucun build JS**. Donc :

- une modification du front ne demande qu'un déploiement ;
- une modification Rust demande un `tauri:build` et une redistribution.

Les commandes sont déclarées dans `src-tauri/src/lib.rs` (`generate_handler!`).
Les commandes de l'app elle-même n'ont pas besoin d'entrée dans
`capabilities/default.json` (contrairement aux commandes de plugin) ; en
revanche `capabilities.remote.urls` autorise l'origine déployée à les appeler.

La coquille fournit : suivi d'activité (`tracker.rs`), blocage natif
(`blocker.rs` — lecture de l'onglet actif, fermeture d'application), icône dans
la barre d'état, démarrage automatique, et la croix ✕ qui masque au lieu de
quitter.

Le bundle macOS est signé en ad-hoc (`signingIdentity: "-"` dans
`tauri.conf.json`) pour donner à l'app une identité de code stable. ⚠️ Re-signer
un bundle déjà installé le fait voir comme une NOUVELLE app par TCC : les
autorisations Accessibilité (celles dont `tracker.rs` et `blocker.rs` dépendent)
sont à réaccorder dans Réglages Système → Confidentialité.

**Tout le front doit fonctionner sans elle.** Le test est `isTauri()`
(`lib/notify.ts`) ; les fonctions natives rendent `false` ou `null` en navigateur
plutôt que de jeter, et l'interface annonce la portée réelle du blocage selon la
coquille (navigateur / PWA installée / app de bureau).

### Direction artistique

- **Aucune couleur en dur.** Tout passe par `lib/ui/tokens.ts` (`T`, `HAIRLINE`,
  `FIELD_BG`, `CARD`), dont les valeurs sont des `var(--color-*)` — c'est ce qui
  fait suivre le thème sombre.
- **Échelle typographique imposée.** `lib/ui/type.ts` définit dix crans
  (10, 11, 12, 13, 14, 16, 20, 24, 28, 40) et des rôles (`TYPE.body`,
  `TYPE.title2`…). `tests/typeScale.test.ts` **fait échouer la suite** sur tout
  `fontSize` hors échelle. Étaler le rôle en premier, les exceptions après.
- Briques réutilisables dans `components/ui/da.jsx` (`CARD`, `PillButton`,
  `SectionTitle`, `PeriodPills`, `CheckBox`, `Modal`) et `components/ui/form.jsx`
  (`Field`, `Input`).

### Langue

`lib/i18n.ts` — français par défaut. Les tests d'interface vérifient des
libellés **anglais** et `tests/setup.ts` épingle `en` pour toute la suite. Un
test qui a besoin d'une autre langue la pose lui-même.

### Service worker

`public/sw.js` — network-first sur les navigations, cache-first sur
`/_next/static/`, jamais de cache sur `/api/*`. Ajouter une route à `SHELL_URLS`
oblige à **incrémenter `VERSION`**, sinon les installations existantes gardent
l'ancien cache.

## Conventions d'écriture

Les commentaires de ce dépôt sont **en français** et expliquent le *pourquoi* —
la contrainte, l'alternative écartée, le piège évité — jamais le *quoi*. Les
noms de cas de test aussi (`it("coupe ce qu'une liste retient…")`). Une
contribution qui commente en anglais ou paraphrase le code détonne : suivre la
densité et le ton des fichiers voisins.
