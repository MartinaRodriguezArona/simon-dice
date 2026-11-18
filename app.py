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
    model_complexity=0,
    smooth_landmarks=False,
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
        return jsonify({"detected": "NEUTRAL", "status": "no_file"}), 400

    archivo = request.files["frame"]
    bytes_img = np.frombuffer(archivo.read(), np.uint8)
    fotograma = cv2.imdecode(bytes_img, cv2.IMREAD_COLOR)

    if fotograma is None:
        return jsonify({"detected": "NEUTRAL", "status": "bad_frame"}), 400

    rgb = cv2.cvtColor(fotograma, cv2.COLOR_BGR2RGB)
    resultados = detector_postura.process(rgb)

    if not resultados.pose_landmarks:
        return jsonify({"detected": "NEUTRAL", "status": "cuerpo_no_detectado", "debug": "No se encontraron landmarks"})

    # Si detecta el cuerpo, evaluamos las posturas
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

    # 1. Tocar la nariz
    tocar_nariz = (
    abs(d_izq.x - nariz.x) < 0.4 and abs(d_izq.y - nariz.y) < 0.4
    ) or (
    abs(d_der.x - nariz.x) < 0.4 and abs(d_der.y - nariz.y) < 0.4
    ) or (
    abs(m_izq.x - nariz.x) < 0.45 and abs(m_izq.y - nariz.y) < 0.45
    ) or (
    abs(m_der.x - nariz.x) < 0.45 and abs(m_der.y - nariz.y) < 0.45
    )

    # 2. Manos a la cabeza
    manos_cabeza = (m_izq.y < h_izq.y) and (m_der.y < h_der.y) and (abs(m_izq.x - o_izq.x) < 0.4)

    # 3. Ambas manos arriba (por encima de los hombros)
    am_arriba = (m_izq.y < h_izq.y) and (m_der.y < h_der.y)

    # 4. Brazos cruzados
    # Brazos cruzados: las muñecas se cruzan cerca del centro del torso
    brazos_cruz = abs(m_izq.x - m_der.x) < 0.25 and abs(m_izq.y - h_izq.y) < 0.35

    # 5. Una sola mano arriba
    m_izq_arriba = (m_izq.y < h_izq.y) and not (m_der.y < h_der.y)
    m_der_arriba = (m_der.y < h_der.y) and not (m_izq.y < h_izq.y)

    # 6. Pies arriba
    pie_izq_arriba = (t_der.y - t_izq.y) > 0.08
    pie_der_arriba = (t_izq.y - t_der.y) > 0.08

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

    return jsonify({"detected": ultima_postura_detectada, "status": "ok"})


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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
