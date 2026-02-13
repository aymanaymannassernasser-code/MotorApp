/* v8.2 Integrated Digital Twin Logic 
   Preserves: Hill/Cliff Torque, DOL Ref, Advanced Soft Start, Dynamic V-Drop
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
    document.getElementById('method').onchange = e => document.getElementById('softFields').style.display = (e.target.value === 'soft') ? 'grid' : 'none';
    
    document.getElementById('pdfBtn').onclick = () => {
        document.getElementById('printRef').innerText = `Ref: ${document.getElementById('projRef').value || 'System Analysis'} | ${new Date().toLocaleString()}`;
        window.print();
    };
    document.getElementById('calcBtn').onclick = runSimulation;
}

function runSimulation() {
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const rpm = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const stallTime = parseFloat(document.getElementById('stallTime').value) || 15;
    const J = parseFloat(document.getElementById('jTotal').value) || 1.65;
    
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 230) / 100;
    const loadD = parseFloat(document.getElementById('loadDemand').value) / 100;
    
    const sync = rpm > 1200 ? 1500 : 1000;
    const s_nom = (sync - rpm) / sync;
    const sb = s_nom * (BDT + Math.sqrt(BDT**2 - 1));

    // Grid Drop
    let initialVdrop;
    if (document.getElementById('useGridModel').checked) {
        initialVdrop = (P / parseFloat(document.getElementById('txKva').value)) * (parseFloat(document.getElementById('txZ').value)/100) * 1.5;
    } else {
        initialVdrop = parseFloat(document.getElementById('vDropStatic').value) / 100;
    }
    const vBase = 1.0 - initialVdrop;

    let labels = [], motorT = [], dolT = [], loadT = [], currentI = [], voltageV = [];
    let time = 0, thermal = 0, stallIdx = null, opRPM = 0;

    for (let i = 0; i <= 100; i++) {
        let n = i / 100;
        let s = Math.max(0.0001, 1 - n);
        
        // DOL Ref Model (Dotted Line)
        let v_dol = vBase; 
        let T_dol = ((2 * BDT) / ((s/sb) + (sb/s))) * Math.pow(v_dol, 2);
        if (n < 0.2) T_dol = (LRT * Math.pow(v_dol, 2)) + (T_dol - (LRT * Math.pow(v_dol, 2))) * (n/0.2);

        // Active Control Model (Soft Start vs DOL)
        let v_inst = vBase;
        if (document.getElementById('method').value === 'soft') {
            const initV = parseFloat(document.getElementById('softInitV').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            const limI = parseFloat(document.getElementById('softLimit').value) / 100;
            
            // Time-based ramp simulation (approximated over speed steps)
            let v_ramp = initV + (1.0 - initV) * (n); 
            v_inst = Math.min(vBase, v_ramp, limI / LRC);
        }

        // Modified Kloss with smooth starting blend
        let Tm = ((2 * BDT) / ((s/sb) + (sb/s))) * Math.pow(v_inst, 2);
        if (n < 0.2) {
            let T_start = LRT * Math.pow(v_inst, 2);
            Tm = T_start + (Tm - T_start) * Math.pow(n/0.2, 1.2); // S-Curve blend
        }

        let Tl = 0.2 + (loadD - 0.2) * n**2;
        let Im = LRC * v_inst;
        if (n > 0.95) Im = loadD + (Im - loadD) * ((1-n)/0.05);

        labels.push(i);
        motorT.push((Tm * 100).toFixed(1));
        dolT.push((T_dol * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));
        voltageV.push((v_inst * 100).toFixed(1));

        // Physics Integration
        let accT = Tm - Tl;
        if (accT > 0.005 && n < (1-s_nom)) {
            let dt = (J * (sync * 2 * Math.PI / 60 / 100)) / (accT * (P * 9550 / rpm));
            time += dt;
            thermal += Math.pow(Im * Ir, 2) * dt;
            opRPM = n * sync;
        } else if (accT <= 0.005 && stallIdx === null && i > 5) {
            stallIdx = i;
        }
    }

    // Update UI
    document.getElementById('resTime').innerText = stallIdx ? "STALL" : time.toFixed(2) + "s";
    document.getElementById('resOpSpeed').innerText = stallIdx ? "0" : Math.round(opRPM) + " RPM";
    document.getElementById('resVStart').innerText = (vBase * 100).toFixed(1) + "%";
    let thermUsed = (thermal / (Math.pow(LRC * Ir, 2) * stallTime)) * 100;
    document.getElementById('resCap').innerText = thermUsed.toFixed(1) + "%";
    document.getElementById('resCap').style.color = thermUsed > 100 ? "red" : "white";

    drawChart(labels, motorT, dolT, loadT, currentI, voltageV, stallIdx);
}

function drawChart(labels, mt, dt, lt, ci, vv, stall) {
    const ctx = document.getElementById('masterChart').getContext('2d');
    if (motorChart) motorChart.destroy();
    motorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Control Torque %', data: mt, borderColor: '#38bdf8', borderWidth: 3, pointRadius: 0 },
                { label: 'DOL Torque % (Ref)', data: dt, borderColor: '#38bdf8', borderDash: [5,5], borderWidth: 1, pointRadius: 0 },
                { label: 'Load %', data: lt, borderColor: '#f43f5e', borderDash: [3,3], pointRadius: 0 },
                { label: 'Current %', data: ci, borderColor: '#f59e0b', yAxisID: 'yI', pointRadius: 0 },
                { label: 'Voltage %', data: vv, borderColor: '#10b981', pointRadius: 0, hidden: true }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { annotation: { annotations: stall ? { l1: { type: 'line', xMin: stall, xMax: stall, borderColor: 'red', borderWidth: 2, label: { display: true, content: 'STALL' } } } : {} } },
            scales: { y: { min: 0, max: 300, title: { display: true, text: 'Torque / Voltage %' } }, yI: { position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false }, title: { display: true, text: 'Current %' } } }
        }
    });
}

initApp();