from flask import Flask, render_template, request, redirect, url_for, jsonify, abort

import database as db

app = Flask(__name__)


@app.before_request
def _ensure_db():
    if not hasattr(app, "_db_ready"):
        db.init_db()
        app._db_ready = True


@app.route("/")
def inicio():
    estudiantes = db.listar_estudiantes()
    return render_template("index.html", estudiantes=estudiantes)


@app.route("/estudiantes", methods=["POST"])
def crear_estudiante():
    nombre = request.form.get("nombre", "").strip()
    avatar = request.form.get("avatar", "⭐")
    if not nombre:
        return redirect(url_for("inicio"))
    nuevo_id = db.crear_estudiante(nombre, avatar)
    return redirect(url_for("practicar", estudiante_id=nuevo_id))


@app.route("/estudiantes/<int:estudiante_id>/eliminar", methods=["POST"])
def eliminar_estudiante(estudiante_id):
    db.eliminar_estudiante(estudiante_id)
    return redirect(url_for("inicio"))


@app.route("/practicar/<int:estudiante_id>")
def practicar(estudiante_id):
    estudiante = db.obtener_estudiante(estudiante_id)
    if not estudiante:
        abort(404)

    progreso_mapa = db.obtener_progreso_mapa(estudiante_id)

    letras = []
    for letra in db.LETRAS:
        fila = progreso_mapa.get(("letra", letra))
        letras.append({
            "caracter": letra,
            "completado": bool(fila["completado"]) if fila else False,
            "mejor_puntaje": fila["mejor_puntaje"] if fila else 0,
        })

    numeros = []
    for numero in db.NUMEROS:
        fila = progreso_mapa.get(("numero", numero))
        numeros.append({
            "caracter": numero,
            "completado": bool(fila["completado"]) if fila else False,
            "mejor_puntaje": fila["mejor_puntaje"] if fila else 0,
        })

    total = len(letras) + len(numeros)
    completados = sum(1 for x in letras + numeros if x["completado"])

    return render_template(
        "practicar.html",
        estudiante=estudiante,
        letras=letras,
        numeros=numeros,
        total=total,
        completados=completados,
    )


@app.route("/trazar/<int:estudiante_id>/<tipo>/<caracter>")
def trazar(estudiante_id, tipo, caracter):
    estudiante = db.obtener_estudiante(estudiante_id)
    if not estudiante:
        abort(404)
    if tipo not in ("letra", "numero"):
        abort(404)

    caracter = caracter.upper() if tipo == "letra" else caracter
    secuencia = db.LETRAS if tipo == "letra" else db.NUMEROS
    if caracter not in secuencia:
        abort(404)

    idx = secuencia.index(caracter)
    siguiente = secuencia[idx + 1] if idx + 1 < len(secuencia) else None

    return render_template(
        "trazar.html",
        estudiante=estudiante,
        tipo=tipo,
        caracter=caracter,
        siguiente=siguiente,
    )


@app.route("/api/guardar_intento", methods=["POST"])
def api_guardar_intento():
    data = request.get_json(force=True)
    estudiante_id = data.get("estudiante_id")
    caracter = data.get("caracter")
    tipo = data.get("tipo")
    puntaje = int(data.get("puntaje", 0))

    if tipo not in ("letra", "numero") or not caracter:
        return jsonify({"error": "datos inválidos"}), 400

    puntaje = max(0, min(100, puntaje))
    mejor, completado = db.guardar_intento(estudiante_id, caracter, tipo, puntaje)
    return jsonify({"mejor_puntaje": mejor, "completado": completado})


if __name__ == "__main__":
    db.init_db()
    app.run(debug=True, host="0.0.0.0", port=5000)