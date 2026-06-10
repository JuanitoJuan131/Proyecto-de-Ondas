let scene, camera, renderer, controls;
let wavePoints, waveGeometry, waveLinesGeometry, waveLinesObject, waveSurfaceObject;
let gridSize = 50;
let amplitude = 0.8;
let frequency = 1.5;
let wavelength = 4.0;
let visualizationMode = 'smooth'; // 'points', 'smooth', 'surface3d'

let isMoving = true;
let accumulatedTime = 0;
let lastTimePoint = Date.now();
let raycaster, mouse;
let tooltipElement;

const colorRed = new THREE.Color(0xff2200);
const colorBlue = new THREE.Color(0x0044ff);
const colorCyan = new THREE.Color(0x00ffff);

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

function createWaveGrid(N) {
    if (wavePoints) scene.remove(wavePoints);
    if (waveLinesObject) scene.remove(waveLinesObject);
    if (waveSurfaceObject) scene.remove(waveSurfaceObject);
    if (waveGeometry) waveGeometry.dispose();
    if (waveLinesGeometry) waveLinesGeometry.dispose();

    gridSize = N;

    if (visualizationMode === 'points') {
        createWaveGridPoints(N);
    } else if (visualizationMode === 'smooth') {
        createWaveGridLines(N);
    } else if (visualizationMode === 'surface3d') {
        createWaveGridSurface3D(N);
    }
}

function createWaveGridPoints(N) {
    waveGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(N * N * 3);
    const colors = new Float32Array(N * N * 3);
    const spacing = 20 / N;
    let index = 0;

    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const x = (i - N / 2) * spacing;
            const z = (j - N / 2) * spacing;
            positions[index * 3] = x;
            positions[index * 3 + 1] = 0;
            positions[index * 3 + 2] = z;
            colors[index * 3] = 0;
            colors[index * 3 + 1] = 1;
            colors[index * 3 + 2] = 1;
            index++;
        }
    }

    waveGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    waveGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pointSize = 25 / N;
    const material = new THREE.PointsMaterial({
        size: pointSize,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85
    });
    wavePoints = new THREE.Points(waveGeometry, material);
    scene.add(wavePoints);
}

function createWaveGridLines(N) {
    const positions = [];
    const colors = [];
    const spacing = 20 / N;

    // Líneas en dirección X (propagación)
    for (let j = 0; j < N; j++) {
        for (let i = 0; i < N - 1; i++) {
            const x1 = (i - N / 2) * spacing;
            const x2 = (i + 1 - N / 2) * spacing;
            const z = (j - N / 2) * spacing;

            positions.push(x1, 0, z, x2, 0, z);
            colors.push(0, 1, 1, 0, 1, 1);
        }
    }

    // Líneas en dirección Z (frentes de onda)
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N - 1; j++) {
            const x = (i - N / 2) * spacing;
            const z1 = (j - N / 2) * spacing;
            const z2 = (j + 1 - N / 2) * spacing;

            positions.push(x, 0, z1, x, 0, z2);
            colors.push(0, 1, 1, 0, 1, 1);
        }
    }

    waveLinesGeometry = new THREE.BufferGeometry();
    waveLinesGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    waveLinesGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

    const lineMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        linewidth: 1
    });

    waveLinesObject = new THREE.LineSegments(waveLinesGeometry, lineMaterial);
    scene.add(waveLinesObject);
}

function createWaveGridSurface3D(N) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const indices = [];
    const spacing = 20 / N;

    // Crear grid con amplitudes iniciales
    let vertexIndex = 0;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const x = (i - N / 2) * spacing;
            const z = (j - N / 2) * spacing;

            positions.push(x, 0, z);
            colors.push(0, 1, 1);
            vertexIndex++;
        }
    }

    // Crear índices para conectar vértices
    for (let i = 0; i < N - 1; i++) {
        for (let j = 0; j < N - 1; j++) {
            const a = i * N + j;
            const b = a + N;
            const c = a + 1;
            const d = b + 1;

            indices.push(a, c, b);
            indices.push(c, d, b);
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        wireframe: false,
        flatShading: false
    });

    waveSurfaceObject = new THREE.Mesh(geometry, material);
    scene.add(waveSurfaceObject);
}

function updateWave(time) {
    if (visualizationMode === 'points' && !waveGeometry) return;
    if (visualizationMode === 'smooth' && !waveLinesGeometry) return;
    if (visualizationMode === 'surface3d' && !waveSurfaceObject) return;

    const N = gridSize;
    const spacing = 20 / N;
    const k = (2 * Math.PI) / wavelength;
    const t = time / 1000;

    if (visualizationMode === 'points') {
        updateWavePoints(N, spacing, k, t);
    } else if (visualizationMode === 'smooth') {
        updateWaveLines(N, spacing, k, t);
    } else if (visualizationMode === 'surface3d') {
        updateWaveSurface3D(N, spacing, k, t);
    }
}

function updateWavePoints(N, spacing, k, t) {
    const positions = waveGeometry.attributes.position.array;
    const colors = waveGeometry.attributes.color.array;
    let index = 0;

    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const x = (i - N / 2) * spacing;
            const z = (j - N / 2) * spacing;
            const y = amplitude * Math.cos(k * x - frequency * t);

            positions[index * 3] = x;
            positions[index * 3 + 1] = y;
            positions[index * 3 + 2] = z;

            const normalizedY = Math.max(-1, Math.min(1, y / amplitude));
            let lerpColor;
            if (normalizedY > 0) {
                lerpColor = new THREE.Color().lerpColors(colorCyan, colorRed, normalizedY);
            } else {
                lerpColor = new THREE.Color().lerpColors(colorBlue, colorCyan, normalizedY + 1);
            }

            colors[index * 3] = lerpColor.r;
            colors[index * 3 + 1] = lerpColor.g;
            colors[index * 3 + 2] = lerpColor.b;
            index++;
        }
    }
    waveGeometry.attributes.position.needsUpdate = true;
    waveGeometry.attributes.color.needsUpdate = true;
}

function updateWaveLines(N, spacing, k, t) {
    if (!waveLinesGeometry) return;

    const positions = [];
    const colors = [];
    const colorMap = new Map();

    const getColor = (y) => {
        const normalizedY = Math.max(-1, Math.min(1, y / amplitude));
        let color;
        if (normalizedY > 0) {
            color = new THREE.Color().lerpColors(colorCyan, colorRed, normalizedY);
        } else {
            color = new THREE.Color().lerpColors(colorBlue, colorCyan, normalizedY + 1);
        }
        return color;
    };

    // Líneas en dirección X con amplitud actualizada
    for (let j = 0; j < N; j++) {
        for (let i = 0; i < N - 1; i++) {
            const x1 = (i - N / 2) * spacing;
            const x2 = (i + 1 - N / 2) * spacing;
            const z = (j - N / 2) * spacing;
            const y1 = amplitude * Math.cos(k * x1 - frequency * t);
            const y2 = amplitude * Math.cos(k * x2 - frequency * t);

            positions.push(x1, y1, z, x2, y2, z);

            const col1 = getColor(y1);
            const col2 = getColor(y2);
            colors.push(col1.r, col1.g, col1.b, col2.r, col2.g, col2.b);
        }
    }

    // Líneas en dirección Z
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N - 1; j++) {
            const x = (i - N / 2) * spacing;
            const z1 = (j - N / 2) * spacing;
            const z2 = (j + 1 - N / 2) * spacing;
            const y1 = amplitude * Math.cos(k * x - frequency * t);
            const y2 = amplitude * Math.cos(k * x - frequency * t);

            positions.push(x, y1, z1, x, y2, z2);

            const col1 = getColor(y1);
            const col2 = getColor(y2);
            colors.push(col1.r, col1.g, col1.b, col2.r, col2.g, col2.b);
        }
    }

    waveLinesGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    waveLinesGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    waveLinesGeometry.attributes.position.needsUpdate = true;
    waveLinesGeometry.attributes.color.needsUpdate = true;
}

function updateWaveSurface3D(N, spacing, k, t) {
    if (!waveSurfaceObject || !waveSurfaceObject.geometry) return;

    const positions = waveSurfaceObject.geometry.attributes.position.array;
    const colors = waveSurfaceObject.geometry.attributes.color.array;
    let index = 0;

    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const x = (i - N / 2) * spacing;
            const z = (j - N / 2) * spacing;
            const y = amplitude * Math.cos(k * x - frequency * t);

            positions[index * 3] = x;
            positions[index * 3 + 1] = y;
            positions[index * 3 + 2] = z;

            const normalizedY = Math.max(-1, Math.min(1, y / amplitude));
            let lerpColor;
            if (normalizedY > 0) {
                lerpColor = new THREE.Color().lerpColors(colorCyan, colorRed, normalizedY);
            } else {
                lerpColor = new THREE.Color().lerpColors(colorBlue, colorCyan, normalizedY + 1);
            }

            colors[index * 3] = lerpColor.r;
            colors[index * 3 + 1] = lerpColor.g;
            colors[index * 3 + 2] = lerpColor.b;
            index++;
        }
    }

    waveSurfaceObject.geometry.attributes.position.needsUpdate = true;
    waveSurfaceObject.geometry.attributes.color.needsUpdate = true;
}

function checkMouseIntersection() {
    if (visualizationMode === 'points' && !wavePoints) return;
    if ((visualizationMode === 'smooth' || visualizationMode === 'surface3d') && !waveGeometry) {
        // Para smooth y surface3d usamos geometries diferentes
        return;
    }

    if (visualizationMode !== 'points') {
        tooltipElement.style.display = 'none';
        return; // Por ahora solo soportamos hover para puntos
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(wavePoints);

    if (intersects.length > 0) {
        const pointIndex = intersects[0].index;
        const positions = waveGeometry.attributes.position.array;

        const x = positions[pointIndex * 3];
        const y = positions[pointIndex * 3 + 1];
        const z = positions[pointIndex * 3 + 2];

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
            Y (Amplitud): ${y.toFixed(2)} m<br>
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
    const amplitudeSlider = document.getElementById('amplitudeSlider');
    const frequencySlider = document.getElementById('frequencySlider');
    const resolutionSlider = document.getElementById('resolutionSlider');
    const resetBtn = document.getElementById('resetBtn');

    const camRotBtn = document.getElementById('camRotBtn');
    const camEstBtn = document.getElementById('camEstBtn');
    const topStatus = document.getElementById('statusLabel');
    const statusDot = document.getElementById('statusDot');
    const currentModeLabel = document.getElementById('currentModeLabel');

    const modePointsBtn = document.getElementById('modePointsBtn');
    const modeSmoothBtn = document.getElementById('modeSmoothBtn');
    const modeSurface3DBtn = document.getElementById('modeSurface3DBtn');

    const togglePanelBtn = document.getElementById('togglePanelBtn');
    const controlPanel = document.getElementById('controlPanel');

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

    resolutionSlider.addEventListener('input', (e) => {
        const N = parseInt(e.target.value);
        document.getElementById('resValue').textContent = N;
        document.getElementById('pointsValue').textContent = (N * N).toLocaleString() + " pts";
        createWaveGrid(N);
    });

    camRotBtn.addEventListener('click', () => {
        controls.autoRotate = true;
        isMoving = true;
        camRotBtn.classList.add('active');
        camEstBtn.classList.remove('active');
        topStatus.textContent = "ROTANDO";
        statusDot.style.backgroundColor = "#00ffcc";
        statusDot.style.boxShadow = "0 0 8px #00ffcc";
        currentModeLabel.textContent = "MOVIMIENTO";
        currentModeLabel.style.color = "#00ffcc";
        lastTimePoint = Date.now();
    });

    camEstBtn.addEventListener('click', () => {
        controls.autoRotate = false;
        isMoving = false;
        camEstBtn.classList.add('active');
        camRotBtn.classList.remove('active');
        topStatus.textContent = "ESTÁTICO / PAUSA";
        statusDot.style.backgroundColor = "#ffaa00";
        statusDot.style.boxShadow = "0 0 8px #ffaa00";
        currentModeLabel.textContent = "ESTÁTICO";
        currentModeLabel.style.color = "#ffaa00";
    });

    modePointsBtn.addEventListener('click', () => {
        visualizationMode = 'points';
        modePointsBtn.classList.add('active');
        modeSmoothBtn.classList.remove('active');
        modeSurface3DBtn.classList.remove('active');
        createWaveGrid(gridSize);
    });

    modeSmoothBtn.addEventListener('click', () => {
        visualizationMode = 'smooth';
        modeSmoothBtn.classList.add('active');
        modePointsBtn.classList.remove('active');
        modeSurface3DBtn.classList.remove('active');
        createWaveGrid(gridSize);
    });

    modeSurface3DBtn.addEventListener('click', () => {
        visualizationMode = 'surface3d';
        modeSurface3DBtn.classList.add('active');
        modePointsBtn.classList.remove('active');
        modeSmoothBtn.classList.remove('active');
        createWaveGrid(gridSize);
    });

    resetBtn.addEventListener('click', () => {
        amplitude = 0.8;
        frequency = 1.5;
        gridSize = 50;
        isMoving = true;
        accumulatedTime = 0;
        controls.autoRotate = true;

        amplitudeSlider.value = 0.8;
        frequencySlider.value = 1.5;
        resolutionSlider.value = 50;

        document.getElementById('ampValue').textContent = '0.8';
        document.getElementById('freqValue').textContent = '1.5';
        document.getElementById('resValue').textContent = '50';
        document.getElementById('pointsValue').textContent = '2,500 pts';

        camRotBtn.classList.add('active');
        camEstBtn.classList.remove('active');
        topStatus.textContent = "ROTANDO";
        statusDot.style.backgroundColor = "#00ffcc";
        currentModeLabel.textContent = "MOVIMIENTO";
        currentModeLabel.style.color = "#00ffcc";

        visualizationMode = 'smooth';
        modeSmoothBtn.classList.add('active');
        modePointsBtn.classList.remove('active');
        modeSurface3DBtn.classList.remove('active');

        createWaveGrid(50);
        lastTimePoint = Date.now();
    });

    const k = (2 * Math.PI) / wavelength;
    document.getElementById('kValue').textContent = k.toFixed(2) + " rad/m";
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
    checkMouseIntersection();

    renderer.render(scene, camera);
}

function init() {
    initScene();
    initControls();
    createWaveGrid(gridSize);
    setupUI();

    lastTimePoint = Date.now();
    animate();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
