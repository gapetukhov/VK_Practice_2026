'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const [roomCode, setRoomCode] = useState('');
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleJoinQuiz = () => {
    if (roomCode.trim()) {
      router.push(`/quiz/play/${roomCode.toUpperCase()}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      <nav className="bg-gray-800 shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-500">QuizMaster</h1>
            <div className="space-x-4">
              {user ? (
                <>
                  <span className="text-gray-300">Welcome, {user.username}</span>
                  {user.role === 'organizer' && (
                    <Link href="/quiz/create" className="btn-primary">Create Quiz</Link>
                  )}
                  <Link href="/dashboard" className="btn-secondary">Dashboard</Link>
                  <button onClick={handleLogout} className="btn-secondary">Logout</button>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn-secondary">Login</Link>
                  <Link href="/register" className="btn-primary">Register</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold mb-4">Create & Play Quizzes</h2>
          <p className="text-xl text-gray-400">Real-time multiplayer quiz game</p>
        </div>

        <div className="max-w-md mx-auto bg-gray-800 rounded-xl p-8 shadow-2xl">
          <h3 className="text-2xl font-bold mb-6 text-center">Join a Quiz</h3>
          <input
            type="text"
            placeholder="Enter room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            className="input-field mb-4 text-center text-2xl tracking-widest"
            maxLength={6}
          />
          <button onClick={handleJoinQuiz} className="btn-primary w-full">
            Join Quiz
          </button>
        </div>

        {user?.role === 'organizer' && (
          <div className="mt-12 text-center">
            <Link href="/quiz/create" className="btn-primary text-lg px-8 py-3">
              + Create New Quiz
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}