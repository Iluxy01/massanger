const pool = require('./index');

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      is_group BOOLEAN DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (chat_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id),
      sender_name VARCHAR(100),
      text TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('Таблицы созданы успешно');
}

module.exports = { createTables };