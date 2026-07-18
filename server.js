const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 3000;
const webAppUrl = 'https://yourdomain.com/app'; // Liinkii WebApp keetii asitti naqi

app.use(express.json());
app.use(express.static('public'));

// 1. TELEGRAM BOT SETUP
const bot = new Telegraf('process.env.BOT_TOKEN'); // Token kee asirra kaayi

bot.start((ctx) => {
    const lang = ctx.from.language_code;
    let welcomeText = "";

    if (lang === 'om') {
        welcomeText = "👋 Baga gara Bot tiksii kenya dhuftan!\n\n";
    } else if (lang === 'am') {
        welcomeText = "👋 ወደ ቲኬት መቁረጫ ቦታችን በደህና መጡ!\n\n";
    } else {
        welcomeText = "👋 Welcome to our Online Ticket Bot!\n\n";
    }

    welcomeText += "🌳 Oromoo: Baga gara bot kenya dhuftan!\n" +
                  "🇬🇧 English: Welcome to our ticket bot!\n" +
                  "🇪🇹 Amharic: ወደ ቦታችን በደህና መጡ!";

    ctx.reply(welcomeText, Markup.inlineKeyboard([
        [Markup.button.webApp("🎫 Open Ticket App / App Bani", webAppUrl)]
    ]));
});
bot.launch().then(() => console.log("Telegram Bot is running..."));

// 2. DATABASE SETUP
const db = new sqlite3.Database('./tickets_db.sqlite', (err) => {
    if (err) console.error("Database connection error:", err.message);
    console.log("Connected to SQLite storage database.");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY,
        admin_name TEXT, ticket_price REAL, total_tickets INTEGER, sold_tickets INTEGER DEFAULT 0,
        prize_image TEXT, prize_1st TEXT, prize_2nd TEXT, prize_3rd TEXT, countdown_date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT, full_name TEXT, phone_number TEXT, 
        ticket_count INTEGER, payment_method TEXT, screenshot_path TEXT, status TEXT DEFAULT 'Pending'
    )`);

    db.get("SELECT count(*) as count FROM config", (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO config (id, admin_name, ticket_price, total_tickets, prize_1st, prize_2nd, prize_3rd, countdown_date) 
                    VALUES (1, 'Hunde Tesfaye Jule', 100, 1000, 'Konkolaataa', 'Laptop', 'Bilbila', '2026-12-31T00:00:00')`);
        }
    });
});

// 3. FILE UPLOAD CONFIG
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => {
        cb(null, 'receipt-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

// 4. API ROUTES
app.get('/api/config', (req, res) => {
    db.get("SELECT * FROM config WHERE id = 1", (err, row) => res.json(row));
});

app.post('/api/buy-ticket', upload.single('screenshot'), (req, res) => {
    const { telegram_id, full_name, phone_number, ticket_count, payment_method } = req.body;
    const screenshot_path = req.file ? '/uploads/' + req.file.filename : '';
    if (!screenshot_path) return res.status(400).json({ error: "Screenshot is required!" });

    const query = `INSERT INTO tickets (telegram_id, full_name, phone_number, ticket_count, payment_method, screenshot_path) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [telegram_id, full_name, phone_number, ticket_count, payment_method, screenshot_path], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Kafaltiin kee ergameera, Admin biratti 'Pending' ta'ee jira!" });
    });
});

app.get('/api/my-tickets/:tg_id', (req, res) => {
    db.all("SELECT * FROM tickets WHERE telegram_id = ?", [req.params.tg_id], (err, rows) => res.json(rows));
});

app.get('/api/admin/pending', (req, res) => {
    db.all("SELECT * FROM tickets WHERE status = 'Pending'", (err, rows) => res.json(rows));
});

app.post('/api/admin/action', (req, res) => {
    const { ticket_id, action } = req.body;
    db.serialize(() => {
        db.run("UPDATE tickets SET status = ? WHERE id = ?", [action, ticket_id]);
        if (action === 'Approved') {
            db.get("SELECT ticket_count FROM tickets WHERE id = ?", [ticket_id], (err, row) => {
                if (row) db.run("UPDATE config SET sold_tickets = sold_tickets + ? WHERE id = 1", [row.ticket_count]);
            });
        }
    });
    res.json({ success: true, message: `Ticket ${action} successfully.` });
});

app.post('/api/admin/update-config', (req, res) => {
    const { admin_name, ticket_price, total_tickets, prize_image, prize_1st, prize_2nd, prize_3rd, countdown_date } = req.body;
    const query = `UPDATE config SET admin_name=?, ticket_price=?, total_tickets=?, prize_image=?, prize_1st=?, prize_2nd=?, prize_3rd=?, countdown_date=? WHERE id = 1`;
    db.run(query, [admin_name, ticket_price, total_tickets, prize_image, prize_1st, prize_2nd, prize_3rd, countdown_date], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Odeeffannoon Carraa hundi Admin-niin jijjiirameera!" });
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));