const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

// --- UI Handlers ---
document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});
document.getElementById('method').addEventListener('change', e => {
    document.getElementById('softSettings').style.display = e.target.value === 'soft' ? 'grid' : 'none';
});
document.getElementById('vSupp').addEventListener('input', e => {
    document.getElementById('vDisp').innerText = e.target.value;
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // 1. Inputs
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const RPM = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const J_total = (parseFloat(document.getElementById('jMotor').value) || 0) + (parseFloat(document.getElementById('jLoad').value) || 0);
    const vFact = parseFloat(document.getElementById('vSupp').value) / 100;
    const limitA2s = parseFloat(document.getElementById('thermalLimit').value) || 1;

    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 600) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 220) / 100;
    
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const s_nom = (1500 - RPM) / 1500;
    const sb = 0.22; 

    let labels = [], motorT = [], loadT = [], currentI = [], voltageV = [];
    let totalTime = 0, totalA2s = 0, isStalled = false;
    const steps = 100;

    // 2. Physics & Current Model
    for (let i = 0; i <= steps; i++) {
        let n = i / steps; 
        let s = Math.max(s_nom, 1 - n);
        labels.push(Math.round(n * 100));

        // Soft Starter / Voltage Logic
        let v_applied = vFact;
        if (document.getElementById('method').value === 'soft') {
            const iInit = parseFloat(document.getElementById('softInit').value) / 100;
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            
            // Calculate voltage required to maintain limit
            let v_min = iInit / LRC;
            let v_max = iLimit / LRC;
            let v_ramp = v_min + (totalTime / Math.max(0.1, rampT)) * (v_max - v_min);
            v_applied = Math.min(vFact, v_ramp);
        }
        voltageV.push((v_applied * 100).toFixed(0));

        // Torque (Kloss with Smoothing)
        let k_denom = (s / sb) + (sb / s);
        let Tm_pu = (2 * BDT) / k_denom;
        // Ease the edge at LRT
        if (n < 0.2) Tm_pu = LRT + (Tm_pu - LRT) * Math.sin((n/0.2) * (Math.PI/2));
        let Tm = Tm_pu * Math.pow(v_applied, 2);

        // Conservative Current Model (Linear Stage then Cliff)
        let Im_pu = LRC * v_applied;
        // Apply "Cliff" decay after 85% speed
        if (n > 0.85) {
            let decay = 1 / (1 + Math.pow((n - 0.85) / (1 - 0.85), 4) * 5);
            Im_pu = Math.max(loadDemand, Im_pu * decay);
        }
        if (n >= 0.99) Im_pu = loadDemand;

        motorT.push((Tm * 100).toFixed(1));
        
        let Tl_pu = (document.getElementById('loadCurve').value === 'quad') 
                    ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                    : loadOffset + (loadDemand - loadOffset);
        loadT.push((Tl_pu * 100).toFixed(1));
        
        currentI.push((Im_pu * 100).toFixed(0));

        // Integration
        if (i < steps && n < (1 - s_nom)) {
            let Ta_pu = Tm - Tl_pu;
            if (Ta_pu > 0.01) {
                let dOmega = (1/steps) * (RPM * 2 * Math.PI / 60);
                let dt = (J_total * dOmega) / (Ta_pu * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im_pu * Ir, 2) * dt;
            } else if (n < 0.95) {
                isStalled = true; break;
            }
        }
    }

    // 3. Results Output
    document.getElementById('resTime').innerText = isStalled ? "STALL DETECTED" : totalTime.toFixed(2) + "s";
    document.getElementById('resThermal').innerText = isStalled ? "--" : Math.round(totalA2s).toLocaleString();
    let capUsed = (totalA2s / limitA2s) * 100;
    document.getElementById('resCap').innerText = isStalled ? "--" : capUsed.toFixed(1) + "%";

    updateChart(labels, motorT, loadT, currentI, voltageV);
});

function updateChart(l, m, ld, c, v) {
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: l,
            datasets: [
                { label: 'Motor Torque (%)', data: m, borderColor: '#38bdf8', pointRadius: 0, tension: 0.3, yAxisID: 'y' },
                { label: 'Load Torque (%)', data: ld, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, tension: 0.3, yAxisID: 'y' },
                { label: 'Current (%)', data: c, borderColor: '#f59e0b', pointRadius: 0, tension: 0.3, yAxisID: 'y1' },
                { label: 'Voltage (%)', data: v, borderColor: '#10b981', borderDash: [2,2], pointRadius: 0, yAxisID: 'y' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Torque / Voltage (%)' }, min: 0, max: 300 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', grid: { drawOnChartArea: false }, min: 0, max: 800 }
            }
        }
    });
}
