'use client';

import { useParams, useRouter } from 'next/navigation';

export default function Lobby() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode as string;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center shadow-2xl">
        <h2 className="text-3xl font-bold mb-4">Quiz Created!</h2>
        <div className="bg-gray-900 rounded-lg p-4 mb-6">
          <p className="text-gray-400">Share this code with participants:</p>
          <p className="text-5xl font-bold tracking-widest text-blue-500 my-4">{roomCode}</p>
        </div>
        <button onClick={() => router.push(`/quiz/play/${roomCode}`)} className="btn-primary w-full">
          Go to Lobby
        </button>
      </div>
    </div>
  );
}