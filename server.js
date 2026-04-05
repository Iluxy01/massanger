require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const pool = require('./src/db/index');
const { createTables } = require('./src/db/schema');

const authRoutes = require('./src/routes/auth');
const chatsRoutes = require('./src/routes/chats');
const usersRoutes = require('./src/routes/users');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/users', usersRoutes);

app.get('/', (req, res) => res.json({ status: 'Сервер работает!' }));

// Активные пользователи: userId -> socketId
const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Нет токена'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (e) {
    next(new Error('Недействительный токен'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);
  console.log(`Пользователь ${userId} подключился`);

  // Присоединяем к комнатам всех чатов пользователя
  pool.query(
    'SELECT chat_id FROM chat_members WHERE user_id = $1', [userId]
  ).then(result => {
    result.rows.forEach(row => {
      socket.join(`chat_${row.chat_id}`);
    });
  });

  // Отправка сообщения
  socket.on('send_message', async (data) => {
    const { chat_id, text } = data;
    if (!text || !text.trim()) return;

    try {
      // Проверяем что пользователь в чате
      const member = await pool.query(
        'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
        [chat_id, userId]
      );
      if (member.rows.length === 0) return;

      const user = await pool.query(
        'SELECT display_name FROM users WHERE id = $1', [userId]
      );

      const result = await pool.query(
        `INSERT INTO messages (chat_id, sender_id, sender_name, text) 
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [chat_id, userId, user.rows[0].display_name, text.trim()]
      );

      const message = result.rows[0];

      // Отправляем всем в комнате чата
      io.to(`chat_${chat_id}`).emit('new_message', message);
    } catch (e) {
      console.error('Ошибка отправки сообщения:', e);
    }
  });

  // Присоединиться к новому чату
  socket.on('join_chat', (chatId) => {
    socket.join(`chat_${chatId}`);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    console.log(`Пользователь ${userId} отключился`);
  });
});

const PORT = process.env.PORT || 3001;

createTables().then(() => {
  server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
  });
}).catch(err => {
  console.error('Ошибка создания таблиц:', err);
});