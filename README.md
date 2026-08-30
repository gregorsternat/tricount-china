# Fēn · 分

Une application web mobile-first pour partager simplement les dépenses d'un groupe en Chine, calculer les remboursements et afficher l'équivalent RMB → EUR avec le taux de référence du jour.

## Fonctionnalités

- plusieurs groupes et participants, sans compte à créer ;
- dépenses en RMB avec payeur, date, catégorie, note et sous-groupe de bénéficiaires ;
- partage à parts égales au fen près ou par montants exacts ;
- modification, suppression confirmée et annulation immédiate ;
- soldes nets et suggestions déterministes pour réduire le nombre de remboursements ;
- enregistrement et annulation des remboursements ;
- affichage CNY ou EUR, avec le dernier taux indicatif de la Banque centrale européenne ;
- récapitulatif partageable dans WeChat et export JSON ;
- interface responsive complète, animations Motion et respect de `prefers-reduced-motion`.

Les montants de référence restent toujours stockés en fen CNY entiers. L'EUR est une vue indicative et ne modifie jamais les comptes.

## Démarrer

Prérequis : Node.js 22 ou une version compatible avec la plage déclarée dans `package.json`.

```bash
npm install
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000).

## Vérifier

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Données et taux de change

Fēn est local-first : groupes, dépenses et remboursements sont sauvegardés dans le stockage local du navigateur. Aucune donnée personnelle n'est envoyée à un service applicatif. L'export JSON permet de conserver une sauvegarde ; il n'y a pas encore de synchronisation temps réel entre plusieurs appareils.

La route serveur `/api/exchange-rate` interroge la série officielle `EXR.D.CNY.EUR.SP00.A` de la BCE, inverse le nombre de CNY par EUR et conserve la réponse six heures. Le dernier taux valide est mis en cache dans le navigateur ; sans taux disponible, les comptes CNY continuent à fonctionner et l'affichage EUR est désactivé.

## Stack

- Next.js 16, React 19 et TypeScript ;
- Tailwind CSS 4 et composants shadcn/ui ;
- Motion pour les transitions de layout et micro-interactions ;
- composants beUI distribués via le registre shadcn pour les nombres animés, boutons à état et toasts ;
- Vitest pour les règles de partage, les soldes, le parsing monétaire et la source BCE.
