(function () {
    const lienzo = document.getElementById('lienzo');
    const ctx = lienzo.getContext('2d');
    const W = lienzo.width;
    const H = lienzo.height;

    // Canvas ocultos usados solo para calcular el puntaje
    const guideCanvas = document.createElement('canvas');
    guideCanvas.width = W; guideCanvas.height = H;
    const guideCtx = guideCanvas.getContext('2d');

    const toleranceCanvas = document.createElement('canvas');
    toleranceCanvas.width = W; toleranceCanvas.height = H;
    const toleranceCtx = toleranceCanvas.getContext('2d');

    const inkCanvas = document.createElement('canvas');
    inkCanvas.width = W; inkCanvas.height = H;
    const inkCtx = inkCanvas.getContext('2d');

    function dibujarCaracterEn(ctxDestino, opciones) {
        const { relleno, trazo, anchoTrazo } = opciones;
        ctxDestino.clearRect(0, 0, W, H);
        ctxDestino.font = 'bold 380px "Comic Sans MS", "Trebuchet MS", sans-serif';
        ctxDestino.textAlign = 'center';
        ctxDestino.textBaseline = 'middle';
        if (trazo) {
            ctxDestino.lineWidth = anchoTrazo;
            ctxDestino.strokeStyle = trazo;
            ctxDestino.lineJoin = 'round';
            ctxDestino.strokeText(CONFIG.caracter, W / 2, H / 2 + 20);
        }
        if (relleno) {
            ctxDestino.fillStyle = relleno;
            ctxDestino.fillText(CONFIG.caracter, W / 2, H / 2 + 20);
        }
    }

    function dibujarGuiaVisible() {
        ctx.clearRect(0, 0, W, H);
        dibujarCaracterEn(ctx, { relleno: 'rgba(190,190,190,0.55)' });
    }

    // Máscara "núcleo": el cuerpo exacto de la letra/número (para medir cobertura)
    dibujarCaracterEn(guideCtx, { relleno: 'black' });
    // Máscara "tolerancia": versión más ancha (permite un margen de error
    // generoso, pensado para dedos de niños chiquitos)
    dibujarCaracterEn(toleranceCtx, { relleno: 'black', trazo: 'black', anchoTrazo: 70 });

    dibujarGuiaVisible();

    let dibujando = false;
    let ultimoPunto = null;
    let haDibujadoAlgo = false;
    const GROSOR_TRAZO = 22; // trazo más grueso, fácil de seguir con el dedo

    function posDesdeEvento(e) {
        const rect = lienzo.getBoundingClientRect();
        const escalaX = W / rect.width;
        const escalaY = H / rect.height;
        return {
            x: (e.clientX - rect.left) * escalaX,
            y: (e.clientY - rect.top) * escalaY,
        };
    }

    function trazarLinea(c, a, b, color, ancho) {
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.lineWidth = ancho;
        c.strokeStyle = color;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
    }

    function empezarTrazo(e) {
        e.preventDefault();
        lienzo.setPointerCapture(e.pointerId);
        dibujando = true;
        haDibujadoAlgo = true;
        ultimoPunto = posDesdeEvento(e);
        // un toquecito sin arrastre también cuenta
        trazarLinea(ctx, ultimoPunto, ultimoPunto, '#2b6fe0', GROSOR_TRAZO);
        trazarLinea(inkCtx, ultimoPunto, ultimoPunto, '#000000', GROSOR_TRAZO);
        ocultarMensaje();
    }

    function continuarTrazo(e) {
        if (!dibujando) return;
        e.preventDefault();
        const p = posDesdeEvento(e);
        trazarLinea(ctx, ultimoPunto, p, '#2b6fe0', GROSOR_TRAZO);
        trazarLinea(inkCtx, ultimoPunto, p, '#000000', GROSOR_TRAZO);
        ultimoPunto = p;
    }

    function terminarTrazo(e) {
        dibujando = false;
        if (e && e.pointerId !== undefined && lienzo.hasPointerCapture(e.pointerId)) {
            lienzo.releasePointerCapture(e.pointerId);
        }
    }

    // Los eventos "pointer" funcionan igual para mouse, dedo y lápiz óptico,
    // así no hace falta escribir código distinto para PC y celular.
    lienzo.addEventListener('pointerdown', empezarTrazo);
    lienzo.addEventListener('pointermove', continuarTrazo);
    lienzo.addEventListener('pointerup', terminarTrazo);
    lienzo.addEventListener('pointercancel', terminarTrazo);

    document.getElementById('btn-limpiar').addEventListener('click', () => {
        inkCtx.clearRect(0, 0, W, H);
        haDibujadoAlgo = false;
        dibujarGuiaVisible();
        ocultarMensaje();
        const btnSig = document.getElementById('btn-siguiente');
        if (btnSig && btnSig.tagName === 'BUTTON') btnSig.disabled = true;
    });

    function calcularPuntaje() {
        const guiaData = guideCtx.getImageData(0, 0, W, H).data;
        const toleranciaData = toleranceCtx.getImageData(0, 0, W, H).data;
        const inkData = inkCtx.getImageData(0, 0, W, H).data;

        let pixelesGuia = 0, pixelesGuiaCubiertos = 0;
        let pixelesInk = 0, pixelesInkFuera = 0;
        const paso = 2;

        for (let y = 0; y < H; y += paso) {
            for (let x = 0; x < W; x += paso) {
                const idx = (y * W + x) * 4;
                const alphaGuia = guiaData[idx + 3];
                const alphaTolerancia = toleranciaData[idx + 3];
                const alphaInk = inkData[idx + 3];

                if (alphaGuia > 100) {
                    pixelesGuia++;
                    if (alphaInk > 100) pixelesGuiaCubiertos++;
                }
                if (alphaInk > 100) {
                    pixelesInk++;
                    if (alphaTolerancia <= 100) pixelesInkFuera++;
                }
            }
        }

        if (pixelesInk < 20) return 0;

        const cobertura = pixelesGuia > 0 ? pixelesGuiaCubiertos / pixelesGuia : 0;
        const proporcionFuera = pixelesInk > 0 ? pixelesInkFuera / pixelesInk : 0;

        // Penalización más suave por salirse del trazo (pensada para niños chicos)
        let puntaje = cobertura * 100 - proporcionFuera * 40;
        return Math.max(0, Math.min(100, Math.round(puntaje)));
    }

    function mostrarMensaje(texto, clase) {
        const el = document.getElementById('mensaje');
        el.textContent = texto;
        el.className = 'mensaje ' + clase;
    }

    function ocultarMensaje() {
        const el = document.getElementById('mensaje');
        el.textContent = '';
        el.className = 'mensaje';
    }

    function habilitarSiguiente() {
        const btn = document.getElementById('btn-siguiente');
        if (btn && btn.tagName === 'BUTTON') {
            btn.disabled = false;
            btn.addEventListener('click', () => {
                if (CONFIG.siguienteUrl) window.location.href = CONFIG.siguienteUrl;
            }, { once: true });
        }
    }

    // Puntaje mínimo para aprobar: 60 en vez de 70, más alcanzable
    // para la motricidad fina de preescolar.
    const PUNTAJE_MINIMO = 60;

    function verificar() {
        if (!haDibujadoAlgo) {
            mostrarMensaje('¡Dibujá primero sobre la línea punteada! ✏️', 'intenta');
            return;
        }

        const puntaje = calcularPuntaje();

        fetch('/api/guardar_intento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                estudiante_id: CONFIG.estudianteId,
                caracter: CONFIG.caracter,
                tipo: CONFIG.tipo,
                puntaje: puntaje,
            }),
        }).catch(() => {}).finally(() => {
            if (puntaje >= PUNTAJE_MINIMO) {
                mostrarMensaje('¡Genial! Puntaje: ' + puntaje + ' 🎉', 'exito');
                habilitarSiguiente();
            } else if (puntaje >= 35) {
                mostrarMensaje('¡Casi! Puntaje: ' + puntaje + '. ¡Probá de nuevo! 💪', 'intenta');
            } else {
                mostrarMensaje('Puntaje: ' + puntaje + '. ¡Seguí practicando! 🙂', 'intenta');
            }
        });
    }

    document.getElementById('btn-verificar').addEventListener('click', verificar);
})();