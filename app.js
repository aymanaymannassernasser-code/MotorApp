const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});

document.getElementById('vSupp').addEventListener('input', e => {
    document.getElementById('vDisp').innerText = e.target.value;
});

document.getElementById('printBtn').addEventListener('click', () => {
    document.getElementById('pdfProject').innerText = "Project: " + (document.getElementById('projRef').value || "Motor Study");
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    const P = parseFloat(document.getElementById('pKw').value);
    const RPM = parseFloat(document.getElementById('rpm').value);
    const J = parseFloat(document.getElementById('jTotal').value);
    const stallTime = parseFloat(document.getElementById('stallTime').value);
    const vFact = parseFloat(document.getElementById('vSupp').value) / 100;
    
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 240) / 100;
    
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const sb = 0.22; // Breakdown slip factor
    const s_rated = (1500 - RPM) / 1500;

    // Thermal Limit Constant: (LRC^2 * StallTime)
    // We assume the datasheet stall time is provided at rated voltage
    const thermalLimit = Math.pow(LRC, 2) * stallTime;

    let labels = [], motorT = [], loadT = [], currentI = [];
    let time = 0; let accumulatedI2t = 0;
    const steps = 80;

    for (let i = 0; i <= steps; i++) {
        let n = i / steps;
        let s = Math.max(s_rated, 1 - n);
        labels.push(Math.round(n * 100));

        // Torque % Logic
        let kloss = (2 * BDT) / ( (s/sb) + (sb/s) );
        let Tm_pu = (n < 0.2) ? LRT + (kloss - LRT) * (n/0.2) : kloss;
        let Tm_final = Tm_pu * Math.pow(vFact, 2) * 100; // Result in %
        
        // Load Torque %
        let Tl_pu = (document.getElementById('loadCurve').value === 'quad')
                    ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                    : loadOffset + (loadDemand - loadOffset);
        let Tl_final = Tl_pu * 100; // Result in %

        // Current % Logic (Hill & Cliff)
        let Im_pu = LRC * vFact * (1 / Math.pow(1 + Math.pow(n/0.92, 12), 0.5));
        if (n >= 0.98) Im_pu = 1.0 * loadDemand; 

        motorT.push(Tm_final.toFixed(1));
        loadT.push(Tl_final.toFixed(1));
        currentI.push((Im_pu * 100).toFixed(0));

        // Dynamic Physics
        if (i < steps && n < (1 - s_rated)) {
            let Ta = (Tm_pu * Math.pow(vFact, 2) - Tl_pu) * Trated;
            if (Ta > 0) {
                let dw = (1/steps) * (RPM * 2 * Math.PI / 60);
                let dt = (J * dw) / Ta;
                time += dt;
                accumulatedI2t += Math.pow(Im_pu, 2) * dt;
            } else { time = Infinity; break; }
        }
    }

    const thermalPercent = (accumulatedI2t / thermalLimit) * 100;

    document.getElementById('resTime').innerText = (time === Infinity) ? "STALL" : time.toFixed(2) + "s";
    document.getElementById('resThermal').innerText = (time === Infinity) ? "--" : thermalPercent.toFixed(1) + "%";

    renderChart(labels, motorT, loadT, currentI);
});

function renderChart(l, m, ld, c) {
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: l,
            datasets: [
                { label: 'Motor Torque (%)', data: m, borderColor: '#38bdf8', pointRadius: 0, tension: 0.2, yAxisID: 'y' },
                { label: 'Load Torque (%)', data: ld, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, yAxisID: 'y' },
                { label: 'Current (%)', data: c, borderColor: '#f59e0b', pointRadius: 0, tension: 0.2, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Torque (% of Rated)' }, min: 0 },
                y1: { title: { display: true, text: 'Current (% of Rated)' }, position: 'right', grid: { drawOnChartArea: false }, min: 0 }
            }
        }
    });
}
