# 🧠 VocabMaster

**A premium vocabulary learning app** with quiz, writing practice, spaced repetition, and Quizlet PDF import. Master any language.

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

| Feature | Description |
|:---|:---|
| **Quiz (MCQ)** | Pick the correct translation — keyboard shortcuts `1`–`4` |
| **Writing** | Type the answer with instant visual feedback |
| **Auto-review loop** | Mistakes are isolated and drilled until 100% mastery |
| **Batches of 10** | Learn 100+ words without fatigue |
| **PDF Import** | Upload a Quizlet "Print → Save as PDF" file |
| **Text Import** | Paste tab-separated or `term - definition` text |
| **Multi-language** | Accent bar for Spanish, French, German, Portuguese, Italian |
| **Shuffle** | Randomize word order at any time |
| **Keyboard-first** | `Enter` to validate, `1`–`4` for MCQ, auto-focus everywhere |
| **Dark UI** | Premium glassmorphism design with smooth animations |

---

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/<your-username>/vocab-app.git
cd vocab-app

# Install dependencies
npm install

# Start the dev server
npm run dev
# → opens at http://localhost:5173
```

---

## 🎮 How It Works

```
Setup → Quiz (10 words) → Writing → Review loop → Next batch → Victory!
                ↑                        ↓
                └────── if mistakes ──────┘
```

1. **Setup** — Paste your word list (`term - definition`), import from Quizlet, or upload a PDF.
2. **Quiz** — Choose the correct translation from 4 options.
3. **Writing** — Type the answer; get instant green/red feedback.
4. **Review** — Mistakes are re-tested until you get them all right.
5. **Next batch** — Move on to the next 10 words once you've mastered the current set.

### Tips
- Press **Enter** everywhere to navigate faster.
- **"I was right"** button lets you override a typo during writing.
- Use the **Shuffle** button to avoid memorizing order.
- Switch the **accent bar** to match your target language.

---

## 📋 Word List Format

The textarea accepts this simple format:

```
hello - hola
goodbye - adiós
thank you - gracias / merci
```

- **Separator:** `-`
- **Multiple answers:** Use `/` (e.g. `yes - sí / si`)

### Importing from Quizlet

**Option 1 — Text (recommended):**
1. Open your Quizlet set → `⋯` menu → **Export**
2. Choose **Tab** delimiter
3. Click **Copy text**
4. In VocabMaster, click **Import** → **Paste Text** → paste → **Parse Text** → **Confirm Import**

**Option 2 — PDF:**
1. Open your Quizlet set → `⋯` menu → **Print** → **Save as PDF**
2. In VocabMaster, click **Import** → **Upload PDF** → drag & drop or browse
3. Review the preview and click **Confirm Import**

---

## 🛠 Tech Stack

| Technology | Purpose |
|:---|:---|
| [React 19](https://react.dev) | UI framework |
| [Vite 7](https://vitejs.dev) | Build tool & dev server |
| [Tailwind CSS 3.4](https://tailwindcss.com) | Utility-first styling |
| [Lucide React](https://lucide.dev) | Icon library |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Client-side PDF parsing |
| ESLint 9 | Code linting |

---

## 📦 Commands

| Command | Action |
|:---|:---|
| `npm run dev` | Start development server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

## 📄 License

MIT — feel free to fork and improve!

⭐ **Star if useful!** Share your vocab lists or suggest features via Issues.