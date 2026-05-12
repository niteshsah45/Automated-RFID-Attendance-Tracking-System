import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, onValue, off, update, get, set } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyAy55XJnvoF3W0qaT4AZ5iWxkj-4CLFWFk",
  authDomain: "rfid-attendance-system-aabc3.firebaseapp.com",
  databaseURL: "https://rfid-attendance-system-aabc3-default-rtdb.firebaseio.com",
  projectId: "rfid-attendance-system-aabc3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
setPersistence(auth, browserSessionPersistence);

let studentsMap = {};
let previousKeys = [];
let detachAttendanceListener = null;
let currentSubject = "";

// --- AUTH STATE & INITIALIZATION ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('teacher-email').textContent = user.email; // Fix: Set Email

    // 1. Load All Students
    const stuSnap = await get(ref(db, 'students'));
    studentsMap = stuSnap.val() || {};

    // 2. Load Only Assigned Subjects
    loadAssignedSubjects(user.email);
    
    // 3. Listen to Active Session
    onValue(ref(db, 'activeSession'), (snap) => {
      const active = snap.val();
      if (active && active.status === "active") {
        document.getElementById('active-date').textContent = active.date;
        currentSubject = active.subject;
        document.getElementById('subject-select').value = active.subject;
        startAttendanceSync(active);
      }
    });
  } else {
    document.getElementById('login-card').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    generateLoginQR(); // Show QR on login screen
  }
});

// --- FILTERED SUBJECTS LOGIC ---
async function loadAssignedSubjects(email) {
  const teachersSnap = await get(ref(db, 'teachers'));
  const allSubjectsSnap = await get(ref(db, 'subjects'));
  const allSubjects = allSubjectsSnap.val() || {};
  
  let assignedIds = [];
  Object.values(teachersSnap.val() || {}).forEach(t => {
    if (t.email === email && t.subjects) assignedIds = Object.keys(t.subjects);
  });

  const select = document.getElementById('subject-select');
  select.innerHTML = assignedIds.map(id => 
    `<option value="${id}">${allSubjects[id]?.name || id}</option>`
  ).join('');
}

// --- ATTENDANCE & POPUP LOGIC ---
function startAttendanceSync(active) {
  if (detachAttendanceListener) detachAttendanceListener();
  previousKeys = [];
  
  const path = `attendance/${active.subject}/${active.date}_${active.sessionId}`;
  const callback = onValue(ref(db, path), (snap) => {
    const data = snap.val() || {};
    const currentKeys = Object.keys(data);

    if (currentKeys.length > previousKeys.length) {
      const newId = currentKeys.find(k => !previousKeys.includes(k));
      if (studentsMap[newId]) showPopup(newId, studentsMap[newId]);
    }
    previousKeys = currentKeys;
    renderTable(data, active.subject);
  });
  detachAttendanceListener = () => off(ref(db, path), 'value', callback);
}

function showPopup(id, student) {
  const overlay = document.getElementById('scan-overlay');
  document.getElementById('popup-student-name').textContent = student.name;
  document.getElementById('popup-student-id').textContent = `ID: ${id}`;
  document.getElementById('popup-student-image').src = student.image || "";
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('hidden'), 3500);
}

// --- STATS & TABLE UPDATE ---
async function renderTable(currentAttendance, subjectId) {
  const historySnap = await get(ref(db, `attendance/${subjectId}`));
  const history = historySnap.val() || {};
  const totalSessions = Object.keys(history).length;
  const globalTotals = {};

  Object.values(history).forEach(sess => {
    Object.keys(sess).forEach(id => globalTotals[id] = (globalTotals[id] || 0) + 1);
  });

  let presentCount = 0;
  const totalStudents = Object.keys(studentsMap).length;

  document.getElementById('students-body').innerHTML = Object.entries(studentsMap).map(([id, s]) => {
    const isPresent = currentAttendance[id];
    if (isPresent) presentCount++;
    const count = globalTotals[id] || 0;
    const pct = totalSessions > 0 ? ((count / totalSessions) * 100).toFixed(1) : 0;
    
    return `<tr class="${isPresent ? 'row-present' : ''}">
      <td>${id}</td><td>${s.name}</td>
      <td class="${isPresent ? 'status-present' : 'status-absent'}">${isPresent ? '✔' : '✖'}</td>
      <td>${isPresent?.time || '-'}</td><td>${count}/${totalSessions}</td><td>${pct}%</td>
    </tr>`;
  }).join('');

  // Fix: Update Top Counter Cards
  document.getElementById('total-students').textContent = totalStudents;
  document.getElementById('present-today').textContent = presentCount;
  document.getElementById('attendance-percent').textContent = 
    totalStudents > 0 ? ((presentCount / totalStudents) * 100).toFixed(1) + "%" : "0%";
}

// --- LOGOUT & SESSION MANAGEMENT ---
document.getElementById('logout-btn').onclick = async () => {
  if (confirm("End current session and Logout?")) {
    await update(ref(db, 'activeSession'), { status: "inactive" });
    signOut(auth);
  }
};

document.getElementById('subject-select').onchange = async (e) => {
  if (confirm("End current session and start new subject session?")) {
    const newSub = e.target.value;
    await set(ref(db, 'activeSession'), {
      subject: newSub,
      status: "active",
      date: new Date().toISOString().split('T')[0],
      sessionId: Date.now()
    });
  } else {
    e.target.value = currentSubject;
  }
};

function generateLoginQR() {
  const qrBox = document.getElementById("qr-box");
  if (qrBox) {
    qrBox.innerHTML = "";
    const url = `https://endearing-valkyrie-5f5b07.netlify.app/rfidstudent.html`;
    QRCode.toCanvas(url, { width: 150 }, (err, canvas) => {
      if (!err) qrBox.appendChild(canvas);
    });
  }
}