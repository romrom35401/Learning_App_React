# 🧠 VocabMaster

**A premium vocabulary learning application** featuring quizzes, writing
practice, spaced repetition, and seamless PDF imports to help you master
any language.

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

------------------------------------------------------------------------

## ✨ Features

-   **Multiple Learning Modes:** MCQ (Multiple Choice) and exact Writing
    practice.
-   **Auto-review Loop:** Mistakes are isolated and drilled until 100%
    mastery.
-   **Smart Hints:** Progressive reveal (first letters → vowels →
    remaining letters).
-   **Flexible Imports:** Seamless PDF extraction, text pasting, and
    CSV/JSON support.
-   **Multi-language Support:** Custom accent bars for Spanish, French,
    German, Portuguese, Italian, and custom alphabets.
-   **Direction Toggle:** Learn Term → Def or Def → Term.
-   **Quality of Life:** Dark/Light theme, streak rewards, live session
    stats, and full keyboard-first navigation (`Enter` to validate,
    `1`--`4` for MCQ).

------------------------------------------------------------------------

## 🚀 Getting Started

``` bash
# Clone the repository
git clone https://github.com/romrom35401/Learning_App_React.git
cd Learning_App_React/

# Install dependencies
npm install

# Start the dev server
npm run dev
```

------------------------------------------------------------------------

## 📋 Word List Format

VocabMaster relies on a standard text format to parse vocabulary
natively:

``` plaintext
hello - hola
goodbye - adiós
thank you - gracias / merci
```

-   **Separator:** `-`
-   **Multiple answers:** Use `/`

------------------------------------------------------------------------

## 📥 Importing your lists (Quizlet & Custom)

### ⭐ Option 1: PDF Upload (Highly Recommended)

1.  Open your Quizlet set → Click the ⋯ menu → Print → Save as PDF.\
2.  In VocabMaster, go to Import → Upload PDF and select your file.\
3.  The app will automatically parse the terms and definitions for you.

------------------------------------------------------------------------

### 📝 Option 2: Paste Text (with AI assistance)

**AI Prompt Template:**

    Format the following text into a list of 'term - definition'. Remove the useless numbers and links. Here is the text:

**Example Input:**

    Vocabulary List - Spanish 101
    Study online at https://quizlet.com/_example
    1. Hello Hola
    2. Goodbye Adiós
    3. Please Por favor
    4. Thank you Gracias
    5. How are you? ¿Cómo estás?

**Expected Output:**

    Hello - Hola
    Goodbye - Adiós
    Please - Por favor
    Thank you - Gracias
    How are you? - ¿Cómo estás?

------------------------------------------------------------------------

## 🛑 Troubleshooting

    Error parsing PDF: Setting up fake worker failed: "error loading dynamically imported module"

Restart:

``` bash
npm run dev
```

------------------------------------------------------------------------

## 🛠 Tech Stack

-   React 19 + Vite 7
-   Tailwind CSS 3.4
-   Lucide React
-   PDF.js

------------------------------------------------------------------------

## 🗺️ Roadmap

-   [x] CSV / JSON Import --- Drag & drop support for more formats
-   [x] Statistics --- Visualize success rate during session (accuracy)
-   [x] LocalStorage --- Save setup/import/theme/language options
    between sessions
-   [x] Focus fix --- Textarea stays focused while typing in the home
    screen
-   [ ] App / PWA Support --- Offline mode and mobile app installation
-   [ ] Export --- Sauvegarde de la progression dans le LocalStorage
-   [x] Spaced Repetition --- Smart scheduling based on difficulty

------------------------------------------------------------------------

## 📄 License

MIT License --- Feel free to fork and improve!

Author: romrom35401
Version: 1.1 (2026)
