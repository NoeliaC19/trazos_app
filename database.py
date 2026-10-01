import sqlite3
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trazos.db")

LETRAS = list("AEIOU")
NUMEROS = [str(n) for n in range(10)]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS niños (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            avatar TEXT DEFAULT '⭐',
            creado_en TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS progreso (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            estudiante_id INTEGER NOT NULL,
            caracter TEXT NOT NULL,
            tipo TEXT NOT NULL CHECK (tipo IN ('letra', 'numero')),
            intentos INTEGER NOT NULL DEFAULT 0,
            mejor_puntaje INTEGER NOT NULL DEFAULT 0,
            completado INTEGER NOT NULL DEFAULT 0,
            actualizado_en TEXT NOT NULL,
            FOREIGN KEY (estudiante_id) REFERENCES niños(id) ON DELETE CASCADE,
            UNIQUE(estudiante_id, caracter, tipo)
        )
    """)

    conn.commit()
    conn.close()


def crear_estudiante(nombre, avatar="⭐"):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO niños (nombre, avatar, creado_en) VALUES (?, ?, ?)",
        (nombre.strip(), avatar, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    nuevo_id = cur.lastrowid
    conn.close()
    return nuevo_id


def listar_estudiantes():
    conn = get_db()
    filas = conn.execute("SELECT * FROM niños ORDER BY creado_en DESC").fetchall()
    conn.close()
    return [dict(f) for f in filas]


def obtener_estudiante(estudiante_id):
    conn = get_db()
    fila = conn.execute("SELECT * FROM niños WHERE id = ?", (estudiante_id,)).fetchone()
    conn.close()
    return dict(fila) if fila else None


def eliminar_estudiante(estudiante_id):
    conn = get_db()
    conn.execute("DELETE FROM niños WHERE id = ?", (estudiante_id,))
    conn.commit()
    conn.close()


def obtener_progreso_mapa(estudiante_id):
    """Devuelve dict {(tipo, caracter): fila_progreso} para un estudiante."""
    conn = get_db()
    filas = conn.execute(
        "SELECT * FROM progreso WHERE estudiante_id = ?", (estudiante_id,)
    ).fetchall()
    conn.close()
    mapa = {}
    for f in filas:
        mapa[(f["tipo"], f["caracter"])] = dict(f)
    return mapa


def guardar_intento(estudiante_id, caracter, tipo, puntaje):
    """Registra un intento y actualiza el mejor puntaje. Se considera
    'completado' cuando el mejor puntaje llega a 60 o más."""
    conn = get_db()
    cur = conn.cursor()
    fila = cur.execute(
        "SELECT * FROM progreso WHERE estudiante_id = ? AND caracter = ? AND tipo = ?",
        (estudiante_id, caracter, tipo),
    ).fetchone()

    ahora = datetime.now(timezone.utc).isoformat()

    if fila is None:
        mejor = puntaje
        completado = 1 if puntaje >= 60 else 0
        cur.execute(
            """INSERT INTO progreso
               (estudiante_id, caracter, tipo, intentos, mejor_puntaje, completado, actualizado_en)
               VALUES (?, ?, ?, 1, ?, ?, ?)""",
            (estudiante_id, caracter, tipo, mejor, completado, ahora),
        )
    else:
        mejor = max(fila["mejor_puntaje"], puntaje)
        completado = 1 if mejor >= 60 else fila["completado"]
        cur.execute(
            """UPDATE progreso
               SET intentos = intentos + 1, mejor_puntaje = ?, completado = ?, actualizado_en = ?
               WHERE id = ?""",
            (mejor, completado, ahora, fila["id"]),
        )

    conn.commit()
    conn.close()
    return mejor, bool(completado)