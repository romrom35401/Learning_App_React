import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Book, Check, X, RefreshCw, ChevronRight, Edit3, Trophy,
  Keyboard, Layers, Shuffle, Upload, FileText, Globe, ArrowLeft,
  Eye, Flame, Sun, Moon
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './App.css';

// PDF.js worker setup — use Vite ?url import for reliable loading
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// --- Accent presets per language ---
const ACCENT_PRESETS = {
  spanish: { label: 'Español', chars: ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¡', '¿'] },
  french: { label: 'Français', chars: ['à', 'â', 'é', 'è', 'ê', 'ë', 'ï', 'î', 'ô', 'ù', 'û', 'ç', 'æ', 'œ'] },
  german: { label: 'Deutsch', chars: ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'] },
  portuguese: { label: 'Português', chars: ['á', 'â', 'ã', 'à', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú', 'ç'] },
  italian: { label: 'Italiano', chars: ['à', 'è', 'é', 'ì', 'ò', 'ù'] },
  none: { label: 'None', chars: [] },
};

const BATCH_SIZE = 10;

// Streak reward thresholds
const STREAK_REWARDS = [
  { threshold: 3, icon: '🔥', label: 'On Fire!', color: 'from-orange-500 to-red-500' },
  { threshold: 5, icon: '⚡', label: 'Unstoppable!', color: 'from-yellow-400 to-orange-500' },
  { threshold: 10, icon: '🌟', label: 'Legendary!', color: 'from-purple-500 to-pink-500' },
  { threshold: 15, icon: '💎', label: 'Diamond!', color: 'from-cyan-400 to-blue-500' },
  { threshold: 20, icon: '👑', label: 'Godlike!', color: 'from-yellow-300 to-amber-500' },
];

// Fisher-Yates shuffle
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const normalizeAnswer = (answer) => answer.trim().toLowerCase();

const checkAnswer = (userInput, correctDef) => {
  const validAnswers = correctDef.split('/').map(s => normalizeAnswer(s));
  const userAns = normalizeAnswer(userInput);
  if (validAnswers.includes(userAns)) return true;
  if (userAns.includes('/')) {
    const userParts = userAns.split('/').map(s => normalizeAnswer(s));
    return userParts.every(part => validAnswers.includes(part));
  }
  return false;
};

const wordsToTextarea = (words) => words.map(w => `${w.term} - ${w.def}`).join('\n');

// --- Quizlet PDF Parser (position-based two-column extraction) ---
const parseQuizletPdf = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, disableWorker: true }).promise;
  const allParsedWords = [];
  const seenPairs = new Set();

  const clean = (value) => value.replace(/\s+/g, ' ').trim();
  const isJunk = (str) => {
    const s = clean(str || '');
    return s.length === 0 ||
      /^\d+\s*\/\s*\d+$/.test(s) ||
      /^study online at\b/i.test(s);
  };
  const isHeaderLikeRow = (text) => {
    const s = clean(text || '');
    if (!s) return true;
    if (/^study online at\b/i.test(s)) return true;
    if (/quizlet\.com/i.test(s)) return true;
    // Typical Quizlet printed set title, e.g. "4_Fahrenheit 451 (1953)"
    if (/^\d+_[^()]+?\(\d{4}\)$/.test(s)) return true;
    return false;
  };
  const stripLeadingNumber = (text) => clean((text || '').replace(/^\d+\s*[.)-]?\s*/, ''));
  const splitDashLine = (raw) => {
    const line = clean(raw);
    if (!line) return null;
    const dashMatch = line.match(/\s[-–—]\s/);
    if (!dashMatch || dashMatch.index == null) return null;
    const idx = dashMatch.index;
    const term = clean(line.slice(0, idx));
    const def = clean(line.slice(idx + dashMatch[0].length));
    if (!term || !def) return null;
    return { term, def };
  };
  const pushPair = (termRaw, defRaw) => {
    const term = clean(termRaw || '');
    const def = clean(defRaw || '');
    if (!term || !def) return;
    const dedupeKey = `${term}__${def}`;
    if (seenPairs.has(dedupeKey)) return;
    seenPairs.add(dedupeKey);
    allParsedWords.push({ id: allParsedWords.length, term, def });
  };

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items.filter(item => item.str && !isJunk(item.str));
    if (items.length === 0) continue;

    const xVals = items.map(item => item.transform[4]).sort((a, b) => a - b);
    const xMin = xVals[0];
    const xMax = xVals[xVals.length - 1];
    let splitX = (xMin + xMax) / 2;
    let biggestGap = 0;
    for (let i = 1; i < xVals.length; i++) {
      const gap = xVals[i] - xVals[i - 1];
      if (gap > biggestGap && xVals[i - 1] - xMin > 40 && xMax - xVals[i] > 40) {
        biggestGap = gap;
        splitX = (xVals[i] + xVals[i - 1]) / 2;
      }
    }

    const leftItems = items.filter(item => item.transform[4] < splitX);
    const rightItems = items.filter(item => item.transform[4] >= splitX);

    // Fallback for non-column PDFs
    if (leftItems.length === 0 || rightItems.length === 0) {
      const text = clean(items.map(i => i.str).join(' '));
      const matches = [...text.matchAll(/(\d+)[.)]\s*(.+?)(?=\d+[.)]\s*|$)/g)];
      for (const m of matches) {
        const parsed = splitDashLine(m[2]);
        if (parsed) pushPair(parsed.term, parsed.def);
      }
      continue;
    }

    const ROW_TOL = 5;
    const groupIntoRows = (list) => {
      const rows = [];
      for (const item of list) {
        const y = item.transform[5];
        let row = rows.find(r => Math.abs(r.y - y) <= ROW_TOL);
        if (!row) {
          row = { y, items: [] };
          rows.push(row);
        }
        row.items.push(item);
      }
      rows.sort((a, b) => b.y - a.y);
      return rows.map(row => {
        const sorted = [...row.items].sort((a, b) => a.transform[4] - b.transform[4]);
        return { y: row.y, text: clean(sorted.map(i => i.str).join(' ')) };
      }).filter(r => r.text.length > 0 && !isHeaderLikeRow(r.text));
    };

    const leftRows = groupIntoRows(leftItems);
    const rightRows = groupIntoRows(rightItems);
    const allRows = [...leftRows, ...rightRows].sort((a, b) => b.y - a.y);
    let lineH = 14;
    if (allRows.length >= 2) {
      const gaps = [];
      for (let i = 1; i < allRows.length; i++) {
        const g = Math.abs(allRows[i - 1].y - allRows[i].y);
        if (g > 1) gaps.push(g);
      }
      gaps.sort((a, b) => a - b);
      lineH = gaps[Math.floor(gaps.length / 2)] || 14;
    }
    const CONT_THRESHOLD = lineH * 1.8;

    const rowsToEntries = (rows) => {
      const entries = [];
      let pendingNum = null;
      for (const row of rows) {
        const numMatch = row.text.match(/^(\d+)\s*[.)-]?\s*(.*)$/);
        if (numMatch) {
          const parsedNum = parseInt(numMatch[1], 10);
          const parsedText = clean(numMatch[2]);
          if (!parsedText) {
            pendingNum = { num: parsedNum, y: row.y };
            continue;
          }
          entries.push({
            num: parsedNum,
            text: parsedText,
            y: row.y,
          });
          pendingNum = null;
          continue;
        }
        if (pendingNum) {
          entries.push({
            num: pendingNum.num,
            text: row.text,
            y: row.y,
          });
          pendingNum = null;
          continue;
        }
        const last = entries[entries.length - 1];
        if (!last) continue;
        if (Math.abs(last.y - row.y) <= CONT_THRESHOLD) {
          last.text = clean(`${last.text} ${row.text}`);
          last.y = row.y;
        }
      }
      return entries.filter(e => e.text.length > 0);
    };

    const termEntries = rowsToEntries(leftRows);
    const defEntries = rowsToEntries(rightRows);
    const hasNumberedEntries = termEntries.length > 0 && defEntries.length > 0;

    if (hasNumberedEntries) {
      const defsByNum = new Map(defEntries.map(e => [e.num, e]));
      const usedDefs = new Set();
      for (const term of termEntries) {
        let def = defsByNum.get(term.num);
        if (!def) {
          def = defEntries
            .filter(candidate => !usedDefs.has(candidate.num))
            .sort((a, b) => Math.abs(a.y - term.y) - Math.abs(b.y - term.y))[0];
        }
        if (!term.text || !def?.text) continue;
        usedDefs.add(def.num);
        pushPair(term.text, def.text);
      }
      continue;
    }

    // If only one side has numbering, use it as anchor and pair by y.
    if (termEntries.length > 0 && defEntries.length === 0 && rightRows.length > 0) {
      const usedRight = new Set();
      for (const term of termEntries) {
        const closestRightIdx = rightRows
          .map((row, idx) => ({ row, idx }))
          .filter(({ idx }) => !usedRight.has(idx))
          .sort((a, b) => Math.abs(a.row.y - term.y) - Math.abs(b.row.y - term.y))[0]?.idx;
        if (closestRightIdx == null) continue;
        usedRight.add(closestRightIdx);
        pushPair(term.text, stripLeadingNumber(rightRows[closestRightIdx].text));
      }
      continue;
    }
    if (defEntries.length > 0 && termEntries.length === 0 && leftRows.length > 0) {
      const usedLeft = new Set();
      for (const def of defEntries) {
        const closestLeftIdx = leftRows
          .map((row, idx) => ({ row, idx }))
          .filter(({ idx }) => !usedLeft.has(idx))
          .sort((a, b) => Math.abs(a.row.y - def.y) - Math.abs(b.row.y - def.y))[0]?.idx;
        if (closestLeftIdx == null) continue;
        usedLeft.add(closestLeftIdx);
        pushPair(stripLeadingNumber(leftRows[closestLeftIdx].text), def.text);
      }
      continue;
    }

    // Last-resort fallback: pair rows by vertical proximity/index even without visible numbering.
    const usedRight = new Set();
    for (const leftRow of leftRows) {
      const closestRightIdx = rightRows
        .map((row, idx) => ({ row, idx }))
        .filter(({ idx }) => !usedRight.has(idx))
        .sort((a, b) => Math.abs(a.row.y - leftRow.y) - Math.abs(b.row.y - leftRow.y))[0]?.idx;
      if (closestRightIdx == null) continue;
      usedRight.add(closestRightIdx);
      pushPair(stripLeadingNumber(leftRow.text), stripLeadingNumber(rightRows[closestRightIdx].text));
    }
  }

  return allParsedWords;
};

const parseQuizletText = (text) => {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map((line, idx) => {
    let parts;
    if (line.includes('\t')) {
      parts = line.split('\t');
    } else if (line.includes(' - ')) {
      parts = [line.split(' - ')[0], line.split(' - ').slice(1).join(' - ')];
    } else {
      parts = [line, ''];
    }
    return { id: idx, term: (parts[0] || '').trim(), def: (parts[1] || '').trim() };
  }).filter(w => w.term && w.def);
};

const parseSetupText = (text) => {
  const lines = text.split('\n');
  return lines
    .filter(line => line.trim())
    .map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.includes('\t')) {
        const tabParts = trimmed.split('\t');
        return { id: idx, term: (tabParts[0] || '').trim(), def: tabParts.slice(1).join('\t').trim() };
      }

      // Use the LAST spaced dash as separator to preserve dashes inside terms,
      // e.g. "Ray Bradbury (1920 - 2012) - Fahrenheit 451 (1953)".
      let splitIdx = trimmed.lastIndexOf(' - ');
      let sepLen = 3;
      if (splitIdx < 0) {
        splitIdx = trimmed.lastIndexOf(' – ');
      }
      if (splitIdx < 0) {
        splitIdx = trimmed.lastIndexOf(' — ');
      }
      if (splitIdx < 0) {
        return { id: idx, term: '', def: '' };
      }
      const term = trimmed.slice(0, splitIdx).trim();
      const def = trimmed.slice(splitIdx + sepLen).trim();
      return { id: idx, term, def };
    })
    .filter(w => w.term && w.def);
};

const parseCsvLine = (line) => {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
};

const parseCsvImport = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return lines
    .map((line, idx) => {
      const [term = '', def = ''] = parseCsvLine(line);
      return { id: idx, term: term.trim(), def: def.trim() };
    })
    .filter(w => w.term && w.def);
};

const parseJsonImport = (text) => {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : (Array.isArray(data?.words) ? data.words : []);
  return list
    .map((item, idx) => ({
      id: idx,
      term: String(item?.term ?? item?.word ?? '').trim(),
      def: String(item?.def ?? item?.definition ?? item?.translation ?? '').trim(),
    }))
    .filter(w => w.term && w.def);
};

// ---- Stable module-level UI components (outside App to prevent re-mount on re-render) ----
const Card = ({ children, className = '', elevated = false, isDark }) => (
  <div className={`rounded-2xl overflow-hidden ${elevated
    ? (isDark ? 'glass-card-elevated' : 'bg-white shadow-xl border border-slate-200')
    : (isDark ? 'glass-card' : 'bg-white shadow-lg border border-slate-200')} ${className}`}>
    {children}
  </div>
);

const ProgressBar = ({ current, total, color = "from-indigo-500 to-indigo-400", isDark }) => (
  <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/5' : 'bg-slate-200'}`}>
    <div className={`h-full transition-all duration-500 ease-out rounded-full bg-gradient-to-r ${color}`}
      style={{ width: `${Math.min((current / total) * 100, 100)}%` }} />
  </div>
);

const LOCAL_STORAGE_KEY = 'vocabmaster_state_v2';


// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [appPhase, setAppPhase] = useState('setup');
  const [allWords, setAllWords] = useState([]);
  const [setupText, setSetupText] = useState('');
  const [customPresets, setCustomPresets] = useState([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetChars, setNewPresetChars] = useState('');
  const [batchOffset, setBatchOffset] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState('spanish');
  const [direction, setDirection] = useState('term_to_def');
  const [theme, setTheme] = useState('dark');

  const [queue, setQueue] = useState([]);
  const [failedInPhase, setFailedInPhase] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [isReviewRound, setIsReviewRound] = useState(false);

  const [mcqOptions, setMcqOptions] = useState([]);
  const inputRef = useRef(null);
  const correctTimeoutRef = useRef(null);
  const streakPopupTimeoutRef = useRef(null);
  const streakBeforeMistakeRef = useRef(0);
  const [showOverrideButton, setShowOverrideButton] = useState(false);
  const [selectedMcqOption, setSelectedMcqOption] = useState(null);

  // Hint system — hinted words reviewed ONLY at the very end
  const [hintLevel, setHintLevel] = useState(0);
  const [usedHintOnCurrent, setUsedHintOnCurrent] = useState(false);
  const [hintedWordsQueue, setHintedWordsQueue] = useState([]); // words to review at very end

  // Streak
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [showStreakPopup, setShowStreakPopup] = useState(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState('text');
  const [importText, setImportText] = useState('');
  const [importFileError, setImportFileError] = useState('');
  const [importPreview, setImportPreview] = useState([]);
  const [importMode, setImportMode] = useState('append');
  const [isDragging, setIsDragging] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [shuffleOnStart, setShuffleOnStart] = useState(false);
  const [sessionWords, setSessionWords] = useState([]);
  const fileInputRef = useRef(null);
  const genericFileInputRef = useRef(null);

  const languageOptions = useMemo(() => {
    const customEntries = customPresets.map(p => [p.key, { label: p.label, chars: p.chars }]);
    return Object.fromEntries([...Object.entries(ACCENT_PRESETS), ...customEntries]);
  }, [customPresets]);
  const parsedSetupWords = useMemo(() => parseSetupText(setupText), [setupText]);
  const sessionAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  // Theme effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Direction helpers
  const getQuestion = (word) => direction === 'term_to_def' ? word.term : word.def;
  const getAnswer = (word) => direction === 'term_to_def' ? word.def : word.term;
  const getOptionDisplay = (word) => direction === 'term_to_def' ? word.def : word.term;

  const getHintText = useCallback((word, level) => {
    if (!word || level <= 0) return '';
    const answer = direction === 'term_to_def' ? word.def : word.term;
    return answer.split('').map((c, i) => i < level ? c : '_').join('');
  }, [direction]);

  // ---- Streak ----
  const scheduleStreakPopupClose = useCallback(() => {
    if (streakPopupTimeoutRef.current) {
      clearTimeout(streakPopupTimeoutRef.current);
    }
    streakPopupTimeoutRef.current = setTimeout(() => {
      setShowStreakPopup(null);
      streakPopupTimeoutRef.current = null;
    }, 2000);
  }, []);

  const handleCorrectAnswer = useCallback(() => {
    const newStreak = streak + 1;
    setStreak(newStreak);
    if (newStreak > bestStreak) setBestStreak(newStreak);
    const reward = [...STREAK_REWARDS].reverse().find(r => newStreak === r.threshold);
    if (reward) {
      setShowStreakPopup(reward);
      scheduleStreakPopupClose();
    }
  }, [streak, bestStreak, scheduleStreakPopupClose]);

  const handleWrongAnswer = useCallback(() => {
    streakBeforeMistakeRef.current = streak;
    setStreak(0);
  }, [streak]);
  const recordAttempt = useCallback((isCorrect) => {
    setTotalAttempts(prev => prev + 1);
    if (isCorrect) setTotalCorrect(prev => prev + 1);
  }, []);

  // ---- Reset ----
  const handleReset = () => {
    setAppPhase('setup');
    setFailedInPhase([]);
    setQueue([]);
    setBatchOffset(0);
    setShowOverrideButton(false);
    setFeedback(null);
    setSelectedMcqOption(null);
    setCurrentIndex(0);
    setStreak(0);
    setBestStreak(0);
    setTotalCorrect(0);
    setTotalAttempts(0);
    setHintLevel(0);
    setUsedHintOnCurrent(false);
    setHintedWordsQueue([]);
    setIsReviewRound(false);
    setSessionWords([]);
    setShowStreakPopup(null);
    if (streakPopupTimeoutRef.current) {
      clearTimeout(streakPopupTimeoutRef.current);
      streakPopupTimeoutRef.current = null;
    }
    setSetupText(wordsToTextarea(allWords));
  };

  // ---- Batch Management ----
  const handleStartFullSession = (customList = null) => {
    const listToUse = customList || allWords;
    if (listToUse.length === 0) return;
    const sessionList = shuffleOnStart ? shuffleArray(listToUse) : [...listToUse];
    setSessionWords(sessionList);
    setBatchOffset(0);
    setStreak(0);
    setBestStreak(0);
    setTotalCorrect(0);
    setTotalAttempts(0);
    setHintedWordsQueue([]);
    startBatch(0, sessionList);
  };

  const startBatch = (offset, sourceList) => {
    const nextBatch = sourceList.slice(offset, offset + BATCH_SIZE);
    setQueue(nextBatch);
    setFailedInPhase([]);
    setCurrentIndex(0);
    setAppPhase('quiz');
    setShowOverrideButton(false);
    setFeedback(null);
    setInputValue('');
    setSelectedMcqOption(null);
    setHintLevel(0);
    setUsedHintOnCurrent(false);
    setIsReviewRound(false);
    if (nextBatch.length > 0) {
      generateMcqOptions(nextBatch[0], sourceList);
    }
  };

  const handleNextBatch = () => {
    const nextOffset = batchOffset + BATCH_SIZE;
    setBatchOffset(nextOffset);
    startBatch(nextOffset, sessionWords.length > 0 ? sessionWords : allWords);
  };

  const handleProceedToWritingPhase = () => {
    const sourceList = sessionWords.length > 0 ? sessionWords : allWords;
    const currentBatch = sourceList.slice(batchOffset, batchOffset + BATCH_SIZE);
    setQueue(currentBatch);
    setFailedInPhase([]);
    setCurrentIndex(0);
    setAppPhase('writing');
    setInputValue('');
    setShowOverrideButton(false);
    setFeedback(null);
    setHintLevel(0);
    setUsedHintOnCurrent(false);
    setIsReviewRound(false);
  };

  // ---- Review (Loop) ----
  const handleStartReview = useCallback(() => {
    const reviewQueue = failedInPhase;
    setFailedInPhase([]);
    setCurrentIndex(0);
    setShowOverrideButton(false);
    setFeedback(null);
    setSelectedMcqOption(null);
    setInputValue('');
    setHintLevel(0);
    setUsedHintOnCurrent(false);
    setIsReviewRound(true);

    if (appPhase === 'quiz_review_check') {
      setAppPhase('quiz');
      if (reviewQueue.length > 0) {
        generateMcqOptions(reviewQueue[0], sessionWords.length > 0 ? sessionWords : allWords);
      }
    } else if (appPhase === 'writing_review_check') {
      setAppPhase('writing');
    }
    setQueue(reviewQueue);
  }, [appPhase, failedInPhase, allWords, sessionWords]);

  // ---- Start hinted words review (at very end) ----
  const handleStartHintedReview = () => {
    const reviewQueue = hintedWordsQueue;
    setHintedWordsQueue([]);
    setQueue(reviewQueue);
    setFailedInPhase([]);
    setCurrentIndex(0);
    setAppPhase('writing');
    setInputValue('');
    setShowOverrideButton(false);
    setFeedback(null);
    setHintLevel(0);
    setUsedHintOnCurrent(false);
    setIsReviewRound(true);
  };

  // ---- Quiz (MCQ) ----
  const generateMcqOptions = (correctWord, allWordsContext) => {
    if (!correctWord) return;
    const potentialDistractors = allWordsContext.filter(w => w.id !== correctWord.id);
    const shuffledDistractors = [...potentialDistractors].sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [...shuffledDistractors, correctWord].sort(() => 0.5 - Math.random());
    setMcqOptions(options);
  };

  const handleMcqAnswer = useCallback((selectedWord) => {
    if (feedback !== null) return;
    const currentWord = queue[currentIndex];
    if (!currentWord) return;
    const isCorrect = selectedWord.id === currentWord.id;
    recordAttempt(isCorrect);

    setSelectedMcqOption(selectedWord);
    setFeedback(isCorrect ? 'correct' : 'incorrect');

    if (isCorrect) handleCorrectAnswer();
    else {
      handleWrongAnswer();
      if (!failedInPhase.some(w => w.id === currentWord.id)) {
        setFailedInPhase(prev => [...prev, currentWord]);
      }
    }

    setTimeout(() => {
      setFeedback(null);
      setSelectedMcqOption(null);
      if (currentIndex < queue.length - 1) {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        generateMcqOptions(queue[nextIndex], sessionWords.length > 0 ? sessionWords : allWords);
      } else {
        const finalFailed = isCorrect
          ? failedInPhase
          : (failedInPhase.some(w => w.id === currentWord.id) ? failedInPhase : [...failedInPhase, currentWord]);
        if (finalFailed.length > 0) {
          if (!isCorrect && !failedInPhase.some(w => w.id === currentWord.id)) {
            setFailedInPhase(finalFailed);
          }
          setAppPhase('quiz_review_check');
        } else {
          setAppPhase('transition_to_writing');
        }
      }
    }, 1000);
  }, [feedback, queue, currentIndex, failedInPhase, allWords, sessionWords, handleCorrectAnswer, recordAttempt]);

  // ---- Writing ----
  const insertCharacter = (char) => {
    if (feedback !== null) return;
    setInputValue(prev => prev + char);
    inputRef.current?.focus();
  };

  const handleUseHint = () => {
    const currentWord = queue[currentIndex];
    if (!currentWord || feedback !== null) return;
    const answer = getAnswer(currentWord);
    setHintLevel(prev => Math.min(prev + 1, answer.length));
    setUsedHintOnCurrent(true);

    // Mark for review at the very end — NOT in failedInPhase
    if (!hintedWordsQueue.some(w => w.id === currentWord.id)) {
      setHintedWordsQueue(prev => [...prev, currentWord]);
    }
    inputRef.current?.focus();
  };

  const proceedToNextWritingStep = useCallback((overrideFailed = null) => {
    setShowOverrideButton(false);
    setHintLevel(0);
    setUsedHintOnCurrent(false);

    if (correctTimeoutRef.current) {
      clearTimeout(correctTimeoutRef.current);
      correctTimeoutRef.current = null;
    }

    const currentFailed = overrideFailed !== null ? overrideFailed : failedInPhase;

    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setFeedback(null);
      setInputValue('');
    } else {
      if (currentFailed.length > 0) {
        setAppPhase('writing_review_check');
      } else {
        const sourceLength = (sessionWords.length > 0 ? sessionWords.length : allWords.length);
        const hasMoreWords = batchOffset + BATCH_SIZE < sourceLength;
        if (hasMoreWords) {
          setAppPhase('batch_complete');
        } else {
          // Check if there are hinted words to review
          // We check hintedWordsQueue in the render phase
          setAppPhase('victory');
        }
      }
    }
  }, [currentIndex, queue.length, failedInPhase, batchOffset, allWords.length, sessionWords.length]);

  const handleOverrideCorrect = useCallback(() => {
    const currentWord = queue[currentIndex];
    const newFailed = failedInPhase.filter(w => w.id !== currentWord.id);
    setFailedInPhase(newFailed);
    const restoredBase = streakBeforeMistakeRef.current > 0 ? streakBeforeMistakeRef.current : streak;
    const newStreak = restoredBase + 1;
    setStreak(newStreak);
    if (newStreak > bestStreak) setBestStreak(newStreak);
    const reward = [...STREAK_REWARDS].reverse().find(r => newStreak === r.threshold);
    if (reward) {
      setShowStreakPopup(reward);
      scheduleStreakPopupClose();
    }
    streakBeforeMistakeRef.current = 0;
    setTotalCorrect(prev => prev + 1);
    proceedToNextWritingStep(newFailed);
  }, [queue, currentIndex, failedInPhase, proceedToNextWritingStep, streak, bestStreak, scheduleStreakPopupClose]);

  const handleWritingSubmit = (e) => {
    e.preventDefault();

    if (feedback === 'incorrect') {
      proceedToNextWritingStep();
      return;
    }
    if (feedback === 'correct') {
      if (correctTimeoutRef.current) {
        clearTimeout(correctTimeoutRef.current);
        correctTimeoutRef.current = null;
      }
      proceedToNextWritingStep();
      return;
    }

    const currentWord = queue[currentIndex];
    const correctAnswer = getAnswer(currentWord);
    const isCorrect = checkAnswer(inputValue, correctAnswer);
    recordAttempt(isCorrect);

    setFeedback(isCorrect ? 'correct' : 'incorrect');

    if (!isCorrect) {
      handleWrongAnswer();
      if (!failedInPhase.some(w => w.id === currentWord.id)) {
        setFailedInPhase(prev => [...prev, currentWord]);
      }
      setShowOverrideButton(true);
    } else {
      if (!usedHintOnCurrent) handleCorrectAnswer();
      // Remove from failedInPhase if previously failed (review round)
      setFailedInPhase(prev => prev.filter(w => w.id !== currentWord.id));
      // If we're reviewing hinted words and got it right, remove from hinted queue
      if (isReviewRound) {
        setHintedWordsQueue(prev => prev.filter(w => w.id !== currentWord.id));
      }
      setShowOverrideButton(false);
      correctTimeoutRef.current = setTimeout(() => proceedToNextWritingStep(), 1500);
    }
  };

  const handleWritingDontKnow = useCallback(() => {
    if (feedback !== null) return;
    const currentWord = queue[currentIndex];
    if (!currentWord) return;
    setInputValue("Don't know");
    setFeedback('incorrect');
    handleWrongAnswer();
    recordAttempt(false);
    if (!failedInPhase.some(w => w.id === currentWord.id)) {
      setFailedInPhase(prev => [...prev, currentWord]);
    }
    setShowOverrideButton(true);
  }, [feedback, queue, currentIndex, failedInPhase, recordAttempt]);

  // ---- Import Handlers ----
  const handlePdfUpload = async (file) => {
    if (!file) return;
    setPdfLoading(true);
    setPdfError('');
    try {
      const words = await parseQuizletPdf(file);
      if (words.length === 0) {
        setPdfError('No words found in this PDF. Try the "Paste Text" method instead.');
      }
      setImportPreview(words);
    } catch (err) {
      console.error('PDF parsing error:', err);
      setPdfError(`Error parsing PDF: ${err.message}. Try the "Paste Text" method.`);
      setImportPreview([]);
    }
    setPdfLoading(false);
  };

  const handleTextImport = () => {
    const words = parseQuizletText(importText);
    setImportPreview(words);
  };

  const handleGenericFileUpload = async (file) => {
    if (!file) return;
    setImportFileError('');
    try {
      const content = await file.text();
      const lowerName = file.name.toLowerCase();
      let words = [];
      if (lowerName.endsWith('.json')) words = parseJsonImport(content);
      else if (lowerName.endsWith('.csv')) words = parseCsvImport(content);
      else words = parseQuizletText(content);
      if (words.length === 0) setImportFileError('No valid words found in this file.');
      setImportPreview(words);
    } catch (err) {
      setImportFileError(`Error parsing file: ${err.message}`);
      setImportPreview([]);
    }
  };

  const confirmImport = () => {
    if (importPreview.length > 0) {
      const importedWords = importPreview.map((w) => ({ term: w.term, def: w.def }));
      const baseWords = importMode === 'append' ? allWords : [];
      const mergedWords = [...baseWords, ...importedWords].map((w, i) => ({ ...w, id: i }));
      setAllWords(mergedWords);
      setSetupText(wordsToTextarea(mergedWords));
      setShowImportModal(false);
      setImportPreview([]);
      setImportText('');
      setPdfError('');
    }
  };

  const handleShuffle = () => {
    setShuffleOnStart(prev => !prev);
  };

  // ---- Effects ----
  useEffect(() => {
    if (appPhase === 'writing' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [appPhase, currentIndex]);

  useEffect(() => {
    const persistedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!persistedRaw) {
      setSetupText(wordsToTextarea(allWords));
      return;
    }
    try {
      const persisted = JSON.parse(persistedRaw);
      if (Array.isArray(persisted.words)) setAllWords(persisted.words);
      if (typeof persisted.setupText === 'string') setSetupText(persisted.setupText);
      if (typeof persisted.selectedLanguage === 'string') setSelectedLanguage(persisted.selectedLanguage);
      if (typeof persisted.direction === 'string') setDirection(persisted.direction);
      if (typeof persisted.theme === 'string') setTheme(persisted.theme);
      if (Array.isArray(persisted.customPresets)) setCustomPresets(persisted.customPresets);
      if (typeof persisted.shuffleOnStart === 'boolean') setShuffleOnStart(persisted.shuffleOnStart);
      if (persisted.importMode === 'append' || persisted.importMode === 'replace') setImportMode(persisted.importMode);
    } catch {
      setSetupText(wordsToTextarea(allWords));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      words: allWords,
      setupText,
      selectedLanguage,
      direction,
      theme,
      customPresets,
      shuffleOnStart,
      importMode,
    }));
  }, [allWords, setupText, selectedLanguage, direction, theme, customPresets, shuffleOnStart, importMode]);

  useEffect(() => {
    if (appPhase !== 'writing' || feedback === null) return;
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (correctTimeoutRef.current) {
          clearTimeout(correctTimeoutRef.current);
          correctTimeoutRef.current = null;
        }
        if (currentIndex < queue.length - 1) {
          setCurrentIndex(prev => prev + 1);
          setFeedback(null);
          setInputValue('');
          setShowOverrideButton(false);
          setHintLevel(0);
          setUsedHintOnCurrent(false);
        } else {
          if (failedInPhase.length > 0) {
            setAppPhase('writing_review_check');
          } else {
            const sourceLength = (sessionWords.length > 0 ? sessionWords.length : allWords.length);
            const hasMoreWords = batchOffset + BATCH_SIZE < sourceLength;
            if (hasMoreWords) setAppPhase('batch_complete');
            else setAppPhase('victory');
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [appPhase, feedback, currentIndex, queue.length, failedInPhase, batchOffset, allWords.length, sessionWords.length]);

  useEffect(() => {
    const transitionPhases = ['quiz_review_check', 'transition_to_writing', 'writing_review_check', 'batch_complete'];
    if (!transitionPhases.includes(appPhase)) return;
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (appPhase === 'quiz_review_check') handleStartReview();
        else if (appPhase === 'transition_to_writing') handleProceedToWritingPhase();
        else if (appPhase === 'writing_review_check') handleStartReview();
        else if (appPhase === 'batch_complete') handleNextBatch();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [appPhase, handleStartReview]);

  useEffect(() => {
    if (appPhase !== 'quiz' || feedback !== null) return;
    const handleKeyPress = (e) => {
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (mcqOptions[index]) handleMcqAnswer(mcqOptions[index]);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [appPhase, feedback, mcqOptions, handleMcqAnswer]);

  // ---- Derived ----
  const accentChars = languageOptions[selectedLanguage]?.chars || [];
  const currentBatchNum = Math.floor(batchOffset / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(allWords.length / BATCH_SIZE);
  const currentStreakReward = useMemo(() => [...STREAK_REWARDS].reverse().find(r => streak >= r.threshold) || null, [streak]);
  const isDark = theme === 'dark';

  const handleAddCustomPreset = () => {
    const label = newPresetName.trim();
    const rawChars = newPresetChars.trim();
    if (!label || !rawChars) return;
    const key = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
    const chars = rawChars.includes(' ')
      ? [...new Set(rawChars.split(/\s+/).filter(Boolean))]
      : [...new Set(rawChars.split('').filter(Boolean))];
    setCustomPresets(prev => [...prev, { key, label, chars }]);
    setSelectedLanguage(key);
    setNewPresetName('');
    setNewPresetChars('');
  };

  const handleRemoveCustomPreset = (key) => {
    setCustomPresets(prev => prev.filter(p => p.key !== key));
    if (selectedLanguage === key) setSelectedLanguage('none');
  };

  // ============================================================
  // COMPONENTS
  // ============================================================

  const StreakBadge = () => {
    if (streak < 2) return null;
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border
        ${currentStreakReward
          ? `bg-gradient-to-r ${currentStreakReward.color} text-white border-transparent shadow-lg`
          : 'bg-orange-500/15 text-orange-400 border-orange-500/20'}`}
      >
        <Flame className="w-3.5 h-3.5" />
        <span>{streak} streak</span>
        {currentStreakReward && <span>{currentStreakReward.icon}</span>}
      </div>
    );
  };

  const StreakPopup = () => {
    if (!showStreakPopup) return null;
    return (
      <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
        <div className={`bg-gradient-to-r ${showStreakPopup.color} px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3`}>
          <span className="text-3xl">{showStreakPopup.icon}</span>
          <div>
            <p className="text-white font-black text-lg">{showStreakPopup.label}</p>
            <p className="text-white/70 text-sm">{streak} correct in a row!</p>
          </div>
        </div>
      </div>
    );
  };

  const ThemeToggle = () => (
    <button
      onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      className={`p-2 rounded-lg transition-all ${isDark ? 'text-white/40 hover:text-yellow-300 hover:bg-white/5' : 'text-slate-500 hover:text-amber-500 hover:bg-slate-100'}`}
      title="Toggle theme"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );

  const HeaderInfo = () => (
    <div className={`flex justify-between items-center text-xs md:text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4" />
        <span>Batch {currentBatchNum} / {totalBatches}</span>
        <StreakBadge />
      </div>
      <div className="flex items-center gap-2">
        <div className={`px-3 py-1 rounded-lg text-xs ${isDark ? 'bg-white/5 border border-white/10 text-white/50' : 'bg-slate-100 border border-slate-200 text-slate-500'}`}>
          {appPhase.includes('writing') || appPhase === 'transition_to_writing' ? 'Phase 2: Writing' : 'Phase 1: Quiz'}
        </div>
        <div className={`px-3 py-1 rounded-lg text-xs ${isDark ? 'bg-white/5 border border-white/10 text-white/50' : 'bg-slate-100 border border-slate-200 text-slate-500'}`}>
          Accuracy {sessionAccuracy}%
        </div>
        <ThemeToggle />
        <button onClick={handleReset} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${isDark ? 'text-white/40 hover:text-white/70 hover:bg-white/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
          <ArrowLeft className="w-3.5 h-3.5" /> Home
        </button>
      </div>
    </div>
  );

  // ProgressBar: defined at module level (above App)

  const AccentsBar = () => {
    if (accentChars.length === 0) return null;
    return (
      <div className="flex gap-1.5 justify-center mb-4 flex-wrap">
        {accentChars.map(char => (
          <button key={char} type="button" onClick={() => insertCharacter(char)} disabled={feedback !== null}
            className={`w-10 h-10 rounded-lg font-medium transition-all active:scale-95 touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed
              ${isDark ? 'bg-white/5 border border-white/10 text-white/70 hover:bg-indigo-500/20 hover:text-indigo-300' : 'bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}
          >{char}</button>
        ))}
      </div>
    );
  };

  // Card: defined at module level (above App) to avoid focus-loss bug

  // ---- Import Modal ----
  const renderImportModal = () => {
    if (!showImportModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
           onClick={(e) => { if (e.target === e.currentTarget) setShowImportModal(false); }}>
        <div className={`w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-slide-up rounded-2xl
          ${isDark ? 'glass-card-elevated' : 'bg-white shadow-2xl border border-slate-200'}`}
          onClick={(e) => e.stopPropagation()}>
          <div className={`flex items-center justify-between p-6 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-indigo-500/20' : 'bg-indigo-100'}`}>
                <Upload className={`w-5 h-5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Import Vocabulary</h3>
                <p className={`text-sm ${isDark ? 'text-white/40' : 'text-slate-400'}`}>From Quizlet or any source</p>
              </div>
            </div>
            <button onClick={() => { setShowImportModal(false); setPdfError(''); }}
              className={`p-2 rounded-lg ${isDark ? 'text-white/50 hover:bg-white/5' : 'text-slate-400 hover:bg-slate-100'}`}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className={`flex border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            {['text', 'pdf', 'file'].map(tab => (
              <button key={tab} onClick={() => { setImportTab(tab); setPdfError(''); }}
                className={`flex-1 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2
                  ${importTab === tab
                    ? `text-indigo-500 border-b-2 border-indigo-500 ${isDark ? 'bg-indigo-500/5' : 'bg-indigo-50'}`
                    : `${isDark ? 'text-white/40 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'}`}`}>
                {tab === 'text'
                  ? <><FileText className="w-4 h-4" /> Paste Text</>
                  : tab === 'pdf'
                    ? <><Upload className="w-4 h-4" /> Upload PDF</>
                    : <><Upload className="w-4 h-4" /> CSV / JSON</>}
              </button>
            ))}
          </div>

          <div className="p-6 flex-1 overflow-y-auto">
            {importTab === 'text' ? (
              <div className="space-y-4">
                <p className={`text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                  Paste your Quizlet export (Tab-separated) or <code className={`px-1.5 py-0.5 rounded text-xs ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}>term - definition</code> format:
                </p>
                <textarea
                  className={`w-full h-40 p-4 rounded-xl font-mono text-sm outline-none resize-none border transition-all
                    ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/30 focus:border-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500'}`}
                  placeholder={"hello\thola\ngoodbye\tadiós\nthank you\tgracias"}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <button onClick={handleTextImport} className="btn-primary w-full"><FileText className="w-4 h-4" /> Parse Text</button>
              </div>
            ) : importTab === 'pdf' ? (
              <div className="space-y-4">
                <p className={`text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                  Upload a Quizlet PDF (Print → Save as PDF):
                </p>
                <div
                  className={`drop-zone rounded-xl p-10 text-center cursor-pointer transition-all ${isDragging ? 'drag-over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handlePdfUpload(e.dataTransfer.files[0]); }}
                >
                  <Upload className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-indigo-400/50' : 'text-indigo-300'}`} />
                  <p className={`font-medium ${isDark ? 'text-white/60' : 'text-slate-600'}`}>Drop PDF here or click to browse</p>
                  <p className={`text-sm mt-1 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Supports Quizlet exported PDFs</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ''; }} />
                {pdfLoading && (
                  <div className="text-center py-4">
                    <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto mb-2" />
                    <p className={`text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Parsing PDF...</p>
                  </div>
                )}
                {pdfError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300' : 'bg-rose-50 border border-rose-200 text-rose-600'}`}>
                    {pdfError}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className={`text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                  Upload `.csv`, `.json`, or plain text files:
                </p>
                <div
                  className={`drop-zone rounded-xl p-10 text-center cursor-pointer transition-all ${isDragging ? 'drag-over' : ''}`}
                  onClick={() => genericFileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) handleGenericFileUpload(e.dataTransfer.files[0]); }}
                >
                  <Upload className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-indigo-400/50' : 'text-indigo-300'}`} />
                  <p className={`font-medium ${isDark ? 'text-white/60' : 'text-slate-600'}`}>Drop file here or click to browse</p>
                  <p className={`text-sm mt-1 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>CSV: term,definition | JSON: [{'{'}term, def{'}'}]</p>
                </div>
                <input ref={genericFileInputRef} type="file" accept=".csv,.json,.txt,text/csv,application/json,text/plain" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleGenericFileUpload(f); e.target.value = ''; }} />
                {importFileError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300' : 'bg-rose-50 border border-rose-200 text-rose-600'}`}>
                    {importFileError}
                  </div>
                )}
              </div>
            )}

            {importPreview.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className={`font-semibold text-sm uppercase tracking-wider ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                    Preview ({importPreview.length} words)
                  </h4>
                  <div className="flex items-center gap-2">
                    <select
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value)}
                      className={`text-sm rounded-lg px-2 py-2 border outline-none ${isDark ? 'bg-white/5 border-white/10 text-white/80' : 'bg-white border-slate-200 text-slate-700'}`}
                    >
                      <option value="append">Add to current list</option>
                      <option value="replace">Replace current list</option>
                    </select>
                    <button onClick={confirmImport} className="btn-success text-sm py-2 px-4"><Check className="w-4 h-4" /> Confirm Import</button>
                  </div>
                </div>
                <div className={`rounded-xl border max-h-48 overflow-y-auto ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  {importPreview.slice(0, 20).map((w, i) => (
                    <div key={i} className={`flex items-center py-2 px-4 border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                      <span className={`text-xs w-6 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>{i + 1}</span>
                      <span className={`flex-1 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>{w.term}</span>
                      <span className={`flex-1 text-right ${isDark ? 'text-indigo-400/70' : 'text-indigo-600/70'}`}>{w.def}</span>
                    </div>
                  ))}
                  {importPreview.length > 20 && <div className={`text-center py-2 text-sm ${isDark ? 'text-white/30' : 'text-slate-400'}`}>... and {importPreview.length - 20} more</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================
  // SCREENS
  // ============================================================

  // --- SETUP ---
  if (appPhase === 'setup') {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'gradient-bg' : 'bg-gradient-to-br from-slate-50 to-indigo-50'}`}>
        {renderImportModal()}
        <StreakPopup />
        <div className="w-full max-w-2xl animate-fade-in">
          <Card isDark={isDark} elevated>
            <div className="p-8 pb-0">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <Book className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className={`text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>VocabMaster</h1>
                    <p className={`text-sm ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Learn any language, {BATCH_SIZE} words at a time</p>
                  </div>
                </div>
                <ThemeToggle />
              </div>

              <div className={`p-4 rounded-xl mb-6 flex gap-3 ${isDark ? 'bg-indigo-500/10 border border-indigo-500/20' : 'bg-indigo-50 border border-indigo-200'}`}>
                <Layers className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                <p className={`text-sm ${isDark ? 'text-indigo-200/80' : 'text-indigo-700'}`}>
                  This session has <strong>{parsedSetupWords.length} words</strong>.
                  The program creates <strong>{Math.ceil(parsedSetupWords.length / BATCH_SIZE || 0)} batches</strong> in list order.
                  {shuffleOnStart ? ' Session shuffle is ON.' : ' Session shuffle is OFF.'}
                  Edit the list below or import from Quizlet / CSV / JSON.
                </p>
              </div>
            </div>

            <div className="px-8 pb-4 flex flex-wrap gap-3 items-center">
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                <Globe className={`w-4 h-4 ${isDark ? 'text-white/40' : 'text-slate-400'}`} />
                <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)}
                  className={`bg-transparent text-sm outline-none cursor-pointer ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
                  {Object.entries(languageOptions).map(([key, val]) => (
                    <option key={key} value={key} className={isDark ? 'bg-slate-800' : 'bg-white'}>{val.label}</option>
                  ))}
                  <option value="__add_new__" className={isDark ? 'bg-slate-800' : 'bg-white'}>➕ Add a language...</option>
                </select>
              </div>

              <button onClick={() => setDirection(d => d === 'term_to_def' ? 'def_to_term' : 'term_to_def')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-all text-sm
                  ${isDark ? 'bg-white/5 border border-white/10 text-white/60 hover:bg-cyan-500/10 hover:text-cyan-300' : 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-cyan-50 hover:text-cyan-600'}`}>
                <RefreshCw className="w-4 h-4" /> {direction === 'term_to_def' ? 'Term → Def' : 'Def → Term'}
              </button>

              <button onClick={() => setShowImportModal(true)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-all text-sm
                  ${isDark ? 'bg-white/5 border border-white/10 text-white/60 hover:bg-indigo-500/10 hover:text-indigo-300' : 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                <Upload className="w-4 h-4" /> Import
              </button>

              <button onClick={handleShuffle} disabled={allWords.length === 0}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 transition-all text-sm active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed
                  ${shuffleOnStart
                    ? (isDark ? 'bg-purple-500/20 border border-purple-400/40 text-purple-200' : 'bg-purple-100 border border-purple-300 text-purple-700')
                    : (isDark ? 'bg-white/5 border border-white/10 text-white/60 hover:bg-purple-500/10 hover:text-purple-300' : 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-purple-50 hover:text-purple-600')}`}>
                <Shuffle className="w-4 h-4" /> Session Shuffle: {shuffleOnStart ? 'ON' : 'OFF'}
              </button>
            </div>

            {selectedLanguage === '__add_new__' && (
              <div className="px-8 pb-4 animate-slide-down">
                <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
                    New language — accents / alphabet (Russian, Chinese, etc.)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="Language name"
                      className={`p-3 rounded-lg border outline-none text-sm ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/30' : 'bg-white border-slate-200 text-slate-700 placeholder-slate-400'}`}
                    />
                    <input
                      value={newPresetChars}
                      onChange={(e) => setNewPresetChars(e.target.value)}
                      placeholder="Chars (all together or space-separated)"
                      className={`p-3 rounded-lg border outline-none text-sm ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/30' : 'bg-white border-slate-200 text-slate-700 placeholder-slate-400'}`}
                    />
                  </div>
                  <button onClick={handleAddCustomPreset} className="btn-secondary w-full">Add Custom Language</button>
                </div>
              </div>
            )}
            {customPresets.length > 0 && selectedLanguage !== '__add_new__' && (
              <div className="px-8 pb-2">
                <div className="flex flex-wrap gap-2">
                  {customPresets.map(p => (
                    <button key={p.key} onClick={() => handleRemoveCustomPreset(p.key)}
                      className={`text-xs px-2 py-1 rounded-lg border ${isDark ? 'text-white/60 border-white/15 hover:bg-white/10' : 'text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                      ✕ Remove {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-8 pb-4">
              <textarea
                className={`w-full h-52 p-4 rounded-xl font-mono text-sm outline-none resize-none border transition-all
                  ${isDark ? 'bg-white/5 border-white/10 text-white/80 placeholder-white/25 focus:border-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-700 placeholder-slate-400 focus:border-indigo-500'}`}
                placeholder={"hello - hola\ngoodbye - adiós\nthank you - gracias / merci"}
                value={setupText}
                onChange={(e) => setSetupText(e.target.value)}
              />
            </div>

            <div className="px-8 pb-8">
              <button onClick={() => {
                const words = parseSetupText(setupText);
                setAllWords(words);
                handleStartFullSession(words);
              }} disabled={parsedSetupWords.length === 0} className="btn-primary w-full text-lg py-4">
                Start Learning ({parsedSetupWords.length} words) <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // --- QUIZ REVIEW CHECK ---
  if (appPhase === 'quiz_review_check') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${isDark ? 'gradient-bg' : 'bg-gradient-to-br from-slate-50 to-amber-50'}`}>
        <StreakPopup />
        <Card isDark={isDark} elevated className="w-full max-w-md p-8 text-center animate-slide-up">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${isDark ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
            <RefreshCw className={`w-8 h-8 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>Mistakes Found</h2>
          <p className={`mb-6 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
            You missed <strong className="text-amber-500">{failedInPhase.length} word{failedInPhase.length > 1 ? 's' : ''}</strong>.
          </p>
          <div className={`rounded-xl p-4 mb-6 max-h-40 overflow-y-auto text-left ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
            {failedInPhase.map(w => (
              <div key={w.id} className={`text-sm py-1.5 border-b last:border-0 ${isDark ? 'border-amber-500/10 text-amber-300/80' : 'border-amber-100 text-amber-800'}`}>
                • {w.term} → <span className="opacity-60">{w.def}</span>
              </div>
            ))}
          </div>
          <button onClick={handleStartReview} className="btn-warning w-full"><RefreshCw className="w-4 h-4" /> Review Mistakes Now</button>
          <p className={`text-xs text-center mt-3 ${isDark ? 'text-white/25' : 'text-slate-400'}`}>Press <kbd className={`px-2 py-0.5 rounded text-xs ${isDark ? 'bg-white/10 border border-white/10' : 'bg-slate-200'}`}>Enter</kbd> to continue</p>
        </Card>
      </div>
    );
  }

  // --- QUIZ ---
  if (appPhase === 'quiz') {
    const currentWord = queue[currentIndex];
    if (!currentWord) {
      return <div className={`min-h-screen flex items-center justify-center ${isDark ? 'gradient-bg' : 'bg-slate-50'}`}>
        <Card isDark={isDark} className="p-8 text-center"><p className={isDark ? 'text-white/60' : 'text-slate-600'}>Error</p><button onClick={handleReset} className="btn-primary mt-4">Home</button></Card>
      </div>;
    }

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${isDark ? 'gradient-bg' : 'bg-gradient-to-br from-slate-50 to-indigo-50'}`}>
        <StreakPopup />
        <div className="w-full max-w-2xl space-y-4 animate-fade-in">
          <HeaderInfo />
          <ProgressBar isDark={isDark} current={currentIndex + 1} total={queue.length} color="from-indigo-500 to-purple-500" />

          <Card isDark={isDark} elevated className="min-h-[380px] flex flex-col items-center justify-center p-8 relative">
            {isReviewRound && (
              <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border
                ${isDark ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                <RefreshCw className="w-3 h-3" /> Review
              </div>
            )}

            <span className={`text-xs uppercase tracking-[0.2em] font-bold mb-4 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Find the translation</span>
            <h2 className={`text-3xl md:text-4xl font-black text-center mb-10 ${isDark ? 'text-white' : 'text-slate-800'}`}>{getQuestion(currentWord)}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              {mcqOptions.map((option, index) => {
                let cls = isDark
                  ? "bg-white/5 border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/30 text-white/80"
                  : "bg-white border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700";
                const isSelected = selectedMcqOption?.id === option.id;
                if (feedback !== null) {
                  if (option.id === currentWord.id) {
                    cls = isDark ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500/30";
                  } else if (isSelected) {
                    cls = (isDark ? "bg-rose-500/15 border-rose-500/50 text-rose-300" : "bg-rose-50 border-rose-500 text-rose-700") + " ring-1 ring-rose-500/30 animate-shake";
                  } else {
                    cls = isDark ? "bg-white/[0.02] border-white/5 text-white/20" : "bg-slate-50 border-slate-100 text-slate-300";
                  }
                }
                return (
                  <button key={option.id} disabled={feedback !== null} onClick={() => handleMcqAnswer(option)}
                    className={`quiz-option p-4 rounded-xl border-2 text-left font-medium transition-all duration-200 relative ${cls}`}>
                    <span className={`absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${isDark ? 'bg-white/10 text-white/40' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</span>
                    <div className="pl-7">{getOptionDisplay(option)}</div>
                  </button>
                );
              })}
            </div>
            {feedback === null && (
              <button
                type="button"
                onClick={() => handleMcqAnswer({ id: -1 })}
                className={`mt-4 w-full rounded-xl border-2 px-4 py-3 font-semibold transition-all
                  ${isDark
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                    : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'}`}
              >
                <X className="w-4 h-4 inline-block mr-2" />
                Don't know (mark false)
              </button>
            )}

            {feedback === null && (
              <p className={`text-xs text-center mt-6 ${isDark ? 'text-white/20' : 'text-slate-400'}`}>
                Use keys <kbd className={`px-1.5 py-0.5 rounded mx-0.5 ${isDark ? 'bg-white/10 border border-white/10' : 'bg-slate-200'}`}>1</kbd>
                <kbd className={`px-1.5 py-0.5 rounded mx-0.5 ${isDark ? 'bg-white/10 border border-white/10' : 'bg-slate-200'}`}>2</kbd>
                <kbd className={`px-1.5 py-0.5 rounded mx-0.5 ${isDark ? 'bg-white/10 border border-white/10' : 'bg-slate-200'}`}>3</kbd>
                <kbd className={`px-1.5 py-0.5 rounded mx-0.5 ${isDark ? 'bg-white/10 border border-white/10' : 'bg-slate-200'}`}>4</kbd> or click
              </p>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // --- TRANSITION ---
  if (appPhase === 'transition_to_writing') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 text-center ${isDark ? 'gradient-bg' : 'bg-gradient-to-br from-slate-50 to-indigo-50'}`}>
        <StreakPopup />
        <Card isDark={isDark} elevated className="p-12 max-w-lg w-full animate-bounce-in">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${isDark ? 'bg-indigo-500/20' : 'bg-indigo-100'}`}>
            <Edit3 className={`w-8 h-8 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>Quiz Passed! ✨</h2>
          <p className={`mb-4 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Now let's write to solidify your memory.</p>
          <div className="flex justify-center gap-6 mb-8">
            <div className="text-center">
              <div className="text-2xl font-black text-indigo-500">{totalCorrect}</div>
              <div className={`text-xs uppercase tracking-wider ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Correct</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-orange-500">{bestStreak}</div>
              <div className={`text-xs uppercase tracking-wider ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Best Streak</div>
            </div>
          </div>
          <button onClick={handleProceedToWritingPhase} className="btn-primary w-full">Start Writing <ChevronRight className="w-4 h-4" /></button>
        </Card>
      </div>
    );
  }

  // --- WRITING REVIEW CHECK ---
  if (appPhase === 'writing_review_check') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${isDark ? 'gradient-bg' : 'bg-gradient-to-br from-slate-50 to-amber-50'}`}>
        <Card isDark={isDark} elevated className="w-full max-w-md p-8 text-center animate-slide-up">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${isDark ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
            <Edit3 className={`w-8 h-8 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>Some Mistakes...</h2>
          <p className={`mb-6 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
            <strong className="text-amber-500">{failedInPhase.length}</strong> word{failedInPhase.length > 1 ? 's' : ''} left to correct.
          </p>
          <div className={`rounded-xl p-4 mb-6 max-h-40 overflow-y-auto text-left ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
            {failedInPhase.map(w => (
              <div key={w.id} className={`text-sm py-1.5 border-b last:border-0 ${isDark ? 'border-amber-500/10 text-amber-300/80' : 'border-amber-100 text-amber-800'}`}>• {w.term}</div>
            ))}
          </div>
          <button onClick={handleStartReview} className="btn-warning w-full"><Edit3 className="w-4 h-4" /> Fix Mistakes</button>
        </Card>
      </div>
    );
  }

  // --- WRITING ---
  if (appPhase === 'writing') {
    const currentWord = queue[currentIndex];
    if (!currentWord) {
      return <div className={`min-h-screen flex items-center justify-center ${isDark ? 'gradient-bg' : 'bg-slate-50'}`}>
        <Card isDark={isDark} className="p-8 text-center"><p className={isDark ? 'text-white/60' : 'text-slate-600'}>Error</p><button onClick={handleReset} className="btn-primary mt-4">Home</button></Card>
      </div>;
    }

    const correctAnswer = getAnswer(currentWord);
    const isLocked = feedback === 'correct' || feedback === 'incorrect';

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${isDark ? 'gradient-bg' : 'bg-gradient-to-br from-slate-50 to-emerald-50'}`}>
        <StreakPopup />
        <div className="w-full max-w-xl space-y-4 animate-fade-in">
          <HeaderInfo />
          <ProgressBar isDark={isDark} current={currentIndex + 1} total={queue.length} color="from-emerald-500 to-teal-400" />

          <Card isDark={isDark} elevated className="p-8 relative">
            {isReviewRound && (
              <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border
                ${isDark ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                <RefreshCw className="w-3 h-3" /> Correction
              </div>
            )}

            <span className={`text-xs uppercase tracking-[0.2em] font-bold mb-2 block text-center ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Translate this term</span>
            <h2 className={`text-3xl font-black text-center mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>{getQuestion(currentWord)}</h2>

            {hintLevel > 0 && feedback === null && (
              <div className="text-center mb-2">
                <span className={`font-mono text-lg tracking-[0.3em] ${isDark ? 'text-indigo-400/60' : 'text-indigo-500/60'}`}>
                  {getHintText(currentWord, hintLevel)}
                </span>
              </div>
            )}

            {feedback === null && (
              <div className="flex justify-center mb-4">
                <button type="button" onClick={handleUseHint}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all
                    ${isDark ? 'text-white/30 hover:text-indigo-400 hover:bg-indigo-500/10' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                  <Eye className="w-3.5 h-3.5" />
                  Hint ({hintLevel}/{correctAnswer.length})
                  {usedHintOnCurrent && <span className="text-amber-400 ml-1">⚠ reviewed at end</span>}
                </button>
              </div>
            )}

            <form onSubmit={handleWritingSubmit} className="space-y-4">
              <AccentsBar />
              <div className="relative">
                <input ref={inputRef} autoFocus type="text" value={inputValue}
                  onChange={(e) => { if (isLocked) return; setInputValue(e.target.value); }}
                  disabled={isLocked} readOnly={isLocked}
                  placeholder="Type the translation..."
                  className={`w-full p-4 text-center text-xl rounded-xl border-2 outline-none transition-all
                    ${feedback === 'correct'
                      ? (isDark ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300 ring-4 ring-emerald-500/20' : 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-4 ring-emerald-500/20')
                      : feedback === 'incorrect'
                        ? (isDark ? 'border-rose-500 bg-rose-500/10 text-rose-300 ring-4 ring-rose-500/20' : 'border-rose-500 bg-rose-50 text-rose-700 ring-4 ring-rose-500/20')
                        : (isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/30 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10')}`}
                />
                {!isLocked && <Keyboard className={`absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none ${isDark ? 'text-white/15' : 'text-slate-300'}`} />}
              </div>

              {feedback === 'incorrect' && (
                <div className={`p-4 rounded-xl text-center animate-slide-down ${isDark ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-rose-50 border border-rose-200'}`}>
                  <p className={`text-xs font-bold uppercase mb-1 tracking-wide ${isDark ? 'text-rose-400/60' : 'text-rose-400'}`}>Correct answer:</p>
                  <p className={`text-xl font-bold ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>{correctAnswer}</p>
                </div>
              )}

              <div className="flex gap-3">
                {feedback === 'incorrect' && (
                  <>
                    {showOverrideButton && (
                      <button onClick={handleOverrideCorrect} type="button" className="btn-outline flex-1">
                        <Check className='w-4 h-4' /> I was right
                      </button>
                    )}
                    <button onClick={() => proceedToNextWritingStep()} type="button" className={`btn-secondary flex-1 ${showOverrideButton ? '' : 'w-full'}`}>
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                {feedback !== 'incorrect' && (
                  <>
                    <button disabled={feedback === 'correct' || inputValue.trim() === ''} className={`${feedback === 'correct' ? 'btn-success' : 'btn-primary'} flex-1`} type="submit">
                      {feedback === 'correct' ? <><Check className='w-5 h-5' /> Correct!</> : 'Submit'}
                    </button>
                    <button
                      type="button"
                      onClick={handleWritingDontKnow}
                      disabled={feedback === 'correct'}
                      className="btn-secondary flex-1"
                    >
                      <X className="w-4 h-4" /> Don't know
                    </button>
                  </>
                )}
              </div>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // --- BATCH COMPLETE ---
  if (appPhase === 'batch_complete') {
    const nextBatchStart = batchOffset + BATCH_SIZE + 1;
    const nextBatchEnd = Math.min(nextBatchStart + BATCH_SIZE - 1, allWords.length);
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 text-center ${isDark ? 'gradient-bg' : 'bg-gradient-to-br from-slate-50 to-emerald-50'}`}>
        <StreakPopup />
        <Card isDark={isDark} elevated className="p-12 max-w-lg w-full animate-bounce-in">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}>
            <Check className={`w-8 h-8 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>Batch Complete! 🎉</h2>
          <div className="flex justify-center gap-6 mb-6">
            <div className="text-center"><div className="text-2xl font-black text-emerald-500">{totalCorrect}</div><div className={`text-xs uppercase ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Correct</div></div>
            <div className="text-center"><div className="text-2xl font-black text-orange-500 flex items-center justify-center gap-1"><Flame className="w-5 h-5" />{bestStreak}</div><div className={`text-xs uppercase ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Best Streak</div></div>
          </div>
          <p className={`mb-8 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
            Ready for batch <strong className="text-indigo-500">{Math.floor(batchOffset / BATCH_SIZE) + 2}</strong>? Words <strong className="text-indigo-500">{nextBatchStart}–{nextBatchEnd}</strong>.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleReset} className="btn-secondary flex-1">Stop Here</button>
            <button onClick={handleNextBatch} className="btn-primary flex-1">Next Batch <ChevronRight className="w-4 h-4" /></button>
          </div>
        </Card>
      </div>
    );
  }

  // --- VICTORY ---
  if (appPhase === 'victory') {
    // If there are hinted words pending review, show review screen instead
    if (hintedWordsQueue.length > 0) {
      return (
        <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${isDark ? 'gradient-bg' : 'bg-gradient-to-br from-slate-50 to-purple-50'}`}>
          <Card isDark={isDark} elevated className="w-full max-w-md p-8 text-center animate-slide-up">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
              <Eye className={`w-8 h-8 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>Almost There! 👀</h2>
            <p className={`mb-6 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
              You used hints on <strong className="text-purple-500">{hintedWordsQueue.length} word{hintedWordsQueue.length > 1 ? 's' : ''}</strong>. Write them without help to finish!
            </p>
            <div className={`rounded-xl p-4 mb-6 max-h-40 overflow-y-auto text-left ${isDark ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50 border border-purple-200'}`}>
              {hintedWordsQueue.map(w => (
                <div key={w.id} className={`text-sm py-1.5 border-b last:border-0 ${isDark ? 'border-purple-500/10 text-purple-300/80' : 'border-purple-100 text-purple-800'}`}>
                  • {w.term}
                </div>
              ))}
            </div>
            <button onClick={handleStartHintedReview} className="btn-primary w-full">
              <Edit3 className="w-4 h-4" /> Write Them Now
            </button>
          </Card>
        </div>
      );
    }

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden ${isDark ? 'gradient-bg' : 'bg-gradient-to-br from-slate-50 to-emerald-50'}`}>
        {[...Array(12)].map((_, i) => (
          <div key={i} className="particle" style={{
            left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%`,
            background: ['#818cf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'][i % 5],
            animationDelay: `${Math.random() * 3}s`, animationDuration: `${2 + Math.random() * 3}s`,
          }} />
        ))}
        <div className="text-center animate-bounce-in relative z-10">
          <div className="w-32 h-32 bg-gradient-to-br from-emerald-500 to-teal-400 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl trophy-glow">
            <Trophy className="w-16 h-16 text-white" />
          </div>
          <h1 className={`text-5xl font-black mb-4 ${isDark ? 'text-white' : 'text-slate-800'}`}>Amazing! 🏆</h1>
          <p className={`text-xl mb-6 max-w-lg mx-auto ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
            You've conquered all <strong className="text-emerald-500">{allWords.length}</strong> words!
          </p>
          <div className="flex justify-center gap-8 mb-10">
            <div className="text-center"><div className="text-3xl font-black text-indigo-500">{totalCorrect}</div><div className={`text-xs uppercase ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Correct</div></div>
            <div className="text-center"><div className="text-3xl font-black text-orange-500 flex items-center justify-center gap-1"><Flame className="w-6 h-6" />{bestStreak}</div><div className={`text-xs uppercase ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Best Streak</div></div>
            <div className="text-center"><div className="text-3xl font-black text-emerald-500">{allWords.length}</div><div className={`text-xs uppercase ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Mastered</div></div>
          </div>
          <div className="flex gap-4 justify-center flex-col sm:flex-row">
            <button onClick={handleReset} className="btn-primary">Back to Home</button>
            <button onClick={() => handleStartFullSession(allWords)} className="btn-secondary"><RefreshCw className="w-4 h-4" /> Start Over</button>
          </div>
        </div>
      </div>
    );
  }

  return <div className={`min-h-screen flex items-center justify-center ${isDark ? 'gradient-bg' : 'bg-slate-50'}`}><div className={isDark ? 'text-white/30' : 'text-slate-400'}>Loading...</div></div>;
}