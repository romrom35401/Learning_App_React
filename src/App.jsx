import React, { useState, useEffect, useRef } from 'react';
import { Book, Check, X, RefreshCw, ChevronRight, Edit3, Settings, Trophy, Brain, Keyboard, AlertCircle, Layers } from 'lucide-react';

// --- Composants Utilitaires ---

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false, title = '', type = 'button' }) => {
  const baseStyle = "px-6 py-3 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-sm active:scale-95 touch-manipulation";
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
    secondary: "bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:bg-slate-100",
    success: "bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-emerald-300",
    outline: "border-2 border-slate-200 text-slate-600 hover:border-indigo-500 hover:text-indigo-600",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 p-2 px-3"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      type={type}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden ${className}`}>
    {children}
  </div>
);

const ProgressBar = ({ current, total, color = "bg-indigo-500" }) => (
  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
    <div
      className={`h-full transition-all duration-500 ${color}`}
      style={{ width: `${Math.min((current / total) * 100, 100)}%` }}
    />
  </div>
);

// --- Données du PDF (Inteligencia Artificial) ---
const PDF_WORDS = [

];

const DEFAULT_WORDS = PDF_WORDS;
const BATCH_SIZE = 10;

// Fonction pour mélanger un tableau (Fisher-Yates shuffle)
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export default function App() {
  // Phases: setup, quiz, quiz_review_check, transition_to_writing, writing, writing_review_check, batch_complete, victory
  const [appPhase, setAppPhase] = useState('setup'); 
  const [allWords, setAllWords] = useState(DEFAULT_WORDS);
  const [batchOffset, setBatchOffset] = useState(0);

  const [queue, setQueue] = useState([]);
  const [failedInPhase, setFailedInPhase] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [inputValue, setInputValue] = useState('');

  const [mcqOptions, setMcqOptions] = useState([]);
  const inputRef = useRef(null);
  const correctTimeoutRef = useRef(null); // Pour stocker le timeout de l'animation "correct"

  const [showOverrideButton, setShowOverrideButton] = useState(false);
  const [selectedMcqOption, setSelectedMcqOption] = useState(null);

  // Fonction utilitaire pour extraire/nettoyer les traductions
  const normalizeAnswer = (answer) => {
    return answer.trim().toLowerCase();
  }

  // Fonction pour vérifier si une réponse est correcte (gère les multiples variantes)
  const checkAnswer = (userInput, correctDef) => {
    // Extraire toutes les réponses valides (séparées par '/')
    const validAnswers = correctDef.split('/').map(s => normalizeAnswer(s));
    
    // Normaliser l'entrée utilisateur
    const userAns = normalizeAnswer(userInput);
    
    // Cas 1 : L'utilisateur a tapé exactement une des variantes
    if (validAnswers.includes(userAns)) {
      return true;
    }
    
    // Cas 2 : L'utilisateur a tapé avec un slash (on split et on vérifie chaque partie)
    if (userAns.includes('/')) {
      const userParts = userAns.split('/').map(s => normalizeAnswer(s));
      // Si toutes les parties de l'utilisateur sont dans les réponses valides
      return userParts.every(part => validAnswers.includes(part));
    }
    
    return false;
  };

  // Fonction de réinitialisation complète
  const handleReset = () => {
    setAppPhase('setup');
    setFailedInPhase([]);
    setQueue([]);
    setBatchOffset(0);
    setShowOverrideButton(false);
    setFeedback(null);
    setSelectedMcqOption(null);
    setCurrentIndex(0);
  };

  // --- Logique de gestion des Séries (Batches) ---

  const handleStartFullSession = (customList = null) => {
    const listToUse = customList || allWords;
    // Mélanger la liste avant de commencer
    const shuffledList = shuffleArray(listToUse);
    setAllWords(shuffledList);
    setBatchOffset(0);
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
  };

  // --- Logique de Révision (Loop) ---

  const handleStartReview = () => {
    const reviewQueue = failedInPhase;
    
    setQueue(reviewQueue);
    setFailedInPhase([]);
    setCurrentIndex(0);
    setShowOverrideButton(false);
    setFeedback(null);
    setSelectedMcqOption(null);

    if (appPhase === 'quiz_review_check') {
      setAppPhase('quiz');
      if (reviewQueue.length > 0) {
        generateMcqOptions(reviewQueue[0], allWords);
      }
    } else if (appPhase === 'writing_review_check') {
      setAppPhase('writing');
      setInputValue(''); 
    }
  };

  // --- Logique Quiz (QCM) ---

  const generateMcqOptions = (correctWord, allWordsContext) => {
    if (!correctWord) return;
    const potentialDistractors = allWordsContext.filter(w => w.id !== correctWord.id);
    
    const safeDistractors = potentialDistractors.length > 0 ? potentialDistractors : allWordsContext.filter(w => w.id !== correctWord.id).slice(0, 3);

    const shuffledDistractors = [...safeDistractors].sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [...shuffledDistractors, correctWord].sort(() => 0.5 - Math.random());
    setMcqOptions(options);
  };

  const handleMcqAnswer = (selectedWord) => {
    const currentWord = queue[currentIndex];
    const isCorrect = selectedWord.id === currentWord.id;

    setSelectedMcqOption(selectedWord);
    setFeedback(isCorrect ? 'correct' : 'incorrect');

    if (!isCorrect) {
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
        // Fin de la queue du quiz
        // On met à jour failedInPhase si la dernière réponse était incorrecte
        const updatedFailed = isCorrect ? failedInPhase : 
          (failedInPhase.some(w => w.id === currentWord.id) ? failedInPhase : [...failedInPhase, currentWord]);
        
        if (updatedFailed.length > 0) {
          setAppPhase('quiz_review_check');
        } else {
          setAppPhase('transition_to_writing');
        }
      }
    }, 1000); 
  };

  // --- Logique Écriture ---

  const insertCharacter = (char) => {
    setInputValue(prev => prev + char);
    inputRef.current?.focus();
  };

  const proceedToNextWritingStep = () => {
    setShowOverrideButton(false);
    
    // Nettoyer le timeout si il existe
    if (correctTimeoutRef.current) {
      clearTimeout(correctTimeoutRef.current);
      correctTimeoutRef.current = null;
    }

    if (currentIndex < queue.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setFeedback(null);
      setInputValue('');
    } else {
      // Fin de la queue d'écriture
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
  };

  const handleOverrideCorrect = () => {
    const currentWord = queue[currentIndex];
    setFailedInPhase(prev => prev.filter(w => w.id !== currentWord.id));
    proceedToNextWritingStep();
  };

  const handleWritingSubmit = (e) => {
    e.preventDefault();
    
    // Si on a déjà un feedback (incorrect OU correct) et qu'on appuie sur Entrée, on continue
    if (feedback === 'incorrect') {
      proceedToNextWritingStep();
      return;
    }
    
    if (feedback === 'correct') {
      // Clear le timeout et passer immédiatement au suivant
      if (correctTimeoutRef.current) {
        clearTimeout(correctTimeoutRef.current);
        correctTimeoutRef.current = null;
      }
      proceedToNextWritingStep();
      return;
    }
    
    const currentWord = queue[currentIndex];

    const isCorrect = checkAnswer(inputValue, currentWord.def);

    setFeedback(isCorrect ? 'correct' : 'incorrect');

    if (!isCorrect) {
      if (!failedInPhase.some(w => w.id === currentWord.id)) {
        setFailedInPhase(prev => [...prev, currentWord]);
      }
      setShowOverrideButton(true);
    } else {
      setFailedInPhase(prev => prev.filter(w => w.id !== currentWord.id)); 
      setShowOverrideButton(false);
      correctTimeoutRef.current = setTimeout(proceedToNextWritingStep, 1500); 
    }
  };

  // useEffect pour mettre le focus automatiquement sur le champ de texte en phase d'écriture
  useEffect(() => {
    if (appPhase === 'writing' && inputRef.current) {
      // Petit délai pour s'assurer que le DOM est prêt
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [appPhase, currentIndex]); // Se déclenche quand on change de phase ou de question

  // useEffect pour gérer la touche Entrée globalement quand on a un feedback
  useEffect(() => {
    if (appPhase !== 'writing' || feedback === null) return;
    
    const handleKeyPress = (e) => {
      // Si on appuie sur Entrée et qu'on a un feedback (correct ou incorrect)
      if (e.key === 'Enter') {
        e.preventDefault();
        if (feedback === 'correct') {
          // Clear le timeout et passer immédiatement
          if (correctTimeoutRef.current) {
            clearTimeout(correctTimeoutRef.current);
            correctTimeoutRef.current = null;
          }
        }
        // Dans tous les cas (correct ou incorrect), on passe au suivant
        setShowOverrideButton(false);
        
        if (correctTimeoutRef.current) {
          clearTimeout(correctTimeoutRef.current);
          correctTimeoutRef.current = null;
        }

        if (currentIndex < queue.length - 1) {
          setCurrentIndex(prev => prev + 1);
          setFeedback(null);
          setInputValue('');
        } else {
          // Fin de la queue d'écriture
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
  }, [appPhase, feedback, currentIndex, queue.length, failedInPhase.length, batchOffset, allWords.length]); // Toutes les dépendances nécessaires

  // useEffect pour gérer la touche Entrée sur les écrans de transition/choix
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        
        // Quiz Review Check - Revoir les erreurs
        if (appPhase === 'quiz_review_check') {
          handleStartReview();
        }
        // Transition vers l'écriture
        else if (appPhase === 'transition_to_writing') {
          handleProceedToWritingPhase();
        }
        // Writing Review Check - Corriger les fautes
        else if (appPhase === 'writing_review_check') {
          handleStartReview();
        }
        // Batch Complete - Série suivante
        else if (appPhase === 'batch_complete') {
          handleNextBatch();
        }
      }
    };

    // Ne s'active que sur les phases de transition
    const transitionPhases = ['quiz_review_check', 'transition_to_writing', 'writing_review_check', 'batch_complete'];
    if (transitionPhases.includes(appPhase)) {
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appPhase]); // Les fonctions handler sont stables et n'ont pas besoin d'être dans les dépendances

  // useEffect pour gérer la sélection des réponses QCM avec les touches 1-4
  useEffect(() => {
    if (appPhase !== 'quiz' || feedback !== null) return; // Ne fonctionne que pendant le quiz et sans feedback actif
    
    const handleKeyPress = (e) => {
      // Touches 1, 2, 3, 4 pour sélectionner les réponses
      const key = e.key;
      if (['1', '2', '3', '4'].includes(key)) {
        e.preventDefault();
        const index = parseInt(key) - 1;
        if (mcqOptions[index]) {
          handleMcqAnswer(mcqOptions[index]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appPhase, feedback, mcqOptions]); // Se déclenche quand ces valeurs changent

  // --- Composants d'Affichage ---

  const HeaderInfo = () => {
    const currentBatchNum = Math.floor(batchOffset / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allWords.length / BATCH_SIZE);

    return (
      <div className="flex justify-between items-center text-slate-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            <span>Série {currentBatchNum} / {totalBatches}</span>
          </div>
          <div className="bg-slate-800 px-2 py-1 rounded text-slate-300">
            {appPhase.includes('writing') || appPhase.includes('transition_to_writing') ? 'Phase 2 : Écriture' : 'Phase 1 : Quiz'}
          </div>
      </div>
    );
  };

  const AccentsBar = () => (
    <div className="flex gap-2 justify-center mb-4 flex-wrap">
      {['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¡', '¿'].map(char => (
        <button
          key={char}
          type="button"
          onClick={() => insertCharacter(char)}
          className="w-10 h-10 bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 font-medium rounded-lg border border-slate-200 shadow-sm active:scale-95 transition-colors touch-manipulation"
        >
          {char}
        </button>
      ))}
    </div>
  );

  // --- Écrans ---

  // Setup Screen
  if (appPhase === 'setup') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center font-sans">
        <Card className="w-full max-w-2xl">
          <div className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-indigo-100 p-3 rounded-xl">
                <Book className="w-8 h-8 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">VocabMaster</h1>
                <p className="text-slate-500">Méthode par séries de {BATCH_SIZE} mots</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6 text-blue-800 text-sm flex gap-3">
              <Layers className="w-5 h-5 flex-shrink-0" />
              <p>
                Cette session contient <strong>{allWords.length} mots</strong>.
                Le programme va créer <strong>{Math.ceil(allWords.length / BATCH_SIZE)} séries</strong> de 10 mots <strong>dans un ordre aléatoire</strong>.
                Vous pouvez modifier la liste ci-dessous (format: *français - espagnol*).
              </p>
            </div>

            <textarea
              className="w-full h-48 p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono text-sm mb-6 bg-slate-50"
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

            <Button onClick={() => handleStartFullSession(allWords)} className="w-full" disabled={allWords.length === 0}>
              Commencer l'apprentissage ({allWords.length} mots)
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Quiz Review Check
  if (appPhase === 'quiz_review_check') {
      return (
         <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
         <Card className="w-full max-w-md p-8 text-center">
             <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                 <RefreshCw className="w-8 h-8 text-amber-600" />
             </div>
             <h2 className="text-2xl font-bold text-slate-800 mb-2">Attention !</h2>
             <p className="text-slate-500 mb-8">
                 Vous avez raté <strong>{failedInPhase.length} mots</strong> dans cette série.
                 Vous devez les maîtriser au Quiz avant de passer à l'étape d'écriture.
             </p>
             <div className="bg-amber-50 rounded-xl p-4 mb-6 max-h-40 overflow-y-auto text-left">
                 {failedInPhase.map(w => (
                     <div key={w.id} className="text-sm py-1 border-b border-amber-100 last:border-0 text-amber-800">
                         • {w.term} ({w.def})
                     </div>
                 ))}
             </div>
             <Button onClick={handleStartReview} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                 Revoir mes erreurs immédiatement
             </Button>
             <p className="text-slate-400 text-xs text-center mt-3">Appuyez sur <kbd className="px-2 py-1 bg-slate-200 rounded text-slate-600">Entrée</kbd> pour continuer</p>
         </Card>
         </div>
       )
   }

  // Quiz Screen
  if (appPhase === 'quiz') {
    const currentWord = queue[currentIndex];
    
    if (!currentWord) {
      // Si on arrive ici, c'est qu'il y a un problème - on retourne à la transition
      console.error("Mot actuel non trouvé dans le quiz");
      return (
        <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
          <Card className="p-8 text-center">
            <p className="text-slate-600 mb-4">Une erreur s'est produite...</p>
            <Button onClick={handleReset}>Retour à l'accueil</Button>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-2xl space-y-6">
          <HeaderInfo />
          <ProgressBar current={currentIndex + 1} total={queue.length} color="bg-indigo-500" />

          <Card className="min-h-[350px] flex flex-col items-center justify-center p-8 relative">
              {queue.length < BATCH_SIZE && (
                  <div className="absolute top-4 right-4 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Rattrapage
                  </div>
              )}

              <span className="text-slate-400 text-sm uppercase tracking-wider font-bold mb-4">Trouvez la traduction</span>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-800 text-center mb-8">{currentWord.term}</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {mcqOptions.map((option, index) => {
                  let statusClass = "hover:border-indigo-500 hover:bg-slate-50";
                  const isSelected = selectedMcqOption && selectedMcqOption.id === option.id;

                  if (feedback !== null) {
                    if (option.id === currentWord.id) {
                      statusClass = "bg-emerald-100 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500";
                    } else if (isSelected) {
                      statusClass = "bg-rose-100 border-rose-500 text-rose-800 ring-2 ring-rose-500";
                    } else {
                      statusClass += " opacity-60";
                    }
                  }
                  
                  return (
                    <button
                      key={option.id}
                      disabled={feedback !== null}
                      onClick={() => handleMcqAnswer(option)}
                      className={`p-4 rounded-xl border-2 border-slate-100 text-left font-medium transition-all duration-200 text-slate-700 relative ${statusClass}`}
                    >
                      <span className="absolute top-2 left-2 w-6 h-6 bg-slate-200 text-slate-600 rounded-md flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <div className="pl-6">{option.def}</div>
                    </button>
                  );
                })}
              </div>
              
              {feedback === null && (
                <p className="text-slate-400 text-xs text-center mt-4">
                  Utilisez les touches <kbd className="px-2 py-1 bg-slate-700 text-slate-300 rounded mx-1">1</kbd> 
                  <kbd className="px-2 py-1 bg-slate-700 text-slate-300 rounded mx-1">2</kbd> 
                  <kbd className="px-2 py-1 bg-slate-700 text-slate-300 rounded mx-1">3</kbd> 
                  <kbd className="px-2 py-1 bg-slate-700 text-slate-300 rounded mx-1">4</kbd> 
                  ou cliquez pour répondre
                </p>
              )}
          </Card>
        </div>
      </div>
    );
  }

  // Transition Screen (Quiz -> Writing)
  if (appPhase === 'transition_to_writing') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans text-center">
        <Card className="p-12 max-w-lg w-full">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Edit3 className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Quiz Validé !</h2>
            <p className="text-slate-500 mb-8">
              Vous connaissez ces {BATCH_SIZE} mots. Passons maintenant à l'écriture pour consolider cette série.
            </p>
            <Button onClick={handleProceedToWritingPhase} className="w-full">
                Commencer l'Écriture
                <ChevronRight className="w-4 h-4" />
            </Button>
            <p className="text-slate-400 text-xs text-center mt-3">Appuyez sur <kbd className="px-2 py-1 bg-slate-200 rounded text-slate-600">Entrée</kbd> pour continuer</p>
        </Card>
      </div>
    )
  }

  // Writing Review Check
  if (appPhase === 'writing_review_check') {
      return (
         <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
         <Card className="w-full max-w-md p-8 text-center">
             <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                 <Edit3 className="w-8 h-8 text-amber-600" />
             </div>
             <h2 className="text-2xl font-bold text-slate-800 mb-2">Quelques fautes...</h2>
             <p className="text-slate-500 mb-8">
                 Il reste <strong>{failedInPhase.length} mots</strong> à corriger pour valider cette série.
             </p>
             <div className="bg-amber-50 rounded-xl p-4 mb-6 max-h-40 overflow-y-auto text-left">
                {failedInPhase.map(w => (
                     <div key={w.id} className="text-sm py-1 border-b border-amber-100 last:border-0 text-amber-800">
                         • {w.term}
                     </div>
                 ))}
             </div>
             <Button onClick={handleStartReview} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                 Corriger mes fautes
             </Button>
             <p className="text-slate-400 text-xs text-center mt-3">Appuyez sur <kbd className="px-2 py-1 bg-slate-200 rounded text-slate-600">Entrée</kbd> pour continuer</p>
         </Card>
         </div>
       )
  }

  // Writing Screen
  if (appPhase === 'writing') {
    const currentWord = queue[currentIndex];

    if (!currentWord) {
      console.error("Mot actuel non trouvé dans l'écriture");
      return (
        <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
          <Card className="p-8 text-center">
            <p className="text-slate-600 mb-4">Une erreur s'est produite...</p>
            <Button onClick={handleReset}>Retour à l'accueil</Button>
          </Card>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-xl space-y-6">
          <HeaderInfo />
          <ProgressBar current={currentIndex + 1} total={queue.length} color="bg-emerald-500" />

          <Card className="p-8 relative">
              {queue.length < BATCH_SIZE && (
                  <div className="absolute top-4 right-4 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Correction
                  </div>
              )}
            
            <span className="text-slate-400 text-sm uppercase tracking-wider font-bold mb-2 block text-center">Traduisez ce terme</span>
            <h2 className="text-3xl font-bold text-slate-800 text-center mb-6">{currentWord.term}</h2>

            <form onSubmit={handleWritingSubmit} className="space-y-4">
              <AccentsBar />
              
              <div className="relative">
                  <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        if (feedback !== null && feedback !== 'correct') {
                            setFeedback(null);
                        }
                    }}
                    disabled={feedback === 'correct'}
                    placeholder="Écrivez en espagnol..."
                    className={`w-full p-4 text-center text-xl rounded-xl border-2 outline-none transition-all shadow-inner
                      ${feedback === null ? 'border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10' : ''}
                      ${feedback === 'correct' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : ''}
                      ${feedback === 'incorrect' ? 'border-rose-500 bg-rose-50 text-rose-700' : ''}
                    `}
                  />
                  {feedback !== 'correct' && (
                      <Keyboard className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                  )}
              </div>
              
              {feedback === 'incorrect' && (
                 <div className="bg-rose-100 p-4 rounded-xl text-rose-800 text-center animate-in fade-in slide-in-from-top-2 border border-rose-200">
                    <p className="text-xs font-bold uppercase mb-1 tracking-wide opacity-75">La bonne réponse était :</p>
                    <p className="text-xl font-bold">{currentWord.def}</p>
                    <p className="text-xs mt-2 opacity-60">Appuyez sur <kbd className="px-2 py-1 bg-rose-200 rounded">Entrée</kbd> pour continuer</p>
                 </div>
              )}

              <div className="flex gap-4">
                  {feedback === 'incorrect' && (
                      <>
                          {showOverrideButton && (
                              <Button
                                  onClick={handleOverrideCorrect}
                                  type="button"
                                  variant="outline"
                                  className="flex-1 border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                              >
                                  <Check className='w-4 h-4' /> J'avais raison
                              </Button>
                          )}

                          <Button
                              onClick={proceedToNextWritingStep} 
                              type="button"
                              className={`flex-1 ${showOverrideButton ? '' : 'w-full'}`}
                              variant="secondary"
                          >
                              Continuer <ChevronRight className="w-4 h-4" />
                          </Button>
                      </>
                  )}

                  {feedback !== 'incorrect' && (
                      <Button
                          disabled={feedback === 'correct' || inputValue.trim() === ''}
                          className="w-full"
                          variant={feedback === 'correct' ? 'success' : 'primary'}
                          type="submit"
                      >
                          {feedback === 'correct' ? (
                            <>
                                Correct ! <Check className='w-5 h-5' />
                            </>
                          ) : 'Valider'}
                      </Button>
                  )}
              </div>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // Batch Complete Screen (Next Batch)
  if (appPhase === 'batch_complete') {
    const nextBatchStart = batchOffset + BATCH_SIZE + 1;
    const nextBatchEnd = Math.min(nextBatchStart + BATCH_SIZE - 1, allWords.length);

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans text-center">
        <Card className="p-12 max-w-lg w-full">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Série Terminée !</h2>
            <p className="text-slate-500 mb-8">
              Vous avez validé cette partie. Prêt pour la série <strong>{Math.floor(batchOffset / BATCH_SIZE) + 2}</strong>, avec les mots <strong>{nextBatchStart} à {nextBatchEnd}</strong> ?
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
                <Button variant="secondary" onClick={handleReset} className="flex-1">
                    Arrêter ici
                </Button>
                <Button onClick={handleNextBatch} className="flex-1">
                    Série Suivante
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>
            <p className="text-slate-400 text-xs text-center mt-3">Appuyez sur <kbd className="px-2 py-1 bg-slate-200 rounded text-slate-600">Entrée</kbd> pour la série suivante</p>
        </Card>
        </div>
    )
  }

  // Final Victory Screen
  if (appPhase === 'victory') {
    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans">
              <div className="text-center animate-in zoom-in duration-500">
                  <div className="w-32 h-32 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/50">
                      <Trophy className="w-16 h-16 text-white" />
                  </div>
                  <h1 className="text-5xl font-bold text-white mb-4">Incroyable !</h1>
                  <p className="text-indigo-200 text-xl mb-12 max-w-lg mx-auto">
                      Vous êtes venu à bout des {allWords.length} termes ! Vous avez complété toutes les séries.
                  </p>
                  
                  <div className="flex gap-4 justify-center flex-col sm:flex-row">
                      <Button onClick={handleReset} className="bg-white text-indigo-600 hover:bg-slate-100">
                          Retour à l'accueil
                      </Button>
                      <Button onClick={() => handleStartFullSession(DEFAULT_WORDS)} variant="outline" className="border-indigo-400 text-indigo-100 hover:bg-indigo-800/50 hover:border-indigo-300">
                          Tout recommencer
                      </Button>
                  </div>
              </div>
        </div>
    )
  }

  return (
    <div className="p-8 text-center text-slate-500">
      Chargement...
    </div>
  );
}