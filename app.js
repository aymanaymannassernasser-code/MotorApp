const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

// Visibility Toggles
document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});
document.getElementById('method').addEventListener('change', e => {
    document.getElementById('softSettings').style.display = e.target.value === 'soft' ? 'grid' : 'none';
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // Inputs
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const RPM = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const J_tot = (parseFloat(document.getElementById('jMotor').value) || 0) + (parseFloat(document.getElementById('jLoad').value) || 0);
    const vNet = parseFloat(document.getElementById('vSuppVal').value) / 100;
    const limitA2s = parseFloat(document.getElementById('thermalLimit').value) || 1;

    // Motor Characteristics
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 230) / 100;
    
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const s_nom = (1500 - RPM) / 1500;
    const sb = 0.22; // Breakdown slip approximation

    let labels = [], motorT = [], loadT = [], currentI = [], voltageV = [];
    let totalTime = 0, totalA2s = 0, stalledAt = null;

    // Simulation Loop (0% to 100% Speed)
    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let s = Math.max(s_nom, 1 - n);
        labels.push(i);

        // Soft Starter Logic: Pedestal + Ramp + Limit
        let v_applied = vNet;
        if (document.getElementById('method').value === 'soft') {
            const iInit = parseFloat(document.getElementById('softInit').value) / 100;
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            
            let i_target = iInit + (totalTime / Math.max(0.1, rampT)) * (iLimit - iInit);
            i_target = Math.min(i_target, iLimit); 
            v_applied = Math.min(vNet, i_target / LRC);
        }
        voltageV.push((v_applied * 100).toFixed(0));

        // Torque (Kloss Equation with Voltage Scaling)
        let k_denom = (s / sb) + (sb / s);
        let Tm = ((2 * BDT) / k_denom) * Math.pow(v_applied, 2);
        
        // Smooth LRT Transition
        if (n < 0.15) {
            let startT = LRT * Math.pow(v_applied, 2);
            Tm = startT + (Tm - startT) * Math.sin((n/0.15) * (Math.PI/2));
        }

        // Current (Linear Impedance with High-Speed Decay)
        let Im = (LRC * v_applied);
        if (n > 0.85) {
            let decay = 1 / (1 + Math.pow((n - 0.85) / 0.15, 4) * 5);
            Im = Math.max(loadDemand, Im * decay);
        }
        if (n >= 0.99) Im = loadDemand;

        // Load Torque (Quadratic or Constant)
        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        // Integration (Time and Thermal)
        if (i < 100 && n < (1 - s_nom)) {
            let Ta_pu = Tm - Tl;
            if (Ta_pu > 0.001 && !stalledAt) {
                let dOmega = (RPM * 2 * 3.14159 / 60) / 100;
                let dt = (J_tot * dOmega) / (Ta_pu * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im * Ir, 2) * dt;
            } else if (!stalledAt && n < 0.90) {
                stalledAt = i; 
            }
        }
    }

    // Update UI Results
    const timeRes = document.getElementById('resTime');
    if (stalledAt !== null) {
        timeRes.innerText = "STALL";
        timeRes.style.color = "#f43f5e";
    } else {
        timeRes.innerText = totalTime.toFixed(2) + "s";
        timeRes.style.color = "#fff";
    }
    
    document.getElementById('resThermal').innerText = Math.round(totalA2s).toLocaleString();
    document.getElementById('resCap').innerText = ((totalA2s / limitA2s) * 100).toFixed(1) + "%";

    // Charting
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Torque (%)', data: motorT, borderColor: '#38bdf8', borderWidth: 2, pointRadius: 0, tension: 0.2 },
                { label: 'Load (%)', data: loadT, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0 },
                { label: 'Current (%)', data: currentI, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, pointRadius: 0, yAxisID: 'y1' },
                { label: 'Voltage (%)', data: voltageV, borderColor: '#10b981', borderDash: [2,2], pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed (%)' } },
                y: { title: { display: true, text: 'Torque/Voltage (%)' }, min: 0, max: 300 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } }
            }
        }
    });
});
