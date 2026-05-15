const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const port = 8082;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Database Setup
const dbPath = path.join(__dirname, 'mastergrid.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Admin State Table (Global Settings)
    db.run(`CREATE TABLE IF NOT EXISTS admin_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // Usage Logs Table
    db.run(`CREATE TABLE IF NOT EXISTS usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER,
        school TEXT,
        ip TEXT,
        type TEXT
    )`);

    // Payments Table
    db.run(`CREATE TABLE IF NOT EXISTS payments (
        school_ip TEXT PRIMARY KEY,
        timestamp INTEGER
    )`);

    // Trusted IPs Table
    db.run(`CREATE TABLE IF NOT EXISTS trusted_ips (
        ip TEXT PRIMARY KEY
    )`);

    // Initial Migration from JSON if exists
    const jsonPath = path.join(__dirname, 'admin_state.json');
    if (fs.existsSync(jsonPath)) {
        console.log("Migrating from admin_state.json...");
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        // Save settings
        db.run("INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)", ['paymentEnabled', String(data.paymentEnabled)]);
        db.run("INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)", ['adminPassword', data.adminPassword || 'mastergrid2026']);
        
        // Save logs
        if (data.usageLogs) {
            const stmt = db.prepare("INSERT INTO usage_logs (timestamp, school, ip, type) VALUES (?, ?, ?, ?)");
            data.usageLogs.forEach(log => {
                stmt.run(log.timestamp, log.school, log.ip, log.type);
            });
            stmt.finalize();
        }

        // Save payments
        if (data.paymentRecords) {
            const stmt = db.prepare("INSERT OR REPLACE INTO payments (school_ip, timestamp) VALUES (?, ?)");
            Object.entries(data.paymentRecords).forEach(([key, val]) => {
                stmt.run(key, val);
            });
            stmt.finalize();
        }

        // Save trusted IPs
        if (data.adminIps) {
            const stmt = db.prepare("INSERT OR REPLACE INTO trusted_ips (ip) VALUES (?)");
            data.adminIps.forEach(ip => stmt.run(ip));
            stmt.finalize();
        }

        // Rename old file to backup
        fs.renameSync(jsonPath, jsonPath + '.bak');
        console.log("Migration complete.");
    }
});

// Live Users Tracking (In-memory)
let activeUsers = {};

// Helper: Get IP
const getIp = (req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress.replace(/^.*:/, '');

// API: Get State
app.get('/api/state', (req, res) => {
    const ip = getIp(req);
    
    // Prune active users (older than 45s)
    const now = Date.now();
    Object.keys(activeUsers).forEach(key => {
        if (now - activeUsers[key].lastSeen > 45000) delete activeUsers[key];
    });

    const state = {
        usageLogs: [],
        paymentRecords: {},
        adminIps: [],
        paymentEnabled: true,
        adminPassword: 'mastergrid2026',
        activeUsers: Object.values(activeUsers),
        yourIp: ip
    };

    // Load from DB
    db.all("SELECT * FROM admin_settings", [], (err, rows) => {
        rows.forEach(row => {
            if (row.key === 'paymentEnabled') state.paymentEnabled = row.value === 'true';
            if (row.key === 'adminPassword') state.adminPassword = row.value;
        });

        db.all("SELECT * FROM usage_logs ORDER BY timestamp DESC LIMIT 500", [], (err, logs) => {
            state.usageLogs = logs;

            db.all("SELECT * FROM payments", [], (err, pmts) => {
                pmts.forEach(p => state.paymentRecords[p.school_ip] = p.timestamp);

                db.all("SELECT * FROM trusted_ips", [], (err, tips) => {
                    state.adminIps = tips.map(t => t.ip);
                    res.json(state);
                });
            });
        });
    });
});

// API: Record Payment
app.post('/api/pay', (req, res) => {
    const { school, ip, timestamp } = req.body;
    const key = `${school}_${ip}`;
    db.run("INSERT OR REPLACE INTO payments (school_ip, timestamp) VALUES (?, ?)", [key, timestamp || Date.now()], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ status: 'paid', key: key });
    });
});

// API: Save State
app.post('/api/state', (req, res) => {
    const data = req.body;
    
    db.serialize(() => {
        if (data.paymentEnabled !== undefined) {
            db.run("INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)", ['paymentEnabled', String(data.paymentEnabled)]);
        }
        if (data.adminPassword) {
            db.run("INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)", ['adminPassword', data.adminPassword]);
        }
        
        if (data.usageLogs && data.usageLogs.length > 0) {
            const last = data.usageLogs[data.usageLogs.length - 1];
            db.run("INSERT INTO usage_logs (timestamp, school, ip, type) VALUES (?, ?, ?, ?)", [last.timestamp, last.school, last.ip, last.type]);
        }

        if (data.adminIps) {
            db.run("DELETE FROM trusted_ips", [], () => {
                const stmt = db.prepare("INSERT INTO trusted_ips (ip) VALUES (?)");
                data.adminIps.forEach(ip => stmt.run(ip));
                stmt.finalize();
            });
        }

        if (data.paymentRecords) {
            const stmt = db.prepare("INSERT OR REPLACE INTO payments (school_ip, timestamp) VALUES (?, ?)");
            Object.entries(data.paymentRecords).forEach(([k, v]) => stmt.run(k, v));
            stmt.finalize();
        }
    });

    res.json({ status: 'ok', yourIp: getIp(req) });
});

// API: Heartbeat
app.post('/api/heartbeat', (req, res) => {
    const ip = getIp(req);
    const { school } = req.body;
    const schoolName = school || 'Guest';
    const key = `${ip}_${schoolName}`;

    activeUsers[key] = {
        ip: ip,
        school: schoolName,
        lastSeen: Date.now(),
        lastSeenStr: new Date().toLocaleTimeString()
    };

    res.json({ status: 'alive', yourIp: ip });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`--- MasterGrid Pro Server Started ---`);
    console.log(`Port: ${port}`);
    console.log(`Database: SQLite (${dbPath})`);
});
