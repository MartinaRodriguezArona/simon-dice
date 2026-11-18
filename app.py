import os
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

@app.after_request
def add_security_headers(response):
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
        o_der = puntos[8]
        h_izq = puntos[11]
        h_der = puntos[12]
        m_izq = puntos[15]
        m_der = puntos[16]
        d_izq = puntos[19]
        d_der = puntos[20]
        t_izq = puntos[27]
        t_der = puntos[28]

        # 1. Ambas manos arriba (🙌): ambas muñecas arriba de los hombros y por encima de la nariz
        am_arriba = (
            (m_izq["y"] < h_izq["y"] - 0.05)
            and (m_der["y"] < h_der["y"] - 0.05)
            and (m_izq["y"] < nariz["y"])
            and (m_der["y"] < nariz["y"])
        )

        # 2. Manos en los oídos (🙉): cada muñeca cerca de su oreja correspondiente y separadas entre sí
        manos_oidos = (
            (abs(m_izq["x"] - o_izq["x"]) < 0.22 and abs(m_izq["y"] - o_izq["y"]) < 0.22)
            and (abs(m_der["x"] - o_der["x"]) < 0.22 and abs(m_der["y"] - o_der["y"]) < 0.22)
            and (abs(m_izq["x"] - m_der["x"]) > 0.12)
        )

        # 3. Tocar la nariz (👉👃): umbral ajustado al centro de la cara para no pisar 🙉
        tocar_nariz = (
            (abs(d_izq["x"] - nariz["x"]) < 0.18 and abs(d_izq["y"] - nariz["y"]) < 0.18)
            or (abs(d_der["x"] - nariz["x"]) < 0.18 and abs(d_der["y"] - nariz["y"]) < 0.18)
            or (abs(m_izq["x"] - nariz["x"]) < 0.22 and abs(m_izq["y"] - nariz["y"]) < 0.22)
            or (abs(m_der["x"] - nariz["x"]) < 0.22 and abs(m_der["y"] - nariz["y"]) < 0.22)
        )

        # 4. Brazos en cruz (🙅‍♀️)
        brazos_cruz = abs(m_izq["x"] - m_der["x"]) < 0.25 and abs(m_izq["y"] - h_izq["y"]) < 0.35

        # 5. Manos individuales arriba
        m_izq_arriba = m_izq["y"] < (h_izq["y"] - 0.05)
        m_der_arriba = m_der["y"] < (h_der["y"] - 0.05)

        # 6. Pies arriba
        pie_izq_arriba = (t_der["y"] - t_izq["y"]) > 0.05
        pie_der_arriba = (t_izq["y"] - t_der["y"]) > 0.05

        if am_arriba:
            ultima_postura_detectada = "🙌"
        elif m_der_arriba and not m_izq_arriba:
            ultima_postura_detectada = "🙋‍♀️"
        elif m_izq_arriba and not m_der_arriba:
            ultima_postura_detectada = "🙋‍♂️"
        elif manos_oidos:
            ultima_postura_detectada = "🙉"
        elif tocar_nariz:
            ultima_postura_detectada = "👉👃"
        elif brazos_cruz:
            ultima_postura_detectada = "🙅‍♀️"
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
