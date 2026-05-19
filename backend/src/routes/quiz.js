import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { pool } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Настройка multer для загрузки изображений
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/questions';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Загрузка изображения для вопроса
router.post('/upload-image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const imageUrl = `/uploads/questions/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Create quiz
router.post('/', authenticate, async (req, res) => {
  const { title, description, category, time_limit, questions } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const roomCode = generateRoomCode();
    const quizResult = await client.query(
      'INSERT INTO quizzes (title, description, organizer_id, category, time_limit, room_code, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [title, description, req.user.id, category, time_limit || 30, roomCode, 'draft']
    );

    const quizId = quizResult.rows[0].id;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const questionResult = await client.query(
        'INSERT INTO questions (quiz_id, question_text, question_type, image_url, time_limit, points, order_number) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [quizId, q.text, q.type, q.image_url || null, q.time_limit || 30, q.points || 100, i]
      );

      const questionId = questionResult.rows[0].id;

      for (let j = 0; j < q.options.length; j++) {
        await client.query(
          'INSERT INTO answer_options (question_id, option_text, is_correct, order_number) VALUES ($1, $2, $3, $4)',
          [questionId, q.options[j].text, q.options[j].is_correct, j]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ id: quizId, roomCode });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create quiz error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get quiz by room code
router.get('/room/:code', async (req, res) => {
  const result = await pool.query(
    `SELECT q.*, u.username as organizer_name
     FROM quizzes q
     JOIN users u ON q.organizer_id = u.id
     WHERE q.room_code = $1`,
    [req.params.code]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  res.json(result.rows[0]);
});

// Get user's quizzes
router.get('/my-quizzes', authenticate, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM quizzes WHERE organizer_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(result.rows);
});

// Get user's participated quizzes history
router.get('/my-history', authenticate, async (req, res) => {
  const result = await pool.query(
    `SELECT DISTINCT q.*, qs.started_at, sp.total_score
     FROM session_participants sp
     JOIN quiz_sessions qs ON sp.session_id = qs.id
     JOIN quizzes q ON qs.quiz_id = q.id
     WHERE sp.user_id = $1
     ORDER BY qs.started_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

export default router;