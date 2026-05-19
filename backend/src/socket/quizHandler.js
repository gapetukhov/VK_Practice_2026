import { pool } from '../database/db.js';

const activeRooms = new Map();
const roomTimers = new Map();

function calculatePoints(isCorrect, timeTaken, timeLimit, basePoints = 100) {
  if (!isCorrect) return 0;
  const speedBonus = Math.floor((1 - timeTaken / timeLimit) * 50);
  return basePoints + speedBonus;
}

export function setupQuizHandlers(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-quiz', async ({ roomCode, userId, username }) => {
      try {
        // Проверяем, не присоединился ли уже этот пользователь
        const roomSockets = await io.in(roomCode).fetchSockets();
        const alreadyJoined = roomSockets.some(s => s.data?.userId === userId);

        if (alreadyJoined) {
          console.log(`User ${userId} already in room ${roomCode}`);
          socket.emit('error', { message: 'Already joined this quiz' });
          return;
        }

        // Сохраняем userId в socket data для отслеживания
        socket.data.userId = userId;
        socket.join(roomCode);

        // Получаем quiz_id по room_code
        const quizResult = await pool.query(
          'SELECT id FROM quizzes WHERE room_code = $1',
          [roomCode]
        );

        if (quizResult.rows.length === 0) {
          socket.emit('error', { message: 'Quiz not found' });
          return;
        }

        const quizId = quizResult.rows[0].id;

        // Находим или создаем активную сессию для этого квиза
        let sessionResult = await pool.query(
          `SELECT id FROM quiz_sessions
           WHERE quiz_id = $1 AND finished_at IS NULL`,
          [quizId]
        );

        let sessionId;
        if (sessionResult.rows.length === 0) {
          // Создаем новую сессию
          const newSession = await pool.query(
            'INSERT INTO quiz_sessions (quiz_id, started_at) VALUES ($1, NOW()) RETURNING id',
            [quizId]
          );
          sessionId = newSession.rows[0].id;
          console.log(`Created new session ${sessionId} for quiz ${quizId}`);
        } else {
          sessionId = sessionResult.rows[0].id;
          console.log(`Using existing session ${sessionId} for quiz ${quizId}`);
        }

        // Проверяем, не зарегистрирован ли уже участник в этой сессии
        const existingParticipant = await pool.query(
          'SELECT id FROM session_participants WHERE session_id = $1 AND user_id = $2',
          [sessionId, userId]
        );

        if (existingParticipant.rows.length === 0) {
          // Добавляем участника
          await pool.query(
            'INSERT INTO session_participants (session_id, user_id) VALUES ($1, $2)',
            [sessionId, userId]
          );
          console.log(`Added participant ${userId} to session ${sessionId}`);
        } else {
          console.log(`Participant ${userId} already in session ${sessionId}`);
        }

        // Получаем список всех участников
        const participants = await pool.query(
          `SELECT u.id, u.username, COALESCE(sp.total_score, 0) as total_score
           FROM session_participants sp
           JOIN users u ON sp.user_id = u.id
           WHERE sp.session_id = $1
           ORDER BY sp.joined_at`,
          [sessionId]
        );

        socket.emit('joined', { sessionId, participants: participants.rows });
        socket.to(roomCode).emit('participant-joined', {
          userId,
          username,
          participants: participants.rows
        });

      } catch (error) {
        console.error('Error in join-quiz:', error);
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('start-quiz', async ({ roomCode }) => {
      console.log(`Starting quiz for room ${roomCode}`);

      try {
        // Проверяем, не запущен ли уже квиз
        if (activeRooms.has(roomCode)) {
          socket.emit('error', { message: 'Quiz already started' });
          return;
        }

        // Получаем информацию о квизе
        const quizResult = await pool.query(
          'SELECT id, time_limit FROM quizzes WHERE room_code = $1',
          [roomCode]
        );

        if (quizResult.rows.length === 0) {
          socket.emit('error', { message: 'Quiz not found' });
          return;
        }

        const quizId = quizResult.rows[0].id;

        // Получаем все вопросы квиза
        const questions = await pool.query(
          'SELECT * FROM questions WHERE quiz_id = $1 ORDER BY order_number',
          [quizId]
        );

        if (questions.rows.length === 0) {
          socket.emit('error', { message: 'No questions found for this quiz' });
          return;
        }

        // Находим активную сессию
        let sessionResult = await pool.query(
          `SELECT id FROM quiz_sessions
           WHERE quiz_id = $1 AND finished_at IS NULL`,
          [quizId]
        );

        let sessionId;
        if (sessionResult.rows.length === 0) {
          // Создаем новую сессию, если почему-то ее нет
          const newSession = await pool.query(
            'INSERT INTO quiz_sessions (quiz_id, started_at) VALUES ($1, NOW()) RETURNING id',
            [quizId]
          );
          sessionId = newSession.rows[0].id;
          console.log(`Created new session ${sessionId} for started quiz`);
        } else {
          sessionId = sessionResult.rows[0].id;
        }

        // Сохраняем активную комнату
        activeRooms.set(roomCode, {
          quizId: quizId,
          sessionId: sessionId,
          questions: questions.rows,
          currentQuestionIndex: 0,
          answers: new Map()
        });

        console.log(`Quiz started for room ${roomCode} with ${questions.rows.length} questions`);

        // Уведомляем всех участников
        io.to(roomCode).emit('quiz-started', { totalQuestions: questions.rows.length });

        // Отправляем первый вопрос
        await sendNextQuestion(io, roomCode);

      } catch (error) {
        console.error('Error in start-quiz:', error);
        socket.emit('error', { message: error.message });
      }
    });

    async function sendNextQuestion(io, roomCode) {
      const room = activeRooms.get(roomCode);
      if (!room) {
        console.log(`Room ${roomCode} not found in active rooms`);
        return;
      }

      if (room.currentQuestionIndex >= room.questions.length) {
        console.log(`All questions completed for room ${roomCode}`);
        await finishQuiz(io, roomCode);
        return;
      }

      const question = room.questions[room.currentQuestionIndex];
      console.log(`Sending question ${room.currentQuestionIndex + 1}/${room.questions.length} to room ${roomCode}`);

      // Получаем варианты ответов
      const options = await pool.query(
        'SELECT id, option_text, order_number FROM answer_options WHERE question_id = $1 ORDER BY order_number',
        [question.id]
      );

      // Обновляем текущий вопрос в сессии
      await pool.query(
        'UPDATE quiz_sessions SET current_question_id = $1 WHERE id = $2',
        [question.id, room.sessionId]
      );

      const startTime = Date.now();

      // Отправляем вопрос всем в комнате
      io.to(roomCode).emit('question-started', {
        question: {
          id: question.id,
          text: question.question_text,
          type: question.question_type,
          imageUrl: question.image_url,
          timeLimit: question.time_limit,
          points: question.points
        },
        options: options.rows,
        startTime: startTime,
        questionNumber: room.currentQuestionIndex + 1,
        totalQuestions: room.questions.length
      });

      // Очищаем предыдущий таймер
      if (roomTimers.has(roomCode)) {
        clearTimeout(roomTimers.get(roomCode));
      }

      // Устанавливаем таймер для завершения вопроса
      const timer = setTimeout(async () => {
        console.log(`Question ${room.currentQuestionIndex + 1} time expired for room ${roomCode}`);
        await moveToNextQuestion(io, roomCode);
      }, question.time_limit * 1000);

      roomTimers.set(roomCode, timer);
    }

    async function moveToNextQuestion(io, roomCode) {
      const room = activeRooms.get(roomCode);
      if (room) {
        room.currentQuestionIndex++;
        await sendNextQuestion(io, roomCode);
      }
    }

    socket.on('submit-answer', async ({ roomCode, userId, questionId, selectedOptions, timeTaken }) => {
      const room = activeRooms.get(roomCode);
      if (!room) {
        socket.emit('answer-error', { message: 'No active quiz session' });
        return;
      }

      // Проверяем, не отправлен ли уже ответ
      const answerKey = `${userId}-${questionId}`;
      if (room.answers.has(answerKey)) {
        socket.emit('answer-error', { message: 'Answer already submitted' });
        return;
      }

      try {
        // Получаем правильные ответы
        const correctOptions = await pool.query(
          'SELECT id FROM answer_options WHERE question_id = $1 AND is_correct = true',
          [questionId]
        );

        const correctIds = correctOptions.rows.map(row => row.id);
        const isCorrect = selectedOptions.length === correctIds.length &&
          selectedOptions.every(opt => correctIds.includes(opt));

        const question = room.questions.find(q => q.id === questionId);
        const points = calculatePoints(isCorrect, timeTaken, question.time_limit, question.points);

        // Сохраняем ответ
        await pool.query(
          `INSERT INTO participant_answers (session_id, user_id, question_id, selected_options, time_taken, points_earned)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [room.sessionId, userId, questionId, selectedOptions, timeTaken, points]
        );

        // Обновляем общий счет
        await pool.query(
          `UPDATE session_participants
           SET total_score = total_score + $1
           WHERE session_id = $2 AND user_id = $3`,
          [points, room.sessionId, userId]
        );

        // Сохраняем в памяти, что ответ получен
        room.answers.set(answerKey, { points, isCorrect });

        console.log(`Answer submitted for user ${userId}, question ${questionId}, points: ${points}`);

        socket.emit('answer-submitted', { points, isCorrect, correctAnswers: correctIds });

      } catch (error) {
        console.error('Error submitting answer:', error);
        socket.emit('answer-error', { message: error.message });
      }
    });

    async function finishQuiz(io, roomCode) {
      const room = activeRooms.get(roomCode);
      if (!room) return;

      console.log(`Finishing quiz for room ${roomCode}`);

      // Очищаем таймер
      if (roomTimers.has(roomCode)) {
        clearTimeout(roomTimers.get(roomCode));
        roomTimers.delete(roomCode);
      }

      // Обновляем время окончания сессии
      await pool.query(
        'UPDATE quiz_sessions SET finished_at = NOW() WHERE id = $1',
        [room.sessionId]
      );

      // Получаем финальную таблицу лидеров
      const leaderboard = await pool.query(
        `SELECT u.id, u.username, sp.total_score
         FROM session_participants sp
         JOIN users u ON sp.user_id = u.id
         WHERE sp.session_id = $1
         ORDER BY sp.total_score DESC`,
        [room.sessionId]
      );

      console.log(`Quiz finished, leaderboard:`, leaderboard.rows);

      // Отправляем результаты всем участникам
      io.to(roomCode).emit('quiz-finished', { leaderboard: leaderboard.rows });

      // Удаляем активную комнату
      activeRooms.delete(roomCode);
    }

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Очистка при необходимости
    });
  });
}