import os
import threading
import time
import webbrowser
import cv2
import numpy as np
from flask import Flask, jsonify, render_template, request
import mediapipe as mp

app = Flask(__name__)

mp_pose = mp.solutions.pose
detector_postura = mp_pose.Pose(
    static_image_mode=False,
    min_detection_confidence=0.3,
    min_tracking_confidence=0.3,
)

ultima_postura_detectada = "NEUTRAL"
game_records = {"intermediate_level_2": 0, "hard_level_3": 0}


@app.route("/")
def inicio():
    return render_template("index.html")


@app.route("/api/process_frame", methods=["POST"])
def procesar_fotograma():
    global ultima_postura_detectada
    if "frame" not in request.files:
        return jsonify({"detected": "NEUTRAL"}), 400

    archivo = request.files["frame"]
    bytes_img = np.frombuffer(archivo.read(), np.uint8)
    fotograma = cv2.imdecode(bytes_img, cv2.IMREAD_COLOR)

    if fotograma is None:
        return jsonify({"detected": "NEUTRAL"}), 400

    rgb = cv2.cvtColor(fotograma, cv2.COLOR_BGR2RGB)
    resultados = detector_postura.process(rgb)

    # --- BLOQUE DE DETECCIÓN DE POSES FLEXIBLE Y OPTIMIZADO ---
    if resultados.pose_landmarks:
        puntos = resultados.pose_landmarks.landmark
        m_izq = puntos[mp_pose.PoseLandmark.LEFT_WRIST]
        m_der = puntos[mp_pose.PoseLandmark.RIGHT_WRIST]
        d_izq = puntos[mp_pose.PoseLandmark.LEFT_INDEX]
        d_der = puntos[mp_pose.PoseLandmark.RIGHT_INDEX]
        o_izq = puntos[mp_pose.PoseLandmark.LEFT_EAR]
        o_der = puntos[mp_pose.PoseLandmark.RIGHT_EAR]
        h_izq = puntos[mp_pose.PoseLandmark.LEFT_SHOULDER]
        h_der = puntos[mp_pose.PoseLandmark.RIGHT_SHOULDER]
        c_izq = puntos[mp_pose.PoseLandmark.LEFT_HIP]
        c_der = puntos[mp_pose.PoseLandmark.RIGHT_HIP]
        t_izq = puntos[mp_pose.PoseLandmark.LEFT_ANKLE]
        t_der = puntos[mp_pose.PoseLandmark.RIGHT_ANKLE]
        nariz = puntos[mp_pose.PoseLandmark.NOSE]

        # 1. Tocar la nariz (amplio rango de distancia)
        tocar_nariz = (
            abs(d_izq.x - nariz.x) < 0.25 and abs(d_izq.y - nariz.y) < 0.25
        ) or (
            abs(d_der.x - nariz.x) < 0.25 and abs(d_der.y - nariz.y) < 0.25
        ) or (
            abs(m_izq.x - nariz.x) < 0.28 and abs(m_izq.y - nariz.y) < 0.28
        ) or (
            abs(m_der.x - nariz.x) < 0.28 and abs(m_der.y - nariz.y) < 0.28
        )

        # 2. Manos a la cabeza (ambas manos cerca de las orejas o arriba de los hombros)
        manos_cabeza = (
            m_izq.y < h_izq.y 
            and m_der.y < h_der.y 
            and abs(m_izq.x - o_izq.x) < 0.35 
            and abs(m_der.x - o_der.x) < 0.35
        )

        # 3. Ambas manos arriba (por encima de los hombros)
        am_arriba = (m_izq.y < h_izq.y) and (m_der.y < h_der.y)

        # 4. Brazos cruzados en X delante del pecho
        brazos_cruz = (
            m_izq.y < c_izq.y and m_der.y < c_der.y
            and abs(m_izq.x - m_der.x) < abs(h_izq.x - h_der.x) * 1.3
        )

        # 5. Una sola mano arriba
        m_izq_arriba = (m_izq.y < h_izq.y) and not (m_der.y < h_der.y)
        m_der_arriba = (m_der.y < h_der.y) and not (m_izq.y < h_izq.y)

        # 6. Pie izquierdo o derecho arriba
        pie_izq_arriba = (t_der.y - t_izq.y) > 0.10
        pie_der_arriba = (t_izq.y - t_der.y) > 0.10

        # Prioridad de evaluación de gestos
        if manos_cabeza:
            ultima_postura_detectada = "🙆"
        elif tocar_nariz:
            ultima_postura_detectada = "👉👃"
        elif am_arriba:
            ultima_postura_detectada = "🙌"
        elif brazos_cruz:
            ultima_postura_detectada = "🙅‍♀️"
        elif m_der_arriba:
            ultima_postura_detectada = "🙋‍♀️"
        elif m_izq_arriba:
            ultima_postura_detectada = "🙋‍♂️"
        elif pie_izq_arriba:
            ultima_postura_detectada = "🦵⬅️"
        elif pie_der_arriba:
            ultima_postura_detectada = "🦵➡️"
        else:
            ultima_postura_detectada = "NEUTRAL"
    else:
        ultima_postura_detectada = "NEUTRAL"
    # -------------------------------------------------

    return jsonify({"detected": ultima_postura_detectada})


@app.route("/api/save_record", methods=["POST"])
def save_record():
    data = request.get_json()
    mode = data.get("mode")
    score = data.get("score")
    if score > game_records.get(mode, 0):
        game_records[mode] = score
    return jsonify({"saved": True, "new_record": game_records[mode]})


@app.route("/api/records", methods=["GET"])
def get_records():
    return jsonify(game_records)


def abrir_navegador():
    time.sleep(1.2)
    webbrowser.open("http://127.0.0.1:5000")


if __name__ == "__main__":
    app.run()
