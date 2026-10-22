/* =========================================================================
   Pasillo Seguro · app.js  (lógica principal)
   ========================================================================= */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hhmm = ts => ts ? new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  const fecha = ts => new Date(ts).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const dur = ms => { if (ms == null || ms < 0) return '—'; const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000); return m + ' min ' + String(s).padStart(2, '0') + ' s'; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ----------------------------- IndexedDB ----------------------------- */
  const DB = {
    db: null,
    abrir() {
      return new Promise((ok, mal) => {
        const r = indexedDB.open(window.PS_DB || 'pasillo-seguro', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.db = r.result; ok(); };
        r.onerror = () => mal(r.error);
      });
    },
    _tx(modo, fn) {
      return new Promise((ok, mal) => {
        const tx = this.db.transaction('kv', modo); const st = tx.objectStore('kv');
        const req = fn(st); tx.oncomplete = () => ok(req && req.result); tx.onerror = () => mal(tx.error);
      });
    },
    get(k) { return this._tx('readonly', st => st.get(k)); },
    set(k, v) { return this._tx('readwrite', st => st.put(v, k)); },
    del(k) { return this._tx('readwrite', st => st.delete(k)); },
    limpiar() { return this._tx('readwrite', st => st.clear()); }
  };
  // Valores cifrados en reposo con la llave de la escuela
  async function setEnc(k, v) { await DB.set(k, await PSCrypto.cifrar(S.llave, v)); }
  async function getEnc(k, def) { const c = await DB.get(k); if (!c) return def; try { return await PSCrypto.descifrar(S.llave, c); } catch (e) { return def; } }

  /* ------------------------------ Estado ------------------------------ */
  const CFG_DEF = { escuela: '', docente: '', cargo: '', localidad: '', turno: '', rol: 'grado', modoTurno: '', grados: {}, gradosEsp: {}, gradoActivo: {}, horarios: {}, horarioClases: [], horarioAuto: true, letra: 'grande', recreoEscalonado: true, recreoDif: 5, telDireccion: '', horaCierre: '12:30', minAmarillo: 3, minAlerta: 6, soloIniciales: true, backendUrl: '', backendToken: '', geo: null };
  const S = { cfg: null, llave: null, sesion: null, alumnos: [], eventos: [], incidentes: [], asistencia: {}, alumnosCob: [], deshacer: null, modoConsulta: false, geoWatch: null, geoFuera: 0, cerrando: false, ajustesOK: 0, incFoto: null, incIA: null, incCruce: null };

  /* ------------------------------ UI base ----------------------------- */
  function toast(msg, ms = 3200) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }
  function modal(html) { $('#modal-cuerpo').innerHTML = html; $('#modal').hidden = false; }
  function cerrarModal() { $('#modal').hidden = true; $('#modal-cuerpo').innerHTML = ''; }
  function confirmar(texto, si = 'Sí', no = 'Cancelar') {
    return new Promise(ok => {
      modal(`<p>${esc(texto)}</p><div class="fila"><button class="btn secundario" id="m-no">${esc(no)}</button><button class="btn primario" id="m-si">${esc(si)}</button></div>`);
      $('#m-si').onclick = () => { cerrarModal(); ok(true); };
      $('#m-no').onclick = () => { cerrarModal(); ok(false); };
    });
  }
  function pedirTexto(titulo, { tipo = 'text', placeholder = '', ayuda = '' } = {}) {
    return new Promise(ok => {
      modal(`<h3>${esc(titulo)}</h3>${ayuda ? `<p class="ayuda">${esc(ayuda)}</p>` : ''}<input id="m-in" type="${tipo}" placeholder="${esc(placeholder)}" autocomplete="off">
        <div class="fila"><button class="btn secundario" id="m-no">Cancelar</button><button class="btn primario" id="m-si">Aceptar</button></div>`);
      const i = $('#m-in'); i.focus();
      const fin = v => { cerrarModal(); ok(v); };
      $('#m-si').onclick = () => fin(i.value); $('#m-no').onclick = () => fin(null);
      i.onkeydown = e => { if (e.key === 'Enter') fin(i.value); };
    });
  }
  function mostrar(id) { $$('.pantalla').forEach(p => p.hidden = p.id !== id); }
  function irTab(tab) {
    $$('.tab').forEach(t => t.hidden = t.id !== 'tab-' + tab);
    $$('#nav button').forEach(b => b.classList.toggle('activo', b.dataset.tab === tab));
    if (tab === 'pasillo' && S.sesion) { renderPasillo(); seguirHorario(); }
    if (tab === 'informe') renderInforme();
    if (tab === 'incidentes' && window.PSEvid) PSEvid.render();
    if (tab === 'ajustes') { renderAjustes(); aplicarLetra(); }
    window.scrollTo(0, 0);
  }

  /* ------------------------- Frase maestra ---------------------------- */
  async function verificarFrase() {
    if (Date.now() - S.ajustesOK < 5 * 60000) return true;
    const f = await pedirTexto('Frase maestra', { tipo: 'password', ayuda: 'Necesaria para esta acción.' });
    if (!f) return false;
    try {
      const k = await PSCrypto.derivarLlave(f);
      await PSCrypto.descifrar(k, await DB.get('verif'));
      S.ajustesOK = Date.now(); return true;
    } catch (e) { toast('Frase incorrecta.'); return false; }
  }

  /* ----------------------------- Escáner QR --------------------------- */
  function escanearQR(titulo) {
    return new Promise((ok, mal) => {
      if (!window.Html5Qrcode) { mal(new Error('Falta la librería de QR (abrí la app una vez con internet).')); return; }
      modal(`<h3>${esc(titulo)}</h3><div id="lector" class="lector"></div><button class="btn secundario" id="m-no">Cancelar</button>`);
      const lector = new Html5Qrcode('lector', { verbose: false });
      let listo = false;
      const fin = async (err, txt) => {
        if (listo) return; listo = true;
        try { await lector.stop(); } catch (e) { /* ya detenido */ }
        cerrarModal(); err ? mal(err) : ok(txt);
      };
      $('#m-no').onclick = () => fin(new Error('cancelado'));
      lector.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } },
        txt => fin(null, txt), () => { })
        .catch(e => fin(new Error('No se pudo abrir la cámara: ' + (e.message || e))));
    });
  }

  /* --------------------------- Geolocalización ------------------------ */
  function distanciaM(a, b) {
    const R = 6371000, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function ubicacionActual() {
    return new Promise((ok, mal) => {
      if (!navigator.geolocation) return mal(new Error('Sin GPS disponible.'));
      navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
        e => mal(new Error('No se pudo obtener la ubicación (' + e.message + ').')), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }
  function iniciarVigilanciaGeo() {
    detenerVigilanciaGeo();
    if (!S.cfg.geo || !navigator.geolocation) return;
    S.geoFuera = 0;
    S.geoWatch = navigator.geolocation.watchPosition(p => {
      if (p.coords.accuracy > 120) return; // lectura poco precisa: se ignora
      const d = distanciaM(S.cfg.geo, { lat: p.coords.latitude, lng: p.coords.longitude });
      if (d > S.cfg.geo.radio + 150) {
        S.geoFuera++;
        if (S.geoFuera >= 3) cerrarJornada('El docente se retiró de la institución (ubicación fuera del radio)');
      } else S.geoFuera = 0;
    }, () => { }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 });
  }
  function detenerVigilanciaGeo() { if (S.geoWatch != null) navigator.geolocation.clearWatch(S.geoWatch); S.geoWatch = null; }

  /* ------------------------------ Sesión ------------------------------ */
  function horaDeHoy(hhmmStr, base = Date.now()) {
    const [h, m] = hhmmStr.split(':').map(Number); const d = new Date(base); d.setHours(h, m, 0, 0); return d.getTime();
  }
  async function desbloquear() {
    try {
      const txt = await escanearQR('Escaneá el QR institucional');
      const obj = await PSCrypto.descifrar(S.llave, txt);
      if (obj.t !== 'ESC') throw new Error('Ese código no es el QR institucional.');
      if (obj.vence && new Date().toISOString().slice(0, 10) > obj.vence) throw new Error('QR institucional vencido. Pedí el nuevo en dirección.');
      if (S.cfg.geo) {
        toast('Verificando ubicación…');
        const u = await ubicacionActual();
        const d = distanciaM(S.cfg.geo, u);
        if (d > S.cfg.geo.radio + Math.min(u.acc, 100)) throw new Error(`Estás a ${Math.round(d)} m de la escuela. La app sólo se habilita dentro de la institución.`);
      }
      const turno = turnoParaAhora(), hor = horarioDe(turno);
      const cierre = horaDeHoy(hor.salida);
      if (Date.now() >= cierre) throw new Error(`Tu horario de salida${turno ? ' del turno ' + turno.toLowerCase() : ''} (${hor.salida}) ya pasó. Si hoy te quedás más, cambialo en Ajustes → Mi horario.`);
      S.sesion = { abierta: Date.now(), cierre, turno, entradaProgramada: hor.entrada, salidaProgramada: hor.salida, qr: obj.esc || '' };
      if (turno) { S.cfg.turno = turno; await DB.set('cfg', S.cfg); }
      await DB.set('sesion', S.sesion);
      S.eventos = await getEnc('eventos', []); S.incidentes = await getEnc('incidentes', []); S.asistencia = await getEnc('asistencia', {}); S.alumnosCob = await getEnc('alumnosCob', []);
      entrarApp();
      toast(`Ingreso registrado ${hhmm(S.sesion.abierta)}${turno ? ' · turno ' + turno.toLowerCase() : ''} · salida ${hhmm(cierre)}`, 5000);
      pedirPermisoAvisos();
    } catch (e) { if (e.message !== 'cancelado') toast(e.message, 5000); }
  }

  async function cerrarJornada(motivo, finTs) {
    if (S.cerrando || !S.sesion) return; S.cerrando = true;
    try {
      const fin = finTs || Date.now();
      S.eventos.forEach(ev => { if (!ev.regreso && !ev.retiro) ev.sinRegreso = true; });
      if (S.sesion.cobertura) await terminarCobertura(true);
      if (window.PSEmerg) PSEmerg.estado(null, true);
      const pdf = generarPDF({ motivo, fin });
      const pend = await getEnc('pendientes', []);
      pend.push({ id: uid(), nombre: pdf.nombre, fecha: S.sesion.abierta, b64: pdf.b64, asunto: pdf.asunto, resumen: pdf.resumen });
      await setEnc('pendientes', pend);
      // Borrado de los datos del día (sólo queda el PDF hasta que se envíe)
      S.eventos = []; S.incidentes = []; S.asistencia = {}; S.alumnosCob = []; S.sesion = null; S.deshacer = null;
      await DB.del('eventos'); await DB.del('incidentes'); await DB.del('asistencia'); await DB.del('alumnosCob'); await DB.del('sesion');
      detenerVigilanciaGeo(); $('#aviso-banner').hidden = true;
      await mostrarBloqueo();
      const n = await enviarPendientes();
      toast(n ? 'Jornada cerrada. Informe enviado a la dirección.' : 'Jornada cerrada. Informe guardado: enviarlo desde esta pantalla.', 6000);
    } finally { S.cerrando = false; }
  }

  /* ---------------------------- Backend ------------------------------- */
  async function backend(accion, datos) {
    if (!S.cfg.backendUrl || !S.cfg.backendToken) throw new Error('Configurá el servidor (Apps Script) en Ajustes.');
    const r = await fetch(S.cfg.backendUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: accion, token: S.cfg.backendToken }, datos))
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
  }
  async function enviarPendientes() {
    const pend = await getEnc('pendientes', []);
    if (!pend.length || !S.cfg.backendUrl || !navigator.onLine) return 0;
    let enviados = 0; const quedan = [];
    for (const p of pend) {
      try {
        await backend('informe', { pdf: p.b64, nombreArchivo: p.nombre, asunto: p.asunto, resumen: p.resumen, docente: S.cfg.docente, escuela: S.cfg.escuela });
        enviados++;
      } catch (e) { quedan.push(p); }
    }
    await setEnc('pendientes', quedan);
    if (!$('#pantalla-bloqueo').hidden) renderPendientes();
    return enviados;
  }
  function b64aBlob(b64, tipo) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: tipo }); }

  /* ------------------------------ Alumnos ----------------------------- */
  function iniciales(n) { return n.split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + '.').join(' '); }
  const estaAfuera = id => S.eventos.find(e => e.alumnoId === id && !e.regreso && !e.retiro);
  const retirado = id => S.eventos.find(e => e.alumnoId === id && e.retiro);
  const GRADOS = { 'Mañana': ['A', 'B'], 'Tarde': ['C', 'D'] };
  const gradosDe = t => [1, 2, 3, 4, 5, 6, 7].flatMap(n => GRADOS[t].map(l => `${n}.º ${l}`));
  const HOR_DEF = { 'Mañana': { entrada: '07:30', salida: '12:30' }, 'Tarde': { entrada: '13:30', salida: '18:30' } };
  const horarioDe = t => Object.assign({}, HOR_DEF[t] || { entrada: '', salida: S.cfg.horaCierre }, (S.cfg.horarios || {})[t] || {});
  const hoyIso = () => PSVoz.fechaIso(new Date());
  const ROLES = { grado: 'Docente de grado', especial: 'Profesor/a especial', secretario: 'Secretario/a', vice: 'Vicedirector/a', director: 'Director/a' };
  const esDirectivo = () => ['secretario', 'vice', 'director'].includes(S.cfg.rol);
  const misGrados = t => S.cfg.rol === 'especial' ? ((S.cfg.gradosEsp || {})[t] || []) : (!esDirectivo() && S.cfg.grados[t] ? [S.cfg.grados[t]] : []);
  function gradoPropio(t) {
    const gs = misGrados(t);
    if (S.cfg.rol === 'especial') { const a = (S.cfg.gradoActivo || {})[t]; return gs.includes(a) ? a : gs[0] || ''; }
    return gs[0] || '';
  }
  const gradoActual = () => (S.sesion && S.sesion.cobertura) ? S.sesion.cobertura.grado : gradoPropio(S.cfg.turno);
  const buscarAl = id => S.alumnos.find(a => a.id === id) || S.alumnosCob.find(a => a.id === id);
  const slug = g => PSVoz.norm(g).replace(/\W+/g, '-');
  function turnoParaAhora() {
    const ts = turnosDocente(), ahora = Date.now();
    if (!ts.length) return S.cfg.turno || '';
    for (const t of ts) { const h = horarioDe(t); if (ahora >= horaDeHoy(h.entrada) - 90 * 60000 && ahora < horaDeHoy(h.salida)) return t; }
    return ts.find(t => ahora < horaDeHoy(horarioDe(t).salida)) || ts[ts.length - 1];
  }
  const turnosDocente = () => S.cfg.modoTurno === 'Ambos' ? ['Mañana', 'Tarde'] : S.cfg.modoTurno ? [S.cfg.modoTurno] : [];
  async function guardarEventos() { await setEnc('eventos', S.eventos); }

  async function registrarSalida(al, destino, origen) {
    if (estaAfuera(al.id)) { toast(al.nombre + ' ya figura fuera del aula.'); return; }
    if (retirado(al.id)) { toast(al.nombre + ' ya fue retirado/a de la escuela hoy.'); return; }
    if (S.asistencia[al.id] !== 'P') { S.asistencia[al.id] = 'P'; await setEnc('asistencia', S.asistencia); }
    const dest = destino || 'Baño', tipo = PSVoz.tipoDe(dest);
    const ev = { id: uid(), alumnoId: al.id, nombre: al.nombre, grado: al.grado || '', destino: dest, tipo, retiro: tipo === 'retiro', salida: Date.now(), regreso: null, origenSalida: origen, alerta: false };
    S.eventos.push(ev); S.deshacer = { tipo: 'salida', id: ev.id };
    await guardarEventos(); renderPasillo(); vibrar(40);
    toast(ev.retiro ? `✔ ${al.nombre}: ${ev.destino} · ${hhmm(ev.salida)}` : `✔ ${al.nombre} salió (${ev.destino}) ${hhmm(ev.salida)}`);
  }
  async function registrarRegreso(al, origen) {
    const ev = estaAfuera(al.id);
    if (!ev) { toast(retirado(al.id) ? al.nombre + ' fue retirado/a de la escuela; no se registra regreso.' : al.nombre + ' no figura fuera del aula.'); return; }
    ev.regreso = Date.now(); ev.origenRegreso = origen;
    if (ev.tipo !== 'acomp' && ev.regreso - ev.salida > S.cfg.minAlerta * 60000) ev.alerta = true;
    S.deshacer = { tipo: 'regreso', id: ev.id };
    await guardarEventos(); renderPasillo(); vibrar([30, 40, 30]);
    toast(`✔ ${al.nombre} regresó · ${dur(ev.regreso - ev.salida)}`);
  }
  async function deshacer() {
    const d = S.deshacer; if (!d) return;
    const i = S.eventos.findIndex(e => e.id === d.id); if (i < 0) return;
    if (d.tipo === 'salida') S.eventos.splice(i, 1); else { S.eventos[i].regreso = null; S.eventos[i].alerta = false; }
    S.deshacer = null; await guardarEventos(); renderPasillo(); toast('Acción deshecha.');
  }
  function vibrar(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } }

  function elegirAlumno(cands, titulo) {
    return new Promise(ok => {
      modal(`<h3>${esc(titulo || '¿A quién te referís?')}</h3><div class="lista">${cands.map((c, i) =>
        `<button class="item-btn" data-i="${i}">${esc(c.alumno.nombre)} <small>${esc(c.alumno.grado || '')}</small></button>`).join('')}</div>
        <button class="btn secundario" id="m-no">Cancelar</button>`);
      $$('#modal-cuerpo .item-btn').forEach(b => b.onclick = () => { cerrarModal(); ok(cands[+b.dataset.i].alumno); });
      $('#m-no').onclick = () => { cerrarModal(); ok(null); };
    });
  }

  async function procesarFrase(texto) {
    $('#mic-texto').textContent = '“' + texto + '”';
    if (PSVoz.esAlta(texto)) { abrirAlta(S.cfg.turno, PSVoz.interpretarAlta(texto)); return; }
    let r = PSVoz.interpretar(texto, alumnosVisibles());
    if (!r.candidatos.length) r = PSVoz.interpretar(texto, S.alumnos.concat(S.alumnosCob));
    if (!r.candidatos.length) { toast('No encontré ese nombre en la lista: “' + texto + '”', 4500); return; }
    const al = r.ambiguo ? await elegirAlumno(r.candidatos.slice(0, 6)) : r.candidatos[0].alumno;
    if (!al) return;
    if (r.accion === 'presente' || r.accion === 'ausente') { await marcarAsistencia(al, r.accion === 'presente' ? 'P' : 'A'); toast(`✔ ${al.nombre}: ${r.accion}`); return; }
    const accion = r.accion || (estaAfuera(al.id) ? 'regresa' : 'sale');
    if (accion === 'sale') await registrarSalida(al, r.destino, 'voz'); else await registrarRegreso(al, 'voz');
  }

  function dictar(boton, destinoTexto, alTerminar) {
    const orig = boton.textContent;
    boton.classList.add('escuchando');
    PSVoz.escuchar({
      onParcial: p => { if (destinoTexto) destinoTexto.textContent = p + '…'; },
      onResult: t => alTerminar(t),
      onError: m => toast(m),
      onEnd: () => { boton.classList.remove('escuchando'); boton.textContent = orig; }
    });
  }

  async function qrAlumno() {
    try {
      const txt = await escanearQR('Escaneá el QR del alumno');
      const o = await PSCrypto.descifrar(S.llave, txt);
      if (o.t !== 'AL') throw new Error('Ese código no es de un alumno.');
      let al = buscarAl(o.id);
      if (!al) { al = { id: o.id, nombre: o.n, grado: o.g || '' }; S.alumnos.push(al); await setEnc('alumnos', S.alumnos); }
      if (estaAfuera(al.id)) await registrarRegreso(al, 'QR'); else await registrarSalida(al, $('#destino-manual').value, 'QR');
    } catch (e) { if (e.message !== 'cancelado') toast(e.message, 4500); }
  }

  /* ------------------------------ Alumno nuevo ----------------------------- */
  function abrirAlta(turno, pre = {}, gradoForzado) {
    const enCob = !gradoForzado && S.sesion && S.sesion.cobertura;
    const grado = gradoForzado || (enCob ? S.sesion.cobertura.grado : gradoPropio(turno));
    if (!grado) { toast('Primero elegí tu grado en ⚙️ Ajustes, o tocá “Hoy cubro un grado”.'); return; }
    modal(`<h3>➕ Alumno nuevo en ${esc(grado)}</h3>
      <p class="ayuda">Por voz podés decir: “María Juárez ingresa a la escuela hoy” o “… ingresa el 15 de noviembre”.</p>
      <label>Nombre y apellido<input id="alta-nombre" value="${esc(pre.nombre || '')}" autocomplete="off"></label>
      <button type="button" class="btn secundario" id="alta-mic">🎤 Dictar</button>
      <label>Fecha de ingreso al grado<input type="date" id="alta-fecha" value="${pre.fecha || hoyIso()}"></label>
      <label>Observación (opcional)<input id="alta-obs" placeholder="Ej.: con pase de la Escuela N.º …"></label>
      <label class="btn secundario archivo">📸 O cargá una foto del pase o la lista (cámara o galería)<input type="file" id="alta-foto" accept="image/*" hidden></label>
      <div id="alta-varios"></div>
      <div class="fila"><button type="button" class="btn secundario" id="m-no">Cancelar</button><button type="button" class="btn primario" id="alta-ok">Agregar a la lista</button></div>`);
    $('#m-no').onclick = cerrarModal;
    $('#alta-mic').onclick = () => dictar($('#alta-mic'), null, t => {
      const r = PSVoz.esAlta(t) ? PSVoz.interpretarAlta(t) : { nombre: t.replace(/[.,]/g, ''), fecha: null };
      $('#alta-nombre').value = limpiarNombre(r.nombre); if (r.fecha) $('#alta-fecha').value = r.fecha;
    });
    $('#alta-foto').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      $('#alta-varios').innerHTML = '<p class="cargando">Leyendo el nombre…</p>';
      try {
        const img = await comprimir(f, 2000, 0.85);
        const j = await backend('lista', { imagen: img.dataURL.split(',')[1], mime: 'image/jpeg' });
        const ns = (j.alumnos || []).map(x => typeof x === 'string' ? x : x.nombre).filter(Boolean).map(limpiarNombre);
        if (!ns.length) throw new Error('No encontré nombres en la foto.');
        if (ns.length === 1) { $('#alta-nombre').value = ns[0]; $('#alta-varios').innerHTML = ''; }
        else $('#alta-varios').innerHTML = `<label>Se leyeron ${ns.length} nombres. Dejá sólo los que ingresan (uno por línea):<textarea id="alta-lista" rows="${Math.min(10, ns.length + 1)}">${esc(ns.join('\n'))}</textarea></label>`;
      } catch (err) { $('#alta-varios').innerHTML = `<p class="aviso">${esc(err.message)}</p>`; }
    };
    $('#alta-ok').onclick = async () => {
      const varios = $('#alta-lista') ? $('#alta-lista').value.split('\n') : [$('#alta-nombre').value];
      const nombres = varios.map(limpiarNombre).filter(n => n.length > 2);
      if (!nombres.length) { toast('Escribí o dictá el nombre del alumno.'); return; }
      const fecha = $('#alta-fecha').value || hoyIso(), obs = $('#alta-obs').value.trim();
      let n = 0;
      const destino = enCob ? S.alumnosCob : S.alumnos;
      nombres.forEach(nm => {
        const id = PSCrypto.idAlumno(nm, grado);
        if (destino.some(a => a.id === id)) return;
        destino.push(enCob ? { id, nombre: nm, grado, turno } : { id, nombre: nm, grado, turno, alta: fecha, obs }); n++;
      });
      if (enCob) await setEnc('alumnosCob', S.alumnosCob); else await setEnc('alumnos', S.alumnos);
      cerrarModal();
      if (S.sesion) renderListaAlumnos(); if (!$('#tab-ajustes').hidden) renderAjustes();
      const f = new Date(fecha + 'T12:00').toLocaleDateString('es-AR');
      toast(n ? (fecha > hoyIso() ? `Agregado. Aparece en la lista desde el ${f}.` : `Agregado a ${grado} (ingreso ${f}).`) : 'Ese alumno ya estaba en la lista.', 4500);
    };
  }

  /* ------------------------------ Avisos ----------------------------- */
  function pedirPermisoAvisos() {
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { }
  }
  async function avisar(titulo, texto) {
    vibrar([300, 150, 300]);
    const b = $('#aviso-banner'); b.innerHTML = `<b>⏰ ${esc(titulo)}</b><span>${esc(texto)}</span><button type="button" aria-label="Cerrar aviso">✕</button>`; b.hidden = false;
    b.querySelector('button').onclick = () => { b.hidden = true; };
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (reg) reg.showNotification(titulo, { body: texto, icon: 'icons/icon-192.png', vibrate: [300, 150, 300], tag: 'pasillo-aviso' });
        else new Notification(titulo, { body: texto });
      }
    } catch (e) { }
  }
  function linkCalendario(titulo, detalle, hhmmStr) {
    const d = new Date(); d.setDate(d.getDate() + 1); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
    const [h, m] = hhmmStr.split(':').map(Number); d.setHours(h, m, 0, 0);
    const fmt = x => PSVoz.fechaIso(x).replace(/-/g, '') + 'T' + String(x.getHours()).padStart(2, '0') + String(x.getMinutes()).padStart(2, '0') + '00';
    const fin = new Date(d.getTime() + 10 * 60000);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titulo) + '&details=' + encodeURIComponent(detalle) +
      '&dates=' + fmt(d) + '/' + fmt(fin) + '&ctz=America/Argentina/Buenos_Aires&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  }
  const menos10 = hh => { const [h, m] = hh.split(':').map(Number); const t = h * 60 + m - 10; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };

  /* ------------------- Cambio de salida / retiro del docente ------------------- */
  const MOTIVOS_DOC = ['Problema familiar', 'Problema de salud', 'Trámite personal', 'Indicación de la dirección', 'Otro'];
  function dialogoSalida(modo) {
    if (!S.sesion) return;
    modal(`<h3>${modo === 'ahora' ? '🚪 Me retiro antes' : '⏱ Cambiar mi salida de hoy'}</h3>
      <p class="ayuda">${modo === 'ahora' ? 'Se cierra la jornada ahora, se envía el informe y la app queda bloqueada.' : 'Sólo para hoy. Tu horario de siempre no cambia.'} Queda registrado en el informe.</p>
      ${modo === 'ahora' ? '' : `<label>Nueva hora de salida<input type="time" id="sal-hora" value="${new Date(S.sesion.cierre).toTimeString().slice(0, 5)}"></label>`}
      <label>Motivo<select id="sal-motivo">${MOTIVOS_DOC.map(m => `<option>${m}</option>`).join('')}</select></label>
      <label>Detalle (opcional)<input id="sal-detalle" placeholder="Ej.: con aviso a la dirección"></label>
      <div class="fila"><button type="button" class="btn secundario" id="m-no">Cancelar</button><button type="button" class="btn ${modo === 'ahora' ? 'peligro' : 'primario'}" id="sal-ok">${modo === 'ahora' ? 'Cerrar jornada ahora' : 'Guardar'}</button></div>`);
    $('#m-no').onclick = cerrarModal;
    $('#sal-ok').onclick = async () => {
      const motivo = $('#sal-motivo').value + ($('#sal-detalle').value.trim() ? ': ' + $('#sal-detalle').value.trim() : '');
      if (modo === 'ahora') { cerrarModal(); cerrarJornada('Retiro anticipado del docente (' + motivo + ')'); return; }
      const nueva = horaDeHoy($('#sal-hora').value, S.sesion.abierta);
      if (nueva <= Date.now()) { toast('Esa hora ya pasó. Si te vas ahora, usá “Me retiro antes”.'); return; }
      S.sesion.cambioSalida = { de: hhmm(S.sesion.cierre), a: hhmm(nueva), motivo, ts: Date.now() };
      S.sesion.cierre = nueva; S.sesion.avisado10 = false; await DB.set('sesion', S.sesion);
      cerrarModal(); renderInforme(); tick(); toast('Salida de hoy cambiada a las ' + hhmm(nueva) + '.');
    };
  }

  /* ---------------------------- Render pasillo ------------------------ */
  function renderPasillo() {
    const fuera = S.eventos.filter(e => !e.regreso && !e.retiro), rets = S.eventos.filter(e => e.retiro);
    $('#cont-fuera').textContent = fuera.length;
    $('#lista-fuera').innerHTML = (fuera.length ? fuera.map(e => `
      <div class="fuera ${e.tipo === 'acomp' ? 'acomp' : 'verde'}" data-id="${e.id}">
        <span class="luz" aria-hidden="true"></span>
        <div class="fuera-txt"><strong>${esc(e.nombre)}</strong> <small>${esc(e.grado)}</small><br><small>${esc(e.destino)} · salió ${hhmm(e.salida)}</small></div>
        <div class="crono" data-salida="${e.salida}" data-tipo="${e.tipo || 'solo'}">—</div>
        <button class="btn chico primario" data-regreso="${e.alumnoId}">Regresó</button>
      </div>`).join('') : '<p class="vacio">Nadie fuera del aula.</p>') +
      (rets.length ? '<h4 class="sub-h">Retirados de la escuela hoy</h4>' + rets.map(e => `<div class="fuera retiro"><span class="luz" aria-hidden="true"></span><div class="fuera-txt"><strong>${esc(e.nombre)}</strong> <small>${esc(e.grado)}</small><br><small>${esc(e.destino)} · ${hhmm(e.salida)}</small></div></div>`).join('') : '');
    $$('[data-regreso]').forEach(b => b.onclick = () => { const al = buscarAl(b.dataset.regreso) || { id: b.dataset.regreso, nombre: S.eventos.find(e => e.alumnoId === b.dataset.regreso).nombre }; registrarRegreso(al, 'manual'); });
    renderListaAlumnos();
    const evs = S.eventos.slice().reverse();
    $('#registro-dia').innerHTML = evs.length ? `<table><thead><tr><th>Alumno</th><th>Destino</th><th>Salió</th><th>Volvió</th><th>Tiempo</th></tr></thead><tbody>${evs.map(e =>
      `<tr class="${e.alerta ? 'alerta' : ''}"><td>${esc(e.nombre)}</td><td>${esc(e.destino)}</td><td>${hhmm(e.salida)}</td><td>${hhmm(e.regreso)}</td><td>${e.regreso ? dur(e.regreso - e.salida) : 'afuera'}</td></tr>`).join('')}</tbody></table>` : '<p class="vacio">Sin movimientos.</p>';
    $('#btn-deshacer').disabled = !S.deshacer;
    tick();
  }
  function alumnosVisibles() {
    if (S.sesion && S.sesion.cobertura) return S.alumnosCob.filter(a => a.grado === S.sesion.cobertura.grado);
    const g = gradoPropio(S.cfg.turno), hoy = hoyIso();
    const activos = S.alumnos.filter(a => !a.alta || a.alta <= hoy);
    if (g) return activos.filter(a => a.grado === g);
    if (esDirectivo()) return [];
    return activos.filter(a => !S.cfg.turno || !a.turno || a.turno === S.cfg.turno);
  }
  async function marcarAsistencia(al, v) {
    if (S.asistencia[al.id] === v) delete S.asistencia[al.id]; else S.asistencia[al.id] = v;
    await setEnc('asistencia', S.asistencia); renderListaAlumnos();
  }
  function renderChips() {
    const ts = turnosDocente(), cob = S.sesion && S.sesion.cobertura;
    if (ts.length && !ts.includes(S.cfg.turno)) S.cfg.turno = ts[0];
    $('#chips-turno').innerHTML = cob || ts.length < 2 ? '' : ts.map(t => `<button type="button" data-turno="${t}" class="${t === S.cfg.turno ? 'on' : ''}" ${ts.length === 1 ? 'tabindex="-1"' : ''}>${t === 'Mañana' ? '☀️' : '🌇'} Turno ${t.toLowerCase()}${S.cfg.rol !== 'especial' && gradoPropio(t) ? ' · ' + esc(gradoPropio(t)) : ''}</button>`).join('');
    $$('#chips-turno button').forEach(b => b.onclick = async () => { if (ts.length < 2) return; S.cfg.turno = b.dataset.turno; await DB.set('cfg', S.cfg); renderListaAlumnos(); });
    const gs = misGrados(S.cfg.turno);
    let h = '';
    if (cob) h = `<span class="cob-tag">🔁 Cubriendo <b>${esc(cob.grado)}</b>${cob.reemplaza ? ' · reemplazo de ' + esc(cob.reemplaza) : ''}</span><button type="button" id="btn-fin-cob">Terminar cobertura</button>`;
    else {
      if (S.cfg.rol === 'especial' && !(S.cfg.horarioClases || []).some(x => x.grado)) h += gs.map(g => `<button type="button" data-grado="${esc(g)}" class="${g === gradoPropio(S.cfg.turno) ? 'on' : ''}">${esc(g)}</button>`).join('');
      h += `<button type="button" id="btn-cubrir" class="cubrir">🔁 Hoy cubro un grado</button>`;
    }
    $('#chips-grado').innerHTML = S.sesion ? h : '';
    $$('#chips-grado [data-grado]').forEach(b => b.onclick = async () => { S.cfg.gradoActivo = S.cfg.gradoActivo || {}; S.cfg.gradoActivo[S.cfg.turno] = b.dataset.grado; await DB.set('cfg', S.cfg); renderListaAlumnos(); if (window.PSEmerg) PSEmerg.estado(); });
    const bc = $('#btn-cubrir'); if (bc) bc.onclick = abrirCobertura;
    refrescarHoy();
    if (window.PSEmerg) PSEmerg.hoyBox();
    const bf = $('#btn-fin-cob'); if (bf) bf.onclick = async () => { if (await confirmar('¿Terminar la cobertura y volver a tu lista?', 'Terminar')) terminarCobertura(); };
  }

  /* ------------------------------ Tamaño de letra ------------------------------ */
  const LETRAS = { normal: 16, grande: 18, 'muy-grande': 21 };
  function aplicarLetra() {
    document.documentElement.style.setProperty('--letra', (LETRAS[S.cfg && S.cfg.letra] || 18) + 'px'); document.documentElement.style.removeProperty('font-size');
    $$('#aj-letra button').forEach(b => b.classList.toggle('on', b.dataset.letra === ((S.cfg && S.cfg.letra) || 'grande')));
  }

  /* ------------------------------ Lista de varios grados (archivo) ------------------------------ */
  function parsearMultiGrado(txt) {
    const grupos = {}; let g = null; const vistos = {}, repetidos = [];
    txt.split(/\r?\n/).forEach(l => {
      l = l.trim(); if (!l || l.startsWith('#')) return;
      const cab = l.length <= 30 && /^(grado\s*)?[1-7]\s*[.º°o]*\s*º?\s*(grado)?\s*(secci[oó]n)?\s*["“']?[A-D]["”']?$/i.test(l.replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim()) ? normGrado(l) : null;
      if (cab) { g = cab; grupos[g] = grupos[g] || []; return; }
      if (!g) return;
      const n = limpiarNombre(l); if (n.length < 3) return;
      const k = PSVoz.norm(n);
      if (vistos[k]) { repetidos.push(`${n} (${vistos[k]} y ${g})`); grupos[vistos[k]] = grupos[vistos[k]].filter(x => PSVoz.norm(x) !== k); }
      vistos[k] = g; grupos[g].push(n);
    });
    return { grupos, repetidos };
  }
  /* Lista de alumnos de la escuela, guardada CIFRADA en el sitio (sólo se abre con el código que tiene el docente) */
  async function cargarListaEscuela(soloGrado) {
    if (typeof soloGrado !== 'string') soloGrado = '';
    const cod = await pedirTexto('Código de la lista de alumnos', { placeholder: 'xxxx-xxxx-xxxx-xxxx', ayuda: 'Escribí el código que te pasaron (con o sin guiones). Necesita internet.' });
    if (!cod) return;
    const limpio = cod.toLowerCase().replace(/[^a-z0-9]/g, '');
    let txt;
    try {
      const r = await fetch('datos/l412.enc?v=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('red');
      const enc = (await r.text()).trim();
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(limpio), 'PBKDF2', false, ['deriveKey']);
      const todo = Uint8Array.from(atob(enc.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
      const llave = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: todo.slice(0, 16), iterations: 600000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      try { txt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: todo.slice(16, 28) }, llave, todo.slice(28))); }
      catch (e) { toast('Código incorrecto. Revisalo y probá de nuevo.', 5000); return; }
    } catch (e) { toast('No pude descargar la lista. Fijate que tengas internet y probá de nuevo.', 5000); return; }
    if (soloGrado) {
      const { grupos } = parsearMultiGrado(txt);
      if (!(grupos[soloGrado] || []).length) { toast(`La lista de la escuela no tiene a ${soloGrado}. Cargala con la foto del registro.`, 6000); return; }
      const t = turnoDeGrado(soloGrado);
      await guardarGrupo(grupos[soloGrado].map(n => ({ id: PSCrypto.idAlumno(n, soloGrado), nombre: n, grado: soloGrado, turno: t })), soloGrado, t);
    } else await importarMultiGrado({ text: async () => txt }, true);
    if (!$('#setup-paso2').hidden) renderPaso2();
  }

  async function importarMultiGrado(file, deEscuela) {
    const { grupos, repetidos } = parsearMultiGrado(await file.text());
    const gs = Object.keys(grupos).filter(g => grupos[g].length);
    if (!gs.length) { toast('No encontré grados en el archivo. Cada grado tiene que empezar con una línea como “4.º C”.', 6000); return; }
    const total = gs.reduce((a, g) => a + grupos[g].length, 0);
    const pasarEsp = S.cfg.rol !== 'especial' && gs.length > 1;
    if (!await confirmar(`Encontré ${total} alumnos en ${gs.length} grados: ${gs.map(g => g + ' (' + grupos[g].length + ')').join(', ')}.` +
      (repetidos.length ? ` Alumnos repetidos (quedan sólo en el último grado): ${repetidos.join('; ')}.` : '') +
      ` Se reemplaza la lista de esos grados.${pasarEsp ? ' Tu función pasa a “Profesor/a especial” para poder tener varios grados.' : ''} ¿Cargar?`, 'Cargar')) return;
    const c = S.cfg;
    if (pasarEsp) { c.rol = 'especial'; c.grados = {}; }
    c.gradosEsp = c.gradosEsp || {};
    gs.forEach(g => {
      const t = turnoDeGrado(g);
      S.alumnos = S.alumnos.filter(a => a.grado !== g).concat(grupos[g].map(n => ({ id: PSCrypto.idAlumno(n, g), nombre: n, grado: g, turno: t })));
      if (c.rol === 'especial') { const ge = c.gradosEsp[t] = c.gradosEsp[t] || []; if (!ge.includes(g)) ge.push(g); }
      else c.grados[t] = g;
    });
    ['Mañana', 'Tarde'].forEach(t => { if (c.gradosEsp[t]) c.gradosEsp[t].sort((a, b) => gradosDe(t).indexOf(a) - gradosDe(t).indexOf(b)); });
    const conGrados = t => c.rol === 'especial' ? (c.gradosEsp[t] || []).length > 0 : !!c.grados[t];
    const tieneM = conGrados('Mañana'), tieneT = conGrados('Tarde');
    c.modoTurno = tieneM && tieneT ? 'Ambos' : tieneT ? 'Tarde' : 'Mañana';
    if (!conGrados(c.turno)) c.turno = tieneT && !tieneM ? 'Tarde' : 'Mañana';
    const mios = new Set([...Object.values(c.grados || {}), ...(c.gradosEsp['Mañana'] || []), ...(c.gradosEsp['Tarde'] || [])]);
    S.alumnos = S.alumnos.filter(a => mios.has(a.grado));
    await setEnc('alumnos', S.alumnos); await DB.set('cfg', c); renderAjustes();
    toast(`Listo: ${total} alumnos cargados en ${gs.length} grados.${deEscuela ? '' : ' Ya podés borrar el archivo del celular.'}`, 6000);
  }

  /* ------------------------------ Horario de clases (semana) ------------------------------ */
  const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const DIAS_TXT = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const normGrado = t => { const m = String(t).match(/([1-7])\s*[.º°o]*\s*º?\s*[“"']?([A-D])\b/i); return m ? `${m[1]}.º ${m[2].toUpperCase()}` : null; };
  const turnoDeGrado = g => /[CD]$/.test(g) ? 'Tarde' : 'Mañana';
  const hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  function parsearHorario(txt) {
    const filas = txt.split(/\r?\n/).map(l => l.split(/\t|;|,/).map(c => c.trim())).filter(f => f.some(Boolean));
    if (!filas.length) return [];
    const cab = filas[0].map(c => DIAS_SEM.indexOf(PSVoz.norm(c)));
    const out = [];
    filas.slice(1).forEach(f => {
      const m = (f[0] || '').match(/(\d{1,2})[:.h](\d{2})\D+(\d{1,2})[:.h](\d{2})/);
      if (!m) return;
      const desde = m[1].padStart(2, '0') + ':' + m[2], hasta = m[3].padStart(2, '0') + ':' + m[4];
      f.slice(1).forEach((c, i) => {
        const dia = cab[i + 1]; if (dia < 1 || !c) return;
        if (/recreo/i.test(c)) out.push({ dia, desde, hasta, recreo: true });
        else { const g = normGrado(c); if (g && !/[a-z]{4,}/i.test(c.replace(/grado/i, ''))) out.push({ dia, desde, hasta, grado: g }); else out.push({ dia, desde, hasta, materia: c.slice(0, 40) }); }
      });
    });
    return out.sort((a, b) => a.dia - b.dia || a.desde.localeCompare(b.desde));
  }
  /* Guarda el horario en la configuración. Para profesores especiales, agrega los grados del horario. */
  function aplicarHorario(c, texto) {
    const hc = parsearHorario(texto || '');
    const clases = hc.filter(x => !x.recreo && (c.rol === 'especial' ? x.grado : true));
    if (!clases.length) return null;
    c.horarioClases = hc;
    const nuevos = [];
    if (c.rol === 'especial') {
      c.gradosEsp = c.gradosEsp || {};
      clases.forEach(x => { const t = turnoDeGrado(x.grado); const ge = c.gradosEsp[t] = c.gradosEsp[t] || []; if (!ge.includes(x.grado)) { ge.push(x.grado); nuevos.push(x.grado); } });
      ['Mañana', 'Tarde'].forEach(t => { if (c.gradosEsp[t]) c.gradosEsp[t].sort((a, b) => gradosDe(t).indexOf(a) - gradosDe(t).indexOf(b)); });
      const ts = [...new Set(clases.map(x => turnoDeGrado(x.grado)))];
      const tieneM = ts.includes('Mañana') || c.modoTurno === 'Mañana' || c.modoTurno === 'Ambos', tieneT = ts.includes('Tarde') || c.modoTurno === 'Tarde' || c.modoTurno === 'Ambos';
      c.modoTurno = tieneM && tieneT ? 'Ambos' : tieneT ? 'Tarde' : 'Mañana';
      if (!c.turno || !(c.gradosEsp[c.turno] || []).length) c.turno = tieneT && !tieneM ? 'Tarde' : 'Mañana';
    }
    return { clases, nuevos };
  }
  function horarioATexto(hc) {
    if (!hc || !hc.length) return '';
    const franjas = [...new Set(hc.map(x => x.desde + ' a ' + x.hasta))].sort();
    const dias = [1, 2, 3, 4, 5];
    return ['Horario,' + dias.map(d => DIAS_TXT[d]).join(',')].concat(franjas.map(fr => {
      const [d0, h0] = fr.split(' a ');
      return fr + ',' + dias.map(d => { const x = hc.find(y => y.dia === d && y.desde === d0 && y.hasta === h0); return x ? (x.recreo ? 'RECREO' : x.grado || x.materia) : ''; }).join(',');
    })).join('\n');
  }
  function claseAhora(t = Date.now()) {
    const d = new Date(t).getDay(), h = hm(t), hoy = (S.cfg.horarioClases || []).filter(x => x.dia === d);
    return { actual: hoy.find(x => x.desde <= h && h < x.hasta) || null, proxima: hoy.filter(x => x.desde > h && !x.recreo)[0] || null, hoy, hayHoy: hoy.length > 0 };
  }
  async function seguirHorario() {
    if (!S.sesion || S.sesion.cobertura || S.cfg.horarioAuto === false || S.cfg.rol !== 'especial') return;
    const { actual } = claseAhora();
    if (!actual || !actual.grado) return;
    const clave = PSVoz.fechaIso(new Date()) + '|' + actual.desde;
    if (S._ultFranja === clave) return; // ya se cambió en esta franja: respeta si el docente eligió otro grado
    S._ultFranja = clave;
    const t = turnoDeGrado(actual.grado);
    if (!misGrados(t).includes(actual.grado)) return;
    if (S.cfg.turno === t && gradoPropio(t) === actual.grado) return;
    S.cfg.turno = t; S.cfg.gradoActivo = S.cfg.gradoActivo || {}; S.cfg.gradoActivo[t] = actual.grado;
    await DB.set('cfg', S.cfg); renderListaAlumnos(); vibrar(60);
    toast(`🎵 Ahora tenés ${actual.grado} (${actual.desde} a ${actual.hasta}). La lista cambió sola.`, 5000);
    if (window.PSEmerg) PSEmerg.estado();
  }
  /* Colores por grado (cada grado un color; la D un poco más oscura) y por materia */
  const HUE_GRADO = { 1: 0, 2: 28, 3: 50, 4: 130, 5: 190, 6: 225, 7: 285 };
  function hueDe(x) {
    if (x.recreo) return 35;
    if (x.grado) return HUE_GRADO[x.grado[0]] ?? 210;
    let h = 0; for (const ch of PSVoz.norm(x.materia || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; return h;
  }
  const estiloFranja = x => `--gh:${hueDe(x)};--gl:${x.grado && /D$/.test(x.grado) ? 82 : 90}%`;
  const nombreFranja = x => x.recreo ? '☕ Recreo' : esc(x.grado || x.materia || '');
  const hayHorario = () => (S.cfg.horarioClases || []).length > 0;
  /* Horario grande de hoy: la clase de ahora como semáforo (verde → amarillo → rojo al terminar) y el recreo en rojo latiendo */
  const minDe = hh => { const [a, b] = hh.split(':').map(Number); return a * 60 + b; };
  function htmlHorario(interactivo = true) {
    if (!hayHorario()) return '';
    const { actual, hoy } = claseAhora();
    const esp = S.cfg.rol === 'especial', now = new Date(), mNow = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const activo = esp ? gradoPropio(S.cfg.turno) : '';
    if (!hoy.length) return `<p class="hoy-tit">📅 Hoy no tenés clases.</p>`;
    const sigue = hoy.find(x => minDe(x.desde) > mNow);
    const tag = interactivo ? 'button type="button"' : 'div', cierre = interactivo ? 'button' : 'div';
    let t = `<p class="hoy-tit">📅 Tu horario de hoy${interactivo ? ` · <small>${esp ? 'tocá un grado para ver su lista' : 'tocá una materia para ver tu lista'}</small>` : ''}</p><div class="franjas">`;
    t += hoy.map(x => {
      const d0 = minDe(x.desde), d1 = minDe(x.hasta), ahora = actual === x, pasada = d1 <= mNow;
      const falta = Math.max(0, Math.ceil(d1 - mNow)), pct = Math.min(100, Math.max(0, (mNow - d0) / (d1 - d0) * 100));
      let cls = 'franja';
      if (ahora) cls += x.recreo ? ' late' : falta <= 5 ? ' sem-rojo' : falta <= 10 ? ' sem-amarillo' : ' sem-verde';
      else if (pasada) cls += ' pasada'; else cls += ' futura';
      if (x.recreo) cls += ' recreo';
      if (esp && x.grado && x.grado === activo && interactivo) cls += ' sel';
      const tr = x.recreo && tramosRecreo(x);
      let sub = '';
      if (tr) sub = ahora ? `<small>${mNow < minDe(tr.mid) ? `Sale ${tr.g1} · hasta ${tr.mid}` : `Sale ${tr.g2} · hasta ${x.hasta}`}</small>` : `<small>1.º a 3.º: ${x.desde} · 4.º a 7.º: ${tr.mid}</small>`;
      const etiqueta = ahora ? `<span class="fr-ahora">${x.recreo ? '❤️ RECREO' : 'AHORA'}<br><b>${falta} min</b></span>` : x === sigue ? '<span class="fr-sigue">SIGUE</span>' : '';
      return `<${tag} class="${cls}" style="${estiloFranja(x)}" ${interactivo && x.grado ? `data-fr-grado="${esc(x.grado)}"` : ''} ${interactivo && x.materia ? `data-fr-materia="${esc(x.materia)}"` : ''}>
        <span class="fr-hora">${x.desde}<br>${x.hasta}</span><span class="fr-nom">${nombreFranja(x)}${sub}</span>${etiqueta}${ahora ? `<span class="fr-barra"><i style="width:${pct.toFixed(1)}%"></i></span>` : ''}</${cierre}>`;
    }).join('') + '</div>';
    if (esp && interactivo) t += `<details class="otro-grado"><summary>Otro grado (cambio de horario)</summary><div class="chips">${['Mañana', 'Tarde'].flatMap(tu => misGrados(tu)).map(g => `<button type="button" data-fr-grado="${esc(g)}" class="${g === activo ? 'on' : ''}">${esc(g)}</button>`).join('')}</div></details>`;
    return t;
  }
  const textoClase = () => htmlHorario(true);
  function verLista() { const h = $('#cont-alumnos'); const el = (h && h.closest('h2')) || $('#lista-alumnos'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  async function verListaPropia(materia) {
    const ts = turnosDocente(); const t = ts.find(x => misGrados(x).length) || ts[0];
    if (t && S.cfg.turno !== t) { S.cfg.turno = t; await DB.set('cfg', S.cfg); renderListaAlumnos(); }
    const g = t ? gradoPropio(t) : '';
    toast(`📋 ${materia}${g ? ' · lista de ' + g : ''}`, 2500); vibrar(40); verLista();
  }
  async function activarGrado(g) {
    const t = turnoDeGrado(g);
    if (!misGrados(t).includes(g)) { toast(`${g} no está entre tus grados. Agregalo en Ajustes.`, 5000); return; }
    S.cfg.turno = t; S.cfg.gradoActivo = S.cfg.gradoActivo || {}; S.cfg.gradoActivo[t] = g;
    await DB.set('cfg', S.cfg); renderListaAlumnos(); refrescarHoy(); vibrar(40);
    toast(`📋 Lista de ${g}`, 2500);
    if (window.PSEmerg) PSEmerg.estado();
  }
  function refrescarHoy() {
    const hc = $('#hoy-clase'); if (!hc) return;
    if (!hc.onclick) hc.onclick = e => {
      const b = e.target.closest('[data-fr-grado],[data-fr-materia]'); if (!b) return;
      if (b.dataset.frGrado && S.cfg.rol === 'especial') activarGrado(b.dataset.frGrado).then(verLista);
      else verListaPropia(b.dataset.frMateria || b.dataset.frGrado);
    };
    const abierto = !!hc.querySelector('details[open]');
    const tc = textoClase(); hc.hidden = !tc; if (hc.dataset.t !== tc) { hc.innerHTML = tc; hc.dataset.t = tc; if (abierto) { const dd = hc.querySelector('details'); if (dd) dd.open = true; } } }

  /* Alarma de recreo (sonido + vibración + aviso) */
  let audioCtx = null;
  document.addEventListener('pointerdown', () => { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) { } }, { passive: true });
  function sonar(veces = 3) {
    try {
      const ctx = audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      for (let i = 0; i < veces; i++) [0, 0.25].forEach((dt, j) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + i * 0.8 + dt;
        o.frequency.value = j ? 660 : 880; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.25);
      });
    } catch (e) { }
  }
  /* Recreo escalonado: primero sale el primer ciclo (1.º a 3.º) y después de unos minutos el segundo ciclo (4.º a 6.º) y 7.º */
  const sumaMin = (hh, n) => { const [a, b] = hh.split(':').map(Number); const t = a * 60 + b + n; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  function tramosRecreo(x) {
    if (S.cfg.recreoEscalonado === false) return null;
    const mid = sumaMin(x.desde, +S.cfg.recreoDif || 5);
    if (mid >= x.hasta) return null;
    return { mid, g1: '1.º a 3.º (primer ciclo)', g2: '4.º a 7.º (segundo ciclo y 7.º)' };
  }
  function alarmasHorario() {
    if (!hayHorario()) return;
    const { hoy } = claseAhora(), h = hm(Date.now()), f = PSVoz.fechaIso(new Date());
    S._alarmas = S._alarmas || {};
    hoy.filter(x => x.recreo).forEach(x => {
      const sig = hoy.find(y => y.desde >= x.hasta && !y.recreo);
      const tr = tramosRecreo(x);
      if (h === x.desde && !S._alarmas[f + x.desde + 'i']) { S._alarmas[f + x.desde + 'i'] = 1; sonar(3); avisar('☕ ¡Recreo!', tr ? `Sale ${tr.g1} de ${x.desde} a ${tr.mid}.` : `Recreo de ${x.desde} a ${x.hasta}.`); }
      if (tr && h === tr.mid && !S._alarmas[f + tr.mid + 'm']) { S._alarmas[f + tr.mid + 'm'] = 1; sonar(3); avisar('☕ Recreo · segunda tanda', `Entra el primer ciclo. Sale ${tr.g2} de ${tr.mid} a ${x.hasta}.`); }
      if (h === x.hasta && !S._alarmas[f + x.hasta + 'f']) { S._alarmas[f + x.hasta + 'f'] = 1; sonar(2); avisar('🔔 Terminó el recreo', sig ? `Ahora: ${sig.grado || sig.materia} (${sig.desde} a ${sig.hasta}).` : 'Volvé al aula.'); }
    });
  }

  /* ------------------------------ Cobertura de grado ------------------------------ */
  function abrirCobertura() {
    const todos = [...gradosDe('Mañana'), ...gradosDe('Tarde')];
    modal(`<h3>🔁 Hoy cubro un grado</h3>
      <p class="ayuda">Para cuando falta un docente. La lista del grado se usa sólo hoy y se borra de tu celular al cerrar la jornada.</p>
      <label>¿A quién reemplazás? (opcional)<input id="cob-reemplaza" placeholder="Ej.: Prof. titular de 4.º B"></label>
      <button type="button" class="btn primario" id="cob-qr">📷 Escanear el QR del aula</button>
      <details class="otras"><summary>No hay QR en el aula</summary>
        <p class="ayuda">Tocá el grado. Después podés sacarle foto al registro de ese grado o anotar los nombres por voz.</p>
        <div class="grilla-grados">${todos.map(g => `<button type="button" data-cob="${g}">${g}</button>`).join('')}</div>
      </details>
      <button type="button" class="btn secundario" id="m-no">Cancelar</button>`);
    $('#m-no').onclick = cerrarModal;
    const reemplaza = () => ($('#cob-reemplaza') || {}).value || '';
    $('#cob-qr').onclick = async () => {
      const rep = reemplaza();
      try {
        const txt = await escanearQR('Escaneá el QR del aula');
        const o = await PSCrypto.descifrar(S.llave, txt);
        if (o.t !== 'GRADO') throw new Error('Ese no es el QR de un aula.');
        await iniciarCobertura(o.g, o.tu || '', (o.al || []), o.tit || '', rep);
      } catch (e) { if (e.message !== 'cancelado') toast(e.message, 5000); }
    };
    $$('[data-cob]').forEach(b => b.onclick = async () => {
      const g = b.dataset.cob, rep = reemplaza();
      cerrarModal(); await iniciarCobertura(g, gradosDe('Mañana').includes(g) ? 'Mañana' : 'Tarde', [], '', rep);
      modal(`<h3>${esc(g)} sin lista</h3><p>¿Cómo cargás los alumnos de hoy?</p>
        <label class="btn primario archivo">📸 Foto del registro de ${esc(g)} (cámara o galería)<input type="file" id="cob-foto" accept="image/*" hidden></label>
        <div id="reg-res-cob"></div>
        <button type="button" class="btn secundario" id="m-no">Después (los agrego por voz con “Alumno nuevo”)</button>`);
      $('#m-no').onclick = cerrarModal;
      $('#cob-foto').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) leerRegistroFoto(f, g, '', 'cob'); };
    });
  }
  async function iniciarCobertura(g, turno, nombres, titular, reemplaza) {
    if (S.sesion.cobertura) terminarCobertura(true);
    S.alumnosCob = S.alumnosCob.filter(a => a.grado !== g).concat(nombres.map(n => ({ id: PSCrypto.idAlumno(n, g), nombre: n, grado: g, turno })));
    await setEnc('alumnosCob', S.alumnosCob);
    S.sesion.cobertura = { grado: g, turno, titular, reemplaza: reemplaza || titular, desde: Date.now() };
    await DB.set('sesion', S.sesion); cerrarModal(); renderPasillo(); if (window.PSEmerg) PSEmerg.estado();
    toast(`Cubriendo ${g}${nombres.length ? ' · ' + nombres.length + ' alumnos' : ''}.`, 4500);
  }
  async function terminarCobertura(silencio) {
    const c = S.sesion.cobertura; if (!c) return;
    c.hasta = Date.now(); S.sesion.coberturas = (S.sesion.coberturas || []).concat([c]); delete S.sesion.cobertura;
    await DB.set('sesion', S.sesion); if (!silencio) { renderPasillo(); toast('Cobertura terminada. Volviste a tu lista.'); if (window.PSEmerg) PSEmerg.estado(); }
  }
  async function cargarCobertura(nuevos, g) {
    S.alumnosCob = S.alumnosCob.filter(a => a.grado !== g).concat(nuevos.map(a => ({ ...a, grado: g })));
    await setEnc('alumnosCob', S.alumnosCob); renderPasillo(); toast(`Lista de ${g} cargada para hoy (${nuevos.length}).`);
  }
  async function qrAula(t, g) {
    if (!window.qrcode) { toast('Falta la librería de QR.'); return; }
    const al = S.alumnos.filter(a => a.grado === g && (!a.alta || a.alta <= hoyIso())).map(a => a.nombre);
    if (!al.length) { toast('Primero cargá los alumnos de ' + g + '.'); return; }
    const txt = await PSCrypto.cifrar(S.llave, { t: 'GRADO', g, tu: t, tit: S.cfg.docente, al });
    let q; try { q = qrcode(0, 'L'); q.addData(txt); q.make(); } catch (e) { toast('La lista es demasiado larga para un QR. Usá la lista cifrada.'); return; }
    const url = q.createDataURL(5, 3);
    modal(`<div class="qr-aula"><h3>QR del aula · ${esc(g)}</h3>
      <img src="${url}" alt="QR del aula ${esc(g)}">
      <p><b>${esc(S.cfg.escuela)}</b><br>${esc(g)} · turno ${esc(t.toLowerCase())} · ${al.length} alumnos</p>
      <p class="ayuda">Imprimilo y pegalo en el aula. Si faltás, quien te reemplace lo escanea con “Hoy cubro un grado”. Sólo lo lee esta app. Si cambia la lista, generalo de nuevo.</p>
      <button type="button" class="btn primario" id="qr-desc">⬇️ Guardar imagen para imprimir</button>
      <button type="button" class="btn secundario" id="m-no">Cerrar</button></div>`);
    $('#m-no').onclick = cerrarModal;
    $('#qr-desc').onclick = async () => { const b = await (await fetch(url)).blob(); descargarPDF(b, 'QR-aula-' + slug(g) + '.png'); };
  }

  /* ------------------------------ Necesito un adulto ------------------------------ */
  const MOTIVOS_AYUDA = ['Pelea o agresión', 'Alumno descompuesto o lastimado', 'Situación de un protocolo', 'Persona extraña', 'Tengo que salir del aula', 'Otro'];
  function abrirAyuda() {
    const g = gradoActual();
    modal(`<h3>🙋 Necesito un adulto${g ? ' en ' + esc(g) : ''}</h3>
      <p class="ayuda">Se avisa a la dirección al instante. No pongas nombres de alumnos.</p>
      <div class="ayuda-grilla">${MOTIVOS_AYUDA.map(m => `<button type="button" data-ayuda="${m}">${m}</button>`).join('')}</div>
      <label>Detalle (opcional)<input id="ayuda-det" placeholder="Ej.: en el pasillo del baño"></label>
      <button type="button" class="btn secundario" id="m-no">Cancelar</button>`);
    $('#m-no').onclick = cerrarModal;
    $$('[data-ayuda]').forEach(b => b.onclick = () => enviarAlerta('ayuda', b.dataset.ayuda, $('#ayuda-det').value.trim()));
  }
  async function enviarAlerta(tipo, motivo, detalle, extra) {
    const g = gradoActual(), hora = hhmm(Date.now());
    const asunto = (tipo === 'ayuda' ? '🙋 Necesito un adulto' : '🚨 ' + motivo) + (g ? ' · ' + g : '') + ' · ' + hora;
    const texto = `${S.cfg.docente}${S.cfg.rol ? ' (' + (ROLES[S.cfg.rol] || '') + ')' : ''} ${tipo === 'ayuda' ? 'necesita un adulto' : 'avisa'}${g ? ' en ' + g : ''}. ${tipo === 'ayuda' ? 'Motivo: ' + motivo + '.' : ''} ${detalle || ''} ${extra || ''} (${hora})`.replace(/\s+/g, ' ').trim();
    vibrar([100, 60, 100]);
    let ok = false; try { await backend('alerta', { asunto, texto, escuela: S.cfg.escuela }); ok = true; } catch (e) { }
    const wa = S.cfg.telDireccion ? `https://wa.me/${S.cfg.telDireccion.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}` : '';
    if (tipo === 'ayuda') {
      if (S.sesion) { S.incidentes.push({ id: uid(), tipo: 'protocolo', ts: Date.now(), protocolo: 'Pedido de ayuda: necesito un adulto', situacion: motivo + (detalle ? ' · ' + detalle : ''), pasos: [], nota: ok ? 'Aviso enviado a la dirección.' : 'No se pudo enviar por internet.' }); await setEnc('incidentes', S.incidentes); renderIncidentes(); }
      modal(`<h3>${ok ? '✅ Aviso enviado a la dirección' : '⚠️ No se pudo enviar por internet'}</h3><p>${esc(texto)}</p>
        ${wa ? `<a class="btn primario" href="${wa}" target="_blank" rel="noopener">💬 Mandarlo también por WhatsApp</a>` : '<p class="ayuda">Podés cargar el WhatsApp de la dirección en Ajustes para tener un segundo canal.</p>'}
        ${ok ? '' : '<p class="aviso">Mandá a un alumno de confianza a dirección o pedí ayuda al aula de al lado.</p>'}
        <button type="button" class="btn secundario" id="m-no">Listo</button>`);
      $('#m-no').onclick = cerrarModal;
    }
    return { ok, wa, texto };
  }
  function renderListaAlumnos() {
    renderChips();
    const vis = alumnosVisibles();
    const q = PSVoz.norm($('#buscar-alumno').value);
    const lista = vis.filter(a => !q || PSVoz.norm(a.nombre + ' ' + a.grado).includes(q));
    const nP = vis.filter(a => S.asistencia[a.id] === 'P').length, nA = vis.filter(a => S.asistencia[a.id] === 'A').length;
    $('#cont-alumnos').textContent = vis.length;
    $('#asis-resumen').innerHTML = `<b class="ok">${nP}</b> presentes · <b class="mal">${nA}</b> ausentes · ${vis.length - nP - nA} sin marcar`;
    $('#lista-alumnos').innerHTML = vis.length ? (lista.length ? lista.map(a => {
      const f = estaAfuera(a.id), rt = retirado(a.id), as = S.asistencia[a.id] || '';
      return `<div class="alumno ${as === 'A' ? 'ausente' : ''}">
        <span class="al-nom">${esc(a.nombre)} <small>${esc(a.grado)}</small>${a.alta && (Date.now() - new Date(a.alta + 'T12:00').getTime()) < 30 * 864e5 ? ' <span class="tag-nuevo">Nuevo</span>' : ''}</span>
        <span class="pa"><button type="button" class="${as === 'P' ? 'on p' : ''}" data-asis="P" data-id="${a.id}" aria-label="Presente">P</button><button type="button" class="${as === 'A' ? 'on a' : ''}" data-asis="A" data-id="${a.id}" aria-label="Ausente">A</button></span>
        ${rt ? '<span class="tag-ret">Retirado</span>' : `<button class="btn chico ${f ? 'primario' : 'secundario'}" data-al="${a.id}" ${as === 'A' && !f ? 'disabled' : ''}>${f ? 'Regresó' : 'Sale'}</button>`}</div>`;
    }).join('') : '<p class="vacio">Ningún alumno coincide.</p>') : (S.sesion && S.sesion.cobertura ? '<p class="vacio">Este grado no tiene lista cargada. Agregá los alumnos con “➕ Alumno nuevo” (por voz) o terminá la cobertura.</p>' : esDirectivo() ? '<p class="vacio">No tenés un grado fijo. Tocá “🔁 Hoy cubro un grado” cuando te hagas cargo de uno.</p>' : gradoPropio(S.cfg.turno) ? '<p class="vacio">Todavía no cargaste los alumnos de tu grado. Andá a ⚙️ Ajustes → “Sacar foto del registro”.</p>' : '<p class="vacio">Primero elegí tu función, turno y grado en ⚙️ Ajustes.</p>');
    $$('[data-al]').forEach(b => b.onclick = () => {
      const al = buscarAl(b.dataset.al);
      estaAfuera(al.id) ? registrarRegreso(al, 'manual') : registrarSalida(al, $('#destino-manual').value, 'manual');
    });
    $$('[data-asis]').forEach(b => b.onclick = () => marcarAsistencia(buscarAl(b.dataset.id), b.dataset.asis));
  }
  function tick() {
    const seg = new Date().getSeconds();
    if (!$('#pantalla-bloqueo').hidden) { const bh = $('#bloq-horario'); if (bh && (seg % 15 === 0 || !bh.dataset.ok)) { bh.innerHTML = htmlHorario(false); bh.dataset.ok = 1; } }
    if (S.cfg && S.cfg.horarioClases) alarmasHorario();
    if (!S.sesion) return;
    const ahora = Date.now();
    const d = new Date(ahora), f = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#hoy-fecha').textContent = 'Hoy, ' + f.charAt(0).toUpperCase() + f.slice(1);
    $('#hoy-reloj').textContent = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    $$('.crono').forEach(c => {
      const ms = ahora - +c.dataset.salida; c.textContent = dur(ms);
      const card = c.closest('.fuera');
      if (c.dataset.tipo === 'acomp') return; // con un adulto: sin semáforo
      const color = ms >= S.cfg.minAlerta * 60000 ? 'rojo' : ms >= S.cfg.minAmarillo * 60000 ? 'amarillo' : 'verde';
      if (color === 'rojo' && !card.classList.contains('rojo')) vibrar([200, 100, 200]);
      card.classList.remove('verde', 'amarillo', 'rojo'); card.classList.add(color);
      c.classList.toggle('alerta', color === 'rojo');
    });
    if (d.getSeconds() % 15 === 0 || !$('#hoy-clase').dataset.t) refrescarHoy();
    if (d.getSeconds() === 0 || !S._horarioVisto) { S._horarioVisto = true; seguirHorario(); }
    const resta = S.sesion.cierre - ahora;
    $('#hdr-sesion').textContent = `Ingreso ${hhmm(S.sesion.abierta)} · salida ${hhmm(S.sesion.cierre)} (faltan ${Math.max(0, Math.round(resta / 60000))} min)`;
    if (resta <= 10 * 60000 && resta > 0 && !S.sesion.avisado10) {
      S.sesion.avisado10 = true; DB.set('sesion', S.sesion);
      avisar('La app se deshabilita en 10 minutos', `A las ${hhmm(S.sesion.cierre)} se cierra la jornada y se envía el informe. Mañana, al llegar, escaneá el QR de la escuela para habilitarla.`);
    }
    if (resta <= 0) cerrarJornada('Cumplido el horario de salida (' + hhmm(S.sesion.cierre) + ')', S.sesion.cierre);
  }

  /* ----------------------------- Protocolos --------------------------- */
  function contactosHTML(p) {
    return (p.contactos || []).map(c => c.tel ? `<a class="btn chico peligro" href="tel:${c.tel}">📞 ${esc(c.nombre)}</a>`
      : c.wa ? `<a class="btn chico secundario" href="https://wa.me/${c.wa}" target="_blank" rel="noopener">💬 ${esc(c.nombre)}</a>`
        : c.mail ? `<a class="btn chico secundario" href="mailto:${c.mail}">✉️ ${esc(c.nombre)}</a>`
          : `<a class="btn chico secundario" href="${c.url}" target="_blank" rel="noopener">🌐 ${esc(c.nombre)}</a>`).join('');
  }
  function tarjetaProto(p, extra = '') {
    return `<button class="proto" style="--c:${p.color}" data-proto="${p.id}">
      <strong>${esc(p.titulo)}</strong><small>${esc(p.subtitulo)}</small>${extra}</button>`;
  }
  function buscarProtocolo() {
    const q = $('#proto-consulta').value.trim();
    if (!q) { toast('Escribí o dictá qué pasó.'); return; }
    const res = PSProtocolos.buscar(q);
    if (!res.length) {
      $('#proto-resultados').innerHTML = '<div class="tarjeta"><p>No encontré un protocolo claro para esa descripción. Probá con otras palabras (ej.: pelea, amenaza, burlas, consumo, autolesión, desconocido en redes, relato de maltrato) o revisá la lista completa. Ante la duda: avisá al equipo directivo.</p></div>';
      return;
    }
    const top = res.slice(0, 3);
    $('#proto-resultados').innerHTML = (top[0].protocolo.urgente ? `<div class="urgente">⚠️ Situación que puede requerir actuación inmediata. No dejes solo/a al estudiante y avisá al equipo directivo.</div>` : '') +
      top.map((r, i) => tarjetaProto(r.protocolo, `<span class="coinc">${i === 0 ? 'Más probable' : 'También revisar'} · coincide: ${esc(r.coincide.slice(0, 4).join(', ') || 'texto')}</span>`)).join('');
    $$('#proto-resultados [data-proto]').forEach(b => b.onclick = () => verProtocolo(b.dataset.proto, q));
  }
  function verProtocolo(id, situacion) {
    const p = PSProtocolos.lista.find(x => x.id === id);
    let n = 0;
    const secciones = p.secciones.map(s => `<h4>${esc(s.titulo)}</h4>` + s.pasos.map(x => {
      const k = 'pp' + (n++);
      return `<label class="paso"><input type="checkbox" data-paso="${esc(x.t)}" id="${k}"><span><strong>${esc(x.t)}</strong>${x.d.map(d => `<br>${esc(d)}`).join('')}</span></label>`;
    }).join('')).join('');
    const puedeRegistrar = !!S.sesion && !S.modoConsulta;
    modal(`<div class="proto-detalle" style="--c:${p.color}">
      <h3>${esc(p.titulo)}</h3><p class="sub">${esc(p.principios)}</p>
      <div class="fila wrap">${contactosHTML(p)}</div>
      ${puedeRegistrar ? '<p class="guia">✔ Tildá los pasos que <b>ya realizaste</b>. Los que no tildes quedan como pendientes en el informe.</p>' : ''}
      ${secciones}
      ${(p.notas || []).map(t => `<p class="nota">${esc(t)}</p>`).join('')}
      ${puedeRegistrar ? `<div class="relato-zona">
        <h4>Contá lo que sucedió y lo que hiciste</h4>
        <p class="ayuda">Dictalo o escribilo como te salga: la app lo redacta como informe formal. Los nombres de la lista se pasan a iniciales.</p>
        <textarea id="m-relato" rows="5" placeholder="Ej.: En el recreo Juan Pérez y Santiago Cruz se agarraron a golpes. Los separé, Juan sangraba de la nariz, llamé al SAME y avisé a la directora.">${esc(situacion || '')}</textarea>
        <button type="button" class="btn secundario" id="m-relato-mic">🎤 Contá lo que sucedió</button>
        <button type="button" class="btn primario" id="m-redactar">📝 Redactar informe para la escuela</button>
        <button type="button" class="btn texto" id="m-reg">Sólo anotarlo en el informe del día</button></div>` : ''}
      <button class="btn secundario" id="m-no">Cerrar</button></div>`);
    $('#m-no').onclick = cerrarModal;
    if (!puedeRegistrar) return;
    const pasosMarcados = () => $$('#modal-cuerpo [data-paso]:checked').map(c => c.dataset.paso);
    $('#m-relato-mic').onclick = () => dictar($('#m-relato-mic'), null, t => { const a = $('#m-relato'); a.value = (a.value ? a.value + ' ' : '') + t; });
    $('#m-reg').onclick = async () => {
      S.incidentes.push({ id: uid(), tipo: 'protocolo', ts: Date.now(), protocolo: p.titulo, situacion: situacion || '', pasos: pasosMarcados(), nota: anonimizar($('#m-relato').value.trim()) });
      await setEnc('incidentes', S.incidentes); cerrarModal(); renderIncidentes(); toast('Anotado en el informe del día.');
    };
    $('#m-redactar').onclick = () => {
      const relato = $('#m-relato').value.trim();
      if (relato.length < 15) { toast('Contá un poco más lo que sucedió (podés dictarlo con el micrófono).'); return; }
      const hechos = pasosMarcados();
      abrirEditorInforme({ p, situacion: situacion || '', relato, hechos, pendientes: pasosPendientes(p, hechos), ts: Date.now() });
    };
  }

  /* -------------------- Informe de situación (redacción + firma) -------------------- */
  const vocalRx = { a: '[aáàä]', e: '[eéèë]', i: '[iíìï]', o: '[oóòö]', u: '[uúùü]', n: '[nñ]' };
  function patronNombre(t) {
    return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split('')
      .map(c => vocalRx[c] || c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  }
  /** Reemplaza nombres de la lista por iniciales (antes de enviar nada a la IA). */
  function anonimizar(texto) {
    let s = texto || '';
    const rx = pat => new RegExp('(?<!\\p{L})' + pat + '(?!\\p{L})', 'giu');
    const nombrados = [];
    S.alumnos.forEach(a => {
      const pat = a.nombre.trim().split(/\s+/).map(patronNombre).join('\\s+');
      const antes = s; s = s.replace(rx(pat), iniciales(a.nombre));
      if (s !== antes) nombrados.push(a);
    });
    // Si ya se nombró completo, después "Juan" a secas se refiere a ese alumno
    nombrados.forEach(a => a.nombre.trim().split(/\s+/).forEach(w => {
      if (w.length >= 3) s = s.replace(rx(patronNombre(w)), iniciales(a.nombre));
    }));
    // Nombre o apellido suelto, sólo si no se repite en la lista
    const cuenta = {};
    S.alumnos.forEach(a => a.nombre.trim().split(/\s+/).forEach(w => { const k = PSVoz.norm(w); cuenta[k] = (cuenta[k] || 0) + 1; }));
    S.alumnos.forEach(a => a.nombre.trim().split(/\s+/).forEach(w => {
      if (w.length >= 4 && cuenta[PSVoz.norm(w)] === 1) s = s.replace(rx(patronNombre(w)), iniciales(a.nombre));
    }));
    return s;
  }
  function pasosPendientes(p, hechos) {
    const out = [];
    p.secciones.forEach(sec => {
      if (/glosario|importante|marco normativo|responsabilidad|acompa/i.test(sec.titulo)) return;
      sec.pasos.forEach(x => { if (!hechos.includes(x.t) && /^\d|^[A-G] ·/.test(x.t)) out.push(x.t); });
    });
    return out;
  }
  function fechaHora(ts) {
    const d = new Date(ts);
    return { fecha: d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), hora: hhmm(ts) };
  }
  function redactarLocal(d) {
    const { fecha, hora } = fechaHora(d.ts);
    const lista = arr => arr.length ? arr.map(x => '• ' + x).join('\n') : '• (ninguno)';
    return {
      asunto: 'Informe de situación: ' + d.p.titulo,
      secciones: [
        { titulo: '1. Descripción de lo sucedido', texto: `El día ${fecha}, aproximadamente a las ${hora} h, el/la docente que suscribe informa lo siguiente: ${anonimizar(d.relato)}` },
        { titulo: '2. Protocolo aplicado', texto: `Se aplicó el Protocolo de Actuación institucional: «${d.p.titulo}».` },
        { titulo: '3. Acciones realizadas por el docente', texto: lista(d.hechos) },
        { titulo: '4. Pasos pendientes a cargo del equipo directivo', texto: lista(d.pendientes) },
        { titulo: '5. Observaciones', texto: 'Se solicita dejar constancia en el Libro de Actas de Situaciones Complejas. Conforme al protocolo, los estudiantes se consignan sólo con sus iniciales.' }
      ]
    };
  }
  async function redactar(d) {
    if (S.cfg.backendUrl && navigator.onLine) {
      try {
        const { fecha, hora } = fechaHora(d.ts);
        const j = await backend('redactar', {
          escuela: S.cfg.escuela, localidad: S.cfg.localidad, docente: S.cfg.docente, cargo: S.cfg.cargo, fecha, hora,
          protocolo: d.p.titulo, pasosProtocolo: d.p.secciones.flatMap(s => s.pasos.map(x => x.t + ': ' + x.d.join(' '))).slice(0, 40),
          hechos: d.hechos, pendientes: d.pendientes, situacion: anonimizar(d.situacion), relato: anonimizar(d.relato)
        });
        if (j.informe && Array.isArray(j.informe.secciones)) return { ...j.informe, ia: true };
      } catch (e) { toast('La IA no respondió (' + e.message + '). Armé un borrador básico para que lo edites.', 5500); }
    }
    return { ...redactarLocal(d), ia: false };
  }

  async function abrirEditorInforme(d) {
    const E = { d, versiones: [], idx: -1, firma: null };
    const guardarVersion = v => { E.versiones = E.versiones.slice(0, E.idx + 1); E.versiones.push(JSON.parse(JSON.stringify(v))); if (E.versiones.length > 50) E.versiones.shift(); E.idx = E.versiones.length - 1; };
    const actual = () => E.versiones[E.idx];
    const { fecha, hora } = fechaHora(d.ts);

    modal(`<div class="editor-inf">
      <div class="ed-barra">
        <button type="button" class="btn chico secundario" id="ed-undo">↶ Deshacer</button>
        <button type="button" class="btn chico secundario" id="ed-redo">↷ Rehacer</button>
        <span id="ed-ver" class="ed-ver"></span>
      </div>
      <details class="ed-relato" id="ed-relato-box"><summary>🎤 Volver a contar lo que sucedió / redactar de nuevo</summary>
        <textarea id="ed-relato" rows="5">${esc(d.relato)}</textarea>
        <div class="fila"><button type="button" class="btn secundario" id="ed-mic">🎤 Dictar</button>
        <button type="button" class="btn primario" id="ed-rehacer">✨ Redactar de nuevo</button></div>
      </details>
      <div id="ed-papel" class="papel"><p class="cargando">Redactando el informe…</p></div>
      <div class="firma-zona">
        <h4>Firma del docente</h4>
        <canvas id="ed-firma" class="firma-pad" width="900" height="300" aria-label="Firmá con el dedo"></canvas>
        <div class="fila wrap">
          <button type="button" class="btn chico secundario" id="ed-f-borrar">Borrar firma</button>
          <button type="button" class="btn chico secundario" id="ed-f-guardada">Usar mi firma guardada</button>
          <button type="button" class="btn chico secundario" id="ed-f-guardar">Guardar esta firma</button>
          <label class="btn chico secundario archivo">Adjuntar imagen de firma<input type="file" id="ed-f-img" accept="image/*" hidden></label>
        </div>
        <p class="ayuda">Firmá con el dedo dentro del recuadro. Es una firma electrónica: si tenés certificado de firma digital, podés firmar además la copia PDF que se descarga.</p>
      </div>
      <div class="ed-acciones">
        <button type="button" class="btn secundario" id="ed-cancelar">Cancelar</button>
        <button type="button" class="btn secundario" id="ed-pdf">👁 Ver PDF</button>
        <button type="button" class="btn primario" id="ed-enviar">📨 Enviar a la dirección y guardar mi copia</button>
      </div></div>`);
    $('#modal').classList.add('completo');

    const papel = $('#ed-papel');
    function render() {
      const v = actual();
      papel.innerHTML = `
        <div class="pp-enc"><strong>${esc(S.cfg.escuela)}</strong><span>${esc(S.cfg.localidad || '')}</span>
          <span>${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))} · ${hora} h</span></div>
        <input id="ed-asunto" class="pp-titulo" value="${esc(v.asunto)}" aria-label="Asunto">
        <p class="pp-de">Docente: ${esc(S.cfg.docente)}${S.cfg.cargo ? ' · ' + esc(S.cfg.cargo) : ''}</p>
        ${v.secciones.map((s, i) => `<div class="pp-sec"><input class="pp-h" data-h="${i}" value="${esc(s.titulo)}" aria-label="Título de sección"><textarea class="pp-t" data-t="${i}">${esc(s.texto)}</textarea></div>`).join('')}
        <p class="ayuda">${v.ia ? 'Redactado con IA a partir de tu relato.' : 'Borrador armado sin IA.'} Podés corregir cualquier texto tocándolo. Revisá que todo sea exacto antes de enviar.</p>`;
      $$('.pp-t').forEach(autoAlto);
      $('#ed-undo').disabled = E.idx <= 0; $('#ed-redo').disabled = E.idx >= E.versiones.length - 1;
      $('#ed-ver').textContent = `versión ${E.idx + 1} de ${E.versiones.length}`;
      const commit = () => {
        const nv = JSON.parse(JSON.stringify(actual()));
        nv.asunto = $('#ed-asunto').value;
        $$('.pp-h').forEach(el => nv.secciones[+el.dataset.h].titulo = el.value);
        $$('.pp-t').forEach(el => nv.secciones[+el.dataset.t].texto = el.value);
        if (JSON.stringify(nv) !== JSON.stringify(actual())) { guardarVersion(nv); $('#ed-undo').disabled = false; $('#ed-redo').disabled = true; $('#ed-ver').textContent = `versión ${E.idx + 1} de ${E.versiones.length}`; }
      };
      papel.querySelectorAll('input,textarea').forEach(el => { el.onchange = commit; if (el.tagName === 'TEXTAREA') el.oninput = () => autoAlto(el); });
    }
    function autoAlto(el) { el.style.height = 'auto'; el.style.height = (el.scrollHeight + 2) + 'px'; }
    function leerPapel() { const a = document.activeElement; if (a && papel.contains(a)) a.blur(); }

    $('#ed-undo').onclick = () => { leerPapel(); if (E.idx > 0) { E.idx--; render(); } };
    $('#ed-redo').onclick = () => { leerPapel(); if (E.idx < E.versiones.length - 1) { E.idx++; render(); } };
    $('#ed-mic').onclick = () => dictar($('#ed-mic'), null, t => { const a = $('#ed-relato'); a.value = (a.value ? a.value + ' ' : '') + t; });
    $('#ed-rehacer').onclick = async () => {
      const r = $('#ed-relato').value.trim(); if (r.length < 15) { toast('Contá un poco más lo que sucedió.'); return; }
      d.relato = r; papel.innerHTML = '<p class="cargando">Redactando de nuevo…</p>';
      guardarVersion(await redactar(d)); render(); $('#ed-relato-box').open = false; toast('Nueva versión lista. Con “Deshacer” volvés a la anterior.');
    };

    // ---- Firma táctil ----
    const cv = $('#ed-firma'), cx = cv.getContext('2d');
    let dibujando = false, vacia = true;
    const limpiar = () => { cx.clearRect(0, 0, cv.width, cv.height); vacia = true; E.firma = null; };
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
    cx.lineWidth = 5; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#0b1f5c';
    cv.onpointerdown = e => { dibujando = true; cv.setPointerCapture(e.pointerId); const p = pos(e); cx.beginPath(); cx.moveTo(p.x, p.y); };
    cv.onpointermove = e => { if (!dibujando) return; const p = pos(e); cx.lineTo(p.x, p.y); cx.stroke(); vacia = false; };
    cv.onpointerup = cv.onpointercancel = () => { if (dibujando && !vacia) E.firma = cv.toDataURL('image/png'); dibujando = false; };
    const ponerImagen = src => new Promise(ok => { const im = new Image(); im.onload = () => { limpiar(); const k = Math.min(cv.width / im.width, cv.height / im.height); const w = im.width * k, h = im.height * k; cx.drawImage(im, (cv.width - w) / 2, (cv.height - h) / 2, w, h); vacia = false; E.firma = cv.toDataURL('image/png'); ok(); }; im.src = src; });
    $('#ed-f-borrar').onclick = limpiar;
    $('#ed-f-guardar').onclick = async () => { if (!E.firma) { toast('Primero firmá en el recuadro.'); return; } await setEnc('firma', E.firma); toast('Firma guardada (cifrada) en este celular.'); };
    $('#ed-f-guardada').onclick = async () => { const f = await getEnc('firma', null); if (!f) { toast('Todavía no guardaste una firma.'); return; } await ponerImagen(f); };
    $('#ed-f-img').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => ponerImagen(r.result); r.readAsDataURL(f); };

    const cerrarEditor = () => { $('#modal').classList.remove('completo'); cerrarModal(); };
    $('#ed-cancelar').onclick = async () => { if (await confirmarEnLinea('¿Salir sin enviar? Se pierde el borrador.')) cerrarEditor(); };
    $('#ed-pdf').onclick = () => { leerPapel(); const r = pdfInforme(actual(), E.firma, d.ts); descargarPDF(r.blob, r.nombre); };
    $('#ed-enviar').onclick = async () => {
      leerPapel();
      if (!E.firma && !await confirmarEnLinea('El informe no tiene firma. ¿Enviarlo igual?')) return;
      const v = actual(); const r = pdfInforme(v, E.firma, d.ts);
      const pend = await getEnc('pendientes', []);
      pend.push({ id: uid(), nombre: r.nombre, fecha: d.ts, b64: r.b64, asunto: v.asunto + ' · ' + S.cfg.docente, resumen: 'Informe de situación firmado por el docente. Protocolo: ' + d.p.titulo });
      await setEnc('pendientes', pend);
      S.incidentes.push({ id: uid(), tipo: 'protocolo', ts: d.ts, protocolo: d.p.titulo, situacion: v.asunto, pasos: d.hechos, nota: 'Se redactó, firmó y envió el informe de situación completo (PDF aparte).' });
      await setEnc('incidentes', S.incidentes); renderIncidentes();
      const n = await enviarPendientes();
      cerrarEditor();
      modal(`<h3>${n ? '✅ Informe enviado a la dirección' : '📥 Informe guardado'}</h3>
        <p>${n ? 'Se envió por correo a la dirección de la escuela.' : 'No hay conexión con el servidor: quedó guardado y se envía solo cuando vuelva la conexión.'}</p>
        <p>Tu copia (duplicado) se descarga ahora en el celular.</p>
        <button class="btn primario" id="m-copia">📄 Descargar mi copia</button><button class="btn secundario" id="m-no">Listo</button>`);
      $('#m-copia').onclick = () => descargarPDF(r.blob, 'copia-docente_' + r.nombre);
      $('#m-no').onclick = cerrarModal;
      descargarPDF(r.blob, 'copia-docente_' + r.nombre);
    };

    guardarVersion(await redactar(d)); render();
  }

  function confirmarEnLinea(texto) {
    return new Promise(ok => {
      const caja = document.createElement('div'); caja.className = 'conf-flot';
      caja.innerHTML = `<p>${esc(texto)}</p><div class="fila"><button class="btn secundario" data-r="0">No</button><button class="btn primario" data-r="1">Sí</button></div>`;
      document.body.appendChild(caja);
      caja.querySelectorAll('button').forEach(b => b.onclick = () => { caja.remove(); ok(b.dataset.r === '1'); });
    });
  }
  function descargarPDF(blob, nombre) {
    if (window.PSDemo) { PSDemo.guardarPDF(blob, nombre); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function pdfInforme(v, firma, ts) {
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20; let y = 20;
    const { fecha, hora } = fechaHora(ts);
    const salto = h => { if (y + h > 275) { doc.addPage(); y = 20; } };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(S.cfg.escuela || '', W / 2, y, { align: 'center' }); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (S.cfg.localidad) { doc.text(S.cfg.localidad, W / 2, y, { align: 'center' }); y += 5; }
    doc.setDrawColor(15, 31, 61); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 7;
    doc.text(`${S.cfg.localidad ? S.cfg.localidad.split(',')[0] + ', ' : ''}${fecha} · ${hora} h`, W - M, y, { align: 'right' }); y += 8;
    doc.text('A la Dirección de la ' + (S.cfg.escuela || 'escuela'), M, y); y += 5; doc.text('S / D', M, y); y += 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.splitTextToSize(v.asunto, W - 2 * M).forEach(l => { doc.text(l, M, y); y += 6; }); y += 2;
    v.secciones.forEach(s => {
      salto(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(s.titulo, M, y); y += 5.5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
      String(s.texto).split('\n').forEach(par => { doc.splitTextToSize(par, W - 2 * M).forEach(l => { salto(6); doc.text(l, M, y); y += 5.2; }); });
      y += 3;
    });
    salto(48); y += 6;
    const cxF = W - M - 40;
    if (firma) { try { doc.addImage(firma, 'PNG', cxF - 30, y, 60, 20); } catch (e) { } }
    y += 22; doc.setLineWidth(0.3); doc.line(cxF - 35, y, cxF + 35, y); y += 5;
    doc.setFont('helvetica', 'bold'); doc.text(S.cfg.docente || '', cxF, y, { align: 'center' }); y += 5;
    doc.setFont('helvetica', 'normal'); if (S.cfg.cargo) { doc.text(S.cfg.cargo, cxF, y, { align: 'center' }); y += 5; }
    doc.setFontSize(8); doc.text(firma ? 'Firma electrónica manuscrita (táctil)' : 'Sin firma', cxF, y, { align: 'center' });
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(110); doc.text(`Confidencial · Contiene datos de niñas, niños y adolescentes (Leyes 25.326, 26.061 y 6294) · Página ${p} de ${n}`, W / 2, 290, { align: 'center' }); doc.setTextColor(0); }
    const d = new Date(ts);
    const nombre = `informe-situacion_${d.toISOString().slice(0, 10)}_${hhmm(ts).replace(':', '')}.pdf`;
    const blob = doc.output('blob');
    return { blob, nombre, b64: doc.output('datauristring').split(',')[1] };
  }
  function renderTodosProtocolos() {
    $('#proto-todos').innerHTML = PSProtocolos.lista.map(p => tarjetaProto(p)).join('');
    $$('#proto-todos [data-proto]').forEach(b => b.onclick = () => verProtocolo(b.dataset.proto, $('#proto-consulta').value.trim()));
  }

  /* ------------------------- Incidentes / grafiti --------------------- */
  function comprimir(file, max, calidad) {
    return new Promise((ok, mal) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok({ dataURL: c.toDataURL('image/jpeg', calidad), w: c.width, h: c.height });
      };
      img.onerror = () => mal(new Error('No se pudo leer la foto.')); img.src = url;
    });
  }
  function tsDeHora(hora) { return hora ? horaDeHoy(hora, S.sesion ? S.sesion.abierta : Date.now()) : null; }
  function cruzarSalidas() {
    const desde = tsDeHora($('#inc-desde').value) || S.sesion.abierta;
    const hasta = tsDeHora($('#inc-hasta').value) || Date.now();
    const lugar = $('#inc-lugar').value;
    const filtroBano = lugar.startsWith('Baño');
    const lista = S.eventos.filter(e => (!filtroBano || e.destino === 'Baño') && e.salida <= hasta && (e.regreso || Date.now()) >= desde);
    S.incCruce = { desde, hasta, lugar, lista: lista.map(e => ({ nombre: e.nombre, grado: e.grado, destino: e.destino, salida: e.salida, regreso: e.regreso })) };
    $('#inc-cruce-res').innerHTML = `<div class="cruce"><h4>Registro de salidas entre ${hhmm(desde)} y ${hhmm(hasta)}${filtroBano ? ' (destino: baño)' : ''}</h4>
      <p class="aviso">Esto es sólo un registro de presencia fuera del aula. NO indica autoría ni es prueba. No se usa para acusar ni interrogar: se eleva al equipo directivo según protocolo.</p>
      ${lista.length ? '<ul>' + lista.map(e => `<li>${esc(e.nombre)} <small>${esc(e.grado)} · ${esc(e.destino)} · ${hhmm(e.salida)}–${hhmm(e.regreso)}</small></li>`).join('') + '</ul>' : '<p>Sin salidas registradas en ese lapso.</p>'}</div>`;
  }
  const CAT_PROTO = { amenaza: 'seguridad', burla_acoso: 'bullying', discriminacion: 'bullying', sexual: 'bullying', consumo: 'consumo', autolesion_riesgo: 'urgencia' };
  async function analizarIA() {
    if (!S.incFoto) { toast('Primero sacá la foto.'); return; }
    if (!navigator.onLine) { toast('Sin conexión. Podés guardar el incidente igual y analizar después.'); return; }
    $('#inc-ia-res').innerHTML = '<p class="cargando">Analizando imagen…</p>';
    try {
      const j = await backend('analizar', { imagen: S.incFoto.ia.split(',')[1], mime: 'image/jpeg', lugar: $('#inc-lugar').value });
      const a = j.analisis; S.incIA = a;
      const pid = CAT_PROTO[a.categoria];
      const p = pid && PSProtocolos.lista.find(x => x.id === pid);
      $('#inc-ia-res').innerHTML = `<div class="ia ${a.nivel_riesgo === 'alto' ? 'alto' : ''}">
        <h4>Resultado del análisis</h4>
        <p><strong>Texto leído:</strong> “${esc(a.transcripcion || '—')}”</p>
        <p><strong>Trazo:</strong> ${esc([a.descripcion_trazo?.herramienta, a.descripcion_trazo?.color, a.descripcion_trazo?.estilo_letra, a.descripcion_trazo?.tamano, a.descripcion_trazo?.otros].filter(Boolean).join(' · '))}</p>
        <p><strong>Categoría:</strong> ${esc(a.categoria)} · <strong>Riesgo:</strong> ${esc(a.nivel_riesgo)}</p>
        <p>${esc(a.resumen || '')}</p>
        ${p ? `<button class="btn chico primario" id="btn-ia-proto">📘 Ver protocolo: ${esc(p.titulo)}</button>` : ''}
        <p class="ayuda">El análisis automático puede equivocarse. No identifica personas: la evaluación final es del equipo directivo.</p></div>`;
      if (p) $('#btn-ia-proto').onclick = () => verProtocolo(p.id, 'Grafiti en ' + $('#inc-lugar').value + ': ' + (a.transcripcion || ''));
    } catch (e) { $('#inc-ia-res').innerHTML = `<p class="aviso">No se pudo analizar: ${esc(e.message)}</p>`; }
  }
  async function guardarIncidente() {
    if (!S.incFoto && !$('#inc-obs').value.trim()) { toast('Agregá una foto o una observación.'); return; }
    if (!S.incCruce) cruzarSalidas();
    S.incidentes.push({
      id: uid(), tipo: 'grafiti', ts: Date.now(), lugar: $('#inc-lugar').value,
      foto: S.incFoto ? S.incFoto.thumb : null, fotoW: S.incFoto?.tw, fotoH: S.incFoto?.th,
      analisis: S.incIA, cruce: S.incCruce, obs: $('#inc-obs').value.trim()
    });
    await setEnc('incidentes', S.incidentes);
    S.incFoto = S.incIA = S.incCruce = null;
    $('#inc-preview').hidden = true; $('#inc-obs').value = ''; $('#inc-ia-res').innerHTML = ''; $('#inc-cruce-res').innerHTML = ''; $('#inc-foto').value = '';
    renderIncidentes(); toast('Incidente guardado en el informe del día.');
  }
  function renderIncidentes() {
    $('#lista-incidentes').innerHTML = S.incidentes.length ? S.incidentes.slice().reverse().map(i => i.tipo === 'grafiti'
      ? `<div class="inc">${i.foto ? `<img src="${i.foto}" alt="">` : ''}<div><strong>Grafiti · ${esc(i.lugar)}</strong><br><small>${hhmm(i.ts)} · ${i.analisis ? 'riesgo ' + esc(i.analisis.nivel_riesgo) : 'sin análisis IA'}</small><br>${esc(i.obs)}</div></div>`
      : `<div class="inc"><div><strong>📘 ${esc(i.protocolo)}</strong><br><small>${hhmm(i.ts)} · ${i.pasos.length} pasos marcados</small><br>${esc(i.nota)}</div></div>`).join('')
      : '<p class="vacio">Sin incidentes.</p>';
  }

  /* ------------------------------ Informe PDF ------------------------- */
  function resumenDia() {
    const ev = S.eventos, conReg = ev.filter(e => e.regreso && e.tipo !== 'acomp');
    const prom = conReg.length ? conReg.reduce((s, e) => s + (e.regreso - e.salida), 0) / conReg.length : null;
    return {
      salidas: ev.filter(e => !e.retiro).length, alumnos: new Set(ev.map(e => e.alumnoId)).size, promedio: prom,
      alertas: ev.filter(e => e.alerta).length, sinRegreso: ev.filter(e => !e.regreso && !e.retiro).length, incidentes: S.incidentes.length
    };
  }
  function renderInforme() {
    if (!S.sesion) return;
    const r = resumenDia();
    $('#inf-resumen').innerHTML = `<div class="stats">
      <div><b>${r.salidas}</b><span>salidas</span></div><div><b>${r.alumnos}</b><span>alumnos</span></div>
      <div><b>${r.promedio ? Math.round(r.promedio / 60000) + "'" : '—'}</b><span>promedio</span></div>
      <div><b>${r.alertas}</b><span>llegaron a rojo (${S.cfg.minAlerta}')</span></div>
      <div><b>${r.sinRegreso}</b><span>afuera ahora</span></div><div><b>${r.incidentes}</b><span>incidentes</span></div></div>
      <p class="ayuda">Ingreso ${hhmm(S.sesion.abierta)} · salida ${hhmm(S.sesion.cierre)}${S.sesion.cambioSalida ? ' (cambiada hoy: ' + esc(S.sesion.cambioSalida.motivo) + ')' : ''} · el informe va al correo de la dirección.</p>`;
  }

  function generarPDF({ motivo, fin, vistaPrevia }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14; let y = 16;
    const nom = n => S.cfg.soloIniciales ? iniciales(n) : n;
    const r = resumenDia();
    const azul = [15, 31, 61];
    const salto = h => { if (y + h > 282) { doc.addPage(); y = 16; } };
    const parrafo = (t, tam = 9, estilo = 'normal') => {
      doc.setFont('helvetica', estilo); doc.setFontSize(tam);
      doc.splitTextToSize(String(t), W - 2 * M).forEach(l => { salto(5); doc.text(l, M, y); y += tam * 0.45; });
      y += 1.5;
    };
    const titulo = t => { salto(12); y += 3; doc.setFillColor(...azul); doc.rect(M, y - 4.5, W - 2 * M, 7, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(t, M + 2, y); doc.setTextColor(0); y += 6; };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Informe diario de salidas del aula e incidentes', M, y); y += 7;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`${S.cfg.escuela}`, M, y); y += 5;
    doc.text(`${ROLES[S.cfg.rol] || 'Docente'}: ${S.cfg.docente}   ·   Fecha: ${fecha(S.sesion.abierta)}`, M, y); y += 5;
    doc.text(`${S.sesion.turno ? 'Turno ' + S.sesion.turno.toLowerCase() + (S.cfg.grados[S.sesion.turno] ? ' · ' + S.cfg.grados[S.sesion.turno] : '') + '   ·   ' : ''}Ingreso: ${hhmm(S.sesion.abierta)}${S.sesion.entradaProgramada ? ' (horario ' + S.sesion.entradaProgramada + ')' : ''}   ·   Salida: ${hhmm(fin)}${S.sesion.salidaProgramada ? ' (horario ' + S.sesion.salidaProgramada + ')' : ''}`, M, y); y += 5;
    doc.text(doc.splitTextToSize(`Cierre: ${motivo}` + (S.sesion.cambioSalida ? `   ·   Salida de hoy cambiada de ${S.sesion.cambioSalida.de} a ${S.sesion.cambioSalida.a} (${S.sesion.cambioSalida.motivo})` : ''), W - 2 * M), M, y); y += S.sesion.cambioSalida ? 10 : 6;
    doc.setFillColor(254, 243, 199); doc.rect(M, y - 4, W - 2 * M, 11, 'F'); doc.setFontSize(8);
    doc.text(doc.splitTextToSize('CONFIDENCIAL. Contiene datos personales de niñas, niños y adolescentes (Ley 25.326, Ley 26.061, Ley 6294 de Jujuy). Uso exclusivo del equipo directivo para fines de cuidado institucional. Prohibida su difusión.' + (vistaPrevia ? '  [VISTA PREVIA]' : ''), W - 2 * M - 4), M + 2, y); y += 10;

    titulo('1. Resumen');
    parrafo(`Salidas registradas: ${r.salidas} · Alumnos distintos: ${r.alumnos} · Tiempo promedio fuera: ${r.promedio ? dur(r.promedio) : '—'} · Salidas que llegaron a rojo (más de ${S.cfg.minAlerta} min): ${r.alertas} · Retiros anticipados: ${S.eventos.filter(e => e.retiro).length} · Sin regreso registrado al cierre: ${r.sinRegreso} · Incidentes: ${r.incidentes}`);

    (S.sesion.coberturas || []).forEach(c => parrafo(`Cobertura: ${c.grado}${c.turno ? ' (turno ' + c.turno.toLowerCase() + ')' : ''}${c.reemplaza ? ', en reemplazo de ' + c.reemplaza : ''}, de ${hhmm(c.desde)} a ${hhmm(c.hasta)}.`, 9, 'bold'));
    const gruposPDF = [...new Set([...misGrados(S.sesion.turno || S.cfg.turno), ...(S.sesion.coberturas || []).map(c => c.grado)])];
    gruposPDF.forEach(gr => {
      const visPDF = S.alumnos.concat(S.alumnosCob).filter(a => a.grado === gr && (!a.alta || a.alta <= PSVoz.fechaIso(new Date(S.sesion.abierta))));
      if (!visPDF.length) return;
      const pres = visPDF.filter(a => S.asistencia[a.id] === 'P'), aus = visPDF.filter(a => S.asistencia[a.id] === 'A');
      parrafo(`Asistencia ${gr}: ${pres.length} presentes · ${aus.length} ausentes · ${visPDF.length - pres.length - aus.length} sin marcar.` +
        (aus.length ? ' Ausentes: ' + aus.map(a => nom(a.nombre)).join('; ') + '.' : ''));
    });
    if (gruposPDF.length) parrafo('(La asistencia de la app es un registro auxiliar: no reemplaza el registro oficial.)', 7.5, 'italic');
    titulo('2. Detalle de salidas');
    if (S.eventos.length) {
      doc.autoTable({
        startY: y, margin: { left: M, right: M }, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [37, 99, 235] },
        head: [['#', 'Alumno', 'Grado', 'Destino', 'Salió', 'Volvió', 'Tiempo', 'Registro', 'Obs.']],
        body: S.eventos.map((e, i) => [i + 1, nom(e.nombre), e.grado, e.destino, hhmm(e.salida), hhmm(e.regreso), e.regreso ? dur(e.regreso - e.salida) : '—',
        (e.origenSalida || '') + (e.origenRegreso ? '/' + e.origenRegreso : ''), e.retiro ? 'Retiro anticipado de la escuela' : e.sinRegreso ? 'Sin regreso registrado' : e.alerta ? `Rojo: superó ${S.cfg.minAlerta} min` : e.tipo === 'acomp' ? 'Con adulto/familiar' : ''])
      });
      y = doc.lastAutoTable.finalY + 4;
    } else parrafo('Sin salidas registradas.');

    titulo('3. Resumen por alumno');
    const porAl = {};
    S.eventos.forEach(e => { const p = porAl[e.alumnoId] || (porAl[e.alumnoId] = { n: e.nombre, g: e.grado, c: 0, t: 0, max: 0 }); p.c++; const d = (e.regreso || fin) - e.salida; p.t += d; p.max = Math.max(p.max, d); });
    const filas = Object.values(porAl).sort((a, b) => b.t - a.t);
    if (filas.length) {
      doc.autoTable({ startY: y, margin: { left: M, right: M }, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [37, 99, 235] },
        head: [['Alumno', 'Grado', 'Salidas', 'Tiempo total', 'Máximo']], body: filas.map(p => [nom(p.n), p.g, p.c, dur(p.t), dur(p.max)]) });
      y = doc.lastAutoTable.finalY + 4;
    } else parrafo('—');

    titulo('4. Incidentes y protocolos aplicados');
    if (!S.incidentes.length) parrafo('Sin incidentes registrados.');
    S.incidentes.forEach((i, k) => {
      salto(20);
      if (i.tipo === 'grafiti') {
        parrafo(`4.${k + 1}  Grafiti / escrito · ${i.lugar} · registrado ${hhmm(i.ts)}`, 10, 'bold');
        if (i.foto) {
          const w = 70, h = Math.min(90, w * (i.fotoH / i.fotoW || 0.75)); salto(h + 4);
          try { doc.addImage(i.foto, 'JPEG', M, y, w, h); } catch (e) { }
          y += h + 3;
        }
        if (i.analisis) {
          const a = i.analisis, t = a.descripcion_trazo || {};
          parrafo(`Texto leído (OCR): "${a.transcripcion || '—'}"`);
          parrafo(`Trazo: ${[t.herramienta, t.color, t.estilo_letra, t.tamano, t.otros].filter(Boolean).join(' · ')}`);
          parrafo(`Categoría: ${a.categoria} · Riesgo: ${a.nivel_riesgo} · ${a.resumen || ''}`);
          parrafo('Análisis automático orientativo: no identifica autoría ni reemplaza la evaluación del equipo directivo.', 7.5, 'italic');
        }
        if (i.cruce) {
          parrafo(`Salidas registradas entre ${hhmm(i.cruce.desde)} y ${hhmm(i.cruce.hasta)}: ` + (i.cruce.lista.length ? i.cruce.lista.map(e => `${nom(e.nombre)} (${e.grado}, ${e.destino} ${hhmm(e.salida)}-${hhmm(e.regreso)})`).join('; ') : 'ninguna.'));
          parrafo('Registro de presencia fuera del aula: no implica autoría ni constituye prueba. No debe usarse para acusar ni exponer a ningún estudiante.', 7.5, 'italic');
        }
        if (i.obs) parrafo('Observaciones: ' + i.obs);
      } else {
        parrafo(`4.${k + 1}  Protocolo consultado: ${i.protocolo} · ${hhmm(i.ts)}`, 10, 'bold');
        if (i.situacion) parrafo('Situación descripta: ' + i.situacion);
        parrafo('Pasos marcados como realizados: ' + (i.pasos.length ? i.pasos.join(' / ') : 'ninguno marcado'));
        if (i.nota) parrafo('Nota: ' + i.nota);
      }
    });

    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(110);
      doc.text(`Pasillo Seguro · ${S.cfg.escuela} · Página ${p} de ${n}`, M, 291); doc.setTextColor(0);
    }
    const d = new Date(S.sesion.abierta);
    const nombre = `informe_${d.toISOString().slice(0, 10)}_${PSVoz.norm(S.cfg.docente).replace(/ /g, '-') || 'docente'}.pdf`;
    const asunto = `Informe diario Pasillo Seguro · ${S.cfg.docente} · ${d.toLocaleDateString('es-AR')}`;
    const resumen = `Salidas: ${r.salidas} · Alumnos: ${r.alumnos} · Superaron ${S.cfg.minAlerta} min: ${r.alertas} · Sin regreso: ${r.sinRegreso} · Incidentes: ${r.incidentes} · Cierre: ${motivo}`;
    return { doc, nombre, asunto, resumen, b64: doc.output('datauristring').split(',')[1] };
  }

  /* ------------------------------ Bloqueo ----------------------------- */
  async function renderPendientes() {
    const pend = await getEnc('pendientes', []);
    $('#bloq-pendientes').innerHTML = pend.length ? `<div class="tarjeta"><h3>Informes pendientes de envío (${pend.length})</h3>${pend.map(p => `
      <div class="pend"><span>${esc(p.nombre)}</span><div class="fila wrap">
        <button class="btn chico primario" data-env="${p.id}">Reintentar envío</button>
        <button class="btn chico secundario" data-comp="${p.id}">Compartir</button>
        <button class="btn chico texto" data-del="${p.id}">Eliminar</button></div></div>`).join('')}</div>` : '';
    $$('[data-env]').forEach(b => b.onclick = async () => { const n = await enviarPendientes(); toast(n ? 'Enviado.' : 'No se pudo enviar (revisá conexión y Ajustes).'); });
    $$('[data-comp]').forEach(b => b.onclick = async () => {
      if (!await verificarFrase()) return;
      const p = pend.find(x => x.id === b.dataset.comp);
      const file = new File([b64aBlob(p.b64, 'application/pdf')], p.nombre, { type: 'application/pdf' });
      if (window.PSDemo) { PSDemo.guardarPDF(file, p.nombre); return; }
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: p.asunto, text: p.resumen }); if (await confirmar('¿Ya lo enviaste a la dirección? Se borrará del celular.')) quitarPendiente(p.id); } catch (e) { }
      } else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = p.nombre; a.click(); }
    });
    $$('[data-del]').forEach(b => b.onclick = async () => { if (await verificarFrase() && await confirmar('¿Eliminar este informe sin enviarlo?')) quitarPendiente(b.dataset.del); });
  }
  async function quitarPendiente(id) { const p = (await getEnc('pendientes', [])).filter(x => x.id !== id); await setEnc('pendientes', p); renderPendientes(); }

  async function mostrarBloqueo() {
    S.modoConsulta = false;
    $('#bloq-escuela').textContent = S.cfg.escuela + ' · ' + S.cfg.docente;
    mostrar('pantalla-bloqueo'); renderPendientes();
  }
  function entrarApp() {
    S.modoConsulta = false;
    $('#nav').hidden = false; $('#btn-salir-consulta').hidden = true;
    $('#hdr-titulo').textContent = S.cfg.escuela || 'Pasillo Seguro';
    mostrar('pantalla-app'); irTab('pasillo'); renderPasillo(); renderIncidentes();
    if (window.PSEmerg) PSEmerg.estado();
    iniciarVigilanciaGeo();
  }
  function entrarConsulta() {
    S.modoConsulta = true;
    $('#nav').hidden = true; $('#btn-salir-consulta').hidden = false;
    $('#hdr-titulo').textContent = 'Protocolos (sólo lectura)'; $('#hdr-sesion').textContent = 'App bloqueada: no se registran datos';
    mostrar('pantalla-app'); irTab('protocolos');
  }

  /* ------------------------------ Ajustes ----------------------------- */
  function renderAjustes() {
    const c = S.cfg;
    $('#aj-escuela').value = c.escuela; $('#aj-docente').value = c.docente; $('#aj-cargo').value = c.cargo || ''; $('#aj-localidad').value = c.localidad || '';
    $('#aj-alerta').value = c.minAlerta; $('#aj-amarillo').value = c.minAmarillo; $('#aj-iniciales').checked = c.soloIniciales; $('#aj-url').value = c.backendUrl; $('#aj-tel-dir').value = c.telDireccion || ''; $('#aj-token').value = c.backendToken;
    $('#aj-radio').value = c.geo ? c.geo.radio : 150;
    $('#aj-geo-estado').textContent = c.geo ? `Guardada (${c.geo.lat.toFixed(5)}, ${c.geo.lng.toFixed(5)}). La app se cierra si te alejás más de ${c.geo.radio} m (con la app abierta).` : 'Sin ubicación: el cierre automático es sólo por horario o manual.';
    $('#aj-cant').textContent = S.alumnos.length;
    renderMisGrados();
  }
  function limpiarNombre(n) {
    n = n.replace(/^\s*\d+[.)-]?\s*/, '').replace(/\s+/g, ' ').trim();
    return n.toLowerCase().replace(/(^|[\s,'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }
  function parsearLista(texto, grado, turno) {
    return texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const [n0, g0] = l.split(/[;\t]/).map(x => (x || '').trim());
      const n = limpiarNombre(n0), g = g0 || grado || '';
      return { id: PSCrypto.idAlumno(n, g), nombre: n, grado: g, turno: turno || '' };
    }).filter(a => a.nombre.length > 2);
  }
  async function guardarGrupo(nuevos, grado, turno) {
    const vistos = new Set();
    nuevos = nuevos.filter(a => !vistos.has(a.id) && vistos.add(a.id));
    S.alumnos = S.alumnos.filter(a => a.grado !== grado).concat(nuevos);
    await setEnc('alumnos', S.alumnos);
    S.cfg.turno = turno; await DB.set('cfg', S.cfg);
    renderAjustes(); toast(`Guardados ${nuevos.length} alumnos en ${grado} · turno ${turno.toLowerCase()}.`, 4500);
  }
  function tarjetaGrado(t, g) {
    const n = S.alumnos.filter(a => a.grado === g).length, k = t + '|' + g;
    return `<div class="grado-elegido"><b>${esc(g)}</b><span>${n ? n + ' alumnos cargados' : 'sin alumnos todavía'}</span>
        ${S.cfg.rol === 'grado' ? `<button type="button" class="btn chico texto" data-cambiar="${t}">Cambiar de grado</button>` : ''}</div>
      <label class="btn primario archivo">📸 ${n ? 'Volver a cargar' : 'Cargar'} foto del registro (cámara o galería) de ${esc(g)}<input type="file" accept="image/*" hidden data-foto="${k}"></label>
      <div class="reg-res" id="reg-res-${slug(g)}"></div>
      <div class="fila wrap"><button type="button" class="btn chico secundario" data-alta="${k}">➕ Alumno nuevo</button>
        <button type="button" class="btn chico secundario" data-qraula="${k}">🖨 QR del aula (para reemplazos)</button></div>
      <details class="otras"><summary>Otras formas de cargar</summary>
        <label>Escribir o pegar nombres (uno por línea)<textarea rows="5" data-pegar="${k}" placeholder="Pérez, Juan&#10;Quispe, Milagros"></textarea></label>
        <button type="button" class="btn secundario" data-guardar-pegado="${k}">Guardar en ${esc(g)}</button>
        <label class="btn secundario archivo">📂 Importar lista cifrada (del generador)<input type="file" accept=".txt,text/plain" hidden data-cifrada="${k}"></label>
      </details>
      <details class="otras"><summary>Ver o corregir la lista (${n})</summary><div class="lista-edit">${S.alumnos.filter(a => a.grado === g).map(a =>
        `<div class="grupo"><span>${esc(a.nombre)}${a.alta ? ` <small>· ingreso ${new Date(a.alta + 'T12:00').toLocaleDateString('es-AR')}${a.alta > hoyIso() ? ' (próximo)' : ''}</small>` : ''}</span><button type="button" class="btn chico texto" data-quitar="${a.id}">Quitar</button></div>`).join('') || '<p class="vacio">Vacía.</p>'}</div></details>`;
  }
  function renderMisGrados() {
    const c = S.cfg, box = $('#aj-misgrados');
    c.gradosEsp = c.gradosEsp || {};
    let h = `<div class="importar-multi"><button type="button" class="btn primario grande" id="aj-lista412">🏫 Cargar TODOS mis alumnos (con código)</button>
      <p class="ayuda">Carga de una vez a todos los alumnos, cada uno en su grado. Te pide el código de la lista.</p>
      <label class="btn secundario archivo">📂 Cargar alumnos desde un archivo<input type="file" id="aj-multi" hidden></label>
      <p class="ayuda">Para el archivo de listas por grado (cada grado empieza con una línea como “4.º C” y abajo un alumno por línea).</p></div>
      <p class="paso-n">1. ¿Cuál es tu función?</p><div class="chips modo">${Object.entries(ROLES).map(([v, t]) => `<button type="button" data-rol="${v}" class="${c.rol === v ? 'on' : ''}">${t}${v === 'especial' ? ' <small>(Música, Ed. Física, Plástica, Act. Prácticas…)</small>' : ''}</button>`).join('')}</div>
      <p class="paso-n">2. ¿En qué turno trabajás?</p><div class="chips modo">
      ${[['Mañana', '☀️ Trabajo a la mañana'], ['Tarde', '🌇 Trabajo a la tarde'], ['Ambos', '☀️🌇 Trabajo mañana y tarde']].map(([v, t]) => `<button type="button" data-modo="${v}" class="${c.modoTurno === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    turnosDocente().forEach(t => {
      const hor = horarioDe(t), g = c.grados[t], ge = c.gradosEsp[t] || [];
      h += `<div class="grado-card"><p class="paso-n">${t === 'Mañana' ? '☀️' : '🌇'} Turno ${t.toLowerCase()} · mi horario</p>
        <div class="fila"><label>Entro a las<input type="time" data-hor="${t}|entrada" value="${hor.entrada}"></label><label>Salgo a las<input type="time" data-hor="${t}|salida" value="${hor.salida}"></label></div>
        <p class="ayuda">La app se cierra sola a tu hora de salida y te avisa 10 minutos antes.</p>`;
      if (esDirectivo()) h += `<p class="ayuda">Como ${esc(ROLES[c.rol].toLowerCase())} no tenés un grado fijo. Cuando te hagas cargo de un grado, en Pasillo tocá <b>“🔁 Hoy cubro un grado”</b> y escaneá el QR del aula.</p>`;
      else if (c.rol === 'especial') {
        h += `<p class="paso-n">3. Tocá todos tus grados de este turno</p><div class="grilla-grados">${gradosDe(t).map(x => `<button type="button" data-esp="${t}|${x}" class="${ge.includes(x) ? 'on' : ''}">${x}</button>`).join('')}</div>`;
        ge.forEach(x => { h += `<div class="sub-grado">${tarjetaGrado(t, x)}</div>`; });
      } else {
        h += `<p class="paso-n">3. ${g ? 'Tu grado' : 'Tocá tu grado'}</p>`;
        h += g ? tarjetaGrado(t, g) : `<div class="grilla-grados">${gradosDe(t).map(x => `<button type="button" data-elegir="${t}|${x}">${x}</button>`).join('')}</div>`;
      }
      h += '</div>';
    });
    if (!esDirectivo()) {
      const hcs = c.horarioClases || [];
      const dias = [1, 2, 3, 4, 5], franjas = [...new Set(hcs.map(x => x.desde + '|' + x.hasta))].sort();
      h += `<div class="grado-card"><p class="paso-n">📅 Mi horario de clases</p>
        <p class="ayuda">${c.rol === 'especial' ? 'Con tu horario cargado, la app te muestra en Pasillo los grados de hoy (cada grado con su color), cambia sola a la lista del grado que te toca y suena una alarma en el recreo. Tocá un grado de hoy para ver su lista.' : 'Cargá tu horario con las materias que das (Matemática, Lengua, Ciencias…). La app te muestra en Pasillo la materia que te toca ahora y suena una alarma en el recreo.'}</p>
        ${hcs.length ? `<div class="tabla-scroll"><table class="tabla-horario"><thead><tr><th>Hora</th>${dias.map(d => `<th class="${d === new Date().getDay() ? 'dia-hoy' : 'otro'}">${d === new Date().getDay() ? 'HOY<br>' : ''}${DIAS_TXT[d].slice(0, 3)}</th>`).join('')}</tr></thead><tbody>${franjas.map(fr => { const [d0, h0] = fr.split('|');
          return `<tr><td>${d0}<br>${h0}</td>${dias.map(d => { const x = hcs.find(y => y.dia === d && y.desde === d0 && y.hasta === h0); const hoyD = d === new Date().getDay(); return `<td class="${hoyD ? 'dia-hoy' : 'otro'}${x && x.recreo ? ' recreo' : ''}">${x ? `<button type="button" class="celda" style="${estiloFranja(x)}" ${x.grado && hoyD ? `data-hc-grado="${esc(x.grado)}"` : ''}>${x.recreo ? 'Recreo' : esc(x.grado || x.materia)}</button>` : ''}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>` : '<p class="vacio">Todavía no cargaste tu horario.</p>'}
        ${c.rol === 'especial' ? `<label class="check"><input type="checkbox" id="hc-auto" ${c.horarioAuto !== false ? 'checked' : ''}> Cambiar de grado automáticamente según el horario</label>` : ''}
        <label class="check"><input type="checkbox" id="hc-esc" ${c.recreoEscalonado !== false ? 'checked' : ''}> Recreo en dos tandas: primero 1.º a 3.º y después 4.º a 7.º</label>
        <label class="fila">Minutos de la primera tanda <input type="number" id="hc-dif" min="1" max="30" value="${+c.recreoDif || 5}" style="width:5em"></label>
        <details class="otras" ${hcs.length ? '' : 'open'}><summary>${hcs.length ? 'Cambiar el horario' : 'Cargar el horario'}</summary>
          <p class="ayuda">Copiá la tabla de tu planilla (desde “Horario, Lunes, Martes…”) y pegala acá. También podés escribirla así, una franja por línea:<br>${c.rol === 'especial' ? '<code>14:55 a 15:35, 7º D, 6º C, 4º C, 5º D, 5º C</code>' : '<code>08:00 a 08:40, Matemática, Lengua, Ciencias, Matemática, Lengua</code>'}<br>Para el recreo escribí <b>RECREO</b>.</p>
          <textarea id="hc-txt" rows="7" placeholder="${c.rol === 'especial' ? 'Horario,Lunes,Martes,Miércoles,Jueves,Viernes&#10;14:55 a 15:35,7º D,6º C,4º C,5º D,5º C' : 'Horario,Lunes,Martes,Miércoles,Jueves,Viernes&#10;08:00 a 08:40,Matemática,Lengua,Ciencias,Matemática,Lengua&#10;09:20 a 09:30,RECREO,RECREO,RECREO,RECREO,RECREO'}">${esc(horarioATexto(hcs))}</textarea>
          <button type="button" class="btn primario" id="hc-guardar">Guardar horario</button>
        </details>
        ${hcs.length ? '<button type="button" class="btn chico texto" id="hc-borrar">Borrar horario</button>' : ''}
      </div>`;
    }
    if (turnosDocente().length) {
      h += `<div class="grado-card"><p class="paso-n">🔔 Avisos en el celular</p>
        <p class="ayuda">Con la app abierta, te avisa 10 minutos antes de tu salida. Para que el celular te avise aunque la app esté cerrada (al llegar: “habilitá el QR”; al salir: “se deshabilita en 10 minutos”), agregá estos recordatorios a tu calendario de Google, de lunes a viernes. En el calendario, dejá la notificación “al momento del evento”.</p>
        <button type="button" class="btn secundario" id="btn-permiso-avisos">Permitir avisos de la app</button>
        ${[...new Set((c.horarioClases || []).filter(x => x.recreo).map(x => x.desde + '|' + x.hasta))].map(k => { const [d0, h0] = k.split('|'); const tr = tramosRecreo({ desde: d0, hasta: h0 }); return `<div class="fila wrap"><a class="btn chico secundario" target="_blank" rel="noopener" href="${linkCalendario('☕ Recreo', tr ? `${tr.g1}: ${d0} a ${tr.mid}. ${tr.g2}: ${tr.mid} a ${h0}.` : `Recreo de ${d0} a ${h0}.`, d0)}">📅 Alarma de recreo (${d0})</a></div>`; }).join('')}
        ${turnosDocente().map(t => { const hh = horarioDe(t); return `<div class="fila wrap">
          <a class="btn chico secundario" target="_blank" rel="noopener" href="${linkCalendario('📷 Pasillo Seguro: habilitá la app con el QR de la escuela', 'Al llegar a la escuela, escaneá el QR institucional para habilitar la app de tu grado.', menos10(hh.entrada))}">📅 Aviso de entrada · turno ${t.toLowerCase()} (${menos10(hh.entrada)})</a>
          <a class="btn chico secundario" target="_blank" rel="noopener" href="${linkCalendario('⏰ Pasillo Seguro: en 10 minutos se deshabilita la app', 'Al cerrar la jornada se envía el informe a la dirección. Mañana acordate de escanear el QR al llegar.', menos10(hh.salida))}">📅 Aviso de salida · turno ${t.toLowerCase()} (${menos10(hh.salida)})</a></div>`; }).join('')}
      </div>`;
    }
    box.innerHTML = h;
    const K = el => el.split('|');
    box.querySelector('#aj-lista412').onclick = () => cargarListaEscuela();
    box.querySelector('#aj-multi').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importarMultiGrado(f); };
    box.querySelectorAll('[data-hc-grado]').forEach(b => b.onclick = async () => { if (c.rol !== 'especial') return; if (!S.sesion) { toast('Primero habilitá la app con el QR de la escuela.'); return; } await activarGrado(b.dataset.hcGrado); irTab('pasillo'); });
    const he = box.querySelector('#hc-esc'); if (he) he.onchange = async e => { c.recreoEscalonado = e.target.checked; await DB.set('cfg', c); refrescarHoy(); };
    const hd = box.querySelector('#hc-dif'); if (hd) hd.onchange = async e => { c.recreoDif = Math.min(30, Math.max(1, +e.target.value || 5)); e.target.value = c.recreoDif; await DB.set('cfg', c); refrescarHoy(); };
    const ha = box.querySelector('#hc-auto'); if (ha) ha.onchange = async () => { c.horarioAuto = ha.checked; await DB.set('cfg', c); };
    const hb = box.querySelector('#hc-borrar'); if (hb) hb.onclick = async () => { if (!await confirmar('¿Borrar tu horario de clases?', 'Borrar')) return; c.horarioClases = []; await DB.set('cfg', c); renderAjustes(); };
    const hg = box.querySelector('#hc-guardar'); if (hg) hg.onclick = async () => {
      const r = aplicarHorario(c, box.querySelector('#hc-txt').value);
      if (!r) { toast('No encontré clases. Revisá que la primera fila diga “Horario, Lunes, Martes…” y que cada fila empiece con la hora.', 6000); return; }
      const { clases, nuevos } = r;
      await DB.set('cfg', c); renderAjustes();
      toast(`Horario guardado: ${clases.length} clases por semana.${nuevos.length ? ' Grados agregados: ' + nuevos.join(', ') + '.' : ''}`, 6000);
    };
    box.querySelectorAll('[data-rol]').forEach(b => b.onclick = async () => {
      const nuevo = b.dataset.rol; if (nuevo === c.rol) return;
      const tiene = S.alumnos.length > 0;
      if (tiene && !await confirmar(`Al cambiar a “${ROLES[nuevo]}” se borran de este celular las listas de alumnos cargadas. ¿Seguir?`, 'Seguir')) return;
      S.alumnos = []; c.grados = {}; c.gradosEsp = {}; c.gradoActivo = {}; c.rol = nuevo;
      if (nuevo === 'especial' && (c.horarioClases || []).length) {
        c.horarioClases.filter(x => x.grado).forEach(x => { const t = turnoDeGrado(x.grado); const ge = c.gradosEsp[t] = c.gradosEsp[t] || []; if (!ge.includes(x.grado)) ge.push(x.grado); });
        ['Mañana', 'Tarde'].forEach(t => { if (c.gradosEsp[t]) c.gradosEsp[t].sort((a, b) => gradosDe(t).indexOf(a) - gradosDe(t).indexOf(b)); });
        const ts = Object.keys(c.gradosEsp); c.modoTurno = ts.length === 2 ? 'Ambos' : ts[0] || c.modoTurno;
      }
      await setEnc('alumnos', S.alumnos); await DB.set('cfg', c); renderAjustes();
    });
    box.querySelectorAll('[data-hor]').forEach(i => i.onchange = async () => {
      const [t, k] = K(i.dataset.hor); c.horarios = c.horarios || {}; c.horarios[t] = Object.assign(horarioDe(t), { [k]: i.value });
      await DB.set('cfg', c); toast(`Horario del turno ${t.toLowerCase()}: ${c.horarios[t].entrada} a ${c.horarios[t].salida}.`); renderMisGrados();
    });
    box.querySelectorAll('[data-alta]').forEach(b => b.onclick = () => { const [t, g] = K(b.dataset.alta); abrirAlta(t, {}, g); });
    box.querySelectorAll('[data-qraula]').forEach(b => b.onclick = () => { const [t, g] = K(b.dataset.qraula); qrAula(t, g); });
    box.querySelectorAll('[data-quitar]').forEach(b => b.onclick = async () => {
      const a = S.alumnos.find(x => x.id === b.dataset.quitar);
      if (!a || !await confirmar(`¿Quitar a ${a.nombre} de la lista?`, 'Quitar')) return;
      S.alumnos = S.alumnos.filter(x => x.id !== a.id); await setEnc('alumnos', S.alumnos); renderAjustes();
    });
    const bp = box.querySelector('#btn-permiso-avisos');
    if (bp) bp.onclick = async () => { try { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Avisos permitidos.' : 'No se permitieron los avisos. Podés cambiarlo en los permisos de Chrome.'); } catch (e) { toast('Este navegador no permite avisos.'); } };
    box.querySelectorAll('[data-modo]').forEach(b => b.onclick = async () => {
      const nuevo = b.dataset.modo; if (nuevo === c.modoTurno) return;
      const quedan = nuevo === 'Ambos' ? ['Mañana', 'Tarde'] : [nuevo];
      const sobran = ['Mañana', 'Tarde'].filter(t => !quedan.includes(t) && (c.grados[t] || (c.gradosEsp[t] || []).length));
      if (sobran.length && !await confirmar(`Vas a dejar el turno ${sobran.join(' y ').toLowerCase()}: se borran sus alumnos de este celular. ¿Seguir?`, 'Seguir')) return;
      sobran.forEach(t => { const gs = [c.grados[t], ...(c.gradosEsp[t] || [])].filter(Boolean); S.alumnos = S.alumnos.filter(a => !gs.includes(a.grado)); delete c.grados[t]; delete c.gradosEsp[t]; });
      c.modoTurno = nuevo; c.turno = quedan[0]; await setEnc('alumnos', S.alumnos); await DB.set('cfg', c); renderAjustes();
    });
    box.querySelectorAll('[data-elegir]').forEach(b => b.onclick = async () => {
      const [t, g] = K(b.dataset.elegir);
      if (!await confirmar(`¿Tu grado del turno ${t.toLowerCase()} es ${g}? Después no se puede elegir otro sin borrar sus alumnos.`, 'Sí, es mi grado')) return;
      c.grados[t] = g; c.turno = t; await DB.set('cfg', c); renderAjustes(); toast(`Listo: ${g}. Ahora sacale una foto al registro.`);
    });
    box.querySelectorAll('[data-esp]').forEach(b => b.onclick = async () => {
      const [t, g] = K(b.dataset.esp); const ge = c.gradosEsp[t] = c.gradosEsp[t] || [];
      if (ge.includes(g)) {
        const n = S.alumnos.filter(a => a.grado === g).length;
        if (n && !await confirmar(`¿Quitar ${g}? Se borran sus ${n} alumnos de este celular.`, 'Quitar')) return;
        c.gradosEsp[t] = ge.filter(x => x !== g); S.alumnos = S.alumnos.filter(a => a.grado !== g); await setEnc('alumnos', S.alumnos);
      } else { ge.push(g); ge.sort((a, b) => gradosDe(t).indexOf(a) - gradosDe(t).indexOf(b)); }
      await DB.set('cfg', c); renderAjustes();
    });
    box.querySelectorAll('[data-cambiar]').forEach(b => b.onclick = async () => {
      const t = b.dataset.cambiar, g = c.grados[t];
      if (!await confirmar(`¿Cambiar de grado? Se borran de este celular los alumnos de ${g}.`, 'Cambiar')) return;
      S.alumnos = S.alumnos.filter(a => a.grado !== g); delete c.grados[t];
      await setEnc('alumnos', S.alumnos); await DB.set('cfg', c); renderAjustes();
    });
    box.querySelectorAll('[data-foto]').forEach(i => i.onchange = e => { const f = e.target.files[0]; e.target.value = ''; const [t, g] = K(i.dataset.foto); if (f) leerRegistroFoto(f, g, t); });
    box.querySelectorAll('[data-guardar-pegado]').forEach(b => b.onclick = async () => {
      const [t, g] = K(b.dataset.guardarPegado), ta = box.querySelector(`[data-pegar="${b.dataset.guardarPegado}"]`);
      const l = parsearLista(ta.value, g, t);
      if (!l.length) { toast('No hay nombres para guardar.'); return; }
      await guardarGrupo(l, g, t);
    });
    box.querySelectorAll('[data-cifrada]').forEach(i => i.onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const [t, g] = K(i.dataset.cifrada);
      try {
        const o = await PSCrypto.descifrar(S.llave, (await f.text()).trim());
        if (o.t !== 'LISTA' || !Array.isArray(o.alumnos)) throw new Error('El archivo no es una lista de alumnos.');
        await guardarGrupo(o.alumnos.map(a => ({ id: PSCrypto.idAlumno(a.nombre, g), nombre: a.nombre, grado: g, turno: t })), g, t);
      } catch (err) { toast(err.message, 5000); }
    });
    if (window.PSEmerg && PSEmerg.renderAjustesPlan) PSEmerg.renderAjustesPlan();
  }
  async function leerRegistroFoto(file, grado, turno, modo) {
    const caja = modo === 'cob' ? $('#reg-res-cob') : modo === 'setup' ? $('#reg-res-setup') : $('#reg-res-' + slug(grado));
    caja.innerHTML = '<p class="cargando">Leyendo los nombres de la foto…</p>';
    try {
      const img = await comprimir(file, 2000, 0.85);
      const j = await backend('lista', { imagen: img.dataURL.split(',')[1], mime: 'image/jpeg' });
      const nombres = (j.alumnos || []).map(x => typeof x === 'string' ? x : x.nombre).filter(Boolean);
      if (!nombres.length) throw new Error('No encontré nombres en la foto. Probá con más luz y la hoja derecha.');
      caja.innerHTML = `<div class="revisar"><h4>Revisá los ${nombres.length} nombres (${esc(grado)} · ${esc(turno)})</h4>
        <p class="ayuda">Están en el orden del registro. Corregí lo que esté mal escrito; podés borrar o agregar líneas. ${j.notas ? esc(j.notas) : ''}</p>
        <textarea id="aj-reg-texto" rows="${Math.min(18, nombres.length + 1)}">${esc(nombres.map(limpiarNombre).join('\n'))}</textarea>
        <div class="fila"><button type="button" class="btn secundario" id="aj-reg-no">Descartar</button><button type="button" class="btn primario" id="aj-reg-si">Guardar alumnos</button></div></div>`;
      $('#aj-reg-no').onclick = () => { caja.innerHTML = ''; };
      $('#aj-reg-si').onclick = async () => {
        const l = parsearLista($('#aj-reg-texto').value, grado, turno);
        if (modo === 'cob') { await cargarCobertura(l, grado); cerrarModal(); return; }
        if (modo === 'setup') { await guardarGrupoSetup(l, grado); renderPaso2(); return; }
        await guardarGrupo(l, grado, turno); caja.innerHTML = '';
      };
    } catch (e) {
      caja.innerHTML = `<p class="aviso">${/servidor/i.test(e.message) ? 'Para leer fotos hace falta el servidor de la escuela (todavía no está conectado). Mientras tanto, usá la lista de la escuela con código o escribí los nombres.' : esc(e.message) + ' También podés escribir los nombres.'}</p>`;
    }
  }

  /* ------------------------- Configuración inicial: pasos 2 y 3 ------------------------- */
  function pasoSetup(n) {
    $('#form-setup').hidden = n !== 1; $('#setup-paso2').hidden = n !== 2; $('#setup-paso3').hidden = n !== 3;
    $$('#pasos-setup li').forEach((li, i) => { li.classList.toggle('on', i === n - 1); li.classList.toggle('hecho', i < n - 1); });
    if (n === 2) renderPaso2(); if (n === 3) renderPaso3();
    window.scrollTo(0, 0);
  }
  function renderPaso2() {
    const c = S.cfg, box = $('#setup-paso2'), esp = c.rol === 'especial';
    const g = esp ? '' : gradoPropio(c.turno);
    const cant = esp ? S.alumnos.length : S.alumnos.filter(a => a.grado === g).length;
    const grados = [...gradosDe('Mañana'), ...gradosDe('Tarde')];
    box.innerHTML = `<h2>👦👧 Tus alumnos</h2>
      <p class="estado-paso">${cant ? `✅ Cargados: <b>${cant} alumnos</b>${esp ? ` en ${new Set(S.alumnos.map(a => a.grado)).size} grados` : ` en ${esc(g)}`}` : esp ? 'Cargá las listas de tus grados.' : `Cargá la lista de <b>${esc(g)}</b>.`}</p>
      ${esp ? `<label>¿De qué grado es la foto?<select id="p2-grado">${grados.map(x => `<option>${x}</option>`).join('')}</select></label>` : ''}
      <label class="btn primario grande archivo">📸 Foto del registro<br><small>sacá la foto o elegila de la galería</small><input type="file" id="p2-foto" accept="image/*" hidden></label>
      <div id="reg-res-setup"></div>
      <button type="button" class="btn secundario grande" id="p2-codigo">🏫 Lista de la escuela (con código)</button>
      <details class="otras"><summary>✍️ Escribir los nombres</summary>
        <textarea id="p2-texto" rows="6" placeholder="Un alumno por línea: Apellido, Nombre"></textarea>
        <button type="button" class="btn secundario" id="p2-guardar">Guardar</button></details>
      <button type="button" class="btn ${cant ? 'primario' : 'texto'} grande" id="p2-sig">${cant ? 'Siguiente ▶' : 'Lo hago después ▶'}</button>`;
    const grDe = () => esp ? $('#p2-grado').value : g;
    $('#p2-foto').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) leerRegistroFoto(f, grDe(), turnoDeGrado(grDe()), 'setup'); };
    $('#p2-codigo').onclick = () => cargarListaEscuela(esp ? '' : g);
    $('#p2-guardar').onclick = async () => { const l = parsearLista($('#p2-texto').value, grDe(), turnoDeGrado(grDe())); if (!l.length) { toast('Escribí al menos un nombre.'); return; } await guardarGrupoSetup(l, grDe()); };
    $('#p2-sig').onclick = () => pasoSetup(3);
  }
  async function guardarGrupoSetup(l, g) {
    const t = turnoDeGrado(g), c = S.cfg;
    if (c.rol === 'especial') { c.gradosEsp = c.gradosEsp || {}; const ge = c.gradosEsp[t] = c.gradosEsp[t] || []; if (!ge.includes(g)) ge.push(g); c.modoTurno = c.modoTurno && c.modoTurno !== t ? 'Ambos' : t; }
    await guardarGrupo(l, g, t);
  }
  function renderPaso3() {
    const c = S.cfg, box = $('#setup-paso3'), esp = c.rol === 'especial';
    box.innerHTML = `<h2>📅 Tu horario</h2>
      <p class="ayuda">${esp ? 'En cada casilla va el <b>grado</b> (ej.: 4º C).' : 'En cada casilla va la <b>materia</b> (ej.: Matemática).'} Los recreos como <b>RECREO</b>.</p>
      <label class="btn primario grande archivo">📸 Foto del horario<br><small>sacá la foto o elegila de la galería</small><input type="file" id="p3-foto" accept="image/*" hidden></label>
      <div id="p3-res"></div>
      <details class="otras" id="p3-otras"><summary>✍️ Escribirlo o pegarlo</summary>
        <textarea id="p3-texto" rows="7" placeholder="${esp ? 'Horario,Lunes,Martes,Miércoles,Jueves,Viernes&#10;14:55 a 15:35,7º D,6º C,4º C,5º D,5º C&#10;16:15 a 16:25,RECREO,RECREO,RECREO,RECREO,RECREO' : 'Horario,Lunes,Martes,Miércoles,Jueves,Viernes&#10;08:00 a 08:40,Matemática,Lengua,Ciencias,Matemática,Lengua&#10;09:20 a 09:30,RECREO,RECREO,RECREO,RECREO,RECREO'}">${esc(horarioATexto(c.horarioClases))}</textarea></details>
      <button type="button" class="btn primario grande" id="p3-fin">✔ Terminar</button>
      <button type="button" class="btn texto" id="p3-volver">◀ Volver a los alumnos</button>`;
    $('#p3-foto').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const res = $('#p3-res'); res.innerHTML = '<p class="cargando">Leyendo el horario de la foto…</p>';
      try {
        const img = await comprimir(f, 2000, 0.85);
        const j = await backend('horario', { imagen: img.dataURL.split(',')[1], mime: 'image/jpeg', rol: c.rol });
        if (!j.csv) throw new Error('No pude leer el horario. Probá con más luz y la hoja derecha.');
        $('#p3-texto').value = j.csv; $('#p3-otras').open = true;
        res.innerHTML = `<p class="aviso">Revisá que esté bien y tocá <b>Terminar</b>. ${j.notas ? esc(j.notas) : ''}</p>`;
      } catch (err) {
        res.innerHTML = `<p class="aviso">${/servidor/i.test(err.message) ? 'Para leer fotos hace falta el servidor de la escuela (todavía no está conectado). Mientras tanto, escribí o pegá el horario abajo.' : esc(err.message)}</p>`;
        $('#p3-otras').open = true;
      }
    };
    $('#p3-volver').onclick = () => pasoSetup(2);
    $('#p3-fin').onclick = async () => {
      const txt = $('#p3-texto').value.trim();
      if (txt) {
        const r = aplicarHorario(c, txt);
        if (!r) { toast('No entendí el horario. La primera fila tiene que decir “Horario, Lunes, Martes…” y cada fila empezar con la hora.', 7000); return; }
        await DB.set('cfg', c); toast(`¡Listo! Horario guardado: ${r.clases.length} clases por semana.`, 5000);
      } else toast('¡Listo! El horario lo podés cargar después en Ajustes.', 5000);
      mostrarBloqueo();
    };
  }

  /* ------------------------------ Eventos ----------------------------- */
  function enlazar() {
    $('#form-setup').onsubmit = async e => {
      e.preventDefault();
      const f = $('#su-frase').value, f2 = $('#su-frase2').value;
      if (f !== f2) { toast('Las frases no coinciden.'); return; }
      try {
        toast('Generando llave…');
        S.llave = await PSCrypto.derivarLlave(f);
        await DB.set('llave', S.llave);
        await DB.set('verif', await PSCrypto.cifrar(S.llave, { ok: true }));
        S.cfg = Object.assign({}, CFG_DEF, { escuela: $('#su-escuela').value.trim(), docente: $('#su-docente').value.trim(), horaCierre: $('#su-cierre').value, rol: $('#su-rol').value });
        const c = S.cfg, g = $('#su-grado').value;
        if (c.rol === 'grado' && g) { const t = turnoDeGrado(g); c.grados = { [t]: g }; c.modoTurno = t; c.turno = t; }
        await DB.set('cfg', S.cfg);
        if (esDirectivo()) { mostrarBloqueo(); toast('Listo. Escaneá el QR de la escuela al llegar.', 6000); return; }
        pasoSetup(2);
      } catch (err) { toast(err.message); }
    };
    $('#su-grado').innerHTML = '<option value="">Elegí tu grado…</option>' + ['Mañana', 'Tarde'].map(t => `<optgroup label="Turno ${t.toLowerCase()}">${gradosDe(t).map(x => `<option>${x}</option>`).join('')}</optgroup>`).join('');
    const suRol = () => {
      const r = $('#su-rol').value, dir = ['secretario', 'vice', 'director'].includes(r);
      $('#su-grado-l').hidden = r !== 'grado'; $('#su-grado').required = r === 'grado';
      $$('#pasos-setup li').forEach((li, i) => li.hidden = dir && i > 0);
    };
    $('#su-rol').onchange = suRol; suRol();
    $('#btn-desbloquear').onclick = desbloquear;
    $('#btn-consulta-protocolos').onclick = entrarConsulta;
    $('#btn-salir-consulta').onclick = mostrarBloqueo;
    $('#btn-ajustes-bloqueo').onclick = async () => {
      if (!await verificarFrase()) return;
      S.modoConsulta = true; $('#nav').hidden = true; $('#btn-salir-consulta').hidden = false;
      $('#hdr-titulo').textContent = 'Ajustes'; $('#hdr-sesion').textContent = 'App bloqueada';
      mostrar('pantalla-app'); irTab('ajustes');
    };
    $$('#nav button').forEach(b => b.onclick = async () => {
      if (b.dataset.tab === 'ajustes' && !await verificarFrase()) return;
      irTab(b.dataset.tab);
    });

    // Pasillo
    const grupos = {}; PSVoz.DESTINOS_INFO.forEach(d => (grupos[d.grupo] = grupos[d.grupo] || []).push(d.id));
    $('#destino-manual').innerHTML = ['Sale solo', 'Con un adulto o familiar', 'Se retira de la escuela'].map(gn => `<optgroup label="${gn}">${grupos[gn].map(d => `<option>${esc(d)}</option>`).join('')}</optgroup>`).join('');
    $('#btn-mic').onclick = () => {
      if (!S.alumnos.length) { toast('Primero cargá la lista de alumnos en Ajustes.'); return; }
      $('#mic-estado').textContent = 'Escuchando…';
      dictar($('#btn-mic'), $('#mic-texto'), t => { $('#mic-estado').textContent = 'Tocá y decí: “Nombre Apellido sale al baño” o “… regresó”.'; procesarFrase(t); });
    };
    $('#form-cmd').onsubmit = e => {
      e.preventDefault();
      const t = $('#cmd-texto').value.trim(); if (!t) return;
      if (!S.alumnos.length) { toast('Primero cargá la lista de alumnos en Ajustes.'); return; }
      $('#cmd-texto').value = ''; procesarFrase(t);
    };
    $('#btn-qr-alumno').onclick = qrAlumno;
    $('#btn-deshacer').onclick = deshacer;
    $('#buscar-alumno').oninput = renderListaAlumnos;

    // Protocolos
    $('#btn-proto-buscar').onclick = buscarProtocolo;
    $('#btn-proto-contar').onclick = () => { const b = $('#proto-buscador'); b.hidden = !b.hidden; if (!b.hidden) $('#proto-consulta').focus(); };
    $('#btn-proto-mic').onclick = () => dictar($('#btn-proto-mic'), null, t => { const a = $('#proto-consulta'); a.value = (a.value ? a.value + ' ' : '') + t; buscarProtocolo(); });
    renderTodosProtocolos();

    // Incidentes
    $('#inc-foto').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const ia = await comprimir(f, 1400, 0.75), th = await comprimir(f, 600, 0.6);
        S.incFoto = { ia: ia.dataURL, thumb: th.dataURL, tw: th.w, th: th.h }; S.incIA = null;
        $('#inc-preview').src = th.dataURL; $('#inc-preview').hidden = false;
        if (!$('#inc-hasta').value) $('#inc-hasta').value = new Date().toTimeString().slice(0, 5);
        if (!$('#inc-desde').value && S.sesion) $('#inc-desde').value = new Date(S.sesion.abierta).toTimeString().slice(0, 5);
      } catch (err) { toast(err.message); }
    };
    $('#btn-inc-cruce').onclick = cruzarSalidas;
    $('#btn-inc-ia').onclick = analizarIA;
    $('#btn-inc-guardar').onclick = guardarIncidente;
    $('#btn-inc-mic').onclick = () => dictar($('#btn-inc-mic'), null, t => { const a = $('#inc-obs'); a.value = (a.value ? a.value + ' ' : '') + t; });

    // Informe
    $('#btn-inf-preview').onclick = () => {
      const p = generarPDF({ motivo: 'vista previa', fin: Date.now(), vistaPrevia: true });
      if (window.PSDemo) PSDemo.guardarPDF(p.doc.output('blob'), 'vista-previa-' + p.nombre);
      else window.open(URL.createObjectURL(p.doc.output('blob')), '_blank');
    };
    $('#btn-inf-cerrar').onclick = async () => { if (await confirmar('¿Cerrar la jornada? Se enviará el informe y la app quedará bloqueada.', 'Cerrar jornada')) cerrarJornada('Cierre manual del docente al retirarse'); };

    // Ajustes
    $('#form-ajustes').onsubmit = async e => {
      e.preventDefault();
      Object.assign(S.cfg, {
        escuela: $('#aj-escuela').value.trim(), docente: $('#aj-docente').value.trim(), cargo: $('#aj-cargo').value.trim(), localidad: $('#aj-localidad').value.trim(),
        minAmarillo: Math.max(1, +$('#aj-amarillo').value || 3), minAlerta: Math.max((+$('#aj-amarillo').value || 3) + 1, +$('#aj-alerta').value || 6), soloIniciales: $('#aj-iniciales').checked,
        backendUrl: $('#aj-url').value.trim(), backendToken: $('#aj-token').value.trim(), telDireccion: $('#aj-tel-dir').value.trim()
      });
      if (S.cfg.geo) S.cfg.geo.radio = Math.max(50, +$('#aj-radio').value || 150);
      await DB.set('cfg', S.cfg);
      if (S.sesion) iniciarVigilanciaGeo();
      toast('Ajustes guardados.'); renderAjustes();
    };
    $('#btn-aj-geo').onclick = async () => {
      try { toast('Obteniendo ubicación…'); const u = await ubicacionActual(); S.cfg.geo = { lat: u.lat, lng: u.lng, radio: Math.max(50, +$('#aj-radio').value || 150) }; await DB.set('cfg', S.cfg); renderAjustes(); toast(`Ubicación guardada (precisión ±${Math.round(u.acc)} m).`); }
      catch (e) { toast(e.message); }
    };
    $('#btn-aj-geo-borrar').onclick = async () => { S.cfg.geo = null; await DB.set('cfg', S.cfg); renderAjustes(); };
    $('#btn-aj-probar').onclick = async () => {
      S.cfg.backendUrl = $('#aj-url').value.trim(); S.cfg.backendToken = $('#aj-token').value.trim();
      try { const j = await backend('ping', {}); toast('Conexión OK · informes a: ' + (j.destino || 'dirección')); } catch (e) { toast('Falló: ' + e.message, 5000); }
    };
    $('#btn-alta').onclick = () => abrirAlta(S.cfg.turno);
    $$('#aj-letra button').forEach(b => b.onclick = async () => { S.cfg.letra = b.dataset.letra; await DB.set('cfg', S.cfg); aplicarLetra(); toast('Tamaño de letra cambiado.'); });
    $('#btn-ayuda').onclick = abrirAyuda;
    $('#btn-cambiar-salida').onclick = () => dialogoSalida('cambiar');
    $('#btn-me-retiro').onclick = () => dialogoSalida('ahora');
    $('#btn-todos-presentes').onclick = async () => {
      alumnosVisibles().forEach(a => { if (S.asistencia[a.id] !== 'A') S.asistencia[a.id] = 'P'; });
      await setEnc('asistencia', S.asistencia); renderListaAlumnos(); toast('Marcados como presentes (los ausentes quedan igual).');
    };
    $('#btn-aj-reset').onclick = async () => {
      if (!await verificarFrase()) return;
      if (!await confirmar('Esto borra llave, lista, ajustes, registros e informes pendientes del celular. ¿Seguro?', 'Borrar todo')) return;
      detenerVigilanciaGeo(); await DB.limpiar(); location.reload();
    };

    $('#modal').onclick = e => { if (e.target.id === 'modal' && !$('#lector') && !$('.editor-inf')) cerrarModal(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); enviarPendientes(); } });
    window.addEventListener('online', () => enviarPendientes());
    setInterval(tick, 1000);
  }

  /* ------------------------------ Arranque ---------------------------- */
  window.PSApp = {
    S, $, $$, esc, hhmm, uid, modal, cerrarModal, toast, confirmar, backend, setEnc, getEnc, DB, vibrar, iniciales,
    alumnosVisibles, gradoActual, estaAfuera, retirado, renderIncidentes, comprimir, enviarAlerta, gradosDe, verificarFrase, descargarPDF, confirmarEnLinea, dictar, enviarPendientes
  };
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
  async function iniciar() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
    await DB.abrir();
    if (window.PSDemo) await PSDemo.antes();
    enlazar();
    if (window.PSEmerg) PSEmerg.init(window.PSApp);
    if (window.PSEvid) PSEvid.init(window.PSApp);
    S.cfg = Object.assign({}, CFG_DEF, await DB.get('cfg') || {});
    S.llave = await DB.get('llave');
    if (!S.llave || !(await DB.get('cfg'))) { mostrar('pantalla-setup'); return; }
    aplicarLetra();
    S.alumnos = await getEnc('alumnos', []);
    S.sesion = await DB.get('sesion') || null;
    if (S.sesion) {
      S.eventos = await getEnc('eventos', []); S.incidentes = await getEnc('incidentes', []); S.asistencia = await getEnc('asistencia', {}); S.alumnosCob = await getEnc('alumnosCob', []);
      if (Date.now() >= S.sesion.cierre) { await cerrarJornada('Cumplido el horario de salida (' + hhmm(S.sesion.cierre) + '); la app estaba cerrada', S.sesion.cierre); return; }
      entrarApp();
    } else mostrarBloqueo();
    enviarPendientes();
  }
  iniciar().catch(e => { document.body.innerHTML = '<p style="padding:20px">Error al iniciar: ' + esc(e.message) + '</p>'; });
})();
