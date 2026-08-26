# Épi — repère le gluten en un coup d'œil

Application web simple et responsive pour vérifier si un aliment ou une recette
peut contenir du gluten, avec des sources citées pour chaque information.

## Fonctionnement

- Base de données locale (`js/data.js`), aucune clé API, aucun coût.
- Recherche par ingrédient unique ou par liste séparée par des virgules (recette).
- Trois niveaux de réponse : **sans gluten**, **à vérifier sur l'étiquette**, **contient du gluten**,
  plus un état **non répertorié** quand l'ingrédient n'est pas encore dans le carnet.
- Carnet d'ingrédients consultable et enrichissable : les ajouts personnels sont
  sauvegardés dans le navigateur (`localStorage`), propres à chaque appareil.

## Sources utilisées pour la base de données

- AFDIAG — Association Française Des Intolérants Au Gluten (afdiag.fr)
- Ameli.fr — Assurance Maladie
- Règlement (UE) n° 828/2014 relatif aux denrées alimentaires pour personnes
  intolérantes au gluten

## Structure du projet

```
epi/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── data.js      (base d'ingrédients)
│   └── app.js        (logique de recherche et carnet)
└── README.md
```

## Lancer en local

Ouvrir simplement `index.html` dans un navigateur — aucun serveur nécessaire.

## Limites connues (v1)

- La base d'ingrédients est volontairement resserrée sur les cas les plus
  fréquents ; elle est destinée à être complétée au fil du temps.
- Le rapprochement texte est fait par correspondance de mots-clés, pas par une
  analyse sémantique poussée : une recette formulée de façon inhabituelle peut
  ne pas être reconnue.
- Les ajouts personnels au carnet ne sont pas vérifiés par une source externe :
  à utiliser comme pense-bête, pas comme information certifiée.
