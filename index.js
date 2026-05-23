const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const fs = require('fs');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load database files
let senders = [];
let users = [];
let history = [];
let prems = [];
let payments = [];

function loadDatabase() {
  try {
    if (fs.existsSync('senders.json')) senders = JSON.parse(fs.readFileSync('senders.json', 'utf8'));
    if (fs.existsSync('users.json')) users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
    if (fs.existsSync('history.json')) history = JSON.parse(fs.readFileSync('history.json', 'utf8'));
    if (fs.existsSync('prem.json')) prems = JSON.parse(fs.readFileSync('prem.json', 'utf8'));
    if (fs.existsSync('payments.json')) payments = JSON.parse(fs.readFileSync('payments.json', 'utf8'));
    console.log('[DATABASE] All files loaded successfully');
  } catch (error) {
    console.error('[DATABASE ERROR]', error.message);
  }
}

// Save database functions
function saveDatabase() {
  try {
    fs.writeFileSync('senders.json', JSON.stringify(senders, null, 2));
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
    fs.writeFileSync('prem.json', JSON.stringify(prems, null, 2));
    fs.writeFileSync('payments.json', JSON.stringify(payments, null, 2));
    console.log('[DATABASE] All files saved successfully');
  } catch (error) {
    console.error('[DATABASE ERROR]', error.message);
  }
}

// Helper functions
function formatRupiah(amount) {
  return "Rp " + Number(amount).toLocaleString("id-ID");
}

function formatTanggalID(timestamp) {
  const d = new Date(timestamp);
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isVIP(id) {
  return prems.some(p => p.id === id);
}

// API Routes
app.get('/api/stats', (req, res) => {
  const totalUsers = users.length;
  const vipUsers = prems.length;
  const totalFix = history.length;
  const successFix = history.filter(h => h.status === 'success').length;
  const activeSenders = senders.filter(s => !s.disabled).length;
  const totalRevenue = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  res.json({
    totalUsers,
    vipUsers,
    totalFix,
    successFix,
    activeSenders,
    totalRevenue
  });
});

app.get('/api/leaderboard', (req, res) => {
  const map = {};
  history.forEach(h => {
    if (!map[h.user]) map[h.user] = 0;
    map[h.user]++;
  });

  const leaderboard = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([uid, count]) => {
      const u = users.find(user => user.id === parseInt(uid));
      return {
        name: u ? (u.name || u.username || "Unknown") : "Unknown",
        count
      };
    });

  res.json(leaderboard);
});

app.post('/api/send', async (req, res) => {
  const { userId, number } = req.body;
  
  if (!number || !/^\+?[0-9]{8,15}$/.test(number)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  try {
    const normalizedNumber = "+" + number.replace(/\D/g, "");
    const appealId = "LRFM" + userId.toString(36).toUpperCase() + Date.now().toString(16).toUpperCase();
    
    // Get available sender
    const activeSenders = senders.filter(s => !s.disabled);
    if (activeSenders.length === 0) {
      return res.status(500).json({ error: 'No active senders available' });
    }
    
    const sender = activeSenders[Math.floor(Math.random() * activeSenders.length)];
    
    // Simulate sending process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    history.push({
      user: userId,
      number: normalizedNumber,
      time: Date.now(),
      status: "success",
      sender: sender.email,
      appealId
    });
    
    saveDatabase();
    
    // Emit to WebSocket
    io.emit('fix_sent', {
      userId,
      number: normalizedNumber,
      appealId
    });
    
    res.json({
      success: true,
      number: normalizedNumber,
      appealId
    });
    
  } catch (error) {
    console.error('[SEND ERROR]', error);
    res.status(500).json({ error: 'Failed to send fix request' });
  }
});

app.post('/api/add-sender', async (req, res) => {
  const { email, password, limit } = req.body;
  
  if (!email || !password || !limit) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (!email.includes("@")) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  const newSender = {
    email: email.trim(),
    pass: password.trim(),
    limit: parseInt(limit) || 50,
    used: 0,
    disabled: false,
    failCount: 0,
    lastReset: Date.now(),
    addedAt: Date.now()
  };
  
  senders.push(newSender);
  saveDatabase();
  
  res.json({
    success: true,
    message: 'Sender added successfully',
    sender: newSender
  });
});

app.post('/api/buy-vip', async (req, res) => {
  const { userId, packageKey } = req.body;
  
  if (!config.vipPackages[packageKey]) {
    return res.status(400).json({ error: 'Invalid package' });
  }
  
  const pkg = config.vipPackages[packageKey];
  const invoice = "INV-" + Date.now().toString(36).toUpperCase();
  
  // Create payment record
  const payment = {
    userId,
    invoice,
    packageKey,
    amount: pkg.price,
    status: "pending",
    createdAt: Date.now()
  };
  
  payments.push(payment);
  saveDatabase();
  
  // Simulate QRIS payment
  setTimeout(() => {
    // Simulate payment success
    const paymentIndex = payments.findIndex(p => p.invoice === invoice);
    if (paymentIndex !== -1) {
      payments[paymentIndex].status = "paid";
      saveDatabase();
      
      // Grant VIP access
      const existingIndex = prems.findIndex(p => p.id === userId);
      if (existingIndex !== -1) {
        prems[existingIndex].expiredAt = Date.now() + (pkg.days * 24 * 60 * 60 * 1000);
      } else {
        prems.push({
          id: userId,
          addedAt: Date.now(),
          expiredAt: Date.now() + (pkg.days * 24 * 60 * 60 * 1000),
          paidVIP: true
        });
      }
      saveDatabase();
      
      io.emit('payment_success', { userId, invoice });
    }
  }, 5000);
  
  res.json({
    success: true,
    invoice,
    qris_url: "https://api.qrispy.id/api/payment/qris/generate"
  });
});

app.post('/api/resend-all', async (req, res) => {
  const { userId } = req.body;
  
  const userHistory = history.filter(h => h.user === userId);
  const successCount = userHistory.length;
  
  for (const record of userHistory) {
    try {
      // Simulate resend
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update history
      record.resended = true;
      record.resendTime = Date.now();
    } catch (error) {
      console.error('[RESEND ERROR]', error);
    }
  }
  
  saveDatabase();
  
  res.json({
    success: true,
    resent: successCount
  });
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('[WEBSOCKET] Client connected');
  
  socket.on('disconnect', () => {
    console.log('[WEBSOCKET] Client disconnected');
  });
});

// Start server
const PORT = config.server.port || 3000;
server.listen(PORT, () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
  loadDatabase();
  
  // Auto-save every 5 minutes
  setInterval(saveDatabase, 300000);
});