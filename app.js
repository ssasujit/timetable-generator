// State Management
let state = {
    settings: {
        periods: 8,
        schoolName: '',
        year: ''
    },
    subjectRules: [], // { id, name, periods, std }
    teacherRules: [], // { id, name, charge, classes: [{std, subj}] }
    tempTeacherClasses: [] // Used while filling the form
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
    outTeacherSelect: document.getElementById('output-teacher-select')
};

function init() {
    const saved = localStorage.getItem('timetable_dashboard_state');
    if (saved) {
        try {
            state = JSON.parse(saved);
            // reset temp on load
            state.tempTeacherClasses = [];
        } catch(e) {}
    }
    
    // Bind settings
    els.periods.value = state.settings.periods || 8;
    els.school.value = state.settings.schoolName || '';
    els.year.value = state.settings.year || '';
    
    // Listeners
    els.periods.addEventListener('change', e => updateSetting('periods', parseInt(e.target.value)));
    els.school.addEventListener('change', e => updateSetting('schoolName', e.target.value));
    els.year.addEventListener('change', e => updateSetting('year', e.target.value));
    
    document.getElementById('add-subject-rule').onclick = addSubjectRule;
    document.getElementById('add-teacher-class').onclick = addTempTeacherClass;
    document.getElementById('add-teacher-rule').onclick = addTeacherRule;
    
    document.getElementById('btn-class-pdf').onclick = () => triggerPayment(() => exportPDF('class'));
    document.getElementById('btn-teacher-pdf').onclick = () => triggerPayment(() => exportPDF('teacher'));
    document.getElementById('btn-school-pdf').onclick = () => triggerPayment(() => exportPDF('school'));

    renderAll();
}

function updateSetting(key, val) {
    state.settings[key] = val;
    save();
}

function save() {
    localStorage.setItem('timetable_dashboard_state', JSON.stringify(state));
}

function renderAll() {
    renderSubjects();
    renderTempTeacherClasses();
    renderTeachers();
    updateOutputSelects();
    updateChargeSelect();
    updateDataLists();
    if(window.lucide) lucide.createIcons();
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
        alert("Please fill Subject, Periods, and STD");
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
        alert("Teacher Name is required.");
        return;
    }
    if(state.tempTeacherClasses.length === 0 && !charge) {
        alert("Add some classes taken or a class charge.");
        return;
    }
    
    state.teacherRules.push({
        id: Date.now(),
        name,
        charge,
        classes: [...state.tempTeacherClasses]
    });
    
    save();
    
    els.teacherName.value = '';
    els.teacherCharge.value = '';
    state.tempTeacherClasses = [];
    renderAll();
}

function removeTeacher(id) {
    state.teacherRules = state.teacherRules.filter(t => t.id !== id);
    save();
    renderAll();
}

function renderTeachers() {
    els.teacherList.innerHTML = '';
    state.teacherRules.forEach(t => {
        const li = document.createElement('li');
        li.className = 'data-card';
        const classesTxt = t.classes.map(c => `${c.std}-${c.subj}`).join(', ') || 'None';
        
        li.innerHTML = `
            <h4>${t.name} <button class="btn-del" onclick="removeTeacher(${t.id})"><i data-lucide="trash-2" style="width:16px;"></i></button></h4>
            <div class="charge">Class Charge: ${t.charge || 'None'}</div>
            <p>Classes: ${classesTxt}</p>
        `;
        els.teacherList.appendChild(li);
    });
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

    state.teacherRules.forEach(t => {
        t.classes.forEach(c => {
            // find allotted periods
            let rule = state.subjectRules.find(r => r.std === c.std && r.name === c.subj);
            let pCount = rule ? parseInt(rule.periods) : 5; // default 5
            
            let key = `${t.name}_${c.std}_${c.subj}`;
            let alreadyPlaced = prePlacedCounts[key] || 0;
            let remaining = pCount - alreadyPlaced;
            
            for(let i=0; i<remaining; i++) {
                reqs.push({ teacher: t.name, std: c.std, subj: c.subj });
            }
        });
    });
    
    // Simple Greedy Placement
    // Iterate over requests, find first empty slot in both class and teacher timetable
    reqs.forEach(req => {
        let placed = false;
        for(let day of days) {
            if(placed) break;
            // Start from period 2 since period 1 might be reserved for class teacher
            for(let p=1; p<=state.settings.periods; p++) {
                if(!masterGrid[req.std][day][p] && !teacherGrid[req.teacher][day][p]) {
                    masterGrid[req.std][day][p] = `${req.subj} (${req.teacher})`;
                    teacherGrid[req.teacher][day][p] = `${req.std} (${req.subj})`;
                    placed = true;
                    break;
                }
            }
        }
        // Unplaced constraints will just be ignored in this greedy approach
    });
    
    return { masterGrid, teacherGrid, days, classes: Array.from(classes) };
}


// --- PDF Exporting ---
function exportPDF(type) {
    const { masterGrid, teacherGrid, days, classes } = generateTimetable();
    const { jsPDF } = window.jspdf;
    
    let docs = [];
    
    if (type === 'class') {
        const cls = els.outClassSelect.value;
        if(!cls) return alert("Select a class first!");
        docs.push(createPDFDoc(cls, 'Class', masterGrid[cls], days));
    } 
    else if (type === 'teacher') {
        const tchr = els.outTeacherSelect.value;
        if(!tchr) return alert("Select a teacher first!");
        docs.push(createPDFDoc(tchr, 'Teacher', teacherGrid[tchr], days));
    }
    else if (type === 'school') {
        if(classes.length === 0) return alert("No classes to generate!");
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        
        days.forEach((day, index) => {
            if (index > 0) doc.addPage();
            
            doc.setFontSize(22);
            doc.text(state.settings.schoolName || 'School Master Timetable', 14, 20);
            
            doc.setFontSize(16);
            doc.text(`Day: ${day} | Year: ${state.settings.year}`, 14, 30);
            
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
        
        doc.save(`Master_School_Timetable_${state.settings.year || 'Export'}.pdf`);
        return;
    }
    
    // Download individual PDF
    docs.forEach(doc => {
        doc.pdf.save(`Timetable_${doc.name}.pdf`);
    });
}

function createPDFDoc(name, titlePrefix, gridData, days) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFontSize(22);
    doc.text(state.settings.schoolName || 'School Timetable', 14, 20);
    
    doc.setFontSize(16);
    doc.text(`${titlePrefix}: ${name} | Year: ${state.settings.year}`, 14, 30);
    
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
function triggerPayment(onSuccess) {
    if (typeof window.Razorpay === 'undefined') {
        alert("Payment gateway failed to load. Please check your connection.");
        return;
    }

    var options = {
        "key": "YOUR_RAZORPAY_KEY_ID", // TODO: Replace with your actual Razorpay Key ID
        "amount": "5000", // Amount in paise (5000 paise = 50 INR)
        "currency": "INR",
        "name": "Timetable Generator",
        "description": "Timetable PDF Download",
        "image": "emblem.png",
        "handler": function (response){
            // On successful payment, proceed with download
            onSuccess();
        },
        "prefill": {
            "name": "Teacher",
            "email": "teacher@school.com"
        },
        "theme": {
            "color": "#8b5cf6"
        }
    };
    var rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response){
        alert("Payment Failed: " + response.error.description);
    });
    rzp.open();
}

// Boot
init();
