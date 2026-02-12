const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

// UI Toggles
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
    const P = parseFloat(document.getElementById('pKw').value);
    const RPM = parseFloat(document.getElementById('rpm').value);
    const Ir = parseFloat(document.getElementById('iRated').value);
    const J = parseFloat(document.getElementById('jTotal').value);
    const vSys = parseFloat(document.getElementById('vSupp').value) / 100;
    
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 600) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 220) / 100;
    
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const s_rated = (1500 - RPM) / 1500;
    const sb = 0.20; // Breakdown slip

    let labels = [], motorT = [], loadT = [], currentI = [], voltageP = [];
    let time = 0; 
    let i2t_acc = 0; // Cumulative A^2s
    const steps = 100;

    for (let i = 0; i <= steps; i++) {
        let n = i / steps; // Normalized Speed
        let s = Math.max(0.0001, 1 - n); // Guard against zero slip
        labels.push(Math.round(n * 100));

        // Starter Logic (Soft Starter Ramp)
        let v_applied = vSys;
        if (document.getElementById('method').value === 'soft') {
            const iInit = parseFloat(document.getElementById('softInit').value) / 100;
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            
            // Calculate voltage required to stay at current limit
            let v_limit = iLimit / LRC;
            let v_ramp = (iInit / LRC) + (time / Math.max(0.1, rampT)) * (v_limit - (iInit/LRC));
            v_applied = Math.min(vSys, v_ramp);
        }
        voltageP.push((v_applied * 100).toFixed(0));

        // Torque Calculation (Kloss with Singularity Guard)
        let klossT = (2 * BDT) / ( (s/sb) + (sb/s) );
        // Smooth transition at start
        let Tm_pu = (n < 0.1) ? (LRT + (klossT - LRT) * (n/0.1)) : klossT;
        let Tm = Tm_pu * Math.pow(v_applied, 2);

        // Current Calculation (Impedance-based)
        // Stays high until n > 0.85, then crashes
        let Im_pu = LRC * v_applied * (1 / Math.pow(1 + Math.pow(n/0.92, 14), 0.5));
        if (n >= 0.99) Im_pu = (loadDemand * (v_applied/vSys)); // Transition to load current

        motorT.push((Tm * 100).toFixed(1));
        
        // Load Torque Calculation
        let Tl_pu = (document.getElementById('loadCurve').value === 'quad')
                    ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                    : loadOffset + (loadDemand - loadOffset);
        loadT.push((Tl_pu * 100).toFixed(1));
        
        currentI.push((Im_pu * 100).toFixed(0));

        // Integration (Stop if stalled or reached rated slip)
        if (i < steps && n < (1 - s_rated)) {
            let Ta = (Tm - Tl_pu) * Trated; // Accelerating Torque in Nm
            if (Ta > 0.1) {
                let deltaOmega = (1/steps) * (RPM * 2 * Math.PI / 60);
                let dt = (J * deltaOmega) / Ta;
                
                // Limit max dt to prevent infinite loops in stall conditions
                dt = Math.min(dt, 0.5); 
                time += dt;
                i2t_acc += Math.pow(Im_pu * Ir, 2) * dt;
            } else if (n < 0.95) {
                time = Infinity;
                break;
            }
        }
    }

    // Results Display with formatted I2t
    document.getElementById('resTime').innerText = (time === Infinity) ? "STALLED" : time.toFixed(2) + "s";
    
    // Formatting A^2s for readability (Scientific notation if large)
    let formattedI2t = i2t_acc > 100000 ? i2t_acc.toExponential(2) : Math.round(i2t_acc).toLocaleString();
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
                y: { title: { display: true, text: 'Torque / Voltage (%)' }, min: 0, max: 350 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', grid: { drawOnChartArea: false }, min: 0, max: 800 }
            },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
            }
        }
    });
}
