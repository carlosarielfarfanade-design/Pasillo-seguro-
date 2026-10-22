/* =========================================================================
   Pasillo Seguro · emergencia.js
   Mapa de la escuela (2D/3D), evacuación por grado, sectores de cuidado,
   ubicación de docentes por aula y modo emergencia / simulacro.
   El plano NO va en el código público: se importa como archivo (lo entrega la dirección).
   ========================================================================= */
(function () {
  'use strict';
  let A = null, PLAN = null, EM = null; // EM = emergencia en curso
  const $ = s => document.querySelector(s);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const NUM_FIJOS = [{ n: 'Policía / Emergencias', t: '911' }, { n: 'Bomberos', t: '100' }, { n: 'SAME (ambulancia)', t: '107' }];
  const TIPOS = {
    sismo: {
      t: 'Sismo / temblor', ic: '🌎', evacua: true,
      antes: ['Mantené la calma y hablá firme y claro: “¡Agacharse, cubrirse y sujetarse!”.',
        'Los chicos se agachan debajo del banco (o junto a una pared interior), se cubren la cabeza y el cuello con los brazos y se sujetan de la pata del banco.',
        'Lejos de ventanas, vidrios, estantes y cosas que puedan caer. Nadie corre ni sale durante el movimiento.'],
      despues: ['Cuando termine el movimiento y suene la señal de evacuación de la escuela, salí en fila por TU recorrido (ver Mapa). Sin correr, sin empujar, sin volver por mochilas.',
        'El docente sale último, con este celular (tiene la lista). Revisá que no quede nadie en el aula ni en el baño.',
        'No usar el patio cubierto como lugar de reunión: tiene techo. Las zonas seguras son al aire libre, lejos de paredes, cables y árboles.',
        'En el punto de encuentro: contá a los chicos con la pestaña “Mis alumnos” y avisá a la dirección.',
        'Puede haber réplicas. Nadie vuelve a entrar hasta que lo indique la dirección o Defensa Civil.']
    },
    incendio: {
      t: 'Incendio', ic: '🔥', evacua: true,
      antes: ['Avisá de inmediato a la dirección (y que suene la alarma). Sólo un adulto capacitado usa el matafuego, y únicamente si el fuego es chico.',
        'Evacuá YA por tu recorrido. Si hay humo, avanzar agachados, tapando nariz y boca.',
        'Antes de abrir una puerta, tocala con el dorso de la mano: si está caliente, usá otra salida.'],
      despues: ['Al salir, cerrá la puerta del aula (sin llave) para frenar el humo.',
        'Nadie vuelve a buscar nada. En el punto de encuentro, contá a los chicos y avisá a la dirección.',
        'Llamá a Bomberos (100) si nadie lo hizo todavía.']
    },
    intruso: {
      t: 'Persona extraña / intruso', ic: '🚷', evacua: false,
      antes: ['ENCIERRO: NO evacues, salvo orden de la dirección o la policía.',
        'Hacé entrar al aula a los chicos que estén cerca en el pasillo. Cerrá la puerta y trabala (llave o mueble). Bajá cortinas y apagá la luz.',
        'Ubicá a los chicos lejos de la puerta y de las ventanas, agachados y en silencio. Celulares en silencio.'],
      despues: ['No abras la puerta a nadie hasta que la dirección o la policía se identifiquen y lo indiquen.',
        'Mirá en “Mis alumnos” quiénes estaban FUERA del aula y avisá a la dirección para que un adulto los resguarde. No salgas a buscarlos solo.',
        'Si hay agresión o peligro inmediato: llamá al 911.']
    },
    otra: {
      t: 'Otra emergencia (gas, inundación, amenaza)', ic: '⚠️', evacua: true,
      antes: ['Seguí la indicación de la dirección. Si se ordena evacuar, usá tu recorrido y tu punto de encuentro.',
        'Escape de gas: no prender ni apagar luces, no usar fuego; abrí ventanas y evacuá.'],
      despues: ['En el punto de encuentro, contá a los chicos y avisá a la dirección.',
        'Nadie vuelve a entrar hasta que lo indique la dirección.']
    }
  };

  /* ------------------------------ Plano: datos ------------------------------ */
  async function cargarPlan() {
    try { PLAN = await A.DB.get('plan'); } catch (e) { PLAN = null; }
    if (!PLAN && window.PSDemo && PSDemo.plan) PLAN = PSDemo.plan;
    return PLAN;
  }
  const aulaDe = g => PLAN && g ? PLAN.aulas.find(a => a.grados.includes(g)) : null;
  const puntoDe = id => PLAN ? PLAN.puntos.find(p => p.id === id) : null;
  function ini(n) {
    const w = String(n || '?').replace(/\(.*?\)/g, ' ').split(/\s+/).filter(x => /^\p{L}/u.test(x) && !/^(prof|profe|docente|sr|sra|lic)\.?$/i.test(x));
    return w.length ? (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() : '?';
  }
  const centro = r => [r.x + r.w / 2, r.y + r.h / 2];
  function sectorPropio() {
    if (!PLAN || !A || !A.S.cfg) return null;
    const c = A.S.cfg;
    if (c.miSector) return PLAN.sectores.find(s => s.nombre === c.miSector) || null;
    const N = x => PSVoz.norm(x || '');
    const toks = N(c.docente).split(' ').filter(t => t.length >= 4 && !/^(prof|profe|profesor|profesora|docente)$/.test(t));
    const porNombre = PLAN.sectores.find(s => toks.some(t => N(s.nombre).split(' ').includes(t)));
    if (porNombre) return porNombre;
    if (c.rol === 'especial') {
      const q = N(c.cargo + ' ' + c.docente), mapa = [['music', 'musical'], ['fisica', 'fisica'], ['plastic', 'plastica'], ['practic', 'practicas'], ['ingles', 'ingles']];
      for (const [k, v] of mapa) if (q.includes(k)) { const s = PLAN.sectores.find(s => N(s.nombre).includes(v)); if (s) return s; }
    }
    const g = A.gradoActual(); if (!g) return null;
    const n = g.charAt(0), l = g.slice(-1);
    return PLAN.sectores.find(s => s.grupo === n && s.nombre.includes(l)) || PLAN.sectores.find(s => s.grupo === n) || null;
  }

  function etiquetaSector(s) {
    if (!s) return '';
    if (s.grupo) return s.grupo + '.º GRADO';
    const n = PSVoz.norm(s.nombre);
    const M = [['musical', 'MÚSICA'], ['fisica', 'ED. FÍSICA'], ['plastica', 'PLÁSTICA'], ['practicas', 'ACT. PRÁCTICAS'], ['ingles', 'INGLÉS'], ['secretar', 'SECRETARÍA'], ['directivo', 'DIRECCIÓN'], ['rejilla', 'REJILLA'], ['cancha', 'CANCHA'], ['patio cubierto', 'PATIO CUBIERTO']];
    for (const [k, v] of M) if (n.includes(k)) return v;
    return s.nombre.replace(/\(.*?\)/g, '').trim().toUpperCase();
  }
  const enRecreo = () => !!(A && A.recreoAhora && A.recreoAhora());

  /* ------------------------------ Plano: dibujo SVG ------------------------------ */
  const FILL = { exterior: '#e7e5e4', cancha: '#a7d7a0', 'patio-cubierto': 'url(#ps-techo)', patio: '#d9f2d0', admin: '#dbeafe', servicio: '#f1f5f9', bano: '#ede9fe', especial: '#fde68a', entrada: '#fbcfe8', aula: '#fed7aa' };
  function svgPlan(cap, foco) {
    const P = PLAN, W = P.W, H = P.H, o = [];
    const miAula = aulaDe(foco);
    o.push(`<svg class="m-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plano de la escuela">
      <defs>
        <pattern id="ps-techo" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="26" height="26" fill="#e7e5e4"/><rect width="9" height="26" fill="#d6d3d1"/></pattern>
        ${P.puntos.map(p => `<marker id="ps-fl-${p.id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${p.color}"/></marker>`).join('')}
        <marker id="ps-fl-coord" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#475569"/></marker>
      </defs>
      <rect width="${W}" height="${H}" fill="#eef1e8"/>`);
    // cancha: líneas
    P.espacios.forEach(e => {
      const edif = !['exterior', 'cancha', 'patio-cubierto', 'patio'].includes(e.tipo);
      if (edif) o.push(`<rect x="${e.x + 7}" y="${e.y + 10}" width="${e.w}" height="${e.h}" rx="6" fill="#0000001f"/>`);
      o.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${edif ? 6 : 14}" fill="${FILL[e.tipo] || '#fff'}" stroke="${edif ? '#64748b' : '#94a3b8'}" stroke-width="${edif ? 3 : 2}"/>`);
      if (e.tipo === 'cancha') o.push(`<rect x="${e.x + 30}" y="${e.y + 20}" width="${e.w - 60}" height="${e.h - 40}" fill="none" stroke="#fff" stroke-width="4"/><line x1="${e.x + e.w / 2}" y1="${e.y + 20}" x2="${e.x + e.w / 2}" y2="${e.y + e.h - 20}" stroke="#fff" stroke-width="4"/><circle cx="${e.x + e.w / 2}" cy="${e.y + e.h / 2}" r="34" fill="none" stroke="#fff" stroke-width="4"/>`);
      const fs = Math.max(18, Math.min(40, Math.min(e.w / (e.nombre.length * 0.55), e.h * 0.42)));
      const [cx, cy] = centro(e);
      o.push(e.vertical ? `<text x="${cx}" y="${cy}" transform="rotate(-90 ${cx} ${cy})" class="m-t" font-size="34" fill="#78716c">${esc(e.nombre)}</text>`
        : `<text x="${cx}" y="${cy}" class="m-t" font-size="${fs}" fill="#334155">${esc(e.nombre)}</text>`);
    });
    if (cap.evac) P.aulas.forEach(a => {
      const p = puntoDe(a.punto); if (!p) return;
      const mia = miAula && a === miAula, dim = miAula && !mia;
      const pts = [a.puerta, ...a.ruta].map(q => q.join(',')).join(' ');
      o.push(`<polyline points="${pts}" fill="none" stroke="${p.color}" stroke-width="${mia ? 16 : 10}" stroke-linecap="round" stroke-linejoin="round" class="m-ruta${mia ? ' mia' : ''}" opacity="${dim ? 0.22 : 0.95}" marker-end="url(#ps-fl-${p.id})"/>`);
    });
    if (cap.evac) (P.rutasExtra || []).forEach(r => {
      o.push(`<polyline points="${r.pts.map(q => q.join(',')).join(' ')}" fill="none" stroke="#475569" stroke-width="8" stroke-dasharray="4 16" stroke-linecap="round" opacity="${miAula ? 0.3 : 0.8}" marker-end="url(#ps-fl-coord)"/>`);
    });
    P.aulas.forEach(a => {
      const mia = miAula && a === miAula;
      o.push(`<rect x="${a.x + 7}" y="${a.y + 10}" width="${a.w}" height="${a.h}" rx="6" fill="#0000001f"/><rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="6" fill="${mia ? '#fdba74' : FILL.aula}" stroke="${mia ? '#c2410c' : '#9a3412'}" stroke-width="${mia ? 8 : 3}"/>`);
      const [cx, cy] = centro(a);
      o.push(`<text x="${cx}" y="${cy - 22}" class="m-t" font-size="42" font-weight="700" fill="#7c2d12">${esc(a.grados[0])}</text><text x="${cx}" y="${cy + 26}" class="m-t" font-size="42" font-weight="700" fill="#7c2d12">${esc(a.grados[1] || '')}</text>`);
      o.push(`<rect x="${a.puerta[0] - 12}" y="${a.puerta[1] - 12}" width="24" height="24" rx="4" fill="#fff" stroke="#9a3412" stroke-width="3"/>`);
    });
    if (cap.sect && cap.fuerte) {
      const mio = sectorPropio(), sel = cap.selSector ? P.sectores.find(s => s.nombre === cap.selSector) : null;
      P.sectores.forEach(s => {
        const yo = mio && s === mio, es = sel ? s === sel : true, [cx, cy] = centro(s), vert = s.h > s.w * 1.6;
        if (yo && enRecreo()) {
          o.push(`<g class="m-sector alerta-rec"><rect x="${s.x + 8}" y="${s.y + 12}" width="${s.w}" height="${s.h}" rx="10" fill="#00000040"/><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="10" fill="#dc2626" fill-opacity=".85" stroke="#7f1d1d" stroke-width="10"/>
            <text x="${cx}" y="${cy}" class="m-t m-sec" font-size="${Math.max(24, Math.min(42, (vert ? s.h : s.w) / 9))}" font-weight="900" fill="#fff" stroke="#7f1d1d" stroke-width="6" paint-order="stroke" ${vert ? `transform="rotate(-90 ${cx} ${cy})"` : ''}>⚠ ¡${esc(etiquetaSector(s))}!</text></g>`);
          return;
        }
        o.push(`<g class="m-sector${sel && es ? ' elegido' : ''}" opacity="${es ? 1 : 0.28}">
          <rect x="${s.x + 8}" y="${s.y + 12}" width="${s.w}" height="${s.h}" rx="10" fill="#00000033"/>
          <rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="10" fill="${s.color}" fill-opacity="${sel && es ? 0.8 : yo ? 0.7 : 0.55}" stroke="${yo || (sel && es) ? '#111' : '#fff'}" stroke-width="${yo || (sel && es) ? 9 : 5}"/>
          <text x="${cx}" y="${cy}" class="m-t m-sec" font-size="${Math.max(20, Math.min(34, (vert ? s.h : s.w) / (s.nombre.length * 0.55)))}" font-weight="800" fill="#fff" stroke="${s.color}" stroke-width="7" paint-order="stroke" ${vert ? `transform="rotate(-90 ${cx} ${cy})"` : ''}>${yo ? '★ ' : ''}${esc(s.nombre)}</text></g>`);
      });
    } else if (cap.sect) {
      const mio = sectorPropio();
      P.sectores.forEach(s => {
        const yo = mio && s === mio;
        if (yo && enRecreo()) { const [cx, cy] = centro(s), vert = s.h > s.w * 1.6; o.push(`<g class="alerta-rec"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="10" fill="#dc2626" fill-opacity=".85" stroke="#7f1d1d" stroke-width="10"/><text x="${cx}" y="${cy}" class="m-t m-sec" font-size="34" font-weight="900" fill="#fff" stroke="#7f1d1d" stroke-width="6" paint-order="stroke" ${vert ? `transform="rotate(-90 ${cx} ${cy})"` : ''}>⚠ ¡${esc(etiquetaSector(s))}!</text></g>`); return; }
        o.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="10" fill="${s.color}" fill-opacity="${yo ? 0.42 : 0.2}" stroke="${s.color}" stroke-width="${yo ? 10 : 4}" stroke-dasharray="${yo ? '0' : '14 10'}"/>`);
        const [cx, cy] = centro(s), vert = s.h > s.w * 1.6;
        o.push(`<text x="${cx}" y="${cy}" class="m-t m-sec" font-size="${yo ? 34 : 26}" font-weight="700" fill="${s.color}" ${vert ? `transform="rotate(-90 ${cx} ${cy})"` : ''}>${yo ? '★ ' : ''}${esc(s.nombre)}</text>`);
      });
    }
    (P.salidas || []).forEach(s => {
      const dx = s.dir === 'izq' ? -1 : 1;
      o.push(`<g opacity="${s.confirmar ? 0.75 : 1}"><path d="M${s.x},${s.y - 26} l${dx * 70},0 l0,-22 l${dx * 50},48 l${-dx * 50},48 l0,-22 l${-dx * 70},0 z" fill="#16a34a" stroke="#fff" stroke-width="4" ${s.confirmar ? 'stroke-dasharray="10 6"' : ''}/>
        <text x="${s.x + dx * 70}" y="${s.y + 78}" class="m-t" font-size="28" font-weight="800" fill="#15803d">SALIDA</text></g>`);
    });
    if (cap.evac) P.puntos.forEach(p => {
      const mio = miAula && miAula.punto === p.id;
      o.push(`<circle cx="${p.x}" cy="${p.y}" r="${p.r}" fill="${p.color}" fill-opacity="${mio ? 0.32 : 0.16}" stroke="${p.color}" stroke-width="${mio ? 10 : 6}" stroke-dasharray="18 10"/>`);
    });
    if (cap.evac && P.coordinacion) o.push(`<circle cx="${P.coordinacion.x}" cy="${P.coordinacion.y}" r="22" fill="#475569"/>`);
    o.push('</svg>');
    return o.join('');
  }

  /* ------------------------------ Componente mapa ------------------------------ */
  function crearMapa(cont, opt = {}) {
    if (!PLAN) { cont.innerHTML = '<div class="m-vacio"><b>Todavía no está cargado el plano de la escuela.</b><br>Se importa en ⚙️ Ajustes → Plan de evacuación, con el archivo que entrega la dirección.</div>'; return null; }
    const cap = Object.assign({ evac: true, sect: false, doc: false }, opt.capas || {});
    let tres = opt.tres ?? true, docentes = [];
    const foco = opt.foco ?? A.gradoActual();
    cont.innerHTML = `<div class="m-wrap"><div class="m-vista"><div class="m-plano${tres ? ' tres' : ''}"><div class="m-svgbox"></div><div class="m-pins"></div></div></div>
      <div class="m-ctrl"><button type="button" data-z="in" aria-label="Acercar">＋</button><button type="button" data-z="out" aria-label="Alejar">－</button>
        <button type="button" data-z="3d" aria-label="Vista 3D">${tres ? '2D' : '3D'}</button><button type="button" data-z="yo" aria-label="Ir a mi aula">⌖</button><button type="button" data-z="todo" aria-label="Ver toda la escuela">⛶</button></div>
      <div class="m-norte" aria-hidden="true">${esc(PLAN.escuela)}</div></div>
      <div class="m-capas" ${cap.fuerte ? 'hidden' : ''}>
        <label><input type="checkbox" data-cap="evac" ${cap.evac ? 'checked' : ''}> 🚪 Evacuación</label>
        <label><input type="checkbox" data-cap="sect" ${cap.sect ? 'checked' : ''}> 🛡 Sectores de cuidado</label>
        <label><input type="checkbox" data-cap="doc" ${cap.doc ? 'checked' : ''}> 👤 Dónde está cada docente</label>
      </div><div class="m-leyenda"></div>`;
    const wrap = cont.querySelector('.m-wrap'), vista = cont.querySelector('.m-vista'), plano = cont.querySelector('.m-plano');
    const st = { x: 0, y: 0, s: 1 };
    const aplicar = () => { vista.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.s})`; };
    function dibujar() {
      cont.querySelector('.m-svgbox').innerHTML = svgPlan(cap, foco);
      const pins = [];
      const pct = (x, y) => `left:${x / PLAN.W * 100}%;top:${y / PLAN.H * 100}%`;
      const miAula = aulaDe(foco);
      if (cap.evac) PLAN.puntos.forEach(p => pins.push(`<div class="pin pt ${miAula && miAula.punto === p.id ? 'mio' : ''}" style="${pct(p.x, p.y)};--c:${p.color}"><span>${esc(p.id)}</span></div>`));
      if (miAula && !cap.fuerte) { const [x, y] = centro(miAula); pins.push(`<div class="pin yo" style="${pct(x, y)}"><span>Tu aula</span></div>`); }
      if (cap.fuerte) { const s = cap.selSector ? PLAN.sectores.find(x => x.nombre === cap.selSector) : sectorPropio(); if (s) { const [x] = centro(s); pins.push(`<div class="pin sec${enRecreo() && !cap.selSector ? ' rec' : ''}" style="${pct(x, s.y - 4)};--c:${enRecreo() && !cap.selSector ? '#dc2626' : s.color}"><span>${cap.selSector ? '🛡' : enRecreo() ? '⚠️' : '★ Tu sector'}</span></div>`); } }
      if (cap.doc) {
        const lugares = {};
        docentes.forEach(d => {
          let xy = null; const au = aulaDe(d.grado);
          if (au) xy = centro(au); else { const e = PLAN.espacios.find(e => PSVoz.norm(e.nombre) === PSVoz.norm(d.lugar || '')); if (e) xy = centro(e); }
          if (!xy) return;
          const k = xy.join(); const n = lugares[k] = (lugares[k] || 0) + 1;
          pins.push(`<div class="pin doc" style="${pct(xy[0] + (n - 1) * 70 - 35, xy[1] - 40)}" title="${esc(d.docente)} · ${esc(d.lugar)}"><span>${esc(ini(d.docente))}</span></div>`);
        });
      }
      cont.querySelector('.m-pins').innerHTML = pins.join('');
      leyenda();
    }
    function leyenda() {
      const L = cont.querySelector('.m-leyenda'), miAula = aulaDe(foco), h = [];
      if (cap.evac) {
        if (miAula) { const p = puntoDe(miAula.punto); h.push(`<div class="ley-mio" style="--c:${p.color}"><b>${esc(foco)} → ${esc(p.nombre)}</b><span>Seguí la línea gruesa desde la puerta de tu aula.</span></div>`); }
        h.push(PLAN.puntos.map(p => `<div class="ley" style="--c:${p.color}"><i></i><span><b>${esc(p.nombre)}</b><br>${esc(PLAN.aulas.filter(a => a.punto === p.id).map(a => a.grados.join('/')).join(' · '))}</span></div>`).join(''));
        if (PLAN.coordinacion) h.push(`<div class="ley" style="--c:#475569"><i></i><span><b>${esc(PLAN.coordinacion.nombre)}</b>: dirección, secretaría y sala de maestros</span></div>`);
      }
      if (cap.fuerte) {
        const mio = sectorPropio(), grupo = s => s.grupo ? 'Docentes de grado' : /todas/i.test(s.nombre) ? 'Todos los docentes' : /rejilla/i.test(s.nombre) ? 'Mantenimiento' : 'Especiales y equipo directivo';
        const orden = ['Docentes de grado', 'Especiales y equipo directivo', 'Todos los docentes', 'Mantenimiento'];
        if (mio) h.push(enRecreo() ? `<div class="ley-mio rec" style="--c:#dc2626"><b>⚠️ ¡ES RECREO! Cuidá tu sector: ¡${esc(etiquetaSector(mio))}!</b><span>${esc(mio.nombre)}</span></div>` : `<div class="ley-mio" style="--c:${mio.color}"><b>★ Tu sector en los recreos: ${esc(mio.nombre)}</b><span>Cambialo en ⚙️ Ajustes si no es el tuyo.</span></div>`);
        h.push('<p class="ayuda">Tocá un sector para resaltarlo en el mapa.</p>' + orden.map(g => { const ss = PLAN.sectores.filter(s => grupo(s) === g); return ss.length ? `<p class="paso-n">${g}</p><div class="sec-lista">${ss.map(s => `<button type="button" class="sec-btn${cap.selSector === s.nombre ? ' on' : ''}" style="--c:${s.color}" data-sector="${esc(s.nombre)}"><i></i>${s === mio ? '★ ' : ''}${esc(s.nombre)}</button>`).join('')}</div>` : ''; }).join(''));
        L.innerHTML = h.join('');
        L.querySelectorAll('[data-sector]').forEach(b => b.onclick = () => { cap.selSector = cap.selSector === b.dataset.sector ? '' : b.dataset.sector; dibujar(); setTimeout(() => enfocar(0, 0, cap.selSector ? 2 : 1.4), 60); wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        return;
      }
      if (cap.sect) { const s = sectorPropio(); h.push(s ? `<div class="ley-mio" style="--c:${s.color}"><b>★ Tu sector de cuidado en recreos: ${esc(s.nombre)}</b></div>` : '<p class="ayuda">Elegí tu sector de cuidado en Ajustes → Plan de evacuación para verlo resaltado.</p>'); }
      if (cap.doc) h.push(docentes.length ? '<div class="ley-doc">' + docentes.map(d => `<div><b>${esc(d.docente)}</b> <small>${esc(d.rol || '')}</small><br>${esc(d.lugar)} · desde ${A.hhmm(d.ts)}</div>`).join('') + '</div>' : '<p class="ayuda">Nadie compartió su ubicación todavía (o falta configurar el servidor).</p>');
      if (PLAN.nota) h.push(`<p class="ayuda">${esc(PLAN.nota)}</p>`);
      L.innerHTML = h.join('');
    }
    async function cargarDocentes() {
      try { const j = await A.backend('estados', {}); docentes = j.estados || []; } catch (e) { docentes = []; }
      dibujar();
    }
    function zoomEn(ns, cx, cy) { ns = Math.max(0.6, Math.min(6, ns)); st.x = cx - (cx - st.x) * ns / st.s; st.y = cy - (cy - st.y) * ns / st.s; st.s = ns; aplicar(); }
    function enfocar(_px, _py, s = 2.4) {
      // Centra el pin “Tu aula” midiendo dónde quedó en pantalla (funciona en 2D y en 3D)
      st.s = s; aplicar();
      const pin = cont.querySelector('.pin.sec span') || cont.querySelector('.pin.yo span') || cont.querySelector('.pin.pt span');
      const r = wrap.getBoundingClientRect();
      if (!pin) { st.x = 0; st.y = 0; aplicar(); return; }
      const q = pin.getBoundingClientRect();
      st.x += (r.left + r.width / 2) - (q.left + q.width / 2);
      st.y += (r.top + r.height * 0.55) - (q.top + q.height);
      aplicar();
    }
    function encuadrar() { // todo el plano a la vista, centrado
      st.s = 1; st.x = 0; aplicar();
      const r = wrap.getBoundingClientRect(), q = plano.getBoundingClientRect();
      st.y = (r.height - q.height) / 2 + (r.top - q.top); aplicar();
    }
    // gestos: arrastrar y pellizcar
    const ptr = new Map(); let d0 = 0, s0 = 1;
    wrap.addEventListener('pointerdown', e => { if (e.target.closest('.m-ctrl')) return; ptr.set(e.pointerId, [e.clientX, e.clientY]); if (ptr.size === 2) { const [a, b] = [...ptr.values()]; d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); s0 = st.s; } });
    window.addEventListener('pointermove', e => {
      if (!ptr.has(e.pointerId)) return; const p = ptr.get(e.pointerId);
      if (ptr.size === 1) { st.x += e.clientX - p[0]; st.y += e.clientY - p[1]; aplicar(); }
      ptr.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptr.size === 2) { const [a, b] = [...ptr.values()], r = wrap.getBoundingClientRect(); zoomEn(s0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / d0, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); }
    });
    const fin = e => ptr.delete(e.pointerId);
    window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);
    wrap.addEventListener('wheel', e => { e.preventDefault(); const r = wrap.getBoundingClientRect(); zoomEn(st.s * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    cont.querySelectorAll('[data-z]').forEach(b => b.onclick = () => {
      const r = wrap.getBoundingClientRect(), z = b.dataset.z;
      if (z === 'in') zoomEn(st.s * 1.35, r.width / 2, r.height / 2);
      else if (z === 'out') zoomEn(st.s / 1.35, r.width / 2, r.height / 2);
      else if (z === '3d') { tres = !tres; plano.classList.toggle('tres', tres); b.textContent = tres ? '2D' : '3D'; setTimeout(() => aulaDe(foco) ? enfocar(0, 0, st.s) : encuadrar(), 520); }
      else if (z === 'todo') encuadrar();
      else { if (cap.fuerte || aulaDe(foco)) enfocar(0, 0, 2.2); else encuadrar(); }
    });
    cont.querySelectorAll('[data-cap]').forEach(i => i.onchange = () => { cap[i.dataset.cap] = i.checked; if (i.dataset.cap === 'doc' && i.checked) cargarDocentes(); else dibujar(); });
    dibujar(); aplicar();
    if (cap.doc) cargarDocentes();
    setTimeout(() => { if (cap.fuerte && enRecreo() && sectorPropio()) enfocar(0, 0, 2); else if (cap.fuerte) encuadrar(); else if (opt.enfocar !== false && aulaDe(foco)) enfocar(0, 0, 1.8); else encuadrar(); }, 560);
    return { redibujar: dibujar };
  }

  /* ------------------------------ Pantalla “Mapa de la escuela” ------------------------------ */
  async function abrirSectores() {
    await cargarPlan();
    if (!PLAN) { if (!(await A.cargarPlanoEscuela())) return; await cargarPlan(); }
    A.modal(`<div class="mapa-pantalla"><div class="ed-barra"><b>🛡 Cuidado de sectores</b><button type="button" class="btn chico secundario" id="m-no">Cerrar</button></div>
      <div id="mp-mapa"></div></div>`);
    $('#modal').classList.add('completo');
    $('#m-no').onclick = () => { $('#modal').classList.remove('completo'); A.cerrarModal(); };
    crearMapa($('#mp-mapa'), { capas: { evac: false, sect: true, fuerte: true, doc: false }, foco: '' });
  }
  async function abrirMapa(capas) {
    await cargarPlan();
    A.modal(`<div class="mapa-pantalla"><div class="ed-barra"><b>🗺️ Mapa de la escuela</b><button type="button" class="btn chico secundario" id="mp-estoy">📍 Estoy en…</button><button type="button" class="btn chico secundario" id="m-no">Cerrar</button></div>
      <div id="mp-mapa"></div></div>`);
    $('#modal').classList.add('completo');
    $('#m-no').onclick = () => { $('#modal').classList.remove('completo'); A.cerrarModal(); };
    $('#mp-estoy').onclick = elegirLugar;
    crearMapa($('#mp-mapa'), { capas: capas || { evac: true, sect: false, doc: false } });
  }
  function elegirLugar() {
    if (!PLAN) { A.toast('Primero cargá el plano.'); return; }
    const lugares = [...new Set(['(Mi aula)', ...PLAN.espacios.filter(e => !['exterior'].includes(e.tipo)).map(e => e.nombre)])];
    const caja = document.createElement('div'); caja.className = 'conf-flot';
    caja.innerHTML = `<p><b>¿Dónde estás ahora?</b></p><select id="lug-sel">${lugares.map(l => `<option>${esc(l)}</option>`).join('')}</select><div class="fila"><button class="btn secundario" data-r="0">Cancelar</button><button class="btn primario" data-r="1">Compartir</button></div>`;
    document.body.appendChild(caja);
    caja.querySelectorAll('button').forEach(b => b.onclick = async () => {
      const v = caja.querySelector('#lug-sel').value; caja.remove();
      if (b.dataset.r === '1') { await estado(v === '(Mi aula)' ? null : v); A.toast('Listo: la dirección y tus compañeros ven dónde estás.'); }
    });
  }

  /* ------------------------------ Ubicación por aula (no GPS) ------------------------------ */
  async function estado(lugarManual, saliendo) {
    if (!A) return;
    const S = A.S; if (!S.cfg.backendUrl || S.cfg.compartirUbicacion === false) return;
    const g = A.gradoActual();
    const lugar = saliendo ? 'Se retiró de la escuela' : lugarManual || (g ? 'Aula ' + g : 'En la escuela');
    try { await A.backend('estado', { docente: S.cfg.docente, rol: ({ grado: 'Docente de grado', especial: 'Prof. especial', secretario: 'Secretaría', vice: 'Vicedirección', director: 'Dirección' })[S.cfg.rol] || '', lugar, grado: lugarManual || saliendo ? '' : g, salir: !!saliendo }); } catch (e) { }
  }

  /* ------------------------------ Emergencia ------------------------------ */
  async function abrirEmergencia() {
    await cargarPlan();
    EM = await A.DB.get('emergencia') || null;
    if (EM) return pantallaEmergencia();
    A.modal(`<div class="emerg-elegir"><h3>🚨 ¿Qué está pasando?</h3>
      <label class="check simul"><input type="checkbox" id="em-sim"> Es un <b>simulacro</b> (práctica)</label>
      <div class="emerg-tiles">${Object.entries(TIPOS).map(([k, v]) => `<button type="button" data-em="${k}"><span>${v.ic}</span>${esc(v.t)}</button>`).join('')}</div>
      ${telefonosHTML()}
      <button type="button" class="btn secundario" id="m-no">Cancelar</button></div>`);
    $('#m-no').onclick = A.cerrarModal;
    document.querySelectorAll('[data-em]').forEach(b => b.onclick = async () => {
      const sim = $('#em-sim').checked, tipo = b.dataset.em;
      EM = { tipo, simulacro: sim, inicio: Date.now(), grado: A.gradoActual(), ok: {} };
      await A.DB.set('emergencia', EM);
      A.vibrar([400, 150, 400]);
      pantallaEmergencia();
      const T = TIPOS[tipo], au = aulaDe(EM.grado), p = au && puntoDe(au.punto);
      const r = await A.enviarAlerta('emerg', (sim ? 'SIMULACRO · ' : '') + T.t, '', T.evacua ? (p ? `Evacuando hacia ${p.nombre}.` : 'Evacuando.') : 'Aula en ENCIERRO.');
      A.toast(r.ok ? 'Aviso enviado a la dirección.' : 'No se pudo avisar por internet: usá los teléfonos o WhatsApp.', 4500);
      estado(T.evacua && p ? p.nombre : null);
    });
  }
  function telefonosHTML() {
    const loc = (A.S.cfg.telLocales || []).filter(x => x.t);
    return `<div class="tels">${NUM_FIJOS.concat(loc).map(x => `<a class="tel" href="tel:${esc(x.t.replace(/[^\d+]/g, ''))}"><b>📞 ${esc(x.t)}</b><span>${esc(x.n)}</span></a>`).join('')}</div>
      ${loc.length ? '' : '<p class="ayuda">Cargá los teléfonos de la comisaría, los bomberos y el hospital de Ciudad del Carmen en Ajustes → Plan de evacuación.</p>'}`;
  }
  function pantallaEmergencia() {
    const T = TIPOS[EM.tipo], au = aulaDe(EM.grado), p = au && puntoDe(au.punto);
    A.modal(`<div class="emerg ${EM.simulacro ? 'sim' : ''}">
      <div class="emerg-cab"><b>${T.ic} ${esc(T.t)}${EM.simulacro ? ' · SIMULACRO' : ''}</b><span id="em-reloj"></span></div>
      <div class="emerg-asig">${T.evacua ? (p ? `<b>${esc(EM.grado)} → ${esc(p.nombre)}</b><span>Salí por la puerta de tu aula y seguí tu recorrido en el Mapa.</span>` : `<b>Evacuá hacia el punto de encuentro que indique la dirección.</b>`) : '<b>ENCIERRO: quedate en el aula con la puerta trabada.</b><span>No evacues salvo orden de la dirección o la policía.</span>'}</div>
      <div class="emerg-tabs" role="tablist"><button type="button" data-tab="pasos" class="on">Qué hacer</button><button type="button" data-tab="mapa">Mapa</button><button type="button" data-tab="lista">Mis alumnos</button></div>
      <div class="emerg-cuerpo" id="em-cuerpo"></div>
      ${telefonosHTML()}
      <div class="ed-acciones"><button type="button" class="btn secundario" id="em-min">Minimizar</button><button type="button" class="btn peligro" id="em-fin">Terminar ${EM.simulacro ? 'simulacro' : 'emergencia'}</button></div></div>`);
    $('#modal').classList.add('completo');
    const reloj = () => { const e = $('#em-reloj'); if (!e) return clearInterval(t); const s = Math.floor((Date.now() - EM.inicio) / 1000); e.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const t = setInterval(reloj, 1000); reloj();
    document.querySelectorAll('.emerg-tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.emerg-tabs button').forEach(x => x.classList.toggle('on', x === b)); tab(b.dataset.tab); });
    $('#em-min').onclick = () => { $('#modal').classList.remove('completo'); A.cerrarModal(); A.toast('La emergencia sigue activa: tocá 🚨 para volver.', 4000); };
    $('#em-fin').onclick = async () => { if (await A.confirmarEnLinea(`¿Terminar ${EM.simulacro ? 'el simulacro' : 'la emergencia'}? Queda registrado en el informe.`)) terminar(); };
    tab('pasos');
  }
  function tab(cual) {
    const T = TIPOS[EM.tipo], c = $('#em-cuerpo');
    if (cual === 'pasos') c.innerHTML = `<h4>${T.evacua ? 'Durante' : 'Ahora'}</h4><ol>${T.antes.map(x => `<li>${esc(x)}</li>`).join('')}</ol><h4>${T.evacua ? 'Después' : 'Mientras dure'}</h4><ol>${T.despues.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <p class="ayuda">Indicaciones generales. Prevalece el Plan de Emergencia de la escuela y lo que indiquen la dirección, Defensa Civil y Bomberos.</p>`;
    else if (cual === 'mapa') { c.innerHTML = '<div id="em-mapa"></div>'; crearMapa($('#em-mapa'), { foco: EM.grado, capas: { evac: TIPOS[EM.tipo].evacua, sect: false, doc: false } }); }
    else listaEmergencia(c);
  }
  function listaEmergencia(c) {
    const S = A.S;
    if (!S.sesion) { c.innerHTML = '<p class="aviso">La app está bloqueada: habilitala con el QR para ver tu lista. Mientras tanto, contá a los chicos con el registro.</p>'; return; }
    const lista = A.alumnosVisibles().filter(a => S.asistencia[a.id] !== 'A' && !A.retirado(a.id));
    const render = () => {
      const ok = lista.filter(a => EM.ok[a.id]).length, faltan = lista.filter(a => !EM.ok[a.id]);
      c.innerHTML = `<div class="em-cont ${faltan.length ? '' : 'completo'}"><b>${ok} de ${lista.length}</b><span>${faltan.length ? 'faltan ' + faltan.length : '¡Están todos!'}</span></div>
        <button type="button" class="btn secundario" id="em-todos">✔ Están todos</button>
        <div class="lista">${lista.map(a => { const f = A.estaAfuera(a.id); return `<label class="em-al ${EM.ok[a.id] ? 'ok' : ''} ${f ? 'fuera' : ''}"><input type="checkbox" data-ok="${a.id}" ${EM.ok[a.id] ? 'checked' : ''}><span>${esc(a.nombre)}${f ? `<small>⚠️ Estaba fuera del aula: ${esc(f.destino)} (desde ${A.hhmm(f.salida)})</small>` : ''}</span></label>`; }).join('') || '<p class="vacio">No hay alumnos en la lista.</p>'}</div>
        <button type="button" class="btn primario" id="em-avisar">📨 Avisar a la dirección cómo estamos</button>`;
      c.querySelectorAll('[data-ok]').forEach(i => i.onchange = async () => { EM.ok[i.dataset.ok] = i.checked; await A.DB.set('emergencia', EM); render(); });
      $('#em-todos').onclick = async () => { lista.forEach(a => EM.ok[a.id] = true); await A.DB.set('emergencia', EM); render(); };
      $('#em-avisar').onclick = async () => {
        const fal = lista.filter(a => !EM.ok[a.id]).map(a => { const f = A.estaAfuera(a.id); return a.nombre + (f ? ` (estaba en ${f.destino})` : ''); });
        const au = aulaDe(EM.grado), p = au && puntoDe(au.punto);
        const r = await A.enviarAlerta('emerg', (EM.simulacro ? 'SIMULACRO · ' : '') + TIPOS[EM.tipo].t + ' · conteo', '',
          `${lista.length - fal.length} de ${lista.length} alumnos${p && TIPOS[EM.tipo].evacua ? ' en ' + p.nombre : ''}. ${fal.length ? 'FALTAN: ' + fal.join('; ') + '.' : 'Están todos.'}`);
        const b = $('#em-avisar'); if (b) b.insertAdjacentHTML('afterend', `<p class="${r.ok ? 'ok-msg' : 'aviso'}">${r.ok ? '✅ Enviado a la dirección.' : 'No se pudo enviar por internet.'} ${r.wa ? `<a href="${r.wa}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ''}</p>`);
      };
    };
    render();
  }
  async function terminar() {
    const S = A.S, T = TIPOS[EM.tipo], fin = Date.now();
    if (S.sesion) {
      const lista = A.alumnosVisibles().filter(a => S.asistencia[a.id] !== 'A' && !A.retirado(a.id));
      const fal = lista.filter(a => !EM.ok[a.id]);
      S.incidentes.push({ id: A.uid(), tipo: 'protocolo', ts: EM.inicio, protocolo: (EM.simulacro ? 'Simulacro: ' : 'Emergencia: ') + T.t,
        situacion: `De ${A.hhmm(EM.inicio)} a ${A.hhmm(fin)} (${Math.round((fin - EM.inicio) / 60000)} min). Conteo: ${lista.length - fal.length} de ${lista.length}.`,
        pasos: [], nota: fal.length ? 'Sin confirmar en el conteo: ' + fal.map(a => A.iniciales(a.nombre)).join(', ') : 'Todos los alumnos confirmados.' });
      await A.setEnc('incidentes', S.incidentes); A.renderIncidentes();
    }
    await A.DB.del('emergencia'); EM = null;
    $('#modal').classList.remove('completo'); A.cerrarModal(); A.toast('Registrado en el informe del día.');
    estado();
  }

  /* ------------------------------ Ajustes: plan ------------------------------ */
  async function renderAjustesPlan() {
    const box = $('#aj-plan'); if (!box) return;
    await cargarPlan();
    const c = A.S.cfg; c.telLocales = c.telLocales || [{ n: 'Comisaría de Ciudad del Carmen', t: '' }, { n: 'Bomberos de Ciudad del Carmen', t: '' }, { n: 'Hospital de Ciudad del Carmen', t: '' }];
    box.innerHTML = (PLAN ? `<p><b>${esc(PLAN.escuela)}</b><br><small>${esc(PLAN.titulo || '')}</small></p>
        <button type="button" class="btn primario" id="pl-ver">🗺️ Ver el mapa</button>
        <button type="button" class="btn secundario" id="pl-sectores">🛡 Cuidado de sectores</button>
        <label>Mi sector de cuidado en los recreos<select id="pl-sector"><option value="">(automático según mi nombre o mi grado)</option>${PLAN.sectores.map(s => `<option ${c.miSector === s.nombre ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></label>`
      : `<p class="ayuda">Todavía no cargaste el plano. Por seguridad está guardado con candado: se carga con el código de la escuela.</p><button type="button" class="btn primario grande" id="pl-codigo">🏫 Cargar el plano de la escuela (con código)</button>`) + `
      <label class="btn secundario archivo">📂 ${PLAN ? 'Reemplazar' : 'Importar'} archivo del plano<input type="file" id="pl-archivo" accept=".json,.txt,application/json" hidden></label>
      <label class="check"><input type="checkbox" id="pl-compartir" ${c.compartirUbicacion !== false ? 'checked' : ''}> Compartir con la escuela en qué aula estoy (sólo durante mi jornada; no usa GPS)</label>
      <p class="paso-n">Teléfonos de emergencia locales</p>
      <p class="ayuda">Ya están 911, Bomberos 100 y SAME 107. Agregá los números de Ciudad del Carmen que te confirme la dirección.</p>
      ${c.telLocales.map((x, i) => `<div class="fila"><input data-teln="${i}" value="${esc(x.n)}" aria-label="Nombre"><input data-telt="${i}" value="${esc(x.t)}" inputmode="tel" placeholder="Número" aria-label="Número"></div>`).join('')}
      <button type="button" class="btn chico secundario" id="pl-tel-mas">➕ Otro teléfono</button>`;
    const guardar = async () => { await A.DB.set('cfg', c); };
    const v = $('#pl-ver'); if (v) v.onclick = () => abrirMapa({ evac: true, sect: true });
    const vs = $('#pl-sectores'); if (vs) vs.onclick = () => abrirSectores();
    const s = $('#pl-sector'); if (s) s.onchange = async () => { c.miSector = s.value; await guardar(); A.toast('Sector guardado.'); };
    $('#pl-compartir').onchange = async e => { c.compartirUbicacion = e.target.checked; await guardar(); };
    box.querySelectorAll('[data-teln],[data-telt]').forEach(i => i.onchange = async () => {
      const k = i.dataset.teln ?? i.dataset.telt; c.telLocales[k][i.dataset.teln !== undefined ? 'n' : 't'] = i.value.trim(); await guardar();
    });
    $('#pl-tel-mas').onclick = async () => { c.telLocales.push({ n: '', t: '' }); await guardar(); renderAjustesPlan(); };
    const pc = $('#pl-codigo'); if (pc) pc.onclick = () => A.cargarPlanoEscuela();
    $('#pl-archivo').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try {
        const p = JSON.parse(await f.text());
        if (!p.aulas || !p.espacios || !p.puntos) throw new Error('El archivo no es un plano de Pasillo Seguro.');
        await A.DB.set('plan', p); PLAN = p; A.toast('Plano cargado.'); renderAjustesPlan(); hoyBox();
      } catch (err) { A.toast(err.message || 'No se pudo leer el archivo.', 5000); }
    };
  }

  /* ------------------------------ Botones en Pasillo ------------------------------ */
  function hoyBox() {
    if (!A || !A.S.cfg) return;
    let b = $('#hoy-mapa');
    if (!b) { const h = $('.hoy'); if (!h) return; h.insertAdjacentHTML('beforeend', '<div class="hoy-mapa" id="hoy-mapa"></div>'); b = $('#hoy-mapa'); }
    const s = sectorPropio();
    const rec = enRecreo();
    b.innerHTML = `${s ? `<button type="button" class="sector-chip${rec ? ' rec' : ''}" style="--c:${rec ? '#dc2626' : s.color}" id="btn-mi-sector">${rec ? `⚠️ ¡Recreo! Cuidá tu sector: <b>¡${esc(etiquetaSector(s))}!</b>` : `🛡 Tu sector en recreos: <b>${esc(s.nombre)}</b>`}</button>` : ''}`;

    const ms = $('#btn-mi-sector'); if (ms) ms.onclick = () => abrirSectores();
    if ($('#btn-mapa')) $('#btn-mapa').onclick = async () => { await cargarPlan(); if (!PLAN) { if (await A.cargarPlanoEscuela()) abrirMapa(); return; } abrirMapa(); };
  }

  async function init(api) {
    if (A) return; A = api;
    await cargarPlan();
    $('#btn-emergencia').onclick = abrirEmergencia;
    $('#btn-emergencia-bloq').onclick = abrirEmergencia;
    hoyBox();
    const em = await A.DB.get('emergencia');
    const btn = $('#btn-emergencia'); if (em && btn) btn.classList.add('activa');
  }

  async function ponerPlan(p) {
    if (!p || !p.aulas || !p.espacios || !p.puntos) throw new Error('Plano inválido');
    await A.DB.set('plan', p); PLAN = p; renderAjustesPlan(); hoyBox();
  }
  async function montarMapa(el, opt) { await cargarPlan(); return crearMapa(el, opt); }
  window.PSEmerg = { montarMapa, sectorPropio: () => sectorPropio(), etiquetaSector, ponerPlan, abrirSectores, init, renderAjustesPlan, abrirMapa, estado, hoyBox, abrirEmergencia };
})();
