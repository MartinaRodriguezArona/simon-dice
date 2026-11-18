/* ==========================================================================
   ESTADO GLOBAL Y CONFIGURACIÓN
   ========================================================================== */
let usuarioActual = "";
let modoSeleccionado = ""; 
let seleccionNivelPendiente = null;
let estaPausado = false;

// Preferencias de Audio y Voz
let efectosSonidoHabilitados = true;
let musicaFondoHabilitada = true;
let vozHabilitada = true;
const CLAVE_DATOS_JUGADOR = 'simonDicePlayerDataV5';
let datosJugador = { username: '', records: { intermediate_level_2: 0, hard_level_3: 0 } };

// Variables Modo Simón (Colores)
let secuencia = [];
let entradaJugador = [];
let aciertosCorrectos = 0;
let aciertosIncorrectos = 0;
let vidas = 3;
let estaReproduccionActiva = false;
let intervaloReproduccion = null;
let temporizadorRonda = null;
let velocidadReproduccionActual = 600;

// Variables Nivel 3
let faseDificil = 1;
let tiempoRestanteFaseUnoDificil = 60;
let tiempoRestanteFaseDosDificil = 300;
let correctasFaseUnoDificil = 0;
let puntosEtapaUnoDificil = 0;
let rondaEtapaDosDificil = 0;
let puntajeEtapaDosDificil = 0;
let intervaloTemporizadorDificil = null;
let limiteTiempoDificil = null;
let restantePausadoDificil = null;

// Variables Modo Simón Dice
let flujoWebcam = null;
let intervaloEnvioCuadro = null;
let estaProcesandoCuadro = false;
let posturaObjetivoActual = null;
let clavePosturaDetectadaActual = "NEUTRAL";
let intervaloVerificacionDado = null;
let temporizadorRondaDado = null;
let contadorRondasDado = 0;
let esComandoSimon = true;
let enunciacionActual = null;

const DICCIONARIO_POSTURAS = [
    { emoji: '🙌', name: 'Ambas Manos Arriba', key: '🙌' },
    { emoji: '🙋‍♀️', name: 'Mano Derecha Arriba', key: '🙋‍♀️' },
    { emoji: '🙋‍♂️', name: 'Mano Izquierda Arriba', key: '🙋‍♂️' },
    { emoji: '👉👃', name: 'Tocar la Nariz', key: '👉👃' },
    { emoji: '🙉', name: 'Manos en los Oídos', key: '🙉' },
    { emoji: '🙅‍♀️', name: 'Brazos en Cruz', key: '🙅‍♀️' },
    { emoji: '🦵⬅️', name: 'Pie Izquierdo Arriba', key: '🦵⬅️' },
    { emoji: '🦵➡️', name: 'Pie Derecho Arriba', key: '🦵➡️' }
];


/* --- SÍNTESIS DE AUDIO Y MULTIMEDIA --- */
const contextoAudio = new (window.AudioContext || window.webkitAudioContext)();
const FRECUENCIAS_PANEL = [261.63, 329.63, 392.00, 523.25];
const BASE_IMAGEN_RESULTADO = '/static/images/modern/';
const BASE_SONIDO_RESULTADO = '/static/sounds/';
let callbackContinuarResultado = null;
let audioResultadoActivo = [];
let idSecuenciaAudioResultado = 0;

const definicionesResultados = {
    phase_complete: { image: 'phase_completed.jpg.png', kicker: 'FASE COMPLETADA' },
    level_complete: { image: 'level_complete.jpg.png', kicker: 'NIVEL SUPERADO' },
    survival_unlocked: { image: 'survival_unlocked.jpg.png', sound: 'background_music.wav', kicker: 'NUEVO MODO' },
    victory: { image: 'victory.jpg.png', sounds: ['victory.mp3'], kicker: 'VICTORIA' },
    game_over: { image: 'game_over.jpg.png', sounds: ['gameOverSound.mp3'], kicker: 'PARTIDA FINALIZADA' },
    new_record: { image: 'new_record.jpg.png', sounds: ['victory.mp3'], kicker: 'NUEVO RÉCORD' }
};

function reproducirTonoSonido(frec, duracion = 300, tipo = 'sine') {
    if (!efectosSonidoHabilitados) return;
    try {
        if (contextoAudio.state === 'suspended') contextoAudio.resume();
        const osc = contextoAudio.createOscillator();
        const ganancia = contextoAudio.createGain();
        osc.type = tipo;
        osc.frequency.setValueAtTime(frec, contextoAudio.currentTime);
        ganancia.gain.setValueAtTime(0.15, contextoAudio.currentTime);
        ganancia.gain.exponentialRampToValueAtTime(0.00001, contextoAudio.currentTime + (duracion / 1000));
        osc.connect(ganancia);
        ganancia.connect(contextoAudio.destination);
        osc.start();
        osc.stop(contextoAudio.currentTime + (duracion / 1000));
    } catch (error) {}
}

function reproducirSonidoRetroalimentacion(esExitoso) {
    if (esExitoso) {
        reproducirTonoSonido(587.33, 150, 'triangle');
        setTimeout(() => reproducirTonoSonido(880.00, 250, 'triangle'), 150);
    } else {
        reproducirTonoSonido(150, 400, 'sawtooth');
    }
}

function detenerAudioResultado() {
    idSecuenciaAudioResultado++;
    audioResultadoActivo.forEach(audio => { audio.pause(); audio.currentTime = 0; });
    audioResultadoActivo = [];
}

async function reproducirArchivoSonido(nombreArchivo) {
    if (!nombreArchivo || !efectosSonidoHabilitados) return;
    const audio = new Audio(BASE_SONIDO_RESULTADO + nombreArchivo);
    audio.volume = 0.9;
    audioResultadoActivo.push(audio);
    try {
        await audio.play();
        await new Promise(resolver => {
            audio.addEventListener('ended', resolver, { once: true });
            audio.addEventListener('error', resolver, { once: true });
        });
    } catch (error) {}
    audioResultadoActivo = audioResultadoActivo.filter(item => item !== audio);
}

async function reproducirAudioResultado(definicion) {
    detenerAudioResultado();
    const idSec = idSecuenciaAudioResultado;
    const lista = definicion.sounds || (definicion.sound ? [definicion.sound] : []);
    for (const archivo of lista) {
        if (idSec !== idSecuenciaAudioResultado) return;
        await reproducirArchivoSonido(archivo);
    }
}

function mostrarPantallaResultado(tipo, titulo, descripcion, alContinuar) {
    detenerMusica();
    detenerFlujoWebcam();
    detenerCamaraCalibracion();
    const hamburguesa = document.getElementById('btn-hamburger');
    if (hamburguesa) hamburguesa.classList.add('hidden');
    document.getElementById('hamburger-dropdown')?.classList.add('hidden');
    const def = definicionesResultados[tipo];
    if (!def) {
        if (typeof alContinuar === 'function') alContinuar();
        return;
    }
    const superposicion = document.getElementById('result-overlay');
    const img = document.getElementById('result-image');
    document.getElementById('result-kicker').innerText = def.kicker;
    document.getElementById('result-title').innerText = titulo;
    document.getElementById('result-description').innerText = descripcion || '';
    const comp = document.getElementById('record-comparison');
    if (comp) { comp.classList.add('hidden'); comp.innerHTML = ''; }
    img.src = BASE_IMAGEN_RESULTADO + def.image;
    callbackContinuarResultado = alContinuar || null;
    superposicion.classList.remove('hidden');
    reproducirAudioResultado(def);
}

function continuarResultado() {
    const superposicion = document.getElementById('result-overlay');
    if (superposicion) superposicion.classList.add('hidden');
    detenerAudioResultado();
    const cb = callbackContinuarResultado;
    callbackContinuarResultado = null;
    if (typeof cb === 'function') cb();
    if (!superposicion || superposicion.classList.contains('hidden')) reproducirMusica();
}

const musicaFondo = document.getElementById('bg-music');
function reproducirMusica() {
    if (musicaFondo && musicaFondoHabilitada) {
        musicaFondo.volume = 0.3;
        musicaFondo.play().catch(() => {});
    }
}
function detenerMusica() {
    if (musicaFondo) { musicaFondo.pause(); musicaFondo.currentTime = 0; }
}

/* --- GESTIÓN DE DATOS Y NAVEGACIÓN --- */
function cargarDatosJugador() {
    try {
        const guardado = JSON.parse(localStorage.getItem(CLAVE_DATOS_JUGADOR) || '{}');
        datosJugador = { ...datosJugador, ...guardado, records: { ...datosJugador.records, ...(guardado.records || {}) } };
        efectosSonidoHabilitados = guardado.soundEffectsEnabled !== false;
        musicaFondoHabilitada = guardado.backgroundMusicEnabled !== false;
        vozHabilitada = guardado.voiceEnabled !== false;
    } catch (error) {}
}

function guardarDatosJugador() {
    try {
        datosJugador.soundEffectsEnabled = efectosSonidoHabilitados;
        datosJugador.backgroundMusicEnabled = musicaFondoHabilitada;
        datosJugador.voiceEnabled = vozHabilitada;
        localStorage.setItem(CLAVE_DATOS_JUGADOR, JSON.stringify(datosJugador));
    } catch (error) {}
}

function alternarConfiguracion(configuracion) {
    if (configuracion === 'music') musicaFondoHabilitada = !musicaFondoHabilitada;
    if (configuracion === 'effects') efectosSonidoHabilitados = !efectosSonidoHabilitados;
    if (configuracion === 'voice') {
        vozHabilitada = !vozHabilitada;
        if (!vozHabilitada && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    }
    guardarDatosJugador();
    actualizarEtiquetasConfiguracion();
    if (configuracion === 'music') musicaFondoHabilitada ? reproducirMusica() : detenerMusica();
}

function actualizarEtiquetasConfiguracion() {
    document.getElementById('music-setting').textContent = `Música: ${musicaFondoHabilitada ? 'Activada' : 'Desactivada'}`;
    document.getElementById('effects-setting').textContent = `Efectos: ${efectosSonidoHabilitados ? 'Activados' : 'Desactivados'}`;
    document.getElementById('voice-setting').textContent = `Voz: ${vozHabilitada ? 'Activada' : 'Desactivada'}`;
}

function cerrarPanel(id) { document.getElementById(id)?.classList.add('hidden'); }

function mostrarPantalla(idPantalla) {
    // CORRECCIÓN CLAVE: Ocultar también la pantalla de calibración para desbloquear clics
    document.querySelectorAll('.main-wrapper > div, #simon-dice-screen, #calibration-screen').forEach(s => s.classList.add('hidden'));
    const objetivo = document.getElementById(idPantalla);
    if (objetivo) objetivo.classList.remove('hidden');

    const hamburguesa = document.getElementById('btn-hamburger');
    if (idPantalla === 'simon-game-screen' || idPantalla === 'simon-dice-screen' || idPantalla === 'calibration-screen') {
        hamburguesa.classList.remove('hidden');
    } else {
        hamburguesa.classList.add('hidden');
        document.getElementById('hamburger-dropdown').classList.add('hidden');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    cargarDatosJugador();
    if (datosJugador.username) {
        usuarioActual = datosJugador.username;
        document.getElementById('username-input').value = usuarioActual;
        document.getElementById('welcome-title').innerText = `¡HOLA, ${usuarioActual.toUpperCase()}!`;
        mostrarPantalla('main-menu');
    } else {
        mostrarPantalla('screen-login');
    }
});

function guardarUsuarioYMenu() {
    const valor = document.getElementById('username-input').value.trim();
    if (!valor) {
        alert("Por favor ingresa un nombre de usuario.");
        return;
    }
    usuarioActual = valor;
    datosJugador.username = usuarioActual;
    guardarDatosJugador();
    document.getElementById('welcome-title').innerText = `¡HOLA, ${usuarioActual.toUpperCase()}!`;
    reproducirMusica();
    mostrarPantalla('main-menu');
}

function seleccionarModo(modo) {
    reproducirMusica();
    if (modo === 'simon') {
        mostrarPantalla('simon-submenu');
    } else if (modo === 'simon_dice') {
        mostrarReglasNivel('simon_dice');
    }
}

/* --- MENÚ HAMBURGUESA GLOBAL --- */
function alternarMenuGlobal() {
    const desplegable = document.getElementById('hamburger-dropdown');
    desplegable.classList.toggle('hidden');
}

function alternarSilenciarSonido(evento) {
    if (evento) evento.stopPropagation();
    efectosSonidoHabilitados = !efectosSonidoHabilitados;
    musicaFondoHabilitada = efectosSonidoHabilitados;
    if (!musicaFondoHabilitada) detenerMusica(); else reproducirMusica();
    document.getElementById('tooltip-mute').innerText = efectosSonidoHabilitados ? "Mutear Sonido" : "Activar Sonido";
    guardarDatosJugador();
}

function reiniciarPartidaActual(evento) {
    if (evento) evento.stopPropagation();
    document.getElementById('hamburger-dropdown').classList.add('hidden');
    document.getElementById('simon-pause-overlay')?.remove();
    document.getElementById('dice-pause-overlay')?.remove();
    estaPausado = false;
    if (modoSeleccionado === 'simon_dice') {
        detenerFlujoWebcam();
        iniciarProcesoCalibracion();
    } else if (modoSeleccionado === 'simon_dice_calibration') {
        detenerCamaraCalibracion();
        iniciarProcesoCalibracion();
    } else {
        iniciarJuegoSimon(modoSeleccionado);
    }
}

function pausarPartidaActual(evento) {
    if (evento) evento.stopPropagation();
    document.getElementById('hamburger-dropdown').classList.add('hidden');
    estaPausado = !estaPausado;
    const textoPausa = document.getElementById('tooltip-pause');
    
    if (modoSeleccionado === 'simon_dice' || modoSeleccionado === 'simon_dice_calibration') {
        if (estaPausado) {
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            const ov = document.createElement('div');
            ov.id = 'dice-pause-overlay';
            ov.className = 'pause-overlay';
            ov.textContent = 'PAUSA';
            const pantallaObjetivo = modoSeleccionado === 'simon_dice_calibration' ? 'calibration-screen' : 'simon-dice-screen';
            document.getElementById(pantallaObjetivo).appendChild(ov);
            textoPausa.innerText = "Reanudar Partida";
        } else {
            document.getElementById('dice-pause-overlay')?.remove();
            textoPausa.innerText = "Pausar Partida";
        }
    } else {
        if (estaPausado) {
            if (modoSeleccionado === 'hard' && limiteTiempoDificil) {
                restantePausadoDificil = Math.max(0, Math.ceil((limiteTiempoDificil - Date.now()) / 1000));
            }
            const ov = document.createElement('div');
            ov.id = 'simon-pause-overlay';
            ov.className = 'pause-overlay';
            ov.textContent = 'PAUSA';
            document.getElementById('simon-game-screen').appendChild(ov);
            textoPausa.innerText = "Reanudar Partida";
        } else {
            document.getElementById('simon-pause-overlay')?.remove();
            if (modoSeleccionado === 'hard' && restantePausadoDificil !== null) {
                limiteTiempoDificil = Date.now() + restantePausadoDificil * 1000;
                restantePausadoDificil = null;
            }
            textoPausa.innerText = "Pausar Partida";
        }
    }
}

function abandonarPartidaActual(evento) {
    if (evento) evento.stopPropagation();
    document.getElementById('hamburger-dropdown').classList.add('hidden');
    document.getElementById('simon-pause-overlay')?.remove();
    document.getElementById('dice-pause-overlay')?.remove();
    estaPausado = false;
    if (modoSeleccionado === 'simon_dice' || modoSeleccionado === 'simon_dice_calibration') {
        detenerFlujoWebcam();
        detenerCamaraCalibracion();
        mostrarPantalla('main-menu');
    } else {
        limpiarTodosTemporizadoresSimon();
        mostrarPantalla('simon-submenu');
    }
}

/* --- MODAL DE REGLAS --- */
function mostrarReglasNivel(claveModo) {
    seleccionNivelPendiente = claveModo;
    const titulo = document.getElementById('modal-rules-title');
    const desc = document.getElementById('modal-rules-desc');

    if (claveModo === 'easy') {
        titulo.innerText = "SIMÓN - NIVEL 1 (FÁCIL)";
        desc.innerText = "Completa 10 secuencias de colores progresivas para ganar el desafío.";
    } else if (claveModo === 'intermediate') {
        titulo.innerText = "SIMÓN - NIVEL 2 (INTERMEDIO)";
        desc.innerText = "Secuencias infinitas. La velocidad aumenta en cada ronda y tenés 3 corazones (vidas).";
    } else if (claveModo === 'hard') {
        titulo.innerText = "SIMÓN - NIVEL 3 (DIFÍCIL)";
        desc.innerText = "Etapa 1 (Double Challenge): Completa 5 pares de colores en 1 minuto.\nEtapa 2 (Challenge Extreme): Repetí 8 secuencias en orden INVERSO (al revés) con 3 vidas y 5 minutos.";
    } else if (claveModo === 'simon_dice') {
        titulo.innerText = "SIMÓN DICE (CÁMARA)";
        desc.innerText = "Imitá frente a la cámara el gesto que indica el emoji SOLO cuando la voz diga 'Simón dice'. Si no lo dice, quedate quieto.";
    }
    document.getElementById('modal-level-rules').classList.remove('hidden');
}

function iniciarNivelSimonConfirmado() {
    cerrarPanel('modal-level-rules');
    if (contextoAudio.state === 'suspended') contextoAudio.resume();
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
    if (seleccionNivelPendiente === 'simon_dice') {
        modoSeleccionado = 'simon_dice';
        iniciarProcesoCalibracion(); // Inicia la calibración guiada antes del juego
    } else {
        iniciarJuegoSimon(seleccionNivelPendiente);
    }
}

function limpiarTodosTemporizadoresSimon() {
    clearInterval(intervaloReproduccion);
    clearInterval(intervaloTemporizadorDificil);
    clearTimeout(temporizadorRonda);
    intervaloReproduccion = null;
    intervaloTemporizadorDificil = null;
    temporizadorRonda = null;
    estaReproduccionActiva = false;
}

/* ==========================================================================
   MODO SIMÓN
   ========================================================================== */
function iniciarJuegoSimon(nivel) {
    limpiarTodosTemporizadoresSimon();
    modoSeleccionado = nivel;
    estaPausado = false;
    document.getElementById('simon-pause-overlay')?.remove();

    secuencia = [];
    entradaJugador = [];
    aciertosCorrectos = 0;
    aciertosIncorrectos = 0;
    vidas = 3;
    velocidadReproduccionActual = 600;

    faseDificil = 1;
    tiempoRestanteFaseUnoDificil = 60;
    tiempoRestanteFaseDosDificil = 300;
    correctasFaseUnoDificil = 0;
    puntosEtapaUnoDificil = 0;
    rondaEtapaDosDificil = 0;
    puntajeEtapaDosDificil = 0;

    mostrarPantalla('simon-game-screen');
    if (modoSeleccionado === 'hard') reiniciarTemporizadorFaseUnoDificil();
    actualizarSimonHUD();
    siguienteRondaSimon();
}

function formatearTiempo(segundos) {
    const seguro = Math.max(0, segundos);
    return `${String(Math.floor(seguro / 60)).padStart(2, '0')}:${String(seguro % 60).padStart(2, '0')}`;
}

function actualizarSimonHUD() {
    const info = document.getElementById('simon-info');
    const estadisticas = document.getElementById('simon-stats');
    const extra = document.getElementById('simon-extra');

    const visorTemporizador = document.getElementById('simon-timer-display');
    const relleno = document.getElementById('simon-progress-fill');
    const pista = document.querySelector('.progress-track');
    const textoValor = document.getElementById('simon-progress-value');
    const textoEtiqueta = document.getElementById('simon-progress-label');
    const textoMensaje = document.getElementById('simon-progress-message');
    const panelProgreso = document.querySelector('.progress-panel');

    let pct = 0, etiqueta = 'PROGRESO', msg = '', mostrarTemporizador = false, mostrarCorazones = false, mostrarBarra = true;

    if (modoSeleccionado === 'easy') {
        const totalJugado = aciertosCorrectos + aciertosIncorrectos;
        info.innerText = `NIVEL 1: FÁCIL | Ronda: ${secuencia.length} / 10`;
        estadisticas.innerText = `Aciertos: ${aciertosCorrectos} | Errores: ${aciertosIncorrectos}`;
        extra.innerText = ``;
        pct = Math.min(100, (totalJugado / 10) * 100);
        etiqueta = 'meta: 10 rondas';
        msg = '';
    } else if (modoSeleccionado === 'intermediate') {
        info.innerText = `NIVEL 2: INTERMEDIO | Secuencia: ${secuencia.length}`;
        estadisticas.innerText = `Aciertos: ${aciertosCorrectos}`;
        extra.innerText = `Récord a superar: ${datosJugador.records.intermediate_level_2 || 0}`;
        etiqueta = 'VIDAS';
        mostrarCorazones = true;
        mostrarBarra = false;
        msg = '';
    } else if (modoSeleccionado === 'hard') {
        mostrarTemporizador = true;
        if (faseDificil === 1) {
            info.innerText = `NIVEL 3: DOUBLE CHALLENGE | Par: ${correctasFaseUnoDificil + 1}/5`;
            estadisticas.innerText = `Puntos: ${puntosEtapaUnoDificil}`;
            extra.innerText = `Completá 5 pares antes que se agote el tiempo`;
            pct = (tiempoRestanteFaseUnoDificil / 60) * 100;
            visorTemporizador.textContent = `⏱️ ${formatearTiempo(tiempoRestanteFaseUnoDificil)}`;
            etiqueta = 'PROGRESO';
            msg = 'Repetí los 2 colores en el mismo orden.';
        } else {
            info.innerText = `NIVEL 3: CHALLENGE EXTREME | Ronda: ${rondaEtapaDosDificil}/8`;
            estadisticas.innerText = `Puntos: ${puntosEtapaUnoDificil + puntajeEtapaDosDificil}`;
            extra.innerText = `¡Invertí el orden de la secuencia!`;
            mostrarCorazones = true;
            pct = (tiempoRestanteFaseDosDificil / 300) * 100;
            visorTemporizador.textContent = `⏱️ ${formatearTiempo(tiempoRestanteFaseDosDificil)}`;
            etiqueta = 'PROGRESO';
            msg = '¡AL REVÉS! Tocá desde el último color.';
        }
    }

    if (mostrarTemporizador) {
        visorTemporizador.classList.remove('hidden');
    } else {
        visorTemporizador.classList.add('hidden');
    }

    if (mostrarBarra) {
        if (pista) pista.style.display = 'block';
        textoValor.style.display = 'inline';
    } else {
        if (pista) pista.style.display = 'none';
        textoValor.style.display = 'none';
    }

    let elementoVidas = document.getElementById('simon-lives-display');
    if (!elementoVidas && panelProgreso) {
        elementoVidas = document.createElement('div');
        elementoVidas.id = 'simon-lives-display';
        elementoVidas.className = 'lives-display';
        panelProgreso.insertBefore(elementoVidas, textoMensaje);
    }

    if (mostrarCorazones) {
        panelProgreso.classList.add('lives-mode');
        if (elementoVidas) {
            elementoVidas.classList.remove('hidden');
            elementoVidas.style.display = 'block';
            elementoVidas.textContent = `${'❤️'.repeat(Math.max(0, vidas))}${'🖤'.repeat(Math.max(0, 3 - vidas))}`;
        }
    } else {
        panelProgreso.classList.remove('lives-mode');
        if (elementoVidas) {
            elementoVidas.style.display = 'none';
        }
    }

    relleno.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    textoValor.textContent = `${Math.round(pct)}%`;
    textoEtiqueta.textContent = etiqueta;
    textoMensaje.textContent = msg;
}

function siguienteRondaSimon() {
    entradaJugador = [];

    if (modoSeleccionado === 'easy') {
        if ((aciertosIncorrectos + aciertosCorrectos) >= 10) {
            finalizarNivelFacil();
            return;
        }
        secuencia.push(Math.floor(Math.random() * 4));
    } else if (modoSeleccionado === 'intermediate') {
        secuencia.push(Math.floor(Math.random() * 4));
        velocidadReproduccionActual = Math.max(220, 600 - (secuencia.length - 1) * 35);
    } else if (modoSeleccionado === 'hard') {
        if (faseDificil === 1) {
            if (correctasFaseUnoDificil == 4) {
                detenerTemporizadorDificil();
                mostrarPantallaResultado('survival_unlocked', '¡Comienza CHALLENGE EXTREME!', 'Invertí el orden de las 8 secuencias. Tenés 3 corazones.', iniciarFaseDosDificil);
                return;
            }
            secuencia = [Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)];
        } else {
            if (rondaEtapaDosDificil >= 8) {
                finalizarFaseDosDificil(true);
                return;
            }
            rondaEtapaDosDificil++;
            const lon = rondaEtapaDosDificil <= 3 ? 2 : rondaEtapaDosDificil <= 6 ? 3 : 4;
            secuencia = Array.from({ length: lon }, () => Math.floor(Math.random() * 4));
        }
    }

    actualizarSimonHUD();
    reproducirSecuencia();
}

function reproducirSecuencia() {
    clearInterval(intervaloReproduccion);
    estaReproduccionActiva = true;
    let paso = 0;

    intervaloReproduccion = setInterval(() => {
        if (estaPausado) return;
        if (paso >= secuencia.length) {
            clearInterval(intervaloReproduccion);
            intervaloReproduccion = null;
            estaReproduccionActiva = false;
            return;
        }
        activarPanel(secuencia[paso]);
        paso++;
    }, velocidadReproduccionActual);
}

function activarPanel(indice) {
    const pad = document.getElementById(`pad-${indice}`);
    if (!pad) return;
    const duracionDestello = Math.min(350, Math.floor(velocidadReproduccionActual * 0.6));
    pad.classList.add('active');
    reproducirTonoSonido(FRECUENCIAS_PANEL[indice], duracionDestello);
    setTimeout(() => pad.classList.remove('active'), duracionDestello);
}

function manejarClicPanel(indice) {
    if (estaReproduccionActiva || estaPausado || !secuencia.length) return;
    activarPanel(indice);
    entradaJugador.push(indice);

    const indiceActual = entradaJugador.length - 1;
    const panelEsperado = (modoSeleccionado === 'hard' && faseDificil === 2)
        ? secuencia[secuencia.length - 1 - indiceActual]
        : secuencia[indiceActual];

    if (entradaJugador[indiceActual] !== panelEsperado) {
        aciertosIncorrectos++;
        reproducirSonidoRetroalimentacion(false);

        if (modoSeleccionado === 'intermediate' || (modoSeleccionado === 'hard' && faseDificil === 2)) {
            vidas--;
            actualizarSimonHUD();
            if (vidas <= 0) {
                if (modoSeleccionado === 'intermediate') finalizarNivelIntermedio();
                else finalizarFaseDosDificil(false);
                return;
            }
        } else if (modoSeleccionado === 'hard' && faseDificil === 1) {
            ajustarTiempoFaseUnoDificil(-5);
            if (tiempoRestanteFaseUnoDificil <= 0) return;
        }

        actualizarSimonHUD();
        entradaJugador = [];
        temporizadorRonda = setTimeout(reproducirSecuencia, 800);
        return;
    }

    if (entradaJugador.length === secuencia.length) {
        aciertosCorrectos++;
        reproducirSonidoRetroalimentacion(true);
        reproducirArchivoSonido('nextRound.wav');

        if (modoSeleccionado === 'hard') {
            if (faseDificil === 1) {
                correctasFaseUnoDificil++;
                puntosEtapaUnoDificil++;
            } else {
                puntajeEtapaDosDificil++;
            }
        }

        actualizarSimonHUD();
        temporizadorRonda = setTimeout(siguienteRondaSimon, 900);
    }
}

/* --- TEMPORIZADORES NIVEL 3 --- */
function detenerTemporizadorDificil() {
    if (intervaloTemporizadorDificil) clearInterval(intervaloTemporizadorDificil);
    intervaloTemporizadorDificil = null;
    limiteTiempoDificil = null;
}

function reiniciarTemporizadorFaseUnoDificil() {
    tiempoRestanteFaseUnoDificil = 60;
    limiteTiempoDificil = Date.now() + 60000;
    if (intervaloTemporizadorDificil) clearInterval(intervaloTemporizadorDificil);
    intervaloTemporizadorDificil = setInterval(() => {
        if (estaPausado) return;
        tiempoRestanteFaseUnoDificil = Math.max(0, Math.ceil((limiteTiempoDificil - Date.now()) / 1000));
        actualizarSimonHUD();
        if (tiempoRestanteFaseUnoDificil <= 0) finalizarFaseUnoDificil();
    }, 200);
}

function ajustarTiempoFaseUnoDificil(segundos) {
    if (modoSeleccionado !== 'hard' || faseDificil !== 1 || !limiteTiempoDificil) return;
    const rem = Math.max(0, Math.ceil((limiteTiempoDificil - Date.now()) / 1000) + segundos);
    tiempoRestanteFaseUnoDificil = rem;
    limiteTiempoDificil = Date.now() + rem * 1000;
    actualizarSimonHUD();
    if (rem <= 0) finalizarFaseUnoDificil();
}

function finalizarFaseUnoDificil() {
    limpiarTodosTemporizadoresSimon();
    const previo = datosJugador.records.hard_level_3 || 0;
    mostrarResultadoRécord('Nivel 3', puntosEtapaUnoDificil, previo, `Se terminó el tiempo en DOUBLE CHALLENGE.\nPares completados: ${correctasFaseUnoDificil}/5.\nPuntaje: ${puntosEtapaUnoDificil}`, () => mostrarPantalla('simon-submenu'));
}

function iniciarFaseDosDificil() {
    faseDificil = 2;
    rondaEtapaDosDificil = 0;
    puntajeEtapaDosDificil = 0;
    tiempoRestanteFaseDosDificil = 300;
    vidas = 3;
    limiteTiempoDificil = Date.now() + 300000;
    secuencia = [];
    entradaJugador = [];

    document.getElementById('btn-hamburger')?.classList.remove('hidden');

    if (intervaloTemporizadorDificil) clearInterval(intervaloTemporizadorDificil);
    intervaloTemporizadorDificil = setInterval(() => {
        if (estaPausado) return;
        tiempoRestanteFaseDosDificil = Math.max(0, Math.ceil((limiteTiempoDificil - Date.now()) / 1000));
        actualizarSimonHUD();
        if (tiempoRestanteFaseDosDificil <= 0) finalizarFaseDosDificil(false);
    }, 200);
    actualizarSimonHUD();
    siguienteRondaSimon();
}

function finalizarFaseDosDificil(completado = true) {
    limpiarTodosTemporizadoresSimon();
    const previo = datosJugador.records.hard_level_3 || 0;
    const bonificacion = completado ? Math.max(0, tiempoRestanteFaseDosDificil) : 0;
    const total = puntosEtapaUnoDificil + puntajeEtapaDosDificil + bonificacion;
    const desc = completado
        ? `DOUBLE CHALLENGE: ${puntosEtapaUnoDificil} pts\nCHALLENGE EXTREME: ${puntajeEtapaDosDificil} pts\nBonus tiempo: +${bonificacion} pts\nTotal: ${total} pts`
        : `No completaste las 8 rondas.\nPuntaje total obtenido: ${total} pts`;
    mostrarResultadoRécord('Nivel 3', total, previo, desc, () => mostrarPantalla('simon-submenu'), completado);
}

/* --- FINALES Y RÉCORDS --- */
function mostrarResultadoRécord(titulo, puntaje, recordPrevio, detalles, alContinuar, esVictoria = false) {
    const esNuevo = puntaje > recordPrevio;
    const esEmpate = recordPrevio > 0 && puntaje === recordPrevio;
    const claveModo = modoSeleccionado === 'intermediate' ? 'intermediate_level_2' : 'hard_level_3';

    if (esNuevo) {
        datosJugador.records[claveModo] = puntaje;
        guardarDatosJugador();
        fetch('/api/save_record', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: claveModo, score: puntaje })
        }).catch(() => {});
    }

    const tipoPantalla = esNuevo ? 'new_record' : (esVictoria ? 'victory' : 'game_over');
    const tituloPantalla = esNuevo
        ? `¡${titulo}: NUEVO RÉCORD!`
        : esEmpate
            ? `${titulo}: ¡Igualaste tu récord!`
            : esVictoria
                ? `¡${titulo}: Completado!`
                : `${titulo}: Partida finalizada`;

    mostrarPantallaResultado(tipoPantalla, tituloPantalla, detalles, alContinuar);

    const comp = document.getElementById('record-comparison');
    if (comp) {
        comp.innerHTML = `
            <div class="record-stat"><span>RÉCORD ANTERIOR</span><strong>${recordPrevio}</strong></div>
            <div class="record-stat record-current"><span>TU PARTIDA</span><strong>${puntaje}</strong></div>
            <div class="record-status ${esNuevo ? 'is-new' : ''}">${esNuevo ? '🏆 ¡NUEVO RÉCORD!' : esEmpate ? '✨ ¡EMPATE!' : esVictoria ? '🎉 ¡NIVEL SUPERADO!' : '💪 ¡SEGUÍ INTENTANDO!'}</div>`;
        comp.classList.remove('hidden');
    }
}

function finalizarNivelFacil() {
    limpiarTodosTemporizadoresSimon();
    mostrarPantallaResultado('victory', '¡Nivel 1 Completado!', `¡Completaste las 10 secuencias!\nAciertos: ${aciertosCorrectos} | Errores: ${aciertosIncorrectos}`, () => mostrarPantalla('simon-submenu'));
}

function finalizarNivelIntermedio() {
    limpiarTodosTemporizadoresSimon();
    const previo = datosJugador.records.intermediate_level_2 || 0;
    mostrarResultadoRécord('Nivel 2', aciertosCorrectos, previo, `Aciertos de esta partida: ${aciertosCorrectos}\nTe quedaste sin corazones.`, () => mostrarPantalla('simon-submenu'));
}

/* ==========================================================================
   FASE DE CALIBRACIÓN Y TUTORIAL PREVIO
   ========================================================================== */
let detectorCalibracion = null;
let camaraCalibracion = null;
let pasoCalibracion = 'position_check';
let indicePoseTutorial = 0;
let cuadrosConsecutivosCoincidentes = 0;

async function iniciarProcesoCalibracion() {
    limpiarTodosTemporizadoresSimon();
    modoSeleccionado = 'simon_dice_calibration';
    estaPausado = false;
    mostrarPantalla('calibration-screen');

    const elementoVideo = document.getElementById('calibration-video');
    const textoEstado = document.getElementById('calibration-status-text');
    const bannerEmoji = document.getElementById('calibration-target-emoji');

    pasoCalibracion = 'position_check';
    indicePoseTutorial = 0;
    cuadrosConsecutivosCoincidentes = 0;
    bannerEmoji.innerText = "📏";

    try {
        if (typeof Pose === 'undefined') {
            throw new Error("MediaPipe no se cargó correctamente.");
        }

        if (!detectorCalibracion) {
            detectorCalibracion = new Pose({
                locateFile: (file) => `https://unpkg.com/@mediapipe/pose/${file}`
            });
            detectorCalibracion.setOptions({
                modelComplexity: 0,
                smoothLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            const lienzoFueraPantalla = document.createElement('canvas');
            const contextoFueraPantalla = lienzoFueraPantalla.getContext('2d');
            let estaEnviandoCuadroCalib = false;

            detectorCalibracion.onResults(async (resultados) => {
                if (estaEnviandoCuadroCalib || estaPausado) return;
                estaEnviandoCuadroCalib = true;

                try {
                    if (!resultados.poseLandmarks) {
                        textoEstado.innerText = "❌ No te veo frente a la cámara. ¡Acercate!";
                        return;
                    }

                    const puntosReferencia = resultados.poseLandmarks;
                    const nariz = puntosReferencia[0];
                    const hombroIzquierdo = puntosReferencia[11];
                    const hombroDerecho = puntosReferencia[12];

                    if (pasoCalibracion === 'position_check') {
                        if (nariz.x < 0.3) {
                            textoEstado.innerText = "➡️ Movete un poco hacia tu DERECHA";
                            return;
                        }
                        if (nariz.x > 0.7) {
                            textoEstado.innerText = "⬅️ Movete un poco hacia tu IZQUIERDA";
                            return;
                        }

                        const distanciaHombros = Math.abs(hombroIzquierdo.x - hombroDerecho.x);
                        if (distanciaHombros < 0.12) {
                            textoEstado.innerText = "🔍 Estás muy lejos. ¡Acercate más a la cámara!";
                            return;
                        }
                        if (distanciaHombros > 0.65) {
                            textoEstado.innerText = "⚠️ Estás muy cerca. ¡Alejate un poco!";
                            return;
                        }

                        if (elementoVideo.readyState >= 2) {
                            if (lienzoFueraPantalla.width !== elementoVideo.videoWidth) {
                                lienzoFueraPantalla.width = elementoVideo.videoWidth;
                                lienzoFueraPantalla.height = elementoVideo.videoHeight;
                            }
                            contextoFueraPantalla.drawImage(elementoVideo, 0, 0);
                            const datosImagen = contextoFueraPantalla.getImageData(0, 0, lienzoFueraPantalla.width, lienzoFueraPantalla.height);
                            let brillo = 0;
                            for (let i = 0; i < datosImagen.data.length; i += 32) {
                                brillo += (datosImagen.data[i] * 0.299 + datosImagen.data[i+1] * 0.587 + datosImagen.data[i+2] * 0.114);
                            }
                            const brilloPromedio = brillo / (datosImagen.data.length / 32);
                            
                            if (brilloPromedio < 35) {
                                textoEstado.innerText = "💡 Muy poca luz. ¡Prendé una luz o busquemos claridad!";
                                return;
                            }
                        }

                        pasoCalibracion = 'tutorial';
                        hablarInstruccionSimon("Calibración exitosa. Ahora practicaremos las poses.");

                    } else if (pasoCalibracion === 'tutorial') {
                        const poseObjetivo = DICCIONARIO_POSTURAS[indicePoseTutorial];
                        bannerEmoji.innerText = poseObjetivo.emoji;
                        textoEstado.innerText = `Tutorial (${indicePoseTutorial + 1}/${DICCIONARIO_POSTURAS.length}): Hacé la pose -> ${poseObjetivo.name}`;

                        const puntosSimplificados = puntosReferencia.map(p => ({ x: p.x, y: p.y }));
                        const respuesta = await fetch('/api/classify_landmarks', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ landmarks: puntosSimplificados })
                        });
                        
                        if (respuesta.ok) {
                            const datos = await respuesta.json();
                            if (datos.detected === poseObjetivo.key) {
                                cuadrosConsecutivosCoincidentes++;
                                if (cuadrosConsecutivosCoincidentes >= 4) {
                                    cuadrosConsecutivosCoincidentes = 0;
                                    indicePoseTutorial++;
                                    reproducirSonidoRetroalimentacion(true);
                                    
                                    if (indicePoseTutorial >= DICCIONARIO_POSTURAS.length) {
                                        detenerCamaraCalibracion();
                                        iniciarJuegoSimonDice();
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error en calibración:", error);
                } finally {
                    estaEnviandoCuadroCalib = false;
                }
            });
        }

        if (camaraCalibracion) {
            await camaraCalibracion.stop();
        }

        let estaEnviandoCalib = false;
        camaraCalibracion = new Camera(elementoVideo, {
            onFrame: async () => {
                if (!detectorCalibracion || estaEnviandoCalib || estaPausado) return;
                if (elementoVideo.readyState < 2) return;
                estaEnviandoCalib = true;
                try {
                    await detectorCalibracion.send({ image: elementoVideo });
                } catch (error) {} finally {
                    estaEnviandoCalib = false;
                }
            },
            width: 640,
            height: 480
        });

        await camaraCalibracion.start();

    } catch (error) {
        console.error("Error al iniciar la calibración:", error);
        alert("No se pudo iniciar la cámara para la calibración.");
        mostrarPantalla('main-menu');
    }
}

function detenerCamaraCalibracion() {
    if (camaraCalibracion) {
        camaraCalibracion.stop().catch(() => {});
        camaraCalibracion = null;
    }
}


/* ==========================================================================
   MODO SIMÓN DICE (CÁMARA MIO)
   ========================================================================== */
let detectorPostura = null;
let camaraMp = null;
let ultimoTiempoEnviado = 0;

async function iniciarJuegoSimonDice() {
    limpiarTodosTemporizadoresSimon();
    modoSeleccionado = 'simon_dice';
    estaPausado = false;
    mostrarPantalla('simon-dice-screen');

    aciertosCorrectos = 0;
    aciertosIncorrectos = 0;
    contadorRondasDado = 0;
    clavePosturaDetectadaActual = "NEUTRAL";

    const elementoVideo = document.getElementById('webcam-feed');

    try {
        if (typeof Pose === 'undefined') {
            throw new Error("La librería MediaPipe Pose no se ha cargado correctamente en el navegador.");
        }

        if (!detectorPostura) {
            detectorPostura = new Pose({
                locateFile: (file) => {
                    return `https://unpkg.com/@mediapipe/pose/${file}`;
                }
            });
            detectorPostura.setOptions({
                modelComplexity: 0,
                smoothLandmarks: true,
                minDetectionConfidence: 0.4,
                minTrackingConfidence: 0.4
            });
            detectorPostura.onResults(async (resultados) => {
                if (estaPausado || estaProcesandoCuadro) return;
                if (!resultados.poseLandmarks) {
                    clavePosturaDetectadaActual = "NEUTRAL";
                    return;
                }

                const ahora = Date.now();
                if (ahora - ultimoTiempoEnviado < 250) return;
                ultimoTiempoEnviado = ahora;
                estaProcesandoCuadro = true;

                try {
                    const puntosSimplificados = resultados.poseLandmarks.map(p => ({ x: p.x, y: p.y }));
                    const respuesta = await fetch('/api/classify_landmarks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ landmarks: puntosSimplificados })
                    });
                    if (respuesta.ok) {
                        const datos = await respuesta.json();
                        clavePosturaDetectadaActual = datos.detected || "NEUTRAL";
                    }
                } catch (error) {
                    console.error("Error enviando puntos a Python:", error);
                } finally {
                    estaProcesandoCuadro = false;
                }
            });
        }

        if (camaraMp) {
            await camaraMp.stop();
        }

        const lienzoFueraPantalla = document.createElement('canvas');
        const contextoFueraPantalla = lienzoFueraPantalla.getContext('2d');
        let estaEnviandoCuadro = false;

        camaraMp = new Camera(elementoVideo, {
            onFrame: async () => {
                if (estaPausado || !detectorPostura || estaEnviandoCuadro) return;

                if (
                    elementoVideo.readyState < 2 || 
                    elementoVideo.videoWidth === 0 || 
                    elementoVideo.videoHeight === 0 ||
                    elementoVideo.paused ||
                    elementoVideo.ended
                ) {
                    return;
                }

                estaEnviandoCuadro = true;
                try {
                    if (lienzoFueraPantalla.width !== elementoVideo.videoWidth || lienzoFueraPantalla.height !== elementoVideo.videoHeight) {
                        lienzoFueraPantalla.width = elementoVideo.videoWidth;
                        lienzoFueraPantalla.height = elementoVideo.videoHeight;
                    }

                    contextoFueraPantalla.drawImage(elementoVideo, 0, 0, lienzoFueraPantalla.width, lienzoFueraPantalla.height);
                    await detectorPostura.send({ image: lienzoFueraPantalla });
                } catch (error) {
                    // Control silencioso de excepciones
                } finally {
                    estaEnviandoCuadro = false;
                }
            },
            width: 640,
            height: 480
        });

        await camaraMp.start();
        siguienteRondaPoseSimonDice();

    } catch (error) {
        console.error("Error al iniciar cámara o MediaPipe:", error);
        alert("No se pudo inicializar MediaPipe o la webcam. Verifica tu conexión a internet.");
        mostrarPantalla('main-menu');
    }
}

function detenerFlujoWebcam() {
    if (intervaloEnvioCuadro) {
        clearInterval(intervaloEnvioCuadro);
        intervaloEnvioCuadro = null;
    }
    if (intervaloVerificacionDado) {
        clearInterval(intervaloVerificacionDado);
        intervaloVerificacionDado = null;
    }
    clearTimeout(temporizadorRondaDado);
    estaProcesandoCuadro = false;

    if (camaraMp) {
        camaraMp.stop().catch(() => {});
        camaraMp = null;
    }
    if (flujoWebcam) {
        flujoWebcam.getTracks().forEach(track => track.stop());
        flujoWebcam = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function hablarInstruccionSimon(texto) {
    if (!vozHabilitada || !('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        enunciacionActual = new SpeechSynthesisUtterance(texto);
        const voces = window.speechSynthesis.getVoices();
        const vozEspanol = voces.find(v => v.lang.startsWith('es'));
        if (vozEspanol) enunciacionActual.voice = vozEspanol;
        enunciacionActual.lang = vozEspanol ? vozEspanol.lang : 'es-ES';
        enunciacionActual.rate = 1.25;
        enunciacionActual.volume = 1.0;
        window.speechSynthesis.speak(enunciacionActual);
    } catch (error) {}
}

function siguienteRondaPoseSimonDice() {
    if (intervaloVerificacionDado) {
        clearInterval(intervaloVerificacionDado);
        intervaloVerificacionDado = null;
    }
    clearTimeout(temporizadorRondaDado);

    if (aciertosIncorrectos >= 3) {
        detenerFlujoWebcam();
        mostrarPantallaResultado(
            'game_over',
            '¡Fin de Simón Dice!',
            `Acumulaste 3 errores.\nRondas acertadas: ${aciertosCorrectos} | Errores: ${aciertosIncorrectos}`,
            () => mostrarPantalla('main-menu')
        );
        return;
    }

    contadorRondasDado++;
    clavePosturaDetectadaActual = "NEUTRAL";
    posturaObjetivoActual = DICCIONARIO_POSTURAS[Math.floor(Math.random() * DICCIONARIO_POSTURAS.length)];

    esComandoSimon = (contadorRondasDado === 1) ? true : (Math.random() < 0.55);
    const textoHablado = esComandoSimon
        ? `Simón dice: ${posturaObjetivoActual.name}`
        : `${posturaObjetivoActual.name}`;

    document.getElementById('dice-target-emoji').innerText = posturaObjetivoActual.emoji;
    hablarInstruccionSimon(textoHablado);

    let limiteTiempo = 40;
    let rondaResuelta = false;

    intervaloVerificacionDado = setInterval(() => {
        if (estaPausado || rondaResuelta) return;
        limiteTiempo--;

        const segundosRestantes = Math.ceil((limiteTiempo * 150) / 1000);
        document.getElementById('dice-feedback-text').innerText =
            `Ronda ${contadorRondasDado} (${segundosRestantes}s) | Aciertos: ${aciertosCorrectos} | Errores: ${aciertosIncorrectos}/3 — ${posturaObjetivoActual.emoji} (Detectado: ${clavePosturaDetectadaActual})`;

        if (esComandoSimon) {
            if (clavePosturaDetectadaActual === posturaObjetivoActual.key) {
                rondaResuelta = true;
                clearInterval(intervaloVerificacionDado);
                intervaloVerificacionDado = null;
                aciertosCorrectos++;
                reproducirSonidoRetroalimentacion(true);
                document.getElementById('dice-feedback-text').innerText = `✅ ¡Bien! (${posturaObjetivoActual.emoji})`;
                temporizadorRondaDado = setTimeout(siguienteRondaPoseSimonDice, 1000);
            } else if (limiteTiempo <= 0) {
                rondaResuelta = true;
                clearInterval(intervaloVerificacionDado);
                intervaloVerificacionDado = null;
                aciertosIncorrectos++;
                reproducirSonidoRetroalimentacion(false);
                document.getElementById('dice-feedback-text').innerText = `❌ Tiempo agotado (${aciertosIncorrectos}/3 errores)`;
                temporizadorRondaDado = setTimeout(siguienteRondaPoseSimonDice, 1200);
            }
        } else {
            if (clavePosturaDetectadaActual === posturaObjetivoActual.key) {
                rondaResuelta = true;
                clearInterval(intervaloVerificacionDado);
                intervaloVerificacionDado = null;
                aciertosIncorrectos++;
                reproducirSonidoRetroalimentacion(false);
                document.getElementById('dice-feedback-text').innerText = `❌ ¡Error! No dije "Simón dice" (${aciertosIncorrectos}/3 errores)`;
                temporizadorRondaDado = setTimeout(siguienteRondaPoseSimonDice, 1200);
            } else if (limiteTiempo <= 0) {
                rondaResuelta = true;
                clearInterval(intervaloVerificacionDado);
                intervaloVerificacionDado = null;
                aciertosCorrectos++;
                reproducirSonidoRetroalimentacion(true);
                document.getElementById('dice-feedback-text').innerText = `✅ ¡Bien! No caíste en la trampa`;
                temporizadorRondaDado = setTimeout(siguienteRondaPoseSimonDice, 1000);
            }
        }
    }, 150);
}
