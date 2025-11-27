"use strict";

// ============================================================================
// CONFIGURACIÓN GLOBAL Y VARIABLES
// ============================================================================
let gl, program;
let numParticles = 40000; // ¡Más estrellas para mayor impacto!
let time = 0;

// Buffers Globales (para poder regenerar datos)
let bUniform, bFractal, bSize, bColorVar;
let positionsUniform, positionsFractal, sizes, colorVariations;

// Variables de Mouse
let mouseX = 0, mouseY = 0;
let targetMouseX = 0, targetMouseY = 0;

// AJUSTES DE LA UI (Lo que el usuario controla)
const settings = {
    // Teoría
    morphFactor: 1.0,       // 1.0 = Fractal (PCC), 0.0 = Uniforme
    
    // Generación Fractal (Requieren regenerar geometría)
    clusterCount: 50,       // Cuántas "Galaxias" hay
    clusterSpread: 350.0,   // Qué tan dispersas son las estrellas del centro
    fractalPower: 2.5,      // Ley de Potencias (Más alto = Más agrupado)
    
    // Visuales (Uniforms rápidos)
    speed: 30.0,            // Velocidad de viaje
    baseSize: 3.0,          // Tamaño base
    
    // Colores
    colorCore: [200, 220, 255], // Color central
    colorRim: [50, 100, 255]    // Color de borde
};

// ============================================================================
// INICIALIZACIÓN
// ============================================================================
window.onload = function init() {
    const canvas = document.getElementById("gl-canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    gl = canvas.getContext("webgl2");
    if (!gl) { alert("WebGL 2.0 no disponible"); return; }

    // Event Listeners para Mouse
    window.addEventListener('mousemove', e => {
        // Normalizar de -1 a 1
        targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
        targetMouseY = (e.clientY / window.innerHeight) * 2 - 1;
    });

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // Inicializar Buffers vacíos
    setupBuffers();
    
    // Generar la primera versión del universo
    regenerateGalaxy();

    // Configurar WebGL
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.02, 0.05, 1.0); // Azul muy oscuro (Espacio profundo)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive Blending (Brillo)

    initGUI();
    render();
};

// ============================================================================
// GENERACIÓN PROCEDURAL DE DATOS (LA MAGIA MATEMÁTICA)
// ============================================================================
function regenerateGalaxy() {
    // Arrays tipados para rendimiento
    positionsUniform = new Float32Array(numParticles * 3);
    positionsFractal = new Float32Array(numParticles * 3);
    sizes = new Float32Array(numParticles);
    colorVariations = new Float32Array(numParticles); // 0.0 a 1.0

    // --- A. MODO UNIFORME (REJILLA + RUIDO) ---
    // Creamos una estructura "casi" perfecta para representar el Principio Fuerte
    const dim = Math.cbrt(numParticles); 
    const spacing = 2200 / dim; 
    const offset = 1100;

    let idx = 0;
    for (let i = 0; i < numParticles; i++) {
        // Coordenadas de rejilla
        let x = (i % dim) * spacing - offset;
        let y = (Math.floor(i / dim) % dim) * spacing - offset;
        let z = (Math.floor(i / (dim * dim))) * spacing - offset;

        // Añadimos un poco de ruido para que no sea una línea aburrida
        positionsUniform[idx] = x + (Math.random()-0.5)*50;
        positionsUniform[idx+1] = y + (Math.random()-0.5)*50;
        positionsUniform[idx+2] = z + (Math.random()-0.5)*50;
        
        idx += 3;
    }

    // --- B. MODO FRACTAL (CLUSTERING) ---
    // Algoritmo de Lévy Flight / Polvo de Cantor
    idx = 0;
    for (let i = 0; i < numParticles; i++) {
        // 1. Elegir un "Cúmulo" (Galaxia)
        const clusterID = Math.floor(Math.random() * settings.clusterCount);
        
        // Posición del Cúmulo (Semilla determinista)
        const cx = (Math.sin(clusterID * 43758.5453) - 0.5) * 1800;
        const cy = (Math.cos(clusterID * 23421.6312) - 0.5) * 1800;
        const cz = (Math.sin(clusterID * 87654.1234) - 0.5) * 1800;

        // 2. Dispersión Fractal (Ley de Potencias)
        // Esto controla qué tan "apretadas" están las estrellas
        const r = Math.pow(Math.random(), settings.fractalPower) * settings.clusterSpread;
        
        // Coordenadas esféricas aleatorias
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        positionsFractal[idx] = cx + r * Math.sin(phi) * Math.cos(theta);
        positionsFractal[idx+1] = cy + r * Math.sin(phi) * Math.sin(theta);
        positionsFractal[idx+2] = cz + r * Math.cos(phi);

        // 3. Variación de Tamaño y Color
        // Las estrellas en el centro de los cúmulos (r pequeño) suelen ser más viejas/grandes
        let distFactor = 1.0 - (r / settings.clusterSpread); // 1.0 en el centro, 0.0 afuera
        
        sizes[i] = Math.random() * 1.5 + 0.5 + (distFactor * 2.0); // Centro = Más grandes
        colorVariations[i] = Math.random(); // Variación aleatoria de tono

        idx += 3;
    }

    // Actualizar la GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, bUniform);
    gl.bufferData(gl.ARRAY_BUFFER, positionsUniform, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, bFractal);
    gl.bufferData(gl.ARRAY_BUFFER, positionsFractal, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, bSize);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, bColorVar);
    gl.bufferData(gl.ARRAY_BUFFER, colorVariations, gl.STATIC_DRAW);
}

function setupBuffers() {
    // Helper para crear buffers y atributos
    const createBuf = (name, size) => {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        const loc = gl.getAttribLocation(program, name);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(loc);
        return buf;
    };

    bUniform = createBuf("a_posUniform", 3);
    bFractal = createBuf("a_posFractal", 3);
    bSize = createBuf("a_size", 1);
    bColorVar = createBuf("a_colorVar", 1);
}

// ============================================================================
// INTERFAZ DE USUARIO (DAT.GUI)
// ============================================================================
function initGUI() {
    const gui = new dat.GUI({ width: 320 });

    // Carpeta 1: El Concepto Principal
    const f1 = gui.addFolder('COSMOGRAFÍA (Teoría)');
    f1.add(settings, 'morphFactor', 0.0, 1.0).name('Uniforme ↔ Fractal').step(0.01).listen();
    f1.open();

    // Carpeta 2: Generación (Regenera el universo)
    const f2 = gui.addFolder('Generación Fractal (Recalcula)');
    f2.add(settings, 'clusterCount', 1, 200).name('Cant. Galaxias').step(1).onFinishChange(regenerateGalaxy);
    f2.add(settings, 'clusterSpread', 100, 1000).name('Dispersión').onFinishChange(regenerateGalaxy);
    f2.add(settings, 'fractalPower', 1.0, 5.0).name('Atracción Gravitatoria').onFinishChange(regenerateGalaxy);
    f2.open();

    // Carpeta 3: Visuales (Tiempo real)
    const f3 = gui.addFolder('Experiencia Visual');
    f3.add(settings, 'speed', 0.0, 300.0).name('Velocidad Luz');
    f3.add(settings, 'baseSize', 1.0, 30.0).name('Tamaño Base');
    f3.addColor(settings, 'colorCore').name('Color Núcleo');
    f3.addColor(settings, 'colorRim').name('Color Borde');
    f3.open();
}

// ============================================================================
// RENDER LOOP
// ============================================================================
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    time += 0.01;

    // Suavizado del movimiento del mouse (Inercia)
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    // 1. Enviar Uniforms
    const uLoc = (name) => gl.getUniformLocation(program, name);
    
    gl.uniform1f(uLoc("u_mixFactor"), settings.morphFactor);
    gl.uniform1f(uLoc("u_time"), time);
    gl.uniform1f(uLoc("u_speed"), settings.speed);
    gl.uniform1f(uLoc("u_baseSize"), settings.baseSize);

    // Colores
    gl.uniform3f(uLoc("u_colorCore"), settings.colorCore[0]/255, settings.colorCore[1]/255, settings.colorCore[2]/255);
    gl.uniform3f(uLoc("u_colorRim"), settings.colorRim[0]/255, settings.colorRim[1]/255, settings.colorRim[2]/255);

    // 2. Matrices (Usando MVnew.js)
    let aspect = gl.canvas.width / gl.canvas.height;
    let projMatrix = perspective(60.0, aspect, 1.0, 4000.0); // Far plane alto para ver lejos

    // Matriz de Vista con Cámara "Flotante" (Mouse Interaction)
    let mvMatrix = mat4();
    
    // Rotación por mouse (Mirar alrededor)
    mvMatrix = mult(mvMatrix, rotateY(-mouseX * 20.0)); // Girar izquierda/derecha
    mvMatrix = mult(mvMatrix, rotateX(-mouseY * 20.0)); // Girar arriba/abajo
    
    // Rotación automática leve para dinamismo
    mvMatrix = mult(mvMatrix, rotateZ(time * 2.0)); 

    // Enviar Matrices
    gl.uniformMatrix4fv(uLoc("u_projectionMatrix"), false, flatten(projMatrix));
    gl.uniformMatrix4fv(uLoc("u_modelViewMatrix"), false, flatten(mvMatrix));

    // 3. Dibujar
    // Usamos drawArrays porque POINTS no necesita índices complejos para optimización simple aquí
    gl.drawArrays(gl.POINTS, 0, numParticles);

    requestAnimationFrame(render);
}

// Ajuste de ventana
window.onresize = () => {
    const c = document.getElementById("gl-canvas");
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    gl.viewport(0, 0, c.width, c.height);
};

// ============================================================================
// PARCHE DE COMPATIBILIDAD (Si tu librería es vieja)
// ============================================================================
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