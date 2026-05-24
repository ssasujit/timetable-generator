// Global error catcher — surfaces any silent JS crash as a visible toast
window.onerror = function(msg, src, line, col, err) {
    const text = `JS ERROR: ${msg} (line ${line})`;
    console.error(text, err);
    // Show toast if function exists
    if (typeof showToast === 'function') showToast(text, 'error');
    return false;
};

// State Management
let state = {
    settings: {
        periods: 8,
        schoolName: '',
        year: ''
    },
    subjectRules: [], // { id, name, periods, std }
    teacherRules: [], // { id, name, charge, classes: [{std, subj}] }
    tempTeacherClasses: [], // Used while filling the form
    preferences: [], // { id, subj, type, day, periods: [] }
    tempPrefPeriods: [],
    editingTeacherId: null,
    paymentRecords: {}, // { "SchoolName_IP": timestamp }
    usageLogs: [], // { timestamp, school, ip, type: 'preview'|'download' }
    adminPassword: 'mastergrid2026',
    adminIps: [], // List of IPs that skip payment
    paymentEnabled: true, // Global toggle for payment requirement
    userIp: 'unknown'
};

// DOM Elements
const els = {
    periods: document.getElementById('setting-periods'),
    school: document.getElementById('setting-school'),
    year: document.getElementById('setting-year'),
    
    subjName: document.getElementById('subject-name'),
    subjPeriods: document.getElementById('subject-periods'),
    subjStd: document.getElementById('subject-std'),
    subjTableContainer: document.getElementById('subject-table-container'),
    
    teacherName: document.getElementById('teacher-name'),
    teacherCharge: document.getElementById('teacher-charge'),
    teacherTakesStd: document.getElementById('teacher-takes-std'),
    teacherTakesSubj: document.getElementById('teacher-takes-subj'),
    tempTeacherList: document.getElementById('current-teacher-classes'),
    teacherList: document.getElementById('teacher-rule-list'),
    
    outClassSelect: document.getElementById('output-class-select'),
    outTeacherSelect: document.getElementById('output-teacher-select'),
    summaryContainer: document.getElementById('teacher-summary-container'),
    toastContainer: document.getElementById('toast-container'),
    
    prefSubject: document.getElementById('pref-subject'),
    prefTeacher: document.getElementById('pref-teacher'),
    prefType: document.getElementById('pref-type'),
    prefDay: document.getElementById('pref-day'),
    prefPeriodSelect: document.getElementById('pref-period-select'),
    prefPeriodSingleSelect: document.getElementById('pref-period-single-select'),
    tempPrefList: document.getElementById('temp-pref-periods'),
    prefClubbedClasses: document.getElementById('pref-clubbed-classes'),
    preferenceList: document.getElementById('preference-list'),
    
    // Groups for toggling visibility
    prefDayGroup: document.getElementById('pref-day-group'),
    prefPeriodGroup: document.getElementById('pref-period-group'),
    prefPeriodSingleGroup: document.getElementById('pref-period-single-group'),
    prefClubbedGroup: document.getElementById('pref-clubbed-group'),
    prefSecondPairGroup: document.getElementById('pref-second-pair-group'),
    prefSubject2: document.getElementById('pref-subject-2'),
    prefTeacher2: document.getElementById('pref-teacher-2'),
    loadingModal: null,
    loadingStatus: null,
    
    // Preview Modal
    previewModal: document.getElementById('preview-modal'),
    previewScrollContainer: document.getElementById('preview-scroll-container'),
    previewTitle: document.getElementById('preview-title'),
    btnClosePreview: document.getElementById('btn-close-preview'),
    paymentBanner: document.getElementById('payment-status-banner'),
    
    // User Guide
    guideModal: document.getElementById('user-guide-modal'),
    btnUserGuide: document.getElementById('btn-user-guide'),
    btnCloseGuide: document.getElementById('btn-close-guide'),
    btnGuideGotIt: document.getElementById('btn-guide-got-it'),
    
    // Admin
    adminLoginModal: document.getElementById('admin-login-modal'),
    adminDashModal: document.getElementById('admin-dashboard-modal'),
    btnAdminLogin: document.getElementById('btn-admin-login'),
    btnCloseAdminLogin: document.getElementById('btn-close-admin-login'),
    btnDoLogin: document.getElementById('btn-do-login'),
    adminUser: document.getElementById('admin-username'),
    adminPass: document.getElementById('admin-password'),
    adminRecordsBody: document.getElementById('admin-records-body'),
    btnCloseAdminDash: document.getElementById('btn-close-admin-dash'),
    btnClearUsage: document.getElementById('btn-clear-usage')
};

async function init() {
    // Load local state first
    const saved = localStorage.getItem('timetable_dashboard_state');
    if (saved) {
        try {
            state = JSON.parse(saved);
        } catch(e) {
            console.error("Failed to load local state", e);
        }
    }

    // Check protocol
    if (window.location.protocol === 'file:') {
        const warn = document.getElementById('file-protocol-warning');
        if (warn) warn.style.display = 'block';
        console.error("Running via file:// - Backend features will be disabled.");
    } else {
        // Only show status in pro web app mode
        document.getElementById('connection-status').style.display = 'inline-block';
    }

    // Load Admin State from Server (Shared)
    try {
        await loadAdminStateFromServer();
        updateConnectionStatus(true);
        console.log("Initial state sync complete. Payment Enabled:", state.paymentEnabled);
    } catch (e) {
        updateConnectionStatus(false);
        console.warn("Could not reach backend on startup. Using local state.", e);
    }

    // Ensure all arrays exist for backward compatibility
    state.subjectRules = state.subjectRules || [];
    state.teacherRules = state.teacherRules || [];
    state.preferences = state.preferences || [];
    state.settings = state.settings || { periods: 8, schoolName: '', year: '' };
    state.paymentRecords = state.paymentRecords || {};
    state.usageLogs = state.usageLogs || [];
    state.activeUsers = state.activeUsers || [];
    state.dbUsers = state.dbUsers || [];    // persistent DB-tracked users
    state.adminPassword = state.adminPassword || 'mastergrid2026';
    state.adminIps = state.adminIps || [];
    state.paymentEnabled = (state.paymentEnabled !== undefined) ? state.paymentEnabled : false;
    
    // reset temp on load
    state.tempTeacherClasses = [];
    state.tempPrefPeriods = [];
    
    // Bind settings
    els.periods.value = state.settings.periods || 8;
    els.school.value = state.settings.schoolName || '';
    els.year.value = state.settings.year || '';
    
    // Listeners
    els.periods.addEventListener('change', e => updateSetting('periods', parseInt(e.target.value)));
    els.school.addEventListener('change', e => updateSetting('schoolName', e.target.value));
    els.year.addEventListener('change', e => updateSetting('year', e.target.value));
    
    document.getElementById('add-subject-rule').onclick = (e) => { e.preventDefault(); addSubjectRule(); };
    document.getElementById('add-teacher-class').onclick = (e) => { e.preventDefault(); addTempTeacherClass(); };
    document.getElementById('add-teacher-rule').onclick = (e) => { e.preventDefault(); addTeacherRule(); };
    
    document.getElementById('add-pref-period').onclick = (e) => { e.preventDefault(); addTempPrefPeriod(); };
    document.getElementById('save-preference').onclick = (e) => { e.preventDefault(); savePreference(); };
    
    els.prefType.addEventListener('change', (e) => {
        const val = e.target.value;
        const pair1Label   = document.getElementById('pref-pair1-label');
        const periodHint   = document.getElementById('pref-period-hint');
        const lblSubject   = document.getElementById('lbl-pref-subject');
        const lblTeacher   = document.getElementById('lbl-pref-teacher');

        // Reset labels
        if (lblSubject) lblSubject.textContent = 'SUBJECT';
        if (lblTeacher) lblTeacher.textContent = 'TEACHER';
        if (pair1Label) pair1Label.style.display = 'none';
        if (periodHint) periodHint.style.display = 'none';

        if (val === 'clubbed_classes') {
            if (lblSubject) lblSubject.textContent = 'SUBJECT (taken in both classes)';
            if (lblTeacher) lblTeacher.textContent = 'TEACHER (who takes both classes)';
            if (periodHint) periodHint.style.display = 'block';
            els.prefDayGroup.style.display = 'flex';
            els.prefPeriodGroup.style.display = 'none';
            els.prefPeriodSingleGroup.style.display = 'flex';
            els.prefClubbedGroup.style.display = 'flex';
            els.prefSecondPairGroup.style.display = 'none';
        } else if (val === 'clubbed_subjects') {
            if (pair1Label) pair1Label.style.display = 'flex';
            if (periodHint) periodHint.style.display = 'block';
            els.prefDayGroup.style.display = 'flex';
            els.prefPeriodGroup.style.display = 'none';
            els.prefPeriodSingleGroup.style.display = 'flex';
            els.prefClubbedGroup.style.display = 'flex';
            els.prefSecondPairGroup.style.display = 'flex';
        } else if (val === 'class_teacher_subject') {
            els.prefDayGroup.style.display = 'none';
            els.prefPeriodGroup.style.display = 'none';
            els.prefPeriodSingleGroup.style.display = 'none';
            els.prefClubbedGroup.style.display = 'none';
            els.prefSecondPairGroup.style.display = 'none';
        } else if (val === 'specific') {
            els.prefDayGroup.style.display = 'flex';
            els.prefPeriodGroup.style.display = 'none';
            els.prefPeriodSingleGroup.style.display = 'flex';
            els.prefClubbedGroup.style.display = 'none';
            els.prefSecondPairGroup.style.display = 'none';
        } else {
            els.prefDayGroup.style.display = 'flex';
            els.prefPeriodGroup.style.display = 'flex';
            els.prefPeriodSingleGroup.style.display = 'none';
            els.prefClubbedGroup.style.display = 'none';
            els.prefSecondPairGroup.style.display = 'none';
        }
    });
    
    els.prefDay.addEventListener('change', (e) => {
        // Hiding logic removed
    });

    // Set initial visibility for Preferred Periods
    els.prefPeriodGroup.style.display = 'flex';
    els.prefPeriodSingleGroup.style.display = 'none';
    
    document.getElementById('btn-class-pdf').onclick = (e) => { e.preventDefault(); try { exportPDF('class'); } catch(err) { showToast('PDF Error: ' + err.message, 'error'); console.error(err); } };
    document.getElementById('btn-teacher-pdf').onclick = (e) => { e.preventDefault(); try { exportPDF('teacher'); } catch(err) { showToast('PDF Error: ' + err.message, 'error'); console.error(err); } };
    document.getElementById('btn-school-pdf').onclick = (e) => { e.preventDefault(); try { exportPDF('school'); } catch(err) { showToast('PDF Error: ' + err.message, 'error'); console.error(err); } };

    // Preview
    document.getElementById('btn-class-preview').onclick = (e) => { e.preventDefault(); try { showPreview('class'); } catch(err) { showToast('Preview Error: ' + err.message, 'error'); console.error(err); } };
    document.getElementById('btn-teacher-preview').onclick = (e) => { e.preventDefault(); try { showPreview('teacher'); } catch(err) { showToast('Preview Error: ' + err.message, 'error'); console.error(err); } };
    document.getElementById('btn-school-preview').onclick = (e) => { e.preventDefault(); try { showPreview('school'); } catch(err) { showToast('Preview Error: ' + err.message, 'error'); console.error(err); } };

    if (els.btnClosePreview) {
        els.btnClosePreview.onclick = (e) => {
            e.preventDefault();
            els.previewModal.classList.remove('show');
        };
    }

    if (els.btnUserGuide) {
        els.btnUserGuide.onclick = (e) => {
            e.preventDefault();
            els.guideModal.classList.add('show');
        };
    }

    if (els.btnCloseGuide) {
        els.btnCloseGuide.onclick = () => els.guideModal.classList.remove('show');
    }

    if (els.btnGuideGotIt) {
        els.btnGuideGotIt.onclick = () => els.guideModal.classList.remove('show');
    }

    // Admin listeners
    if (els.btnAdminLogin) {
        els.btnAdminLogin.onclick = () => els.adminLoginModal.classList.add('show');
    }
    if (els.btnCloseAdminLogin) {
        els.btnCloseAdminLogin.onclick = () => els.adminLoginModal.classList.remove('show');
    }
    if (els.btnDoLogin) {
        els.btnDoLogin.onclick = handleAdminLogin;
    }
    if (els.btnCloseAdminDash) {
        els.btnCloseAdminDash.onclick = () => els.adminDashModal.classList.remove('show');
    }
    if (els.btnClearUsage) {
        els.btnClearUsage.onclick = async () => {
            if(confirm("Clear all usage logs?")) {
                state.usageLogs = [];
                save();
                await saveAdminStateToServer();
                renderAdminDashboard();
            }
        };
    }

    setupAntiScreenshot();
    fetchUserIp();
    setupNavigation();
    startHeartbeat();
    syncDbUsers();                                       // load all persisted users
    setInterval(syncDbUsers, 5000);                      // poll every 5 s for real-time updates
    renderAll();
    checkAndTriggerUserLog();
}

let heartbeatInterval = null;
function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    const sendHeartbeat = async () => {
        try {
            const response = await fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    school: state.settings.schoolName || 'Guest'
                })
            });
            if (response.ok) {
                const res = await response.json();
                if (res.yourIp) {
                    state.userIp = res.yourIp;
                }
                updateConnectionStatus(true);
            } else {
                updateConnectionStatus(false);
            }
        } catch (e) {
            updateConnectionStatus(false);
            console.warn("Heartbeat failed", e);
        }
    };
    
    sendHeartbeat();
    heartbeatInterval = setInterval(sendHeartbeat, 10000); // 10s for faster debug
}

function updateConnectionStatus(isConnected) {
    const dot = document.getElementById('connection-status');
    const dbStatus = document.getElementById('admin-db-status');
    if (!dot) return;
    if (isConnected) {
        dot.style.background = '#10b981';
        dot.style.boxShadow = '0 0 8px #10b981';
        if (dbStatus) {
            dbStatus.innerText = "MONGODB ONLINE";
            dbStatus.className = "db-status online";
        }
    } else {
        dot.style.background = '#ef4444';
        dot.style.boxShadow = '0 0 8px #ef4444';
        if (dbStatus) {
            dbStatus.innerText = "MONGODB OFFLINE";
            dbStatus.className = "db-status offline";
        }
    }
}

function showAutoSave() {
    const brand = document.querySelector('.brand-text h1');
    if (!brand) return;
    let indicator = document.getElementById('autosave-indicator');
    if (!indicator) {
        indicator = document.createElement('span');
        indicator.id = 'autosave-indicator';
        indicator.innerHTML = '<i data-lucide="check-circle-2"></i> Saved';
        indicator.style.cssText = 'font-size: 0.6rem; color: #10b981; margin-left: 10px; opacity: 0; transition: opacity 0.3s; font-weight: 400;';
        brand.appendChild(indicator);
        if(window.lucide) lucide.createIcons();
    }
    indicator.style.opacity = '1';
    setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = Array.from(navItems).map(item => document.getElementById(item.dataset.section));

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = item.dataset.section;
            const section = document.getElementById(sectionId);
            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    window.addEventListener('scroll', () => {
        let currentSectionId = '';
        sections.forEach(section => {
            if (!section) return;
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.pageYOffset >= sectionTop - 150) {
                currentSectionId = section.id;
            }
        });

        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.section === currentSectionId) {
                item.classList.add('active');
            }
        });
    });
}

function handleAdminLogin() {
    const user = els.adminUser.value.trim();
    const pass = els.adminPass.value.trim();
    
    if (user === 'admin' && pass === state.adminPassword) {
        els.adminLoginModal.classList.remove('show');
        els.adminDashModal.classList.add('show');
        els.adminUser.value = '';
        els.adminPass.value = '';
        renderAdminDashboard();
        showToast("Welcome Admin!", "success");
    } else {
        showToast("Invalid Credentials");
    }
}

async function changeAdminPassword() {
    const newPass = document.getElementById('new-admin-password').value.trim();
    if (newPass.length < 4) {
        showToast("Password must be at least 4 characters.");
        return;
    }
    state.adminPassword = newPass;
    save();
    await saveAdminStateToServer();
    showToast("Admin password updated & saved to server!", "success");
    document.getElementById('new-admin-password').value = '';
}

async function toggleAdminIp() {
    const ip = state.userIp;
    if (!ip || ip === 'unknown') return showToast("IP not detected yet.");
    
    state.adminIps = state.adminIps || [];
    const index = state.adminIps.indexOf(ip);
    
    if (index === -1) {
        state.adminIps.push(ip);
        showToast(`IP ${ip} added to Trusted Admin list.`, "success");
    } else {
        state.adminIps.splice(index, 1);
        showToast(`IP ${ip} removed from Trusted list.`, "success");
    }
    save();
    await saveAdminStateToServer();
    renderAdminDashboard();
}

async function toggleGlobalPayment() {
    state.paymentEnabled = !state.paymentEnabled;
    save();
    await saveAdminStateToServer();
    showToast(`Global Payment Mode set to: ${state.paymentEnabled ? 'ENABLED' : 'DISABLED'}`, state.paymentEnabled ? 'success' : 'error');
    renderAdminDashboard();
}
window.changeAdminPassword = changeAdminPassword;
window.toggleAdminIp = toggleAdminIp;
window.toggleGlobalPayment = toggleGlobalPayment;

// ─── Persistent DB Users Sync ───────────────────────────────────────────────
async function syncDbUsers() {
    try {
        const response = await fetch('/api/users');
        if (response.ok) {
            const data = await response.json();
            state.dbUsers = data.users || [];
            if (els.adminDashModal && els.adminDashModal.classList.contains('show')) {
                renderUserTable();
            }
        }
    } catch (e) {
        // Silent ignore — server may be offline
    }
}

async function logUsage(type) {
    state.usageLogs = state.usageLogs || [];
    state.usageLogs.push({
        timestamp: Date.now(),
        school: state.settings.schoolName || 'Guest',
        ip: state.userIp,
        type: type // 'preview', 'download', 'pdf'
    });
    save();
    await saveAdminStateToServer();
    
    // Increment count in cloud MongoDB UserLog
    const schoolName = (state.settings.schoolName || '').trim();
    const year = (state.settings.year || '').trim();
    if (schoolName && year && (type === 'preview' || type === 'pdf')) {
        try {
            await fetch('/api/userlog/increment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schoolName, year, type })
            });
            console.log(`Cloud UserLog incremented for type: ${type}`);
        } catch (e) {
            console.warn("Failed to contact backend to increment User's Log. Silent fallback.");
        }
    }
}
async function loadAdminStateFromServer() {
    try {
        const response = await fetch('/api/state');
        if (response.ok) {
            const serverState = await response.json();
            // Merge admin fields into current state
            state.usageLogs = serverState.usageLogs || [];
            state.paymentRecords = serverState.paymentRecords || {};
            state.adminIps = serverState.adminIps || [];

            // Track real MongoDB connection status from server
            state.dbConnected = serverState.dbConnected !== false;
            state.dbError = serverState.dbError || null;

            // Strictly enforce payment toggle from server
            if (serverState.paymentEnabled !== undefined) {
                state.paymentEnabled = (serverState.paymentEnabled === true || serverState.paymentEnabled === "true");
            } else {
                state.paymentEnabled = false;
            }

            state.activeUsers = serverState.activeUsers || [];
            if (serverState.yourIp) {
                state.userIp = serverState.yourIp;
            }
            if (serverState.adminPassword) state.adminPassword = serverState.adminPassword;

            // Update status indicator based on real DB state
            updateConnectionStatus(state.dbConnected);
        } else {
            state.dbConnected = false;
            updateConnectionStatus(false);
        }
    } catch (e) {
        state.dbConnected = false;
        updateConnectionStatus(false);
        console.error("Failed to load admin state from server", e);
    }
}


async function saveAdminStateToServer() {
    try {
        const adminData = {
            usageLogs: state.usageLogs,
            paymentRecords: state.paymentRecords,
            adminIps: state.adminIps,
            paymentEnabled: state.paymentEnabled,
            adminPassword: state.adminPassword
        };
        const response = await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adminData)
        });
        if (response.ok) {
            const res = await response.json();
            if (res.yourIp) state.userIp = res.yourIp;
            console.log("Admin state saved to server.");
        }
    } catch (e) {
        console.error("Failed to save admin state to server", e);
    }
}

function renderAdminDashboard() {
    if (!els.adminRecordsBody) return;
    
    // Update DB connection status in top right header
    const dbStatusTag = document.getElementById('admin-db-status');
    if (dbStatusTag) {
        if (state.dbConnected !== false) {
            dbStatusTag.innerText = "MONGODB ONLINE";
            dbStatusTag.className = "db-status online";
            dbStatusTag.style.background = "rgba(16, 185, 129, 0.1)";
            dbStatusTag.style.color = "#10b981";
            dbStatusTag.style.border = "1px solid rgba(16, 185, 129, 0.3)";
        } else {
            dbStatusTag.innerText = "MONGODB OFFLINE";
            dbStatusTag.className = "db-status offline";
            dbStatusTag.style.background = "rgba(239, 68, 68, 0.1)";
            dbStatusTag.style.color = "#ef4444";
            dbStatusTag.style.border = "1px solid rgba(239, 68, 68, 0.3)";
        }
    }

    // DB connection status banner setup in scroll container
    const scrollContainer = els.adminDashModal ? els.adminDashModal.querySelector('.guide-scroll-container') : null;
    if (scrollContainer) {
        let dbWarningBanner = document.getElementById('db-connection-warning');
        if (state.dbConnected === false) {
            if (!dbWarningBanner) {
                const warningHtml = `
                    <div id="db-connection-warning" class="guide-section" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; border-left: 4px solid #ef4444;">
                        <h4 style="color: #ef4444; margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: 1.1rem; font-weight: 700;">
                            <i data-lucide="alert-triangle"></i> Cloud MongoDB Offline
                        </h4>
                        <p style="color: var(--text-muted); margin: 0; font-size: 0.9rem; line-height: 1.5;">
                            The backend node server cannot connect to the cloud MongoDB database (Mongoose). Persistent school logs, payments, and admin settings are in <strong>read-only / offline simulation mode</strong>.
                        </p>
                        <div style="font-family: monospace; font-size: 0.8rem; background: rgba(0,0,0,0.2); padding: 0.5rem 0.75rem; border-radius: 6px; color: #fca5a5; overflow-x: auto; margin-top: 0.25rem;">
                            Error: ${state.dbError || 'Connection timed out / Refused'}
                        </div>
                        <p style="color: var(--text-muted); margin: 0; font-size: 0.85rem; font-style: italic; margin-top: 0.25rem;">
                            <strong>Solution:</strong> Set the MONGODB_URI environment variable on your server to a valid MongoDB Atlas connection string to enable full cloud persistence.
                        </p>
                    </div>
                `;
                scrollContainer.insertAdjacentHTML('afterbegin', warningHtml);
                if(window.lucide) lucide.createIcons();
            } else {
                dbWarningBanner.style.display = 'flex';
            }
        } else {
            if (dbWarningBanner) {
                dbWarningBanner.style.display = 'none';
            }
        }
    }
    
    const logs = state.usageLogs || [];
    const payments = state.paymentRecords || {};
    const active = state.activeUsers || [];
    
    // Stats
    document.getElementById('stat-total-users').innerText = new Set(logs.map(l => l.ip)).size;
    document.getElementById('stat-total-payments').innerText = Object.keys(payments).length;
    document.getElementById('stat-total-logs').innerText = logs.length;
    document.getElementById('stat-live-users').innerText = active.length;
    
    // Sort logs by timestamp descending (most recent first)
    logs.sort((a, b) => b.timestamp - a.timestamp);
    const totalLogsCount = logs.length;
    
    els.adminRecordsBody.innerHTML = logs.map((log, i) => {
        const slNo = totalLogsCount - i;
        const schoolOrg = log.year ? `${log.school} (${log.year})` : log.school;
        
        // Render Preview and PDF exactly as requested: SL. NO ^ count (drawn as superscript)
        const previews = log.previews || 0;
        const pdfs = log.pdfs || 0;
        const previewDisplay = `<span class="sketched-badge" style="font-size: 1rem; font-weight: 500; color: var(--text);">${slNo}<sup style="color: var(--primary); font-weight: 800; font-size: 0.85rem; margin-left: 2px;">${previews}</sup></span>`;
        const pdfDisplay = `<span class="sketched-badge" style="font-size: 1rem; font-weight: 500; color: var(--text);">${slNo}<sup style="color: var(--secondary); font-weight: 800; font-size: 0.85rem; margin-left: 2px;">${pdfs}</sup></span>`;
        const time = new Date(log.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        
        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-muted); text-align: center;">${slNo}</td>
                <td style="text-align: center;">${log.date || new Date(log.timestamp).toLocaleDateString('en-GB').replace(/\//g, '.')}</td>
                <td style="text-align: center; font-weight: 600; color: var(--accent);">${time}</td>
                <td style="color: var(--secondary); font-weight: 600; text-align: left;">${schoolOrg}</td>
                <td style="font-family: monospace; font-size: 0.85rem; text-align: center;">${log.ip}</td>
                <td style="text-align: center;">${previewDisplay}</td>
                <td style="text-align: center;">${pdfDisplay}</td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="7" style="text-align:center;">No logs found</td></tr>';


    // Render Active Users
    const liveBody = document.getElementById('admin-live-body');
    if (liveBody) {
        liveBody.innerHTML = active.map(u => `
            <tr>
                <td style="color: var(--secondary); font-weight:600;">${u.school}</td>
                <td style="font-family: monospace; font-size: 0.8rem;">${u.ip}</td>
                <td>${u.lastSeenStr}</td>
                <td><span style="color: #10b981; font-weight:700;">● ACTIVE</span></td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center;">No active sessions</td></tr>';
    }

    // Render Persistent DB Users
    renderUserTable();

    // Update IP Exemption UI
    const ipEl = document.getElementById('admin-current-ip');
    const toggleBtn = document.getElementById('btn-toggle-admin-ip');
    if (ipEl) ipEl.innerText = state.userIp;
    if (toggleBtn) {
        const isExempt = (state.adminIps || []).includes(state.userIp);
        toggleBtn.innerHTML = isExempt ? 
            '<i data-lucide="shield-off"></i> Untrust Current IP' : 
            '<i data-lucide="shield-check"></i> Trust Current IP';
        toggleBtn.style.color = isExempt ? 'var(--danger)' : 'var(--secondary)';
        if(window.lucide) lucide.createIcons();
    }

    // Update Global Payment Toggle UI
    const payStatusEl = document.getElementById('admin-payment-status');
    const payToggleBtn = document.getElementById('btn-toggle-payment');
    if (payStatusEl) {
        payStatusEl.innerText = state.paymentEnabled ? 'REQUIRED' : 'DISABLED (Free Access)';
        payStatusEl.style.color = state.paymentEnabled ? '#10b981' : 'var(--danger)';
    }
    if (payToggleBtn) {
        payToggleBtn.innerHTML = state.paymentEnabled ? 
            '<i data-lucide="toggle-right"></i> Disable Payments' : 
            '<i data-lucide="toggle-left"></i> Enable Payments';
        payToggleBtn.style.color = state.paymentEnabled ? 'var(--danger)' : '#10b981';
        if(window.lucide) lucide.createIcons();
    }
}

// Add auto-refresh for admin dashboard
setInterval(async () => {
    if (els.adminDashModal && els.adminDashModal.classList.contains('show')) {
        await loadAdminStateFromServer();
        renderAdminDashboard();
    }
}, 5000);

// ─── Render DB Users Table (called from renderAdminDashboard) ───────────────
function renderUserTable() {
    let body = document.getElementById('admin-users-body');
    if (!body) return;

    const users = state.dbUsers || [];
    if (users.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No users yet.</td></tr>';
        return;
    }

    body.innerHTML = users.map((u, i) => {
        const isPaid = u.has_paid === 1;
        const toggleClass = isPaid ? 'btn-secondary' : 'btn-primary';
        const toggleText = isPaid ? 'REVOKE' : 'GRANT';
        const toggleStyle = isPaid ? 'border-color: var(--danger); color: var(--danger);' : '';
        
        return `<tr>
            <td style="font-weight:600;">${i + 1}</td>
            <td style="font-weight:600; color:var(--secondary);">${escHtml(u.school)}</td>
            <td style="font-family:monospace; font-size:0.8rem;">${escHtml(u.ip)}</td>
            <td>
                <button onclick="toggleUserPayment('${escHtml(u.school)}', '${escHtml(u.ip)}', ${isPaid})" class="${toggleClass}" style="padding: 5px 10px; font-size: 0.8rem; height: auto; ${toggleStyle}">
                    ${isPaid ? 'ON' : 'OFF'} (${toggleText})
                </button>
            </td>
            <td>
                <button onclick="deleteUser('${escHtml(u.school)}', '${escHtml(u.ip)}')" class="btn-secondary" style="padding: 5px 10px; font-size: 0.8rem; height: auto; border: 1px solid var(--danger); color: var(--danger);">
                    DELETE
                </button>
            </td>
        </tr>`;
    }).join('');
}

window.toggleUserPayment = async function(school, ip, isPaid) {
    try {
        const url = isPaid ? '/api/unpay' : '/api/pay';
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ school, ip })
        });
        if (response.ok) {
            showToast(`Payment ${isPaid ? 'revoked' : 'granted'} for ${school}`, "success");
            await syncDbUsers();
            if (els.adminDashModal && els.adminDashModal.classList.contains('show')) {
                renderUserTable();
            }
        } else {
            showToast("Failed to update payment status.");
        }
    } catch (e) {
        showToast("Error updating payment.");
    }
};

window.deleteUser = async function(school, ip) {
    if (!confirm(`Are you sure you want to delete ${school} (${ip})?`)) return;
    try {
        const response = await fetch('/api/users', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ school, ip })
        });
        if (response.ok) {
            showToast(`User ${school} deleted.`, "success");
            await syncDbUsers();
            if (els.adminDashModal && els.adminDashModal.classList.contains('show')) {
                renderUserTable();
            }
        } else {
            showToast("Failed to delete user.");
        }
    } catch (e) {
        showToast("Error deleting user.");
    }
};

// Helpers
function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400)return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
}
function escHtml(s) {
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function fetchUserIp() {
    try {
        const response = await fetch('/api/heartbeat', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ school: state.settings.schoolName || 'Guest' })
        });
        const data = await response.json();
        state.userIp = data.yourIp || 'unknown';
    } catch (e) {
        state.userIp = 'local';
    }
}

function renderSidebarStats() {
    const container = document.getElementById('teacher-summary-container');
    if (!container) return;
    
    const totalTeachers = state.teacherRules.length;
    const totalSubjects = state.subjectRules.length;
    const totalPeriods = state.subjectRules.reduce((acc, r) => acc + (r.periods || 0), 0);
    const uniqueClasses = new Set(state.subjectRules.map(r => r.std)).size;
    
    container.innerHTML = `
        <div style="border-top: 1px solid var(--border); padding-top: 1.2rem; margin-top: 0.5rem;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.8rem;">
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 0.6rem; text-align: center;">
                    <div style="font-size: 1.4rem; font-weight: 800; color: var(--secondary);">${totalTeachers}</div>
                    <div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Teachers</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 0.6rem; text-align: center;">
                    <div style="font-size: 1.4rem; font-weight: 800; color: var(--secondary);">${uniqueClasses}</div>
                    <div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Classes</div>
                </div>
            </div>
            <div style="background: rgba(249, 115, 22, 0.08); border: 1px solid rgba(249, 115, 22, 0.2); border-radius: 10px; padding: 0.6rem; text-align: center; margin-bottom: 0.5rem;">
                <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Total Periods Assigned: </span>
                <span style="font-size: 0.9rem; font-weight: 800; color: var(--primary);">${totalPeriods}</span>
            </div>
            <div class="pro-badge" style="padding: 8px; background: rgba(249, 115, 22, 0.1); border-radius: 8px; text-align: center; color: var(--primary); font-weight: 800; font-size: 0.65rem; border: 1px solid rgba(249, 115, 22, 0.2);">
                <i data-lucide="zap" style="width: 11px; height: 11px; vertical-align: middle;"></i> PRO VERSION
            </div>
        </div>
    `;
}

function setupAntiScreenshot() {
    // Prevent right click on preview modal content
    if (els.previewModal) {
        els.previewModal.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Blur on key presses associated with screenshots
    window.addEventListener('keydown', (e) => {
        // PrintScreen, Windows+Shift+S, Cmd+Shift+3/4
        if (e.key === 'PrintScreen' || 
            (e.metaKey && e.shiftKey) || 
            (e.ctrlKey && e.key === 'p')) {
            
            if (els.previewScrollContainer) {
                els.previewScrollContainer.classList.add('blur-content');
                setTimeout(() => {
                    els.previewScrollContainer.classList.remove('blur-content');
                }, 3000);
            }
        }
    });
}

function updateSetting(key, val) {
    state.settings[key] = val;
    save();
    renderAll();
    
    if (key === 'schoolName' || key === 'year') {
        checkAndTriggerUserLog();
    }
}

async function checkAndTriggerUserLog() {
    const schoolName = (state.settings.schoolName || '').trim();
    const year = (state.settings.year || '').trim();
    
    if (schoolName && year) {
        try {
            const response = await fetch('/api/userlog/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schoolName, year })
            });
            if (response.ok) {
                console.log("Cloud User's Log triggered successfully.");
            }
        } catch (e) {
            console.warn("Failed to contact backend for User's Log trigger. Silent fallback.");
        }
    }
}

function save() {
    localStorage.setItem('timetable_dashboard_state', JSON.stringify(state));
    showAutoSave();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function showToast(msg, type = 'error') {
    if (!els.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()" style="background:transparent; color:white; font-size:1.2rem;">&times;</button>`;
    els.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function renderAll() {
    try {
        renderSubjects();
        renderTempTeacherClasses();
        renderTeachers();
        renderPreferences();
        renderTempPrefPeriods();
        updateOutputSelects();
        updateChargeSelect();
        updateSubjectStdSelect();
        updatePrefSubjectSelect();
        updatePrefTeacherSelect();
        updatePrefSubject2Select();
        updatePrefTeacher2Select();
        updatePrefPeriodOptions();
        updateDataLists();
        renderSidebarStats();
        renderSummaryTable();
        if(window.lucide) lucide.createIcons();
    } catch(e) {
        console.error("Rendering error", e);
    }
}

function checkPaymentStatus() {}

function updateDataLists() {
    const subjects = new Set();
    const periods = new Set();
    const stds = new Set();
    
    // Add default values to sets or just from state
    state.subjectRules.forEach(r => {
        subjects.add(r.name);
        periods.add(r.periods);
        stds.add(r.std);
    });
    
    const dlSubjects = document.getElementById('dl-subjects');
    const dlPeriods = document.getElementById('dl-periods');
    const dlStds = document.getElementById('dl-stds');
    
    if(dlSubjects) dlSubjects.innerHTML = Array.from(subjects).map(s => `<option value="${s}">`).join('');
    if(dlPeriods) dlPeriods.innerHTML = Array.from(periods).map(p => `<option value="${p}">`).join('');
    if(dlStds) dlStds.innerHTML = Array.from(stds).map(s => `<option value="${s}">`).join('');
}

function updateChargeSelect() {
    let classes = new Set();
    state.subjectRules.forEach(r => classes.add(r.std));
    const currentVal = els.teacherCharge.value;
    els.teacherCharge.innerHTML = '<option value="">-- None --</option>' + 
        Array.from(classes).map(c => `<option value="${c}">${c}</option>`).join('');
    if (classes.has(currentVal)) els.teacherCharge.value = currentVal;
}

function updateSubjectStdSelect() {
    let classes = new Set();
    state.subjectRules.forEach(r => classes.add(r.std));
    const dl = document.getElementById('dl-stds-combo');
    if (dl) {
        dl.innerHTML =
            '<option value="All">(All)</option>' +
            Array.from(classes).map(c => `<option value="${c}">${c}</option>`).join('');
    }
}

function addSubjectRule() {
    const nameRaw = els.subjName.value.trim();
    const periods = parseInt(els.subjPeriods.value);
    const stdRaw = els.subjStd.value.trim();

    if (!nameRaw || !periods || !stdRaw) {
        showToast("Please fill Subject(s), Periods, and STD");
        return;
    }

    // Split comma-separated subject names
    const names = nameRaw.split(',').map(s => s.trim()).filter(s => s);

    // Resolve class list
    let stds;
    if (stdRaw === 'All') {
        stds = Array.from(new Set(state.subjectRules.map(r => r.std)));
        if (stds.length === 0) {
            showToast("No classes defined yet. Add a specific class first, then use (All).");
            return;
        }
    } else {
        stds = stdRaw.split(',').map(s => s.trim()).filter(s => s);
    }

    // Create one entry per subject × per class
    let addedCount = 0;
    names.forEach(name => {
        stds.forEach(std => {
            const exists = state.subjectRules.some(r => r.name === name && r.std === std);
            if (!exists) {
                state.subjectRules.push({ id: Date.now() + Math.random(), name, periods, std });
                addedCount++;
            }
        });
    });

    if (addedCount === 0) {
        showToast("All subjects already exist for the selected class(es).");
        return;
    }

    save();

    els.subjName.value = '';
    els.subjPeriods.value = 5;
    els.subjStd.value = '';
    showToast(`✓ Added ${addedCount} subject-class entries successfully!`, 'success');
    renderAll();
}

function removeSubject(id) {
    state.subjectRules = state.subjectRules.filter(r => r.id !== id);
    save();
    renderAll();
}
window.removeSubject = removeSubject;

function removeSubjectRow(cls) {
    if (confirm(`Are you sure you want to delete all subjects for class ${cls}?`)) {
        state.subjectRules = state.subjectRules.filter(r => r.std !== cls);
        save();
        renderAll();
    }
}
window.removeSubjectRow = removeSubjectRow;

function renderSubjects() {
    if (!els.subjTableContainer) return;
    if (state.subjectRules.length === 0) {
        els.subjTableContainer.innerHTML = '';
        return;
    }

    const classes = Array.from(new Set(state.subjectRules.map(r => r.std))).sort();
    const subjects = Array.from(new Set(state.subjectRules.map(r => r.name))).sort();

    let html = `
        <div class="subject-grid-wrapper">
            <table class="subject-grid-table">
                <thead>
                    <tr>
                        <th></th>
                        ${subjects.map(subj => `<th>${subj}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    classes.forEach(cls => {
        html += `<tr>
            <td class="class-name">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; padding-left: 0.5rem;">
                    <span>${cls}</span>
                    <button class="btn-del-cell" onclick="removeSubjectRow('${cls}')" title="Delete entire row" style="color:var(--danger); background:rgba(239, 68, 68, 0.1); padding: 4px; border-radius: 6px;">
                        <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                    </button>
                </div>
            </td>`;
        subjects.forEach(subj => {
            const rule = state.subjectRules.find(r => r.std === cls && r.name === subj);
            if (rule) {
                html += `
                    <td style="text-align:center;">
                        <div class="period-badge">
                            <span>${rule.periods}</span>
                            <button class="btn-del-cell" onclick="removeSubject(${rule.id})" title="Remove">
                                <i data-lucide="x" style="width:14px; height:14px;"></i>
                            </button>
                        </div>
                    </td>
                `;
            } else {
                html += `<td style="text-align:center;"><span class="empty-cell">-</span></td>`;
            }
        });
        html += `</tr>`;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    els.subjTableContainer.innerHTML = html;
    
    // Refresh icons since we added new ones
    if(window.lucide) {
        setTimeout(() => lucide.createIcons(), 0);
    }
}

// --- Teacher Rules ---
function addTempTeacherClass() {
    const stdRaw = els.teacherTakesStd.value.trim();
    const subj = els.teacherTakesSubj.value.trim();
    
    if(!stdRaw || !subj) return;
    
    const stds = stdRaw.split(',').map(s => s.trim()).filter(s => s);
    stds.forEach(std => {
        // Check if this subject in this class is already taken by any teacher
        const existingTeacher = state.teacherRules.find(t => 
            t.classes.some(c => c.std === std && c.subj === subj)
        );
        
        if (existingTeacher) {
            showToast(`ALREADY ENTERED: ${subj} in ${std} is taken by ${existingTeacher.name}`);
            return;
        }

        // Check if it's already in the current temp list
        if (state.tempTeacherClasses.some(c => c.std === std && c.subj === subj)) {
            showToast("ALREADY ENTERED in current list.");
            return;
        }

        state.tempTeacherClasses.push({ std, subj });
    });
    
    els.teacherTakesStd.value = '';
    els.teacherTakesSubj.value = '';
    renderTempTeacherClasses();
}

function removeTempTeacherClass(index) {
    state.tempTeacherClasses.splice(index, 1);
    renderTempTeacherClasses();
}
window.removeTempTeacherClass = removeTempTeacherClass;

function renderTempTeacherClasses() {
    els.tempTeacherList.innerHTML = '';
    state.tempTeacherClasses.forEach((c, idx) => {
        const li = document.createElement('li');
        li.className = 'tag small';
        li.innerHTML = `${c.std}-${c.subj} <button onclick="removeTempTeacherClass(${idx})">&times;</button>`;
        els.tempTeacherList.appendChild(li);
    });
}

function addTeacherRule() {
    const name = els.teacherName.value.trim();
    const charge = els.teacherCharge.value.trim();
    
    if(!name) {
        showToast("Teacher Name is required.");
        return;
    }

    if (charge) {
        const existingCharge = state.teacherRules.find(t => t.charge === charge && t.id !== state.editingTeacherId);
        if (existingCharge) {
            showToast(`ALREADY ENTERED: ${charge} Class Charge is taken by ${existingCharge.name}`);
            return;
        }
    }

    if(state.tempTeacherClasses.length === 0 && !charge) {
        showToast("Add some classes taken or a class charge.");
        return;
    }
    
    if (state.editingTeacherId) {
        const idx = state.teacherRules.findIndex(t => t.id === state.editingTeacherId);
        if (idx !== -1) {
            state.teacherRules[idx].name = name;
            state.teacherRules[idx].charge = charge;
            state.teacherRules[idx].classes = [...state.tempTeacherClasses];
            showToast(`Teacher ${name} updated!`, 'success');
        }
        state.editingTeacherId = null;
        document.getElementById('add-teacher-rule').innerHTML = 'SAVE <i data-lucide="plus"></i>';
    } else {
        state.teacherRules.push({
            id: Date.now(),
            name,
            charge,
            classes: [...state.tempTeacherClasses]
        });
        showToast(`Teacher ${name} saved!`, 'success');
    }
    
    save();
    
    els.teacherName.value = '';
    els.teacherCharge.value = '';
    state.tempTeacherClasses = [];
    renderAll();
}

function editTeacher(id) {
    const teacher = state.teacherRules.find(t => t.id === id);
    if (!teacher) return;
    
    state.editingTeacherId = id;
    els.teacherName.value = teacher.name;
    els.teacherCharge.value = teacher.charge;
    state.tempTeacherClasses = [...teacher.classes];
    
    document.getElementById('add-teacher-rule').innerHTML = 'UPDATE <i data-lucide="check"></i>';
    document.getElementById('row-teachers').scrollIntoView({ behavior: 'smooth' });
    
    renderAll();
    showToast(`Editing ${teacher.name}...`, 'success');
}
window.editTeacher = editTeacher;

function removeTeacher(id) {
    state.teacherRules = state.teacherRules.filter(t => t.id !== id);
    save();
    renderAll();
}
window.removeTeacher = removeTeacher;

// --- Preferred Periods ---
function updatePrefSubjectSelect() {
    const subjects = Array.from(new Set(state.subjectRules.map(r => r.name)));
    const currentVal = els.prefSubject.value;
    els.prefSubject.innerHTML = '<option value="">-- Select --</option>' + 
        subjects.map(s => `<option value="${s}">${s}</option>`).join('');
    if (subjects.includes(currentVal)) els.prefSubject.value = currentVal;
}

function updatePrefTeacherSelect() {
    const teachers = Array.from(new Set(state.teacherRules.map(t => t.name)));
    const currentVal = els.prefTeacher.value;
    els.prefTeacher.innerHTML = '<option value="">-- Any / Select --</option>' + 
        teachers.map(t => `<option value="${t}">${t}</option>`).join('');
    if (teachers.includes(currentVal)) els.prefTeacher.value = currentVal;
}

function updatePrefSubject2Select() {
    const subjects = Array.from(new Set(state.subjectRules.map(r => r.name)));
    const currentVal = els.prefSubject2.value;
    els.prefSubject2.innerHTML = '<option value="">-- Select --</option>' + 
        subjects.map(s => `<option value="${s}">${s}</option>`).join('');
    if (subjects.includes(currentVal)) els.prefSubject2.value = currentVal;
}

function updatePrefTeacher2Select() {
    const teachers = Array.from(new Set(state.teacherRules.map(t => t.name)));
    const currentVal = els.prefTeacher2.value;
    els.prefTeacher2.innerHTML = '<option value="">-- Select --</option>' + 
        teachers.map(t => `<option value="${t}">${t}</option>`).join('');
    if (teachers.includes(currentVal)) els.prefTeacher2.value = currentVal;
}

function updatePrefPeriodOptions() {
    const count = parseInt(state.settings.periods) || 8;
    const currentVal = els.prefPeriodSelect.value;
    let html = '<option value="all">ALL DAY</option>';
    for(let i=1; i<=count; i++) html += `<option value="${i}">Period ${i}</option>`;
    els.prefPeriodSelect.innerHTML = html;
    if (currentVal && (currentVal === 'all' || parseInt(currentVal) <= count)) els.prefPeriodSelect.value = currentVal;

    if (els.prefPeriodSingleSelect) {
        const currentSingleVal = els.prefPeriodSingleSelect.value;
        let singleHtml = '<option value="">-- Select Period --</option>';
        for(let i=1; i<=count; i++) singleHtml += `<option value="${i}">Period ${i}</option>`;
        els.prefPeriodSingleSelect.innerHTML = singleHtml;
        if (currentSingleVal && parseInt(currentSingleVal) <= count) els.prefPeriodSingleSelect.value = currentSingleVal;
    }
}

function addTempPrefPeriod() {
    const val = els.prefPeriodSelect.value;
    if (!val) {
        showToast("Select a period first.");
        return;
    }

    if (val === 'all') {
        const count = parseInt(state.settings.periods) || 8;
        state.tempPrefPeriods = [];
        for (let i = 1; i <= count; i++) state.tempPrefPeriods.push(i);
        showToast("All periods added", 'success');
    } else {
        const p = parseInt(val);
        if (!state.tempPrefPeriods.includes(p)) {
            state.tempPrefPeriods.push(p);
            state.tempPrefPeriods.sort((a,b) => a-b);
            showToast(`Period ${p} added to rule list`, 'success');
        } else {
            showToast("Period already in list.");
        }
    }
    renderTempPrefPeriods();
}

function removeTempPrefPeriod(p) {
    state.tempPrefPeriods = state.tempPrefPeriods.filter(x => x !== p);
    renderTempPrefPeriods();
}
window.removeTempPrefPeriod = removeTempPrefPeriod;

function renderTempPrefPeriods() {
    els.tempPrefList.innerHTML = '';
    state.tempPrefPeriods.forEach(p => {
        const li = document.createElement('li');
        li.className = 'tag small';
        li.innerHTML = `Period ${p} <button onclick="removeTempPrefPeriod(${p})">&times;</button>`;
        els.tempPrefList.appendChild(li);
    });
}

function savePreference() {
    const subj = els.prefSubject.value;
    const type = els.prefType.value;
    const day = els.prefDay.value;
    const teacher = els.prefTeacher.value;
    
    const isSinglePeriodType = (type === 'specific' || type === 'clubbed_classes' || type === 'clubbed_subjects');
    let periods = [];
    if (isSinglePeriodType) {
        const val = els.prefPeriodSingleSelect.value;
        if (!val) return showToast("Select a period first.");
        periods = [parseInt(val)];
    } else {
        periods = [...state.tempPrefPeriods];
    }
    
    const clubbedRaw = els.prefClubbedClasses ? els.prefClubbedClasses.value.trim() : '';
    
    if (!subj && type !== 'clubbed_classes') return showToast("Select a subject first.");
    
    if (type === 'clubbed_classes') {
        // Clubbed Classes: one teacher, same subject, multiple classes, SAME specific period
        if (!teacher) return showToast("Select the teacher for Clubbed Classes.");
        if (!subj) return showToast("Select the subject that is being taken in all clubbed classes.");
        if (!clubbedRaw) return showToast("Enter clubbed classes (comma separated).");
        const clubbedClasses = clubbedRaw.split(',').map(s => s.trim()).filter(s => s);
        if (clubbedClasses.length < 2) return showToast("Enter at least 2 classes for Clubbed Classes.");
        if (day === 'any') return showToast("Select a specific Day for Clubbed Classes (not ALL DAY).");
        if (periods.length !== 1) return showToast("Select exactly ONE specific Period for Clubbed Classes.");
        
        state.preferences.push({
            id: Date.now(),
            type,
            subj,
            teacher,
            clubbedClasses,
            day,
            period: periods[0]
        });

    } else if (type === 'clubbed_subjects') {
        // Clubbed Subjects: two subject+teacher pairs, same classes, same specific period
        const subj2 = els.prefSubject2.value;
        const teacher2 = els.prefTeacher2.value;
        if (!teacher) return showToast("Select Teacher 1 for Pair 1.");
        if (!subj2) return showToast("Select Subject 2 for Pair 2.");
        if (!teacher2) return showToast("Select Teacher 2 for Pair 2.");
        if (!clubbedRaw) return showToast("Enter the classes where this clubbing applies.");
        const clubbedClasses = clubbedRaw.split(',').map(s => s.trim()).filter(s => s);
        if (clubbedClasses.length < 1) return showToast("Enter at least one class for Clubbed Subjects.");
        if (day === 'any') return showToast("Select a specific Day for Clubbed Subjects.");
        if (periods.length !== 1) return showToast("Select exactly ONE specific Period for Clubbed Subjects.");

        state.preferences.push({
            id: Date.now(),
            subj, type, teacher, subj2, teacher2, clubbedClasses, day, period: periods[0]
        });

    } else if (type === 'class_teacher_subject') {
        if (!teacher) return showToast("Select a teacher for this rule.");
        state.preferences.push({
            id: Date.now(),
            subj, type, teacher
        });
    } else {
        if (type !== 'specific' && periods.length === 0) return showToast("Add at least one period.");
        if (type === 'specific' && (day === 'any' || periods.length !== 1)) return showToast("Select a specific Day and exactly ONE Period.");
        
        state.preferences.push({
            id: Date.now(),
            subj, type, day, periods, teacher
        });
    }
    
    save();
    state.tempPrefPeriods = [];
    if (els.prefPeriodSingleSelect) els.prefPeriodSingleSelect.value = '';
    if (els.prefClubbedClasses) els.prefClubbedClasses.value = '';
    showToast(`Rule saved successfully!`, 'success');
    renderAll();
}

function removePreference(id) {
    state.preferences = state.preferences.filter(p => p.id !== id);
    save();
    renderAll();
}
window.removePreference = removePreference;

function renderPreferences() {
    els.preferenceList.innerHTML = '';
    state.preferences.forEach(p => {
        const li = document.createElement('li');
        li.className = 'data-card';
        const teacherText = p.teacher ? `<span style="color:var(--secondary); font-weight:700;">[${p.teacher}]</span>` : '';
        
        if (p.type === 'clubbed_classes') {
            li.innerHTML = `
                <div class="card-info">
                    <strong><span style="color:var(--primary);">${p.subj || '(subject)'}</span> ${teacherText}</strong>
                    <p>CLUBBED CLASSES: <strong>${p.clubbedClasses.join(', ')}</strong></p>
                    <p style="color:var(--accent); font-size:0.8rem;">📅 ${p.day} &nbsp;|&nbsp; ⏰ Period ${p.period}</p>
                </div>
                <button onclick="removePreference(${p.id})" class="btn-icon danger"><i data-lucide="trash-2"></i></button>
            `;
        } else if (p.type === 'clubbed_subjects') {
            li.innerHTML = `
                <div class="card-info">
                    <strong style="color:var(--primary);">${p.subj} <span style="color:var(--text-muted);font-weight:400;">by</span> ${p.teacher}</strong>
                    <strong style="color:var(--secondary);">+ ${p.subj2} <span style="color:var(--text-muted);font-weight:400;">by</span> ${p.teacher2}</strong>
                    <p>CLUBBED SUBJECTS in <strong>${p.clubbedClasses.join(', ')}</strong></p>
                    <p style="color:var(--accent); font-size:0.8rem;">📅 ${p.day} &nbsp;|&nbsp; ⏰ Period ${p.period}</p>
                </div>
                <button onclick="removePreference(${p.id})" class="btn-icon danger"><i data-lucide="trash-2"></i></button>
            `;
        } else if (p.type === 'class_teacher_subject') {
            li.innerHTML = `
                <div class="card-info">
                    <strong>${p.subj} ${teacherText}</strong>
                    <p>CLASS TEACHER 1ST PERIOD PREFERRED SUBJECT</p>
                </div>
                <button onclick="removePreference(${p.id})" class="btn-icon danger"><i data-lucide="trash-2"></i></button>
            `;
        } else {
            const isAllPeriods = (p.periods.length === (parseInt(state.settings.periods) || 8));
            const isAllDays = (p.day === 'any');
            
            const dayText = isAllDays ? 'ALL DAY' : p.day.toUpperCase();
            const periodsText = isAllPeriods ? 'ALL DAY' : p.periods.map(num => `P${num}`).join(', ');
            
            li.innerHTML = `
                <div class="card-info">
                    <strong>${p.subj} ${teacherText}</strong>
                    <p>${p.type.toUpperCase()} on ${dayText} (${periodsText})</p>
                </div>
                <button onclick="removePreference(${p.id})" class="btn-icon danger"><i data-lucide="trash-2"></i></button>
            `;
        }
        els.preferenceList.appendChild(li);
    });
}


function getTeacherWorkload(teacherName) {
    let total = 0;
    if (!teacherName) return 0;
    const nameLower = teacherName.trim().toLowerCase();
    
    const matchingRules = state.teacherRules.filter(t => t.name.trim().toLowerCase() === nameLower);
    if (matchingRules.length === 0) return 0;
    
    const processedClasses = new Set();
    
    matchingRules.forEach(rules => {
        if (rules.classes && rules.classes.length > 0) {
            rules.classes.forEach(c => {
                const classKey = `${c.std}_${c.subj}`;
                if (!processedClasses.has(classKey)) {
                    processedClasses.add(classKey);
                    const subRule = state.subjectRules.find(r => r.std === c.std && r.name === c.subj);
                    if (subRule) total += subRule.periods;
                    else total += 1;
                }
            });
        }
    });
    
    return total;
}

function renderTeachers() {
    els.teacherList.innerHTML = '';
    state.teacherRules.forEach(t => {
        const li = document.createElement('li');
        li.className = 'data-card';
        const classesTxt = t.classes.map(c => `${c.std}-${c.subj}`).join(', ') || 'None';
        
        const workload = getTeacherWorkload(t.name);
        const displayName = t.charge 
            ? `${t.name} (${t.charge} class teacher)` 
            : t.name;
            
        li.innerHTML = `
            <div class="card-info">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>${displayName}</strong>
                    <span class="badge ${workload > 30 ? 'danger' : 'success'}">${workload} Periods</span>
                </div>
                <p class="charge">Charge: ${t.charge || 'None'}</p>
                <p class="classes-taken">${classesTxt}</p>
            </div>
            <div class="card-actions">
                <button class="btn-icon" onclick="editTeacher(${t.id})"><i data-lucide="edit-2"></i></button>
                <button class="btn-icon danger" onclick="removeTeacher(${t.id})"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        els.teacherList.appendChild(li);
    });
}

function renderSummaryTable() {
    if (!els.summaryContainer) return;

    let classesSet = new Set();
    state.subjectRules.forEach(r => classesSet.add(r.std));
    const classCount = classesSet.size;
    const classesList = Array.from(classesSet).sort().join(', ');
    const periodsPerDay = state.settings.periods || 8;
    const weeklyPeriods = periodsPerDay * 5;
    const totalPeriods = weeklyPeriods * classCount;
    const allottedPeriods = state.subjectRules.reduce((sum, r) => sum + r.periods, 0);
    const periodsLeft = totalPeriods - allottedPeriods;

    let calculationHtml = `
        <div class="summary-widget card" style="margin-bottom: 1.5rem;">
            <h3 style="margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">Total Periods</h3>
            <ul style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.75rem;">
                <li><strong>Total Period in a week:</strong> ${periodsPerDay} x 5 = ${weeklyPeriods}</li>
                <li><strong>CLASSES:</strong> ${classesList || 'None'} - ${classCount}</li>
                <li><strong>Total period:</strong> ${weeklyPeriods} x ${classCount} = ${totalPeriods}</li>
                <li><strong>Alloted period:</strong> ${allottedPeriods}</li>
                <li><strong>No of period left:</strong> ${periodsLeft}</li>
            </ul>
        </div>
    `;

    if (!state.teacherRules || state.teacherRules.length === 0) {
        els.summaryContainer.innerHTML = calculationHtml;
        return;
    }
    
    // Group teachers by name (case-insensitive, trimmed) to consolidate workloads
    const teacherGroups = {};
    state.teacherRules.forEach(teacher => {
        if (!teacher.name) return;
        const key = teacher.name.trim().toLowerCase();
        if (!teacherGroups[key]) {
            teacherGroups[key] = {
                name: teacher.name.trim(),
                charges: [],
                classes: [],
                totalPeriods: 0
            };
        }
        
        if (teacher.charge && teacher.charge !== '') {
            if (!teacherGroups[key].charges.includes(teacher.charge)) {
                teacherGroups[key].charges.push(teacher.charge);
            }
        }
        
        if (teacher.classes && teacher.classes.length > 0) {
            teacher.classes.forEach(cls => {
                const exists = teacherGroups[key].classes.some(
                    c => c.std === cls.std && c.subj === cls.subj
                );
                if (!exists) {
                    teacherGroups[key].classes.push(cls);
                }
            });
        }
    });

    // Calculate total periods for each group
    Object.values(teacherGroups).forEach(group => {
        let total = 0;
        
        group.classes.forEach(cls => {
            const subjectRule = state.subjectRules.find(
                r => r.name === cls.subj && r.std === cls.std
            );
            const periods = subjectRule ? subjectRule.periods : 5;
            total += periods;
        });
        
        group.totalPeriods = total;
    });

    // Sort teachers descending by workload, then alphabetically
    const sortedTeachers = Object.values(teacherGroups).sort((a, b) => {
        if (b.totalPeriods !== a.totalPeriods) {
            return b.totalPeriods - a.totalPeriods;
        }
        return a.name.localeCompare(b.name);
    });
    
    let html = calculationHtml + `
        <div class="summary-widget card">
            <h3>Teacher Workload</h3>
            <table class="summary-table">
                <thead>
                    <tr>
                        <th class="sl-no">#</th>
                        <th>TEACHER</th>
                        <th>SUBJECTS & PERIODS</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sortedTeachers.forEach((t, idx) => {
        let subjectsListHtml = '';
        
        // Render classes taken
        t.classes.forEach(c => {
            let rule = state.subjectRules.find(r => r.name === c.subj && r.std === c.std);
            let p = rule ? rule.periods : 5; // Default to 5 if rule not found
            subjectsListHtml += `
                <div class="subject-item">
                    <span class="subject-name">${c.subj} (${c.std})</span>
                    <span class="subject-periods">${p}</span>
                </div>
            `;
        });

        const chargeBrackets = t.charges.length > 0
            ? ` (${t.charges.join(', ')} class teacher)`
            : '';

        html += `
            <tr>
                <td class="sl-no">${idx + 1}</td>
                <td class="teacher-name">${t.name}${chargeBrackets}</td>
                <td>
                    ${subjectsListHtml}
                    <div class="total-row">TOTAL: ${t.totalPeriods}</div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;
    els.summaryContainer.innerHTML = html;
}

// --- Output Selects ---
function updateOutputSelects() {
    let classes = new Set();
    state.subjectRules.forEach(r => classes.add(r.std));
    state.teacherRules.forEach(t => {
        if(t.charge) classes.add(t.charge);
        t.classes.forEach(c => classes.add(c.std));
    });
    
    let teachers = new Set(state.teacherRules.map(t => t.name));
    
    const sortedClasses = Array.from(classes).sort();
    const sortedTeachers = Array.from(teachers).sort();
    
    els.outClassSelect.innerHTML = '<option value="">-- Select --</option><option value="ALL_CLASSES">ALL CLASSES</option>' + 
        sortedClasses.map(c => `<option value="${c}">${c}</option>`).join('');
        
    els.outTeacherSelect.innerHTML = '<option value="">-- Select --</option><option value="ALL_TEACHERS">ALL TEACHERS</option>' + 
        sortedTeachers.map(t => `<option value="${t}">${t}</option>`).join('');
}


// --- Timetable Generation Validation ---
function validateDataBeforeGeneration() {
    if (state.subjectRules.length === 0) {
        showToast("ERROR: No subjects have been added. Please add subjects with their allotted periods first!", 'error');
        return false;
    }
    if (state.teacherRules.length === 0) {
        showToast("ERROR: No teachers have been added. Please add teachers with their class charge or classes taken first!", 'error');
        return false;
    }

    const maxWeeklyPeriods = 5 * (parseInt(state.settings.periods) || 8);
    
    // 1. Collect all classes
    let classes = new Set();
    state.subjectRules.forEach(r => classes.add(r.std));
    state.teacherRules.forEach(t => {
        if(t.charge) classes.add(t.charge);
        t.classes.forEach(c => classes.add(c.std));
    });
    
    // 2. Check if any class exceeds max weekly periods
    for (const c of classes) {
        let totalClassPeriods = 0;
        const classSubjects = state.subjectRules.filter(r => r.std === c);
        classSubjects.forEach(r => {
            totalClassPeriods += parseInt(r.periods) || 0;
        });
        
        if (totalClassPeriods > maxWeeklyPeriods) {
            showToast(`ERROR: Class '${c}' has a total of ${totalClassPeriods} allotted subject periods, which exceeds the maximum limit of ${maxWeeklyPeriods} periods per week (5 days x ${state.settings.periods} periods/day). Please reduce the allotted periods!`, 'error');
            return false;
        }
    }
    
    // 3. Check if any teacher's workload exceeds max weekly periods
    const teacherNames = new Set(state.teacherRules.map(t => t.name.trim()));
    for (const name of teacherNames) {
        const workload = getTeacherWorkload(name);
        if (workload > maxWeeklyPeriods) {
            showToast(`ERROR: Teacher '${name}' has a workload of ${workload} periods, which exceeds the weekly maximum of ${maxWeeklyPeriods} periods. Please reduce their classes taken!`, 'error');
            return false;
        }
    }
    
    // 4. Check for subjects assigned to teachers but not defined in Subjects list
    for (const t of state.teacherRules) {
        for (const c of t.classes) {
            const subjectExists = state.subjectRules.some(r => r.std === c.std && r.name === c.subj);
            if (!subjectExists) {
                showToast(`ERROR: Teacher '${t.name}' is assigned to teach '${c.subj}' in '${c.std}', but '${c.subj}' is not defined in the Subjects list for '${c.std}'. Please add the subject rule under Subjects first!`, 'error');
                return false;
            }
        }
    }
    
    return true;
}


// --- Timetable Generation ---
function generateTimetable() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Collect all classes from all sources
    let classes = new Set();
    state.subjectRules.forEach(r => classes.add(r.std));
    state.teacherRules.forEach(t => {
        if(t.charge) classes.add(t.charge);
        t.classes.forEach(c => classes.add(c.std));
    });
    classes = Array.from(classes);

    let masterGrid = {};
    let teacherGrid = {};
    let prePlacedCounts = {};

    classes.forEach(c => {
        masterGrid[c] = {};
        days.forEach(d => masterGrid[c][d] = {});
    });

    state.teacherRules.forEach(t => {
        teacherGrid[t.name] = {};
        days.forEach(d => teacherGrid[t.name][d] = {});
    });

    if (!validateDataBeforeGeneration()) {
        return { masterGrid, teacherGrid, days, classes };
    }

    // Build requirements list and apply Class Teacher Rule
    let classTeachers = {}; // { className: [ { name: teacherName, subj: subjectName, pCount: pCount } ] }
    state.teacherRules.forEach(t => {
        if (t.charge && masterGrid[t.charge]) {
            if (!classTeachers[t.charge]) classTeachers[t.charge] = [];
            
            // Check if there is a class_teacher_subject preference for this teacher
            const pref = state.preferences.find(p => p.type === 'class_teacher_subject' && p.teacher === t.name);
            if (pref) {
                let rule = state.subjectRules.find(r => r.std === t.charge && r.name === pref.subj);
                let pCount = rule ? parseInt(rule.periods) : 5;
                classTeachers[t.charge].push({ name: t.name, subj: pref.subj, pCount: pCount });
            } else {
                // Find all subjects this teacher takes in this class
                let subjectsTaken = t.classes.filter(c => c.std === t.charge);
                if (subjectsTaken.length > 0) {
                    subjectsTaken.forEach(st => {
                        let rule = state.subjectRules.find(r => r.std === t.charge && r.name === st.subj);
                        let pCount = rule ? parseInt(rule.periods) : 5;
                        classTeachers[t.charge].push({ name: t.name, subj: st.subj, pCount: pCount });
                    });
                }
                // If they take NO subjects and NO preference is set, they get NO 1st periods (as per user request "if that teacher teaches subject... thats all")
            }
        }
    });
    
    // 2. Identify all teaching workloads for all classes
    let classWorkloads = {}; // { className: [ { teacher, subj, pCount, remaining } ] }
    classes.forEach(c => {
        classWorkloads[c] = [];
        state.teacherRules.forEach(t => {
            t.classes.forEach(tc => {
                if (tc.std === c) {
                    let rule = state.subjectRules.find(r => r.std === c && r.name === tc.subj);
                    let pCount = rule ? parseInt(rule.periods) : 5;
                    classWorkloads[c].push({
                        teacher: t.name,
                        subj: tc.subj,
                        pCount: pCount,
                        remaining: pCount
                    });
                }
            });
        });
    });
    
    // 3. First pass: Assign Class Teachers to their first period days (strictly up to their workload, max 5 per class)
    let firstPeriodAssignments = {}; // { className: { dayName: { teacher, subj } } }
    classes.forEach(c => {
        firstPeriodAssignments[c] = {};
    });
    
    classes.forEach(c => {
        let duties = classTeachers[c] || [];
        let classAssignedSlots = 0;
        
        duties.forEach(duty => {
            let pToAssign = duty.pCount;
            for (let i = 0; i < days.length && pToAssign > 0 && classAssignedSlots < days.length; i++) {
                let day = days[i];
                if (!firstPeriodAssignments[c][day]) {
                    // Check if teacher is free (not already assigned 1st period in another class)
                    let isBusy = false;
                    Object.values(firstPeriodAssignments).forEach(otherClassAssignments => {
                        if (otherClassAssignments[day] && otherClassAssignments[day].teacher === duty.name) {
                            isBusy = true;
                        }
                    });

                    if (!isBusy) {
                        firstPeriodAssignments[c][day] = { teacher: duty.name, subj: duty.subj };
                        pToAssign--;
                        classAssignedSlots++;
                        // Decrement remaining periods in workload
                        let wl = classWorkloads[c].find(w => w.teacher === duty.name && w.subj === duty.subj);
                        if (wl) {
                            wl.remaining--;
                        }
                    }
                }
            }
        });
    });
    
    // 4. Second pass: Allocate other teachers of the class for the remaining days
    days.forEach(day => {
        classes.forEach(c => {
            if (!firstPeriodAssignments[c][day]) {
                // Find candidates in classWorkloads[c] who have remaining > 0 and are NOT assigned on this day in any other class
                let candidates = classWorkloads[c].filter(w => w.remaining > 0);
                candidates = candidates.filter(cand => {
                    let isAssigned = false;
                    Object.keys(firstPeriodAssignments).forEach(otherC => {
                        if (firstPeriodAssignments[otherC][day] && firstPeriodAssignments[otherC][day].teacher === cand.teacher) {
                            isAssigned = true;
                        }
                    });
                    return !isAssigned;
                });
                
                if (candidates.length > 0) {
                    // Pick the candidate with the highest remaining periods to distribute workload evenly
                    candidates.sort((a, b) => b.remaining - a.remaining);
                    let chosen = candidates[0];
                    firstPeriodAssignments[c][day] = { teacher: chosen.teacher, subj: chosen.subj };
                    chosen.remaining--;
                } else {
                    // Fallback 1: Find any teacher of this class (even if remaining <= 0) who is NOT busy on this day
                    let fallbackCandidates = classWorkloads[c].filter(cand => {
                        let isAssigned = false;
                        Object.keys(firstPeriodAssignments).forEach(otherC => {
                            if (firstPeriodAssignments[otherC][day] && firstPeriodAssignments[otherC][day].teacher === cand.teacher) {
                                isAssigned = true;
                            }
                        });
                        return !isAssigned;
                    });
                    
                    if (fallbackCandidates.length > 0) {
                        fallbackCandidates.sort((a, b) => b.remaining - a.remaining);
                        let chosen = fallbackCandidates[0];
                        let useSubj = chosen.remaining > 0 ? chosen.subj : 'Class Teacher';
                        firstPeriodAssignments[c][day] = { teacher: chosen.teacher, subj: useSubj };
                        if (useSubj === chosen.subj) {
                            chosen.remaining--;
                        }
                    } else {
                        // Fallback 2: Absolutely no teacher is free. Fall back to Class Teacher themselves since they are free
                        let ct = classTeachers[c];
                        if (ct && ct.length > 0) {
                            let firstCt = ct[0];
                            let wl = classWorkloads[c] ? classWorkloads[c].find(w => w.teacher === firstCt.name && w.subj === firstCt.subj) : null;
                            let useSubj = (wl && wl.remaining > 0) ? firstCt.subj : 'Class Teacher';
                            firstPeriodAssignments[c][day] = { teacher: firstCt.name, subj: useSubj };
                            if (wl && useSubj === firstCt.subj) {
                                wl.remaining--;
                            }
                        } else {
                            // Fallback 3: Generic Class Teacher
                            firstPeriodAssignments[c][day] = { teacher: 'Class Teacher', subj: 'Class Teacher' };
                        }
                    }
                }
            }
        });
    });
    
    // 5. Apply the resolved assignments to masterGrid and teacherGrid, and update prePlacedCounts
    classes.forEach(c => {
        days.forEach(day => {
            let assignment = firstPeriodAssignments[c][day];
            if (assignment) {
                let { teacher, subj } = assignment;
                
                masterGrid[c][day][1] = `${subj} (${teacher})`;
                if (teacherGrid[teacher]) {
                    teacherGrid[teacher][day][1] = `${c} (${subj})`;
                }
                
                // Track in prePlacedCounts so it reduces their remaining requirements correctly
                let key = `${teacher}_${c}_${subj}`;
                prePlacedCounts[key] = (prePlacedCounts[key] || 0) + 1;
            }
        });
    });

    // Separate requirements into passes
    let specificReqs = [];
    let otherReqs = [];

    state.teacherRules.forEach(t => {
        t.classes.forEach(c => {
            let rule = state.subjectRules.find(r => r.std === c.std && r.name === c.subj);
            let pCount = rule ? parseInt(rule.periods) : 5;
            let key = `${t.name}_${c.std}_${c.subj}`;
            let alreadyPlaced = prePlacedCounts[key] || 0;
            let remaining = pCount - alreadyPlaced;
            
            // Find specific preference for this subject AND this teacher (if specified)
            const specificPref = state.preferences.find(p => 
                p.subj === c.subj && 
                p.type === 'specific' && 
                (!p.teacher || p.teacher === t.name)
            );

            for(let i=0; i<remaining; i++) {
                const req = { teacher: t.name, std: c.std, subj: c.subj };
                // ONLY apply specific preference to the FIRST instance of the subject
                if (specificPref && i === 0) {
                    specificReqs.push({ ...req, specific: specificPref });
                } else {
                    otherReqs.push(req);
                }
            }
        });
    });

    // Helper to place a requirement
    const tryPlace = (req, useSpread) => {
        const rules = state.preferences.filter(p => 
            p.subj === req.subj && 
            p.type !== 'specific' && 
            p.type !== 'clubbed' &&
            (!p.teacher || p.teacher === req.teacher)
        );
        const shuffledDays = shuffleArray([...days]);
        
        const stdsToCheck = req.isClubbed ? req.stds : [req.std];
        
        for(let day of shuffledDays) {
            if (useSpread) {
                const alreadyHasSubj = stdsToCheck.some(std => 
                    Object.values(masterGrid[std][day]).some(val => val.startsWith(req.subj))
                );
                if (alreadyHasSubj) continue;
            }

            const periods = [];
            for(let i=1; i<=state.settings.periods; i++) periods.push(i);
            shuffleArray(periods);

            for(let p of periods) {
                // Check general rules
                let isAllowed = true;
                rules.forEach(rule => {
                    if (rule.day !== 'any' && rule.day !== day) return;
                    if (rule.type === 'allowed' && !rule.periods.includes(p)) isAllowed = false;
                    if (rule.type === 'not_allowed' && rule.periods.includes(p)) isAllowed = false;
                });
                if (!isAllowed) continue;

                // Check if ALL classes are free and teacher is free
                const allClassesFree = stdsToCheck.every(std => !masterGrid[std][day][p]);
                
                if(allClassesFree && !teacherGrid[req.teacher][day][p]) {
                    stdsToCheck.forEach(std => {
                        masterGrid[std][day][p] = `${req.subj} (${req.teacher})`;
                    });
                    
                    if (req.isClubbed) {
                        teacherGrid[req.teacher][day][p] = `${req.stds.join(', ')} (${req.subj})`;
                    } else {
                        teacherGrid[req.teacher][day][p] = `${req.std} (${req.subj})`;
                    }
                    return true;
                }
            }
        }
        return false;
    };

    // 1. Pass 0: Specific Preferences
    specificReqs.forEach(req => {
        const day = req.specific.day;
        const p = req.specific.periods[0];
        if (!masterGrid[req.std][day][p] && !teacherGrid[req.teacher][day][p]) {
            masterGrid[req.std][day][p] = `${req.subj} (${req.teacher})`;
            teacherGrid[req.teacher][day][p] = `${req.std} (${req.subj})`;
        } else {
            // If clash, treat as regular req for later passes
            otherReqs.push(req);
        }
    });

    // Pass 0.2: Clubbed Subjects Placement
    let clubbedSubjRules = state.preferences.filter(p => p.type === 'clubbed_subjects');
    clubbedSubjRules.forEach(rule => {
        const { subj, teacher, subj2, teacher2, clubbedClasses, day, period } = rule;
        
        // Ensure grids exist for all classes
        const allClassesExist = clubbedClasses.every(c => masterGrid[c]);
        if (!allClassesExist || !teacherGrid[teacher] || !teacherGrid[teacher2]) return;

        // Place if all are free
        let allFree = clubbedClasses.every(c => !masterGrid[c][day][period]) && 
                      !teacherGrid[teacher][day][period] && 
                      !teacherGrid[teacher2][day][period];
        
        if (allFree) {
            clubbedClasses.forEach(c => {
                // CLASS timetable: show only subjects, NO teacher names
                masterGrid[c][day][period] = `${subj} / ${subj2}`;
            });
            // TEACHER timetable: each teacher sees only their own subject + which classes
            teacherGrid[teacher][day][period] = `${clubbedClasses.join(', ')} (${subj})`;
            teacherGrid[teacher2][day][period] = `${clubbedClasses.join(', ')} (${subj2})`;
            
            // Mark as pre-placed so requirements won't double-place
            clubbedClasses.forEach(c => {
                prePlacedCounts[`${teacher}_${c}_${subj}`] = (prePlacedCounts[`${teacher}_${c}_${subj}`] || 0) + 1;
                prePlacedCounts[`${teacher2}_${c}_${subj2}`] = (prePlacedCounts[`${teacher2}_${c}_${subj2}`] || 0) + 1;
            });
        }
    });

    // Pass 0.5: Clubbed Classes — same teacher, same subject, multiple classes, same period
    let clubbedReqs = [];
    let clubbedClassRules = state.preferences.filter(p => p.type === 'clubbed_classes');
    let remainingOtherReqs = [...otherReqs];

    clubbedClassRules.forEach(rule => {
        const { teacher, subj: ruleSubj, clubbedClasses, day: ruleDay, period: rulePeriod } = rule;

        // Find and remove matching requirements from the pool (one per clubbed class)
        let subjectFound = null;
        let removedCount = 0;

        clubbedClasses.forEach(std => {
            const idx = remainingOtherReqs.findIndex(r =>
                r.teacher === teacher && r.std === std &&
                (!ruleSubj || r.subj === ruleSubj)
            );
            if (idx !== -1) {
                const removed = remainingOtherReqs.splice(idx, 1)[0];
                removedCount++;
                if (!subjectFound) subjectFound = removed.subj;
            }
        });

        const subjToUse = ruleSubj || subjectFound;
        if (!subjToUse || removedCount === 0) return;

        // If a specific day+period is set, place directly
        if (rulePeriod && ruleDay && ruleDay !== 'any') {
            const allFree = clubbedClasses.every(c => masterGrid[c] && !masterGrid[c][ruleDay][rulePeriod]) &&
                            teacherGrid[teacher] && !teacherGrid[teacher][ruleDay][rulePeriod];

            if (allFree) {
                clubbedClasses.forEach(c => {
                    if (masterGrid[c]) masterGrid[c][ruleDay][rulePeriod] = `${subjToUse} (${teacher})`;
                });
                if (teacherGrid[teacher]) {
                    teacherGrid[teacher][ruleDay][rulePeriod] = `${clubbedClasses.join(', ')} (${subjToUse})`;
                }
            } else {
                // Slot occupied — fall back to tryPlace
                const req = { isClubbed: true, teacher, subj: subjToUse, stds: clubbedClasses };
                if (!tryPlace(req, true)) tryPlace(req, false);
            }
        } else {
            // No specific period — queue for tryPlace
            clubbedReqs.push({ isClubbed: true, teacher, subj: subjToUse, stds: clubbedClasses });
        }
    });

    otherReqs = remainingOtherReqs;

    // Place queued clubbed reqs (those without a specific period)
    clubbedReqs.forEach(req => {
        if (!tryPlace(req, true)) tryPlace(req, false);
    });

    // 2. Split otherReqs into Pass 1 (Spread) and Pass 2 (Overflow)
    let spreadReqs = [];
    let overflowReqs = [];
    let tripleCounts = {}; // Track how many of this triple we are trying to place

    // SHUFFLE otherReqs first for randomized distribution
    shuffleArray(otherReqs);

    otherReqs.forEach(req => {
        let key = `${req.teacher}_${req.std}_${req.subj}`;
        tripleCounts[key] = (tripleCounts[key] || 0);
        
        // Count how many are ALREADY placed (including by Class Teacher rule)
        let placedAlready = 0;
        days.forEach(d => {
            for(let p=1; p<=state.settings.periods; p++) {
                if (masterGrid[req.std][d][p] && masterGrid[req.std][d][p].startsWith(req.subj)) {
                    placedAlready++;
                }
            }
        });

        // If we haven't hit 1 per day (5 total) for this class-subj, put in spread
        if (placedAlready + tripleCounts[key] < 5) {
            spreadReqs.push(req);
        } else {
            overflowReqs.push(req);
        }
        tripleCounts[key]++;
    });

    // 3. Pass 1: Spread Placement
    let failedSpread = [];
    spreadReqs.forEach(req => {
        if (!tryPlace(req, true)) {
            failedSpread.push(req);
        }
    });

    // 4. Pass 2: Overflow & Failed Spread (Allow same day)
    [...overflowReqs, ...failedSpread].forEach(req => {
        tryPlace(req, false);
    });

    
    return { masterGrid, teacherGrid, days, classes: Array.from(classes) };
}


// --- PDF Exporting ---
function exportPDF(type) {
    // Resolve jsPDF safely every time (CDN may have loaded after page init)
    const JsPDF = (window.jsPDF) || (window.jspdf && window.jspdf.jsPDF);
    if (!JsPDF) {
        showToast('PDF library not loaded. Please check your internet connection and refresh.', 'error');
        return;
    }

    const { masterGrid, teacherGrid, days, classes } = generateTimetable();

    // Auto-populate the output dropdowns from fresh data so the user
    // doesn't have to click Generate first before using Show/PDF.
    if (classes.length === 0) {
        showToast('No timetable data. Please add Subjects & Teachers first, then Generate.', 'error');
        return;
    }
    const sortedClasses = [...classes].sort();
    const sortedTeachers = Object.keys(teacherGrid).sort();
    const prevClass = els.outClassSelect.value;
    const prevTeacher = els.outTeacherSelect.value;
    els.outClassSelect.innerHTML = '<option value="">-- Select --</option><option value="ALL_CLASSES">ALL CLASSES</option>' +
        sortedClasses.map(c => `<option value="${c}">${c}</option>`).join('');
    els.outTeacherSelect.innerHTML = '<option value="">-- Select --</option><option value="ALL_TEACHERS">ALL TEACHERS</option>' +
        sortedTeachers.map(t => `<option value="${t}">${t}</option>`).join('');
    // Restore previous selection if still valid
    if (prevClass && [...els.outClassSelect.options].some(o => o.value === prevClass)) els.outClassSelect.value = prevClass;
    if (prevTeacher && [...els.outTeacherSelect.options].some(o => o.value === prevTeacher)) els.outTeacherSelect.value = prevTeacher;

    let docs = [];

    if (type === 'class') {
        const cls = els.outClassSelect.value;
        if (!cls) {
            // Auto-select first class if nothing chosen
            if (sortedClasses.length > 0) {
                els.outClassSelect.value = sortedClasses[0];
            } else {
                return showToast('No classes found. Please add Subjects & Teachers first.', 'error');
            }
        }
        const selectedCls = els.outClassSelect.value;
        if (!selectedCls) return showToast('Select a class first!', 'error');
        
        if (selectedCls === 'ALL_CLASSES') {
            const doc = new JsPDF('l', 'mm', 'a4');
            const schoolName = state.settings.schoolName || 'School';
            const year = state.settings.year || 'Export';

            sortedClasses.forEach((c, index) => {
                if (index > 0) doc.addPage();
                doc.setFontSize(22);
                doc.text(schoolName, 14, 20);
                doc.setFontSize(16);
                doc.text(`Class: ${c} | Year: ${year}`, 14, 30);

                let headRow = ['Day'];
                for (let p = 1; p <= state.settings.periods; p++) headRow.push(`Period ${p}`);
                let body = [];
                days.forEach(day => {
                    let row = [day.substring(0, 3)];
                    for (let p = 1; p <= state.settings.periods; p++) {
                        row.push((masterGrid[c] && masterGrid[c][day] && masterGrid[c][day][p]) || '-');
                    }
                    body.push(row);
                });
                doc.autoTable({ startY: 40, head: [headRow], body, theme: 'grid', headStyles: { fillColor: [249, 115, 22] }, styles: { fontSize: 10, cellPadding: 4, halign: 'center' } });
            });
            docs.push(doc);
        } else {
            docs.push(createPDFDoc(selectedCls, 'Class', masterGrid[selectedCls], days, JsPDF));
        }
    } 
    else if (type === 'teacher') {
        const tchr = els.outTeacherSelect.value;
        if (!tchr) {
            if (sortedTeachers.length > 0) {
                els.outTeacherSelect.value = sortedTeachers[0];
            } else {
                return showToast('No teachers found. Please add teachers first.', 'error');
            }
        }
        const selectedTchr = els.outTeacherSelect.value;
        if (!selectedTchr) return showToast('Select a teacher first!', 'error');

        if (selectedTchr === 'ALL_TEACHERS') {
            const doc = new JsPDF('l', 'mm', 'a4');
            const schoolName = state.settings.schoolName || 'School';
            const year = state.settings.year || 'Export';

            sortedTeachers.forEach((tName, index) => {
                if (index > 0) doc.addPage();
                doc.setFontSize(22);
                doc.text(schoolName, 14, 20);
                doc.setFontSize(16);
                doc.text(`Teacher: ${tName} | Year: ${year}`, 14, 30);

                let headRow = ['Day'];
                for (let p = 1; p <= state.settings.periods; p++) headRow.push(`Period ${p}`);
                let body = [];
                days.forEach(day => {
                    let row = [day.substring(0, 3)];
                    for (let p = 1; p <= state.settings.periods; p++) {
                        row.push((teacherGrid[tName] && teacherGrid[tName][day] && teacherGrid[tName][day][p]) || '-');
                    }
                    body.push(row);
                });
                doc.autoTable({ startY: 40, head: [headRow], body, theme: 'grid', headStyles: { fillColor: [249, 115, 22] }, styles: { fontSize: 10, cellPadding: 4, halign: 'center' } });
            });
            docs.push(doc);
        } else {
            docs.push(createPDFDoc(selectedTchr, 'Teacher', teacherGrid[selectedTchr], days, JsPDF));
        }
    }
    else if (type === 'school') {
        const doc = new JsPDF('l', 'mm', 'a4');
        const schoolName = state.settings.schoolName || 'School';
        const year = state.settings.year || 'Export';

        days.forEach((day, index) => {
            if (index > 0) doc.addPage();
            doc.setFontSize(22);
            doc.text(schoolName, 14, 20);
            doc.setFontSize(16);
            doc.text(`Day: ${day} | Year: ${year}`, 14, 30);
            const body = [];
            sortedClasses.forEach(cls => {
                let row = [cls];
                for (let p = 1; p <= state.settings.periods; p++) {
                    row.push((masterGrid[cls] && masterGrid[cls][day] && masterGrid[cls][day][p]) || '-');
                }
                body.push(row);
            });
            let headRow = ['Class'];
            for (let p = 1; p <= state.settings.periods; p++) headRow.push(`Period ${p}`);
            doc.autoTable({ startY: 40, head: [headRow], body, theme: 'grid', headStyles: { fillColor: [139, 92, 246] }, styles: { fontSize: 9, cellPadding: 3, halign: 'center' } });
        });

        const safeSchoolName = schoolName.replace(/[^a-z0-9]/gi, '_');
        doc.save(`${safeSchoolName}_Master_Timetable.pdf`);
        return;
    }
    
    // Download individual PDF
    if (docs.length > 0) {
        if (type === 'class') {
            const cls = els.outClassSelect.value;
            const safeName = cls.replace(/[^a-z0-9]/gi, '_');
            docs[0].save(cls === 'ALL_CLASSES' ? 'Timetable_All_Classes.pdf' : `Timetable_Class_${safeName}.pdf`);
        } else if (type === 'teacher') {
            const tchr = els.outTeacherSelect.value;
            const safeName = tchr.replace(/[^a-z0-9]/gi, '_');
            docs[0].save(tchr === 'ALL_TEACHERS' ? 'Timetable_All_Teachers.pdf' : `Timetable_Teacher_${safeName}.pdf`);
        }
    }
    logUsage('pdf');
}

function createPDFDoc(title, typeName, dataGrid, days, JsPDF) {
    // JsPDF passed in to avoid CDN timing issues
    const Ctor = JsPDF || window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
    const doc = new Ctor('l', 'mm', 'a4');
    const schoolName = state.settings.schoolName || 'School';
    const year = state.settings.year || 'Export';

    doc.setFontSize(22);
    doc.text(schoolName, 14, 20);
    doc.setFontSize(16);
    doc.text(`${typeName}: ${title} | Year: ${year}`, 14, 30);

    let headRow = ['Day'];
    for (let p = 1; p <= state.settings.periods; p++) headRow.push(`Period ${p}`);

    let body = [];
    days.forEach(day => {
        let row = [day.substring(0, 3)];
        for (let p = 1; p <= state.settings.periods; p++) {
            row.push((dataGrid && dataGrid[day] && dataGrid[day][p]) || '-');
        }
        body.push(row);
    });

    doc.autoTable({ startY: 40, head: [headRow], body, theme: 'grid', headStyles: { fillColor: [249, 115, 22] }, styles: { fontSize: 10, cellPadding: 4, halign: 'center' } });
    return doc;
}

// --- Timetable Preview ---

function showPreview(type) {
    const { masterGrid, teacherGrid, days, classes } = generateTimetable();
    const periods = state.settings.periods || 8;

    // Auto-populate the output dropdowns from freshly-generated data
    // so Show works even if Generate was never explicitly clicked.
    if (classes.length === 0 && type !== 'school') {
        showToast('No timetable data. Please add Subjects & Teachers first, then Generate.', 'error');
        return;
    }
    const sortedClasses = [...classes].sort();
    const sortedTeachers = Object.keys(teacherGrid).sort();
    const prevClass = els.outClassSelect.value;
    const prevTeacher = els.outTeacherSelect.value;
    els.outClassSelect.innerHTML = '<option value="">-- Select --</option><option value="ALL_CLASSES">ALL CLASSES</option>' +
        sortedClasses.map(c => `<option value="${c}">${c}</option>`).join('');
    els.outTeacherSelect.innerHTML = '<option value="">-- Select --</option><option value="ALL_TEACHERS">ALL TEACHERS</option>' +
        sortedTeachers.map(t => `<option value="${t}">${t}</option>`).join('');
    if (prevClass && [...els.outClassSelect.options].some(o => o.value === prevClass)) els.outClassSelect.value = prevClass;
    if (prevTeacher && [...els.outTeacherSelect.options].some(o => o.value === prevTeacher)) els.outTeacherSelect.value = prevTeacher;

    let html = '';
    let title = '';

    if (type === 'class') {
        let cls = els.outClassSelect.value;
        // Auto-select first class if nothing chosen
        if (!cls && sortedClasses.length > 0) {
            els.outClassSelect.value = sortedClasses[0];
            cls = sortedClasses[0];
        }
        if (!cls) return showToast('No classes available. Please add Subjects & Teachers first.', 'error');
        
        if (cls === 'ALL_CLASSES') {
            title = `All Classes Timetables`;
            html = '';
            classes.sort().forEach(c => {
                html += `<h3 style="margin: 1.5rem 0 1rem; color: var(--primary);">Class ${c}</h3>`;
                html += `<table class="preview-table">
                    <thead>
                        <tr>
                            <th>Day</th>
                            ${Array.from({length: periods}, (_, i) => `<th>Period ${i+1}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>`;
                days.forEach(day => {
                    html += `<tr><td><strong>${day.substring(0,3)}</strong></td>`;
                    for(let p=1; p<=periods; p++) {
                        html += `<td>${(masterGrid[c] && masterGrid[c][day] && masterGrid[c][day][p]) || '-'}</td>`;
                    }
                    html += `</tr>`;
                });
                html += `</tbody></table>`;
            });
        } else {
            title = `Class ${cls} Timetable`;
            
            html = `<table class="preview-table">
                <thead>
                    <tr>
                        <th>Day</th>
                        ${Array.from({length: periods}, (_, i) => `<th>Period ${i+1}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>`;
                
            days.forEach(day => {
                html += `<tr><td><strong>${day.substring(0,3)}</strong></td>`;
                for(let p=1; p<=periods; p++) {
                    html += `<td>${(masterGrid[cls] && masterGrid[cls][day] && masterGrid[cls][day][p]) || '-'}</td>`;
                }
                html += `</tr>`;
            });
            html += `</tbody></table>`;
        }
    } 
    else if (type === 'teacher') {
        let tchr = els.outTeacherSelect.value;
        if (!tchr && sortedTeachers.length > 0) {
            els.outTeacherSelect.value = sortedTeachers[0];
            tchr = sortedTeachers[0];
        }
        if (!tchr) return showToast('No teachers available. Please add teachers first.', 'error');
        
        if (tchr === 'ALL_TEACHERS') {
            title = `All Teachers Timetables`;
            html = '';
            const sortedTeachers = Object.keys(teacherGrid).sort();
            sortedTeachers.forEach(tName => {
                html += `<h3 style="margin: 1.5rem 0 1rem; color: var(--primary);">Teacher ${tName}</h3>`;
                html += `<table class="preview-table">
                    <thead>
                        <tr>
                            <th>Day</th>
                            ${Array.from({length: periods}, (_, i) => `<th>Period ${i+1}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>`;
                days.forEach(day => {
                    html += `<tr><td><strong>${day.substring(0,3)}</strong></td>`;
                    for(let p=1; p<=periods; p++) {
                        html += `<td>${(teacherGrid[tName] && teacherGrid[tName][day] && teacherGrid[tName][day][p]) || '-'}</td>`;
                    }
                    html += `</tr>`;
                });
                html += `</tbody></table>`;
            });
        } else {
            title = `Teacher ${tchr} Timetable`;
            
            html = `<table class="preview-table">
                <thead>
                    <tr>
                        <th>Day</th>
                        ${Array.from({length: periods}, (_, i) => `<th>Period ${i+1}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>`;
                
            days.forEach(day => {
                html += `<tr><td><strong>${day.substring(0,3)}</strong></td>`;
                for(let p=1; p<=periods; p++) {
                    html += `<td>${(teacherGrid[tchr] && teacherGrid[tchr][day] && teacherGrid[tchr][day][p]) || '-'}</td>`;
                }
                html += `</tr>`;
            });
            html += `</tbody></table>`;
        }
    }
    else if (type === 'school') {
        if (classes.length === 0) return showToast('No classes to generate! Please add Subjects & Teachers first.', 'error');
        title = `School Timetable`;
        
        html = '';
        days.forEach(day => {
            html += `<h3 style="margin: 1.5rem 0 1rem; color: var(--primary);">${day}</h3>`;
            html += `<table class="preview-table">
                <thead>
                    <tr>
                        <th>Class</th>
                        ${Array.from({length: periods}, (_, i) => `<th>Period ${i+1}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>`;
            
            classes.sort().forEach(cls => {
                html += `<tr><td><strong>${cls}</strong></td>`;
                for(let p=1; p<=periods; p++) {
                    html += `<td>${(masterGrid[cls] && masterGrid[cls][day] && masterGrid[cls][day][p]) || '-'}</td>`;
                }
                html += `</tr>`;
            });
            html += `</tbody></table>`;
        });
    }

    if (els.previewTitle) els.previewTitle.innerText = title;
    if (els.previewScrollContainer) els.previewScrollContainer.innerHTML = html;
    if (els.previewModal) els.previewModal.classList.add('show');
    
    logUsage('preview');
}


// --- Payment Integration ---
let pendingPaymentCallback = null;

function triggerPayment(onSuccess) {
    if (typeof onSuccess === 'function') onSuccess();
}

function updateCountdowns() {}

// Boot
init();
