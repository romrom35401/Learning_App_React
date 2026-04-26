# 🎓 LearningApp (vocab-app)

**VocabApp** est une application React d'apprentissage de vocabulaire basée sur une méthode scientifique de répétition espacée par séries. Elle est conçue pour maîtriser plus de 100 termes étrangers (français → espagnol, etc.) avec une interface moderne, minimaliste et des raccourcis clavier fluides pour une productivité maximale.

---

## 🚀 Fonctionnalités

| Phase                | Objectif                    | Interface                               |
| :------------------- | :-------------------------- | :-------------------------------------- |
| **1. Quiz QCM**      | Reconnaissance rapide       | 4 options via clavier (touches 1-4)     |
| **2. Écriture**      | Production active           | Accents intégrés + feedback immédiat    |
| **3. Révision auto** | Loop sur erreurs uniquement | Répétition jusqu'à maîtrise 100%        |
| **4. Séries de 10**  | Progression batchée         | Apprentissage de 100+ mots sans fatigue |

- ✅ **Raccourcis :** `Entrée` pour valider, `1-4` pour les QCM, focus automatique et override intelligent.
- ✅ **Responsive :** Design mobile-first réalisé avec Tailwind CSS.
- ✅ **No data saved :** Fonctionne exclusivement côté client (vie privée respectée).
- ✅ **Shuffle :** Ordre aléatoire généré à chaque nouvelle session.

---

## 🎮 Comment utiliser

### 1. Installation

```bash
git clone <votre-repo-url>
cd learning-app
npm install
npm run dev  # Disponible sur http://localhost:5173
```

```
```bash
# Lancer l'application
npm run dev # Disponible sur http://localhost:5173
```

### 2. Workflow d'une session

```
Configuration → Quiz (10 mots) → Écriture → Révisions → Batch suivant → Victoire !
      |                              ↑          ↓
      └------------------------------┴-- si erreurs (Review Loop)
```

- **Setup :** Collez votre liste au format `français - espagnol` ou utilisez les mots par défaut.
- **Quiz :** Choisissez la bonne traduction avec les touches `1` à `4`.
- **Écriture :** Tapez la réponse. Feedback visuel instantané (vert/rouge).
- **Révisions :** Le système isole vos erreurs et vous fait pratiquer jusqu'au sans-faute.
- **Série suivante :** Passage automatique au lot de mots suivant après maîtrise.

**Astuces :**

- Utilisez **Entrée** partout pour accélérer la navigation.
- Bouton **"J'avais raison"** : Permet de valider manuellement une réponse si vous avez fait une faute de frappe (override).
- **Shuffle** : Mélangez les mots pour éviter l'apprentissage par cœur de l'ordre.

------

## 📋 Préparation des listes

L'application accepte un format simple dans la zone de texte :

```
bonjour - hola
merci - gracias / gracias
maison - casa
```

- **Séparateur :** `-`
- **Variantes :** Utilisez `/` pour plusieurs bonnes réponses (ex: `oui - si / sí`).

**Sources recommandées :**

- **Quizlet :** Copier le texte brut (évitez l'export PDF direct).
- **Anki/CSV :** Conversion manuelle rapide.
- **Google Trad :** Export de vos listes enregistrées.

------

## 🛠 Tech Stack

- **Frontend :** React 18 + Vite + Tailwind CSS 3.4
- **Icons :** Lucide React
- **Lint :** ESLint 9 (Flat Config)
- **Backend :** Aucun (Client-side only)

### Packages clés :

Bash

```
npm i lucide-react
npm i -D tailwindcss postcss autoprefixer @tailwindcss/animate
npx tailwindcss init -p
```

------

## 🔧 Configuration & Build

| **Commande**      | **Action**                                       |
| ----------------- | ------------------------------------------------ |
| `npm run dev`     | Lance le serveur de développement                |
| `npm run build`   | Génère les fichiers pour la production (`dist/`) |
| `npm run lint`    | Analyse le code avec ESLint                      |
| `npm run preview` | Prévisualise le build de production              |

------

## 🤖 Roadmap (Ajouts futurs)

- [ ] **PDF Quizlet :** Parsing automatique côté client via PDF.js.
- [ ] **Import CSV/JSON :** Support du Drag & drop.
- [ ] **Statistiques :** Visualisation du taux de réussite par série.
- [ ] **Thèmes :** Support automatique du mode sombre/clair.
- [ ] **PWA :** Mode hors-ligne pour réviser partout.
- [ ] **Export :** Sauvegarde de la progression dans le LocalStorage.

------

## 🐛 Résolution de problèmes

| **Problème**             | **Solution**                                                 |
| ------------------------ | ------------------------------------------------------------ |
| Erreurs ESLint           | `npm i -D eslint-plugin-react-hooks eslint-plugin-react-refresh` |
| Pas de mots au démarrage | Vérifiez la constante `PDF_WORDS` dans `App.jsx`             |
| Bug bouton override      | Mise à jour de la fonction `nextWritingStep()`               |
| Accents sur mobile       | Utilisation du focus auto pour déclencher le clavier natif   |

------

## 📄 Licence & Contribution

**Licence MIT** – N'hésitez pas à forker et à améliorer l'outil !

**Auteur :** [Votre Nom/GitHub]

**Version :** 1.0 (2026)

⭐ **Star si utile !** Partagez vos listes de vocabulaire ou proposez des fonctionnalités via les *Issues*.