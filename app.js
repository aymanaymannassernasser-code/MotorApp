const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

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
    const s_rated = Math.max(0.01, (1500 - RPM) / 1500);
    const sb = 0.22;

    let labels = [], motorT = [], loadT = [], currentI = [], voltageP = [];
    let time = 0; let i2t = 0;
    const steps = 100;

    for (let i = 0; i <= steps; i++) {
        let n = i / steps;
        let s = Math.max(s_rated, 1 - n);
        labels.push(Math.round(n * 100));

        // Starter Logic
        let v_applied = vSys;
        if (document.getElementById('method').value === 'soft') {
            const iInit = parseFloat(document.getElementById('softInit').value) / 100;
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            
            // Simplified Soft Start: Voltage ramped to meet current limit
            let v_ramp = (iInit / LRC) + (time / rampT) * ((iLimit - iInit) / LRC);
            v_applied = Math.min(vSys, v_ramp);
        }
        voltageP.push((v_applied * 100).toFixed(0));

        // Physics: Modified Kloss Torque
        let kloss = (2 * BDT) / ( (s/sb) + (sb/s) );
        let Tm_pu = (n < 0.15) ? LRT + (kloss - LRT) * (n/0.15) : kloss;
        let Tm = Tm_pu * Math.pow(v_applied, 2);

        // Current Logic: Sigmoid decay
        let Im_pu = LRC * v_applied * (1 / Math.pow(1 + Math.pow(n/0.9, 10), 0.5));
        if (n >= 0.98) Im_pu = loadDemand;

        motorT.push((Tm * 100).toFixed(1));
        loadT.push(((loadOffset + (loadDemand-loadOffset)*Math.pow(n,2)) * 100).toFixed(1));
        currentI.push((Im_pu * 100).toFixed(0));

        // Integration
        if (i < steps && n < (1 - s_rated)) {
            let T_load_pu = loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2);
            let Ta = (Tm - T_load_pu) * Trated;
            if (Ta > 1) {
                let dw = (1/steps) * (RPM * 2 * Math.PI / 60);
                let dt = (J * dw) / Ta;
                time += dt;
                i2t += Math.pow(Im_pu * Ir, 2) * dt;
            } else if (n < 0.9) { time = Infinity; break; }
        }
    }

    document.getElementById('resTime').innerText = (time === Infinity) ? "STALL" : time.toFixed(2) + "s";
    document.getElementById('resThermal').innerText = (time === Infinity) ? "--" : i2t.toExponential(2);

    renderChart(labels, motorT, loadT, currentI, voltageP);
});

function renderChart(l, m, ld, c, v) {
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: l,
            datasets: [
                { label: 'Torque Motor (%)', data: m, borderColor: '#38bdf8', pointRadius: 0, yAxisID: 'y' },
                { label: 'Torque Load (%)', data: ld, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, yAxisID: 'y' },
                { label: 'Voltage (%)', data: v, borderColor: '#10b981', borderDash: [2,2], pointRadius: 0, yAxisID: 'y' },
                { label: 'Current (%)', data: c, borderColor: '#f59e0b', pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Torque / Voltage (%)' }, min: 0 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', grid: { drawOnChartArea: false }, min: 0 }
            }
        }
    });
}
