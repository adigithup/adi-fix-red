const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize Telegram Bot
const bot = new TelegramBot(config.bot.token, { polling: true });

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

function isOwner(id) {
  return id === config.bot.ownerId;
}

function isAdmin(id) {
  return isOwner(id) || config.bot.adminIds.includes(id);
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

// Telegram Bot Commands
bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  
  const welcomeText = `
🤖 *ADI FIX MERAH BOT - ADMIN PANEL*

Selamat datang di panel administrasi bot!

📊 *Menu Utama:*
• /addsender - Tambah sender baru
• /listsenders - List semua sender
• /delsender <index> - Hapus sender
• /resetsenders - Reset semua sender
• /stats - Statistik sistem
• /vip - Kelola VIP
• /broadcast <pesan> - Broadcast ke semua user
• /balance - Saldo QRIS
• /payments - Riwayat pembayaran
• /addvip <user_id> - Tambah manual VIP
• /removevip <user_id> - Hapus VIP
• /listvip - List VIP
• /backup - Backup manual
• /reload - Reload konfigurasi

⚡ Gunakan /help untuk bantuan lebih lanjut.
  `;
  
  bot.sendMessage(userId, welcomeText, { parse_mode: "Markdown" });
});

bot.onText(/\/help/, (msg) => {
  const helpText = `
📖 *BANTUAN ADMIN PANEL*

🔧 *Perintah Sender:*
• /addsender <email|password|limit> - Tambah sender baru
• /listsenders - Lihat daftar sender
• /delsender <index> - Hapus sender by index
• /resetsenders - Reset semua sender

👥 *Perintah User:*
• /stats - Statistik sistem
• /vip - Kelola VIP
• /broadcast <pesan> - Broadcast ke semua user

💰 *Perintang Pembayaran:*
• /balance - Cek saldo QRIS
• /payments - Riwayat pembayaran

👑 *Perintah VIP:*
• /addvip <user_id> - Tambah VIP manual
• /removevip <user_id> - Hapus VIP
• /listvip - List semua VIP

🔧 *Perintah Lain:*
• /backup - Backup database
• /reload - Reload konfigurasi
  `;
  
  bot.sendMessage(msg.chat.id, helpText, { parse_mode: "Markdown" });
});

bot.onText(/\/addsender (.+)/, (msg, match) => {
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak! Anda bukan owner.");
  }
  
  const parts = match[1].split("|");
  
  if (parts.length < 3) {
    return bot.sendMessage(
      msg.chat.id,
      "❌ Format salah!\n\nGunakan: /addsender <email|password|limit>\n\nContoh: /addsender contoh@gmail.com|password123|100",
      { parse_mode: "Markdown" }
    );
  }

  const [email, pass, limitStr] = parts;
  const limit = parseInt(limitStr) || 50;

  if (!email.includes("@")) {
    return bot.sendMessage(msg.chat.id, "❌ Format email tidak valid!", { parse_mode: "Markdown" });
  }

  senders.push({
    email: email.trim(),
    pass: pass.trim(),
    limit,
    used: 0,
    disabled: false,
    failCount: 0,
    lastReset: Date.now(),
    addedAt: Date.now()
  });

  saveDatabase();

  bot.sendMessage(
    msg.chat.id,
    `✅ *SENDER BERHASIL DITAMBAHKAN!*\n\n` +
    `📧 Email: \`${email.trim()}\`\n` +
    `📊 Limit: *${limit}/hari*\n` +
    `✅ Status: *AKTIF*`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/listsenders/, (msg) => {
  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");
  }
  
  if (senders.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 Belum ada sender yang terdaftar.");
  }

  let text = `📋 *LIST SENDER (${senders.length})*\n\n`;
  
  senders.forEach((s, i) => {
    const statusIcon = s.disabled ? "❌" : "✅";
    const statusText = s.disabled 
      ? `NONAKTIF - ${s.disabledReason || 'Unknown'}` 
      : `AKTIF (${s.used || 0}/${s.limit || 50})`;
    
    text += `${i + 1}. ${statusIcon} \`${s.email}\`\n`;
    text += `   └ Status: *${statusText}*\n\n`;
  });

  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

bot.onText(/\/delsender (\d+)/, (msg, match) => {
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak! Anda bukan owner.");
  }
  
  const index = parseInt(match[1]) - 1;
  
  if (index < 0 || index >= senders.length) {
    return bot.sendMessage(msg.chat.id, "❌ Index tidak valid!");
  }

  const removed = senders.splice(index, 1)[0];
  saveDatabase();

  bot.sendMessage(
    msg.chat.id,
    `🗑 *SENDER DIHAPUS*\n\n` +
    `📧 Email: \`${removed.email}\``,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/resetsenders/, (msg) => {
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak! Anda bukan owner.");
  }

  senders.forEach(s => {
    s.used = 0;
    s.disabled = false;
    s.failCount = 0;
    delete s.disabledReason;
    delete s.disabledAt;
    s.lastReset = Date.now();
  });

  saveDatabase();

  bot.sendMessage(
    msg.chat.id,
    "♻️ *SEMUA SENDER DIRESET!*\n\n" +
    "✅ Usage direset ke 0\n" +
    "✅ Semua sender diaktifkan kembali\n" +
    "✅ Fail count direset",
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/stats/, (msg) => {
  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");
  }
  
  const totalUsers = users.length;
  const vipUsers = prems.length;
  const totalFix = history.length;
  const successFix = history.filter(h => h.status === 'success').length;
  const activeSenders = senders.filter(s => !s.disabled).length;
  const totalRevenue = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const statsText = `
📊 *STATISTIK SISTEM*

👥 *USERS*
• Total: *${totalUsers}*
• VIP Aktif: *${vipUsers}*
• Free: *${totalUsers - vipUsers}*

📬 *AKTIVITAS*
• Total Request: *${totalFix}*
• Sukses: *${successFix}*
• Gagal: *${totalFix - successFix}*
• Persentase: *${totalFix > 0 ? ((successFix / totalFix) * 100).toFixed(1) : 0}%*

📧 *SENDERS*
• Total: *${senders.length}*
• Aktif: *${activeSenders}*
• Mati: *${senders.length - activeSenders}*

💰 *REVENUE*
• Total: *${formatRupiah(totalRevenue)}*
  `;

  bot.sendMessage(msg.chat.id, statsText, { parse_mode: "Markdown" });
});

bot.onText(/\/vip/, (msg) => {
  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");
  }
  
  let text = `💎 *MANAGE VIP*\n\n`;
  text += `1. /addvip <user_id> - Tambah VIP manual\n`;
  text += `2. /removevip <user_id> - Hapus VIP\n`;
  text += `3. /listvip - List semua VIP\n\n`;
  text += `📦 *VIP Packages:*\n`;
  
  Object.entries(config.vipPackages).forEach(([key, pkg]) => {
    text += `• ${pkg.label}: ${formatRupiah(pkg.price)} (${pkg.days} hari)\n`;
  });
  
  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

bot.onText(/\/addvip (\d+)/, (msg, match) => {
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak! Anda bukan owner.");
  }
  
  const targetId = parseInt(match[1]);
  
  if (isNaN(targetId)) {
    return bot.sendMessage(msg.chat.id, "❌ Format salah! Gunakan: /addvip <user_id>");
  }
  
  if (prems.find(p => p.id === targetId)) {
    return bot.sendMessage(msg.chat.id, `⚠️ User \`${targetId}\` sudah VIP.`, { parse_mode: "Markdown" });
  }

  prems.push({
    id: targetId,
    addedAt: Date.now(),
    expiredAt: null,
    paidVIP: false,
    grantedBy: 'owner'
  });

  saveDatabase();

  bot.sendMessage(
    msg.chat.id,
    `✅ *VIP BERHASIL DITAMBAHKAN!*\n\n` +
    `User ID: \`${targetId}\`\n` +
    `Type: *MANUAL (Permanent)*\n` +
    `Limit: *UNLIMITED*`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/removevip (\d+)/, (msg, match) => {
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak! Anda bukan owner.");
  }
  
  const targetId = parseInt(match[1]);
  const idx = prems.findIndex(p => p.id === targetId);

  if (idx === -1) {
    return bot.sendMessage(msg.chat.id, `⚠️ User \`${targetId}\` tidak ditemukan di daftar VIP.`, { parse_mode: "Markdown" });
  }

  prems.splice(idx, 1);
  saveDatabase();

  bot.sendMessage(
    msg.chat.id,
    `✅ *VIP DIHAPUS*\n\nUser ID: \`${targetId}\` berhasil dihapus dari VIP.`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/listvip/, (msg) => {
  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");
  }
  
  if (prems.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 Belum ada user VIP.");
  }

  let text = `👥 *DAFTAR USER VIP (${prems.length})*\n\n`;
  
  prems.forEach((p, i) => {
    const u = users.find(u => u.id === p.id);
    const name = u ? (u.name || u.username || "-") : "-";
    const method = p.paidVIP ? "💳 Bayar" : "🎁 Manual";
    
    let expireInfo = "♾ PERMANEN";
    if (p.expiredAt) {
      const daysLeft = Math.ceil((p.expiredAt - Date.now()) / (1000 * 60 * 60 * 24));
      expireInfo = daysLeft > 0 ? `${daysLeft} hari lagi` : "⏰ EXPIRED";
    }

    text += `${i + 1}. \`${p.id}\` - *${name}*\n`;
    text += `   ├ Method: ${method}\n`;
    text += `   ├ Expire: ${expireInfo}\n`;
    text += `   └ Since: ${formatTanggalID(p.addedAt)}\n\n`;
  });

  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

bot.onText(/\/broadcast (.+)/, (msg, match) => {
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak! Anda bukan owner.");
  }
  
  const message = match[1];
  
  if (!message) {
    return bot.sendMessage(msg.chat.id, "❌ Format salah! Gunakan: /broadcast <pesan>");
  }
  
  let success = 0;
  let failed = 0;

  const broadcast = async () => {
    for (const user of users) {
      try {
        await bot.sendMessage(user.id, message, { parse_mode: "Markdown" });
        success++;
        await new Promise(resolve => setTimeout(resolve, 100)); // Delay to avoid rate limit
      } catch (error) {
        failed++;
        console.error(`[BROADCAST FAIL] User ${user.id}:`, error.message);
      }
    }
    
    bot.sendMessage(
      msg.chat.id,
      `📢 *BROADCAST SELESAI*\n\n` +
      `✅ Berhasil: *${success}*\n` +
      `❌ Gagal: *${failed}*\n` +
      `📊 Total: *${users.length}*`,
      { parse_mode: "Markdown" }
    );
  };
  
  bot.sendMessage(msg.chat.id, "📢 *MEMULAI BROADCAST...*\n\nMohon tunggu, proses sedang berjalan...", { parse_mode: "Markdown" });
  broadcast();
});

bot.onText(/\/balance/, (msg) => {
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak! Anda bukan owner.");
  }
  
  bot.sendMessage(
    msg.chat.id,
    `💰 *SALDO QRIS MERCHANT*\n\n` +
    `🏪 Merchant: *${config.services.qris.merchantName || "ADI FIX MERAH"}*\n` +
    `💵 Saldo: *${formatRupiah(config.services.qris.balance || 0)}*\n` +
    `💱 Currency: ${config.services.qris.currency || 'IDR'}\n\n` +
    `_Update: ${formatTanggalID(Date.now())}_`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/payments/, (msg) => {
  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");
  }
  
  if (payments.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 Belum ada riwayat pembayaran.");
  }
  
  const recent = payments.slice(-10).reverse();
  
  let text = `💳 *RIWAYAT PEMBAYARAN (10 Terakhir)*\n\n`;
  
  recent.forEach((p, i) => {
    const icons = { paid: "✅", pending: "⏳", expired: "❌", cancelled: "🚫" };
    const icon = icons[p.status] || "❓";
    
    text += `${i + 1}. ${icon} *${formatRupiah(p.amount)}* - ${config.vipPackages[p.packageKey]?.label || '-'}\n`;
    text += `   ├ User: \`${p.userId}\`\n`;
    text += `   ├ Invoice: \`${p.invoice || '-'}\`\n`;
    text += `   └ Date: ${formatTanggalID(p.createdAt)}\n\n`;
  });
  
  const totalPaid = payments.filter(p => p.status === "paid").length;
  const totalRev = payments.filter(p => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0);
  
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💰 Total Paid: *${totalPaid}*\n`;
  text += `💵 Revenue: *${formatRupiah(totalRev)}*`;
  
  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

bot.onText(/\/backup/, (msg) => {
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak! Anda bukan owner.");
  }
  
  saveDatabase();
  
  bot.sendMessage(
    msg.chat.id,
    `✅ *BACKUP SELESAI!*\n\n` +
    `Database berhasil disimpan ke file:\n` +
    `• senders.json\n` +
    `• users.json\n` +
    `• history.json\n` +
    `• prem.json\n` +
    `• payments.json`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/reload/, (msg) => {
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak! Anda bukan owner.");
  }
  
  loadDatabase();
  
  bot.sendMessage(
    msg.chat.id,
    `✅ *RELOAD SELESAI!*\n\n` +
    `Konfigurasi dan database berhasil dimuat ulang.`,
    { parse_mode: "Markdown" }
  );
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