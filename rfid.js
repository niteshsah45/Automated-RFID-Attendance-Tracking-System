import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, onValue, off, update, get } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    
    // Load Students & Subjects
    const [subSnap, stuSnap] = await Promise.all([get(ref(db, 'subjects')), get(ref(db, 'students'))]);
    studentsMap = stuSnap.val() || {};
    
    const select = document.getElementById('subject-select');
    select.innerHTML = Object.entries(subSnap.val() || {}).map(([id, d]) => `<option value="${id}">${d.name || id}</option>`).join('');

    // Listen to Session
    onValue(ref(db, 'activeSession'), (snap) => {
      const active = snap.val();
      if (active && active.status === "active") {
        document.getElementById('active-date').textContent = active.date;
        select.value = active.subject;
        startAttendanceSync(active);
      }
    });
  } else {
    document.getElementById('login-card').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
  }
});

function startAttendanceSync(active) {
  if (detachAttendanceListener) detachAttendanceListener();
  previousKeys = []; // Reset tracker for new session
  
  const path = `attendance/${active.subject}/${active.date}_${active.sessionId}`;
  const callback = onValue(ref(db, path), (snap) => {
    const data = snap.val() || {};
    const currentKeys = Object.keys(data);

    if (currentKeys.length > previousKeys.length) {
      const newId = currentKeys.find(k => !previousKeys.includes(k));
      const student = studentsMap[newId];
      if (student) {
        showPopup(newId, student);
      }
    }
    previousKeys = currentKeys;
    updateTable(data, active.subject);
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

async function updateTable(current, subject) {
  const historySnap = await get(ref(db, `attendance/${subject}`));
  const history = historySnap.val() || {};
  const totalSess = Object.keys(history).length;
  const totals = {};
  Object.values(history).forEach(s => Object.keys(s).forEach(id => totals[id] = (totals[id] || 0) + 1));

  document.getElementById('students-body').innerHTML = Object.entries(studentsMap).map(([id, s]) => {
    const isPresent = current[id];
    const count = totals[id] || 0;
    const pct = totalSess > 0 ? ((count / totalSess) * 100).toFixed(1) : 0;
    return `<tr><td>${id}</td><td>${s.name}</td><td style="color:${isPresent?'green':'red'}">${isPresent?'✔':'✖'}</td><td>${isPresent?.time || '-'}</td><td>${count}/${totalSess}</td><td>${pct}%</td></tr>`;
  }).join('');
}

document.getElementById('login-form').onsubmit = (e) => {
  e.preventDefault();
  signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
};

document.getElementById('logout-btn').onclick = async () => {
  await update(ref(db, 'activeSession'), { status: "inactive" });
  signOut(auth);
};