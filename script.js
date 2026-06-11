let scene, camera, renderer, controls;
let waveSurface, waveWireframe, waveGeometry;
let fieldVectorGroup;
let electricFieldArrows = [];
let magneticFieldArrows = [];
let propagationArrows = [];
let interactiveVectorObjects = [];
let gridSize = 96;
let amplitude = 0.8;
let frequency = 1.5;
let wavelength = 4.0;
let formulaSource = "A*cos(k*x - w*t)";
let compiledFormula;

let isMoving = true;
let accumulatedTime = 0;
let lastTimePoint = Date.now();
let raycaster, mouse;
let tooltipElement;

let colorPositive = new THREE.Color(0xff2200);
let colorNegative = new THREE.Color(0x0044ff);
let colorNeutral = new THREE.Color(0x00ffff);
let saturation = 1.0;
let opacityLevel = 1.0;

const defaultColors = {
    positive: new THREE.Color(0xff2200),
    negative: new THREE.Color(0x0044ff),
    neutral: new THREE.Color(0x00ffff)
};

const tempPositiveColor = new THREE.Color();
const tempNegativeColor = new THREE.Color();
const tempNeutralColor = new THREE.Color();
const tempLerpColor = new THREE.Color();
const axisColors = {
    x: 0xffb84d,
    y: 0x30f2e9,
    z: 0xff4fd8
};
const vectorSamples = 17;
const vectorSpan = 18;
const vectorScale = 1.65;
const magneticScale = 1.0;
const minVectorLength = 0.04;
const yAxis = new THREE.Vector3(0, 1, 0);
const yAxisNegative = new THREE.Vector3(0, -1, 0);
const zAxis = new THREE.Vector3(0, 0, 1);
const zAxisNegative = new THREE.Vector3(0, 0, -1);
const allowedFormulaNames = new Set([
    "x", "z", "t", "A", "k", "w", "lambda", "PI", "E",
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
    "sqrt", "abs", "pow", "exp", "log", "min", "max", "floor", "ceil", "round"
]);

function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030308);
    scene.fog = new THREE.Fog(0x030308, 100, 200);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 12, 15);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 20, 20);
    scene.add(directionalLight);

    const gridHelper = new THREE.GridHelper(20, 20, 0x00ffcc, 0x002233);
    gridHelper.position.y = -5;
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(10);
    scene.add(axesHelper);

    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.25;
    raycaster.params.Line.threshold = 0.18;
    mouse = new THREE.Vector2(-1000, -1000);
    tooltipElement = document.getElementById('waveTooltip');

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
}

function initControls() {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minDistance = 5;
    controls.maxDistance = 100;
}

function getWaveNumber() {
    return (2 * Math.PI) / wavelength;
}

function setCameraView(x, y, z) {
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
}

function getWaveValue(x, z, time) {
    const k = getWaveNumber();
    const t = time / 1000;
    const y = compiledFormula(x, z, t, amplitude, k, frequency, wavelength);
    return Number.isFinite(y) ? THREE.MathUtils.clamp(y, -12, 12) : 0;
}

function compileFormula(source) {
    const normalized = source.trim().replace(/\^/g, "**");
    if (!normalized || !/^[0-9A-Za-z_+\-*\/%().,\s]+$/.test(normalized)) {
        throw new Error("Usa solo numeros, variables, operadores y funciones permitidas.");
    }

    const names = normalized.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    const invalidName = names.find((name) => !allowedFormulaNames.has(name));
    if (invalidName) {
        throw new Error(`Nombre no permitido: ${invalidName}`);
    }

    const fn = new Function(
        "x", "z", "t", "A", "k", "w", "lambda",
        "PI", "E", "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
        "sqrt", "abs", "pow", "exp", "log", "min", "max", "floor", "ceil", "round",
        `"use strict"; return (${normalized});`
    );

    const wrapped = (x, z, t, A, k, w, lambda) => fn(
        x, z, t, A, k, w, lambda,
        Math.PI, Math.E, Math.sin, Math.cos, Math.tan, Math.asin, Math.acos, Math.atan, Math.atan2,
        Math.sqrt, Math.abs, Math.pow, Math.exp, Math.log, Math.min, Math.max, Math.floor, Math.ceil, Math.round
    );

    const testValue = wrapped(0, 0, 0, amplitude, getWaveNumber(), frequency, wavelength);
    if (!Number.isFinite(testValue)) {
        throw new Error("La formula debe producir un numero finito.");
    }

    return wrapped;
}

compiledFormula = compileFormula(formulaSource);

function createFieldVectors() {
    fieldVectorGroup = new THREE.Group();

    for (let i = 0; i < vectorSamples; i++) {
        const x = -vectorSpan / 2 + (i * vectorSpan) / (vectorSamples - 1);
        const origin = new THREE.Vector3(x, 0, 0);

        const electricArrow = new THREE.ArrowHelper(yAxis, origin, 1, axisColors.y, 0.28, 0.14);
        const magneticArrow = new THREE.ArrowHelper(zAxis, origin, 1, axisColors.z, 0.28, 0.14);
        tagArrow(electricArrow, "E", "Y", axisColors.y);
        tagArrow(magneticArrow, "B", "Z", axisColors.z);
        electricFieldArrows.push(electricArrow);
        magneticFieldArrows.push(magneticArrow);
        fieldVectorGroup.add(electricArrow);
        fieldVectorGroup.add(magneticArrow);

        if (i % 4 === 0) {
            const propagationOrigin = new THREE.Vector3(x - 0.45, -2.15, -2.15);
            const propagationArrow = new THREE.ArrowHelper(
                new THREE.Vector3(1, 0, 0),
                propagationOrigin,
                0.9,
                axisColors.x,
                0.22,
                0.12
            );
            tagArrow(propagationArrow, "k", "X", axisColors.x);
            propagationArrows.push(propagationArrow);
            fieldVectorGroup.add(propagationArrow);
        }
    }

    scene.add(fieldVectorGroup);
}

function tagArrow(arrow, field, axis, color) {
    arrow.userData = { field, axis, color, value: field === "k" ? 1 : 0 };
    arrow.line.userData = arrow.userData;
    arrow.cone.userData = arrow.userData;
    interactiveVectorObjects.push(arrow.line, arrow.cone);
}

function updateArrow(arrow, positiveDirection, negativeDirection, value, scale) {
    const length = Math.max(Math.abs(value) * scale, minVectorLength);
    const isVisible = Math.abs(value) > 0.015;
    arrow.setDirection(value >= 0 ? positiveDirection : negativeDirection);
    arrow.setLength(length, Math.min(0.34, length * 0.38), Math.min(0.18, length * 0.2));
    arrow.visible = isVisible;
    arrow.line.visible = isVisible;
    arrow.cone.visible = isVisible;
}

function updateFieldVectors(time) {
    electricFieldArrows.forEach((electricArrow, index) => {
        const x = electricArrow.position.x;
        const electricValue = getWaveValue(x, 0, time);
        const magneticValue = electricValue * magneticScale;
        electricArrow.userData.value = electricValue;
        magneticFieldArrows[index].userData.value = magneticValue;
        updateArrow(electricArrow, yAxis, yAxisNegative, electricValue, vectorScale);
        updateArrow(magneticFieldArrows[index], zAxis, zAxisNegative, magneticValue, vectorScale);
    });
}

function applySaturation(color, sat) {
    const hsl = {};
    color.getHSL(hsl);
    hsl.s = Math.min(1, hsl.s * sat);
    color.setHSL(hsl.h, hsl.s, hsl.l);
    return color;
}

function updateColorPreview() {
    const positiveInput = document.getElementById('positiveColorInput');
    const negativeInput = document.getElementById('negativeColorInput');
    document.getElementById('positiveColorPreview').style.backgroundColor = positiveInput.value;
    document.getElementById('negativeColorPreview').style.backgroundColor = negativeInput.value;
}

function createWaveGrid(N) {
    if (waveSurface) {
        scene.remove(waveSurface);
        if (waveWireframe) {
            scene.remove(waveWireframe);
            waveWireframe.material.dispose();
        }
        waveGeometry.dispose();
        waveSurface.material.dispose();
    }

    waveGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(N * N * 3);
    const colors = new Float32Array(N * N * 3);
    const indices = [];
    const spacing = 20 / (N - 1);
    let index = 0;

    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const x = (i - (N - 1) / 2) * spacing;
            const z = (j - (N - 1) / 2) * spacing;

            positions[index * 3] = x;
            positions[index * 3 + 1] = 0;
            positions[index * 3 + 2] = z;

            colors[index * 3] = 0;
            colors[index * 3 + 1] = 1;
            colors[index * 3 + 2] = 1;

            index++;
        }
    }

    for (let i = 0; i < N - 1; i++) {
        for (let j = 0; j < N - 1; j++) {
            const a = i * N + j;
            const b = (i + 1) * N + j;
            const c = i * N + j + 1;
            const d = (i + 1) * N + j + 1;
            indices.push(a, b, c, b, d, c);
        }
    }

    waveGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    waveGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    waveGeometry.setIndex(indices);
    waveGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 24);

    const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: opacityLevel < 1,
        opacity: opacityLevel,
        side: THREE.DoubleSide,
        depthWrite: opacityLevel >= 0.98
    });

    waveSurface = new THREE.Mesh(waveGeometry, material);
    scene.add(waveSurface);

    waveWireframe = new THREE.Mesh(
        waveGeometry,
        new THREE.MeshBasicMaterial({
            color: 0xdffcff,
            wireframe: true,
            transparent: true,
            opacity: 0.16,
            depthWrite: false
        })
    );
    scene.add(waveWireframe);
    gridSize = N;
}

function updateWave(time) {
    if (!waveGeometry) return;
    const positions = waveGeometry.attributes.position.array;
    const colors = waveGeometry.attributes.color.array;

    const N = gridSize;
    const spacing = 20 / (N - 1);

    tempPositiveColor.copy(colorPositive);
    tempNegativeColor.copy(colorNegative);
    tempNeutralColor.copy(colorNeutral);
    applySaturation(tempPositiveColor, saturation);
    applySaturation(tempNegativeColor, saturation);
    applySaturation(tempNeutralColor, saturation);

    let index = 0;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const x = (i - (N - 1) / 2) * spacing;
            const z = (j - (N - 1) / 2) * spacing;

            const y = getWaveValue(x, z, time);

            positions[index * 3] = x;
            positions[index * 3 + 1] = y;
            positions[index * 3 + 2] = z;

            const normalizedY = Math.max(-1, Math.min(1, y / amplitude));

            if (normalizedY > 0) {
                tempLerpColor.lerpColors(tempNeutralColor, tempPositiveColor, normalizedY);
            } else {
                tempLerpColor.lerpColors(tempNegativeColor, tempNeutralColor, normalizedY + 1);
            }

            colors[index * 3] = tempLerpColor.r;
            colors[index * 3 + 1] = tempLerpColor.g;
            colors[index * 3 + 2] = tempLerpColor.b;

            index++;
        }
    }

    waveGeometry.attributes.position.needsUpdate = true;
    waveGeometry.attributes.color.needsUpdate = true;

}

function checkMouseIntersection() {
    if (!waveSurface) return;

    raycaster.setFromCamera(mouse, camera);
    const vectorIntersects = raycaster.intersectObjects(interactiveVectorObjects, false);

    if (vectorIntersects.length > 0) {
        const data = vectorIntersects[0].object.userData;
        const vectorColor = `#${data.color.toString(16).padStart(6, "0")}`;
        const relation = data.field === "k"
            ? "Direccion de propagacion"
            : data.field === "E"
                ? "Campo electrico transversal"
                : "Campo magnetico transversal, normalizado en pantalla";

        tooltipElement.style.display = 'block';
        tooltipElement.innerHTML = `
            <strong style="color: ${vectorColor}">Vector ${data.field} sobre ${data.axis}</strong><br>
            ${relation}<br>
            Valor visual: ${data.value.toFixed(2)} u<br>
            E x B apunta a +X
        `;
        return;
    }

    const intersects = raycaster.intersectObject(waveSurface);

    if (intersects.length > 0) {
        const { x, z } = intersects[0].point;
        const y = getWaveValue(x, z, accumulatedTime);

        const ratio = y / amplitude;
        let zoneName = "Zona de Transición";
        let colorHex = "#00ffff";

        if (ratio > 0.88) {
            zoneName = "CRESTA (Máximo)";
            colorHex = "#ff2200";
        } else if (ratio < -0.88) {
            zoneName = "VALLE (Mínimo)";
            colorHex = "#0044ff";
        } else if (Math.abs(ratio) < 0.12) {
            zoneName = "NODO (Cero)";
            colorHex = "#00ffcc";
        }

        tooltipElement.style.display = 'block';
        tooltipElement.innerHTML = `
            <strong style="color: ${colorHex}">${zoneName}</strong><br>
            X (Propagación): ${x.toFixed(2)} m<br>
            E_y: ${y.toFixed(2)} u<br>
            B_z: ${(y * magneticScale).toFixed(2)} u<br>
            Z (Frente de Onda): ${z.toFixed(2)} m
        `;
    } else {
        tooltipElement.style.display = 'none';
    }
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    tooltipElement.style.left = (event.clientX + 15) + 'px';
    tooltipElement.style.top = (event.clientY + 15) + 'px';
}

function setupUI() {
    const formulaInput = document.getElementById('formulaInput');
    const formulaStatus = document.getElementById('formulaStatus');
    const formulaDisplay = document.getElementById('formulaDisplay');
    const amplitudeSlider = document.getElementById('amplitudeSlider');
    const frequencySlider = document.getElementById('frequencySlider');
    const wavelengthSlider = document.getElementById('wavelengthSlider');
    const resolutionSlider = document.getElementById('resolutionSlider');
    const resetBtn = document.getElementById('resetBtn');

    const wavePlayBtn = document.getElementById('wavePlayBtn');
    const wavePauseBtn = document.getElementById('wavePauseBtn');
    const camRotBtn = document.getElementById('camRotBtn');
    const camEstBtn = document.getElementById('camEstBtn');
    const topStatus = document.getElementById('statusLabel');
    const statusDot = document.getElementById('statusDot');
    const currentModeLabel = document.getElementById('currentModeLabel');

    const togglePanelBtn = document.getElementById('togglePanelBtn');
    const controlPanel = document.getElementById('controlPanel');

    formulaInput.addEventListener('input', (e) => {
        try {
            const nextFormula = e.target.value;
            const nextCompiledFormula = compileFormula(nextFormula);
            formulaSource = nextFormula;
            compiledFormula = nextCompiledFormula;
            formulaDisplay.textContent = `E_y(x,z,t) = ${formulaSource}, B_z = E_y/c (normalizado), k = 2pi/lambda`;
            formulaStatus.textContent = "Formula valida";
            formulaStatus.classList.remove('invalid');
        } catch (error) {
            formulaStatus.textContent = "Formula no valida";
            formulaStatus.classList.add('invalid');
        }
    });

    togglePanelBtn.addEventListener('click', () => {
        controlPanel.classList.toggle('retracted');
        if (controlPanel.classList.contains('retracted')) {
            togglePanelBtn.textContent = "Mostrar Panel";
        } else {
            togglePanelBtn.textContent = "Ocultar Panel";
        }
    });

    amplitudeSlider.addEventListener('input', (e) => {
        amplitude = parseFloat(e.target.value);
        document.getElementById('ampValue').textContent = amplitude.toFixed(1);
    });

    frequencySlider.addEventListener('input', (e) => {
        frequency = parseFloat(e.target.value);
        document.getElementById('freqValue').textContent = frequency.toFixed(1);
    });

    wavelengthSlider.addEventListener('input', (e) => {
        wavelength = parseFloat(e.target.value);
        document.getElementById('wavelengthValue').textContent = wavelength.toFixed(1) + ' m';
        document.getElementById('lambdaValue').textContent = wavelength.toFixed(1) + ' m';
        document.getElementById('kValue').textContent = getWaveNumber().toFixed(2) + " rad/m";
    });

    resolutionSlider.addEventListener('input', (e) => {
        const N = parseInt(e.target.value);
        document.getElementById('resValue').textContent = N;
        document.getElementById('pointsValue').textContent = (N * N).toLocaleString() + " vtx";
        createWaveGrid(N);
    });

    const positiveColorInput = document.getElementById('positiveColorInput');
    const negativeColorInput = document.getElementById('negativeColorInput');
    const saturationSlider = document.getElementById('saturationSlider');
    const opacitySlider = document.getElementById('opacitySlider');
    const resetColorsBtn = document.getElementById('resetColorsBtn');

    positiveColorInput.addEventListener('input', (e) => {
        colorPositive.setStyle(e.target.value);
        updateColorPreview();
    });

    negativeColorInput.addEventListener('input', (e) => {
        colorNegative.setStyle(e.target.value);
        updateColorPreview();
    });

    saturationSlider.addEventListener('input', (e) => {
        saturation = parseFloat(e.target.value) / 100;
        document.getElementById('saturationValue').textContent = e.target.value + '%';
    });

    opacitySlider.addEventListener('input', (e) => {
        opacityLevel = parseFloat(e.target.value) / 100;
        document.getElementById('opacityValue').textContent = e.target.value + '%';
        if (waveSurface && waveSurface.material) {
            waveSurface.material.transparent = opacityLevel < 1;
            waveSurface.material.opacity = opacityLevel;
            waveSurface.material.depthWrite = opacityLevel >= 0.98;
            waveSurface.material.needsUpdate = true;
        }
    });

    resetColorsBtn.addEventListener('click', () => {
        colorPositive.copy(defaultColors.positive);
        colorNegative.copy(defaultColors.negative);
        colorNeutral.copy(defaultColors.neutral);
        saturation = 1.0;
        opacityLevel = 1.0;

        positiveColorInput.value = '#ff2200';
        negativeColorInput.value = '#0044ff';
        saturationSlider.value = 100;
        opacitySlider.value = 100;

        document.getElementById('saturationValue').textContent = '100%';
        document.getElementById('opacityValue').textContent = '100%';
        updateColorPreview();

        if (waveSurface && waveSurface.material) {
            waveSurface.material.transparent = false;
            waveSurface.material.opacity = opacityLevel;
            waveSurface.material.depthWrite = true;
            waveSurface.material.needsUpdate = true;
        }

        document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    });

    const presets = {
        fire: { positive: '#ff0000', negative: '#0a1a4d', neutral: '#ff6600' },
        ocean: { positive: '#00bfff', negative: '#003d66', neutral: '#00ff99' },
        neon: { positive: '#ff00ff', negative: '#00ffff', neutral: '#ff00ff' },
        classic: { positive: '#ff2200', negative: '#0044ff', neutral: '#00ffff' }
    };

    Object.entries(presets).forEach(([key, colors]) => {
        document.getElementById(`preset${key.charAt(0).toUpperCase() + key.slice(1)}`).addEventListener('click', (event) => {
            positiveColorInput.value = colors.positive;
            negativeColorInput.value = colors.negative;
            colorPositive.setStyle(colors.positive);
            colorNegative.setStyle(colors.negative);
            colorNeutral.setStyle(colors.neutral);
            updateColorPreview();

            document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
        });
    });

    wavePlayBtn.addEventListener('click', () => {
        isMoving = true;
        wavePlayBtn.classList.add('active');
        wavePauseBtn.classList.remove('active');
        topStatus.textContent = "ONDA ACTIVA";
        statusDot.style.backgroundColor = "#00ffcc";
        statusDot.style.boxShadow = "0 0 8px #00ffcc";
        currentModeLabel.textContent = controls.autoRotate ? "ONDA + ROTACION" : "ONDA";
        currentModeLabel.style.color = "#00ffcc";
        lastTimePoint = Date.now();
    });

    wavePauseBtn.addEventListener('click', () => {
        isMoving = false;
        wavePauseBtn.classList.add('active');
        wavePlayBtn.classList.remove('active');
        topStatus.textContent = "ONDA PAUSADA";
        statusDot.style.backgroundColor = "#ffaa00";
        statusDot.style.boxShadow = "0 0 8px #ffaa00";
        currentModeLabel.textContent = controls.autoRotate ? "PAUSA + ROTACION" : "PAUSA";
        currentModeLabel.style.color = "#ffaa00";
    });

    camRotBtn.addEventListener('click', () => {
        controls.autoRotate = true;
        camRotBtn.classList.add('active');
        camEstBtn.classList.remove('active');
        currentModeLabel.textContent = isMoving ? "ONDA + ROTACION" : "PAUSA + ROTACION";
    });

    camEstBtn.addEventListener('click', () => {
        controls.autoRotate = false;
        camEstBtn.classList.add('active');
        camRotBtn.classList.remove('active');
        currentModeLabel.textContent = isMoving ? "ONDA" : "PAUSA";
    });

    document.getElementById('viewIsoBtn').addEventListener('click', () => setCameraView(15, 12, 15));
    document.getElementById('viewFrontBtn').addEventListener('click', () => setCameraView(0, 4, 24));
    document.getElementById('viewTopBtn').addEventListener('click', () => setCameraView(0, 28, 0.1));
    document.getElementById('viewSideBtn').addEventListener('click', () => setCameraView(24, 4, 0));

    resetBtn.addEventListener('click', () => {
        amplitude = 0.8;
        frequency = 1.5;
        wavelength = 4.0;
        formulaSource = "A*cos(k*x - w*t)";
        compiledFormula = compileFormula(formulaSource);
        gridSize = 96;
        opacityLevel = 1.0;
        isMoving = true;
        accumulatedTime = 0;
        controls.autoRotate = true;

        formulaInput.value = formulaSource;
        formulaStatus.textContent = "Formula valida";
        formulaStatus.classList.remove('invalid');
        formulaDisplay.textContent = `E_y(x,z,t) = ${formulaSource}, B_z = E_y/c (normalizado), k = 2pi/lambda`;
        amplitudeSlider.value = 0.8;
        frequencySlider.value = 1.5;
        wavelengthSlider.value = 4.0;
        resolutionSlider.value = 96;
        opacitySlider.value = 100;

        document.getElementById('ampValue').textContent = '0.8';
        document.getElementById('freqValue').textContent = '1.5';
        document.getElementById('wavelengthValue').textContent = '4.0 m';
        document.getElementById('lambdaValue').textContent = '4.0 m';
        document.getElementById('kValue').textContent = getWaveNumber().toFixed(2) + " rad/m";
        document.getElementById('resValue').textContent = '96';
        document.getElementById('pointsValue').textContent = '9,216 vtx';
        document.getElementById('opacityValue').textContent = '100%';

        wavePlayBtn.classList.add('active');
        wavePauseBtn.classList.remove('active');
        camRotBtn.classList.add('active');
        camEstBtn.classList.remove('active');
        topStatus.textContent = "ONDA ACTIVA";
        statusDot.style.backgroundColor = "#00ffcc";
        statusDot.style.boxShadow = "0 0 8px #00ffcc";
        currentModeLabel.textContent = "ONDA + ROTACION";
        currentModeLabel.style.color = "#00ffcc";

        createWaveGrid(96);
        setCameraView(15, 12, 15);
        lastTimePoint = Date.now();
    });

    document.getElementById('kValue').textContent = getWaveNumber().toFixed(2) + " rad/m";

    updateColorPreview();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    const now = Date.now();
    if (isMoving) {
        accumulatedTime += (now - lastTimePoint);
    }
    lastTimePoint = now;

    updateWave(accumulatedTime);
    updateFieldVectors(accumulatedTime);
    checkMouseIntersection();

    renderer.render(scene, camera);
}

function init() {
    initScene();
    initControls();
    createWaveGrid(gridSize);
    createFieldVectors();
    setupUI();

    lastTimePoint = Date.now();
    animate();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
