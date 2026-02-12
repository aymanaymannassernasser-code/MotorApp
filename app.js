const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

// UI Toggle Logic
document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});
document.getElementById('method').addEventListener('change', e => {
    document.getElementById('softSettings').style.display = e.target.value === 'soft' ? 'grid' : 'none';
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // 1. Inputs with strict fallbacks to prevent NaN errors
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const RPM = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const hotStallTime = parseFloat(document.getElementById('stallTime').value) || 15;
    const J_tot = (parseFloat(document.getElementById('jMotor').value) || 0) + (parseFloat(document.getElementById('jLoad').value) || 0.5);
    const vNet = (parseFloat(document.getElementById('vSuppVal').value) || 100) / 100;

    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) || 160 : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) || 650 : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) || 230 : 230) / 100;
    
    // Thermal Limit Baseline
    const limitA2s = Math.pow(LRC * Ir, 2) * hotStallTime;

    const loadDemand = (parseFloat(document.getElementById('loadDemand').value) || 95) / 100;
    const loadOffset = (parseFloat(document.getElementById('loadOffset').value) || 20) / 100;
    
    const Trated = (P * 9550) / RPM;
    const s_nom = (1500 - RPM) / 1500;
    const sb = 0.22; // Breakdown slip constant

    let labels = [], motorT = [], loadT = [], currentI = [], voltageV = [];
    let dolT_shadow = [], dolI_shadow = []; 
    let totalTime = 0, totalA2s = 0, stalledAt = null;

    // Simulation Loop (0% to 100% Speed)
    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let s = Math.max(s_nom, 1 - n);
        labels.push(i);

        // 2. DOL Shadow (Always calculated for comparison)
        let Tm_dol = ((2 * BDT) / ((s / sb) + (sb / s))) * Math.pow(vNet, 2);
        let Im_dol = (LRC * vNet);
        if (n > 0.85) {
            let decay = 1 / (1 + Math.pow((n - 0.85) / 0.15, 4) * 5);
            Im_dol = Math.max(loadDemand, Im_dol * decay);
        }
        dolT_shadow.push((Tm_dol * 100).toFixed(1));
        dolI_shadow.push((Im_dol * 100).toFixed(0));

        // 3. Active Voltage Calculation
        let v_applied = vNet;
        if (document.getElementById('method').value === 'soft') {
            const iInit = (parseFloat(document.getElementById('softInit').value) || 200) / 100;
            const iLimit = (parseFloat(document.getElementById('softLimit').value) || 350) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value) || 5;
            
            // Linear Current Ramp over Time
            let i_target = iInit + (totalTime / Math.max(0.1, rampT)) * (iLimit - iInit);
            i_target = Math.min(i_target, iLimit); 
            v_applied = Math.min(vNet, i_target / LRC);
        }
        voltageV.push((v_applied * 100).toFixed(0));

        // 4. Active Torque Calculation
        let Tm = ((2 * BDT) / ((s / sb) + (sb / s))) * Math.pow(v_applied, 2);
        if (n < 0.15) { // Breakaway smoothing
            let startT = LRT * Math.pow(v_applied, 2);
            Tm = startT + (Tm - startT) * Math.sin((n/0.15) * (Math.PI/2));
        }

        // 5. Active Current Calculation
        let Im = (LRC * v_applied);
        if (n > 0.85) { // Post-breakdown current collapse
            let decay = 1 / (1 + Math.pow((n - 0.85) / 0.15, 4) * 5);
            Im = Math.max(loadDemand, Im * decay);
        }
        if (n >= 0.99) Im = loadDemand;

        // 6. Load Torque (Quadratic vs Constant)
        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        // 7. Time Integration (Physics Engine)
        if (i < 100 && n < (1 - s_nom)) {
            let Ta_pu = Tm - Tl; // Accelerating torque in per-unit
            if (Ta_pu > 0.005 && !stalledAt) {
                // dt = J * dw / T
                let dt = (J_tot * (RPM * 2 * Math.PI / 60 / 100)) / (Math.max(0.001, Ta_pu) * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im * Ir, 2) * dt;
            } else if (!stalledAt && n < 0.90) {
                stalledAt = i; // Mark stall point
            }
        }
    }

    // Update Result Cards
    document.getElementById('resTime').innerText = stalledAt ? "STALL" : totalTime.toFixed(2) + "s";
    document.getElementById('resThermal').innerText = Math.round(totalA2s).toLocaleString();
    let capUsed = (totalA2s / limitA2s) * 100;
    document.getElementById('resCap').innerText = capUsed.toFixed(1) + "%";
    document.getElementById('resCap').style.color = capUsed > 100 ? "#f43f5e" : "#fff";

    // 8. Chart Rendering
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Active Torque (%)', data: motorT, borderColor: '#38bdf8', borderWidth: 3, pointRadius: 0, tension: 0.2 },
                { label: 'DOL Torque (Ref)', data: dolT_shadow, borderColor: '#38bdf8', borderDash: [5,5], borderWidth: 1, pointRadius: 0 },
                { label: 'Load Curve', data: loadT, borderColor: '#f43f5e', borderDash: [2,2], pointRadius: 0 },
                { label: 'Active Current (%)', data: currentI, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, pointRadius: 0, yAxisID: 'y1' },
                { label: 'DOL Current (Ref)', data: dolI_shadow, borderColor: '#f59e0b', borderDash: [5,5], borderWidth: 1, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed (%)' } },
                y: { title: { display: true, text: 'Torque (%)' }, min: 0, max: 300 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } }
            }
        }
    });
});
