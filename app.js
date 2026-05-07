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
    editingTeacherId: null
};

// DOM Elements
const els = {
    periods: document.getElementById('setting-periods'),
    school: document.getElementById('setting-school'),
    year: document.getElementById('setting-year'),
    
    subjName: document.getElementById('subject-name'),
    subjPeriods: document.getElementById('subject-periods'),
    subjStd: document.getElementById('subject-std'),
    subjList: document.getElementById('subject-rule-list'),
    
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
    prefType: document.getElementById('pref-type'),
    prefDay: document.getElementById('pref-day'),
    prefPeriodSelect: document.getElementById('pref-period-select'),
    tempPrefList: document.getElementById('temp-pref-periods'),
    preferenceList: document.getElementById('preference-list')
};

function init() {
    const saved = localStorage.getItem('timetable_dashboard_state');
    if (saved) {
        try {
            state = JSON.parse(saved);
            // Ensure all arrays exist for backward compatibility
            state.subjectRules = state.subjectRules || [];
            state.teacherRules = state.teacherRules || [];
            state.preferences = state.preferences || [];
            state.settings = state.settings || { periods: 8, schoolName: '', year: '' };
            
            // reset temp on load
            state.tempTeacherClasses = [];
            state.tempPrefPeriods = [];
        } catch(e) {
            console.error("Failed to load state", e);
        }
    } else {
        // First time initialization
        state.preferences.push({
            id: Date.now(),
            subj: 'SV',
            type: 'specific',
            day: 'Friday',
            periods: [7]
        });
        save();
    }
    
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
    
    document.getElementById('btn-class-pdf').onclick = (e) => { e.preventDefault(); triggerPayment(() => exportPDF('class')); };
    document.getElementById('btn-teacher-pdf').onclick = (e) => { e.preventDefault(); triggerPayment(() => exportPDF('teacher')); };
    document.getElementById('btn-school-pdf').onclick = (e) => { e.preventDefault(); triggerPayment(() => exportPDF('school')); };

    renderAll();
}

function updateSetting(key, val) {
    state.settings[key] = val;
    save();
    renderAll();
}

function save() {
    localStorage.setItem('timetable_dashboard_state', JSON.stringify(state));
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
        updatePrefSubjectSelect();
        updatePrefPeriodOptions();
        updateDataLists();
        renderSummaryTable();
        if(window.lucide) lucide.createIcons();
    } catch(e) {
        console.error("Rendering error", e);
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

// --- Subject Rules ---
function addSubjectRule() {
    const name = els.subjName.value.trim();
    const periods = parseInt(els.subjPeriods.value);
    const stdRaw = els.subjStd.value.trim();
    
    if(!name || !periods || !stdRaw) {
        showToast("Please fill Subject, Periods, and STD");
        return;
    }
    
    const stds = stdRaw.split(',').map(s => s.trim()).filter(s => s);
    stds.forEach(std => {
        state.subjectRules.push({ id: Date.now() + Math.random(), name, periods, std });
    });
    
    save();
    
    els.subjName.value = '';
    els.subjPeriods.value = 5;
    els.subjStd.value = '';
    renderAll();
}

function removeSubject(id) {
    state.subjectRules = state.subjectRules.filter(r => r.id !== id);
    save();
    renderAll();
}
window.removeSubject = removeSubject;

function renderSubjects() {
    els.subjList.innerHTML = '';
    state.subjectRules.forEach(r => {
        const li = document.createElement('li');
        li.className = 'tag';
        li.innerHTML = `${r.std} - ${r.name} (${r.periods} periods) <button onclick="removeSubject(${r.id})"><i data-lucide="x" style="width:14px;height:14px;"></i></button>`;
        els.subjList.appendChild(li);
    });
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
    const periods = [...state.tempPrefPeriods];
    
    if (!subj) return showToast("Select a subject first.");
    if (type !== 'specific' && periods.length === 0) return showToast("Add at least one period.");
    if (type === 'specific' && (day === 'any' || periods.length !== 1)) return showToast("Select a specific Day and exactly ONE Period.");
    
    state.preferences.push({
        id: Date.now(),
        subj, type, day, periods
    });
    
    save();
    state.tempPrefPeriods = [];
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
    if (state.teacherRules.length === 0) {
        els.summaryContainer.innerHTML = '';
        return;
    }
    
    let html = `
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
    
    els.outClassSelect.innerHTML = '<option value="">-- Select --</option>' + 
        Array.from(classes).map(c => `<option value="${c}">${c}</option>`).join('');
        
    els.outTeacherSelect.innerHTML = '<option value="">-- Select --</option>' + 
        Array.from(teachers).map(t => `<option value="${t}">${t}</option>`).join('');
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
                if (specificPref) {
                    specificReqs.push({ ...req, specific: specificPref });
                } else {
                    otherReqs.push(req);
                }
            }
        });
    });

    // Helper to place a requirement
    const tryPlace = (req, useSpread) => {
        const rules = state.preferences.filter(p => p.subj === req.subj && p.type !== 'specific');
        for(let day of days) {
            if (useSpread) {
                const alreadyHasSubj = Object.values(masterGrid[req.std][day]).some(val => val.startsWith(req.subj));
                if (alreadyHasSubj) continue;
            }
            for(let p=1; p<=state.settings.periods; p++) {
                // Check general rules
                let isAllowed = true;
                rules.forEach(rule => {
                    if (rule.day !== 'any' && rule.day !== day) return;
                    if (rule.type === 'allowed' && !rule.periods.includes(p)) isAllowed = false;
                    if (rule.type === 'not_allowed' && rule.periods.includes(p)) isAllowed = false;
                });
                if (!isAllowed) continue;

                if(!masterGrid[req.std][day][p] && !teacherGrid[req.teacher][day][p]) {
                    masterGrid[req.std][day][p] = `${req.subj} (${req.teacher})`;
                    teacherGrid[req.teacher][day][p] = `${req.std} (${req.subj})`;
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

    // 2. Split otherReqs into Pass 1 (Spread) and Pass 2 (Overflow)
    let spreadReqs = [];
    let overflowReqs = [];
    let tripleCounts = {}; // Track how many of this triple we are trying to place

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
        docs.push(createPDFDoc(cls, 'Class', masterGrid[cls], days));
    } 
    else if (type === 'teacher') {
        const tchr = els.outTeacherSelect.value;
        if(!tchr) return showToast("Select a teacher first!");
        docs.push(createPDFDoc(tchr, 'Teacher', teacherGrid[tchr], days));
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
    docs.forEach(doc => {
        const safeName = doc.name.replace(/[^a-z0-9]/gi, '_');
        doc.pdf.save(`Timetable_${safeName}.pdf`);
    });
}

function createPDFDoc(name, titlePrefix, gridData, days) {
    const doc = new jsPDF('l', 'mm', 'a4');
    const schoolName = state.settings.schoolName || 'School Timetable';
    const year = state.settings.year || '2026';
    
    doc.setFontSize(22);
    doc.text(schoolName, 14, 20);
    
    doc.setFontSize(16);
    doc.text(`${titlePrefix}: ${name} | Year: ${year}`, 14, 30);
    
    const body = [];
    days.forEach(day => {
        let row = [day];
        for(let p=1; p<=state.settings.periods; p++) {
            row.push(gridData[day][p] || '-');
        }
        body.push(row);
    });
    
    let headRow = ['Day'];
    for(let p=1; p<=state.settings.periods; p++) {
        headRow.push(`Period ${p}`);
    }
    
    doc.autoTable({
        startY: 40,
        head: [headRow],
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [139, 92, 246] },
        styles: { fontSize: 10, cellPadding: 4, halign: 'center' }
    });
    
    return { pdf: doc, name };
}


// --- Payment Integration ---
let pendingPaymentCallback = null;

function triggerPayment(onSuccess) {
    pendingPaymentCallback = onSuccess;
    document.getElementById('payment-modal').classList.add('show');
}

document.getElementById('btn-cancel-payment').onclick = () => {
    document.getElementById('payment-modal').classList.remove('show');
    pendingPaymentCallback = null;
};

document.getElementById('btn-confirm-payment').onclick = () => {
    document.getElementById('payment-modal').classList.remove('show');
    if (pendingPaymentCallback) {
        pendingPaymentCallback();
        pendingPaymentCallback = null;
    }
};

// Boot
init();
