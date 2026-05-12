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
    tempPrefList: document.getElementById('temp-pref-periods'),
    prefClubbedClasses: document.getElementById('pref-clubbed-classes'),
    preferenceList: document.getElementById('preference-list'),
    
    // Groups for toggling visibility
    prefDayGroup: document.getElementById('pref-day-group'),
    prefPeriodGroup: document.getElementById('pref-period-group'),
    prefClubbedGroup: document.getElementById('pref-clubbed-group'),
    
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

    // Load Admin State from Server (Shared)
    await loadAdminStateFromServer();

    // Ensure all arrays exist for backward compatibility
    state.subjectRules = state.subjectRules || [];
    state.teacherRules = state.teacherRules || [];
    state.preferences = state.preferences || [];
    state.settings = state.settings || { periods: 8, schoolName: '', year: '' };
    state.paymentRecords = state.paymentRecords || {};
    state.usageLogs = state.usageLogs || [];
    state.activeUsers = state.activeUsers || [];
    state.adminPassword = state.adminPassword || 'mastergrid2026';
    state.adminIps = state.adminIps || [];
    state.paymentEnabled = (state.paymentEnabled !== undefined) ? state.paymentEnabled : true;
    
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
        const isClubbed = e.target.value === 'clubbed';
        els.prefDayGroup.style.display = isClubbed ? 'none' : 'flex';
        els.prefPeriodGroup.style.display = isClubbed ? 'none' : 'flex';
        els.prefClubbedGroup.style.display = isClubbed ? 'flex' : 'none';
    });
    
    document.getElementById('btn-class-pdf').onclick = (e) => { e.preventDefault(); triggerPayment(() => exportPDF('class')); };
    document.getElementById('btn-teacher-pdf').onclick = (e) => { e.preventDefault(); triggerPayment(() => exportPDF('teacher')); };
    document.getElementById('btn-school-pdf').onclick = (e) => { e.preventDefault(); triggerPayment(() => exportPDF('school')); };

    // Preview
    document.getElementById('btn-class-preview').onclick = (e) => { e.preventDefault(); showPreview('class'); };
    document.getElementById('btn-teacher-preview').onclick = (e) => { e.preventDefault(); showPreview('teacher'); };
    document.getElementById('btn-school-preview').onclick = (e) => { e.preventDefault(); showPreview('school'); };
    
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
    renderAll();
}

let heartbeatInterval = null;
function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    const sendHeartbeat = async () => {
        try {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    school: state.settings.schoolName || 'Guest'
                })
            });
        } catch (e) {
            console.warn("Heartbeat failed", e);
        }
    };
    
    sendHeartbeat();
    heartbeatInterval = setInterval(sendHeartbeat, 15000);
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

function changeAdminPassword() {
    const newPass = document.getElementById('new-admin-password').value.trim();
    if (newPass.length < 4) {
        showToast("Password must be at least 4 characters.");
        return;
    }
    state.adminPassword = newPass;
    save();
    showToast("Admin password updated successfully!", "success");
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
            state.paymentEnabled = (serverState.paymentEnabled !== undefined) ? serverState.paymentEnabled : true;
            state.activeUsers = serverState.activeUsers || [];
            if (serverState.adminPassword) state.adminPassword = serverState.adminPassword;
        }
    } catch (e) {
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
        await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(adminData)
        });
    } catch (e) {
        console.error("Failed to save admin state to server", e);
    }
}

function renderAdminDashboard() {
    if (!els.adminRecordsBody) return;
    
    const logs = state.usageLogs || [];
    const payments = state.paymentRecords || {};
    const active = state.activeUsers || [];
    
    // Stats
    document.getElementById('stat-total-users').innerText = new Set(logs.map(l => l.ip)).size;
    document.getElementById('stat-total-payments').innerText = Object.keys(payments).length;
    document.getElementById('stat-total-logs').innerText = logs.length;
    document.getElementById('stat-live-users').innerText = active.length;
    
    // Combine logs and payments for a unified view
    let records = logs.map(l => ({...l, isPayment: false})).reverse();
    
    // Add payment records as special entries
    Object.keys(payments).forEach(key => {
        const [school, ip] = key.split('_');
        records.push({
            timestamp: payments[key],
            school: school,
            ip: ip,
            type: 'PAYMENT',
            isPayment: true
        });
    });
    
    // Sort by time descending
    records.sort((a,b) => b.timestamp - a.timestamp);
    
    els.adminRecordsBody.innerHTML = records.map(r => `
        <tr>
            <td>${new Date(r.timestamp).toLocaleString()}</td>
            <td style="color: var(--secondary); font-weight:600;">${r.school}</td>
            <td style="font-family: monospace; font-size: 0.8rem;">${r.ip}</td>
            <td><span class="tag small" style="background: ${r.isPayment ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)'}">${r.type.toUpperCase()}</span></td>
            <td>${r.isPayment ? '<span style="color: #10b981; font-weight:800;">PAID</span>' : '<span style="color: var(--text-muted);">VIEWED</span>'}</td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;">No records found</td></tr>';

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

async function fetchUserIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        state.userIp = data.ip;
        renderAll();
    } catch (e) {
        console.error("Failed to fetch IP", e);
    }
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
}

function save() {
    localStorage.setItem('timetable_dashboard_state', JSON.stringify(state));
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
        updatePrefPeriodOptions();
        updateDataLists();
        renderSummaryTable();
        checkPaymentStatus();
        if(window.lucide) lucide.createIcons();
    } catch(e) {
        console.error("Rendering error", e);
    }
}

function checkPaymentStatus() {
    if (!els.paymentBanner) return;
    
    const school = (state.settings.schoolName || '').trim();
    if (!school) {
        els.paymentBanner.style.display = 'none';
        return;
    }

    const key = `${school}_${state.userIp}`;
    const paymentTimestamp = state.paymentRecords[key];
    
    if (paymentTimestamp) {
        const now = Date.now();
        const diffDays = (now - paymentTimestamp) / (1000 * 60 * 60 * 24);
        
        if (diffDays <= 3) {
            const remaining = (3 - diffDays).toFixed(1);
            els.paymentBanner.style.display = 'block';
            els.paymentBanner.className = 'payment-banner valid';
            els.paymentBanner.innerHTML = `✓ Payment verified for ${school}. You can edit and update for ${remaining} more days.`;
        } else {
            els.paymentBanner.style.display = 'block';
            els.paymentBanner.className = 'payment-banner expired';
            els.paymentBanner.innerHTML = `! Edit window expired for ${school}. Please make payment first to download/edit.`;
        }
    } else {
        // Check if any other school was paid for from this IP
        const otherPayments = Object.keys(state.paymentRecords).filter(k => k.endsWith(`_${state.userIp}`));
        if (otherPayments.length > 0) {
            els.paymentBanner.style.display = 'block';
            els.paymentBanner.className = 'payment-banner expired';
            els.paymentBanner.innerHTML = `! In this IP address only one school can make timetable. Make payment first for ${school}.`;
        } else {
            els.paymentBanner.style.display = 'none';
        }
    }
}

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

function updatePrefPeriodOptions() {
    const count = parseInt(state.settings.periods) || 8;
    const currentVal = els.prefPeriodSelect.value;
    let html = '';
    for(let i=1; i<=count; i++) html += `<option value="${i}">Period ${i}</option>`;
    els.prefPeriodSelect.innerHTML = html;
    if (currentVal && parseInt(currentVal) <= count) els.prefPeriodSelect.value = currentVal;
}

function addTempPrefPeriod() {
    const p = parseInt(els.prefPeriodSelect.value);
    if (!p) {
        showToast("Select a period first.");
        return;
    }
    if (!state.tempPrefPeriods.includes(p)) {
        state.tempPrefPeriods.push(p);
        state.tempPrefPeriods.sort((a,b) => a-b);
        showToast(`Period ${p} added to rule list`, 'success');
    } else {
        showToast("Period already in list.");
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
    const periods = [...state.tempPrefPeriods];
    const clubbedRaw = els.prefClubbedClasses ? els.prefClubbedClasses.value.trim() : '';
    
    if (!subj) return showToast("Select a subject first.");
    
    if (type === 'clubbed') {
        if (!teacher) return showToast("Select a teacher for clubbed classes.");
        if (!clubbedRaw) return showToast("Enter clubbed classes.");
        const clubbedClasses = clubbedRaw.split(',').map(s => s.trim()).filter(s => s);
        if (clubbedClasses.length < 2) return showToast("Enter at least 2 classes for clubbing.");
        
        state.preferences.push({
            id: Date.now(),
            subj, type, teacher, clubbedClasses
        });
    } else {
        if (type !== 'specific' && periods.length === 0) return showToast("Add at least one period.");
        if (type === 'specific' && (day === 'any' || periods.length !== 1)) return showToast("Select a specific Day and exactly ONE Period.");
        
        state.preferences.push({
            id: Date.now(),
            subj, type, day, periods
        });
    }
    
    save();
    state.tempPrefPeriods = [];
    if (els.prefClubbedClasses) els.prefClubbedClasses.value = '';
    showToast(`Rule for ${subj} saved!`, 'success');
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
        let detail = '';
        if (p.type === 'specific') detail = `Specific: ${p.day} Period ${p.periods[0]}`;
        else if (p.type === 'clubbed') detail = `Clubbed: ${p.clubbedClasses.join(', ')} (by ${p.teacher})`;
        else detail = `${p.type.replace('_',' ').toUpperCase()} in periods: ${p.periods.join(', ')} (${p.day})`;
        
        li.innerHTML = `
            <h4>${p.subj} <button class="btn-del" onclick="removePreference(${p.id})"><i data-lucide="trash-2" style="width:16px;"></i></button></h4>
            <p>${detail}</p>
        `;
        els.preferenceList.appendChild(li);
    });
}


function renderTeachers() {
    els.teacherList.innerHTML = '';
    state.teacherRules.forEach(t => {
        const li = document.createElement('li');
        li.className = 'data-card';
        const classesTxt = t.classes.map(c => `${c.std}-${c.subj}`).join(', ') || 'None';
        
        li.innerHTML = `
            <h4>${t.name} 
                <div class="actions">
                    <button class="btn-edit" onclick="editTeacher(${t.id})"><i data-lucide="edit-3" style="width:16px;"></i></button>
                    <button class="btn-del" onclick="removeTeacher(${t.id})"><i data-lucide="trash-2" style="width:16px;"></i></button>
                </div>
            </h4>
            <div class="charge">Class Charge: ${t.charge || 'None'}</div>
            <p>Classes: ${classesTxt}</p>
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

    if (state.teacherRules.length === 0) {
        els.summaryContainer.innerHTML = calculationHtml;
        return;
    }
    
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

    state.teacherRules.forEach((t, idx) => {
        let total = 0;
        let subjectsListHtml = '';
        
        t.classes.forEach(c => {
            let rule = state.subjectRules.find(r => r.name === c.subj && r.std === c.std);
            let p = rule ? rule.periods : 5; // Default to 5 if rule not found, but should usually be found
            total += p;
            subjectsListHtml += `
                <div class="subject-item">
                    <span class="subject-name">${c.subj} (${c.std})</span>
                    <span class="subject-periods">${p}</span>
                </div>
            `;
        });

        html += `
            <tr>
                <td class="sl-no">${idx + 1}</td>
                <td class="teacher-name">${t.name}</td>
                <td>
                    ${subjectsListHtml}
                    <div class="total-row">TOTAL: ${total}</div>
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


// --- Timetable Generation ---
function generateTimetable() {
    // Collect all classes
    let classes = new Set();
    state.subjectRules.forEach(r => classes.add(r.std));
    state.teacherRules.forEach(t => {
        if(t.charge) classes.add(t.charge);
        t.classes.forEach(c => classes.add(c.std));
    });
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    let masterGrid = {};
    let teacherGrid = {};
    
    classes.forEach(c => {
        masterGrid[c] = {};
        days.forEach(d => masterGrid[c][d] = {});
    });
    
    state.teacherRules.forEach(t => {
        teacherGrid[t.name] = {};
        days.forEach(d => teacherGrid[t.name][d] = {});
    });
    
    // Build requirements list and apply Class Teacher Rule
    let reqs = [];
    let prePlacedCounts = {}; // { teacher_std_subj: count }
    
    // First, satisfy the Class Teacher rule: 1st period Monday-Friday
    state.teacherRules.forEach(t => {
        if(t.charge && masterGrid[t.charge]) {
            let subj = 'Class Teacher';
            let teacherTakes = t.classes.find(c => c.std === t.charge);
            if (teacherTakes) {
                subj = teacherTakes.subj;
                let key = `${t.name}_${t.charge}_${subj}`;
                prePlacedCounts[key] = (prePlacedCounts[key] || 0) + days.length; // 5 days
            }
            
            days.forEach(day => {
                masterGrid[t.charge][day][1] = `${subj} (${t.name})`;
                teacherGrid[t.name][day][1] = `${t.charge} (${subj})`;
            });
        }
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
            
            const specificPref = state.preferences.find(p => p.subj === c.subj && p.type === 'specific');

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
        const rules = state.preferences.filter(p => p.subj === req.subj && p.type !== 'specific' && p.type !== 'clubbed');
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

    // Pass 0.5: Group Clubbed Classes
    let clubbedReqs = [];
    let clubbedRules = state.preferences.filter(p => p.type === 'clubbed');
    
    clubbedRules.forEach(rule => {
        let matchingReqsByStd = {};
        rule.clubbedClasses.forEach(std => matchingReqsByStd[std] = []);
        
        let remainingOtherReqs = [];
        otherReqs.forEach(req => {
            if (req.teacher === rule.teacher && req.subj === rule.subj && rule.clubbedClasses.includes(req.std)) {
                matchingReqsByStd[req.std].push(req);
            } else {
                remainingOtherReqs.push(req);
            }
        });
        otherReqs = remainingOtherReqs;
        
        let counts = rule.clubbedClasses.map(std => matchingReqsByStd[std] ? matchingReqsByStd[std].length : 0);
        let minCount = Math.min(...counts);
        
        if (minCount > 0) {
            for (let i = 0; i < minCount; i++) {
                clubbedReqs.push({
                    isClubbed: true,
                    teacher: rule.teacher,
                    subj: rule.subj,
                    stds: rule.clubbedClasses
                });
                rule.clubbedClasses.forEach(std => matchingReqsByStd[std].pop());
            }
        }
        
        rule.clubbedClasses.forEach(std => {
            if(matchingReqsByStd[std]) otherReqs.push(...matchingReqsByStd[std]);
        });
    });

    // Place Clubbed Reqs First
    clubbedReqs.forEach(req => {
        if (!tryPlace(req, true)) {
            tryPlace(req, false);
        }
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
    const { masterGrid, teacherGrid, days, classes } = generateTimetable();
    
    let docs = [];
    
    if (type === 'class') {
        const cls = els.outClassSelect.value;
        if(!cls) return showToast("Select a class first!");
        
        if (cls === 'ALL_CLASSES') {
            const doc = new jsPDF('l', 'mm', 'a4');
            const schoolName = state.settings.schoolName || 'School';
            const year = state.settings.year || 'Export';
            
            classes.sort().forEach((c, index) => {
                if (index > 0) doc.addPage();
                doc.setFontSize(22);
                doc.text(schoolName, 14, 20);
                doc.setFontSize(16);
                doc.text(`Class: ${c} | Year: ${year}`, 14, 30);
                
                let headRow = ['Day'];
                for(let p=1; p<=state.settings.periods; p++) {
                    headRow.push(`Period ${p}`);
                }
                let body = [];
                days.forEach(day => {
                    let row = [day.substring(0, 3)];
                    for(let p=1; p<=state.settings.periods; p++) {
                        row.push(masterGrid[c][day][p] || '-');
                    }
                    body.push(row);
                });
                doc.autoTable({
                    startY: 40,
                    head: [headRow],
                    body: body,
                    theme: 'grid',
                    headStyles: { fillColor: [249, 115, 22] },
                    styles: { fontSize: 10, cellPadding: 4, halign: 'center' }
                });
            });
            docs.push(doc);
        } else {
            docs.push(createPDFDoc(cls, 'Class', masterGrid[cls], days));
        }
    } 
    else if (type === 'teacher') {
        const tchr = els.outTeacherSelect.value;
        if(!tchr) return showToast("Select a teacher first!");
        
        if (tchr === 'ALL_TEACHERS') {
            const doc = new jsPDF('l', 'mm', 'a4');
            const schoolName = state.settings.schoolName || 'School';
            const year = state.settings.year || 'Export';
            const sortedTeachers = Object.keys(teacherGrid).sort();
            
            sortedTeachers.forEach((tName, index) => {
                if (index > 0) doc.addPage();
                doc.setFontSize(22);
                doc.text(schoolName, 14, 20);
                doc.setFontSize(16);
                doc.text(`Teacher: ${tName} | Year: ${year}`, 14, 30);
                
                let headRow = ['Day'];
                for(let p=1; p<=state.settings.periods; p++) {
                    headRow.push(`Period ${p}`);
                }
                let body = [];
                days.forEach(day => {
                    let row = [day.substring(0, 3)];
                    for(let p=1; p<=state.settings.periods; p++) {
                        row.push(teacherGrid[tName][day][p] || '-');
                    }
                    body.push(row);
                });
                doc.autoTable({
                    startY: 40,
                    head: [headRow],
                    body: body,
                    theme: 'grid',
                    headStyles: { fillColor: [249, 115, 22] },
                    styles: { fontSize: 10, cellPadding: 4, halign: 'center' }
                });
            });
            docs.push(doc);
        } else {
            docs.push(createPDFDoc(tchr, 'Teacher', teacherGrid[tchr], days));
        }
    }
    else if (type === 'school') {
        if(classes.length === 0) return showToast("No classes to generate!");
        
        const doc = new jsPDF('l', 'mm', 'a4');
        const schoolName = state.settings.schoolName || 'School';
        const year = state.settings.year || 'Export';
        
        days.forEach((day, index) => {
            if (index > 0) doc.addPage();
            
            doc.setFontSize(22);
            doc.text(schoolName, 14, 20);
            
            doc.setFontSize(16);
            doc.text(`Day: ${day} | Year: ${year}`, 14, 30);
            
            const body = [];
            classes.forEach(cls => {
                let row = [cls];
                for(let p=1; p<=state.settings.periods; p++) {
                    row.push(masterGrid[cls][day][p] || '-');
                }
                body.push(row);
            });
            
            let headRow = ['Class'];
            for(let p=1; p<=state.settings.periods; p++) {
                headRow.push(`Period ${p}`);
            }
            
            doc.autoTable({
                startY: 40,
                head: [headRow],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [139, 92, 246] },
                styles: { fontSize: 9, cellPadding: 3, halign: 'center' }
            });
        });
        
        const safeSchoolName = schoolName.replace(/[^a-z0-9]/gi, '_');
        doc.save(`${safeSchoolName}_Master_Timetable.pdf`);
        return;
    }
    
    // Download individual PDF
    if (type === 'class') {
        const cls = els.outClassSelect.value;
        if (cls === 'ALL_CLASSES') {
            docs[0].save(`Timetable_All_Classes.pdf`);
        } else {
            const safeName = cls.replace(/[^a-z0-9]/gi, '_');
            docs[0].save(`Timetable_Class_${safeName}.pdf`);
        }
    } else if (type === 'teacher') {
        const tchr = els.outTeacherSelect.value;
        if (tchr === 'ALL_TEACHERS') {
            docs[0].save(`Timetable_All_Teachers.pdf`);
        } else {
            const safeName = tchr.replace(/[^a-z0-9]/gi, '_');
            docs[0].save(`Timetable_Teacher_${safeName}.pdf`);
        }
    }
    logUsage('pdf');
}

function createPDFDoc(title, typeName, dataGrid, days) {
    const doc = new jsPDF('l', 'mm', 'a4');
    const schoolName = state.settings.schoolName || 'School';
    const year = state.settings.year || 'Export';
    
    doc.setFontSize(22);
    doc.text(schoolName, 14, 20);
    
    doc.setFontSize(16);
    doc.text(`${typeName}: ${title} | Year: ${year}`, 14, 30);
    
    let headRow = ['Day'];
    for(let p=1; p<=state.settings.periods; p++) {
        headRow.push(`Period ${p}`);
    }
    
    let body = [];
    days.forEach(day => {
        let row = [day.substring(0, 3)];
        for(let p=1; p<=state.settings.periods; p++) {
            row.push(dataGrid[day][p] || '-');
        }
        body.push(row);
    });
    
    doc.autoTable({
        startY: 40,
        head: [headRow],
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [249, 115, 22] },
        styles: { fontSize: 10, cellPadding: 4, halign: 'center' }
    });
    
    return doc;
}

// --- Timetable Preview ---
function showPreview(type) {
    const { masterGrid, teacherGrid, days, classes } = generateTimetable();
    const periods = state.settings.periods || 8;
    
    let html = '';
    let title = '';
    
    if (type === 'class') {
        const cls = els.outClassSelect.value;
        if(!cls) return showToast("Select a class first!");
        
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
                        html += `<td>${masterGrid[c][day][p] || '-'}</td>`;
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
                    html += `<td>${masterGrid[cls][day][p] || '-'}</td>`;
                }
                html += `</tr>`;
            });
            html += `</tbody></table>`;
        }
    } 
    else if (type === 'teacher') {
        const tchr = els.outTeacherSelect.value;
        if(!tchr) return showToast("Select a teacher first!");
        
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
                        html += `<td>${teacherGrid[tName][day][p] || '-'}</td>`;
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
                    html += `<td>${teacherGrid[tchr][day][p] || '-'}</td>`;
                }
                html += `</tr>`;
            });
            html += `</tbody></table>`;
        }
    }
    else if (type === 'school') {
        if(classes.length === 0) return showToast("No classes to generate!");
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
                    html += `<td>${masterGrid[cls][day][p] || '-'}</td>`;
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

document.getElementById('btn-cancel-payment').onclick = () => {
    document.getElementById('payment-modal').classList.remove('show');
    pendingPaymentCallback = null;
};

document.getElementById('btn-confirm-payment').onclick = async () => {
    const school = (state.settings.schoolName || '').trim();
    if (!school) {
        showToast("Enter School Name before paying.");
        return;
    }

    const key = `${school}_${state.userIp}`;
    state.paymentRecords[key] = Date.now();
    save();
    await saveAdminStateToServer();
    
    document.getElementById('payment-modal').classList.remove('show');
    if (pendingPaymentCallback) {
        pendingPaymentCallback();
        pendingPaymentCallback = null;
    }
    await logUsage('payment');
    renderAll();
};

function triggerPayment(onSuccess) {
    const school = (state.settings.schoolName || '').trim();
    if (!school) {
        showToast("Please enter School Name in Settings first.");
        return;
    }

    const key = `${school}_${state.userIp}`;
    const paymentTimestamp = state.paymentRecords[key];
    const now = Date.now();
    
    // Check if Global Payment is DISABLED
    if (state.paymentEnabled === false) {
        showToast("Free Access: Global payment is currently disabled.", "success");
        onSuccess();
        return;
    }

    // Check if IP is Admin Trusted (Fixed Admin IP)
    const isAdminIp = (state.adminIps || []).includes(state.userIp);
    if (isAdminIp) {
        showToast("Admin Access: Skipping payment modal.", "success");
        onSuccess();
        return;
    }

    // Check if valid payment exists (within 3 days)
    if (paymentTimestamp && (now - paymentTimestamp) / (1000 * 60 * 60 * 24) <= 3) {
        onSuccess();
        return;
    }

    pendingPaymentCallback = onSuccess;
    document.getElementById('payment-modal').classList.add('show');
}

// Boot
init();
