# 🧠 VocabMaster

**A premium vocabulary learning application** featuring quizzes, writing practice, spaced repetition, and seamless PDF imports to help you master any language.

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

------

## ✨ Features

- **Multiple Learning Modes:** MCQ (Multiple Choice) and exact Writing practice.
- **Auto-review Loop:** Mistakes are isolated and drilled until 100% mastery.
- **Smart Hints:** Progressive reveal (first letters → vowels → remaining letters).
- **Flexible Imports:** Seamless PDF extraction, text pasting, and CSV/JSON support.
- **Multi-language Support:** Custom accent bars for Spanish, French, German, Portuguese, Italian, and custom alphabets.
- **Direction Toggle:** Learn Term → Def or Def → Term.
- **Quality of Life:** Dark/Light theme, streak rewards, live session stats, and full keyboard-first navigation (`Enter` to validate, `1`–`4` for MCQ).

------

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/romrom35401/Learning_App_React.git
cd Learning_App_React/vocab-app

# Install dependencies
npm install

# Start the dev server
npm run dev
```

------

## 📋 Word List Format

VocabMaster relies on a standard text format to parse vocabulary natively:

**Plaintext**

```
hello - hola
goodbye - adiós
thank you - gracias / merci
```

- **Separator:** `-`
- **Multiple answers:** Use `/`

------

## 📥 Importing your lists (Quizlet & Custom)

### ⭐ Option 1: PDF Upload (Highly Recommended)

The fastest and most reliable way to import your lists, especially from Quizlet.

1. Open your Quizlet set → Click the ⋯ menu → Print → Save as PDF.
2. In VocabMaster, go to Import → Upload PDF and select your file.
3. The app will automatically parse the terms and definitions for you.

------

### 📝 Option 2: Paste Text (with AI assistance)

If you prefer extracting text manually or don't have a PDF, you can copy the raw text and format it. To save time, you can use an AI to format it instantly.

**AI Prompt Template:**

```
Format the following text into a list of 'term - definition'. Remove the useless numbers and links. Here is the text:
```

**Example Input to AI:**

```
Vocabulary List - Spanish 101
Study online at https://quizlet.com/_example
1. Hello Hola
2. Goodbye Adiós
3. Please Por favor
4. Thank you Gracias
5. How are you? ¿Cómo estás?
```

**Expected AI Output (Paste this directly into VocabMaster):**

```
Hello - Hola
Goodbye - Adiós
Please - Por favor
Thank you - Gracias
How are you? - ¿Cómo estás?
```

------

## 🛑 Troubleshooting

**PDF parsing error:**

```
Error parsing PDF: Setting up fake worker failed: "error loading dynamically imported module: http://localhost:5173/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?import"
```

This error means your local development server has been stopped. Restart it with:

```bash
npm run dev
```

------

## 🛠 Tech Stack

- **Framework:** React 19 + Vite 7
- **Styling:** Tailwind CSS 3.4
- **Icons:** Lucide React
- **Utilities:** PDF.js for client-side parsing

------

## 🗺️ Roadmap

-  CSV / JSON Import — Drag & drop support for more formats
-  Statistics — Visualize success rate during session (accuracy)
-  LocalStorage — Save setup/import/theme/language options between sessions
-  Focus fix — Textarea stays focused while typing in the home screen
-  App / PWA Support — Offline mode and mobile app installation
-  Export — Sauvegarde de la progression dans le LocalStorage
-  Spaced Repetition — Smart scheduling based on difficulty

------

## 📄 License

MIT License — Feel free to fork and improve!

**Author:** romrom35401
**Version:** 1.1 (2026)