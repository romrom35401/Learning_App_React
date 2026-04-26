import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Book, Check, X, RefreshCw, ChevronRight, Edit3, Trophy,
  Keyboard, Layers, Shuffle, Upload, FileText, Globe, ArrowLeft,
  Eye, Flame, Zap, Star, Award
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import './App.css';

// PDF.js worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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

// Normalize answer for comparison
const normalizeAnswer = (answer) => answer.trim().toLowerCase();

// Check answer against multiple valid answers separated by '/'
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

// --- Quizlet PDF Parser ---
const parseQuizletPdf = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const words = [];

  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');

    const matches = text.matchAll(/(\d+)\.\s*(.+?)(?=\d+\.|$)/g);
    for (const match of matches) {
      const fullLine = match[2].trim();
      if (/^\d+\s*\/\s*\d+$/.test(fullLine)) continue;
      if (fullLine.startsWith('Study online at')) continue;
      if (fullLine.length > 0) {
        words.push({ rawLine: fullLine, num: parseInt(match[1]) });
      }
    }
  }

  const result = words
    .filter(w => !(/^\d+\s*\/\s*\d+$/.test(w.rawLine)))
    .map((w, idx) => {
      const line = w.rawLine;

      if (line.includes('\t')) {
        const parts = line.split('\t');
        return { id: idx, term: parts[0].trim(), def: parts.slice(1).join('\t').trim() };
      }

      if (line.includes(' - ')) {
        const dashIdx = line.indexOf(' - ');
        return { id: idx, term: line.slice(0, dashIdx).trim(), def: line.slice(dashIdx + 3).trim() };
      }

      const midPoint = findLanguageBoundary(line);
      if (midPoint > 0 && midPoint < line.length - 1) {
        return { id: idx, term: line.slice(0, midPoint).trim(), def: line.slice(midPoint).trim() };
      }

      const words_arr = line.split(/\s+/);
      const mid = Math.ceil(words_arr.length / 2);
      return {
        id: idx,
        term: words_arr.slice(0, mid).join(' '),
        def: words_arr.slice(mid).join(' ')
      };
    })
    .filter(w => w.term && w.def);

  return result;
};

const findLanguageBoundary = (line) => {
  const foreignIndicators = [
    /\s(le|la|les|un|une|des|du|de|l'|en|au|aux)\s/i,
    /\s(el|la|los|las|un|una|unos|unas|del|de|en|al)\s/i,
    /\s(der|die|das|ein|eine|des|dem|den)\s/i,
    /\s(il|lo|la|i|gli|le|un|una|del|di|in|al)\s/i,
  ];

  for (const pattern of foreignIndicators) {
    const match = line.match(pattern);
    if (match && match.index > 2) {
      return match.index;
    }
  }

  for (let i = 3; i < line.length - 3; i++) {
    if (line[i] === ' ' && /[àâéèêëïîôùûçæœáéíóúüñäöüß]/.test(line.slice(i + 1, i + 10))) {
      return i;
    }
  }

  return -1;
};

// --- Parse Quizlet text export ---
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


// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  // Phases: setup, quiz, quiz_review_check, transition_to_writing, writing, writing_review_check, batch_complete, victory
  const [appPhase, setAppPhase] = useState('setup');
  const [allWords, setAllWords] = useState([]);
  const [batchOffset, setBatchOffset] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState('spanish');

  // Language direction: 'term_to_def' = show term, answer is def. 'def_to_term' = show def, answer is term.
  const [direction, setDirection] = useState('term_to_def');

  const [queue, setQueue] = useState([]);
  const [failedInPhase, setFailedInPhase] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [inputValue, setInputValue] = useState('');

  const [mcqOptions, setMcqOptions] = useState([]);
  const inputRef = useRef(null);
  const correctTimeoutRef = useRef(null);
  const [showOverrideButton, setShowOverrideButton] = useState(false);
  const [selectedMcqOption, setSelectedMcqOption] = useState(null);

  // Hint system
  const [hintLevel, setHintLevel] = useState(0); // 0 = no hint, 1+ = number of letters revealed
  const [usedHint, setUsedHint] = useState(false); // did user use hint on current word?
  const [hintedWords, setHintedWords] = useState(new Set()); // words that used hints - must be reviewed

  // Streak system
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [showStreakPopup, setShowStreakPopup] = useState(null); // streak reward data to show

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState('text');
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Helper: get question and answer based on direction
  const getQuestion = (word) => direction === 'term_to_def' ? word.term : word.def;
  const getAnswer = (word) => direction === 'term_to_def' ? word.def : word.term;
  const getOptionDisplay = (word) => direction === 'term_to_def' ? word.def : word.term;

  // Get hint text for current word
  const getHintText = useCallback((word, level) => {
    if (!word || level <= 0) return '';
    const answer = getAnswer(word);
    const chars = answer.split('');
    return chars.map((c, i) => i < level ? c : '_').join('');
  }, [direction]);

  // ---- Streak helpers ----
  const handleCorrectAnswer = useCallback(() => {
    const newStreak = streak + 1;
    setStreak(newStreak);
    setTotalCorrect(prev => prev + 1);
    if (newStreak > bestStreak) setBestStreak(newStreak);

    // Check for streak rewards
    const reward = [...STREAK_REWARDS].reverse().find(r => newStreak === r.threshold);
    if (reward) {
      setShowStreakPopup(reward);
      setTimeout(() => setShowStreakPopup(null), 2000);
    }
  }, [streak, bestStreak]);

  const handleWrongAnswer = () => {
    setStreak(0);
  };

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
    setHintLevel(0);
    setUsedHint(false);
    setHintedWords(new Set());
  };

  // ---- Batch Management ----
  const handleStartFullSession = (customList = null) => {
    const listToUse = customList || allWords;
    if (listToUse.length === 0) return;
    const shuffledList = shuffleArray(listToUse);
    setAllWords(shuffledList);
    setBatchOffset(0);
    setStreak(0);
    setBestStreak(0);
    setTotalCorrect(0);
    setHintedWords(new Set());
    startBatch(0, shuffledList);
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
    setUsedHint(false);
    if (nextBatch.length > 0) {
      generateMcqOptions(nextBatch[0], sourceList);
    }
  };

  const handleNextBatch = () => {
    const nextOffset = batchOffset + BATCH_SIZE;
    setBatchOffset(nextOffset);
    startBatch(nextOffset, allWords);
  };

  const handleProceedToWritingPhase = () => {
    const currentBatch = allWords.slice(batchOffset, batchOffset + BATCH_SIZE);
    setQueue(currentBatch);
    setFailedInPhase([]);
    setCurrentIndex(0);
    setAppPhase('writing');
    setInputValue('');
    setShowOverrideButton(false);
    setFeedback(null);
    setHintLevel(0);
    setUsedHint(false);
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
    setUsedHint(false);

    if (appPhase === 'quiz_review_check') {
      setAppPhase('quiz');
      if (reviewQueue.length > 0) {
        generateMcqOptions(reviewQueue[0], allWords);
      }
    } else if (appPhase === 'writing_review_check') {
      setAppPhase('writing');
    }
    setQueue(reviewQueue);
  }, [appPhase, failedInPhase, allWords]);

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

    setSelectedMcqOption(selectedWord);
    setFeedback(isCorrect ? 'correct' : 'incorrect');

    if (isCorrect) {
      handleCorrectAnswer();
    } else {
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
        generateMcqOptions(queue[nextIndex], allWords);
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
  }, [feedback, queue, currentIndex, failedInPhase, allWords, handleCorrectAnswer]);

  // ---- Writing ----
  const insertCharacter = (char) => {
    if (feedback === 'incorrect') return; // Don't allow inserting when locked
    setInputValue(prev => prev + char);
    inputRef.current?.focus();
  };

  const handleUseHint = () => {
    const currentWord = queue[currentIndex];
    if (!currentWord || feedback !== null) return;
    
    const answer = getAnswer(currentWord);
    const maxHint = answer.length;
    const newLevel = Math.min(hintLevel + 1, maxHint);
    setHintLevel(newLevel);
    setUsedHint(true);
    
    // Mark this word as hinted — it must be reviewed
    setHintedWords(prev => new Set(prev).add(currentWord.id));
    
    // Add to failed if not already there
    if (!failedInPhase.some(w => w.id === currentWord.id)) {
      setFailedInPhase(prev => [...prev, currentWord]);
    }
    
    inputRef.current?.focus();
  };

  const proceedToNextWritingStep = useCallback((overrideFailed = null) => {
    setShowOverrideButton(false);
    setHintLevel(0);
    setUsedHint(false);

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
        const hasMoreWords = batchOffset + BATCH_SIZE < allWords.length;
        if (hasMoreWords) {
          setAppPhase('batch_complete');
        } else {
          setAppPhase('victory');
        }
      }
    }
  }, [currentIndex, queue.length, failedInPhase, batchOffset, allWords.length]);

  const handleOverrideCorrect = useCallback(() => {
    const currentWord = queue[currentIndex];
    const newFailed = failedInPhase.filter(w => w.id !== currentWord.id);
    setFailedInPhase(newFailed);
    handleCorrectAnswer(); // Give them the streak credit
    proceedToNextWritingStep(newFailed);
  }, [queue, currentIndex, failedInPhase, proceedToNextWritingStep, handleCorrectAnswer]);

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

    setFeedback(isCorrect ? 'correct' : 'incorrect');

    if (!isCorrect) {
      handleWrongAnswer();
      if (!failedInPhase.some(w => w.id === currentWord.id)) {
        setFailedInPhase(prev => [...prev, currentWord]);
      }
      setShowOverrideButton(true);
    } else {
      if (!usedHint) {
        handleCorrectAnswer();
      }
      setFailedInPhase(prev => prev.filter(w => w.id !== currentWord.id));
      setShowOverrideButton(false);
      correctTimeoutRef.current = setTimeout(() => proceedToNextWritingStep(), 1500);
    }
  };

  // ---- Import Handlers ----
  const handlePdfUpload = async (file) => {
    if (!file) return;
    // Accept any file that looks like a PDF
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) return;
    setPdfLoading(true);
    try {
      const words = await parseQuizletPdf(file);
      setImportPreview(words);
    } catch (err) {
      console.error('PDF parsing error:', err);
      setImportPreview([]);
    }
    setPdfLoading(false);
    // Reset file input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTextImport = () => {
    const words = parseQuizletText(importText);
    setImportPreview(words);
  };

  const confirmImport = () => {
    if (importPreview.length > 0) {
      setAllWords(importPreview.map((w, i) => ({ ...w, id: i })));
      setShowImportModal(false);
      setImportPreview([]);
      setImportText('');
    }
  };

  const handleShuffle = () => {
    setAllWords(prev => shuffleArray(prev));
  };

  // ---- Effects ----

  useEffect(() => {
    if (appPhase === 'writing' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [appPhase, currentIndex]);

  // Global Enter key for writing feedback
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
          setUsedHint(false);
        } else {
          if (failedInPhase.length > 0) {
            setAppPhase('writing_review_check');
          } else {
            const hasMoreWords = batchOffset + BATCH_SIZE < allWords.length;
            if (hasMoreWords) {
              setAppPhase('batch_complete');
            } else {
              setAppPhase('victory');
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [appPhase, feedback, currentIndex, queue.length, failedInPhase, batchOffset, allWords.length]);

  // Global Enter on transition screens
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

  // Keyboard 1-4 for MCQ
  useEffect(() => {
    if (appPhase !== 'quiz' || feedback !== null) return;

    const handleKeyPress = (e) => {
      if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (mcqOptions[index]) {
          handleMcqAnswer(mcqOptions[index]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [appPhase, feedback, mcqOptions, handleMcqAnswer]);

  // ---- Derived ----
  const accentChars = ACCENT_PRESETS[selectedLanguage]?.chars || [];
  const currentBatchNum = Math.floor(batchOffset / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(allWords.length / BATCH_SIZE);

  // Current streak reward level
  const currentStreakReward = useMemo(() => {
    return [...STREAK_REWARDS].reverse().find(r => streak >= r.threshold) || null;
  }, [streak]);

  // ============================================================
  // COMPONENTS
  // ============================================================

  const StreakBadge = () => {
    if (streak < 2) return null;
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border animate-pulse-glow
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

  // Streak popup notification
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

  const HeaderInfo = () => (
    <div className="flex justify-between items-center text-white/40 text-xs md:text-sm font-semibold uppercase tracking-wider mb-3">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4" />
        <span>Batch {currentBatchNum} / {totalBatches}</span>
        <StreakBadge />
      </div>
      <div className="flex items-center gap-3">
        <div className="bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-white/50">
          {appPhase.includes('writing') || appPhase === 'transition_to_writing' ? 'Phase 2: Writing' : 'Phase 1: Quiz'}
        </div>
        <button onClick={handleReset} className="btn-ghost text-xs" title="Back to home">
          <ArrowLeft className="w-3.5 h-3.5" /> Home
        </button>
      </div>
    </div>
  );

  const ProgressBar = ({ current, total, color = "from-indigo-500 to-indigo-400" }) => (
    <div className="progress-bar">
      <div
        className={`progress-bar-fill bg-gradient-to-r ${color}`}
        style={{ width: `${Math.min((current / total) * 100, 100)}%` }}
      />
    </div>
  );

  const AccentsBar = () => {
    if (accentChars.length === 0) return null;
    return (
      <div className="flex gap-1.5 justify-center mb-4 flex-wrap">
        {accentChars.map(char => (
          <button
            key={char}
            type="button"
            onClick={() => insertCharacter(char)}
            disabled={feedback !== null}
            className="accent-btn disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {char}
          </button>
        ))}
      </div>
    );
  };

  // ---- Import Modal (rendered as portal-like overlay) ----
  const renderImportModal = () => {
    if (!showImportModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
           onClick={(e) => { if (e.target === e.currentTarget) setShowImportModal(false); }}>
        <div className="glass-card-elevated w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-slide-up"
             onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                <Upload className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Import Vocabulary</h3>
                <p className="text-sm text-white/40">From Quizlet or any source</p>
              </div>
            </div>
            <button onClick={() => setShowImportModal(false)} className="btn-ghost">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setImportTab('text')}
              className={`flex-1 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2
                ${importTab === 'text' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5' : 'text-white/40 hover:text-white/60'}`}
            >
              <FileText className="w-4 h-4" /> Paste Text
            </button>
            <button
              onClick={() => setImportTab('pdf')}
              className={`flex-1 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2
                ${importTab === 'pdf' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-500/5' : 'text-white/40 hover:text-white/60'}`}
            >
              <Upload className="w-4 h-4" /> Upload PDF
            </button>
          </div>

          {/* Content */}
          <div className="p-6 flex-1 overflow-y-auto">
            {importTab === 'text' ? (
              <div className="space-y-4">
                <p className="text-white/50 text-sm">
                  Paste your Quizlet export (use <span className="kbd">Tab</span> delimiter) or <code className="kbd">term - definition</code> format:
                </p>
                <textarea
                  className="w-full h-40 p-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 
                             font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                  placeholder={"hello\thola\ngoodbye\tadiós\nthank you\tgracias"}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <button onClick={handleTextImport} className="btn-primary w-full">
                  <FileText className="w-4 h-4" /> Parse Text
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-white/50 text-sm">
                  Upload a Quizlet PDF (use Print → Save as PDF from Quizlet):
                </p>
                <div
                  className={`drop-zone rounded-xl p-10 text-center cursor-pointer transition-all
                    ${isDragging ? 'drag-over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handlePdfUpload(file);
                  }}
                >
                  <Upload className="w-10 h-10 text-indigo-400/50 mx-auto mb-3" />
                  <p className="text-white/60 font-medium">Drop PDF here or click to browse</p>
                  <p className="text-white/30 text-sm mt-1">Supports Quizlet exported PDFs</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfUpload(file);
                  }}
                />
                {pdfLoading && (
                  <div className="text-center py-4">
                    <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto mb-2" />
                    <p className="text-white/50 text-sm">Parsing PDF...</p>
                  </div>
                )}
              </div>
            )}

            {/* Preview */}
            {importPreview.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-white/70 font-semibold text-sm uppercase tracking-wider">
                    Preview ({importPreview.length} words)
                  </h4>
                  <button onClick={confirmImport} className="btn-success text-sm py-2 px-4">
                    <Check className="w-4 h-4" /> Confirm Import
                  </button>
                </div>
                <div className="bg-white/5 rounded-xl border border-white/10 max-h-48 overflow-y-auto">
                  {importPreview.slice(0, 20).map((w, i) => (
                    <div key={i} className="flex items-center py-2 px-4 border-b border-white/5 last:border-0">
                      <span className="text-white/30 text-xs w-6">{i + 1}</span>
                      <span className="text-white/80 flex-1">{w.term}</span>
                      <span className="text-indigo-400/70 flex-1 text-right">{w.def}</span>
                    </div>
                  ))}
                  {importPreview.length > 20 && (
                    <div className="text-center py-2 text-white/30 text-sm">
                      ... and {importPreview.length - 20} more
                    </div>
                  )}
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
      <div className="gradient-bg flex items-center justify-center p-4">
        {renderImportModal()}
        <StreakPopup />
        <div className="w-full max-w-2xl animate-fade-in">
          <div className="glass-card-elevated overflow-hidden">
            {/* Hero Header */}
            <div className="p-8 pb-0">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <Book className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-black text-white tracking-tight">VocabMaster</h1>
                  <p className="text-white/40 text-sm">Learn any language, {BATCH_SIZE} words at a time</p>
                </div>
              </div>

              {/* Info Banner */}
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl mb-6 flex gap-3">
                <Layers className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                <p className="text-indigo-200/80 text-sm">
                  This session has <strong className="text-indigo-300">{allWords.length} words</strong>.
                  The program creates <strong className="text-indigo-300">{Math.ceil(allWords.length / BATCH_SIZE)} batches</strong> in
                  random order. Edit the list below or import from Quizlet.
                </p>
              </div>
            </div>

            {/* Settings Row */}
            <div className="px-8 pb-4 flex flex-wrap gap-3 items-center">
              {/* Language Selector */}
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                <Globe className="w-4 h-4 text-white/40" />
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="bg-transparent text-white/80 text-sm outline-none cursor-pointer"
                >
                  {Object.entries(ACCENT_PRESETS).map(([key, val]) => (
                    <option key={key} value={key} className="bg-slate-800">{val.label}</option>
                  ))}
                </select>
              </div>

              {/* Direction Toggle */}
              <button
                onClick={() => setDirection(d => d === 'term_to_def' ? 'def_to_term' : 'term_to_def')}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white/60 
                           hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-300 transition-all text-sm"
                title="Switch answer direction"
              >
                <RefreshCw className="w-4 h-4" />
                {direction === 'term_to_def' ? 'Term → Def' : 'Def → Term'}
              </button>

              {/* Import Button */}
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white/60 
                           hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-300 transition-all text-sm"
              >
                <Upload className="w-4 h-4" /> Import
              </button>

              {/* Shuffle Button */}
              <button
                onClick={handleShuffle}
                disabled={allWords.length === 0}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white/60 
                           hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-300 transition-all text-sm
                           disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                title="Shuffle word order"
              >
                <Shuffle className="w-4 h-4" /> Shuffle
              </button>
            </div>

            {/* Word List Editor */}
            <div className="px-8 pb-4">
              <textarea
                className="w-full h-52 p-4 bg-white/5 border border-white/10 rounded-xl text-white/80 placeholder-white/25 
                           font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                placeholder={"hello - hola\ngoodbye - adiós\nthank you - gracias / merci"}
                value={allWords.map(w => `${w.term} - ${w.def}`).join('\n')}
                onChange={(e) => {
                  const lines = e.target.value.split('\n');
                  const newWords = lines
                    .filter(line => line.includes('-'))
                    .map((line, idx) => {
                      const parts = line.split('-');
                      const term = parts[0].trim();
                      const def = parts.slice(1).join('-').trim();
                      return { id: idx, term, def };
                    })
                    .filter(w => w.term && w.def);
                  setAllWords(newWords);
                }}
              />
            </div>

            {/* Start Button */}
            <div className="px-8 pb-8">
              <button
                onClick={() => handleStartFullSession(allWords)}
                disabled={allWords.length === 0}
                className="btn-primary w-full text-lg py-4"
              >
                Start Learning ({allWords.length} words)
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- QUIZ REVIEW CHECK ---
  if (appPhase === 'quiz_review_check') {
    return (
      <div className="gradient-bg flex flex-col items-center justify-center p-4">
        <StreakPopup />
        <div className="glass-card-elevated w-full max-w-md p-8 text-center animate-slide-up">
          <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <RefreshCw className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Mistakes Found</h2>
          <p className="text-white/50 mb-6">
            You missed <strong className="text-amber-400">{failedInPhase.length} word{failedInPhase.length > 1 ? 's' : ''}</strong>.
            Master them in the quiz before moving to writing.
          </p>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6 max-h-40 overflow-y-auto text-left">
            {failedInPhase.map(w => (
              <div key={w.id} className="text-sm py-1.5 border-b border-amber-500/10 last:border-0 text-amber-300/80">
                • {w.term} → <span className="text-amber-200/60">{w.def}</span>
              </div>
            ))}
          </div>
          <button onClick={handleStartReview} className="btn-warning w-full">
            <RefreshCw className="w-4 h-4" /> Review Mistakes Now
          </button>
          <p className="text-white/25 text-xs text-center mt-3">
            Press <kbd className="kbd">Enter</kbd> to continue
          </p>
        </div>
      </div>
    );
  }

  // --- QUIZ ---
  if (appPhase === 'quiz') {
    const currentWord = queue[currentIndex];

    if (!currentWord) {
      return (
        <div className="gradient-bg flex items-center justify-center p-4">
          <div className="glass-card p-8 text-center">
            <p className="text-white/60 mb-4">An error occurred...</p>
            <button onClick={handleReset} className="btn-primary">Back to Home</button>
          </div>
        </div>
      );
    }

    return (
      <div className="gradient-bg flex flex-col items-center justify-center p-4">
        <StreakPopup />
        <div className="w-full max-w-2xl space-y-4 animate-fade-in">
          <HeaderInfo />
          <ProgressBar current={currentIndex + 1} total={queue.length} color="from-indigo-500 to-purple-500" />

          <div className="glass-card-elevated min-h-[380px] flex flex-col items-center justify-center p-8 relative">
            {queue.length < BATCH_SIZE && (
              <div className="absolute top-4 right-4 bg-amber-500/15 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border border-amber-500/20">
                <RefreshCw className="w-3 h-3" /> Review
              </div>
            )}

            <span className="text-white/30 text-xs uppercase tracking-[0.2em] font-bold mb-4">Find the translation</span>
            <h2 className="text-3xl md:text-4xl font-black text-white text-center mb-10">{getQuestion(currentWord)}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              {mcqOptions.map((option, index) => {
                let statusClass = "bg-white/5 border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/30 text-white/80";
                const isSelected = selectedMcqOption && selectedMcqOption.id === option.id;

                if (feedback !== null) {
                  if (option.id === currentWord.id) {
                    statusClass = "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/30";
                  } else if (isSelected) {
                    statusClass = "bg-rose-500/15 border-rose-500/50 text-rose-300 ring-1 ring-rose-500/30 animate-shake";
                  } else {
                    statusClass = "bg-white/[0.02] border-white/5 text-white/20";
                  }
                }

                return (
                  <button
                    key={option.id}
                    disabled={feedback !== null}
                    onClick={() => handleMcqAnswer(option)}
                    className={`quiz-option p-4 rounded-xl border-2 text-left font-medium transition-all duration-200 relative ${statusClass}`}
                  >
                    <span className="absolute top-2 left-2 w-6 h-6 bg-white/10 text-white/40 rounded-md flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <div className="pl-7">{getOptionDisplay(option)}</div>
                  </button>
                );
              })}
            </div>

            {feedback === null && (
              <p className="text-white/20 text-xs text-center mt-6">
                Use keys <kbd className="kbd mx-0.5">1</kbd>
                <kbd className="kbd mx-0.5">2</kbd>
                <kbd className="kbd mx-0.5">3</kbd>
                <kbd className="kbd mx-0.5">4</kbd>
                or click to answer
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- TRANSITION (Quiz → Writing) ---
  if (appPhase === 'transition_to_writing') {
    return (
      <div className="gradient-bg flex flex-col items-center justify-center p-4 text-center">
        <StreakPopup />
        <div className="glass-card-elevated p-12 max-w-lg w-full animate-bounce-in">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Edit3 className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Quiz Passed! ✨</h2>
          <p className="text-white/50 mb-4">
            You know these {queue.length} words. Now let's write them to solidify your memory.
          </p>
          {/* Stats summary */}
          <div className="flex justify-center gap-6 mb-8">
            <div className="text-center">
              <div className="text-2xl font-black text-indigo-400">{totalCorrect}</div>
              <div className="text-xs text-white/30 uppercase tracking-wider">Correct</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-orange-400">{bestStreak}</div>
              <div className="text-xs text-white/30 uppercase tracking-wider">Best Streak</div>
            </div>
          </div>
          <button onClick={handleProceedToWritingPhase} className="btn-primary w-full">
            Start Writing <ChevronRight className="w-4 h-4" />
          </button>
          <p className="text-white/25 text-xs text-center mt-3">
            Press <kbd className="kbd">Enter</kbd> to continue
          </p>
        </div>
      </div>
    );
  }

  // --- WRITING REVIEW CHECK ---
  if (appPhase === 'writing_review_check') {
    return (
      <div className="gradient-bg flex flex-col items-center justify-center p-4">
        <StreakPopup />
        <div className="glass-card-elevated w-full max-w-md p-8 text-center animate-slide-up">
          <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Edit3 className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Some Mistakes...</h2>
          <p className="text-white/50 mb-6">
            <strong className="text-amber-400">{failedInPhase.length} word{failedInPhase.length > 1 ? 's' : ''}</strong> left to correct before completing this batch.
          </p>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6 max-h-40 overflow-y-auto text-left">
            {failedInPhase.map(w => (
              <div key={w.id} className="text-sm py-1.5 border-b border-amber-500/10 last:border-0 text-amber-300/80">
                • {w.term}
              </div>
            ))}
          </div>
          <button onClick={handleStartReview} className="btn-warning w-full">
            <Edit3 className="w-4 h-4" /> Fix Mistakes
          </button>
          <p className="text-white/25 text-xs text-center mt-3">
            Press <kbd className="kbd">Enter</kbd> to continue
          </p>
        </div>
      </div>
    );
  }

  // --- WRITING ---
  if (appPhase === 'writing') {
    const currentWord = queue[currentIndex];

    if (!currentWord) {
      return (
        <div className="gradient-bg flex items-center justify-center p-4">
          <div className="glass-card p-8 text-center">
            <p className="text-white/60 mb-4">An error occurred...</p>
            <button onClick={handleReset} className="btn-primary">Back to Home</button>
          </div>
        </div>
      );
    }

    const correctAnswer = getAnswer(currentWord);
    const isInputLocked = feedback === 'correct' || feedback === 'incorrect';

    return (
      <div className="gradient-bg flex flex-col items-center justify-center p-4">
        <StreakPopup />
        <div className="w-full max-w-xl space-y-4 animate-fade-in">
          <HeaderInfo />
          <ProgressBar current={currentIndex + 1} total={queue.length} color="from-emerald-500 to-teal-400" />

          <div className="glass-card-elevated p-8 relative">
            {queue.length < BATCH_SIZE && (
              <div className="absolute top-4 right-4 bg-amber-500/15 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border border-amber-500/20">
                <RefreshCw className="w-3 h-3" /> Correction
              </div>
            )}

            <span className="text-white/30 text-xs uppercase tracking-[0.2em] font-bold mb-2 block text-center">Translate this term</span>
            <h2 className="text-3xl font-black text-white text-center mb-2">{getQuestion(currentWord)}</h2>

            {/* Hint display */}
            {hintLevel > 0 && feedback === null && (
              <div className="text-center mb-4">
                <span className="text-indigo-400/60 font-mono text-lg tracking-[0.3em]">
                  {getHintText(currentWord, hintLevel)}
                </span>
              </div>
            )}

            {/* Hint + usedHint indicator */}
            {feedback === null && (
              <div className="flex justify-center mb-4">
                <button
                  type="button"
                  onClick={handleUseHint}
                  className="flex items-center gap-1.5 text-xs text-white/30 hover:text-indigo-400 transition-all px-3 py-1.5 rounded-lg hover:bg-indigo-500/10"
                  title="Reveal next letter (word will be reviewed)"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Hint ({hintLevel}/{correctAnswer.length})
                  {usedHint && <span className="text-amber-400 ml-1">⚠ will be reviewed</span>}
                </button>
              </div>
            )}

            <form onSubmit={handleWritingSubmit} className="space-y-4">
              <AccentsBar />

              <div className="relative">
                <input
                  ref={inputRef}
                  autoFocus
                  type="text"
                  value={inputValue}
                  onChange={(e) => {
                    if (isInputLocked) return; // Prevent modification when locked
                    setInputValue(e.target.value);
                  }}
                  disabled={isInputLocked}
                  readOnly={isInputLocked}
                  placeholder="Type the translation..."
                  className={`input-field
                    ${feedback === 'correct' ? 'input-correct' : ''}
                    ${feedback === 'incorrect' ? 'input-incorrect' : ''}
                  `}
                />
                {!isInputLocked && (
                  <Keyboard className="absolute right-4 top-1/2 -translate-y-1/2 text-white/15 w-5 h-5 pointer-events-none" />
                )}
              </div>

              {feedback === 'incorrect' && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-center animate-slide-down">
                  <p className="text-rose-400/60 text-xs font-bold uppercase mb-1 tracking-wide">Correct answer:</p>
                  <p className="text-xl font-bold text-rose-300">{correctAnswer}</p>
                  <p className="text-xs mt-2 text-white/25">
                    Press <kbd className="kbd">Enter</kbd> to continue
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                {feedback === 'incorrect' && (
                  <>
                    {showOverrideButton && (
                      <button
                        onClick={handleOverrideCorrect}
                        type="button"
                        className="btn-outline flex-1"
                      >
                        <Check className='w-4 h-4' /> I was right
                      </button>
                    )}
                    <button
                      onClick={() => proceedToNextWritingStep()}
                      type="button"
                      className={`btn-secondary flex-1 ${showOverrideButton ? '' : 'w-full'}`}
                    >
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}

                {feedback !== 'incorrect' && (
                  <button
                    disabled={feedback === 'correct' || inputValue.trim() === ''}
                    className={`w-full ${feedback === 'correct' ? 'btn-success' : 'btn-primary'}`}
                    type="submit"
                  >
                    {feedback === 'correct' ? (
                      <><Check className='w-5 h-5' /> Correct!</>
                    ) : 'Submit'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --- BATCH COMPLETE ---
  if (appPhase === 'batch_complete') {
    const nextBatchStart = batchOffset + BATCH_SIZE + 1;
    const nextBatchEnd = Math.min(nextBatchStart + BATCH_SIZE - 1, allWords.length);

    return (
      <div className="gradient-bg flex flex-col items-center justify-center p-4 text-center">
        <StreakPopup />
        <div className="glass-card-elevated p-12 max-w-lg w-full animate-bounce-in">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Batch Complete! 🎉</h2>
          
          {/* Stats */}
          <div className="flex justify-center gap-6 mb-6">
            <div className="text-center">
              <div className="text-2xl font-black text-emerald-400">{totalCorrect}</div>
              <div className="text-xs text-white/30 uppercase tracking-wider">Total Correct</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-orange-400 flex items-center justify-center gap-1">
                <Flame className="w-5 h-5" /> {bestStreak}
              </div>
              <div className="text-xs text-white/30 uppercase tracking-wider">Best Streak</div>
            </div>
          </div>

          <p className="text-white/50 mb-8">
            Ready for batch <strong className="text-indigo-300">{Math.floor(batchOffset / BATCH_SIZE) + 2}</strong>?
            Words <strong className="text-indigo-300">{nextBatchStart} to {nextBatchEnd}</strong>.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleReset} className="btn-secondary flex-1">
              Stop Here
            </button>
            <button onClick={handleNextBatch} className="btn-primary flex-1">
              Next Batch <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-white/25 text-xs text-center mt-3">
            Press <kbd className="kbd">Enter</kbd> for next batch
          </p>
        </div>
      </div>
    );
  }

  // --- VICTORY ---
  if (appPhase === 'victory') {
    return (
      <div className="gradient-bg flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Floating particles */}
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${10 + Math.random() * 80}%`,
              top: `${10 + Math.random() * 80}%`,
              background: ['#818cf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'][i % 5],
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}

        <div className="text-center animate-bounce-in relative z-10">
          <div className="w-32 h-32 bg-gradient-to-br from-emerald-500 to-teal-400 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl trophy-glow">
            <Trophy className="w-16 h-16 text-white" />
          </div>
          <h1 className="text-5xl font-black text-white mb-4">Amazing! 🏆</h1>
          <p className="text-white/50 text-xl mb-6 max-w-lg mx-auto">
            You've conquered all <strong className="text-emerald-400">{allWords.length}</strong> words!
          </p>

          {/* Final Stats */}
          <div className="flex justify-center gap-8 mb-10">
            <div className="text-center">
              <div className="text-3xl font-black text-indigo-400">{totalCorrect}</div>
              <div className="text-xs text-white/30 uppercase tracking-wider">Correct Answers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-orange-400 flex items-center justify-center gap-1">
                <Flame className="w-6 h-6" /> {bestStreak}
              </div>
              <div className="text-xs text-white/30 uppercase tracking-wider">Best Streak</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-black text-emerald-400">{allWords.length}</div>
              <div className="text-xs text-white/30 uppercase tracking-wider">Words Mastered</div>
            </div>
          </div>

          <div className="flex gap-4 justify-center flex-col sm:flex-row">
            <button onClick={handleReset} className="btn-primary">
              Back to Home
            </button>
            <button
              onClick={() => handleStartFullSession(allWords)}
              className="btn-secondary"
            >
              <RefreshCw className="w-4 h-4" /> Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="gradient-bg flex items-center justify-center">
      <div className="text-white/30">Loading...</div>
    </div>
  );
}