// Basic backend server for authentication, avatars, and real-time room
const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: ['http://localhost:5173',
        'https://twod-room-voicechat-1.onrender.com'],
         credentials: true }
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173',
    'https://twod-room-voicechat-1.onrender.com'], credentials: true }));
app.use(express.json());

// In-memory user store
const users = {};
const sessions = {};

// --- REST API ---

// Login/Register
app.post('/api/login', (req, res) => {
    const { email, name } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'Email and name required' });
    let user = users[email];
    if (!user) {
        user = { email, name, avatar: null };
        users[email] = user;
    }
    const token = jwt.sign({ email, name }, JWT_SECRET, { expiresIn: '2h' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ token, user });
});

// Get avatars
app.get('/api/avatars', (req, res) => {
    const avatars = JSON.parse(fs.readFileSync(path.join(__dirname, 'avatars.json')));
    res.json(avatars);
});

// Set avatar
app.post('/api/set-avatar', (req, res) => {
    const { token, avatarId } = req.body;
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = users[payload.email];
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.avatar = avatarId;
        res.json({ success: true });
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// --- WebSocket (Socket.IO) ---

// In-memory room state
let roomUsers = {};

io.on('connection', (socket) => {
    socket.on('join', ({ token, avatarId, position }) => {
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            const user = users[payload.email];
            if (!user) return;
            user.avatar = avatarId;
            roomUsers[socket.id] = {
                email: user.email,
                name: user.name,
                avatar: avatarId,
                position,
                socketId: socket.id
            };
            io.emit('roomUsers', Object.values(roomUsers));
        } catch (e) {
            socket.emit('error', 'Invalid token');
        }
    });

    socket.on('move', ({ position }) => {
        if (roomUsers[socket.id]) {
            roomUsers[socket.id].position = position;
            io.emit('roomUsers', Object.values(roomUsers));
        }
    });

    // WebRTC signaling relay
    socket.on('signal', (data) => {
        const { to, signal } = data;
        if (roomUsers[to]) {
            io.to(to).emit('signal', { from: socket.id, signal });
        }
    });

    socket.on('disconnect', () => {
        delete roomUsers[socket.id];
        io.emit('roomUsers', Object.values(roomUsers));
    });
});

// --- Serve avatars images (static) ---
app.use('/avatars', express.static(path.join(__dirname, 'avatars')));

server.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
}); 