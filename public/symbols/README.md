# Vignettes d'instruments

Les pastilles rondes affichées devant chaque trade (« 500 » pour le S&P 500,
« 100 » pour le Nasdaq…) sont **dessinées par le code**, pas téléchargées :
`SymbolBadge` dans `components/ui/da.jsx` peint un disque à la couleur
d'identité de l'instrument et y inscrit son marqueur.

Les pastilles équivalentes des plateformes de cotation (TradingView et
consorts) sont leurs propres marques : elles ne peuvent pas être redistribuées
dans l'application.

## Déposer une vraie image

Si vous disposez d'un visuel dont vous avez les droits :

1. placez le fichier ici, par exemple `public/symbols/sp500.svg` ;
2. ajoutez `icon: "/symbols/sp500.svg"` à l'entrée correspondante de
   `SYMBOL_LOGOS` (`components/ui/da.jsx`).

L'image prend alors la place du disque coloré, partout où la vignette apparaît
(page Trades, dashboard, détail d'un compte, journal). Format carré conseillé —
elle est détourée en cercle.
