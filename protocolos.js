/* =========================================================================
   Pasillo Seguro · protocolos.js
   Base de conocimiento: protocolos de actuación de la escuela (transcriptos de
   los afiches institucionales) + buscador local por palabras clave.
   Funciona sin internet. Para actualizar un protocolo, editá este archivo.
   ========================================================================= */
(function (g) {
  'use strict';

  const ACOMPANAMIENTO = {
    titulo: 'Acompañamiento posterior: garantizar la trayectoria escolar',
    pasos: [
      { t: 'Seguimiento de la asistencia', d: ['Monitorear y acompañar la asistencia; detectar a tiempo situaciones que afecten la continuidad educativa.'] },
      { t: 'Propuestas pedagógicas flexibles', d: ['Propuestas y tiempos de evaluación flexibles, acordes a las necesidades de cada estudiante.'] },
      { t: 'Espacios de contención y tutorías', d: ['Habilitar espacios de contención emocional, tutorías y orientación individual.'] },
      { t: 'Orientación a la familia', d: ['Acompañar y orientar a las familias o referentes de cuidado.'] },
      { t: 'Articulación y trabajo en red', d: ['Organismos de protección de derechos, servicios de salud mental, equipos socioeducativos territoriales, áreas de Niñez, Educación y Justicia.'] }
    ]
  };

  const P = [
    {
      id: 'seguridad',
      titulo: 'Situaciones que comprometen la seguridad personal y/o colectiva',
      subtitulo: 'Amenazas verbales, escritas, digitales o simbólicas; armas u objetos peligrosos',
      color: '#c2410c',
      urgente: true,
      keywords: ['amenaza', 'amenazo', 'amenazas', 'amenazante', 'arma', 'armas', 'cuchillo', 'navaja', 'cortaplumas', 'punzante', 'arma blanca',
        'pistola', 'revolver', 'arma de fuego', 'tiro', 'tiroteo', 'balear', 'disparar', 'explosivo', 'bomba', 'petardo',
        'llamada amenaza', 'llamado amenaza', 'te voy a matar', 'los voy a matar', 'matar', 'grafiti', 'graffiti', 'pintada', 'escrito en el baño',
        'dibujo amenazante', 'calavera', 'publicacion amenaza', 'objeto peligroso', 'traer un arma', 'trajo un arma'],
      principios: 'Nuestro compromiso es proteger y cuidar a toda la comunidad educativa.',
      secciones: [
        {
          titulo: 'Procedimiento de actuación',
          pasos: [
            { t: 'A · Evaluación inmediata del riesgo', d: ['El equipo directivo tomará las medidas urgentes para proteger a la comunidad educativa. Docente: avisá de inmediato al equipo directivo.'] },
            { t: 'B · Articulación con organismos de seguridad y protección', d: ['Si se detecta o refiere la tenencia, amenaza o uso de objetos potencialmente peligrosos, se dará intervención inmediata a las fuerzas de seguridad, resguardando siempre el principio de protección integral de niños, niñas y adolescentes y evitando intervenciones que generen estigmatización.'] },
            { t: 'C · Resguardo institucional y comunicación preventiva', d: ['Comunicar de manera responsable a las familias del grupo afectado, con transparencia institucional y sin generar pánico.', 'Crear condiciones de resguardo emocional, atendiendo especialmente las percepciones de miedo o ansiedad.'] },
            { t: 'D · Elaboración de informe técnico', d: ['Documentar en el Libro de Situaciones Complejas y elaborar un informe técnico con: los elementos que dieron lugar a la alarma, las medidas adoptadas, los factores intervinientes y las derivaciones realizadas.', 'Se eleva a Supervisión y a la Dirección de Acompañamiento Integral Educativo (DAE).'] },
            { t: 'E · Derivación y articulación intersectorial', d: ['Activar mecanismos de protección articulados con organismos pertinentes: protección de derechos, salud mental, justicia.'] },
            { t: 'F · Seguimiento institucional personalizado', d: ['Plan de acompañamiento específico para el o los estudiantes involucrados, garantizando la trayectoria escolar.'] },
            { t: 'G · Medidas preventivas y restaurativas colectivas', d: ['Jornadas de sensibilización sobre convivencia, gestión emocional, resolución de conflictos y cultura del cuidado, con participación de toda la comunidad educativa.'] }
          ]
        },
        {
          titulo: 'Anexo 3 · Glosario: ¿qué son estas situaciones?',
          pasos: [
            { t: 'Definición', d: ['Expresiones, gestos, publicaciones, acciones o elementos que generan temor fundado de que la integridad física o emocional de miembros de la comunidad educativa pueda verse afectada. Incluye amenazas verbales, escritas, digitales o simbólicas, y la presencia o mención de elementos que puedan interpretarse como instrumentos de daño.'] },
            { t: 'Ejemplos (no exhaustivos)', d: ['Publicaciones con amenazas explícitas · dibujos o expresiones amenazantes · armas, cuchillos o elementos punzantes · armas de fuego · explosivos o similares · llamadas telefónicas con amenaza · otros elementos que generen alarma o riesgo.'] }
          ]
        }
      ],
      contactos: [{ nombre: 'Emergencias policiales', tel: '911' }, { nombre: 'SAME', tel: '107' }],
      notas: ['Cuidar es educar. La seguridad de todos y todas es responsabilidad de toda la comunidad educativa.']
    },
    {
      id: 'convivencia',
      titulo: 'Otras situaciones de conflicto que afectan la convivencia escolar',
      subtitulo: 'Conflictos puntuales que pueden escalar a agresiones',
      color: '#ea580c',
      keywords: ['pelea', 'pelean', 'peleando', 'se pelearon', 'agresion', 'agresion fisica', 'golpe', 'golpes', 'le pego', 'pegar', 'piña', 'pina', 'patada', 'empujon',
        'empujo', 'trompada', 'cachetada', 'discusion', 'discuten', 'insulto', 'insultos', 'insulta', 'conflicto', 'lesion', 'lastimado', 'herido', 'sangre',
        'rina', 'riña', 'se agarraron', 'falta de respeto', 'grito', 'gritos', 'mal comportamiento', 'indisciplina'],
      principios: 'Prevención · Diálogo · Respeto · Cuidado · Corresponsabilidad · Convivencia',
      secciones: [
        {
          titulo: '¿Qué hacer?',
          pasos: [
            { t: '1 · Intervenir de forma inmediata', d: ['Intervenir de inmediato para reducir la carga emocional, evitando que el conflicto escale.'] },
            { t: '2 · Diálogo con las partes y con las familias', d: ['Generar un espacio de diálogo con los y las estudiantes intervinientes.', 'Dialogar con las familias o adultos responsables, entendiendo la importancia del trabajo desde la corresponsabilidad.'] },
            { t: '3 · En caso de agresiones físicas', d: ['Separar a las personas involucradas.', 'Calmarlas y conversar por separado.', 'Si hay lesiones, contactar de manera inmediata a los servicios de emergencia médica (SAME 107).', 'Informar de inmediato a los tutores o adultos responsables.'] },
            { t: '4 · Aplicación del Acuerdo Escolar de Convivencia', d: ['Convocar al Consejo Escolar de Convivencia (CEC) para: evaluar las situaciones, determinar la aplicación de sanciones y definir los dispositivos de intervención institucional necesarios.'] },
            { t: '5 · Seguimiento por parte del equipo directivo', d: ['Seguimiento para que la medida no se agote en sí misma y ratifique su sentido educativo.', 'Objetivo: acciones con fin formativo, restaurativo y preventivo.'] }
          ]
        },
        ACOMPANAMIENTO
      ],
      contactos: [{ nombre: 'SAME (si hay lesiones)', tel: '107' }],
      notas: ['Aclaración: las familias o adultos responsables tienen la potestad de realizar la denuncia ante autoridades policiales según sea el caso.']
    },
    {
      id: 'bullying',
      titulo: 'Situaciones de bullying y cyberbullying',
      subtitulo: 'Situaciones que afectan la convivencia escolar',
      color: '#2563eb',
      keywords: ['bullying', 'buling', 'bulling', 'ciberbullying', 'cyberbullying', 'acoso', 'acosa', 'hostiga', 'hostigamiento', 'burla', 'burlas', 'se burlan',
        'se rien', 'cargada', 'cargan', 'apodo', 'apodos', 'sobrenombre', 'molestan', 'lo molestan', 'la molestan', 'excluyen', 'lo dejan solo', 'la dejan sola',
        'discriminacion', 'discrimina', 'meme', 'memes', 'grupo de whatsapp', 'redes sociales', 'escrache', 'humilla', 'humillacion', 'siempre al mismo', 'todos los dias'],
      principios: 'Respeto · Cuidado · Convivencia · Justicia · Confidencialidad',
      secciones: [
        {
          titulo: 'Pasos',
          pasos: [
            { t: '1 · Intervención inmediata', d: ['Informar de forma inmediata a: Supervisor zonal, DAI, padres y/o tutores.'] },
            { t: '2 · Espacios de diálogo individual', d: ['Con la parte afectada: apoyo emocional, escucha activa, validar sentimientos, garantizar seguridad, explicar el protocolo y el acompañamiento.', 'Con la parte agresora: reflexionar sobre el daño causado, analizar consecuencias, promover empatía y responsabilidad.'] },
            { t: '3 · Documentación y registro', d: ['Registrar todo el proceso de intervención y seguimiento en el Libro de Actas de Situaciones Complejas, resguardando la confidencialidad.'] },
            { t: '4 · Medidas de cuidado institucional', d: ['Fortalecer el cuidado y la supervisión de: espacios comunes, recreos, ingresos y salidas, inmediaciones de la escuela.'] },
            { t: '5 · Aplicación del AEC', d: ['Aplicar el Acuerdo Escolar de Convivencia y convocar al Consejo Escolar de Convivencia para evaluar la situación, posibles sanciones y dispositivos institucionales de intervención.', 'Seguimiento del equipo directivo para que la medida no se agote en sí misma y ratifique su sentido educativo.'] },
            { t: '6 · Estrategias pedagógicas reparadoras', d: ['Actividades que promuevan respeto y convivencia, empatía, manejo de emociones y resolución pacífica de conflictos.', 'Posibles acciones reparadoras: disculpas voluntarias, tareas comunitarias, huerto escolar, murales de convivencia, reparación de espacios dañados.', 'Compromiso de cambio de conducta de la parte agresora y de quienes hayan participado fomentando el hecho; monitorear hasta su cumplimiento íntegro.', 'Restauración de vínculos y fortalecimiento del sentido de pertenencia.'] },
            { t: '7 · Comunicación con DAE', d: ['Informar a la DAE en los casos que lo ameriten y que no se encuentren debidamente amparados en el Acuerdo Escolar de Convivencia.'] },
            { t: '8 · Apoyo profesional', d: ['De ser necesario, derivar a psicología, psicopedagogía o salud mental, siempre con consentimiento familiar.'] },
            { t: '9 · Medidas de protección', d: ['Prevenir nuevos episodios: reorganización de espacios, mayor supervisión, acompañamiento adulto en recreos, ingresos y espacios comunes.'] },
            { t: '10 · Trabajo con las familias', d: ['Informar a las familias de todas las partes y promover corresponsabilidad, compromiso y reparación del vínculo.'] }
          ]
        }
      ],
      contactos: [],
      notas: ['Aclaración: las familias o adultos responsables tienen la potestad de realizar la denuncia ante autoridades policiales según sea el caso.']
    },
    {
      id: 'urgencia',
      titulo: 'Situaciones de urgencia subjetiva',
      subtitulo: 'Riesgo para la vida del estudiante: intento, autolesión o ideación',
      color: '#7c3aed',
      urgente: true,
      keywords: ['suicidio', 'suicida', 'suicidarse', 'quitarse la vida', 'quiere morir', 'quiero morir', 'morirse', 'no quiere vivir', 'matarse', 'se quiere matar',
        'autolesion', 'autolesiones', 'se lastima', 'lastimarse', 'cortes', 'se corta', 'cortes en los brazos', 'marcas en los brazos', 'ideacion', 'urgencia subjetiva',
        'crisis', 'ataque de panico', 'angustia', 'llanto desconsolado', 'desesperado', 'se tomo pastillas', 'intento'],
      principios: 'Cuidar · Proteger · Escuchar · Acompañar · Confidencialidad',
      secciones: [
        {
          titulo: 'Ante una situación de riesgo para la vida del estudiante en la escuela',
          pasos: [
            { t: '1 · Preservar la integridad física y emocional', d: ['No dejarlo solo. Si ocurre en la escuela, apartar al estudiante del grupo, resguardando su privacidad y evitando exposiciones innecesarias.'] },
            { t: '2 · Llamar al SAME 107', d: ['Solicitar asistencia médica inmediata para evaluar la situación y establecer las acciones pertinentes.'] },
            { t: '3 · Comunicar a la familia', d: ['Informar a la familia o referentes de cuidado, resguardando la confidencialidad.'] },
            { t: '4 · Evitar relatos múltiples o interrogatorios', d: ['Priorizar un espacio de escucha seguro y de confianza con un adulto significativo para el estudiante.'] },
            { t: '5 · Informar al DAI y a la Supervisión zonal', d: ['Enviar: nombre y apellido, escuela, edad, DNI, curso, dirección y contacto telefónico del referente familiar.', 'En notas o informes escritos, consignar el nombre sólo con INICIALES y número de DNI.'] },
            { t: '6 · Reincorporación a la vida escolar', d: ['Junto con el DAI y la Dirección de Nivel, plan de reincorporación paulatina: tiempos, espacios y exigencias adaptadas, tutorías y acompañamiento individual según el informe de salud.'] },
            { t: '7 · Manejo responsable de la información', d: ['Si trasciende a medios, manejo cuidadoso y responsable dentro del marco legal de protección de niñas, niños y adolescentes.'] },
            { t: '8 · Brindar números de ayuda', d: ['SAME 107 · Salud Mental Escucha (24 h): 0800-88-8-47-67.'] }
          ]
        },
        {
          titulo: 'Ante una pérdida por suicidio (con asesoramiento del equipo del DAI)',
          pasos: [
            { t: '1', d: ['Encuentro con referentes de la comunidad educativa para dar primeras pautas de acompañamiento a los estudiantes en las primeras horas.'] },
            { t: '2', d: ['Mapeo de riesgos: detectar estudiantes y docentes afectados.'] },
            { t: '3', d: ['Reunión con familias para orientar pautas de alerta, cuidado y números de ayuda.'] },
            { t: '4', d: ['Detener rumores y promover el respeto. No difundir material audiovisual.'] },
            { t: '5', d: ['Evitar espacios a modo de altares permanentes.'] },
            { t: '6', d: ['Brindar números de ayuda: SAME 107 · Salud Mental Escucha 0800-88-8-47-67.'] }
          ]
        },
        ACOMPANAMIENTO
      ],
      contactos: [{ nombre: 'SAME', tel: '107' }, { nombre: 'Salud Mental Escucha (24 h)', tel: '08008884767' }],
      notas: ['Tu mirada, tu escucha y tu acción pueden salvar vidas. Cuidar es educar.']
    },
    {
      id: 'consumo',
      titulo: 'Situaciones de consumo problemático en el ámbito escolar',
      subtitulo: 'Consumo en la escuela, hallazgo de sustancias o comercialización',
      color: '#0f766e',
      keywords: ['consumo', 'droga', 'drogas', 'drogado', 'marihuana', 'porro', 'faso', 'cocaina', 'merca', 'pasta base', 'alcohol', 'borracho', 'alcoholizado',
        'cerveza', 'vino', 'fernet', 'cigarrillo', 'fumando', 'fuma', 'vapeador', 'vaper', 'vape', 'pastillas', 'psicofarmacos', 'sustancia', 'sustancias',
        'vende', 'venta', 'vendiendo', 'comercializacion', 'olor raro', 'olor a marihuana', 'bajo efectos', 'ojos rojos'],
      principios: 'Cuidar · Acompañar · Proteger · Articular · Confidencialidad',
      secciones: [
        {
          titulo: 'Importante',
          pasos: [{ t: 'Registro', d: ['Dejar constancia en el LIBRO DE ACTAS PARA SITUACIONES COMPLEJAS de todo lo actuado. En informes o notas, el nombre del estudiante va sólo con INICIALES y DNI.'] }]
        },
        {
          titulo: 'A · Cuando el estudiante presenta consumo en la escuela',
          pasos: [
            { t: '1 · Informar al Supervisor zonal y/o autoridades', d: ['En notas o informes: sólo iniciales y DNI para resguardar su identidad.'] },
            { t: '2 · Ante consumo en la escuela o bajo sus efectos', d: ['Llamar al servicio médico o SAME 107 para evaluar la situación.'] },
            { t: '3 · Habilitar espacio y tiempo para el diálogo', d: ['Diálogo reservado y tranquilo con un adulto de vínculo cercano y de confianza. Evitar interrogatorios punitivos.'] },
            { t: '4 · Garantizar confidencialidad', d: ['Evitar que intervengan actores innecesarios. Manejar la información con estricta discreción.'] },
            { t: '5 · Convocar e informar a las familias', d: ['Acompañar y orientar a la familia o referentes en el proceso de cuidado.'] },
            { t: '6 · Coordinar con el DAI', d: ['Diseñar con profesionales del Departamento de Apoyo Institucional estrategias de acompañamiento y seguimiento.'] },
            { t: 'Sostener articulaciones', d: ['Trabajo en red con salud, equipos socioeducativos, niñez, educación, justicia y actores locales.'] }
          ]
        },
        {
          titulo: 'B · Cuando se encuentra sustancia o se detecta comercialización',
          pasos: [
            { t: '1 · Realizar la denuncia', d: ['En la seccional policial más cercana o por medios digitales: mpajujuy.gov.ar (sección "Canales de Recepción de Denuncias") o el canal del Ministerio de Seguridad indicado en el afiche institucional.', 'Quien realice la denuncia debe ir acompañado de alguna autoridad institucional.', 'El personal de Seguridad que ingrese a retirar la sustancia debe hacerlo de civil, no uniformado, en resguardo de los derechos de niñas, niños y adolescentes.'] },
            { t: '2 · Si se detecta vulneración de derechos asociada al consumo', d: ['Dar aviso a la Línea 102.', 'Coordinar con profesionales del DAI y sostener la articulación con otros organismos.'] }
          ]
        },
        ACOMPANAMIENTO,
        {
          titulo: 'Marco normativo de referencia (según afiche)',
          pasos: [{ t: 'Normas', d: ['Ley 26.061 · Ley de Educación Nacional 26.206 · Ley Provincial 6294 · Estatuto Docente (Leyes 2531 y 3520) · Estatuto del Empleado Público (Ley 3161) · Código Procesal Penal · Ley de Procedimiento Administrativo (Ley 1886).'] }]
        }
      ],
      contactos: [{ nombre: 'SAME', tel: '107' }, { nombre: 'Línea 102 (derechos NNyA)', tel: '102' }, { nombre: 'Ministerio Público de la Acusación', url: 'https://www.mpajujuy.gov.ar' }],
      notas: ['Educar es cuidar, y cuidar también es enseñar.']
    },
    {
      id: 'agresor-escuela',
      titulo: 'Protocolo especial: el presunto agresor pertenece a la comunidad educativa',
      subtitulo: 'Docentes, preceptores, directivos, administrativos u otro personal',
      color: '#1e3a8a',
      urgente: true,
      keywords: ['docente', 'profesor', 'profesora', 'maestro', 'maestra', 'preceptor', 'preceptora', 'portero', 'ordenanza', 'directivo', 'director', 'directora',
        'personal de la escuela', 'adulto de la escuela', 'empleado', 'administrativo', 'un profe', 'una profe', 'seño', 'sumario', 'agresor de la escuela'],
      principios: 'Denunciar es una obligación legal de todo funcionario público del sistema educativo.',
      secciones: [
        {
          titulo: '¿Qué se debe hacer?',
          pasos: [
            { t: '1 · Realizar la denuncia penal', d: ['En la comisaría o ante el Ministerio Público de la Acusación.'] },
            { t: '2 · Informar de inmediato al Supervisor zonal', d: ['Comunicar la situación de manera inmediata.'] },
            { t: '3 · Elaborar informe técnico detallado', d: ['Circunstancias del hecho, actas y acciones tomadas, copia de la denuncia. Lo elaboran Supervisión y Dirección.'] },
            { t: '4 · Acto administrativo de inicio de sumario', d: ['La Dirección de Nivel dicta el acto administrativo de inicio de sumario.'] },
            { t: '5 · Medidas preventivas y garantías', d: ['Separación del cargo, instrucción sumarial, debido proceso con derecho a defensa, evaluación según Estatuto Docente (Leyes 2531, 3520) y Ley 3161.', 'La investigación penal queda a cargo del Ministerio Público Fiscal, independientemente del proceso administrativo.'] }
          ]
        },
        {
          titulo: 'Responsabilidad y obligación de denunciar',
          pasos: [
            { t: 'Quiénes', d: ['Todos los integrantes del sistema educativo actúan como funcionarios públicos y están obligados a denunciar de inmediato cualquier vulneración de derechos de niñas, niños y adolescentes.'] },
            { t: 'Protección del denunciante', d: ['Quien denuncia en ejercicio de sus funciones goza de protección legal.'] },
            { t: 'Consecuencias por omisión', d: ['Responsabilidad penal por incumplimiento del deber de denunciar y responsabilidad administrativa disciplinaria.'] },
            { t: 'Marco normativo (según afiche)', d: ['Ley 26.061 art. 30 · Ley 26.206 art. 67 inc. e · Estatuto Docente · Ley 3161 art. 100 inc. 7 · Ley 6294 art. 21 · Ley 6259 (CPP) art. 334 inc. c · Ley 1886 art. 114.'] }
          ]
        }
      ],
      contactos: [{ nombre: 'Ministerio Público de la Acusación', url: 'https://www.mpajujuy.gov.ar' }],
      notas: ['Los pasos pueden variar según cada caso, respetando siempre la normativa vigente y los derechos de todas las partes.']
    },
    {
      id: 'grooming',
      titulo: 'Grooming y otros casos de violencia digital',
      subtitulo: 'Escuchar · Denunciar · Acompañar · Proteger',
      color: '#9333ea',
      urgente: true,
      keywords: ['grooming', 'groomer', 'desconocido', 'adulto desconocido', 'chat', 'chatea', 'le escribe', 'mensajes', 'fotos intimas', 'fotos desnuda', 'fotos desnudo',
        'nudes', 'pack', 'sextorsion', 'extorsion', 'lo extorsionan', 'perfil falso', 'cuenta falsa', 'instagram', 'tiktok', 'free fire', 'roblox', 'discord',
        'videojuego', 'le pide fotos', 'difundieron fotos', 'difusion de imagenes', 'violencia digital', 'hackearon', 'le pidio encontrarse'],
      principios: 'Interés superior del niño · Confidencialidad · No revictimización · Corresponsabilidad institucional',
      secciones: [
        {
          titulo: 'Pasos',
          pasos: [
            { t: '1 · Escucha y contención', d: ['Espacio seguro donde el niño, niña o adolescente se sienta escuchado por el adulto elegido.', 'Asegurar privacidad, sin interrupciones. Garantizar discreción y confidencialidad.', 'Escuchar sin interrumpir; dejar que se exprese.'] },
            { t: '2 · Realizar la denuncia', d: ['Seccional o comisaría cercana.', 'Oficinas del Ministerio Público de la Acusación.', 'Fiscalías especializadas en ciberdelitos: calle Independencia N.º 169.', 'Web del MPA: mpajujuy.gov.ar.', 'App GAP (Play Store), de la ONG Grooming Argentina, con botón de reporte.', 'Línea 24 h: +54 9 11 2481 1722.'] },
            { t: '3 · Convocar y orientar a los adultos referentes', d: ['Convocar a los adultos que el chico/a mencione como referentes; evitar que lo hagan sentir culpable.', 'Conservación de pruebas: NO bloquear, enfrentar ni reportar al perfil acusado (se pierden pruebas). NO borrar conversaciones. NO hacerse pasar por la víctima.', 'Guardar pruebas en otro dispositivo: capturas, número, usuarios, correos, URL del perfil.', 'Evitar avergonzar o responsabilizar al chico/a.'] },
            { t: '4 · Acompañamiento posterior', d: ['Seguimiento de asistencia, propuestas flexibles, espacios de contención, orientación a la familia y trabajo en red.'] }
          ]
        }
      ],
      contactos: [{ nombre: 'Grooming Argentina (24 h)', tel: '+5491124811722' }, { nombre: 'Ministerio Público de la Acusación', url: 'https://www.mpajujuy.gov.ar' }],
      notas: ['Escuchar, creer, acompañar y actuar. No estás solo/a: pedí orientación.']
    },
    {
      id: 'develamiento',
      titulo: 'Develamiento: situaciones de vulneración de derechos',
      subtitulo: 'Violencia sexual, maltrato infantil, violencia de género, grooming u otra violencia digital',
      color: '#be185d',
      urgente: true,
      keywords: ['develamiento', 'devela', 'me conto', 'le conto', 'relato', 'relata', 'cuenta que', 'abuso', 'abusaron', 'abuso sexual', 'violencia sexual', 'la tocaron', 'lo tocaron',
        'me toco', 'tocamientos', 'maltrato', 'maltrato infantil', 'le pegan en la casa', 'le pegan', 'en su casa', 'golpes en la casa', 'moretones', 'marcas', 'violencia de genero',
        'violencia familiar', 'padrastro', 'tio', 'vulneracion de derechos', 'no quiere volver a su casa', 'tiene miedo de volver'],
      principios: 'Confidencialidad y resguardo · No revictimización · Participación y derecho a ser oído · Interés superior del niño',
      secciones: [
        {
          titulo: 'Escuchar, proteger, actuar y acompañar',
          pasos: [
            { t: '1 · Escuchar y contener', d: ['Espacio privado, sin interrupciones ni terceros.', 'Escuchar sin interrumpir, sin indagar ni presionar. Validar y contener.', 'Indagar sólo si el agresor forma parte del entorno cercano o frecuenta sus espacios cotidianos.', 'Consultar si desea que se convoque a un adulto referente.'] },
            { t: '2 · Registrar el relato en acta', d: ['Registrar textualmente el relato, con sus palabras exactas (entre comillas).', 'Mencionar lenguaje corporal y emociones observadas.', 'Nombre del estudiante sólo con iniciales y DNI.', 'Firma únicamente el adulto que escuchó. Resguardar con confidencialidad.'] },
            { t: '3 · Realizar la denuncia', d: ['En la comisaría más cercana o en la Oficina del Ministerio Público de la Acusación (MPA), a la brevedad.', 'Ir acompañado/a de una autoridad de la institución y adjuntar copia del acta.'] },
            { t: '4 · Comunicar al organismo de protección', d: ['Si el agresor es intrafamiliar: luego de la denuncia, comunicar a la Línea 102, al 3884-22-12-42 o WhatsApp 3884-60-00-99 (emergencias SENAF).', 'Si NO es intrafamiliar o fue en un período anterior: luego de la denuncia, informar a SENAF (senafjujuy@gmail.com) adjuntando informe, actas y copia de la denuncia.'] },
            { t: '5 · Dar intervención simultánea', d: ['Comunicar al Supervisor zonal (quien informa a la Dirección de Nivel y al área legal).', 'Dar intervención al Departamento de Apoyo Institucional (DAI) y trabajar articuladamente.'] },
            { t: '6 · Acompañar y sostener la trayectoria escolar', d: ['Contención pedagógica y emocional, ambiente seguro, articulación con organismos y seguimiento sin revictimizar.'] }
          ]
        }
      ],
      contactos: [{ nombre: 'Línea 102', tel: '102' }, { nombre: 'SENAF', tel: '3884221242' }, { nombre: 'SENAF WhatsApp', wa: '5493884600099' }, { nombre: 'SENAF correo', mail: 'senafjujuy@gmail.com' }],
      notas: ['Escuchar, creer, proteger y actuar a tiempo puede cambiar la vida de un niño, niña o adolescente.']
    }
  ];

  /* ------------------------- Buscador local ------------------------- */
  function normalizar(t) {
    return (t || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const VACIAS = new Set('de la el los las un una unos unas y o a en con por para que se le lo su sus al del es fue esta estan hay mi me nos ya muy mas pero como cuando donde'.split(' '));

  // Prepara índice
  P.forEach(p => {
    p._kw = p.keywords.map(normalizar);
    p._texto = normalizar([p.titulo, p.subtitulo].concat(...p.secciones.map(s => s.pasos.map(x => x.t + ' ' + x.d.join(' ')))).join(' '));
  });

  function buscar(consulta) {
    const q = normalizar(consulta);
    if (!q) return [];
    const tokens = q.split(' ').filter(w => w.length > 2 && !VACIAS.has(w));
    const res = P.map(p => {
      let score = 0; const coincide = [];
      p._kw.forEach(k => {
        if (k.includes(' ')) { if (q.includes(k)) { score += 6; coincide.push(k); } }
        else if (tokens.includes(k)) { score += 4; coincide.push(k); }
        else if (k.length >= 5 && tokens.some(t => t.length >= 5 && (t.startsWith(k.slice(0, 5)) || k.startsWith(t.slice(0, 5))))) { score += 2; coincide.push(k); }
      });
      tokens.forEach(t => { if (t.length >= 4 && p._texto.includes(t)) score += 0.5; });
      return { protocolo: p, score, coincide: [...new Set(coincide)] };
    }).filter(r => r.score >= 2).sort((a, b) => b.score - a.score);
    return res;
  }

  g.PSProtocolos = { lista: P, buscar, normalizar };
})(typeof window !== 'undefined' ? window : globalThis);
