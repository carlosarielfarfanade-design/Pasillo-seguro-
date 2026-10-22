/* =========================================================================
   Pasillo Seguro · voz.js
   Dictado (Web Speech API) + intérprete de frases tipo:
   "Juan Pérez sale al baño" · "Juan Pérez regresó" · "volvió Pérez"
   ========================================================================= */
(function (g) {
  'use strict';
  const norm = t => (t || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();

  const SALE = ['sale', 'salio', 'salir', 'se va', 'va al', 'va a la', 'fue al', 'fue a la', 'se fue', 'pide salir', 'pidio salir', 'se retira', 'sale a',
    'se lo llevo', 'se la llevo', 'lo llevo', 'la llevo', 'lo retiro', 'la retiro', 'lo retiraron', 'la retiraron', 'lo vino a buscar', 'la vino a buscar', 'vinieron a buscar', 'lo buscaron', 'la buscaron', 'se lo llevaron', 'se la llevaron'];
  const REGRESA = ['regreso', 'regresa', 'volvio', 'vuelve', 'entro', 'entra', 'llego', 'ingreso', 'ya esta', 'esta de vuelta', 'de vuelta', 'retorno'];
  const AUSENTE = ['ausente', 'falto', 'no vino', 'no asistio', 'esta ausente'];
  const PRESENTE = ['presente', 'esta presente', 'asistio'];
  /* tipo: 'solo' = sale sin adulto (semáforo) · 'acomp' = con un adulto/familiar de la escuela · 'retiro' = se va de la escuela */
  const DESTINOS = [
    { id: 'Retirado por padre/madre', tipo: 'retiro', grupo: 'Se retira de la escuela', k: ['padre', 'papa', 'madre', 'mama', 'padres', 'papas', 'su familia'] },
    { id: 'Retirado por tutor/a', tipo: 'retiro', grupo: 'Se retira de la escuela', k: ['tutor', 'tutora', 'encargado', 'encargada'] },
    { id: 'Retirado por abuelo/a', tipo: 'retiro', grupo: 'Se retira de la escuela', k: ['abuela', 'abuelo', 'abuelos'] },
    { id: 'Retirado por hermano/a', tipo: 'retiro', grupo: 'Se retira de la escuela', k: ['hermano', 'hermana'], si: q => /(llevo|llevaron|retir|se fue con)/.test(q) },
    { id: 'Lo buscó su hermano/a (otro grado)', tipo: 'acomp', grupo: 'Con un adulto o familiar', k: ['hermano', 'hermana'], si: q => /(vino a buscar|vinieron a buscar|lo busco|la busco)/.test(q) },
    { id: 'Fue al grado de su hermano/a', tipo: 'solo', grupo: 'Sale solo', k: ['hermano', 'hermana', 'otro grado'] },
    { id: 'Con maestro/a de Música', tipo: 'acomp', grupo: 'Ensayo o práctica', k: ['musica', 'ensayo', 'acto'] },
    { id: 'Con maestro/a de Educación Física', tipo: 'acomp', grupo: 'Ensayo o práctica', k: ['educacion fisica', 'fisica', 'gimnasia'] },
    { id: 'Con maestro/a de Plástica', tipo: 'acomp', grupo: 'Ensayo o práctica', k: ['plastica', 'artes visuales'] },
    { id: 'Con maestro/a de Actividades Prácticas', tipo: 'acomp', grupo: 'Ensayo o práctica', k: ['actividades practicas', 'practicas', 'tecnologia'] },
    { id: 'Con un maestro/a de grado', tipo: 'acomp', grupo: 'Ensayo o práctica', k: ['maestro de grado', 'maestra de grado', 'otro grado con la maestra'] },
    { id: 'Con la portera / el portero', tipo: 'acomp', grupo: 'Con un adulto o familiar', k: ['portera', 'portero', 'ordenanza'] },
    { id: 'Con otro docente', tipo: 'acomp', grupo: 'Con un adulto o familiar', k: ['maestro', 'maestra', 'profesor', 'profesora', 'profe', 'seno', 'senorita', 'docente'] },
    { id: 'Baño', tipo: 'solo', grupo: 'Sale solo', k: ['bano', 'banio', 'sanitario', 'toilette', 'pis'] },
    { id: 'Dirección', tipo: 'solo', grupo: 'Sale solo', k: ['direccion', 'director', 'directora', 'vicedireccion'] },
    { id: 'Secretaría', tipo: 'solo', grupo: 'Sale solo', k: ['secretaria', 'secretario'] },
    { id: 'Preceptoría', tipo: 'solo', grupo: 'Sale solo', k: ['preceptoria', 'preceptor', 'preceptora'] },
    { id: 'Enfermería / se siente mal', tipo: 'solo', grupo: 'Sale solo', k: ['enfermeria', 'botiquin', 'se siente mal', 'le duele', 'dolor'] },
    { id: 'Bebedero', tipo: 'solo', grupo: 'Sale solo', k: ['agua', 'bebedero', 'tomar agua'] },
    { id: 'Pasillo / patio', tipo: 'solo', grupo: 'Sale solo', k: ['pasillo', 'patio'] },
    { id: 'Otro', tipo: 'solo', grupo: 'Sale solo', k: [] }
  ];
  const tipoDe = id => (DESTINOS.find(d => d.id === id) || { tipo: 'solo' }).tipo;

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

  function contiene(q, lista) {
    const toks = q.split(' ');
    return lista.some(k => k.includes(' ') ? (' ' + q + ' ').includes(' ' + k + ' ') : toks.includes(k));
  }

  /** Puntúa qué tan bien aparece el alumno en la frase. */
  function puntuarAlumno(alumno, tokens) {
    const partes = norm(alumno.nombre).split(' ').filter(w => w.length > 1);
    if (!partes.length) return 0;
    let suma = 0, hallados = 0;
    partes.forEach(p => {
      let best = 0;
      tokens.forEach(t => { const s = sim(p, t); if (s > best) best = s; });
      if (best >= 0.75) { hallados++; suma += best; }
    });
    if (!hallados) return 0;
    // Premia nombre completo; un solo token vale menos (puede haber varios "Juan")
    return (suma / hallados) * (0.6 + 0.4 * hallados / partes.length) + (hallados >= 2 ? 0.1 : 0);
  }

  /**
   * Interpreta una frase.
   * @returns {{accion:'sale'|'regresa'|null, destino:string|null, candidatos:Array<{alumno,score}>, ambiguo:boolean, texto:string}}
   */
  function interpretar(frase, alumnos) {
    const q = norm(frase);
    let accion = null;
    if (contiene(q, AUSENTE)) accion = 'ausente';
    else if (contiene(q, PRESENTE)) accion = 'presente';
    else if (contiene(q, REGRESA)) accion = 'regresa';
    else if (contiene(q, SALE)) accion = 'sale';
    let destino = null;
    for (const d of DESTINOS) if (d.k.length && contiene(q, d.k) && (!d.si || d.si(q))) { destino = d.id; break; }
    if (!accion && destino) accion = 'sale';
    if (accion === 'sale' && !destino) destino = 'Baño';
    const quitar = new Set([...SALE, ...REGRESA, ...AUSENTE, ...PRESENTE, ...DESTINOS.flatMap(d => d.k)].flatMap(x => x.split(' ')).concat(['al', 'a', 'la', 'el', 'de', 'del', 'y', 'que', 'lo', 'le', 'se', 'su', 'sus', 'con', 'por', 'para', 'los', 'las', 'un', 'una', 'llevo', 'busco', 'buscar', 'vino']));
    const tokens = q.split(' ').filter(t => t.length > 1 && !quitar.has(t));
    const candidatos = (alumnos || []).map(a => ({ alumno: a, score: puntuarAlumno(a, tokens) }))
      .filter(c => c.score >= 0.6).sort((a, b) => b.score - a.score);
    const ambiguo = candidatos.length > 1 && (candidatos[0].score - candidatos[1].score) < 0.08;
    return { accion, destino, candidatos, ambiguo, texto: frase };
  }

  /* ------------------------- Alta de alumno nuevo ------------------------- */
  const ALTA = ['ingresa a la escuela', 'ingreso a la escuela', 'ingresa al grado', 'ingreso al grado', 'ingresa hoy', 'ingreso hoy', 'ingresa el', 'ingresara',
    'alumno nuevo', 'alumna nueva', 'nuevo alumno', 'nueva alumna', 'se incorpora', 'se incorporo', 'se suma al grado', 'viene con pase', 'vino con pase', 'con pase',
    'traslado', 'trasladado', 'trasladada', 'ingresante', 'dar de alta', 'agregar alumno', 'agregar alumna', 'agrega a', 'agregar a'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function fechaDe(q) {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const mas = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return iso(d); };
    let m = q.match(new RegExp('(\\d{1,2}) de (' + MESES.join('|') + ')'));
    if (m) { const d = new Date(hoy.getFullYear(), MESES.indexOf(m[2]), +m[1], 12); if (hoy - d > 180 * 864e5) d.setFullYear(d.getFullYear() + 1); return iso(d); }
    m = q.match(/(\d{1,2}) (\d{1,2})(?: (\d{2,4}))?/); // 15/11 queda "15 11" al normalizar
    if (m && +m[2] >= 1 && +m[2] <= 12) { let y = m[3] ? +m[3] : hoy.getFullYear(); if (y < 100) y += 2000; return iso(new Date(y, +m[2] - 1, +m[1], 12)); }
    if (/pasado manana/.test(q)) return mas(2);
    if (/\bmanana\b/.test(q) && !/turno manana/.test(q)) return mas(1);
    if (/\bayer\b/.test(q)) return mas(-1);
    for (let i = 0; i < 7; i++) if (new RegExp('\\b' + DIAS[i] + '\\b').test(q)) { let k = (i - hoy.getDay() + 7) % 7; if (/pasado|anterior/.test(q)) k -= 7; return mas(k); }
    return iso(hoy);
  }
  const esAlta = f => contiene(norm(f), ALTA);
  function interpretarAlta(frase) {
    const q = norm(frase), fecha = fechaDe(q);
    const fuera = new Set([...ALTA.flatMap(x => x.split(' ')), ...DIAS, 'hoy', 'manana', 'pasado', 'ayer', 'el', 'la', 'a', 'al', 'de', 'del', 'en', 'escuela', 'grado',
      'desde', 'partir', 'fecha', 'dia', 'alumno', 'alumna', 'nuevo', 'nueva', 'que', 'se', 'su', 'con', 'y', 'es', 'va', 'los', 'las', 'por', 'este', 'esta', 'proximo',
      'proxima', 'semana', 'ingresa', 'ingreso', 'ingresara', 'incorpora', 'incorporo', 'pase', 'otra', 'otro', 'nuestro', 'mi', 'tu', 'grado', 'aula', 'hoy']);
    const nombre = frase.replace(/\d{1,2}\s+de\s+\p{L}+/giu, ' ').replace(/[.,;:!?¿¡"“”]/g, ' ').split(/\s+/)
      .filter(w => w && !/\d/.test(w) && !fuera.has(norm(w)))
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return { nombre, fecha };
  }

  /** Dictado de una sola frase. onResult(texto), onError(msg), onEnd() */
  function escuchar({ onResult, onError, onEnd, onParcial }) {
    const SR = g.SpeechRecognition || g.webkitSpeechRecognition;
    if (!SR) { onError && onError('Este navegador no tiene dictado por voz. Usá Google Chrome en Android.'); return null; }
    const r = new SR();
    r.lang = 'es-AR'; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
    r.onresult = ev => {
      let final = '', parcial = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript; else parcial += ev.results[i][0].transcript;
      }
      if (parcial && onParcial) onParcial(parcial);
      if (final && onResult) onResult(final.trim());
    };
    r.onerror = ev => {
      const m = { 'not-allowed': 'Permiso de micrófono denegado.', 'no-speech': 'No se escuchó nada. Probá de nuevo.', network: 'El dictado necesita conexión a internet.' };
      onError && onError(m[ev.error] || ('Error de dictado: ' + ev.error));
    };
    r.onend = () => onEnd && onEnd();
    try { r.start(); } catch (e) { onError && onError(e.message); }
    return r;
  }

  g.PSVoz = { interpretar, escuchar, norm, tipoDe, esAlta, interpretarAlta, fechaIso: iso, DESTINOS: DESTINOS.map(d => d.id), DESTINOS_INFO: DESTINOS.map(({ id, tipo, grupo }) => ({ id, tipo, grupo })) };
})(typeof window !== 'undefined' ? window : globalThis);
