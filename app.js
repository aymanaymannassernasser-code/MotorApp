/* v8.1 Digital Twin Logic
   Ensures smooth Kloss integration and preserves all PDF/Control features.
*/

const initApp = () => {
    if (typeof Chart !== 'undefined' && window['chartjs-plugin-annotation']) {
        Chart.register(window['chartjs-plugin-annotation']);
        setupUI();
    } else {
        setTimeout(initApp, 100);
    }
};

let motorChart;

function setupUI() {
    document.getElementById('useManual').onchange = e => document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
    document.getElementById('useGridModel').onchange = e => {
        document.getElementById('gridActive').style.display = e.target.checked ? 'grid' : 'none';
        document.getElementById('gridStatic').style.display = e.target.checked ? 'none' : 'block';
    };
    document.getElementById('pdfBtn').onclick = () => {
        document.getElementById('printRef').innerText = `Reference: ${document.getElementById('projRef').value || 'System Analysis'} | ${new Date().toLocaleDateString()}`;
        window.print();
    };
    document.getElementById('calcBtn').onclick = runSimulation;
}

function runSimulation() {
    // 1. Inputs
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const rpm = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const stallTime = parseFloat(document.getElementById('stallTime').value) || 15;
    const J_total = (parseFloat(document.getElementById('jMotor').value) || 0) + (parseFloat(document.getElementById('jLoad').value) || 0);
    
    // 2. Voltage Drop Logic (The Toggle Mode)
    let initialVdrop;
    if (document.getElementById('useGridModel').checked) {
        const txKva = parseFloat(document.getElementById('txKva').value) || 1000;
        const txZ = parseFloat(document.getElementById('txZ').value) || 5;
        initialVdrop = (P / txKva) * (txZ / 100) * 1.5; // Physical proxy
    } else {
        initialVdrop = (parseFloat(document.getElementById('vDropStatic').value) || 0) / 100;
    }
    const vBase = 1.0 - initialVdrop;

    // 3. Motor Curve Setup
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 230) / 100;
    const loadDemand = (parseFloat(document.getElementById('loadDemand').value) || 0) / 100;
    const iLimit = (parseFloat(document.getElementById('softLimit').value) || 350) / 100;

    const sync = rpm > 1200 ? 1500 : 1000;
    const s_nom = (sync - rpm) / sync;
    const sb = s_nom * (BDT + Math.sqrt(BDT**2 - 1));

    let labels = [], motorT = [], loadT = [], currentI = [], voltageV = [];
    let time = 0, thermal = 0, stallIdx = null, opSpeed = 0;

    // 4. Numerical Integration
    for (let i = 0; i <= 100; i++) {
        let n = i / 100;
        let s = Math.max(0.0001, 1 - n);
        
        // Dynamic Voltage recovery
        let recFactor = (s > 0.05) ? 1.0 : (s / 0.05);
        let v_inst = 1.0 - (initialVdrop * recFactor);
        
        // Soft Start Limit
        if (document.getElementById('method').value === 'soft') {
            v_inst = Math.min(v_inst, iLimit / LRC);
        }

        // SMOOTH Torque (Hill-Cliff)
        let Tm = ((2 * BDT) / ((s/sb) + (sb/s))) * Math.pow(v_inst, 2);
        if (n < 0.15) { // Ensure LRT smooth blend
            let T_lrt = LRT * Math.pow(v_inst, 2);
            Tm = T_lrt + (Tm - T_lrt) * (n/0.15);
        }

        let Tl = (document.getElementById('loadCurve').value === 'quad') ? 0.2 + (loadDemand-0.2)*n**2 : loadDemand;
        
        let Im = LRC * v_inst;
        if (n > 0.95) Im = loadDemand + (Im - loadDemand) * ((1-n)/0.05);

        labels.push(i);
        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));
        voltageV.push((v_inst * 100).toFixed(1));

        let accT = Tm - Tl;
        if (accT > 0.005 && n < (1-s_nom)) {
            let dt = (J_total * (sync * 2 * Math.PI / 60 / 100)) / (accT * (P * 9550 / rpm));
            time += dt;
            thermal += Math.pow(Im * Ir, 2) * dt;
            opSpeed = n * sync;
        } else if (accT <= 0.005 && stallIdx === null && i > 5) {
            stallIdx = i;
        }
    }

    // 5. Results
    document.getElementById('resTime').innerText = stallIdx ? "STALLED" : time.toFixed(2) + "s";
    document.getElementById('resOpSpeed').innerText = stallIdx ? "0" : Math.round(opSpeed) + " RPM";
    document.getElementById('resVStart').innerText = (vBase * 100).toFixed(1) + "%";
    
    let thermUsed = (thermal / (Math.pow(LRC * Ir, 2) * stallTime)) * 100;
    document.getElementById('resCap').innerText = thermUsed.toFixed(1) + "%";
    document.getElementById('resCap').style.color = thermUsed > 100 ? "red" : "white";

    drawChart(labels, motorT, loadT, currentI, voltageV, stallIdx);
}

function drawChart(labels, mt, lt, ci, vv, stall) {
    const ctx = document.getElementById('masterChart').getContext('2d');
    if (motorChart) motorChart.destroy();
    motorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Torque %', data: mt, borderColor: '#38bdf8', pointRadius: 0 },
                { label: 'Load %', data: lt, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 },
                { label: 'Voltage %', data: vv, borderColor: '#10b981', pointRadius: 0 },
                { label: 'Current %', data: ci, borderColor: '#f59e0b', yAxisID: 'yI', pointRadius: 0 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { annotation: { annotations: stall ? { l1: { type: 'line', xMin: stall, xMax: stall, borderColor: 'red', borderWidth: 2 } } : {} } },
            scales: { y: { min: 0, max: 250 }, yI: { position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } } }
        }
    });
}

initApp();