import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, CheckCircle, Search, Coins, FastForward, AlertTriangle, Lock, RotateCw, Loader2 } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection } from "firebase/firestore";

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyCfZLXKeLx-Q80NR1EuDWPxIe6o4QWl28U",
  authDomain: "coin-game-d8e7a.firebaseapp.com",
  projectId: "coin-game-d8e7a",
  storageBucket: "coin-game-d8e7a.firebasestorage.app",
  messagingSenderId: "1057831129270",
  appId: "1:1057831129270:web:41c5e4a26f999d0df5d617"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Components ---

// 1. Coin Component (Visuals)
const Coin = ({ result, isFlipping }) => {
  return (
    <div className="relative w-48 h-48 perspective-1000 mx-auto my-8">
      <div
        className={`w-full h-full relative transition-transform duration-400 transform-style-3d ${
          isFlipping ? 'animate-spin-fast' : ''
        }`}
        style={{
          transform: result === 'TAILS' ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front Side (Heads) - Yi Sun-sin */}
        <div className="absolute w-full h-full backface-hidden rounded-full border-4 border-gray-300 bg-white shadow-xl flex flex-col items-center justify-center text-gray-600">
          <div className="absolute inset-1 border-2 border-dashed border-gray-200 rounded-full opacity-70"></div>
          {/* Simple SVG representation of the General */}
          <div className="mb-2">
            <svg viewBox="0 0 100 100" className="w-24 h-24 fill-current text-gray-400">
              <circle cx="50" cy="40" r="15" />
              <path d="M20,90 Q50,60 80,90" stroke="currentColor" strokeWidth="2" fill="none"/>
              <rect x="30" y="20" width="40" height="15" rx="2" />
              <rect x="25" y="32" width="50" height="5" />
              <path d="M40,50 Q50,65 60,50 L55,80 L45,80 Z" /> 
            </svg>
          </div>
          <div className="flex justify-between w-full px-8 font-serif font-bold text-lg text-gray-500">
            <span>백</span>
            <span>원</span>
          </div>
        </div>

        {/* Back Side (Tails) - 100 & Bank */}
        <div 
          className="absolute w-full h-full backface-hidden rounded-full border-4 border-gray-300 bg-white shadow-xl flex flex-col items-center justify-center text-gray-800"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <div className="absolute inset-1 border-2 border-dashed border-gray-200 rounded-full opacity-70"></div>
          <span className="text-sm font-semibold mb-1 text-gray-500">2025</span>
          <span className="text-6xl font-bold tracking-tighter text-gray-700">100</span>
          <span className="text-sm font-bold mt-2 text-gray-500">한국은행</span>
        </div>
      </div>
    </div>
  );
};

// 2. Main App Component
export default function App() {
  const [view, setView] = useState('HOME'); // HOME, MAKER, DETECTIVE, GAME
  
  // Auth & Network State
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Maker State
  const [makerProb, setMakerProb] = useState(50);
  const [makerMaxGuesses, setMakerMaxGuesses] = useState(5); 

  const [gameCode, setGameCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  
  // Game State
  const [targetProb, setTargetProb] = useState(null);
  const [gameMaxGuesses, setGameMaxGuesses] = useState(5); 
  const [guessesUsed, setGuessesUsed] = useState(0);

  const [coinResult, setCoinResult] = useState('HEADS'); 
  const [isFlipping, setIsFlipping] = useState(false);
  const [stats, setStats] = useState({ total: 0, heads: 0, tails: 0 });
  const [guess, setGuess] = useState('');
  const [feedback, setFeedback] = useState(null); 
  const [isAutoFlipping, setIsAutoFlipping] = useState(false);
  
  const autoFlipInterval = useRef(null);
  const lastStopTotal = useRef(0);

  // --- Auth Initialization ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth failed:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // --- Logic Helpers ---

  const getBatchSize = (total) => {
    if (total >= 10000) return 1000;
    if (total >= 1000) return 100;
    if (total >= 100) return 10;
    return 1;
  };

  // 1. Create Game (Firestore)
  const createGame = async () => {
    if (!user) return;
    setIsLoading(true);
    
    // Generate a simple 6-char random code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    try {
      // Use the code as the Document ID for easy lookup
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'games', code), {
        probability: makerProb,
        maxGuesses: makerMaxGuesses,
        timestamp: Date.now(),
        creatorId: user.uid
      });
      setGameCode(code);
    } catch (error) {
      console.error("Error creating game:", error);
      alert("게임 생성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Join Game (Firestore)
  const joinGame = async () => {
    if (!user || inputCode.length < 6) return;
    setIsLoading(true);

    try {
      // Look up the document directly by its ID (the code)
      const code = inputCode.toUpperCase();
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', code);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setTargetProb(data.probability);
        setGameMaxGuesses(data.maxGuesses || 5);
        
        // Reset local game state
        setGuessesUsed(0);
        setStats({ total: 0, heads: 0, tails: 0 });
        setCoinResult('HEADS');
        setFeedback(null);
        setGuess('');
        lastStopTotal.current = 0;
        
        setView('GAME');
      } else {
        alert('유효하지 않은 게임 코드입니다. 코드를 다시 확인해주세요.');
      }
    } catch (error) {
      console.error("Error joining game:", error);
      alert("게임 접속에 실패했습니다. 인터넷 연결을 확인해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  const performBatchFlip = (count) => {
    if (isFlipping) return;
    setIsFlipping(true);

    let headsCount = 0;
    let lastResult = 'HEADS';

    for (let i = 0; i < count; i++) {
      const isHeads = Math.random() * 100 < targetProb;
      if (isHeads) headsCount++;
      if (i === count - 1) lastResult = isHeads ? 'HEADS' : 'TAILS';
    }

    setTimeout(() => {
      setCoinResult(lastResult);
      setStats(prev => ({
        total: prev.total + count,
        heads: prev.heads + headsCount,
        tails: prev.tails + (count - headsCount)
      }));
      setIsFlipping(false);
    }, 400);
  };

  useEffect(() => {
    if (isAutoFlipping) {
      const isMilestone = stats.total === 100 || stats.total === 1000 || stats.total === 10000;
      if (isMilestone && lastStopTotal.current !== stats.total) {
        setIsAutoFlipping(false);
        lastStopTotal.current = stats.total;
      }
    }
  }, [stats.total, isAutoFlipping]);

  useEffect(() => {
    if (isAutoFlipping) {
      const batchSize = getBatchSize(stats.total);
      const tick = () => { if (!isFlipping) performBatchFlip(batchSize); };
      tick();
      autoFlipInterval.current = setInterval(tick, 600);
    } else {
      clearInterval(autoFlipInterval.current);
    }
    return () => clearInterval(autoFlipInterval.current);
  }, [isAutoFlipping, targetProb]); 

  const submitGuess = () => {
    if (guess === '') return;
    if (feedback === 'GAME_OVER') return;

    const numGuess = parseInt(guess, 10);
    const nextGuessesUsed = guessesUsed + 1;
    setGuessesUsed(nextGuessesUsed);
    
    if (numGuess === targetProb) {
      setFeedback('CORRECT');
      setIsAutoFlipping(false);
    } else {
      if (nextGuessesUsed >= gameMaxGuesses) {
        setFeedback('GAME_OVER');
        setIsAutoFlipping(false);
      } else {
        setFeedback('WRONG');
      }
    }
  };

  const resetGame = () => {
    setView('HOME');
    setGameCode('');
    setInputCode('');
    setFeedback(null);
    setIsAutoFlipping(false);
    lastStopTotal.current = 0;
  };

  const currentBatchSize = getBatchSize(stats.total);
  const isGameOver = feedback === 'GAME_OVER';
  const isInputDisabled = feedback === 'CORRECT' || feedback === 'GAME_OVER';

  // --- Views ---

  if (view === 'HOME') {
    return (
      <div className="min-h-screen bg-sky-100 text-slate-700 flex flex-col items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-3xl shadow-xl flex flex-col items-center max-w-md w-full border-4 border-white">
          <h1 className="text-4xl font-extrabold mb-2 text-indigo-500 flex items-center gap-2 tracking-tight">
            <Coins className="w-10 h-10 text-yellow-400 fill-current" /> 조작된 동전
          </h1>
          <p className="text-slate-400 mb-8 font-medium">확률의 비밀을 찾아라!</p>
          
          <div className="grid gap-4 w-full">
            <button 
              onClick={() => setView('MAKER')}
              className="p-6 bg-indigo-50 hover:bg-indigo-100 rounded-2xl border-2 border-indigo-100 transition flex flex-col items-center group hover:scale-105 transform duration-200"
            >
              <div className="bg-indigo-200 p-3 rounded-full mb-3 group-hover:bg-indigo-300 transition">
                <RotateCw className="w-8 h-8 text-indigo-600" />
              </div>
              <span className="text-xl font-bold mb-1 text-indigo-700">동전 제작자</span>
              <span className="text-sm text-slate-500">선생님 / 문제 출제용</span>
            </button>
            
            <button 
              onClick={() => setView('DETECTIVE')}
              className="p-6 bg-sky-50 hover:bg-sky-100 rounded-2xl border-2 border-sky-100 transition flex flex-col items-center group hover:scale-105 transform duration-200"
            >
               <div className="bg-sky-200 p-3 rounded-full mb-3 group-hover:bg-sky-300 transition">
                <Search className="w-8 h-8 text-sky-600" />
              </div>
              <span className="text-xl font-bold mb-1 text-sky-700">동전 탐정</span>
              <span className="text-sm text-slate-500">학생 / 문제 풀이용</span>
            </button>
          </div>
          {!user && (
            <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
               <Loader2 className="animate-spin w-4 h-4" /> 서버 연결 중...
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'MAKER') {
    return (
      <div className="min-h-screen bg-sky-100 text-slate-700 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border-4 border-white">
          <h2 className="text-2xl font-bold mb-6 text-center text-indigo-500 flex items-center justify-center gap-2">
            <RotateCw size={24} /> 확률 조작하기
          </h2>
          
          {!gameCode ? (
            <>
              {/* Probability Slider */}
              <div className="mb-8 p-4 bg-slate-50 rounded-2xl">
                <label className="block text-sm font-bold text-slate-500 mb-2">
                  앞면(그림)이 나올 확률
                </label>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-xs">0%</span>
                  <span className="text-2xl font-extrabold text-indigo-500">{makerProb}%</span>
                  <span className="text-slate-400 text-xs">100%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={makerProb} 
                  onChange={(e) => setMakerProb(parseInt(e.target.value))}
                  className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Max Guesses Slider */}
              <div className="mb-8 p-4 bg-slate-50 rounded-2xl">
                <label className="block text-sm font-bold text-slate-500 mb-2">
                  탐정의 시도 기회
                </label>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-xs">1회</span>
                  <span className="text-2xl font-extrabold text-pink-500">{makerMaxGuesses}회</span>
                  <span className="text-slate-400 text-xs">20회</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="20" 
                  value={makerMaxGuesses} 
                  onChange={(e) => setMakerMaxGuesses(parseInt(e.target.value))}
                  className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>
              
              <button 
                onClick={createGame}
                disabled={isLoading}
                className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white font-bold rounded-2xl transition shadow-lg transform active:scale-95 flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : "게임 코드 생성하기"}
              </button>
            </>
          ) : (
            <div className="text-center animate-fade-in">
              <p className="text-slate-400 mb-2 font-bold">학생들에게 알려줄 입장 코드</p>
              <div className="text-5xl font-mono font-black tracking-widest bg-slate-100 p-6 rounded-2xl mb-6 border-2 border-dashed border-indigo-200 text-indigo-600 select-all">
                {gameCode}
              </div>
              <p className="text-sm text-slate-400 mb-6 bg-yellow-50 p-3 rounded-xl">
                💡 이 코드를 칠판에 적어주세요.<br/>
                (다른 기기에서도 접속 가능합니다!)
              </p>
              <button 
                onClick={resetGame}
                className="text-slate-400 hover:text-slate-600 underline font-bold"
              >
                처음으로 돌아가기
              </button>
            </div>
          )}
        </div>
        {!gameCode && (
           <button onClick={() => setView('HOME')} className="mt-8 text-slate-400 hover:text-indigo-500 font-bold">뒤로가기</button>
        )}
      </div>
    );
  }

  if (view === 'DETECTIVE') {
    return (
      <div className="min-h-screen bg-sky-100 text-slate-700 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border-4 border-white">
          <h2 className="text-2xl font-bold mb-6 text-center text-sky-500 flex items-center justify-center gap-2">
             <Search size={24} /> 사건 현장 입장
          </h2>
          
          <input 
            type="text"
            placeholder="코드 6자리 입력"
            maxLength={6}
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 text-center text-3xl font-bold tracking-widest mb-6 focus:outline-none focus:border-sky-400 text-slate-700 uppercase placeholder:text-slate-300 placeholder:text-xl placeholder:tracking-normal"
          />
          
          <button 
            onClick={joinGame}
            disabled={inputCode.length < 6 || isLoading}
            className="w-full py-4 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition shadow-lg flex items-center justify-center gap-2 transform active:scale-95"
          >
             {isLoading ? <Loader2 className="animate-spin" /> : "수사 시작하기"}
          </button>
        </div>
        <button onClick={() => setView('HOME')} className="mt-8 text-slate-400 hover:text-sky-500 font-bold">뒤로가기</button>
      </div>
    );
  }

  // Game View
  return (
    <div className="min-h-screen bg-sky-100 text-slate-700 flex flex-col items-center p-4">
      {/* Header */}
      <div className="w-full max-w-lg flex justify-between items-center mb-4 pt-2">
        <button onClick={resetGame} className="text-slate-400 hover:text-slate-600 text-sm font-bold bg-white px-3 py-1 rounded-full shadow-sm">
          &larr; 나가기
        </button>
        
        {/* Remaining Guesses Badge */}
        <div className={`
          px-4 py-2 rounded-full border-4 font-extrabold text-lg shadow-md transition-all flex items-center gap-2
          ${guessesUsed >= gameMaxGuesses - 1 
            ? 'bg-red-50 border-red-200 text-red-500 animate-pulse' 
            : 'bg-white border-pink-200 text-pink-500'}
        `}>
          <span>남은 기회 :</span>
          <span className="text-2xl">{gameMaxGuesses - guessesUsed}</span>
        </div>

        <div className="bg-white px-3 py-1 rounded-full text-xs font-mono font-bold text-slate-400 shadow-sm border border-slate-100">
          {inputCode.toUpperCase()}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 w-full max-w-lg flex flex-col pb-12">
        
        {/* Coin Area */}
        <div className="flex-1 flex flex-col justify-center items-center min-h-[300px]">
          <Coin result={coinResult} isFlipping={isFlipping} />
          
          {/* Controls Container */}
          <div className="mt-8 w-full flex flex-col items-center gap-4">
            {/* Auto Flip Button (Dynamic) */}
            <button 
              onClick={() => setIsAutoFlipping(!isAutoFlipping)}
              disabled={isGameOver}
              className={`w-full max-w-[320px] px-8 py-4 rounded-3xl transition flex items-center justify-center gap-3 font-bold text-lg shadow-xl border-4 ${
                isAutoFlipping 
                  ? 'bg-white border-pink-400 text-pink-500' 
                  : isGameOver 
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-500 border-indigo-600 text-white hover:bg-indigo-600 hover:border-indigo-700 hover:scale-105 transform'
              }`}
            >
              {isAutoFlipping ? <Pause size={28} fill="currentColor" /> : (currentBatchSize > 1 ? <FastForward size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />)}
              <span>
                {isAutoFlipping 
                  ? "멈추기" 
                  : `자동 ${currentBatchSize > 1 ? currentBatchSize + '회 ' : ''}던지기`}
              </span>
            </button>
            
            {/* Helper text for next upgrade */}
            {!isAutoFlipping && !isGameOver && (
              <div className="text-xs font-bold text-slate-400 bg-white/50 px-3 py-1 rounded-full animate-fade-in">
                {currentBatchSize === 1 && "✨ 100회 도달 시 기능 업그레이드!"}
                {currentBatchSize === 10 && "✨ 1,000회 도달 시 기능 업그레이드!"}
                {currentBatchSize === 100 && "✨ 10,000회 도달 시 기능 업그레이드!"}
              </div>
            )}
          </div>
        </div>

        {/* Stats & Controls (Added Margin Top) */}
        <div className="bg-white rounded-t-[2.5rem] p-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] w-full relative z-10 border-t-4 border-white">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 mb-6 text-center">
            <div className="bg-slate-100 p-4 rounded-2xl">
              <div className="text-slate-400 text-xs font-bold mb-1">총 횟수</div>
              <div className="text-2xl font-mono font-black text-slate-700">{stats.total}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-2xl border-2 border-blue-100">
              <div className="text-blue-400 text-xs font-bold mb-1">앞면 (그림)</div>
              <div className="text-2xl font-mono font-black text-blue-500">{stats.heads}</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
              <div className="text-slate-400 text-xs font-bold mb-1">뒷면 (숫자)</div>
              <div className="text-2xl font-mono font-black text-slate-600">{stats.tails}</div>
            </div>
          </div>

          {/* Guess Input */}
          <div className="space-y-4">
            {feedback === 'CORRECT' ? (
              <div className="bg-green-100 border-2 border-green-300 rounded-2xl p-6 text-center animate-bounce-short">
                <CheckCircle className="mx-auto text-green-500 w-12 h-12 mb-2" />
                <h3 className="text-2xl font-black text-green-600 mb-1">정답입니다! 🎉</h3>
                <p className="text-green-700 font-bold mb-4">설정된 확률은 {targetProb}% 였습니다.</p>
                <button 
                  onClick={resetGame}
                  className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold shadow-md transition"
                >
                  새로운 게임 시작
                </button>
              </div>
            ) : feedback === 'GAME_OVER' ? (
              <div className="bg-slate-100 border-2 border-slate-300 rounded-2xl p-6 text-center animate-pulse">
                <div className="bg-white inline-block p-2 rounded-full mb-2">
                   <Lock className="text-slate-400 w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-slate-600 mb-1">모든 기회를 소진했습니다!</h3>
                <p className="text-slate-500 text-sm mb-4">아쉽네요. 정답은 <span className="font-bold text-slate-700">{targetProb}%</span> 였습니다.</p>
                <button 
                  onClick={resetGame}
                  className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-bold shadow-md transition"
                >
                  메인으로 돌아가기
                </button>
              </div>
            ) : (
              <>
                 <div className="relative">
                  <label className="text-sm font-bold text-slate-400 mb-2 block pl-1">
                    🔍 조작된 앞면 확률(%)은 얼마일까요?
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      min="0" 
                      max="100"
                      value={guess}
                      onChange={(e) => {
                        if (feedback !== 'GAME_OVER') {
                          setFeedback(null);
                          setGuess(e.target.value);
                        }
                      }}
                      placeholder="?"
                      disabled={isInputDisabled}
                      className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 text-2xl font-bold text-center focus:outline-none focus:border-indigo-400 focus:bg-white disabled:opacity-50 text-indigo-600"
                    />
                    <button 
                      onClick={submitGuess}
                      disabled={isInputDisabled || !guess}
                      className="px-8 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-md transition text-lg"
                    >
                      제출
                    </button>
                  </div>
                 </div>
                 
                 {feedback === 'WRONG' && (
                   <div className="mt-3 flex items-center justify-center gap-2 bg-red-100 text-red-500 py-3 rounded-xl font-bold animate-shake border border-red-200">
                     <AlertTriangle size={20} />
                     <span>틀렸습니다! 다시 생각해보세요.</span>
                   </div>
                 )}
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .animate-spin-fast { animation: spin 0.4s linear infinite; }
        @keyframes spin {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(1800deg); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.3s ease-in-out; }
      `}</style>
    </div>
  );
}
