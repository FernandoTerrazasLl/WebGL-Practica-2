"use strict";

// ============================================================================
// VARIABLES PRINCIPALES DEL PROGRAMA
// ============================================================================
let gl, program;
let cantidad_estrellas = 40000; // Cantidad total de estrellas que vamos a dibujar
let tiempo_animacion = 0; // Contador de tiempo para mover las estrellas hacia nosotros

// Variables para guardar las posiciones y colores de las estrellas
let buffer_posiciones_ordenadas, buffer_posiciones_agrupadas, buffer_tamanos, buffer_variaciones_color;
let posiciones_ordenadas, posiciones_agrupadas, tamanos_estrellas, variaciones_color;

// Variables para saber dónde está el mouse
let mouse_x = 0, mouse_y = 0;
let objetivo_mouse_x = 0, objetivo_mouse_y = 0;

// CONFIGURACIÓN DEL MENÚ (lo que el usuario puede cambiar)
const configuracion_menu = {
    // Control principal: si queremos ver las estrellas ordenadas o agrupadas
    factor_mezcla: 1.0,       // 1.0 = agrupadas en galaxias, 0.0 = ordenadas en cuadrícula
    
    // Configuración de las galaxias (cuando cambian estos valores, se recalculan las posiciones)
    cantidad_galaxias: 50,       // Cantidad de galaxias que habrá
    dispersion_galaxias: 350.0,   // Qué tan separadas están las estrellas dentro de cada galaxia
    poder_fractal: 2.5,      // Qué tan juntas están las estrellas al centro de cada galaxia (más alto = más juntas)
    
    // Configuración visual (estos se actualizan en tiempo real sin recalcular)
    velocidad_viaje: 30.0,            // Qué tan rápido nos movemos entre las estrellas
    tamano_base: 3.0,          // Tamaño general de las estrellas
    
    // Colores de las estrellas
    color_centro: [200, 220, 255], // Color del centro de cada estrella (azul claro)
    color_borde: [50, 100, 255]    // Color del borde de cada estrella (azul oscuro)
};

// ============================================================================
// INICIO DEL PROGRAMA (Se ejecuta cuando la página carga)
// ============================================================================
window.onload = function init() {
    // Obtener el lienzo donde vamos a dibujar y hacerlo del tamaño de toda la ventana
    const canvas = document.getElementById("gl-canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Inicializar WebGL2 para poder dibujar en 3D
    gl = canvas.getContext("webgl2");
    if (!gl) { alert("WebGL 2.0 no disponible"); return; }

    // Detectar cuando el usuario mueve el mouse para rotar la cámara
    window.addEventListener('mousemove', e => {
        // Convertir la posición del mouse a valores entre -1 y 1
        objetivo_mouse_x = (e.clientX / window.innerWidth) * 2 - 1;
        objetivo_mouse_y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    // Cargar y compilar los shaders (programas que dibujan en la GPU)
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // Preparar los espacios de memoria para las estrellas
    configurar_buffers();
    
    // Crear las posiciones de todas las estrellas por primera vez
    regenerar_galaxia();

    // Configurar cómo se va a ver el dibujo
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.02, 0.05, 1.0); // Color de fondo: azul muy oscuro (espacio)
    gl.enable(gl.BLEND); // Activar transparencias
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Hacer que las estrellas brillen al superponerse

    // Crear el menú de controles
    inicializar_menu();
    
    // Empezar a dibujar continuamente
    dibujar();
};

// ============================================================================
// CREAR LAS POSICIONES DE TODAS LAS ESTRELLAS
// ============================================================================
function regenerar_galaxia() {
    // Crear listas para guardar la información de cada estrella
    posiciones_ordenadas = new Float32Array(cantidad_estrellas * 3); // 3 números por estrella (x, y, z)
    posiciones_agrupadas = new Float32Array(cantidad_estrellas * 3);
    tamanos_estrellas = new Float32Array(cantidad_estrellas); // Tamaño de cada estrella
    variaciones_color = new Float32Array(cantidad_estrellas); // Variación de color (0 a 1)

    // --- A. MODO ORDENADO (CUADRÍCULA) ---
    // Las estrellas se organizan en una cuadrícula 3D perfecta con un poco de desorden
    const dimension = Math.cbrt(cantidad_estrellas); // Calcular cuántas estrellas por lado del cubo
    const espacio = 2200 / dimension; // Espacio entre cada estrella
    const centro = 1100; // Para centrar la cuadrícula en 0,0,0

    let indice = 0;
    for (let i = 0; i < cantidad_estrellas; i++) {
        // Calcular posición en la cuadrícula
        let x = (i % dimension) * espacio - centro;
        let y = (Math.floor(i / dimension) % dimension) * espacio - centro;
        let z = (Math.floor(i / (dimension * dimension))) * espacio - centro;

        // Agregar un poquito de aleatoriedad para que no se vea tan perfecto
        posiciones_ordenadas[indice] = x + (Math.random()-0.5)*50;
        posiciones_ordenadas[indice+1] = y + (Math.random()-0.5)*50;
        posiciones_ordenadas[indice+2] = z + (Math.random()-0.5)*50;
        
        indice += 3;
    }

    // --- B. MODO AGRUPADO (GALAXIAS) ---
    // Las estrellas se agrupan en galaxias, más densas en el centro

    indice = 0;
    for (let i = 0; i < cantidad_estrellas; i++) {
        // 1. Elegir a qué galaxia pertenece esta estrella (aleatoriamente)
        const id_galaxia = Math.floor(Math.random() * configuracion_menu.cantidad_galaxias);
        
        // 2. Calcular la posición del centro de esa galaxia
        // Usamos funciones matemáticas para que siempre quede en el mismo lugar
        const centro_x = (Math.sin(id_galaxia * 43758.5453) - 0.5) * 1800;
        const centro_y = (Math.cos(id_galaxia * 23421.6312) - 0.5) * 1800;
        const centro_z = (Math.sin(id_galaxia * 87654.1234) - 0.5) * 1800;

        // 3. Calcular qué tan lejos del centro está esta estrella
        // poder_fractal controla si están más juntas (valor alto) o separadas (valor bajo)
        const distancia = Math.pow(Math.random(), configuracion_menu.poder_fractal) * configuracion_menu.dispersion_galaxias;
        
        // 4. Crear un ángulo aleatorio para que las estrellas rodeen el centro
        const angulo_horizontal = Math.random() * Math.PI * 2; // Ángulo horizontal
        const angulo_vertical = Math.random() * Math.PI; // Ángulo vertical

        // 5. Calcular la posición final de la estrella sumando el centro + el desplazamiento
        posiciones_agrupadas[indice] = centro_x + distancia * Math.sin(angulo_vertical) * Math.cos(angulo_horizontal);
        posiciones_agrupadas[indice+1] = centro_y + distancia * Math.sin(angulo_vertical) * Math.sin(angulo_horizontal);
        posiciones_agrupadas[indice+2] = centro_z + distancia * Math.cos(angulo_vertical);

        // 6. Las estrellas más cerca del centro son más grandes
        let factor_distancia = 1.0 - (distancia / configuracion_menu.dispersion_galaxias); // 1.0 = centro, 0.0 = borde
        
        tamanos_estrellas[i] = Math.random() * 1.5 + 0.5 + (factor_distancia * 2.0); // Tamaño aleatorio + bonus por estar cerca
        variaciones_color[i] = Math.random(); // Color aleatorio para cada estrella

        indice += 3;
    }

    // Enviar todos estos datos a la tarjeta gráfica para que pueda dibujarlos
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_posiciones_ordenadas);
    gl.bufferData(gl.ARRAY_BUFFER, posiciones_ordenadas, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_posiciones_agrupadas);
    gl.bufferData(gl.ARRAY_BUFFER, posiciones_agrupadas, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_tamanos);
    gl.bufferData(gl.ARRAY_BUFFER, tamanos_estrellas, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_variaciones_color);
    gl.bufferData(gl.ARRAY_BUFFER, variaciones_color, gl.STATIC_DRAW);
}

function configurar_buffers() {
    // Función auxiliar para crear un espacio de memoria y conectarlo con el shader
    const crear_buffer = (nombre, tamano) => {
        const buffer = gl.createBuffer(); // Crear espacio de memoria en la GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer); // Activar ese espacio
        const ubicacion = gl.getAttribLocation(program, nombre); // Encontrar la variable en el shader
        gl.vertexAttribPointer(ubicacion, tamano, gl.FLOAT, false, 0, 0); // Decirle cómo leer los datos
        gl.enableVertexAttribArray(ubicacion); // Activar esa conexión
        return buffer;
    };

    // Crear espacios de memoria para cada tipo de dato que necesitamos
    buffer_posiciones_ordenadas = crear_buffer("a_posUniform", 3); // Posiciones ordenadas (3 valores: x,y,z)
    buffer_posiciones_agrupadas = crear_buffer("a_posFractal", 3); // Posiciones agrupadas (3 valores: x,y,z)
    buffer_tamanos = crear_buffer("a_size", 1); // Tamaño de cada estrella (1 valor)
    buffer_variaciones_color = crear_buffer("a_colorVar", 1); // Variación de color (1 valor)
}

// ============================================================================
// CREAR EL MENÚ DE CONTROLES
// ============================================================================
function inicializar_menu() {
    const menu = new dat.GUI({ width: 320 }); // Crear el menú con ancho de 320 pixeles

    // Carpeta 1: El control principal para cambiar entre modos
    const carpeta_teoria = menu.addFolder('COSMOGRAFÍA (Teoría)');
    carpeta_teoria.add(configuracion_menu, 'factor_mezcla', 0.0, 1.0).name('Uniforme ↔ Fractal').step(0.01).listen();
    carpeta_teoria.open(); // Dejar esta carpeta abierta por defecto

    // Carpeta 2: Controles que cambian cómo se crean las galaxias
    const carpeta_generacion = menu.addFolder('Generación Fractal (Recalcula)');
    carpeta_generacion.add(configuracion_menu, 'cantidad_galaxias', 1, 200).name('Cant. Galaxias').step(1).onFinishChange(regenerar_galaxia);
    carpeta_generacion.add(configuracion_menu, 'dispersion_galaxias', 100, 1000).name('Dispersión').onFinishChange(regenerar_galaxia);
    carpeta_generacion.add(configuracion_menu, 'poder_fractal', 1.0, 5.0).name('Atracción Gravitatoria').onFinishChange(regenerar_galaxia);
    carpeta_generacion.open();

    // Carpeta 3: Controles visuales que cambian en tiempo real
    const carpeta_visual = menu.addFolder('Experiencia Visual');
    carpeta_visual.add(configuracion_menu, 'velocidad_viaje', 0.0, 300.0).name('Velocidad Luz');
    carpeta_visual.add(configuracion_menu, 'tamano_base', 1.0, 30.0).name('Tamaño Base');
    carpeta_visual.addColor(configuracion_menu, 'color_centro').name('Color Núcleo');
    carpeta_visual.addColor(configuracion_menu, 'color_borde').name('Color Borde');
    carpeta_visual.open();
}

// ============================================================================
// FUNCIÓN QUE DIBUJA TODO (se ejecuta 60 veces por segundo)
// ============================================================================
function dibujar() {
    gl.clear(gl.COLOR_BUFFER_BIT); // Limpiar la pantalla antes de dibujar
    tiempo_animacion += 0.01; // Incrementar el tiempo para la animación

    // Hacer que el movimiento del mouse sea suave (no brusco)
    mouse_x += (objetivo_mouse_x - mouse_x) * 0.05; // Ir poco a poco hacia donde está el mouse
    mouse_y += (objetivo_mouse_y - mouse_y) * 0.05;

    // 1. Enviar los valores del menú al shader (la GPU)
    const obtener_ubicacion_uniform = (nombre) => gl.getUniformLocation(program, nombre); // Función para encontrar variables
    
    gl.uniform1f(obtener_ubicacion_uniform("u_mixFactor"), configuracion_menu.factor_mezcla); // Enviar el valor del slider ordenado/agrupado
    gl.uniform1f(obtener_ubicacion_uniform("u_time"), tiempo_animacion); // Enviar el tiempo actual
    gl.uniform1f(obtener_ubicacion_uniform("u_speed"), configuracion_menu.velocidad_viaje); // Enviar la velocidad
    gl.uniform1f(obtener_ubicacion_uniform("u_baseSize"), configuracion_menu.tamano_base); // Enviar el tamaño base

    // Enviar los colores (convertir de 0-255 a 0-1)
    gl.uniform3f(obtener_ubicacion_uniform("u_colorCore"), configuracion_menu.color_centro[0]/255, configuracion_menu.color_centro[1]/255, configuracion_menu.color_centro[2]/255);
    gl.uniform3f(obtener_ubicacion_uniform("u_colorRim"), configuracion_menu.color_borde[0]/255, configuracion_menu.color_borde[1]/255, configuracion_menu.color_borde[2]/255);

    // 2. Calcular las matrices para la cámara 3D
    let relacion_aspecto = gl.canvas.width / gl.canvas.height; // Relación ancho/alto de la pantalla
    let matriz_proyeccion = perspective(60.0, relacion_aspecto, 1.0, 4000.0); // Crear perspectiva 3D (cosas lejos se ven pequeñas)

    // Crear la matriz de vista (controla hacia dónde miramos)
    let matriz_vista = mat4(); // Empezar con una matriz vacía
    
    // Rotar según el mouse (para mirar alrededor)
    matriz_vista = mult(matriz_vista, rotateY(-mouse_x * 20.0)); // Girar horizontalmente con el mouse
    matriz_vista = mult(matriz_vista, rotateX(-mouse_y * 20.0)); // Girar verticalmente con el mouse
    
    // Agregar una rotación automática lenta para que se vea dinámico
    matriz_vista = mult(matriz_vista, rotateZ(tiempo_animacion * 2.0)); 

    // Enviar las matrices al shader
    gl.uniformMatrix4fv(obtener_ubicacion_uniform("u_projectionMatrix"), false, flatten(matriz_proyeccion));
    gl.uniformMatrix4fv(obtener_ubicacion_uniform("u_modelViewMatrix"), false, flatten(matriz_vista));

    // 3. Dibujar todas las estrellas como puntos
    gl.drawArrays(gl.POINTS, 0, cantidad_estrellas);

    // Repetir esta función continuamente para crear la animación
    requestAnimationFrame(dibujar);
}

// Cuando el usuario cambia el tamaño de la ventana, ajustar el canvas
window.onresize = () => {
    const c = document.getElementById("gl-canvas");
    c.width = window.innerWidth; // Hacer el canvas del ancho de la ventana
    c.height = window.innerHeight; // Hacer el canvas del alto de la ventana
    gl.viewport(0, 0, c.width, c.height); // Actualizar el área de dibujo
};

// ============================================================================
// FUNCIÓN AUXILIAR (por si la librería no la tiene)
// ============================================================================
// Esta función convierte matrices en un formato que entiende WebGL
if (typeof flatten === 'undefined') {
    window.flatten = function(v) {
        if (v.matrix === true) v = transpose(v);
        var n = v.length;
        if (typeof(v[0]) === 'object' && v[0] instanceof Float32Array) {
            var m = v[0].length;
            var floats = new Float32Array(n * m);
            for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) floats[i * m + j] = v[i][j];
            return floats;
        }
        var floats = new Float32Array(n);
        for (var i = 0; i < n; i++) floats[i] = v[i];
        return floats;
    }
}