const express = require('express');
require('dotenv').config();

const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const os = require('os');

const app = express();
const port = 8082;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// --- Local File Storage for User Logs ---
const STORAGE_DIR = path.join(__dirname, 'storage');
const LOGS_FILE = path.join(STORAGE_DIR, 'user_logs.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Helper to load logs from local file
function getLocalLogs() {
    try {
        if (fs.existsSync(LOGS_FILE)) {
            const data = fs.readFileSync(LOGS_FILE, 'utf8');
            return JSON.parse(data || '[]');
        }
    } catch (err) {
        console.error("Error reading local logs:", err);
    }
    return [];
}

// Helper to save logs to local file
function saveLocalLogs(logs) {
    try {
        fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
    } catch (err) {
        console.error("Error writing local logs:", err);
    }
}

// Helper to get local IPv4 network address
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return null;
}

// MongoDB Connection Setup
const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mastergrid';
console.log(`Connecting to MongoDB...`);
mongoose.set('bufferCommands', false);

// Run SQLite automatic data migration only when Mongoose connection is fully open and ready!
mongoose.connection.once('open', () => {
    runSQLiteMigration();
});

function connectMongoDB() {
    mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000
    })
    .then(() => {
        console.log('MongoDB Connected Successfully!');
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err.message);
        console.log('Retrying connection in 15 seconds...');
        setTimeout(connectMongoDB, 15000);
    });
}

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
    setTimeout(connectMongoDB, 5000);
});

mongoose.connection.on('connected', () => {
    console.log('MongoDB connection established.');
});

connectMongoDB();


// Mongoose Schemas & Models
const adminSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true }
});
const AdminSetting = mongoose.model('AdminSetting', adminSettingSchema);

const userLogSchema = new mongoose.Schema({
    date: { type: String, required: true }, // Format e.g., '16.05.2026'
    schoolName: { type: String, required: true },
    year: { type: String, required: true },
    ip: { type: String, required: true },
    previews: { type: Number, default: 0 },
    pdfs: { type: Number, default: 0 },
    timestamp: { type: Number, required: true }
});
userLogSchema.index({ timestamp: -1 }); // Index by timestamp for fast sorting

const UserLog = mongoose.model('UserLog', userLogSchema);

const paymentSchema = new mongoose.Schema({
    school_ip: { type: String, required: true, unique: true },
    timestamp: { type: Number, required: true }
});
const Payment = mongoose.model('Payment', paymentSchema);

const userSchema = new mongoose.Schema({
    school: { type: String, required: true },
    ip: { type: String, required: true },
    last_seen: { type: Number, required: true },
    created_at: { type: Number, required: true }
});
userSchema.index({ school: 1, ip: 1 }, { unique: true });
const User = mongoose.model('User', userSchema);

const trustedIpSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true }
});
const TrustedIp = mongoose.model('TrustedIp', trustedIpSchema);

// SQLite Automatic Migration Helper
function runSQLiteMigration() {
    const dbPath = path.join(__dirname, 'mastergrid.sqlite');
    if (!fs.existsSync(dbPath)) {
        return; // No SQLite file to migrate
    }
    
    console.log("Found mastergrid.sqlite! Initiating automatic data migration to MongoDB...");
    try {
        const sqlite3 = require('sqlite3').verbose();
        const tempDb = new sqlite3.Database(dbPath);
        
        tempDb.serialize(() => {
            // Migrate Admin Settings
            tempDb.all("SELECT * FROM admin_settings", [], async (err, rows) => {
                if (!err && rows) {
                    for (const row of rows) {
                        await AdminSetting.updateOne({ key: row.key }, { value: row.value }, { upsert: true });
                    }
                    console.log(`Migrated ${rows.length} Admin Settings.`);
                }
            });
            
            // Migrate Payments
            tempDb.all("SELECT * FROM payments", [], async (err, rows) => {
                if (!err && rows) {
                    for (const row of rows) {
                        await Payment.updateOne({ school_ip: row.school_ip }, { timestamp: row.timestamp }, { upsert: true });
                    }
                    console.log(`Migrated ${rows.length} Payments.`);
                }
            });
            
            // Migrate Users
            tempDb.all("SELECT * FROM users", [], async (err, rows) => {
                if (!err && rows) {
                    for (const row of rows) {
                        await User.updateOne(
                            { school: row.school, ip: row.ip },
                            { last_seen: row.last_seen, created_at: row.created_at },
                            { upsert: true }
                        );
                    }
                    console.log(`Migrated ${rows.length} Registered Users.`);
                }
            });
            
            // Migrate Trusted IPs
            tempDb.all("SELECT * FROM trusted_ips", [], async (err, rows) => {
                if (!err && rows) {
                    for (const row of rows) {
                        await TrustedIp.updateOne({ ip: row.ip }, {}, { upsert: true });
                    }
                    console.log(`Migrated ${rows.length} Trusted IPs.`);
                }
                
                // Close and rename SQLite database
                tempDb.close((closeErr) => {
                    if (!closeErr) {
                        try {
                            fs.renameSync(dbPath, dbPath + '.migrated');
                            console.log("SQLite migration fully completed and database file renamed to mastergrid.sqlite.migrated!");
                        } catch (renameErr) {
                            console.error("Failed to rename SQLite file:", renameErr.message);
                        }
                    }
                });
            });
        });
    } catch (e) {
        console.error("Failed to perform SQLite migration. The sqlite3 dependency may not be loaded:", e.message);
    }
}

// Live Users Tracking (In-memory)
let activeUsers = {};

// Helper: Get IP
const getIp = (req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress.replace(/^.*:/, '');

// API: Get State
app.get('/api/state', async (req, res) => {
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
        paymentEnabled: false,
        adminPassword: 'mastergrid2026',
        activeUsers: Object.values(activeUsers),
        yourIp: ip,
        dbConnected: true
    };

    if (mongoose.connection.readyState !== 1) {
        state.dbConnected = false;
        state.dbError = "MongoDB connection not established / offline";
        try {
            const localLogs = getLocalLogs();
            localLogs.sort((a, b) => b.timestamp - a.timestamp);
            state.usageLogs = localLogs.slice(0, 500).map(l => ({
                id: l._id || l.timestamp,
                timestamp: l.timestamp,
                school: l.schoolName,
                ip: l.ip,
                type: `previews: ${l.previews}, pdfs: ${l.pdfs}`,
                year: l.year,
                previews: l.previews,
                pdfs: l.pdfs,
                date: l.date
            }));
        } catch (localErr) {
            console.error("Local storage log load failed:", localErr.message);
        }
        return res.json(state);
    }

    try {
        // Load settings
        const settings = await AdminSetting.find({});
        settings.forEach(row => {
            if (row.key === 'paymentEnabled') state.paymentEnabled = row.value === 'true';
            if (row.key === 'adminPassword') state.adminPassword = row.value;
        });

        // Load payments
        const payments = await Payment.find({});
        payments.forEach(p => {
            state.paymentRecords[p.school_ip] = p.timestamp;
        });

        // Load trusted IPs
        const trustedIps = await TrustedIp.find({});
        state.adminIps = trustedIps.map(t => t.ip);

        // Load new UserLogs sorted by date/timestamp desc
        let logs = [];
        try {
            logs = await UserLog.find({}).sort({ timestamp: -1 }).limit(500);
            saveLocalLogs(logs);
        } catch (dbErr) {
            console.error("MongoDB fetch logs error, falling back to local storage:", dbErr.message);
            logs = getLocalLogs();
            logs.sort((a, b) => b.timestamp - a.timestamp);
        }
        state.usageLogs = logs.map(l => ({
            id: l._id || l.timestamp,
            timestamp: l.timestamp,
            school: l.schoolName,
            ip: l.ip,
            type: `previews: ${l.previews}, pdfs: ${l.pdfs}`,
            year: l.year,
            previews: l.previews,
            pdfs: l.pdfs,
            date: l.date
        }));

        res.json(state);
    } catch (err) {
        state.dbConnected = false;
        state.dbError = err.message;
        try {
            const logs = getLocalLogs();
            logs.sort((a, b) => b.timestamp - a.timestamp);
            state.usageLogs = logs.slice(0, 500).map(l => ({
                id: l._id || l.timestamp,
                timestamp: l.timestamp,
                school: l.schoolName,
                ip: l.ip,
                type: `previews: ${l.previews}, pdfs: ${l.pdfs}`,
                year: l.year,
                previews: l.previews,
                pdfs: l.pdfs,
                date: l.date
            }));
        } catch (localErr) {
            console.error("Error reading local logs in catch fallback:", localErr.message);
        }
        res.json(state); // Return fallback state so dashboard works even if DB is offline!
    }
});

// API: Record Payment
app.post('/api/pay', async (req, res) => {
    try {
        const { school, ip, timestamp } = req.body;
        const key = `${school}_${ip}`;
        await Payment.updateOne(
            { school_ip: key },
            { timestamp: timestamp || Date.now() },
            { upsert: true }
        );
        res.json({ status: 'paid', key: key });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Save State
app.post('/api/state', async (req, res) => {
    try {
        const data = req.body;

        if (data.paymentEnabled !== undefined) {
            await AdminSetting.updateOne(
                { key: 'paymentEnabled' },
                { value: String(data.paymentEnabled) },
                { upsert: true }
            );
        }
        if (data.adminPassword) {
            await AdminSetting.updateOne(
                { key: 'adminPassword' },
                { value: data.adminPassword },
                { upsert: true }
            );
        }

        if (data.adminIps) {
            await TrustedIp.deleteMany({});
            if (data.adminIps.length > 0) {
                const ipsToInsert = data.adminIps.map(ip => ({ ip }));
                await TrustedIp.insertMany(ipsToInsert);
            }
        }

        if (data.paymentRecords) {
            for (const [k, v] of Object.entries(data.paymentRecords)) {
                await Payment.updateOne(
                    { school_ip: k },
                    { timestamp: v },
                    { upsert: true }
                );
            }
        }

        res.json({ status: 'ok', yourIp: getIp(req) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Heartbeat
app.post('/api/heartbeat', async (req, res) => {
    try {
        const ip = getIp(req);
        const { school } = req.body;
        const schoolName = school || 'Guest';
        const key = `${ip}_${schoolName}`;
        const now = Date.now();

        // In-memory active users
        activeUsers[key] = {
            ip: ip,
            school: schoolName,
            lastSeen: now,
            lastSeenStr: new Date().toLocaleTimeString()
        };

        // Get global paymentEnabled
        const paymentSetting = await AdminSetting.findOne({ key: 'paymentEnabled' });
        const paymentEnabled = paymentSetting ? paymentSetting.value === 'true' : false;

        // Get payment status for this user
        const pkey = `${schoolName}_${ip}`;
        const pmt = await Payment.findOne({ school_ip: pkey });
        const paidTimestamp = pmt ? pmt.timestamp : null;

        // Update or insert User
        await User.updateOne(
            { school: schoolName, ip: ip },
            { $set: { last_seen: now }, $setOnInsert: { created_at: now } },
            { upsert: true }
        );

        res.json({ status: 'alive', yourIp: ip, paymentEnabled, paidTimestamp });
    } catch (err) {
        console.error("Heartbeat error:", err.message);
        res.json({ status: 'alive', yourIp: getIp(req), paymentEnabled: false, paidTimestamp: null });
    }
});

// API: GetAllUsers
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ last_seen: -1 });
        const payments = await Payment.find({});
        const paidKeys = new Set(payments.map(p => p.school_ip));

        const userRows = users.map((u, i) => {
            const schoolIpKey = `${u.school}_${u.ip}`;
            return {
                id: i + 1,
                school: u.school,
                ip: u.ip,
                last_seen: u.last_seen,
                created_at: u.created_at,
                has_paid: paidKeys.has(schoolIpKey) ? 1 : 0
            };
        });

        res.json({ users: userRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Revoke Payment
app.post('/api/unpay', async (req, res) => {
    try {
        const { school, ip } = req.body;
        const key = `${school}_${ip}`;
        await Payment.deleteOne({ school_ip: key });
        res.json({ status: 'unpaid', key: key });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Delete User
app.delete('/api/users', async (req, res) => {
    try {
        const { school, ip } = req.body;
        await User.deleteOne({ school: school, ip: ip });
        const key = `${school}_${ip}`;
        await Payment.deleteOne({ school_ip: key });
        res.json({ status: 'deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// NEW API: UserLog Trigger Endpoint
app.post('/api/userlog/trigger', async (req, res) => {
    try {
        const { schoolName, year } = req.body;
        if (!schoolName || !year) {
            return res.status(400).json({ error: "schoolName and year are required" });
        }
        
        const ip = getIp(req);
        // Format current date as DD.MM.YYYY
        const d = new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const yearStr = d.getFullYear();
        const formattedDate = `${day}.${month}.${yearStr}`;
        
        // Always create a new log entry for live tracking whenever they enter school/year
        const log = new UserLog({
            date: formattedDate,
            schoolName: schoolName.trim(),
            year: year.trim(),
            ip: ip,
            previews: 0,
            pdfs: 0,
            timestamp: Date.now()
        });
        
        let savedLog = null;
        try {
            savedLog = await log.save();
            console.log(`Live UserLog created: ${schoolName.trim()} (${yearStr})`);
        } catch (dbErr) {
            console.warn("DB offline, creating temporary local log model");
            savedLog = log;
        }

        // Save to local storage file
        try {
            const localLogs = getLocalLogs();
            localLogs.push({
                _id: savedLog._id || savedLog.timestamp,
                date: savedLog.date,
                schoolName: savedLog.schoolName,
                year: savedLog.year,
                ip: savedLog.ip,
                previews: savedLog.previews,
                pdfs: savedLog.pdfs,
                timestamp: savedLog.timestamp
            });
            saveLocalLogs(localLogs);
        } catch (localErr) {
            console.error("Failed to write to local storage logs:", localErr.message);
        }
        
        res.json({ status: 'triggered', log: savedLog });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// NEW API: UserLog Increment Endpoint
app.post('/api/userlog/increment', async (req, res) => {
    try {
        const { schoolName, year, type } = req.body;
        if (!schoolName || !year || !type) {
            return res.status(400).json({ error: "schoolName, year, and type are required" });
        }
        
        const ip = getIp(req);
        
        const incrementField = type === 'preview' ? 'previews' : (type === 'pdf' ? 'pdfs' : null);
        if (!incrementField) {
            return res.status(400).json({ error: "Invalid type. Must be 'preview' or 'pdf'" });
        }
        
        let updatedLog = null;
        try {
            updatedLog = await UserLog.findOneAndUpdate(
                {
                    schoolName: schoolName.trim(),
                    year: year.trim(),
                    ip: ip
                },
                { 
                    $inc: { [incrementField]: 1 }
                },
                { sort: { timestamp: -1 }, new: true }
            );
        } catch (dbErr) {
            console.warn("DB offline during increment");
        }

        // Sync to local storage
        try {
            const localLogs = getLocalLogs();
            // Find the last log with same schoolName, year, ip
            const index = localLogs.map(l => l.schoolName === schoolName.trim() && l.year === year.trim() && l.ip === ip).lastIndexOf(true);
            if (index !== -1) {
                localLogs[index][incrementField] = (localLogs[index][incrementField] || 0) + 1;
                saveLocalLogs(localLogs);
                if (!updatedLog) {
                    updatedLog = localLogs[index];
                }
            } else {
                // If not found, create fallback
                const d = new Date();
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const formattedDate = `${day}.${month}.${d.getFullYear()}`;
                const fallbackLog = {
                    _id: Date.now(),
                    date: formattedDate,
                    schoolName: schoolName.trim(),
                    year: year.trim(),
                    ip: ip,
                    previews: type === 'preview' ? 1 : 0,
                    pdfs: type === 'pdf' ? 1 : 0,
                    timestamp: Date.now()
                };
                localLogs.push(fallbackLog);
                saveLocalLogs(localLogs);
                if (!updatedLog) {
                    updatedLog = fallbackLog;
                }
            }
        } catch (localErr) {
            console.error("Failed to increment in local storage:", localErr.message);
        }
        
        res.json({ status: 'incremented', log: updatedLog });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// NEW API: Get All UserLogs
app.get('/api/userlogs', async (req, res) => {
    try {
        let logs = [];
        if (mongoose.connection.readyState === 1) {
            logs = await UserLog.find({}).sort({ timestamp: -1 });
            saveLocalLogs(logs);
        } else {
            logs = getLocalLogs();
            logs.sort((a, b) => b.timestamp - a.timestamp);
        }
        res.json({ logs });
    } catch (err) {
        try {
            const logs = getLocalLogs();
            logs.sort((a, b) => b.timestamp - a.timestamp);
            res.json({ logs });
        } catch (e) {
            res.status(500).json({ error: err.message });
        }
    }
});

// DELETE: Delete a specific UserLog
app.delete('/api/userlogs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Delete from MongoDB if online
        let dbDeleted = false;
        if (mongoose.connection.readyState === 1) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                const result = await UserLog.findByIdAndDelete(id);
                if (result) dbDeleted = true;
            } else {
                const result = await UserLog.deleteOne({ timestamp: Number(id) });
                if (result.deletedCount > 0) dbDeleted = true;
            }
        }
        
        // 2. Delete from local JSON storage
        let localLogs = getLocalLogs();
        const initialLength = localLogs.length;
        
        localLogs = localLogs.filter(l => {
            if (l._id && String(l._id) === id) return false;
            if (l.timestamp && String(l.timestamp) === id) return false;
            return true;
        });
        
        saveLocalLogs(localLogs);
        const localDeleted = localLogs.length < initialLength;
        
        res.json({ 
            status: 'deleted', 
            id,
            dbDeleted,
            localDeleted
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: Clear all UserLogs
app.delete('/api/userlogs/clear', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            await UserLog.deleteMany({});
        }
        saveLocalLogs([]);
        res.json({ status: 'cleared' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log(`\n--- MasterGrid Pro Server Started ---`);
    console.log(`Local URL:   http://localhost:${port}`);
    if (localIp) {
        console.log(`Network URL: http://${localIp}:${port}`);
    } else {
        console.log(`Network URL: Connect to your Wi-Fi to access from other devices`);
    }
    console.log(`Database:    MongoDB (${mongoURI.replace(/:([^:@]+)@/, ':****@')})`);
    console.log(`--------------------------------------\n`);
});
