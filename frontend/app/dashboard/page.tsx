'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Quiz {
  id: number;
  title: string;
  description: string;
  room_code: string;
  status: string;
  created_at: string;
  total_score?: number;
  started_at?: string;
}

export default function Dashboard() {
  const [myQuizzes, setMyQuizzes] = useState<Quiz[]>([]);
  const [history, setHistory] = useState<Quiz[]>([]);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token || !userData) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchData(token, parsedUser);
  }, [router]);

  const fetchData = async (token: string, userData: any) => {
    try {
      if (userData?.role === 'organizer') {
        const quizzesRes = await axios.get('http://localhost:5000/api/quizzes/my-quizzes', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMyQuizzes(quizzesRes.data);
      }

      const historyRes = await axios.get('http://localhost:5000/api/quizzes/my-history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHistory(historyRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 py-8">
      <div className="container mx-auto px-6">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        <div className="bg-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Welcome, {user.username}!</h2>
          <p className="text-gray-400">Role: {user.role === 'organizer' ? 'Organizer' : 'Participant'}</p>
        </div>

        {user.role === 'organizer' && (
          <div className="bg-gray-800 rounded-xl p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">My Quizzes</h2>
              <Link href="/quiz/create" className="btn-primary">+ Create New</Link>
            </div>
            {myQuizzes.length === 0 ? (
              <p className="text-gray-400">No quizzes created yet.</p>
            ) : (
              <div className="space-y-4">
                {myQuizzes.map(quiz => (
                  <div key={quiz.id} className="bg-gray-700 rounded-lg p-4">
                    <h3 className="font-bold text-lg">{quiz.title}</h3>
                    <p className="text-gray-400 text-sm">{quiz.description}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm">Code: <span className="font-mono font-bold">{quiz.room_code}</span></span>
                      <Link href={`/quiz/play/${quiz.room_code}`} className="btn-secondary text-sm">
                        Start Quiz
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">Quiz History</h2>
          {history.length === 0 ? (
            <p className="text-gray-400">No quiz history yet. Join some quizzes!</p>
          ) : (
            <div className="space-y-4">
              {history.map(quiz => (
                <div key={quiz.id} className="bg-gray-700 rounded-lg p-4">
                  <h3 className="font-bold text-lg">{quiz.title}</h3>
                  <p className="text-gray-400 text-sm">{quiz.description}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm">Score: <span className="font-bold text-yellow-400">{quiz.total_score || 0} points</span></span>
                    <span className="text-sm text-gray-400">
                      {quiz.started_at ? new Date(quiz.started_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}