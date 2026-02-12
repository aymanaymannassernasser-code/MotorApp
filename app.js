const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

// UI Control
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
    const J = parseFloat(document.getElementById('jTotal').value) || 1.5;
    const vSys = parseFloat(document.getElementById('vSupp').value) / 100;
    
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 600) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 220) / 100;
    
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const s_rated = (1500 - RPM) / 1500;
    const sb = 0.22; // Typical Breakdown Slip

    let labels = [], motorT = [], loadT = [], currentI = [], voltageP = [];
    let time = 0; 
    let i2t_acc = 0; 
    const steps = 60; // Slightly fewer steps for better stability

    // 2. The Physics Loop
    for (let i = 0; i <= steps; i++) {
        let n = i / steps; // Speed from 0 to 1.0
        
        // CRITICAL FIX: Clamp slip so it never reaches 0
        let s = Math.max(s_rated, 1 - n); 
        labels.push(Math.round(n * 100));

        // Starter Logic
        let v_applied = vSys;
        if (document.getElementById('method').value === 'soft') {
            const iInit = parseFloat(document.getElementById('softInit').value) / 100;
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            
            // Linear voltage ramp approximation
            let v_start = iInit / LRC;
            let v_max = iLimit / LRC;
            let v_ramp = v_start + (time / Math.max(0.1, rampT)) * (v_max - v_start);
            v_applied = Math.min(vSys, v_ramp);
        }
        voltageP.push((v_applied * 100).toFixed(0));

        // Torque Calculation (Optimized Kloss)
        // Guard against s=0 or sb=0
        let kloss_denom = (s / sb) + (sb / s);
        let klossT = (2 * BDT) / kloss_denom;
        
        // Interpolate LRT for better low-speed realism
        let Tm_pu = (n < 0.15) ? (LRT + (klossT - LRT) * (n/0.15)) : klossT;
        let Tm = Tm_pu * Math.pow(v_applied, 2);

        // Current Modeling (Hill & Cliff)
        // I = V / Z. Z increases exponentially as n -> 1.0
        let Im_pu = LRC * v_applied * (1 / Math.pow(1 + Math.pow(n/0.92, 12), 0.5));
        if (n >= 0.98) Im_pu = loadDemand; // Drops to steady state

        // Push to Arrays (Clamped to 400% to prevent visual spikes)
        motorT.push(Math.min(400, Tm * 100).toFixed(1));
        
        let Tl_pu = (document.getElementById('loadCurve').value === 'quad')
                    ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                    : loadOffset + (loadDemand - loadOffset);
        loadT.push((Tl_pu * 100).toFixed(1));
        
        currentI.push(Math.min(800, Im_pu * 100).toFixed(0));

        // 3. Integration Logic
        if (i < steps && n < (1 - s_rated)) {
            let Ta = (Tm - Tl_pu) * Trated; 
            if (Ta > 0.5) {
                let deltaOmega = (1/steps) * (RPM * 2 * Math.PI / 60);
                let dt = (J * deltaOmega) / Ta;
                time += dt;
                i2t_acc += Math.pow(Im_pu * Ir, 2) * dt;
            } else if (n < 0.9) {
                time = Infinity; 
                break;
            }
        }
    }

    // 4. Update UI Results
    document.getElementById('resTime').innerText = (time === Infinity) ? "STALLED" : time.toFixed(2) + "s";
    
    // Accurate A2s display
    let formattedI2t = i2t_acc.toExponential(2);
    document.getElementById('resThermal').innerText = (time === Infinity) ? "--" : formattedI2t + " A²s";

    renderChart(labels, motorT, loadT, currentI, voltageP);
});

function renderChart(l, m, ld, c, v) {
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: l,
            datasets: [
                { label: 'Motor Torque (%)', data: m, borderColor: '#38bdf8', pointRadius: 0, tension: 0.1, yAxisID: 'y' },
                { label: 'Load Torque (%)', data: ld, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, yAxisID: 'y' },
                { label: 'Voltage (%)', data: v, borderColor: '#10b981', borderDash: [2,2], pointRadius: 0, yAxisID: 'y' },
                { label: 'Current (%)', data: c, borderColor: '#f59e0b', pointRadius: 0, tension: 0.1, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    title: { display: true, text: 'Torque / Voltage (%)' }, 
                    min: 0, 
                    max: 300, // Fixed scale prevents "infinity" spikes from ruining view
                    ticks: { stepSize: 50 }
                },
                y1: { 
                    title: { display: true, text: 'Current (%)' }, 
                    position: 'right', 
                    grid: { drawOnChartArea: false }, 
                    min: 0, 
                    max: 800 
                }
            }
        }
    });
}
