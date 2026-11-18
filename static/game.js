/* ==========================================================================
   ESTADO GLOBAL Y CONFIGURACIÓN
   ========================================================================== */
let currentUser = "";
let selectedMode = ""; 
let pendingLevelSelection = null;
let isPaused = false;

// Preferencias de Audio y Voz
let soundEffectsEnabled = true;
let backgroundMusicEnabled = true;
let voiceEnabled = true;
const PLAYER_DATA_KEY = 'simonDicePlayerDataV5';
let playerData = { username: '', records: { intermediate_level_2: 0, hard_level_3: 0 } };

// Variables Modo Simón (Colores)
let sequence = [];
let playerInput = [];
let scoreCorrect = 0;
let scoreIncorrect = 0;
let lives = 3;
let isPlaybackActive = false;
let playbackInterval = null;
let roundTimeout = null;
let currentPlaybackSpeed = 600;

// Variables Nivel 3
let hardPhase = 1;
let hardPhaseOneRemaining = 60;
let hardPhaseTwoRemaining = 300;
let hardCorrectInPhaseOne = 0;
let hardStageOnePoints = 0;
let hardStageTwoRound = 0;
let hardStageTwoScore = 0;
let hardTimerInterval = null;
let hardDeadline = null;
let hardPausedRemaining = null;

// Variables Modo Simón Dice
let webcamStream = null;
let currentTargetPose = null;
let currentDetectedPoseKey = "NEUTRAL";
let diceCheckInterval = null;
let diceRoundTimeout = null;
let diceRoundCount = 0;
let isSimonCommand = true;
let currentUtterance = null;
let cameraSessionId = 0;
let frameLoopTimeout = null;
let frameRequestController = null;

const POSES_DICT = [
    { emoji: '🙌', name: 'Ambas Manos Arriba', key: '🙌' },
    { emoji: '🙋‍♀️', name: 'Mano Derecha Arriba', key: '🙋‍♀️' },
    { emoji: '🙋‍♂️', name: 'Mano Izquierda Arriba', key: '🙋‍♂️' },
    { emoji: '👉👃', name: 'Tocar la Nariz', key: '👉👃' },
    { emoji: '🙆', name: 'Manos a la Cabeza', key: '🙆' },
    { emoji: '🙅‍♀️', name: 'Brazos en Cruz', key: '🙅‍♀️' },
    { emoji: '🦵⬅️', name: 'Pie Izquierdo Arriba', key: '🦵⬅️' },
    { emoji: '🦵➡️', name: 'Pie Derecho Arriba', key: '🦵➡️' }
];

/* --- SÍNTESIS DE AUDIO Y MULTIMEDIA --- */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const PAD_FREQUENCIES = [261.63, 329.63, 392.00, 523.25];
const RESULT_IMAGE_BASE = '/static/images/modern/';
const RESULT_SOUND_BASE = '/static/sounds/';
let resultContinueCallback = null;
let activeResultAudio = [];
let resultAudioSequenceId = 0;

const resultDefinitions = {
    phase_complete: { image: 'phase_completed.jpg.png', kicker: 'FASE COMPLETADA' },
    level_complete: { image: 'level_complete.jpg.png', kicker: 'NIVEL SUPERADO' },
    survival_unlocked: { image: 'survival_unlocked.jpg.png', sound: 'goingNext.mp3', kicker: 'NUEVO MODO' },
    victory: { image: 'victory.jpg.png', sounds: ['victoryVoice.mp3', 'victory.mp3'], kicker: 'VICTORIA' },
    game_over: { image: 'game_over.jpg.png', sounds: ['gameOverVoice.mp3', 'gameOverSound.mp3'], kicker: 'PARTIDA FINALIZADA' },
    new_record: { image: 'new_record.jpg.png', kicker: 'NUEVO RÉCORD' }
};

function playSoundTone(freq, duration = 300, type = 'sine') {
    if (!soundEffectsEnabled) return;
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + (duration / 1000));
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + (duration / 1000));
    } catch (e) {}
}

function playFeedbackSound(isSuccess) {
    if (isSuccess) {
        playSoundTone(587.33, 150, 'triangle');
        setTimeout(() => playSoundTone(880.00, 250, 'triangle'), 150);
    } else {
        playSoundTone(150, 400, 'sawtooth');
    }
}

function stopResultAudio() {
    resultAudioSequenceId++;
    activeResultAudio.forEach(a => { a.pause(); a.currentTime = 0; });
    activeResultAudio = [];
}

async function playSoundFile(filename) {
    if (!filename || !soundEffectsEnabled) return;
    const audio = new Audio(RESULT_SOUND_BASE + filename);
    audio.volume = 0.9;
    activeResultAudio.push(audio);
    try {
        await audio.play();
        await new Promise(resolve => {
            audio.addEventListener('ended', resolve, { once: true });
            audio.addEventListener('error', resolve, { once: true });
        });
    } catch (e) {}
    activeResultAudio = activeResultAudio.filter(item => item !== audio);
}

function showResultScreen(type, title, description, onContinue) {
    stopMusic();
    const hamburger = document.getElementById('btn-hamburger');
    if (hamburger) hamburger.classList.add('hidden');
    document.getElementById('hamburger-dropdown')?.classList.add('hidden');
    const def = resultDefinitions[type];
    if (!def) {
        if (typeof onContinue === 'function') onContinue();
        return;
    }
    const overlay = document.getElementById('result-overlay');
    const img = document.getElementById('result-image');
    document.getElementById('result-kicker').innerText = def.kicker;
    document.getElementById('result-title').innerText = title;
    document.getElementById('result-description').innerText = description || '';
    const comp = document.getElementById('record-comparison');
    if (comp) { comp.classList.add('hidden'); comp.innerHTML = ''; }
    img.src = RESULT_IMAGE_BASE + def.image;
    resultContinueCallback = onContinue || null;
    overlay.classList.remove('hidden');
}

function continueResult() {
    const overlay = document.getElementById('result-overlay');
    if (overlay) overlay.classList.add('hidden');
    stopResultAudio();
    const cb = resultContinueCallback;
    resultContinueCallback = null;
    if (typeof cb === 'function') cb();
    if (!overlay || overlay.classList.contains('hidden')) playMusic();
}

const bgMusic = document.getElementById('bg-music');
function playMusic() {
    if (bgMusic && backgroundMusicEnabled) {
        bgMusic.volume = 0.3;
        bgMusic.play().catch(() => {});
    }
}
function stopMusic() {
    if (bgMusic) { bgMusic.pause(); bgMusic.currentTime = 0; }
}

function loadPlayerData() {
    try {
        const saved = JSON.parse(localStorage.getItem(PLAYER_DATA_KEY) || '{}');
        playerData = { ...playerData, ...saved, records: { ...playerData.records, ...(saved.records || {}) } };
        soundEffectsEnabled = saved.soundEffectsEnabled !== false;
        backgroundMusicEnabled = saved.backgroundMusicEnabled !== false;
        voiceEnabled = saved.voiceEnabled !== false;
    } catch (e) {}
}

function savePlayerData() {
    try {
        playerData.soundEffectsEnabled = soundEffectsEnabled;
        playerData.backgroundMusicEnabled = backgroundMusicEnabled;
        playerData.voiceEnabled = voiceEnabled;
        localStorage.setItem(PLAYER_DATA_KEY, JSON.stringify(playerData));
    } catch (e) {}
}

function toggleSetting(setting) {
    if (setting === 'music') backgroundMusicEnabled = !backgroundMusicEnabled;
    if (setting === 'effects') soundEffectsEnabled = !soundEffectsEnabled;
    if (setting === 'voice') {
        voiceEnabled = !voiceEnabled;
        if (!voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    savePlayerData();
    updateSettingsLabels();
    if (setting === 'music') backgroundMusicEnabled ? playMusic() : stopMusic();
}

function updateSettingsLabels() {
    document.getElementById('music-setting').textContent = `Música: ${backgroundMusicEnabled ? 'Activada' : 'Desactivada'}`;
    document.getElementById('effects-setting').textContent = `Efectos: ${soundEffectsEnabled ? 'Activados' : 'Desactivados'}`;
    document.getElementById('voice-setting').textContent = `Voz: ${voiceEnabled ? 'Activada' : 'Desactivada'}`;
}

function closePanel(id) { document.getElementById(id)?.classList.add('hidden'); }

function showScreen(screenId) {
    document.querySelectorAll('.main-wrapper > div, #simon-dice-screen').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');

    const hamburger = document.getElementById('btn-hamburger');
    if (screenId === 'simon-game-screen' || screenId === 'simon-dice-screen') {
        hamburger.classList.remove('hidden');
    } else {
        hamburger.classList.add('hidden');
        document.getElementById('hamburger-dropdown').classList.add('hidden');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    loadPlayerData();
    if (playerData.username) {
        currentUser = playerData.username;
        document.getElementById('username-input').value = currentUser;
        document.getElementById('welcome-title').innerText = `¡HOLA, ${currentUser.toUpperCase()}!`;
        showScreen('main-menu');
    } else {
        showScreen('screen-login');
    }
});

function saveUserAndMenu() {
    const val = document.getElementById('username-input').value.trim();
    if (!val) {
        alert("Por favor ingresa un usuario.");
        return;
    }
    currentUser = val;
    playerData.username = currentUser;
    savePlayerData();
    document.getElementById('welcome-title').innerText = `¡HOLA, ${currentUser.toUpperCase()}!`;
    playMusic();
    showScreen('main-menu');
}

function selectMode(mode) {
    playMusic();
    if (mode === 'simon') {
        showScreen('simon-submenu');
    } else if (mode === 'simon_dice') {
        promptLevelRules('simon_dice');
    }
}

function toggleGlobalMenu() {
    const dropdown = document.getElementById('hamburger-dropdown');
    dropdown.classList.toggle('hidden');
}

function restartCurrentGame(event) {
    if (event) event.stopPropagation();
    document.getElementById('hamburger-dropdown').classList.add('hidden');
    document.getElementById('simon-pause-overlay')?.remove();
    isPaused = false;
    if (selectedMode === 'simon_dice') {
        stopWebcamStream();
        startSimonDiceGame();
    } else {
        startSimonGame(selectedMode);
    }
}

function pauseCurrentGame(event) {
    if (event) event.stopPropagation();
    document.getElementById('hamburger-dropdown').classList.add('hidden');
    isPaused = !isPaused;
    const pauseText = document.getElementById('tooltip-pause');
    
    if (selectedMode === 'simon_dice') {
        if (isPaused) {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            const ov = document.createElement('div');
            ov.id = 'dice-pause-overlay';
            ov.className = 'pause-overlay';
            ov.textContent = 'PAUSA';
            document.getElementById('simon-dice-screen').appendChild(ov);
            pauseText.innerText = "Reanudar Partida";
        } else {
            document.getElementById('dice-pause-overlay')?.remove();
            pauseText.innerText = "Pausar Partida";
        }
    } else {
        if (isPaused) {
            const ov = document.createElement('div');
            ov.id = 'simon-pause-overlay';
            ov.className = 'pause-overlay';
            ov.textContent = 'PAUSA';
            document.getElementById('simon-game-screen').appendChild(ov);
            pauseText.innerText = "Reanudar Partida";
        } else {
            document.getElementById('simon-pause-overlay')?.remove();
            pauseText.innerText = "Pausar Partida";
        }
    }
}

function abandonCurrentGame(event) {
    if (event) event.stopPropagation();
    document.getElementById('hamburger-dropdown').classList.add('hidden');
    document.getElementById('simon-pause-overlay')?.remove();
    isPaused = false;
    if (selectedMode === 'simon_dice') {
        stopWebcamStream();
        showScreen('main-menu');
    } else {
        clearAllSimonTimers();
        showScreen('simon-submenu');
    }
}

function promptLevelRules(modeKey) {
    pendingLevelSelection = modeKey;
    const title = document.getElementById('modal-rules-title');
    const desc = document.getElementById('modal-rules-desc');

    if (modeKey === 'easy') {
        title.innerText = "SIMÓN - NIVEL 1 (FÁCIL)";
        desc.innerText = "Completa 10 secuencias de colores progresivas para ganar.";
    } else if (modeKey === 'intermediate') {
        title.innerText = "SIMÓN - NIVEL 2 (INTERMEDIO)";
        desc.innerText = "Secuencias infinitas con velocidad progresiva y 3 vidas.";
    } else if (modeKey === 'hard') {
        title.innerText = "SIMÓN - NIVEL 3 (DIFÍCIL)";
        desc.innerText = "Etapa 1: 5 pares en 1 min.\nEtapa 2: Secuencias inversas con 3 vidas.";
    } else if (modeKey === 'simon_dice') {
        title.innerText = "SIMÓN DICE (CÁMARA)";
        desc.innerText = "Imitá el gesto frente a la cámara SOLO cuando la voz diga 'Simón dice'.";
    }
    document.getElementById('modal-level-rules').classList.remove('hidden');
}

function startConfirmedSimonLevel() {
    closePanel('modal-level-rules');
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (pendingLevelSelection === 'simon_dice') {
        selectedMode = 'simon_dice';
        startSimonDiceGame();
    } else {
        startSimonGame(pendingLevelSelection);
    }
}

function clearAllSimonTimers() {
    clearInterval(playbackInterval);
    clearInterval(hardTimerInterval);
    clearTimeout(roundTimeout);
    playbackInterval = null;
    hardTimerInterval = null;
    roundTimeout = null;
    isPlaybackActive = false;
}

function startSimonGame(level) {
    clearAllSimonTimers();
    selectedMode = level;
    isPaused = false;
    document.getElementById('simon-pause-overlay')?.remove();
    sequence = [];
    playerInput = [];
    scoreCorrect = 0;
    scoreIncorrect = 0;
    lives = 3;
    showScreen('simon-game-screen');
    updateSimonHUD();
    nextSimonRound();
}

function formatTime(seconds) {
    const safe = Math.max(0, seconds);
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function updateSimonHUD() {
    const info = document.getElementById('simon-info');
    const stats = document.getElementById('simon-stats');
    const extra = document.getElementById('simon-extra');
    const fill = document.getElementById('simon-progress-fill');
    const valText = document.getElementById('simon-progress-value');
    const progressPanel = document.querySelector('.progress-panel');

    let pct = 100;
    if (selectedMode === 'easy') {
        info.innerText = `NIVEL 1 | Ronda: ${sequence.length} / 10`;
        stats.innerText = `Aciertos: ${scoreCorrect}`;
        pct = Math.min(100, ((scoreCorrect + scoreIncorrect) / 10) * 100);
    } else if (selectedMode === 'intermediate') {
        info.innerText = `NIVEL 2 | Secuencia: ${sequence.length}`;
        stats.innerText = `Aciertos: ${scoreCorrect}`;
        extra.innerText = `Vidas: ${'❤️'.repeat(lives)}`;
    }
    if (fill) fill.style.width = `${pct}%`;
    if (valText) valText.textContent = `${Math.round(pct)}%`;
}

function nextSimonRound() {
    playerInput = [];
    if (selectedMode === 'easy' && (scoreIncorrect + scoreCorrect) >= 10) {
        showResultScreen('victory', '¡Nivel 1 Completado!', `Aciertos: ${scoreCorrect}`, () => showScreen('simon-submenu'));
        return;
    }
    sequence.push(Math.floor(Math.random() * 4));
    updateSimonHUD();
    playSequence();
}

function playSequence() {
    clearInterval(playbackInterval);
    isPlaybackActive = true;
    let step = 0;
    playbackInterval = setInterval(() => {
        if (isPaused) return;
        if (step >= sequence.length) {
            clearInterval(playbackInterval);
            isPlaybackActive = false;
            return;
        }
        activatePad(sequence[step]);
        step++;
    }, currentPlaybackSpeed);
}

function activatePad(index) {
    const pad = document.getElementById(`pad-${index}`);
    if (!pad) return;
    pad.classList.add('active');
    playSoundTone(PAD_FREQUENCIES[index], 250);
    setTimeout(() => pad.classList.remove('active'), 250);
}

function handlePadClick(index) {
    if (isPlaybackActive || isPaused || !sequence.length) return;
    activatePad(index);
    playerInput.push(index);
    const currentIndex = playerInput.length - 1;

    if (playerInput[currentIndex] !== sequence[currentIndex]) {
        scoreIncorrect++;
        playFeedbackSound(false);
        playerInput = [];
        roundTimeout = setTimeout(playSequence, 800);
        return;
    }

    if (playerInput.length === sequence.length) {
        scoreCorrect++;
        playFeedbackSound(true);
        roundTimeout = setTimeout(nextSimonRound, 900);
    }
}

/* ==========================================================================
   MODO SIMÓN DICE (CÁMARA BLINDADA Y GESTIÓN DE RED)
   ========================================================================== */
async function startSimonDiceGame() {
    stopWebcamStream();
    const thisSession = ++cameraSessionId;

    clearAllSimonTimers();
    selectedMode = 'simon_dice';
    isPaused = false;
    document.getElementById('simon-pause-overlay')?.remove();
    document.getElementById('dice-pause-overlay')?.remove();
    showScreen('simon-dice-screen');

    scoreCorrect = 0;
    scoreIncorrect = 0;
    diceRoundCount = 0;
    currentDetectedPoseKey = "NEUTRAL";

    const videoElement = document.getElementById('webcam-feed');

    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Navegador sin soporte de cámara.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
        });

        if (thisSession !== cameraSessionId) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }

        webcamStream = stream;
        videoElement.srcObject = stream;
        await videoElement.play().catch(() => {});

        const hiddenCanvas = document.createElement('canvas');
        const ctx = hiddenCanvas.getContext('2d', { alpha: false });
        let isNetworkBusy = false;

        const sendNextFrame = async () => {
            if (thisSession !== cameraSessionId || !webcamStream) return;

            if (!isPaused && !isNetworkBusy && videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                isNetworkBusy = true;
                let controller = null;
                let timeoutId = null;
                
                try {
                    hiddenCanvas.width = 320;
                    hiddenCanvas.height = 240;
                    ctx.drawImage(videoElement, 0, 0, 320, 240);
                    
                    const blob = await new Promise(resolve => hiddenCanvas.toBlob(resolve, 'image/jpeg', 0.5));

                    if (blob && thisSession === cameraSessionId) {
                        const formData = new FormData();
                        formData.append('frame', blob, 'frame.jpg');
                        
                        controller = new AbortController();
                        frameRequestController = controller;
                        timeoutId = setTimeout(() => controller.abort(), 6000);

                        const response = await fetch('/api/process_frame', {
                            method: 'POST',
                            body: formData,
                            signal: controller.signal
                        });
                        
                        clearTimeout(timeoutId);

                        if (response.ok) {
                            const data = await response.json();
                            if (thisSession === cameraSessionId) {
                                currentDetectedPoseKey = data.detected || 'NEUTRAL';
                            }
                        }
                    }
                } catch (err) {
                    // Manejo defensivo: filtramos AbortError para evitar falsos positivos en consola
                    if (err.name === 'AbortError') {
                        console.warn('Frame fetch cancelado por timeout o cambio de sesión (esperado).');
                    } else {
                        console.error('Error de red procesando fotograma:', err);
                    }
                } finally {
                    if (timeoutId) clearTimeout(timeoutId);
                    isNetworkBusy = false;
                }
            }

            if (thisSession === cameraSessionId) {
                frameLoopTimeout = setTimeout(sendNextFrame, 450);
            }
        };

        sendNextFrame();
        nextSimonDicePoseRound();

    } catch (err) {
        if (thisSession !== cameraSessionId) return;
        stopWebcamStream();
        alert('No se pudo iniciar la cámara. Verificá los permisos.');
        showScreen('main-menu');
    }
}

function stopWebcamStream() {
    cameraSessionId++;
    if (frameLoopTimeout) clearTimeout(frameLoopTimeout);
    if (frameRequestController) frameRequestController.abort();
    if (diceCheckInterval) clearInterval(diceCheckInterval);
    clearTimeout(diceRoundTimeout);

    const videoElement = document.getElementById('webcam-feed');
    if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
    }
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function speakSimonInstruction(text) {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        currentUtterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const spanishVoice = voices.find(v => v.lang.startsWith('es'));
        if (spanishVoice) currentUtterance.voice = spanishVoice;
        currentUtterance.rate = 1.25;
        currentUtterance.speak(currentUtterance);
    } catch (e) {}
}

function nextSimonDicePoseRound() {
    if (diceCheckInterval) clearInterval(diceCheckInterval);
    clearTimeout(diceRoundTimeout);

    if (scoreIncorrect >= 3) {
        stopWebcamStream();
        showResultScreen('game_over', '¡Fin de Simón Dice!', `Errores: ${scoreIncorrect}`, () => showScreen('main-menu'));
        return;
    }

    diceRoundCount++;
    currentDetectedPoseKey = "NEUTRAL";
    currentTargetPose = POSES_DICT[Math.floor(Math.random() * POSES_DICT.length)];
    isSimonCommand = (diceRoundCount === 1) ? true : (Math.random() < 0.55);
    
    speakSimonInstruction(isSimonCommand ? `Simón dice: ${currentTargetPose.name}` : currentTargetPose.name);
    document.getElementById('dice-target-emoji').innerText = currentTargetPose.emoji;

    let timeLimit = 40;
    let roundResolved = false;

    diceCheckInterval = setInterval(() => {
        if (isPaused || roundResolved) return;
        timeLimit--;

        const feedbackEl = document.getElementById('dice-feedback-text');
        if (feedbackEl) {
            feedbackEl.innerText = `Ronda ${diceRoundCount} | 🎯 ${currentTargetPose.emoji} | Detectado: ${currentDetectedPoseKey}`;
        }

        if (isSimonCommand && currentDetectedPoseKey === currentTargetPose.key) {
            roundResolved = true;
            clearInterval(diceCheckInterval);
            scoreCorrect++;
            playFeedbackSound(true);
            diceRoundTimeout = setTimeout(nextSimonDicePoseRound, 1000);
        } else if (!isSimonCommand && currentDetectedPoseKey === currentTargetPose.key) {
            roundResolved = true;
            clearInterval(diceCheckInterval);
            scoreIncorrect++;
            playFeedbackSound(false);
            diceRoundTimeout = setTimeout(nextSimonDicePoseRound, 1200);
        } else if (timeLimit <= 0) {
            roundResolved = true;
            clearInterval(diceCheckInterval);
            if (isSimonCommand) scoreIncorrect++; else scoreCorrect++;
            playFeedbackSound(!isSimonCommand);
            diceRoundTimeout = setTimeout(nextSimonDicePoseRound, 1000);
        }
    }, 150);
}
