// StepGo - Pedometer Application Core JavaScript

// App State
const state = {
    steps: 0,
    goal: 10000,
    weight: 65,    // kg
    stride: 70,    // cm (average walking step length)
    isTracking: false,
    startTime: null,
    elapsedSeconds: 0,
    history: {},   // format: { "YYYY-MM-DD": steps }
};

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
const STEP_THRESHOLD = 1.05; // Peak threshold factor above gravity (9.8 * 1.05 = ~10.3 m/s^2)
const VALLEY_THRESHOLD = 0.95; // Valley reset threshold factor (9.8 * 0.95 = ~9.3 m/s^2)
let isAboveThreshold = false;

// DOM Elements
const elements = {
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
    
    // Load data from LocalStorage
    loadSettings();
    loadHistory();
    loadTodaySteps();
    
    // Initialize UI Display
    updateDashboardUI();
    renderHistoryChart();
    
    // Setup Event Listeners
    setupEventListeners();
    
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
// Core Logic: Step Tracking & Algorithm
// ----------------------------------------------------

function checkSensorAvailability() {
    const isSupported = typeof DeviceMotionEvent !== 'undefined';
    
    if (!isSupported) {
        updateSensorStatus('error', 'เบราว์เซอร์ไม่รองรับเซ็นเซอร์ (ใช้จำลองได้)');
        return;
    }
    
    // Check if permission is needed (mainly iOS 13+)
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        // Needs permission request via button
        elements.sensorPermissionCard.classList.remove('hidden');
        updateSensorStatus('inactive', 'ต้องขอสิทธิ์เข้าใช้งานเซ็นเซอร์ (iOS)');
    } else {
        // Android or older iOS, typically doesn't need explicit requestPermission call
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
        // iOS requires validation of permission status again
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
        // Android/Other browsers
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

// Low-pass Filter & Peak Detection Algorithm
function handleDeviceMotion(event) {
    let acc = event.accelerationIncludingGravity;
    if (!acc || acc.x === null) {
        acc = event.acceleration; // fallback if gravity is already filtered by OS
    }
    
    if (!acc || acc.x === null) return;
    
    // 1. Calculate magnitude of the acceleration vector
    const x = acc.x;
    const y = acc.y;
    const z = acc.z;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    
    // 2. Smooth magnitude using low pass filter
    smoothedAcceleration = FILTER_ALPHA * magnitude + (1 - FILTER_ALPHA) * smoothedAcceleration;
    
    const now = Date.now();
    
    // 3. Step detection based on threshold crossing and cooldown
    // Typically gravity is ~9.8 m/s^2. 
    // During walking, deceleration causes a peak, acceleration causes a valley.
    const peakThresh = 9.8 * STEP_THRESHOLD;
    const valleyThresh = 9.8 * VALLEY_THRESHOLD;
    
    if (smoothedAcceleration > peakThresh && !isAboveThreshold) {
        if (now - lastStepTime > STEP_COOLDOWN) {
            isAboveThreshold = true;
            lastStepTime = now;
            addStep(1);
        }
    } else if (smoothedAcceleration < valleyThresh) {
        // Reset state once acceleration returns towards or below valley
        isAboveThreshold = false;
    }
}

// ----------------------------------------------------
// UI and State Updates
// ----------------------------------------------------

function addStep(count) {
    state.steps += count;
    
    // Save steps
    saveTodaySteps();
    
    // UI update
    updateDashboardUI();
    
    // Trigger visual feed back in SVG or toast on milestone
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
    // 1. Text elements
    elements.stepCount.innerText = state.steps.toLocaleString();
    elements.goalValue.innerText = state.goal.toLocaleString();
    
    // 2. Metrics calculation
    // Distance: steps * stride length (m) / 1000
    const distanceKm = (state.steps * (state.stride / 100)) / 1000;
    elements.distanceWalked.innerText = distanceKm.toFixed(2);
    
    // Calories: approx. based on weight and steps
    // Standard estimate: ~0.75 kcal per km per kg
    const calories = distanceKm * state.weight * 0.75;
    elements.caloriesBurned.innerText = Math.round(calories);
    
    // 3. Circular Progress update
    const progressCircle = document.querySelector('.progress-ring__circle');
    const radius = progressCircle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius; // 753.98
    
    // Set dasharray first
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
    // Save timer data locally
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
        // Format to local ISO-like string YYYY-MM-DD
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
    
    // Find max value in history to scale bars properly
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
        
        // Calculate height percentage (min 2% to ensure tiny line shows)
        const heightPct = Math.max((steps / maxSteps) * 100, 2);
        
        // Create bar elements
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
        // It's a new day! Save yesterday's steps to history if we have any
        if (savedDate && savedDate !== '') {
            const lastSteps = parseInt(localStorage.getItem('stepgo_steps')) || 0;
            saveDayToHistory(savedDate, lastSteps);
        }
        
        // Reset for new day
        state.steps = 0;
        state.elapsedSeconds = 0;
        localStorage.setItem('stepgo_last_date', today);
        localStorage.setItem('stepgo_steps', 0);
        localStorage.setItem('stepgo_elapsed_seconds', 0);
    }
    // Always mirror today's steps in the history object
    state.history[today] = state.steps;
    updateTimerUI();
}

function saveTodaySteps() {
    const today = getTodayDateString();
    localStorage.setItem('stepgo_last_date', today);
    localStorage.setItem('stepgo_steps', state.steps);
    
    // Also mirror to history so chart displays instantly
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
    
    // Sync to settings inputs
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
    
    // Save to history today's target mirror representation
    saveTodaySteps();
    updateDashboardUI();
    renderHistoryChart();
    
    closeSettings();
    showToast('💾 บันทึกการตั้งค่าแล้ว');
}

// ----------------------------------------------------
// Helper Utilities
// ----------------------------------------------------

// Screen Wake Lock API (keeps screen on while walking)
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

// Sensor status badge management
function updateSensorStatus(status, text) {
    elements.sensorStatus.className = `status-badge ${status}`;
    elements.sensorStatus.querySelector('.status-text').innerText = text;
}

// Toast utility
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// Simulator action
function simulateSteps(count) {
    addStep(count);
    // Add seconds to elapsed time to simulate walk time (e.g. 1.2s per step)
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

