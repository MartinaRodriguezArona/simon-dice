import os
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

@app.after_request
def add_security_headers(response):
    # Permite explícitamente el uso de la cámara en el navegador del cliente
    response.headers['Permissions-Policy'] = 'camera=(self)'
    return response

ultima_postura_detectada = "NEUTRAL"
game_records = {"intermediate_level_2": 0, "hard_level_3": 0}


@app.route("/")
def inicio():
    return render_template("index.html")


@app.route("/favicon.ico")
def favicon():
    return "", 204


@app.route("/api/classify_landmarks", methods=["POST"])
def clasificar_postura():
    global ultima_postura_detectada
    data = request.get_json(silent=True) or {}
    puntos = data.get("landmarks")

    if not puntos or len(puntos) < 29:
        return jsonify({"detected": "NEUTRAL", "status": "no_landmarks"})

    try:
        nariz = puntos[0]
        o_izq = puntos[7]
        h_izq = puntos[11]
        h_der = puntos[12]
        m_izq = puntos[15]
        m_der = puntos[16]
        d_izq = puntos[19]
        d_der = puntos[20]
        t_izq = puntos[27]
        t_der = puntos[28]

        tocar_nariz = (
            (abs(d_izq["x"] - nariz["x"]) < 0.4 and abs(d_izq["y"] - nariz["y"]) < 0.4)
            or (abs(d_der["x"] - nariz["x"]) < 0.4 and abs(d_der["y"] - nariz["y"]) < 0.4)
            or (abs(m_izq["x"] - nariz["x"]) < 0.45 and abs(m_izq["y"] - nariz["y"]) < 0.45)
            or (abs(m_der["x"] - nariz["x"]) < 0.45 and abs(m_der["y"] - nariz["y"]) < 0.45)
        )

        manos_cabeza = (m_izq["y"] < h_izq["y"]) and (m_der["y"] < h_der["y"]) and (abs(m_izq["x"] - o_izq["x"]) < 0.4)
        am_arriba = (m_izq["y"] < h_izq["y"]) and (m_der["y"] < h_der["y"])
        brazos_cruz = abs(m_izq["x"] - m_der["x"]) < 0.25 and abs(m_izq["y"] - h_izq["y"]) < 0.35
        # Permitimos un pequeño margen de flexibilidad para que no falle si el otro brazo se mueve un poco
        m_der_arriba = (m_der["y"] < h_der["y"]) and (m_izq["y"] > h_izq["y"] - 0.05)
        m_izq_arriba = (m_izq["y"] < h_izq["y"]) and (m_der["y"] > h_der["y"] - 0.05)
        pie_izq_arriba = (t_der["y"] - t_izq["y"]) > 0.08
        pie_der_arriba = (t_izq["y"] - t_der["y"]) > 0.08

        # Cambiá el orden en Python para que evalúe primero el gesto general de manos arriba
        if am_arriba:
            ultima_postura_detectada = "🙌"
        elif manos_cabeza:
            ultima_postura_detectada = "🙆"
        elif tocar_nariz:
            ultima_postura_detectada = "👉👃"
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

    except Exception as e:
        print(f"Error en clasificar_postura: {e}")
        return jsonify({"detected": "NEUTRAL", "status": "error", "message": str(e)}), 500


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
    app.run(host="0.0.0.0", port=port, threaded=True)
