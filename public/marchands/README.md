# Logos de marchands

Images servies aux lignes de relevé (`MerchantAvatar`), sur le même principe que
`public/banque/` pour les établissements bancaires : **tout est local**, aucune
requête n'est faite à un service de logos — envoyer à un tiers la liste des
marchands d'un relevé bancaire, c'est faire sortir de l'app une donnée qui dit où
quelqu'un mange, se soigne et voyage.

Les images présentes (265 enseignes) ont été récupérées une fois, ici, depuis les
sources publiées par les enseignes elles-mêmes : icône vectorielle déclarée dans
leur page, icônes de leur manifeste web (192-512 px), `apple-touch-icon` (180 px),
à défaut leur favicon. La plus grande trouvée gagne — d'où quelques SVG et une
majorité de fichiers en 180 px et plus. Ce sont des marques déposées, utilisées à seule fin
d'identifier le commerçant d'une opération — l'usage nominatif que fait n'importe
quelle application bancaire.

## Ajouter un logo

1. Déposer l'image ici, nommée d'après le `slug` du marchand : `amazon.png`,
   `carrefour.svg`, … Carrée de préférence — le disque de `RoundLogo` la détoure
   en `cover`, une image très rectangulaire sera rognée sur les côtés.
2. Dans `lib/bank/merchants.ts`, ajouter `logo: "/marchands/<fichier>"` à
   l'entrée du marchand.

Sans fichier, la vignette prend la couleur de la marque et les initiales du nom :
la liste reste lisible, et rien ne casse. C'est l'état de départ de la plupart
des entrées de la table.

## Ajouter un marchand inconnu

Une seule ligne dans `MERCHANTS` (`lib/bank/merchants.ts`) : un motif cherché
dans le libellé nettoyé, le nom à afficher, la couleur de la marque. L'ordre de
la table compte — un nom qui contient celui d'un autre passe devant (« uber
eats » avant « uber »).
