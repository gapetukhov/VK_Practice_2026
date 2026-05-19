import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Подключение к default базе данных для создания quiz_app
const defaultPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'postgres', // подключаемся к стандартной БД
});

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export async function initDb() {
  // Сначала создаем базу данных, если она не существует
  const client = await defaultPool.connect();
  try {
    // Проверяем существование базы данных
    const res = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [process.env.DB_NAME]
    );

    if (res.rowCount === 0) {
      console.log(`Creating database ${process.env.DB_NAME}...`);
      await client.query(`CREATE DATABASE ${process.env.DB_NAME}`);
      console.log(`Database ${process.env.DB_NAME} created successfully`);
    }
  } catch (err) {
    console.error('Error creating database:', err);
  } finally {
    client.release();
  }

  // Теперь подключаемся к созданной БД и создаем таблицы
  const dbClient = await pool.connect();
  try {
    console.log('Creating tables...');
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'participant',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quizzes (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        organizer_id INTEGER REFERENCES users(id),
        category VARCHAR(100),
        time_limit INTEGER DEFAULT 30,
        room_code VARCHAR(10) UNIQUE,
        status VARCHAR(20) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        question_type VARCHAR(20) NOT NULL,
        image_url VARCHAR(500),
        time_limit INTEGER DEFAULT 30,
        points INTEGER DEFAULT 100,
        order_number INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS answer_options (
        id SERIAL PRIMARY KEY,
        question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
        option_text TEXT NOT NULL,
        is_correct BOOLEAN DEFAULT FALSE,
        order_number INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quiz_sessions (
        id SERIAL PRIMARY KEY,
        quiz_id INTEGER REFERENCES quizzes(id),
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP,
        current_question_id INTEGER REFERENCES questions(id)
      );

      CREATE TABLE IF NOT EXISTS session_participants (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES quiz_sessions(id),
        user_id INTEGER REFERENCES users(id),
        total_score INTEGER DEFAULT 0,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS participant_answers (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES quiz_sessions(id),
        user_id INTEGER REFERENCES users(id),
        question_id INTEGER REFERENCES questions(id),
        selected_options INTEGER[],
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        time_taken INTEGER,
        points_earned INTEGER DEFAULT 0
      );
    `);
    console.log('Tables created successfully');
  } catch (err) {
    console.error('Error creating tables:', err);
    throw err;
  } finally {
    dbClient.release();
  }
}