'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import io, { Socket } from 'socket.io-client';

interface Participant {
  id: number;
  username: string;
  total_score: number;
}

interface Question {
  id: number;
  text: string;
  type: string;
  imageUrl: string | null;
  timeLimit: number;
  points: number;
}

interface Option {
  id: number;
  option_text: string;
}

export default function PlayQuiz() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [leaderboard, setLeaderboard] = useState<Participant[]>([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [joined, setJoined] = useState(false);
  const [pointsEarned, setPointsEarned] = useState<number | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Загружаем пользователя только на клиенте
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (!token || !userData) {
      router.push('/login');
      return;
    }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    setIsOrganizer(parsedUser.role === 'organizer');
  }, [router]);

  // Подключение к socket
  useEffect(() => {
    if (!user) return;

    const newSocket = io('http://localhost:5000', {
      transports: ['websocket', 'polling'],
    });
    setSocket(newSocket);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      newSocket.close();
    };
  }, [user]);

  // Обработка socket событий
  useEffect(() => {
    if (!socket || !roomCode || !user || !joined) return;

    console.log('Setting up socket event handlers');

    const handleQuestionStarted = ({ question, options: opts, startTime, questionNumber: qNum, totalQuestions: total }) => {
      console.log('Question started:', question);
      setCurrentQuestion(question);
      setOptions(opts);
      setTimeRemaining(question.timeLimit);
      setSelectedOptions([]);
      setQuestionNumber(qNum);
      setTotalQuestions(total);
      setPointsEarned(null);
      startTimeRef.current = startTime;

      // Очищаем предыдущий интервал
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }

      // Запускаем таймер
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.max(0, question.timeLimit - elapsed);
        setTimeRemaining(remaining);

        if (remaining === 0 && timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
      }, 100);
    };

    const handleQuizFinished = ({ leaderboard: lb }) => {
      console.log('Quiz finished, leaderboard:', lb);
      setLeaderboard(lb);
      setQuizFinished(true);
      setQuizStarted(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };

    const handleQuizStarted = ({ totalQuestions: total }) => {
      console.log('Quiz started event received! Total questions:', total);
      setQuizStarted(true);
      setTotalQuestions(total);
    };

    const handleAnswerSubmitted = ({ points, isCorrect, correctAnswers }) => {
      console.log('Answer submitted:', points, isCorrect);
      setPointsEarned(points);
    };

    const handleError = ({ message }) => {
      console.error('Socket error:', message);
      setError(message);
      setTimeout(() => setError(null), 3000);
    };

    socket.on('quiz-started', handleQuizStarted);
    socket.on('question-started', handleQuestionStarted);
    socket.on('quiz-finished', handleQuizFinished);
    socket.on('answer-submitted', handleAnswerSubmitted);
    socket.on('error', handleError);
    socket.on('answer-error', handleError);

    return () => {
      socket.off('quiz-started', handleQuizStarted);
      socket.off('question-started', handleQuestionStarted);
      socket.off('quiz-finished', handleQuizFinished);
      socket.off('answer-submitted', handleAnswerSubmitted);
      socket.off('error', handleError);
      socket.off('answer-error', handleError);
    };
  }, [socket, roomCode, user, joined]);

  // Присоединение к квизу
  useEffect(() => {
    if (!socket || !roomCode || !user || joined) return;

    console.log('Joining quiz:', roomCode);
    socket.emit('join-quiz', { roomCode, userId: user.id, username: user.username });

    const handleJoined = ({ sessionId, participants: parts }) => {
      console.log('Joined quiz:', sessionId, parts);
      setParticipants(parts);
      setJoined(true);
    };

    const handleParticipantJoined = ({ participants: parts }) => {
      console.log('Participant joined:', parts);
      setParticipants(parts);
    };

    socket.on('joined', handleJoined);
    socket.on('participant-joined', handleParticipantJoined);

    return () => {
      socket.off('joined', handleJoined);
      socket.off('participant-joined', handleParticipantJoined);
    };
  }, [socket, roomCode, user, joined]);

  const handleOptionSelect = (optionId: number) => {
    if (!currentQuestion) return;

    if (currentQuestion.type === 'single') {
      setSelectedOptions([optionId]);
    } else {
      if (selectedOptions.includes(optionId)) {
        setSelectedOptions(selectedOptions.filter(id => id !== optionId));
      } else {
        setSelectedOptions([...selectedOptions, optionId]);
      }
    }
  };

  const handleSubmitAnswer = () => {
    if (!currentQuestion || selectedOptions.length === 0) return;

    const timeTaken = Math.floor((Date.now() - startTimeRef.current) / 1000);
    console.log('Submitting answer:', { roomCode, userId: user?.id, questionId: currentQuestion.id, selectedOptions, timeTaken });

    socket?.emit('submit-answer', {
      roomCode,
      userId: user?.id,
      questionId: currentQuestion.id,
      selectedOptions,
      timeTaken
    });
  };

  const handleStartQuiz = () => {
    console.log('Starting quiz from frontend');
    socket?.emit('start-quiz', { roomCode });
  };

  // Отображение ошибки
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="bg-red-600 text-white p-4 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl">Loading...</p>
        </div>
      </div>
    );
  }

  if (quizFinished) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-2xl w-full shadow-2xl">
          <h2 className="text-3xl font-bold mb-6 text-center text-green-500">Quiz Finished!</h2>
          <h3 className="text-2xl font-bold mb-4 text-center">Leaderboard</h3>
          <div className="space-y-2 mb-6">
            {leaderboard.map((player, idx) => (
              <div key={player.id} className="flex justify-between items-center bg-gray-700 p-4 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-bold text-blue-400">#{idx + 1}</span>
                  <span className="font-bold">{player.username}</span>
                  {player.id === user?.id && <span className="text-sm text-yellow-500">(You)</span>}
                </div>
                <span className="text-xl font-bold text-yellow-400">{player.total_score} pts</span>
              </div>
            ))}
          </div>
          <button onClick={() => router.push('/')} className="btn-primary w-full">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl">Joining quiz...</p>
        </div>
      </div>
    );
  }

  // Лобби (квиз еще не начался)
  if (!quizStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center shadow-2xl">
          <h2 className="text-3xl font-bold mb-4">Quiz Lobby</h2>
          <div className="bg-gray-900 rounded-lg p-4 mb-6">
            <p className="text-gray-400">Room Code:</p>
            <p className="text-4xl font-bold tracking-widest text-blue-500">{roomCode}</p>
          </div>
          <h3 className="text-xl font-bold mb-3">Participants ({participants.length})</h3>
          <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
            {participants.map(p => (
              <div key={p.id} className="bg-gray-700 p-2 rounded flex justify-between items-center">
                <span>{p.username}</span>
                {p.id === user?.id && <span className="text-xs text-blue-400">(You)</span>}
              </div>
            ))}
          </div>
          {isOrganizer && (
            <button
              onClick={handleStartQuiz}
              className="btn-primary w-full text-lg py-3"
            >
              Start Quiz
            </button>
          )}
          {!isOrganizer && (
            <p className="text-gray-400">Waiting for organizer to start the quiz...</p>
          )}
        </div>
      </div>
    );
  }

  // Игра активна, показываем вопрос
  if (currentQuestion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-6">
        <div className="bg-gray-800 rounded-xl p-8 max-w-2xl w-full shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <span className="text-gray-400">Question {questionNumber} / {totalQuestions}</span>
            <div className={`rounded-lg px-4 py-2 font-bold ${
              timeRemaining <= 5 ? 'bg-red-600 animate-pulse' : 'bg-blue-600'
            }`}>
              {timeRemaining}s
            </div>
          </div>

          <div className="mb-6">
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${(timeRemaining / (currentQuestion.timeLimit || 30)) * 100}%` }}
              ></div>
            </div>
          </div>

          {currentQuestion.imageUrl && (
            <div className="relative h-64 w-full mb-6 bg-gray-900 rounded-lg flex items-center justify-center p-4">
              <img
                src={`http://localhost:5000${currentQuestion.imageUrl}`}
                alt="Question illustration"
                className="max-h-full max-w-full object-contain rounded-lg"
              />
            </div>
          )}

          <h2 className="text-2xl font-bold mb-6">{currentQuestion.text}</h2>

          <div className="space-y-3 mb-6">
            {options.map(option => (
              <button
                key={option.id}
                onClick={() => handleOptionSelect(option.id)}
                className={`w-full text-left p-4 rounded-lg transition duration-200 ${
                  selectedOptions.includes(option.id)
                    ? 'bg-blue-600 border-2 border-blue-400'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {option.option_text}
              </button>
            ))}
          </div>

          <button
            onClick={handleSubmitAnswer}
            disabled={selectedOptions.length === 0}
            className={`btn-primary w-full py-3 text-lg ${selectedOptions.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Submit Answer
          </button>

          {pointsEarned !== null && (
            <div className={`mt-4 p-3 rounded-lg text-center animate-bounce ${
              pointsEarned > 0 ? 'bg-green-600' : 'bg-red-600'
            }`}>
              {pointsEarned > 0 ? ` +${pointsEarned} points!` : 'Wrong answer!'}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Загрузка вопроса
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-xl">Loading question...</p>
      </div>
    </div>
  );
}