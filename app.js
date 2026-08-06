// StepGo - Pedometer Application Core JavaScript (Module Mode with Firebase)

// Import Firebase SDKs from CDN
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, set, update, onValue, get, child } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// Firebase Configuration
// * คุณสามารถสมัครบัญชี Firebase (ฟรี) แล้วนำคีย์ของคุณมาใส่ที่นี่เพื่อเปิดใช้งานกระดานคะแนนออนไลน์
const firebaseConfig = {
    apiKey: "AIzaSyDz-qZtQNDM2vGJPPFRPqWjh-1NcPSqCC8",
    authDomain: "stepgo-8eea8.firebaseapp.com",
    databaseURL: "https://stepgo-8eea8-default-rtdb.asia-southeast1.firebasedatabase.app",
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
    myApprovals: [], // Array of approval IDs submitted by user
};

// Sync controls
let stepsSinceLastSync = 0;
let lastSyncTime = 0;
const SYNC_STEP_INTERVAL = 10;
const SYNC_TIME_INTERVAL = 15000;

// Timer handle
let timerInterval = null;

// Sensor variables
let motionListenerActive = false;
let wakeLock = null;

// Step Detection Algorithm Parameters
const FILTER_ALPHA = 0.2;
let smoothedAcceleration = 9.8;
let lastStepTime = 0;
const STEP_COOLDOWN = 330;
const STEP_THRESHOLD = 1.05;
const VALLEY_THRESHOLD = 0.95;
let isAboveThreshold = false;

// Google Fit Integration Variables
let googleTokenClient = null;
let googleAccessToken = null;
const GOOGLE_CLIENT_ID = "869780292236-7q5o3qet1rsbbjn0fe87s8gpd0u042sv.apps.googleusercontent.com"; // User can configure in Google Cloud Console

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

    // Settings Inputs
    inputGoal: document.getElementById('input-goal'),
    inputWeight: document.getElementById('input-weight'),
    inputStride: document.getElementById('input-stride'),
    
    // Simulator
    simulatorToggle: document.getElementById('simulator-toggle'),
    simulatorBody: document.getElementById('simulator-body'),
    btnSimStep: document.getElementById('btn-sim-step'),
    btnSimMulti: document.getElementById('btn-sim-multi'),
    btnSimShake: document.getElementById('btn-sim-shake'),

    // Tab Navigation
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanels: document.querySelectorAll('.tab-content-panel'),

    // Google Fit
    fitConnStatus: document.getElementById('fit-conn-status'),
    btnFitConnect: document.getElementById('btn-fit-connect'),
    btnFitDisconnect: document.getElementById('btn-fit-disconnect'),
    btnFitSync: document.getElementById('btn-fit-sync'),

    // Screenshot Upload
    formUploadSteps: document.getElementById('form-upload-steps'),
    inputUploadSteps: document.getElementById('input-upload-steps'),
    inputUploadDate: document.getElementById('input-upload-date'),
    inputUploadFile: document.getElementById('input-upload-file'),
    fileDropzone: document.getElementById('file-dropzone'),
    previewContainer: document.getElementById('preview-container'),
    imagePreview: document.getElementById('image-preview'),
    btnClearPreview: document.getElementById('btn-clear-preview'),
    myApprovalsList: document.getElementById('my-approvals-list'),

    // Admin Panel
    adminAuthCard: document.getElementById('admin-auth-card'),
    inputAdminPassword: document.getElementById('input-admin-password'),
    btnAdminLogin: document.getElementById('btn-admin-login'),
    btnAdminLogout: document.getElementById('btn-admin-logout'),
    adminDashboardView: document.getElementById('admin-dashboard-view'),
    adminPendingList: document.getElementById('admin-pending-list'),
};

// Admin Session State
let isAdminAuthenticated = false;
let uploadedImageBase64 = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    lucide.createIcons();
    
    // Load local settings & history
    loadSettings();
    loadHistory();
    loadTodaySteps();
    loadMyApprovals();
    
    // Setup Event Listeners
    setupEventListeners();
    
    // Check User Profile (Register Overlay)
    checkUserRegistration();
    
    // Check if Motion sensor is supported
    checkSensorAvailability();

    // Set today's date in upload form
    elements.inputUploadDate.value = getTodayDateString();

    // Check Google Fit cached token
    checkGoogleFitToken();

    // Initialize Google Fit Token Client (if SDK loaded)
    setTimeout(initGoogleFitAuth, 1000);
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
    
    // Tab Navigation setup
    elements.tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Google Fit Connect & Sync
    elements.btnFitConnect.addEventListener('click', connectGoogleFit);
    elements.btnFitDisconnect.addEventListener('click', disconnectGoogleFit);
    elements.btnFitSync.addEventListener('click', syncGoogleFitSteps);

    // Screenshot file upload handlers
    elements.inputUploadFile.addEventListener('change', handleFileSelect);
    elements.btnClearPreview.addEventListener('click', clearImagePreview);
    elements.formUploadSteps.addEventListener('submit', handleUploadSubmit);

    // Admin login / logout
    elements.btnAdminLogin.addEventListener('click', handleAdminLogin);
    elements.btnAdminLogout.addEventListener('click', handleAdminLogout);

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
// Tab Navigation Controller
// ----------------------------------------------------

function switchTab(tabId) {
    // Update buttons
    elements.tabButtons.forEach(btn => {
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update panels
    elements.tabPanels.forEach(panel => {
        if (panel.id === tabId) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });

    // Run actions based on tab entering
    if (tabId === 'tab-admin' && isAdminAuthenticated) {
        listenToPendingApprovals();
    }
    if (tabId === 'tab-upload') {
        renderMyApprovalsList();
    }
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
            elements.registerModal.classList.remove('hidden');
        }
    } else {
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
    
    const randomId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    state.userId = randomId;
    state.nickname = nickname;
    state.department = department;
    
    const profile = { userId: randomId, nickname, department };
    localStorage.setItem('stepgo_profile', JSON.stringify(profile));
    
    elements.userName.innerText = `${state.nickname} (${state.department})`;
    elements.registerModal.classList.add('hidden');
    showToast('👋 ลงทะเบียนสำเร็จ! ก้าวไปด้วยกันเลย');
    
    if (firebaseActive) {
        set(ref(db, 'users/' + state.userId), {
            nickname: state.nickname,
            department: state.department,
            steps: state.steps,
            lastActive: Date.now()
        });
    }
    
    initLeaderboard();
}

// ----------------------------------------------------
// Firebase Realtime Leaderboard
// ----------------------------------------------------

function initLeaderboard() {
    if (firebaseActive) {
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
                
                if (user.lastActive && (now - user.lastActive < 10 * 60 * 1000)) {
                    activeCount++;
                }
            }
            
            userList.sort((a, b) => b.steps - a.steps);
            elements.activeUsersCount.innerText = `แข่งสดอยู่ ${activeCount} คน`;
            renderLeaderboardUI(userList);
        });
        
        syncStepsToFirebase();
    } else {
        renderMockLeaderboard();
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
        console.error("Error syncing steps:", err);
    });
}

function renderLeaderboardUI(users) {
    elements.leaderboardList.innerHTML = '';
    
    if (users.length === 0) {
        elements.leaderboardList.innerHTML = '<div class="chart-placeholder">ไม่มีข้อมูลการจัดอันดับ</div>';
        return;
    }
    
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
    
    mockUsers.sort((a, b) => b.steps - a.steps);
    elements.activeUsersCount.innerText = `โหมดสาธิต (4 คน)`;
    renderLeaderboardUI(mockUsers);
}

// ----------------------------------------------------
// Google Fit Integration
// ----------------------------------------------------

function initGoogleFitAuth() {
    if (typeof google === 'undefined') {
        console.log("Waiting for Google Identity Services SDK to load...");
        return;
    }
    
    try {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/fitness.activity.read',
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    googleAccessToken = tokenResponse.access_token;
                    localStorage.setItem('stepgo_google_token', googleAccessToken);
                    updateGoogleFitStatus(true);
                    showToast('🔓 เชื่อมต่อ Google Fit สำเร็จ!');
                    syncGoogleFitSteps();
                }
            },
        });
        console.log("Google Fit Token Client initialized.");
    } catch (e) {
        console.error("Error initializing Google Fit:", e);
    }
}

function checkGoogleFitToken() {
    const token = localStorage.getItem('stepgo_google_token');
    if (token) {
        googleAccessToken = token;
        updateGoogleFitStatus(true);
    } else {
        updateGoogleFitStatus(false);
    }
}

function updateGoogleFitStatus(isConnected) {
    const badge = elements.fitConnStatus;
    if (isConnected) {
        badge.className = "status-badge active";
        badge.querySelector('.status-text').innerText = "เชื่อมต่อแล้ว";
        elements.btnFitConnect.classList.add('hidden');
        elements.btnFitSync.classList.remove('hidden');
        elements.btnFitDisconnect.classList.remove('hidden');
    } else {
        badge.className = "status-badge inactive";
        badge.querySelector('.status-text').innerText = "ยังไม่เชื่อมต่อ";
        elements.btnFitConnect.classList.remove('hidden');
        elements.btnFitSync.classList.add('hidden');
        elements.btnFitDisconnect.classList.add('hidden');
    }
}

function connectGoogleFit() {
    if (GOOGLE_CLIENT_ID === "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com") {
        showToast('⚠️ กรุณาตั้งค่า Google Client ID ในแอปก่อน');
        // We will prompt them that they can run it, but for demo we can mock connect too
        const mockAuth = confirm("ระบบกำลังอยู่ในโหมดจำลอง Client ID ต้องการเชื่อมต่อ Google Fit จำลองหรือไม่?");
        if (mockAuth) {
            googleAccessToken = "mock_token_" + Date.now();
            localStorage.setItem('stepgo_google_token', googleAccessToken);
            updateGoogleFitStatus(true);
            showToast('🔓 เชื่อมต่อ Google Fit จำลองสำเร็จ!');
        }
        return;
    }

    if (googleTokenClient) {
        googleTokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        showToast('⚠️ Google SDK ยังไม่พร้อมใช้งาน');
    }
}

function disconnectGoogleFit() {
    localStorage.removeItem('stepgo_google_token');
    googleAccessToken = null;
    updateGoogleFitStatus(false);
    showToast('🔌 ตัดการเชื่อมต่อ Google Fit แล้ว');
}

function syncGoogleFitSteps() {
    if (!googleAccessToken) {
        showToast('⚠️ กรุณาเชื่อมต่อบัญชีก่อนซิงค์');
        return;
    }

    // If it's a mock token, let's mock sync
    if (googleAccessToken.startsWith("mock_token_")) {
        const randomSteps = Math.floor(Math.random() * 4000) + 4000;
        addStep(randomSteps - state.steps > 0 ? randomSteps - state.steps : 150);
        showToast(`🔄 ซิงค์ยอดก้าวสำเร็จ! (จำลอง: ${state.steps.toLocaleString()} ก้าว)`);
        return;
    }

    showToast('🔄 กำลังซิงค์ข้อมูลก้าวเดิน...');

    // Calculate time window for today (Local Midnight to Now)
    const midnight = new Date();
    midnight.setHours(0,0,0,0);
    const startTimeMillis = midnight.getTime();
    const endTimeMillis = Date.now();

    // Query Google Fit API aggregate steps delta
    fetch('https://www.googleapis.com/fitness/v1/users/me/dataset/aggregate', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${googleAccessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "aggregateBy": [{
                "dataTypeName": "com.google.step_count.delta",
                "dataSourceId": "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
            }],
            "bucketByTime": { "durationMillis": 86400000 },
            "startTimeMillis": startTimeMillis,
            "endTimeMillis": endTimeMillis
        })
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                // Token expired
                disconnectGoogleFit();
                throw new Error("หมดอายุสิทธิ์การใช้งาน กรุณาเชื่อมต่อใหม่อีกครั้ง");
            }
            throw new Error("เซิร์ฟเวอร์ Google Fit ไม่ตอบสนอง");
        }
        return response.json();
    })
    .then(data => {
        // Extract total step count
        let totalSteps = 0;
        if (data.bucket && data.bucket[0] && data.bucket[0].dataset && data.bucket[0].dataset[0]) {
            const points = data.bucket[0].dataset[0].point;
            if (points && points.length > 0) {
                points.forEach(point => {
                    if (point.value && point.value[0]) {
                        totalSteps += point.value[0].intVal || 0;
                    }
                });
            }
        }
        
        if (totalSteps > state.steps) {
            const addedSteps = totalSteps - state.steps;
            addStep(addedSteps);
            showToast(`🔄 ซิงค์ก้าวสำเร็จ! ยอดรวมวันนี้: ${totalSteps.toLocaleString()} ก้าว`);
        } else if (totalSteps > 0 && totalSteps <= state.steps) {
            showToast(`🔄 ข้อมูลอัปเดตเป็นปัจจุบันแล้ว (${state.steps.toLocaleString()} ก้าว)`);
        } else {
            showToast('⚠️ ไม่พบข้อมูลการเดินวันนี้ใน Google Fit');
        }
    })
    .catch(error => {
        console.error("Google Fit Sync Error:", error);
        showToast(`❌ เกิดข้อผิดพลาด: ${error.message}`);
    });
}

// ----------------------------------------------------
// Screenshot Upload & Compression
// ----------------------------------------------------

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('⚠️ กรุณาเลือกอัปโหลดไฟล์รูปภาพหลักฐานเท่านั้น');
        return;
    }

    showToast('🖼️ กำลังประมวลผลและลดขนาดภาพ...');

    // Compress image to Base64 (max 500px width for DB storage efficiency)
    compressImage(file, (compressedBase64) => {
        uploadedImageBase64 = compressedBase64;
        
        // Show Preview
        elements.imagePreview.src = compressedBase64;
        elements.previewContainer.classList.remove('hidden');
        elements.fileDropzone.classList.add('hidden');
        showToast('✅ ประมวลผลหลักฐานเสร็จสมบูรณ์');
    });
}

function compressImage(file, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const max_width = 500;
            const scale = max_width / img.width;
            
            canvas.width = max_width;
            canvas.height = img.height * scale;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // Output as compressed JPEG (70% quality)
            const compressedUrl = canvas.toDataURL('image/jpeg', 0.7);
            callback(compressedUrl);
        };
    };
}

function clearImagePreview() {
    elements.inputUploadFile.value = '';
    elements.imagePreview.src = '';
    elements.previewContainer.classList.add('hidden');
    elements.fileDropzone.classList.remove('hidden');
    uploadedImageBase64 = null;
}

function handleUploadSubmit(event) {
    event.preventDefault();

    const stepsInput = parseInt(elements.inputUploadSteps.value);
    const dateInput = elements.inputUploadDate.value;

    if (isNaN(stepsInput) || stepsInput <= 0) {
        showToast('⚠️ กรุณากรอกจำนวนก้าวที่ถูกต้อง');
        return;
    }

    if (!dateInput) {
        showToast('⚠️ กรุณาระบุวันที่ที่ต้องการบันทึก');
        return;
    }

    if (!uploadedImageBase64) {
        showToast('⚠️ กรุณาเลือกไฟล์รูปภาพหลักฐานก่อนส่ง');
        return;
    }

    // Construct approval object
    const approvalId = 'approval_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    const payload = {
        userId: state.userId,
        nickname: state.nickname,
        department: state.department,
        steps: stepsInput,
        date: dateInput,
        imageUrl: uploadedImageBase64,
        status: "pending",
        timestamp: Date.now()
    };

    if (firebaseActive) {
        showToast('⏳ กำลังอัปโหลดข้อมูลคำขอ...');
        set(ref(db, 'approvals/' + approvalId), payload)
            .then(() => {
                // Save approval ID locally to display status to this user
                state.myApprovals.push(approvalId);
                localStorage.setItem('stepgo_my_approvals', JSON.stringify(state.myApprovals));
                
                // Clear Form
                elements.inputUploadSteps.value = '';
                clearImagePreview();
                showToast('📤 ส่งหลักฐานให้แอดมินเรียบร้อยแล้ว');
                
                // Refresh list
                renderMyApprovalsList();
            })
            .catch(err => {
                console.error("Upload error:", err);
                showToast('❌ อัปโหลดล้มเหลว กรุณาลองใหม่');
            });
    } else {
        // Local simulation fallback
        showToast('⏳ จำลองการอัปโหลดข้อมูล (โหมดสาธิต)...');
        setTimeout(() => {
            state.myApprovals.push(approvalId);
            localStorage.setItem('stepgo_my_approvals', JSON.stringify(state.myApprovals));
            
            // Save mock data locally to simulate DB
            const mockDb = JSON.parse(localStorage.getItem('stepgo_mock_approvals') || '{}');
            mockDb[approvalId] = payload;
            localStorage.setItem('stepgo_mock_approvals', JSON.stringify(mockDb));
            
            elements.inputUploadSteps.value = '';
            clearImagePreview();
            showToast('📤 ส่งหลักฐานจำลองสำเร็จ (โปรดเข้าแท็บแอดมินเพื่อกดอนุมัติ)');
            
            renderMyApprovalsList();
        }, 1000);
    }
}

function loadMyApprovals() {
    const saved = localStorage.getItem('stepgo_my_approvals');
    if (saved) {
        try {
            state.myApprovals = JSON.parse(saved);
        } catch (e) {
            state.myApprovals = [];
        }
    }
}

function renderMyApprovalsList() {
    elements.myApprovalsList.innerHTML = '';

    if (state.myApprovals.length === 0) {
        elements.myApprovalsList.innerHTML = '<div class="chart-placeholder">ไม่มีประวัติการส่งคำขอของคุณ</div>';
        return;
    }

    if (firebaseActive) {
        // Query status from Firebase
        elements.myApprovalsList.innerHTML = '<div class="chart-placeholder">กำลังอัปเดตสถานะ...</div>';
        const approvalsRef = ref(db, 'approvals');
        get(approvalsRef).then(snapshot => {
            elements.myApprovalsList.innerHTML = '';
            const data = snapshot.val() || {};
            
            const renderList = [];
            state.myApprovals.forEach(id => {
                if (data[id]) {
                    renderList.push(data[id]);
                }
            });

            if (renderList.length === 0) {
                elements.myApprovalsList.innerHTML = '<div class="chart-placeholder">ไม่มีประวัติการส่งคำขอของคุณ</div>';
                return;
            }

            // Sort newest first
            renderList.sort((a, b) => b.timestamp - a.timestamp);

            renderList.forEach(item => {
                const row = document.createElement('div');
                row.className = 'approval-item';
                
                const statusLabels = {
                    'pending': 'รออนุมัติ',
                    'approved': 'อนุมัติแล้ว',
                    'rejected': 'ถูกปฏิเสธ'
                };

                row.innerHTML = `
                    <div class="approval-item-left">
                        <span class="approval-item-steps">${item.steps.toLocaleString()} ก้าว</span>
                        <span class="approval-item-date">${item.date}</span>
                    </div>
                    <span class="badge ${item.status}">${statusLabels[item.status]}</span>
                `;
                elements.myApprovalsList.appendChild(row);
            });
        });
    } else {
        // Local simulation fallback
        const mockDb = JSON.parse(localStorage.getItem('stepgo_mock_approvals') || '{}');
        const renderList = [];
        state.myApprovals.forEach(id => {
            if (mockDb[id]) {
                renderList.push(mockDb[id]);
            }
        });

        if (renderList.length === 0) {
            elements.myApprovalsList.innerHTML = '<div class="chart-placeholder">ไม่มีประวัติการส่งคำขอของคุณ</div>';
            return;
        }

        renderList.sort((a, b) => b.timestamp - a.timestamp);

        renderList.forEach(item => {
            const row = document.createElement('div');
            row.className = 'approval-item';
            
            const statusLabels = {
                'pending': 'รออนุมัติ',
                'approved': 'อนุมัติแล้ว',
                'rejected': 'ถูกปฏิเสธ'
            };

            row.innerHTML = `
                <div class="approval-item-left">
                    <span class="approval-item-steps">${item.steps.toLocaleString()} ก้าว</span>
                    <span class="approval-item-date">${item.date}</span>
                </div>
                <span class="badge ${item.status}">${statusLabels[item.status]}</span>
            `;
            elements.myApprovalsList.appendChild(row);
        });
    }
}

// ----------------------------------------------------
// Admin Panel Dashboard (Actions)
// ----------------------------------------------------

function handleAdminLogin() {
    const pw = elements.inputAdminPassword.value;
    // Default password "admin1234"
    if (pw === "admin1234") {
        isAdminAuthenticated = true;
        elements.adminAuthCard.classList.add('hidden');
        elements.adminDashboardView.classList.remove('hidden');
        elements.inputAdminPassword.value = '';
        showToast('🔓 เข้าสู่ระบบแอดมินสำเร็จ!');
        listenToPendingApprovals();
    } else {
        showToast('❌ รหัสผ่านไม่ถูกต้อง');
    }
}

function handleAdminLogout() {
    isAdminAuthenticated = false;
    elements.adminDashboardView.classList.add('hidden');
    elements.adminAuthCard.classList.remove('hidden');
    showToast('🔒 ออกจากระบบแอดมินแล้ว');
}

let pendingApprovalsListener = null;

function listenToPendingApprovals() {
    if (firebaseActive) {
        const approvalsRef = ref(db, 'approvals');
        
        onValue(approvalsRef, (snapshot) => {
            if (!isAdminAuthenticated) return;
            
            const data = snapshot.val() || {};
            const pendingList = [];
            
            for (let id in data) {
                if (data[id].status === 'pending') {
                    const item = data[id];
                    item.id = id;
                    pendingList.push(item);
                }
            }
            
            // Sort oldest first (FIFO queue)
            pendingList.sort((a, b) => a.timestamp - b.timestamp);
            renderAdminPendingList(pendingList);
        });
    } else {
        // Local simulation fallback
        const mockDb = JSON.parse(localStorage.getItem('stepgo_mock_approvals') || '{}');
        const pendingList = [];
        for (let id in mockDb) {
            if (mockDb[id].status === 'pending') {
                const item = mockDb[id];
                item.id = id;
                pendingList.push(item);
            }
        }
        pendingList.sort((a, b) => a.timestamp - b.timestamp);
        renderAdminPendingList(pendingList);
    }
}

function renderAdminPendingList(list) {
    elements.adminPendingList.innerHTML = '';
    
    if (list.length === 0) {
        elements.adminPendingList.innerHTML = '<div class="chart-placeholder">ไม่มีคำขอที่ค้างอนุมัติ</div>';
        return;
    }

    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'admin-approval-card';
        
        card.innerHTML = `
            <div class="admin-card-header">
                <div class="admin-user-details">
                    <span class="admin-user-title">${item.nickname}</span>
                    <span class="admin-user-sub">${item.department}</span>
                </div>
                <div class="admin-steps-claim">
                    <span class="admin-steps-value">${item.steps.toLocaleString()} ก้าว</span>
                    <span class="admin-steps-date">วันที่: ${item.date}</span>
                </div>
            </div>
            <div class="admin-card-body">
                <img src="${item.imageUrl}" class="admin-approval-image" alt="หลักฐาน" onclick="window.open(this.src)">
            </div>
            <div class="admin-card-actions">
                <button class="btn btn-outline btn-sm btn-reject" data-id="${item.id}">ปฏิเสธ</button>
                <button class="btn btn-primary btn-sm btn-approve" data-id="${item.id}" data-user="${item.userId}" data-steps="${item.steps}" data-date="${item.date}">อนุมัติ</button>
            </div>
        `;
        
        // Add button event listeners
        card.querySelector('.btn-reject').addEventListener('click', (e) => rejectApproval(e.target.dataset.id));
        card.querySelector('.btn-approve').addEventListener('click', (e) => {
            const ds = e.target.dataset;
            approveApproval(ds.id, ds.user, parseInt(ds.steps), ds.date);
        });

        elements.adminPendingList.appendChild(card);
    });
}

function approveApproval(id, userId, steps, date) {
    showToast('⏳ กำลังอนุมัติและปรับคะแนน...');
    
    if (firebaseActive) {
        // 1. Update status of the approval request
        update(ref(db, 'approvals/' + id), { status: 'approved' })
            .then(() => {
                // 2. Fetch the target user's current steps from Firebase
                const userStepsRef = ref(db, `users/${userId}/steps`);
                return get(userStepsRef);
            })
            .then(snapshot => {
                const currentSteps = snapshot.val() || 0;
                // Add the approved steps to the user's total steps count in Firebase
                const newSteps = currentSteps + steps;
                
                // If it is the current user's profile, update local steps state as well
                if (userId === state.userId) {
                    state.steps = newSteps;
                    saveTodaySteps();
                    updateDashboardUI();
                }

                // Write the new steps sum directly to the user's Node in Firebase Realtime DB
                return update(ref(db, 'users/' + userId), {
                    steps: newSteps,
                    lastActive: Date.now()
                });
            })
            .then(() => {
                showToast('✅ อนุมัติการบันทึกก้าวเดินเรียบร้อย');
                listenToPendingApprovals();
            })
            .catch(err => {
                console.error("Approval error:", err);
                showToast('❌ การอนุมัติขัดข้อง');
            });
    } else {
        // Local simulation fallback
        const mockDb = JSON.parse(localStorage.getItem('stepgo_mock_approvals') || '{}');
        if (mockDb[id]) {
            mockDb[id].status = 'approved';
            localStorage.setItem('stepgo_mock_approvals', JSON.stringify(mockDb));
            
            // If it is self, update steps
            if (userId === state.userId) {
                addStep(steps);
            }
            
            showToast('✅ [โหมดสาธิต] อนุมัติก้าวเดินเรียบร้อย');
            listenToPendingApprovals();
        }
    }
}

function rejectApproval(id) {
    if (!confirm('คุณต้องการปฏิเสธคำขอและลบรูปหลักฐานนี้หรือไม่?')) return;
    
    showToast('⏳ กำลังส่งผลการปฏิเสธ...');
    
    if (firebaseActive) {
        update(ref(db, 'approvals/' + id), { status: 'rejected' })
            .then(() => {
                showToast('❌ ปฏิเสธหลักฐานเรียบร้อย');
                listenToPendingApprovals();
            })
            .catch(err => {
                console.error("Rejection error:", err);
                showToast('❌ การทำงานล้มเหลว');
            });
    } else {
        // Local simulation fallback
        const mockDb = JSON.parse(localStorage.getItem('stepgo_mock_approvals') || '{}');
        if (mockDb[id]) {
            mockDb[id].status = 'rejected';
            localStorage.setItem('stepgo_mock_approvals', JSON.stringify(mockDb));
            
            showToast('❌ [โหมดสาธิต] ปฏิเสธหลักฐานเรียบร้อย');
            listenToPendingApprovals();
        }
    }
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
    
    saveTodaySteps();
    updateDashboardUI();
    
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
        state.isTracking = false;
        stopMotionTracking();
        stopTimer();
        
        syncStepsToFirebase();
        
        elements.btnToggleTracking.classList.remove('tracking');
        elements.btnToggleTracking.querySelector('.btn-text').innerText = 'เริ่มนับก้าวเดิน';
        elements.btnToggleTracking.querySelector('.btn-icon').setAttribute('data-lucide', 'play');
        lucide.createIcons();
        showToast('⏸️ หยุดนับก้าวชั่วคราว');
    } else {
        state.isTracking = true;
        startMotionTracking().then(success => {
            if (success !== false) {
                startTimer();
                
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
