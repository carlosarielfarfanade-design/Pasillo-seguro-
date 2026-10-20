/* =========================================================================
   Pasillo Seguro · crypto.js
   Cifrado propio de la micro-app (AES-GCM 256 + PBKDF2-SHA256).
   - La llave se deriva de la "frase maestra" de la escuela.
   - En el celular se guarda como CryptoKey NO extraíble (nadie puede copiarla).
   - Los QR llevan "PS1." + datos cifrados: cualquier otra cámara sólo ve texto
     aleatorio sin sentido; sólo esta app puede descifrarlos y validarlos.
   ========================================================================= */
(function (g) {
  'use strict';
  const PREFIJO = 'PS1.';
  const SAL = new TextEncoder().encode('PasilloSeguro/v1/sal-institucional');
  const ITERACIONES = 310000;
  const AAD = new TextEncoder().encode('PasilloSeguro-QR-v1');

  function b64urlEncode(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function derivarLlave(frase) {
    if (!frase || frase.length < 12) throw new Error('La frase maestra debe tener al menos 12 caracteres.');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(frase.normalize('NFC')),
      'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: SAL, iterations: ITERACIONES, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function cifrar(llave, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const datos = new TextEncoder().encode(JSON.stringify(obj));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, llave, datos));
    const todo = new Uint8Array(iv.length + ct.length);
    todo.set(iv, 0); todo.set(ct, iv.length);
    return PREFIJO + b64urlEncode(todo);
  }

  async function descifrar(llave, texto) {
    if (typeof texto !== 'string' || !texto.startsWith(PREFIJO)) throw new Error('Código no perteneciente a Pasillo Seguro.');
    let todo;
    try { todo = b64urlDecode(texto.slice(PREFIJO.length).trim()); } catch (e) { throw new Error('Código dañado.'); }
    if (todo.length < 29) throw new Error('Código dañado.');
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: todo.slice(0, 12), additionalData: AAD }, llave, todo.slice(12));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) {
      throw new Error('Código inválido o de otra escuela (la llave no coincide).');
    }
  }

  // ID estable de alumno (igual en el generador y en la app)
  function idAlumno(nombre, grado) {
    const s = (nombre + '|' + (grado || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9|]/g, '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'a' + h.toString(36);
  }

  g.PSCrypto = { derivarLlave, cifrar, descifrar, idAlumno, PREFIJO };
})(typeof window !== 'undefined' ? window : globalThis);
