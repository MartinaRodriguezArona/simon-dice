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
let frameSendInterval = null;
let isProcessingFrame = false;
let currentTargetPose = null;
let currentDetectedPoseKey = "NEUTRAL";
let diceCheckInterval = null;
let diceRoundTimeout = null;
let diceRoundCount = 0;
let isSimonCommand = true;
let currentUtterance = null;

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

async function playResultAudio(definition) {
    stopResultAudio();
    const seqId = resultAudioSequenceId;
    const list = definition.sounds || (definition.sound ? [definition.sound] : []);
    for (const file of list) {
        if (seqId !== resultAudioSequenceId) return;
        await playSoundFile(file);
    }
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
    playResultAudio(def);
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

/* --- GESTIÓN DE DATOS Y NAVEGACIÓN --- */
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

    // Mostrar el botón hamburguesa SOLO cuando está jugando dentro de niveles o en simon_dice
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
        alert("Por favor ingresa un nombre de usuario.");
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

/* --- MENÚ HAMBURGUESA GLOBAL (BARRES CON TOOLTIPS) --- */
function toggleGlobalMenu() {
    const dropdown = document.getElementById('hamburger-dropdown');
    dropdown.classList.toggle('hidden');
}

function toggleMuteSound(event) {
    if (event) event.stopPropagation();
    soundEffectsEnabled = !soundEffectsEnabled;
    backgroundMusicEnabled = soundEffectsEnabled;
    if (!backgroundMusicEnabled) stopMusic(); else playMusic();
    document.getElementById('tooltip-mute').innerText = soundEffectsEnabled ? "Mutear Sonido" : "Activar Sonido";
    savePlayerData();
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
            if (selectedMode === 'hard' && hardDeadline) {
                hardPausedRemaining = Math.max(0, Math.ceil((hardDeadline - Date.now()) / 1000));
            }
            const ov = document.createElement('div');
            ov.id = 'simon-pause-overlay';
            ov.className = 'pause-overlay';
            ov.textContent = 'PAUSA';
            document.getElementById('simon-game-screen').appendChild(ov);
            pauseText.innerText = "Reanudar Partida";
        } else {
            document.getElementById('simon-pause-overlay')?.remove();
            if (selectedMode === 'hard' && hardPausedRemaining !== null) {
                hardDeadline = Date.now() + hardPausedRemaining * 1000;
                hardPausedRemaining = null;
            }
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

/* --- MODAL DE REGLAS --- */
function promptLevelRules(modeKey) {
    pendingLevelSelection = modeKey;
    const title = document.getElementById('modal-rules-title');
    const desc = document.getElementById('modal-rules-desc');

    if (modeKey === 'easy') {
        title.innerText = "SIMÓN - NIVEL 1 (FÁCIL)";
        desc.innerText = "Completa 10 secuencias de colores progresivas para ganar el desafío.";
    } else if (modeKey === 'intermediate') {
        title.innerText = "SIMÓN - NIVEL 2 (INTERMEDIO)";
        desc.innerText = "Secuencias infinitas. La velocidad aumenta en cada ronda y tenés 3 corazones (vidas).";
    } else if (modeKey === 'hard') {
        title.innerText = "SIMÓN - NIVEL 3 (DIFÍCIL)";
        desc.innerText = "Etapa 1 (Double Challenge): Completa 5 pares de colores en 1 minuto.\nEtapa 2 (Challenge Extreme): Repetí 8 secuencias en orden INVERSO (al revés) con 3 vidas y 5 minutos.";
    } else if (modeKey === 'simon_dice') {
        title.innerText = "SIMÓN DICE (CÁMARA)";
        desc.innerText = "Imitá frente a la cámara el gesto que indica el emoji SOLO cuando la voz diga 'Simón dice'. Si no lo dice, quedate quieto.";
    }
    document.getElementById('modal-level-rules').classList.remove('hidden');
}

function startConfirmedSimonLevel() {
    closePanel('modal-level-rules');
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
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

/* ==========================================================================
   MODO SIMÓN
   ========================================================================== */
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
    currentPlaybackSpeed = 600;

    hardPhase = 1;
    hardPhaseOneRemaining = 60;
    hardPhaseTwoRemaining = 300;
    hardCorrectInPhaseOne = 0;
    hardStageOnePoints = 0;
    hardStageTwoRound = 0;
    hardStageTwoScore = 0;

    showScreen('simon-game-screen');
    if (selectedMode === 'hard') resetHardPhaseOneTimer();
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

    const timerDisplay = document.getElementById('simon-timer-display');
    const fill = document.getElementById('simon-progress-fill');
    const track = document.querySelector('.progress-track');
    const valText = document.getElementById('simon-progress-value');
    const labelText = document.getElementById('simon-progress-label');
    const msgText = document.getElementById('simon-progress-message');
    const progressPanel = document.querySelector('.progress-panel');

    let pct = 0, label = 'PROGRESO', msg = '', showTimer = false, showHearts = false, showBar = true;

    if (selectedMode === 'easy') {
        const totalPlayed = scoreCorrect + scoreIncorrect;
        info.innerText = `NIVEL 1: FÁCIL | Ronda: ${sequence.length} / 10`;
        stats.innerText = `Aciertos: ${scoreCorrect} | Errores: ${scoreIncorrect}`;
        extra.innerText = ``;
        pct = Math.min(100, (totalPlayed / 10) * 100);
        label = 'meta: 10 rondas';
        msg = '';
    } else if (selectedMode === 'intermediate') {
        info.innerText = `NIVEL 2: INTERMEDIO | Secuencia: ${sequence.length}`;
        stats.innerText = `Aciertos: ${scoreCorrect}`;
        extra.innerText = `Récord a superar: ${playerData.records.intermediate_level_2 || 0}`;
        label = 'VIDAS';
        showHearts = true;
        showBar = false;
        msg = '';
    } else if (selectedMode === 'hard') {
        showTimer = true;
        if (hardPhase === 1) {
            info.innerText = `NIVEL 3: DOUBLE CHALLENGE | Par: ${hardCorrectInPhaseOne + 1}/5`;
            stats.innerText = `Puntos: ${hardStageOnePoints}`;
            extra.innerText = `Completá 5 pares antes que se agote el tiempo`;
            pct = (hardPhaseOneRemaining / 60) * 100;
            timerDisplay.textContent = `⏱️ ${formatTime(hardPhaseOneRemaining)}`;
            label = 'PROGRESO';
            msg = 'Repetí los 2 colores en el mismo orden.';
        } else {
            info.innerText = `NIVEL 3: CHALLENGE EXTREME | Ronda: ${hardStageTwoRound}/8`;
            stats.innerText = `Puntos: ${hardStageOnePoints + hardStageTwoScore}`;
            extra.innerText = `¡Invertí el orden de la secuencia!`;
            showHearts = true;
            pct = (hardPhaseTwoRemaining / 300) * 100;
            timerDisplay.textContent = `⏱️ ${formatTime(hardPhaseTwoRemaining)}`;
            label = 'PROGRESO';
            msg = '¡AL REVÉS! Tocá desde el último color.';
        }
    }

    if (showTimer) {
        timerDisplay.classList.remove('hidden');
    } else {
        timerDisplay.classList.add('hidden');
    }

    if (showBar) {
        if (track) track.style.display = 'block';
        valText.style.display = 'inline';
    } else {
        if (track) track.style.display = 'none';
        valText.style.display = 'none';
    }

    // --- BLOQUE DE CORAZONES ---
    let livesEl = document.getElementById('simon-lives-display');
    if (!livesEl && progressPanel) {
        livesEl = document.createElement('div');
        livesEl.id = 'simon-lives-display';
        livesEl.className = 'lives-display';
        progressPanel.insertBefore(livesEl, msgText);
    }

    if (showHearts) {
        progressPanel.classList.add('lives-mode');
        if (livesEl) {
            livesEl.classList.remove('hidden');
            livesEl.style.display = 'block';
            livesEl.textContent = `${'❤️'.repeat(Math.max(0, lives))}${'🖤'.repeat(Math.max(0, 3 - lives))}`;
        }
    } else {
        progressPanel.classList.remove('lives-mode');
        if (livesEl) {
            livesEl.style.display = 'none';
        }
    }
    // ---------------------------

    fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    valText.textContent = `${Math.round(pct)}%`;
    labelText.textContent = label;
    msgText.textContent = msg;
}


function nextSimonRound() {
    playerInput = [];

    if (selectedMode === 'easy') {
        if ((scoreIncorrect + scoreCorrect) >= 10) {
            finishEasyLevel();
            return;
        }
        sequence.push(Math.floor(Math.random() * 4));
    } else if (selectedMode === 'intermediate') {
        sequence.push(Math.floor(Math.random() * 4));
        currentPlaybackSpeed = Math.max(220, 600 - (sequence.length - 1) * 35);
    } else if (selectedMode === 'hard') {
        if (hardPhase === 1) {
            if (hardCorrectInPhaseOne == 4) {
                stopHardTimer();
                // Mostrar correctamente la ventana intermedia de fase completada y luego pasar a la Etapa 2
                
                    showResultScreen('survival_unlocked', '¡Comienza CHALLENGE EXTREME!', 'Invertí el orden de las 8 secuencias. Tenés 3 corazones.', startHardPhaseTwo);
                return;
            }
            sequence = [Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)];
        } else {
            if (hardStageTwoRound >= 8) {
                finishHardPhaseTwo(true);
                return;
            }
            hardStageTwoRound++;
            const len = hardStageTwoRound <= 3 ? 2 : hardStageTwoRound <= 6 ? 3 : 4;
            sequence = Array.from({ length: len }, () => Math.floor(Math.random() * 4));
        }
    }

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
            playbackInterval = null;
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
    const flashDuration = Math.min(350, Math.floor(currentPlaybackSpeed * 0.6));
    pad.classList.add('active');
    playSoundTone(PAD_FREQUENCIES[index], flashDuration);
    setTimeout(() => pad.classList.remove('active'), flashDuration);
}

function handlePadClick(index) {
    if (isPlaybackActive || isPaused || !sequence.length) return;
    activatePad(index);
    playerInput.push(index);

    const currentIndex = playerInput.length - 1;
    const expectedPad = (selectedMode === 'hard' && hardPhase === 2)
        ? sequence[sequence.length - 1 - currentIndex]
        : sequence[currentIndex];

    if (playerInput[currentIndex] !== expectedPad) {
        scoreIncorrect++;
        playFeedbackSound(false);

        if (selectedMode === 'intermediate' || (selectedMode === 'hard' && hardPhase === 2)) {
            lives--;
            updateSimonHUD();
            if (lives <= 0) {
                if (selectedMode === 'intermediate') finishIntermediateLevel();
                else finishHardPhaseTwo(false);
                return;
            }
        } else if (selectedMode === 'hard' && hardPhase === 1) {
            adjustHardPhaseOneTime(-5);
            if (hardPhaseOneRemaining <= 0) return;
        }

        // En Nivel 1 repite la misma secuencia hasta que el usuario la acierte
        updateSimonHUD();
        playerInput = [];
        roundTimeout = setTimeout(playSequence, 800);
        return;
    }

    if (playerInput.length === sequence.length) {
        scoreCorrect++;
        playFeedbackSound(true);
        playSoundFile('nextRound.wav');

        if (selectedMode === 'hard') {
            if (hardPhase === 1) {
                hardCorrectInPhaseOne++;
                hardStageOnePoints++;
            } else {
                hardStageTwoScore++;
            }
        }

        updateSimonHUD();
        roundTimeout = setTimeout(nextSimonRound, 900);
    }
}


/* --- TEMPORIZADORES NIVEL 3 --- */
function stopHardTimer() {
    if (hardTimerInterval) clearInterval(hardTimerInterval);
    hardTimerInterval = null;
    hardDeadline = null;
}

function resetHardPhaseOneTimer() {
    hardPhaseOneRemaining = 60;
    hardDeadline = Date.now() + 60000;
    if (hardTimerInterval) clearInterval(hardTimerInterval);
    hardTimerInterval = setInterval(() => {
        if (isPaused) return;
        hardPhaseOneRemaining = Math.max(0, Math.ceil((hardDeadline - Date.now()) / 1000));
        updateSimonHUD();
        if (hardPhaseOneRemaining <= 0) finishHardPhaseOne();
    }, 200);
}

function adjustHardPhaseOneTime(seconds) {
    if (selectedMode !== 'hard' || hardPhase !== 1 || !hardDeadline) return;
    const rem = Math.max(0, Math.ceil((hardDeadline - Date.now()) / 1000) + seconds);
    hardPhaseOneRemaining = rem;
    hardDeadline = Date.now() + rem * 1000;
    updateSimonHUD();
    if (rem <= 0) finishHardPhaseOne();
}

function finishHardPhaseOne() {
    clearAllSimonTimers();
    const prev = playerData.records.hard_level_3 || 0;
    showRecordOutcome('Nivel 3', hardStageOnePoints, prev, `Se terminó el tiempo en DOUBLE CHALLENGE.\nPares completados: ${hardCorrectInPhaseOne}/5.\nPuntaje: ${hardStageOnePoints}`, () => showScreen('simon-submenu'));
}

function startHardPhaseTwo() {
    hardPhase = 2;
    hardStageTwoRound = 0;
    hardStageTwoScore = 0;
    hardPhaseTwoRemaining = 300;
    lives = 3;
    hardDeadline = Date.now() + 300000;
    sequence = [];
    playerInput = [];

    // Vuelve a mostrar el botón de las 3 rayitas (menú hamburguesa)
    document.getElementById('btn-hamburger')?.classList.remove('hidden');

    if (hardTimerInterval) clearInterval(hardTimerInterval);
    hardTimerInterval = setInterval(() => {
        if (isPaused) return;
        hardPhaseTwoRemaining = Math.max(0, Math.ceil((hardDeadline - Date.now()) / 1000));
        updateSimonHUD();
        if (hardPhaseTwoRemaining <= 0) finishHardPhaseTwo(false);
    }, 200);
    updateSimonHUD();
    nextSimonRound();
}

function finishHardPhaseTwo(completed = true) {
    clearAllSimonTimers();
    const prev = playerData.records.hard_level_3 || 0;
    const bonus = completed ? Math.max(0, hardPhaseTwoRemaining) : 0;
    const total = hardStageOnePoints + hardStageTwoScore + bonus;
    const desc = completed
        ? `DOUBLE CHALLENGE: ${hardStageOnePoints} pts\nCHALLENGE EXTREME: ${hardStageTwoScore} pts\nBonus tiempo: +${bonus} pts\nTotal: ${total} pts`
        : `No completaste las 8 rondas.\nPuntaje total obtenido: ${total} pts`;
    showRecordOutcome('Nivel 3', total, prev, desc, () => showScreen('simon-submenu'));
}

/* --- FINALES Y RÉCORDS --- */
function showRecordOutcome(title, score, prevRecord, details, onContinue) {
    const isNew = score > prevRecord;
    const isTie = prevRecord > 0 && score === prevRecord;
    const modeKey = selectedMode === 'intermediate' ? 'intermediate_level_2' : 'hard_level_3';

    if (isNew) {
        playerData.records[modeKey] = score;
        savePlayerData();
        fetch('/api/save_record', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: modeKey, score })
        }).catch(() => {});
    }

    showResultScreen(
        isNew ? 'new_record' : 'game_over',
        isNew ? `¡${title}: NUEVO RÉCORD!` : isTie ? `${title}: ¡Igualaste tu récord!` : `${title}: Partida finalizada`,
        details,
        onContinue
    );

    const comp = document.getElementById('record-comparison');
    if (comp) {
        comp.innerHTML = `
            <div class="record-stat"><span>RÉCORD ANTERIOR</span><strong>${prevRecord}</strong></div>
            <div class="record-stat record-current"><span>TU PARTIDA</span><strong>${score}</strong></div>
            <div class="record-status ${isNew ? 'is-new' : ''}">${isNew ? '🏆 ¡NUEVO RÉCORD!' : isTie ? '✨ ¡EMPATE!' : '💪 ¡SEGUÍ INTENTANDO!'}</div>`;
        comp.classList.remove('hidden');
    }
}

function finishEasyLevel() {
    clearAllSimonTimers();
    showResultScreen('victory', '¡Nivel 1 Completado!', `¡Completaste las 10 secuencias!\nAciertos: ${scoreCorrect} | Errores: ${scoreIncorrect}`, () => showScreen('simon-submenu'));
}

function finishIntermediateLevel() {
    clearAllSimonTimers();
    const prev = playerData.records.intermediate_level_2 || 0;
    showRecordOutcome('Nivel 2', scoreCorrect, prev, `Aciertos de esta partida: ${scoreCorrect}\nTe quedaste sin corazones.`, () => showScreen('simon-submenu'));
}

/* ==========================================================================
   MODO SIMÓN DICE (CÁMARA MIO)
   ========================================================================== */
async function startSimonDiceGame() {
    // 1. Cierra sesiones anteriores de la cámara
    stopWebcamStream();
    const thisSession = ++cameraSessionId;

    clearAllSimonTimers();
    selectedMode = 'simon_dice';
    isPaused = false;
    removePauseOverlays();
    showScreen('simon-dice-screen');

    scoreCorrect = 0;
    scoreIncorrect = 0;
    diceRoundCount = 0;
    currentDetectedPoseKey = "NEUTRAL";

    const videoElement = document.getElementById('webcam-feed');

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Este navegador no permite acceder a la cámara.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true
        });

        if (thisSession !== cameraSessionId) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }

        webcamStream = stream;

        // Intento opcional de zoom digital si el dispositivo lo soporta
        const zoomTrack = stream.getVideoTracks()[0];
        if (zoomTrack && typeof zoomTrack.getCapabilities === 'function') {
            const cameraCapabilities = zoomTrack.getCapabilities();
            if (cameraCapabilities.zoom && Number.isFinite(cameraCapabilities.zoom.min)) {
                try {
                    await zoomTrack.applyConstraints({
                        advanced: [{ zoom: cameraCapabilities.zoom.min }]
                    });
                } catch (zoomError) {}
            }
        }

        videoElement.pause();
        videoElement.srcObject = stream;
        videoElement.muted = true;
        videoElement.autoplay = true;
        videoElement.playsInline = true;

        if (videoElement.readyState < HTMLMediaElement.HAVE_METADATA) {
            await new Promise((resolve, reject) => {
                const onLoaded = () => { cleanup(); resolve(); };
                const onError = () => { cleanup(); reject(new Error('No se pudo iniciar la vista de la cámara.')); };
                const cleanup = () => {
                    videoElement.removeEventListener('loadedmetadata', onLoaded);
                    videoElement.removeEventListener('error', onError);
                };
                videoElement.addEventListener('loadedmetadata', onLoaded, { once: true });
                videoElement.addEventListener('error', onError, { once: true });
            });
        }

        if (thisSession !== cameraSessionId) return;
        await videoElement.play();

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.addEventListener('ended', () => {
                if (thisSession === cameraSessionId) {
                    stopWebcamStream();
                }
            }, { once: true });
        }

        const hiddenCanvas = document.createElement('canvas');
        const ctx = hiddenCanvas.getContext('2d');
        if (!ctx) throw new Error('No se pudo preparar el procesamiento de imágenes.');

        // 2. BUCLE INTELIGENTE DE ENVÍO DE FOTOGRAMAS (CAMBIO PRINCIPAL)
        const sendNextFrame = async () => {
            if (thisSession !== cameraSessionId || !webcamStream) return;

            if (!isPaused && videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                isProcessingFrame = true;
                let controller = null;
                try {
                    hiddenCanvas.width = videoElement.videoWidth;
                    hiddenCanvas.height = videoElement.videoHeight;
                    ctx.drawImage(videoElement, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
                    const blob = await new Promise(resolve => hiddenCanvas.toBlob(resolve, 'image/jpeg', 0.6));

                    if (blob && thisSession === cameraSessionId) {
                        const formData = new FormData();
                        formData.append('frame', blob, 'frame.jpg');
                        controller = new AbortController();
                        frameRequestController = controller;
                        const response = await fetch('/api/process_frame', {
                            method: 'POST',
                            body: formData,
                            signal: controller.signal
                        });
                        if (response.ok) {
                            const data = await response.json();
                            if (thisSession === cameraSessionId) {
                                currentDetectedPoseKey = data.detected || 'NEUTRAL';
                            }
                        }
                    }
                } catch (err) {
                    if (err.name !== 'AbortError') console.error('Error procesando la cámara:', err);
                } finally {
                    if (thisSession === cameraSessionId) isProcessingFrame = false;
                    if (controller && frameRequestController === controller) frameRequestController = null;
                }
            }

            if (thisSession === cameraSessionId) {
                frameLoopTimeout = setTimeout(sendNextFrame, 160);
            }
        };

        sendNextFrame();
        nextSimonDicePoseRound();

    } catch (err) {
        if (thisSession !== cameraSessionId) return;
        console.error('Error al acceder a la cámara:', err);
        stopWebcamStream();
        alert('No se pudo iniciar la cámara. Verificá los permisos y volvé a intentar.');
        showScreen('main-menu');
    }
}
function stopWebcamStream() {
    cameraSessionId++;

    if (frameSendInterval) {
        clearInterval(frameSendInterval);
        frameSendInterval = null;
    }
    if (frameLoopTimeout) {
        clearTimeout(frameLoopTimeout);
        frameLoopTimeout = null;
    }
    if (frameRequestController) {
        frameRequestController.abort();
        frameRequestController = null;
    }
    if (diceCheckInterval) {
        clearInterval(diceCheckInterval);
        diceCheckInterval = null;
    }
    clearTimeout(diceRoundTimeout);
    isProcessingFrame = false;

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
        currentUtterance.lang = spanishVoice ? spanishVoice.lang : 'es-ES';
        currentUtterance.rate = 1.25;
        currentUtterance.volume = 1.0;
        window.speechSynthesis.speak(currentUtterance);
    } catch (e) {}
}

function nextSimonDicePoseRound() {
    // Limpiar cualquier temporizador previo para evitar que se superpongan rondas
    if (diceCheckInterval) {
        clearInterval(diceCheckInterval);
        diceCheckInterval = null;
    }
    clearTimeout(diceRoundTimeout);

    if (scoreIncorrect >= 3) {
        stopWebcamStream();
        showResultScreen(
            'game_over',
            '¡Fin de Simón Dice!',
            `Acumulaste 3 errores.\nRondas acertadas: ${scoreCorrect} | Errores: ${scoreIncorrect}`,
            () => showScreen('main-menu')
        );
        return;
    }

    diceRoundCount++;
    currentDetectedPoseKey = "NEUTRAL";
    currentTargetPose = POSES_DICT[Math.floor(Math.random() * POSES_DICT.length)];

    isSimonCommand = (diceRoundCount === 1) ? true : (Math.random() < 0.55);
    const spokenText = isSimonCommand
        ? `Simón dice: ${currentTargetPose.name}`
        : `${currentTargetPose.name}`;

    document.getElementById('dice-target-emoji').innerText = currentTargetPose.emoji;
    speakSimonInstruction(spokenText);

    // 40 ciclos x 150ms = 6 segundos completos para hacer la pose cómodamente
    let timeLimit = 40;
    let roundResolved = false;

    diceCheckInterval = setInterval(() => {
        if (isPaused || roundResolved) return;
        timeLimit--;

        const secondsLeft = Math.ceil((timeLimit * 150) / 1000);
        document.getElementById('dice-feedback-text').innerText =
            `Ronda ${diceRoundCount} (${secondsLeft}s) | Aciertos: ${scoreCorrect} | Errores: ${scoreIncorrect}/3 — ${currentTargetPose.emoji} (Detectado: ${currentDetectedPoseKey})`;

        if (isSimonCommand) {
            if (currentDetectedPoseKey === currentTargetPose.key) {
                roundResolved = true;
                clearInterval(diceCheckInterval);
                diceCheckInterval = null;
                scoreCorrect++;
                playFeedbackSound(true);
                document.getElementById('dice-feedback-text').innerText = `✅ ¡Bien! (${currentTargetPose.emoji})`;
                diceRoundTimeout = setTimeout(nextSimonDicePoseRound, 1000);
            } else if (timeLimit <= 0) {
                roundResolved = true;
                clearInterval(diceCheckInterval);
                diceCheckInterval = null;
                scoreIncorrect++;
                playFeedbackSound(false);
                document.getElementById('dice-feedback-text').innerText = `❌ Tiempo agotado (${scoreIncorrect}/3 errores)`;
                diceRoundTimeout = setTimeout(nextSimonDicePoseRound, 1200);
            }
        } else {
            if (currentDetectedPoseKey === currentTargetPose.key) {
                roundResolved = true;
                clearInterval(diceCheckInterval);
                diceCheckInterval = null;
                scoreIncorrect++;
                playFeedbackSound(false);
                document.getElementById('dice-feedback-text').innerText = `❌ ¡Error! No dije "Simón dice" (${scoreIncorrect}/3 errores)`;
                diceRoundTimeout = setTimeout(nextSimonDicePoseRound, 1200);
            } else if (timeLimit <= 0) {
                roundResolved = true;
                clearInterval(diceCheckInterval);
                diceCheckInterval = null;
                scoreCorrect++;
                playFeedbackSound(true);
                document.getElementById('dice-feedback-text').innerText = `✅ ¡Bien! No caíste en la trampa`;
                diceRoundTimeout = setTimeout(nextSimonDicePoseRound, 1000);
            }
        }
    }, 150);
}
