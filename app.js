/* v8.3 - Refined Physics Model 
   Features: Pull-up Torque Sag, Initial Current Ramp, Inertia Splitting
*/

const initApp = () => {
    if (typeof Chart !== 'undefined' && window['chartjs-plugin-annotation']) {
        Chart.register(window['chartjs-plugin-annotation']);
        setupUI();
    } else { setTimeout(initApp, 100); }
};

let motorChart;

function setupUI() {
    document.getElementById('useManual').onchange = e => document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
    document.getElementById('method').onchange = e => document.getElementById('softFields').style.display = (e.target.value === 'soft') ? 'grid' : 'none';
    document.getElementById('pdfBtn').onclick = () => window.print();
    document.getElementById('calcBtn').onclick = runSimulation;
}

function runSimulation() {
    const P = parseFloat(document.getElementById('pKw').value);
    const rpm = parseFloat(document.getElementById('rpm').value);
    const Ir = parseFloat(document.getElementById('iRated').value);
    const stallTime = parseFloat(document.getElementById('stallTime').value);
    const J_total = parseFloat(document.getElementById('jMotor').value) + parseFloat(document.getElementById('jLoad').value);
    
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 230) / 100;
    const loadD = parseFloat(document.getElementById('loadDemand').value) / 100;
    const vGrid = 1.0 - (parseFloat(document.getElementById('vDropStatic').value) / 100);

    const sync = rpm > 1200 ? 1500 : 1000;
    const s_nom = (sync - rpm) / sync;
    const sb = s_nom * (BDT + Math.sqrt(BDT**2 - 1));

    let labels = [], motorT = [], dolT = [], loadT = [], currentI = [], voltageV = [];
    let time = 0, thermal = 0, stallIdx = null, opRPM = 0, maxReqI = 0;

    for (let i = 0; i <= 100; i++) {
        let n = i / 100;
        let s = Math.max(0.0001, 1 - n);
        
        // --- THE MOTOR TORQUE MODEL (PULL-UP SAG) ---
        // Basic Kloss
        let Tm_base = ((2 * BDT) / ((s/sb) + (sb/s)));
        
        // Modelling the Sag: Resistance changes with frequency
        // This adds a dip around 20-40% speed
        let pullUpFactor = 1.0 - (0.15 * Math.exp(-Math.pow(n - 0.25, 2) / 0.02));
        let Tm_pure = Tm_base * pullUpFactor;

        // Smooth Start Blend (LRT to Sag transition)
        if (n < 0.2) {
            Tm_pure = LRT + (Tm_pure - LRT) * Math.sin((n/0.2) * (Math.PI/2));
        }

        // --- DOL Reference (Dotted) ---
        let T_dol = Tm_pure * Math.pow(vGrid, 2);

        // --- SOFT STARTER MODEL (CURRENT RAMP) ---
        let v_inst = vGrid;
        if (document.getElementById('method').value === 'soft') {
            const initI = parseFloat(document.getElementById('softInitI').value) / 100;
            const limI = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            
            // Current-based voltage control
            // During ramp, we try to maintain I_ramp. Once speed increases, voltage rises to maintain limit.
            let i_target = initI + (limI - initI) * n; 
            v_inst = Math.min(vGrid, i_target / LRC);
        }

        let Tm_active = Tm_pure * Math.pow(v_inst, 2);
        let Tl = 0.2 + (loadD - 0.2) * n**2;
        let Im = LRC * v_inst;

        // Min Starting Current Calculation: I needed where Tm_pure * v^2 > Tl
        let min_v_needed = Math.sqrt((Tl + 0.1) / Tm_pure);
        let min_i_at_point = min_v_needed * LRC;
        if (min_i_at_point > maxReqI) maxReqI = min_i_at_point;

        // Post-acceleration current drop
        if (n > 0.95) Im = loadD + (Im - loadD) * ((1-n)/0.05);

        labels.push(i);
        motorT.push((Tm_active * 100).toFixed(1));
        dolT.push((T_dol * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        // Physics
        let accT = Tm_active - Tl;
        if (accT > 0.005 && n < (1-s_nom)) {
            let dt = (J_total * (sync * 2 * Math.PI / 60 / 100)) / (accT * (P * 9550 / rpm));
            time += dt;
            thermal += Math.pow(Im * Ir, 2) * dt;
            opRPM = n * sync;
        } else if (accT <= 0.005 && stallIdx === null && i > 5) {
            stallIdx = i;
        }
    }

    document.getElementById('resTime').innerText = stallIdx ? "STALL" : time.toFixed(2) + "s";
    document.getElementById('resOpSpeed').innerText = stallIdx ? "0" : Math.round(opRPM) + " RPM";
    document.getElementById('resMinI').innerText = Math.round(maxReqI * 100) + "%";
    
    let thermCap = (thermal / (Math.pow(LRC * Ir, 2) * stallTime)) * 100;
    document.getElementById('resCap').innerText = thermCap.toFixed(1) + "%";

    drawChart(labels, motorT, dolT, loadT, currentI, stallIdx);
}

function drawChart(labels, mt, dt, lt, ci, stall) {
    const ctx = document.getElementById('masterChart').getContext('2d');
    if (motorChart) motorChart.destroy();
    motorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Active Torque %', data: mt, borderColor: '#38bdf8', borderWidth: 3, pointRadius: 0 },
                { label: 'DOL Torque %', data: dt, borderColor: '#38bdf8', borderDash: [5,5], borderWidth: 1, pointRadius: 0 },
                { label: 'Load %', data: lt, borderColor: '#f43f5e', borderDash: [2,2], pointRadius: 0 },
                { label: 'Current %', data: ci, borderColor: '#f59e0b', yAxisID: 'yI', pointRadius: 0 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { min: 0, max: 300 }, yI: { position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } } }
        }
    });
}
initApp();