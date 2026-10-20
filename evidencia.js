/* =========================================================================
   Pasillo Seguro · evidencia.js
   Registro de evidencias (cadena de custodia) + modo “Descifrar” escritos.
   - Las fotos originales se guardan SIN modificar, cifradas, con su huella SHA-256.
   - El realce (contraste, brillo, etc.) se hace sobre una copia: nunca toca el original.
   - No identifica autores ni compara letras: la pericia caligráfica corresponde a la Justicia.
   ========================================================================= */
(function () {
  'use strict';
  let A = null;
  const $ = s => document.querySelector(s);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fechaHora = ts => new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const LUGARES = ['Baño varones', 'Baño mujeres', 'Pasillo', 'Aula', 'Patio cubierto', 'Patio descubierto', 'Cancha', 'Entrada', 'Otro'];

  /* ---------------- cifrado de bytes con la llave de la escuela ---------------- */
  async function cifrarBytes(buf) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, A.S.llave, buf) }; }
  async function descifrarBytes(o) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: o.iv }, A.S.llave, o.ct); }
  async function sha256(buf) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join(''); }

  async function lista() { return A.getEnc('evidencias', []); }
  async function guardarLista(l) { await A.setEnc('evidencias', l); }
  async function obtener(id) { return (await lista()).find(e => e.id === id); }
  async function actualizar(ev, accion) {
    if (accion) ev.historial.push({ ts: Date.now(), accion, quien: A.S.cfg.docente });
    const l = await lista(); const i = l.findIndex(e => e.id === ev.id);
    if (i >= 0) l[i] = ev; else l.push(ev);
    await guardarLista(l);
  }

  /* ---------------- agregar fotos (original intacto + copia de trabajo) ---------------- */
  async function agregarFoto(ev, file) {
    const buf = await file.arrayBuffer();
    const hash = await sha256(buf);
    const fid = 'f' + A.uid();
    await A.DB.set('evorig-' + fid, await cifrarBytes(buf));
    const copia = await A.comprimir(file, 1800, 0.9), mini = await A.comprimir(file, 480, 0.6);
    await A.setEnc('evcopia-' + fid, copia.dataURL);
    ev.fotos.push({ id: fid, ts: Date.now(), tsArchivo: file.lastModified || null, nombre: file.name || 'foto.jpg', tipo: file.type || 'image/jpeg', bytes: buf.byteLength, sha256: hash, mini: mini.dataURL, w: copia.w, h: copia.h });
    await actualizar(ev, `Foto agregada (${(buf.byteLength / 1024).toFixed(0)} KB · SHA-256 ${hash.slice(0, 12)}…)`);
  }

  /* ---------------- tarjeta en la pestaña Incidentes ---------------- */
  async function render() {
    const z = $('#evid-zona'); if (!z || !A || !A.S.llave) return;
    const l = await lista();
    z.innerHTML = `<h2>🗂 Evidencias y descifrar escritos</h2><div class="tarjeta">
      <p class="ayuda">Guardá fotos de escritos, amenazas o daños con fecha, hora y huella digital, sin modificarlas, y armá el acta para adjuntar a la denuncia. La app <b>no identifica autores</b>: si hace falta comparar letras, lo dispone la Fiscalía con un perito calígrafo.</p>
      <button type="button" class="btn primario" id="ev-nueva">➕ Nueva evidencia</button>
      <div class="lista">${l.slice().reverse().map(e => `<button type="button" class="ev-item" data-ev="${e.id}">
        ${e.fotos[0] ? `<img src="${e.fotos[0].mini}" alt="">` : '<span class="ev-sinfoto">📄</span>'}
        <span><b>${esc(e.codigo)}</b> · ${esc(e.lugar)}<br><small>${fechaHora(e.creada)} · ${e.fotos.length} foto(s) · ${esc(e.estado)}</small></span></button>`).join('') || '<p class="vacio">Sin evidencias guardadas.</p>'}</div></div>`;
    $('#ev-nueva').onclick = nueva;
    z.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => detalle(b.dataset.ev));
  }

  async function nueva() {
    if (!A.S.sesion) { A.toast('Habilitá la app con el QR de la escuela para registrar evidencias.'); return; }
    A.modal(`<h3>➕ Nueva evidencia</h3>
      <p class="aviso">Fotografiá sólo el escrito, el daño o el objeto. Que no aparezcan personas. No borres ni limpies nada antes de que lo vea la dirección.</p>
      <label>Lugar<select id="ev-lugar">${LUGARES.map(l => `<option>${l}</option>`).join('')}</select></label>
      <label>¿Qué es y cómo se encontró?<textarea id="ev-desc" rows="3" placeholder="Ej.: escrito con marcador negro en la puerta interior del 2.º cubículo. Lo vio el portero a las 10:15 y avisó."></textarea></label>
      <button type="button" class="btn secundario" id="ev-mic">🎤 Dictar</button>
      <label class="btn primario archivo">📸 Sacar foto (podés agregar varias)<input type="file" id="ev-foto" accept="image/*" capture="environment" multiple hidden></label>
      <div id="ev-minis" class="ev-minis"></div>
      <div class="fila"><button type="button" class="btn secundario" id="m-no">Cancelar</button><button type="button" class="btn primario" id="ev-ok">Guardar evidencia</button></div>`);
    const archivos = [];
    $('#m-no').onclick = A.cerrarModal;
    $('#ev-mic').onclick = () => A.dictar($('#ev-mic'), null, t => { const a = $('#ev-desc'); a.value = (a.value ? a.value + ' ' : '') + t; });
    $('#ev-foto').onchange = e => {
      [...e.target.files].forEach(f => { archivos.push(f); const u = URL.createObjectURL(f); $('#ev-minis').insertAdjacentHTML('beforeend', `<img src="${u}" alt="Foto ${archivos.length}">`); });
      e.target.value = '';
    };
    $('#ev-ok').onclick = async () => {
      if (!archivos.length) { A.toast('Sacá al menos una foto.'); return; }
      $('#ev-ok').disabled = true; $('#ev-ok').textContent = 'Guardando…';
      const l = await lista(), hoy = new Date(), pref = 'EV-' + PSVoz.fechaIso(hoy).replace(/-/g, '');
      const n = l.filter(e => e.codigo.startsWith(pref)).length + 1;
      const ev = { id: 'e' + A.uid(), codigo: pref + '-' + String(n).padStart(2, '0'), creada: Date.now(), lugar: $('#ev-lugar').value, descripcion: $('#ev-desc').value.trim(),
        docente: A.S.cfg.docente, rol: A.S.cfg.rol, grado: A.gradoActual(), escuela: A.S.cfg.escuela, fotos: [], lecturas: [], historial: [], estado: 'Pendiente de entrega' };
      ev.historial.push({ ts: ev.creada, accion: 'Evidencia registrada', quien: A.S.cfg.docente });
      for (const f of archivos) await agregarFoto(ev, f);
      if (A.S.sesion) { A.S.incidentes.push({ id: A.uid(), tipo: 'protocolo', ts: ev.creada, protocolo: 'Registro de evidencia ' + ev.codigo, situacion: ev.lugar + (ev.descripcion ? ': ' + ev.descripcion : ''), pasos: [], nota: ev.fotos.length + ' foto(s) guardadas sin modificar, con huella SHA-256.' }); await A.setEnc('incidentes', A.S.incidentes); A.renderIncidentes(); }
      A.cerrarModal(); render(); detalle(ev.id);
    };
  }

  /* ---------------- detalle de una evidencia ---------------- */
  async function detalle(id) {
    const ev = await obtener(id); if (!ev) return;
    A.modal(`<div class="ev-det">
      <div class="ed-barra"><b>🗂 ${esc(ev.codigo)}</b><span class="ed-ver">${esc(ev.estado)}</span><button type="button" class="btn chico secundario" id="m-no">Cerrar</button></div>
      <p><b>${esc(ev.lugar)}</b> · ${fechaHora(ev.creada)}<br><small>Registró: ${esc(ev.docente)}${ev.grado ? ' · ' + esc(ev.grado) : ''}</small></p>
      ${ev.descripcion ? `<p>${esc(ev.descripcion)}</p>` : ''}
      <div class="ev-fotos">${ev.fotos.map((f, i) => `<button type="button" data-foto="${f.id}"><img src="${f.mini}" alt="Foto ${i + 1}"><small>Foto ${i + 1} · ${A.hhmm(f.ts)}<br>SHA-256 ${f.sha256.slice(0, 10)}…</small></button>`).join('')}</div>
      <label class="btn chico secundario archivo">➕ Agregar otra foto<input type="file" id="ev-mas" accept="image/*" capture="environment" multiple hidden></label>
      <div class="fila wrap ev-acc">
        <button type="button" class="btn primario" id="ev-desc">🔍 Descifrar con IA</button>
        <button type="button" class="btn secundario" id="ev-pdf">📄 Acta en PDF</button>
        <button type="button" class="btn secundario" id="ev-env">📨 Enviar a la dirección</button>
      </div>
      <div id="ev-lect">${ev.lecturas.map(lecturaHTML).join('')}</div>
      <details class="otras"><summary>Historial (cadena de custodia)</summary><ul class="ev-hist">${ev.historial.map(h => `<li>${fechaHora(h.ts)} · ${esc(h.accion)} · ${esc(h.quien)}</li>`).join('')}</ul></details>
      <button type="button" class="btn texto" id="ev-borrar">Marcar como entregada y borrar del celular</button></div>`);
    $('#modal').classList.add('completo');
    const cerrar = () => { $('#modal').classList.remove('completo'); A.cerrarModal(); };
    $('#m-no').onclick = cerrar;
    document.querySelectorAll('.ev-fotos [data-foto]').forEach(b => b.onclick = () => visor(ev, b.dataset.foto));
    $('#ev-mas').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) await agregarFoto(ev, f); detalle(ev.id); };
    $('#ev-desc').onclick = () => descifrar(ev);
    $('#ev-pdf').onclick = async () => { const r = await acta(ev); await actualizar(ev, 'Acta PDF generada'); A.descargarPDF(r.blob, r.nombre); };
    $('#ev-env').onclick = async () => {
      const r = await acta(ev);
      const pend = await A.getEnc('pendientes', []);
      pend.push({ id: A.uid(), nombre: r.nombre, fecha: Date.now(), b64: r.b64, asunto: `Evidencia ${ev.codigo} · ${ev.lugar} · ${A.S.cfg.docente}`, resumen: `Acta de registro de evidencia (${ev.fotos.length} foto/s). Para adjuntar a la denuncia si corresponde.` });
      await A.setEnc('pendientes', pend);
      const n = await A.enviarPendientes();
      ev.estado = n ? 'Enviada a la dirección' : 'En cola de envío'; await actualizar(ev, n ? 'Acta enviada por correo a la dirección' : 'Acta en cola de envío (sin conexión)');
      A.descargarPDF(r.blob, 'copia-' + r.nombre);
      A.toast(n ? 'Acta enviada a la dirección. Se descargó tu copia.' : 'Sin conexión: el acta se envía sola cuando vuelva internet.', 5000);
      detalle(ev.id); render();
    };
    $('#ev-borrar').onclick = async () => {
      if (!await A.confirmarEnLinea('¿La dirección ya recibió el acta y las fotos? Se borran de este celular (incluidos los originales).')) return;
      if (!await A.verificarFrase()) return;
      for (const f of ev.fotos) { await A.DB.del('evorig-' + f.id); await A.DB.del('evcopia-' + f.id); }
      await guardarLista((await lista()).filter(e => e.id !== ev.id));
      cerrar(); render(); A.toast('Evidencia borrada del celular.');
    };
  }
  function lecturaHTML(l) {
    return `<div class="ev-lectura"><b>Lectura de la IA · ${A.hhmm(l.ts)}</b><small> (orientativa, no pericial)</small>
      <p class="ev-texto">“${esc(l.texto || '—')}”</p>
      ${(l.dudosas || []).length ? '<p><b>Palabras dudosas:</b></p><ul>' + l.dudosas.map(d => `<li>“${esc(d.palabra)}” → ${d.opciones.map(o => `<i>${esc(o)}</i>`).join(' / ')}</li>`).join('') + '</ul>' : ''}
      ${l.alternativas && l.alternativas.length ? '<p><b>Otras lecturas posibles:</b></p><ul>' + l.alternativas.map(a => `<li>${esc(a)}</li>`).join('') + '</ul>' : ''}
      ${l.notas ? `<p class="ayuda">${esc(l.notas)}</p>` : ''}</div>`;
  }

  /* ---------------- visor con realce (sobre una copia) ---------------- */
  async function visor(ev, fid) {
    const f = ev.fotos.find(x => x.id === fid); if (!f) return;
    const src = await A.getEnc('evcopia-' + fid, f.mini);
    const caja = document.createElement('div'); caja.className = 'ev-visor';
    caja.innerHTML = `<div class="ev-visor-barra"><b>Foto ${ev.fotos.indexOf(f) + 1}</b><button type="button" id="vz-orig">⬇️ Original</button><button type="button" id="vz-x">✕</button></div>
      <div class="ev-lienzo"><canvas id="vz-c"></canvas></div>
      <div class="ev-ctrl">
        <label>Contraste<input type="range" id="vz-con" min="50" max="300" value="100"></label>
        <label>Brillo<input type="range" id="vz-bri" min="40" max="220" value="100"></label>
        <label class="check"><input type="checkbox" id="vz-gris"> Blanco y negro</label>
        <label class="check"><input type="checkbox" id="vz-inv"> Invertir</label>
        <div class="fila"><button type="button" class="btn chico secundario" id="vz-menos">－</button><button type="button" class="btn chico secundario" id="vz-mas">＋</button><button type="button" class="btn chico secundario" id="vz-rot">⟳ Girar</button><button type="button" class="btn chico secundario" id="vz-reset">Restablecer</button></div>
        <button type="button" class="btn primario" id="vz-usar">Usar esta versión realzada para descifrar</button>
        <p class="ayuda">El realce se hace sobre una copia. La foto original no se modifica.</p>
      </div>`;
    document.body.appendChild(caja);
    const img = new Image(); img.src = src; await img.decode().catch(() => { });
    const cv = caja.querySelector('#vz-c'), cx = cv.getContext('2d');
    let rot = 0, zoom = 1, px = 0, py = 0;
    const dibujar = () => {
      const r = rot % 2; cv.width = r ? img.height : img.width; cv.height = r ? img.width : img.height;
      cx.save(); cx.filter = `contrast(${caja.querySelector('#vz-con').value}%) brightness(${caja.querySelector('#vz-bri').value}%) ${caja.querySelector('#vz-gris').checked ? 'grayscale(1)' : ''} ${caja.querySelector('#vz-inv').checked ? 'invert(1)' : ''}`;
      cx.translate(cv.width / 2, cv.height / 2); cx.rotate(rot * Math.PI / 2); cx.drawImage(img, -img.width / 2, -img.height / 2); cx.restore();
      cv.style.transform = `translate(${px}px,${py}px) scale(${zoom})`;
    };
    dibujar();
    caja.querySelectorAll('input').forEach(i => i.oninput = dibujar);
    caja.querySelector('#vz-mas').onclick = () => { zoom = Math.min(6, zoom * 1.4); dibujar(); };
    caja.querySelector('#vz-menos').onclick = () => { zoom = Math.max(1, zoom / 1.4); if (zoom === 1) { px = py = 0; } dibujar(); };
    caja.querySelector('#vz-rot').onclick = () => { rot = (rot + 1) % 4; dibujar(); };
    caja.querySelector('#vz-reset').onclick = () => { rot = 0; zoom = 1; px = py = 0; caja.querySelector('#vz-con').value = 100; caja.querySelector('#vz-bri').value = 100; caja.querySelector('#vz-gris').checked = caja.querySelector('#vz-inv').checked = false; dibujar(); };
    // arrastrar y pellizcar
    const lz = caja.querySelector('.ev-lienzo'), ptr = new Map(); let d0 = 0, z0 = 1;
    lz.onpointerdown = e => { lz.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); if (ptr.size === 2) { const [a, b] = [...ptr.values()]; d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); z0 = zoom; } };
    lz.onpointermove = e => { if (!ptr.has(e.pointerId)) return; const p = ptr.get(e.pointerId); if (ptr.size === 1 && zoom > 1) { px += e.clientX - p[0]; py += e.clientY - p[1]; } ptr.set(e.pointerId, [e.clientX, e.clientY]); if (ptr.size === 2) { const [a, b] = [...ptr.values()]; zoom = Math.max(1, Math.min(6, z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / d0)); } dibujar(); };
    lz.onpointerup = lz.onpointercancel = e => ptr.delete(e.pointerId);
    caja.querySelector('#vz-x').onclick = () => caja.remove();
    caja.querySelector('#vz-usar').onclick = () => { ev._realces = ev._realces || {}; ev._realces[fid] = cv.toDataURL('image/jpeg', 0.9); caja.remove(); A.toast('Versión realzada lista. Tocá “Descifrar con IA”.'); };
    caja.querySelector('#vz-orig').onclick = async () => {
      try { const o = await A.DB.get('evorig-' + fid); const buf = await descifrarBytes(o); A.descargarPDF(new Blob([buf], { type: f.tipo }), `${ev.codigo}_foto${ev.fotos.indexOf(f) + 1}_original.jpg`); await actualizar(ev, `Descarga del original de la foto ${ev.fotos.indexOf(f) + 1}`); }
      catch (e) { A.toast('No se pudo recuperar el original.'); }
    };
  }

  /* ---------------- descifrar con IA ---------------- */
  async function descifrar(ev) {
    const caja = document.createElement('div'); caja.className = 'conf-flot';
    caja.innerHTML = `<p><b>🔍 Descifrar el escrito</b></p>
      <p class="ayuda">Se envían a la IA hasta 3 fotos (las realzadas, si las preparaste). Si el escrito nombra a un alumno o adulto, pensalo dos veces: ese texto sale de la escuela.</p>
      <label class="check"><input type="checkbox" id="ds-ok"> Entiendo: la lectura es orientativa y no identifica a nadie.</label>
      <div class="fila"><button class="btn secundario" data-r="0">Cancelar</button><button class="btn primario" data-r="1">Descifrar</button></div>`;
    document.body.appendChild(caja);
    caja.querySelector('[data-r="0"]').onclick = () => caja.remove();
    caja.querySelector('[data-r="1"]').onclick = async () => {
      if (!caja.querySelector('#ds-ok').checked) { A.toast('Tildá la casilla para continuar.'); return; }
      caja.remove();
      const box = $('#ev-lect'); if (box) box.insertAdjacentHTML('afterbegin', '<p class="cargando" id="ds-cargando">Leyendo el escrito…</p>');
      try {
        const imgs = [];
        for (const f of ev.fotos.slice(-3)) {
          const d = (ev._realces && ev._realces[f.id]) || await A.getEnc('evcopia-' + f.id, f.mini);
          imgs.push(d.split(',')[1]);
        }
        const j = await A.backend('descifrar', { imagenes: imgs, lugar: ev.lugar });
        const l = Object.assign({ ts: Date.now(), realzada: !!(ev._realces && Object.keys(ev._realces).length) }, j.lectura || {});
        delete ev._realces;
        ev.lecturas.unshift(l); await actualizar(ev, 'Lectura con IA (orientativa)');
        detalle(ev.id);
      } catch (e) { const c = $('#ds-cargando'); if (c) c.outerHTML = `<p class="aviso">No se pudo descifrar: ${esc(e.message)}</p>`; }
    };
  }

  /* ---------------- acta en PDF ---------------- */
  async function acta(ev) {
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 16; let y = 18;
    const salto = h => { if (y + h > 278) { doc.addPage(); y = 18; } };
    const p = (t, tam = 9.5, est = 'normal') => { doc.setFont('helvetica', est); doc.setFontSize(tam); doc.splitTextToSize(String(t), W - 2 * M).forEach(l => { salto(5); doc.text(l, M, y); y += tam * 0.46; }); y += 1.5; };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(A.S.cfg.escuela || '', W / 2, y, { align: 'center' }); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); if (A.S.cfg.localidad) { doc.text(A.S.cfg.localidad, W / 2, y, { align: 'center' }); y += 5; }
    doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('ACTA DE REGISTRO DE EVIDENCIA', W / 2, y, { align: 'center' }); y += 6;
    doc.setFontSize(11); doc.text(ev.codigo, W / 2, y, { align: 'center' }); y += 8;
    p(`Lugar: ${ev.lugar}`, 10, 'bold');
    p(`Fecha y hora del registro: ${fechaHora(ev.creada)}`);
    p(`Registró: ${ev.docente}${ev.grado ? ' · ' + ev.grado : ''}`);
    if (ev.descripcion) p('Descripción: ' + ev.descripcion);
    y += 2;
    doc.autoTable({ startY: y, margin: { left: M, right: M }, styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: [15, 31, 61] },
      head: [['Foto', 'Tomada', 'Archivo', 'Tamaño', 'Huella SHA-256 del original']],
      body: ev.fotos.map((f, i) => [i + 1, fechaHora(f.ts), f.nombre, (f.bytes / 1024).toFixed(0) + ' KB', f.sha256]),
      columnStyles: { 4: { fontStyle: 'normal', cellWidth: 72 } } });
    y = doc.lastAutoTable.finalY + 5;
    p('Las fotos originales se guardaron sin modificar, cifradas en el dispositivo del docente. La huella SHA-256 permite verificar que el archivo entregado es idéntico al registrado: cualquier cambio, aunque sea mínimo, produce una huella distinta.', 8, 'italic');
    for (let i = 0; i < ev.fotos.length; i++) {
      const f = ev.fotos[i], src = await A.getEnc('evcopia-' + f.id, f.mini);
      const w = W - 2 * M, h = Math.min(150, w * f.h / f.w), ww = h * f.w / f.h;
      salto(h + 12); p(`Foto ${i + 1} · ${fechaHora(f.ts)}`, 9, 'bold');
      try { doc.addImage(src, 'JPEG', M + (w - ww) / 2, y, ww, h); } catch (e) { }
      y += h + 4;
    }
    if (ev.lecturas.length) {
      salto(20); p('Lecturas del texto con inteligencia artificial', 10.5, 'bold');
      p('Orientativas: no constituyen pericia ni identifican autoría. Se incluyen sólo como ayuda para leer el escrito.', 8, 'italic');
      ev.lecturas.forEach(l => {
        p(`${fechaHora(l.ts)}${l.realzada ? ' (sobre copia realzada)' : ''}: “${l.texto || '—'}”`);
        (l.dudosas || []).forEach(d => p(`   Palabra dudosa “${d.palabra}”: ${d.opciones.join(' / ')}`, 8.5));
      });
    }
    salto(30); p('Historial (cadena de custodia)', 10.5, 'bold');
    ev.historial.forEach(h => p(`${fechaHora(h.ts)} · ${h.accion} · ${h.quien}`, 8.5));
    salto(40); y += 14;
    const firma = await A.getEnc('firma', null);
    if (firma) { try { doc.addImage(firma, 'PNG', M + 5, y - 18, 55, 18); } catch (e) { } }
    doc.setLineWidth(0.3); doc.line(M, y, M + 70, y); doc.line(W - M - 70, y, W - M, y); y += 5;
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
    doc.text(ev.docente || 'Docente', M + 35, y, { align: 'center' }); doc.text('Recibí: Dirección', W - M - 35, y, { align: 'center' }); y += 4;
    doc.text('Fecha: ____/____/______', W - M - 35, y, { align: 'center' });
    const n = doc.getNumberOfPages();
    for (let k = 1; k <= n; k++) { doc.setPage(k); doc.setFontSize(7); doc.setTextColor(110); doc.text(`${ev.codigo} · Confidencial · Para uso institucional y, si corresponde, de la autoridad judicial · Página ${k} de ${n}`, W / 2, 290, { align: 'center' }); doc.setTextColor(0); }
    const nombre = `acta-evidencia_${ev.codigo}.pdf`;
    return { blob: doc.output('blob'), b64: doc.output('datauristring').split(',')[1], nombre };
  }

  function init(api) { if (A) return; A = api; }
  window.PSEvid = { init, render };
})();
