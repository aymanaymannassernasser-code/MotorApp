const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

// Dynamic UI
document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});
document.getElementById('method').addEventListener('change', e => {
    document.getElementById('softSettings').style.display = e.target.value === 'soft' ? 'grid' : 'none';
});
document.getElementById('vSupp').addEventListener('input', e => {
    document.getElementById('vDisp').innerText = e.target.value;
});

document.getElementById('printBtn').addEventListener('click', () => {
    document.getElementById('pdfProject').innerText = "Project: " + (document.getElementById('projRef').value || "Motor Simulation");
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // 1. Inputs & Defaults
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const RPM = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const J = parseFloat(document.getElementById('jTotal').value) || 1.5;
    const vNet = parseFloat(document.getElementById('vSupp').value) / 100;
    
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 600) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 220) / 100;
    
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const s_nom = (1500 - RPM) / 1500;
    const sb = 0.20; 

    let labels = [], motorT = [], loadT = [], currentI = [], voltageV = [];
    let totalTime = 0;
    let i2t_val = 0;
    const steps = 100;

    // 2. Simulation Loop (Speed-Step based for stability)
    for (let i = 0; i <= steps; i++) {
        let n = i / steps; 
        let s = Math.max(s_nom, 1 - n); // Clamp slip to nominal
        labels.push(Math.round(n * 100));

        // Starter Logic
        let v_applied = vNet;
        if (document.getElementById('method').value === 'soft') {
            const iInit = parseFloat(document.getElementById('softInit').value) / 100;
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            
            // Approximate voltage to maintain current limit
            let v_limit = iLimit / LRC;
            let v_ramp = (iInit/LRC) + (totalTime / Math.max(0.1, rampT)) * (v_limit - (iInit/LRC));
            v_applied = Math.min(vNet, v_ramp);
        }
        voltageV.push((v_applied * 100).toFixed(0));

        // Kloss Torque (Clamped Denominator)
        let k_denom = (s / sb) + (sb / s);
        let Tm_pu = (2 * BDT) / k_denom;
        // Blend for LRT at zero speed
        if (n < 0.2) Tm_pu = LRT + (Tm_pu - LRT) * (n/0.2);
        let Tm = Tm_pu * Math.pow(v_applied, 2);

        // Current (Hill & Cliff)
        let Im_pu = LRC * v_applied * (1 / Math.pow(1 + Math.pow(n/0.92, 12), 0.5));
        if (n >= 0.99) Im_pu = loadDemand;

        // Load Torque
        let Tl_pu = (document.getElementById('loadCurve').value === 'quad') 
                    ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                    : loadOffset + (loadDemand - loadOffset);

        // Recording Data (With Safety Clamps)
        motorT.push(Math.min(350, Tm * 100).toFixed(1));
        loadT.push((Tl_pu * 100).toFixed(1));
        currentI.push(Math.min(850, Im_pu * 100).toFixed(0));

        // Physics Integration (Calculate dt for each speed step)
        if (i < steps && n < (1 - s_nom)) {
            let Ta_pu = Tm - Tl_pu;
            if (Ta_pu > 0.02) {
                let dOmega = (1/steps) * (RPM * 2 * Math.PI / 60);
                let dt = (J * dOmega) / (Ta_pu * Trated);
                totalTime += dt;
                i2t_val += Math.pow(Im_pu * Ir, 2) * dt;
            } else if (n < 0.9) {
                totalTime = Infinity; break;
            }
        }
    }

    // Results Display
    document.getElementById('resTime').innerText = (totalTime === Infinity) ? "STALLED" : totalTime.toFixed(2) + "s";
    document.getElementById('resThermal').innerText = (totalTime === Infinity) ? "--" : i2t_val.toExponential(2) + " A²s";

    updateChart(labels, motorT, loadT, currentI, voltageV);
});

function updateChart(l, m, ld, c, v) {
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: l,
            datasets: [
                { label: 'Motor Torque (%)', data: m, borderColor: '#38bdf8', pointRadius: 0, yAxisID: 'y' },
                { label: 'Load Torque (%)', data: ld, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, yAxisID: 'y' },
                { label: 'Voltage (%)', data: v, borderColor: '#10b981', borderDash: [2,2], pointRadius: 0, yAxisID: 'y' },
                { label: 'Current (%)', data: c, borderColor: '#f59e0b', pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Torque / Voltage (%)' }, min: 0, max: 350 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', grid: { drawOnChartArea: false }, min: 0, max: 850 }
            }
        }
    });
}
