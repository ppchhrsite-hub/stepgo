// StepGo - Pedometer Application Core JavaScript (Module Mode with Firebase)

// Import Firebase SDKs from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, set, update, onValue } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// Firebase Configuration
// * คุณสามารถสมัครบัญชี Firebase (ฟรี) แล้วนำคีย์ของคุณมาใส่ที่นี่เพื่อเปิดใช้งานกระดานคะแนนออนไลน์
const firebaseConfig = {
    apiKey: "AIzaSyDz-qZtQNDM2vGJPPFRPqWjh-1NcPSqCC8",
    authDomain: "stepgo-8eea8.firebaseapp.com",
    databaseURL: "https://stepgo-8eea8-default-rtdb.firebaseio.com",
    projectId: "stepgo-8eea8",
    storageBucket: "stepgo-8eea8.firebasestorage.app",
    messagingSenderId: "153104576614",
    appId: "1:153104576614:web:83f7ce06fed67cd433bda7",
    measurementId: "G-MRZEX3VDBT"
};

let db = null;
let firebaseActive = false;

// Initialize Firebase if configured
if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    try {
        const firebaseApp = initializeApp(firebaseConfig);
        db = getDatabase(firebaseApp);
        firebaseActive = true;
        console.log("Firebase Realtime Database initialized successfully!");
    } catch (error) {
        console.error("Failed to initialize Firebase:", error);
    }
} else {
    console.warn("Using Local Demo Mode. Configure Firebase to enable online leaderboard.");
}

// App State
const state = {
    userId: null,
    nickname: "",
    department: "",
    steps: 0,
    goal: 10000,
    weight: 65,    // kg
    stride: 70,    // cm
    isTracking: false,
    startTime: null,
    elapsedSeconds: 0,
    history: {},   // format: { "YYYY-MM-DD": steps }
};

// Sync controls
let stepsSinceLastSync = 0;
let lastSyncTime = 0;
const SYNC_STEP_INTERVAL = 10; // Sync to DB every 10 steps
const SYNC_TIME_INTERVAL = 15000; // Sync to DB every 15 seconds if steps changed

// Timer handle
let timerInterval = null;

// Sensor variables
let motionListenerActive = false;
let wakeLock = null;

// Step Detection Algorithm Parameters
const FILTER_ALPHA = 0.2; // Low-pass filter smoothing factor
let smoothedAcceleration = 9.8;
let lastStepTime = 0;
const STEP_COOLDOWN = 330; // Min time between steps (ms)
const STEP_THRESHOLD = 1.05; // Peak threshold factor above gravity
const VALLEY_THRESHOLD = 0.95; // Valley reset threshold factor
let isAboveThreshold = false;

// DOM Elements
const elements = {
    userName: document.querySelector('.user-name'),
    stepCount: document.getElementById('step-count'),
    goalValue: document.getElementById('goal-value'),
    caloriesBurned: document.getElementById('calories-burned'),
    distanceWalked: document.getElementById('distance-walked'),
    activeTime: document.getElementById('active-time'),
    btnToggleTracking: document.getElementById('btn-toggle-tracking'),
    btnSettings: document.getElementById('btn-settings'),
    btnRequestPermission: document.getElementById('btn-request-permission'),
    sensorPermissionCard: document.getElementById('sensor-permission-card'),
    sensorStatus: document.getElementById('sensor-status'),
    settingsModal: document.getElementById('settings-modal'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    historyChart: document.getElementById('history-chart'),
    btnClearHistory: document.getElementById('btn-clear-history'),
    
    // Registration Modal
    registerModal: document.getElementById('register-modal'),
    inputRegisterNickname: document.getElementById('input-register-nickname'),
    inputRegisterDept: document.getElementById('input-register-dept'),
    btnRegisterSubmit: document.getElementById('btn-register-submit'),
    
    // Leaderboard
    activeUsersCount: document.getElementById('active-users-count'),
    leaderboardList: document.getElementById('leaderboard-list'),

    // Inputs
    inputGoal: document.getElementById('input-goal'),
    inputWeight: document.getElementById('input-weight'),
    inputStride: document.getElementById('input-stride'),
    
    // Simulator
    simulatorToggle: document.getElementById('simulator-toggle'),
    simulatorBody: document.getElementById('simulator-body'),
    btnSimStep: document.getElementById('btn-sim-step'),
    btnSimMulti: document.getElementById('btn-sim-multi'),
    btnSimShake: document.getElementById('btn-sim-shake'),
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    lucide.createIcons();
    
    // Load local settings & history
    loadSettings();
    loadHistory();
    loadTodaySteps();
    
    // Setup Event Listeners
    setupEventListeners();
    
    // Check User Profile (Register Overlay)
    checkUserRegistration();
    
    // Check if Motion sensor is supported
    checkSensorAvailability();
});

// Event Listeners Setup
function setupEventListeners() {
    // Tracking toggle button
    elements.btnToggleTracking.addEventListener('click', toggleTracking);
    
    // Permission request button (for iOS support)
    elements.btnRequestPermission.addEventListener('click', requestSensorPermission);
    
    // Settings modal interactions
    elements.btnSettings.addEventListener('click', openSettings);
    elements.btnCloseSettings.addEventListener('click', closeSettings);
    elements.btnSaveSettings.addEventListener('click', saveSettings);
    
    // Registration button
    elements.btnRegisterSubmit.addEventListener('click', registerUser);
    
    // Clear history
    elements.btnClearHistory.addEventListener('click', clearHistory);
    
    // Simulator collapsible toggle
    elements.simulatorToggle.addEventListener('click', () => {
        elements.simulatorBody.classList.toggle('hidden');
    });
    
    // Simulator buttons
    elements.btnSimStep.addEventListener('click', () => simulateSteps(1));
    elements.btnSimMulti.addEventListener('click', () => simulateSteps(50));
    elements.btnSimShake.addEventListener('click', () => {
        simulateSteps(1);
        showToast('📱 จำลองการสั่นสะเทือนสำเร็จ!');
    });
    
    // Close modal on click outside
    window.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            closeSettings();
        }
    });
}

// ----------------------------------------------------
// User Registration & Welcome overlay
// ----------------------------------------------------

function checkUserRegistration() {
    const savedProfile = localStorage.getItem('stepgo_profile');
    
    if (savedProfile) {
        try {
            const profile = JSON.parse(savedProfile);
            state.userId = profile.userId;
            state.nickname = profile.nickname;
            state.department = profile.department || "ทั่วไป";
            
            // Show user profile in UI
            elements.userName.innerText = `${state.nickname} (${state.department})`;
            
            // Start leaderboard updates
            initLeaderboard();
        } catch (e) {
            // Error parsing profile, trigger registration
            elements.registerModal.classList.remove('hidden');
        }
    } else {
        // Show registration overlay
        elements.registerModal.classList.remove('hidden');
    }
}

function registerUser() {
    const nickname = elements.inputRegisterNickname.value.trim();
    const department = elements.inputRegisterDept.value.trim() || "ทั่วไป";
    
    if (nickname.length < 2) {
        showToast('⚠️ ชื่อเล่นควรมีอย่างน้อย 2 ตัวอักษร');
        return;
    }
    
    // Create random user ID
    const randomId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    
    state.userId = randomId;
    state.nickname = nickname;
    state.department = department;
    
    // Save locally
    const profile = { userId: randomId, nickname, department };
    localStorage.setItem('stepgo_profile', JSON.stringify(profile));
    
    // Update display
    elements.userName.innerText = `${state.nickname} (${state.department})`;
    
    // Hide overlay
    elements.registerModal.classList.add('hidden');
    showToast('👋 ลงทะเบียนสำเร็จ! ก้าวไปด้วยกันเลย');
    
    // Sync newly created user details to Firebase (if active)
    if (firebaseActive) {
        set(ref(db, 'users/' + state.userId), {
            nickname: state.nickname,
            department: state.department,
            steps: state.steps,
            lastActive: Date.now()
        });
    }
    
    // Start leaderboard updates
    initLeaderboard();
}

// ----------------------------------------------------
// Firebase Realtime Leaderboard
// ----------------------------------------------------

function initLeaderboard() {
    if (firebaseActive) {
        // Listen to updates from all users
        const usersRef = ref(db, 'users');
        onValue(usersRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;
            
            const userList = [];
            const now = Date.now();
            let activeCount = 0;
            
            for (let id in data) {
                const user = data[id];
                user.id = id;
                userList.push(user);
                
                // Count active users in last 10 minutes
                if (user.lastActive && (now - user.lastActive < 10 * 60 * 1000)) {
                    activeCount++;
                }
            }
            
            // Sort by steps descending
            userList.sort((a, b) => b.steps - a.steps);
            
            // Update active users badge
            elements.activeUsersCount.innerText = `แข่งสดอยู่ ${activeCount} คน`;
            
            // Render leaderboard rows
            renderLeaderboardUI(userList);
        });
        
        // Initial push of today's steps to database
        syncStepsToFirebase();
    } else {
        // Mock Leaderboard for Local Demo Mode
        renderMockLeaderboard();
        
        // Periodic refresh of mock board to update current user steps
        setInterval(renderMockLeaderboard, 4000);
    }
}

function syncStepsToFirebase() {
    if (!firebaseActive || !state.userId) return;
    
    update(ref(db, 'users/' + state.userId), {
        steps: state.steps,
        lastActive: Date.now()
    }).then(() => {
        console.log("Steps synced successfully:", state.steps);
    }).catch(err => {
        console.error("Error syncing steps to Firebase:", err);
    });
}

function renderLeaderboardUI(users) {
    elements.leaderboardList.innerHTML = '';
    
    if (users.length === 0) {
        elements.leaderboardList.innerHTML = '<div class="chart-placeholder">ไม่มีข้อมูลการจัดอันดับ</div>';
        return;
    }
    
    // Limit to top 15 users for visual performance
    const displayUsers = users.slice(0, 15);
    
    displayUsers.forEach((user, index) => {
        const isSelf = user.id === state.userId;
        const rank = index + 1;
        
        const row = document.createElement('div');
        row.className = `leaderboard-item ${isSelf ? 'self' : ''}`;
        
        row.innerHTML = `
            <div class="leaderboard-left">
                <div class="leaderboard-rank-circle">${rank}</div>
                <div class="leaderboard-user-info">
                    <span class="leaderboard-user-name">${user.nickname}</span>
                    <span class="leaderboard-user-dept">${user.department || 'ทั่วไป'}</span>
                </div>
            </div>
            <div class="leaderboard-right">
                <span class="leaderboard-item-steps">${user.steps.toLocaleString()}</span>
                <span class="leaderboard-item-unit">ก้าว</span>
            </div>
        `;
        
        elements.leaderboardList.appendChild(row);
    });
}

function renderMockLeaderboard() {
    const mockUsers = [
        { id: 'mock_1', nickname: 'พี่เอก (ก้าวบิน)', department: 'ฝ่ายขาย', steps: 12450, lastActive: Date.now() },
        { id: 'mock_2', nickname: 'น้องส้ม (ก้าวเร็ว)', department: 'ฝ่ายการตลาด', steps: 8920, lastActive: Date.now() },
        { id: 'mock_3', nickname: 'ก้าวเงียบ', department: 'ฝ่ายบัญชี', steps: 4890, lastActive: Date.now() },
        { id: state.userId || 'self', nickname: state.nickname || 'คุณ (นักเดินทาง)', department: state.department || 'ทั่วไป', steps: state.steps, lastActive: Date.now() }
    ];
    
    // Sort descending
    mockUsers.sort((a, b) => b.steps - a.steps);
    
    elements.activeUsersCount.innerText = `โหมดสาธิต (4 คน)`;
    renderLeaderboardUI(mockUsers);
}

// ----------------------------------------------------
// Pedometer Core Logic & Sensor
// ----------------------------------------------------

function checkSensorAvailability() {
    const isSupported = typeof DeviceMotionEvent !== 'undefined';
    
    if (!isSupported) {
        updateSensorStatus('error', 'เบราว์เซอร์ไม่รองรับเซ็นเซอร์ (ใช้จำลองได้)');
        return;
    }
    
    // Check if permission is needed (mainly iOS 13+)
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        elements.sensorPermissionCard.classList.remove('hidden');
        updateSensorStatus('inactive', 'ต้องขอสิทธิ์เข้าใช้งานเซ็นเซอร์ (iOS)');
    } else {
        updateSensorStatus('inactive', 'พร้อมเชื่อมต่อเซ็นเซอร์');
    }
}

async function requestSensorPermission() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permissionState = await DeviceMotionEvent.requestPermission();
            if (permissionState === 'granted') {
                elements.sensorPermissionCard.classList.add('hidden');
                updateSensorStatus('inactive', 'อนุญาตใช้งานเซ็นเซอร์แล้ว');
                showToast('🔑 ได้รับสิทธิ์เซ็นเซอร์เรียบร้อย!');
            } else {
                updateSensorStatus('error', 'ถูกปฏิเสธการใช้เซ็นเซอร์');
                showToast('❌ ไม่ได้รับสิทธิ์เข้าใช้งานเซ็นเซอร์');
            }
        } catch (error) {
            console.error('Permission request error:', error);
            showToast('⚠️ เกิดข้อผิดพลาดในการขอสิทธิ์');
        }
    }
}

async function startMotionTracking() {
    if (motionListenerActive) return;
    
    const startListener = () => {
        window.addEventListener('devicemotion', handleDeviceMotion);
        motionListenerActive = true;
        updateSensorStatus('active', 'กำลังนับก้าวด้วยเซ็นเซอร์จริง');
        requestWakeLock();
    };

    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permissionState = await DeviceMotionEvent.requestPermission();
            if (permissionState === 'granted') {
                startListener();
            } else {
                updateSensorStatus('error', 'ไม่ได้ขอสิทธิ์เซ็นเซอร์');
                showToast('⚠️ กรุณากดปุ่มขอสิทธิ์เซ็นเซอร์ก่อน');
                return false;
            }
        } catch (e) {
            updateSensorStatus('error', 'เซ็นเซอร์ผิดพลาด');
            return false;
        }
    } else if (typeof DeviceMotionEvent !== 'undefined') {
        startListener();
    } else {
        updateSensorStatus('inactive', 'นับก้าวผ่านการจำลอง (Simulator)');
        return true;
    }
    
    return true;
}

function stopMotionTracking() {
    if (!motionListenerActive) return;
    
    window.removeEventListener('devicemotion', handleDeviceMotion);
    motionListenerActive = false;
    updateSensorStatus('inactive', 'หยุดนับก้าวอยู่');
    releaseWakeLock();
}

function handleDeviceMotion(event) {
    let acc = event.accelerationIncludingGravity;
    if (!acc || acc.x === null) {
        acc = event.acceleration;
    }
    
    if (!acc || acc.x === null) return;
    
    const x = acc.x;
    const y = acc.y;
    const z = acc.z;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    
    smoothedAcceleration = FILTER_ALPHA * magnitude + (1 - FILTER_ALPHA) * smoothedAcceleration;
    
    const now = Date.now();
    const peakThresh = 9.8 * STEP_THRESHOLD;
    const valleyThresh = 9.8 * VALLEY_THRESHOLD;
    
    if (smoothedAcceleration > peakThresh && !isAboveThreshold) {
        if (now - lastStepTime > STEP_COOLDOWN) {
            isAboveThreshold = true;
            lastStepTime = now;
            addStep(1);
        }
    } else if (smoothedAcceleration < valleyThresh) {
        isAboveThreshold = false;
    }
}

// ----------------------------------------------------
// UI and State Updates
// ----------------------------------------------------

function addStep(count) {
    state.steps += count;
    stepsSinceLastSync += count;
    
    // Save steps locally
    saveTodaySteps();
    
    // UI update
    updateDashboardUI();
    
    // Check auto sync requirements
    const now = Date.now();
    if (stepsSinceLastSync >= SYNC_STEP_INTERVAL || (now - lastSyncTime > SYNC_TIME_INTERVAL)) {
        syncStepsToFirebase();
        stepsSinceLastSync = 0;
        lastSyncTime = now;
    }
    
    if (state.steps === state.goal) {
        showToast('🎉 ยินดีด้วย! คุณเดินบรรลุเป้าหมายแล้ว!');
    }
}

function toggleTracking() {
    if (state.isTracking) {
        // Stop Tracking
        state.isTracking = false;
        stopMotionTracking();
        stopTimer();
        
        // Sync final steps of this session
        syncStepsToFirebase();
        
        // Update Button UI
        elements.btnToggleTracking.classList.remove('tracking');
        elements.btnToggleTracking.querySelector('.btn-text').innerText = 'เริ่มนับก้าวเดิน';
        elements.btnToggleTracking.querySelector('.btn-icon').setAttribute('data-lucide', 'play');
        lucide.createIcons();
        showToast('⏸️ หยุดนับก้าวชั่วคราว');
    } else {
        // Start Tracking
        state.isTracking = true;
        startMotionTracking().then(success => {
            if (success !== false) {
                startTimer();
                
                // Update Button UI
                elements.btnToggleTracking.classList.add('tracking');
                elements.btnToggleTracking.querySelector('.btn-text').innerText = 'หยุดชั่วคราว';
                elements.btnToggleTracking.querySelector('.btn-icon').setAttribute('data-lucide', 'pause');
                lucide.createIcons();
                showToast('🚀 เริ่มระบบนับก้าวเดินแล้ว');
            } else {
                state.isTracking = false;
            }
        });
    }
}

function updateDashboardUI() {
    elements.stepCount.innerText = state.steps.toLocaleString();
    elements.goalValue.innerText = state.goal.toLocaleString();
    
    const distanceKm = (state.steps * (state.stride / 100)) / 1000;
    elements.distanceWalked.innerText = distanceKm.toFixed(2);
    
    const calories = distanceKm * state.weight * 0.75;
    elements.caloriesBurned.innerText = Math.round(calories);
    
    const progressCircle = document.querySelector('.progress-ring__circle');
    const radius = progressCircle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    
    progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    
    const progressPercent = Math.min((state.steps / state.goal) * 100, 100);
    const offset = circumference - (progressPercent / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
}

// ----------------------------------------------------
// Timer logic (Walk time)
// ----------------------------------------------------
function startTimer() {
    state.startTime = Date.now() - (state.elapsedSeconds * 1000);
    timerInterval = setInterval(() => {
        state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
        updateTimerUI();
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    localStorage.setItem('stepgo_elapsed_seconds', state.elapsedSeconds);
}

function updateTimerUI() {
    const mins = Math.floor(state.elapsedSeconds / 60);
    const secs = state.elapsedSeconds % 60;
    
    const pad = (num) => num.toString().padStart(2, '0');
    elements.activeTime.innerText = `${pad(mins)}:${pad(secs)}`;
}

// ----------------------------------------------------
// History & Charting
// ----------------------------------------------------

function getDayLabel(dateString) {
    const date = new Date(dateString);
    const daysThai = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    return daysThai[date.getDay()];
}

function getPast7Days() {
    const list = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        list.push(`${year}-${month}-${day}`);
    }
    return list;
}

function renderHistoryChart() {
    const past7Days = getPast7Days();
    elements.historyChart.innerHTML = '';
    
    let maxSteps = state.goal;
    past7Days.forEach(date => {
        const steps = state.history[date] || 0;
        if (steps > maxSteps) maxSteps = steps;
    });

    const todayStr = getTodayDateString();

    past7Days.forEach(date => {
        const steps = state.history[date] || 0;
        const dayLabel = getDayLabel(date);
        const isToday = date === todayStr;
        const heightPct = Math.max((steps / maxSteps) * 100, 2);
        
        const barWrapper = document.createElement('div');
        barWrapper.className = `chart-bar-wrapper ${isToday ? 'today' : ''}`;
        
        const barContainer = document.createElement('div');
        barContainer.className = 'chart-bar-container';
        barContainer.setAttribute('data-steps', `${steps.toLocaleString()} ก้าว`);
        
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = `${heightPct}%`;
        
        const label = document.createElement('div');
        label.className = 'chart-label';
        label.innerText = isToday ? 'วันนี้' : dayLabel;
        
        barContainer.appendChild(bar);
        barWrapper.appendChild(barContainer);
        barWrapper.appendChild(label);
        
        elements.historyChart.appendChild(barWrapper);
    });
}

function clearHistory() {
    if (confirm('คุณต้องการลบข้อมูลประวัติการเดินทั้งหมดหรือไม่?')) {
        state.history = {};
        state.steps = 0;
        state.elapsedSeconds = 0;
        
        const today = getTodayDateString();
        state.history[today] = 0;
        
        localStorage.removeItem('stepgo_history');
        localStorage.setItem('stepgo_steps', 0);
        localStorage.setItem('stepgo_elapsed_seconds', 0);
        
        updateDashboardUI();
        updateTimerUI();
        renderHistoryChart();
        syncStepsToFirebase();
        showToast('🗑️ ลบประวัติเรียบร้อยแล้ว');
    }
}

// ----------------------------------------------------
// LocalStorage Data Management
// ----------------------------------------------------

function getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function loadTodaySteps() {
    const savedDate = localStorage.getItem('stepgo_last_date');
    const today = getTodayDateString();
    
    if (savedDate === today) {
        state.steps = parseInt(localStorage.getItem('stepgo_steps')) || 0;
        state.elapsedSeconds = parseInt(localStorage.getItem('stepgo_elapsed_seconds')) || 0;
    } else {
        if (savedDate && savedDate !== '') {
            const lastSteps = parseInt(localStorage.getItem('stepgo_steps')) || 0;
            saveDayToHistory(savedDate, lastSteps);
        }
        
        state.steps = 0;
        state.elapsedSeconds = 0;
        localStorage.setItem('stepgo_last_date', today);
        localStorage.setItem('stepgo_steps', 0);
        localStorage.setItem('stepgo_elapsed_seconds', 0);
    }
    state.history[today] = state.steps;
    updateTimerUI();
}

function saveTodaySteps() {
    const today = getTodayDateString();
    localStorage.setItem('stepgo_last_date', today);
    localStorage.setItem('stepgo_steps', state.steps);
    
    state.history[today] = state.steps;
    localStorage.setItem('stepgo_history', JSON.stringify(state.history));
    renderHistoryChart();
}

function saveDayToHistory(dateString, steps) {
    state.history[dateString] = steps;
    localStorage.setItem('stepgo_history', JSON.stringify(state.history));
}

function loadHistory() {
    const savedHistory = localStorage.getItem('stepgo_history');
    if (savedHistory) {
        try {
            state.history = JSON.parse(savedHistory);
        } catch (e) {
            state.history = {};
        }
    } else {
        state.history = {};
    }
}

function loadSettings() {
    state.goal = parseInt(localStorage.getItem('stepgo_goal')) || 10000;
    state.weight = parseInt(localStorage.getItem('stepgo_weight')) || 65;
    state.stride = parseInt(localStorage.getItem('stepgo_stride')) || 70;
    
    elements.inputGoal.value = state.goal;
    elements.inputWeight.value = state.weight;
    elements.inputStride.value = state.stride;
}

// Settings Action
function openSettings() {
    elements.settingsModal.classList.remove('hidden');
}

function closeSettings() {
    elements.settingsModal.classList.add('hidden');
}

function saveSettings() {
    const newGoal = parseInt(elements.inputGoal.value);
    const newWeight = parseInt(elements.inputWeight.value);
    const newStride = parseInt(elements.inputStride.value);
    
    if (isNaN(newGoal) || newGoal < 1000) {
        showToast('⚠️ กรุณาระบุเป้าหมายอย่างน้อย 1,000 ก้าว');
        return;
    }
    if (isNaN(newWeight) || newWeight < 20 || newWeight > 200) {
        showToast('⚠️ น้ำหนักตัวควรอยู่ระหว่าง 20 - 200 กก.');
        return;
    }
    if (isNaN(newStride) || newStride < 30 || newStride > 150) {
        showToast('⚠️ ความยาวก้าวควรอยู่ระหว่าง 30 - 150 ซม.');
        return;
    }
    
    state.goal = newGoal;
    state.weight = newWeight;
    state.stride = newStride;
    
    localStorage.setItem('stepgo_goal', state.goal);
    localStorage.setItem('stepgo_weight', state.weight);
    localStorage.setItem('stepgo_stride', state.stride);
    
    saveTodaySteps();
    updateDashboardUI();
    renderHistoryChart();
    syncStepsToFirebase();
    
    closeSettings();
    showToast('💾 บันทึกการตั้งค่าแล้ว');
}

// ----------------------------------------------------
// Helper Utilities
// ----------------------------------------------------

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock is active');
        } catch (err) {
            console.warn(`Wake Lock failed: ${err.message}`);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => {
            wakeLock = null;
            console.log('Screen Wake Lock released');
        });
    }
}

function updateSensorStatus(status, text) {
    elements.sensorStatus.className = `status-badge ${status}`;
    elements.sensorStatus.querySelector('.status-text').innerText = text;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.className = 'toast show';
    
    setTimeout(() => {
        toast.className = 'toast hidden';
    }, 2500);
}

function simulateSteps(count) {
    addStep(count);
    state.elapsedSeconds += Math.round(count * 1.2);
    updateTimerUI();
    if (!state.isTracking) {
        localStorage.setItem('stepgo_elapsed_seconds', state.elapsedSeconds);
    }
}

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully!', reg))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}
