const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

// Toggle Manual Fields
document.getElementById('useManual').addEventListener('change', (e) => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});

document.getElementById('vSupp').addEventListener('input', (e) => {
    document.getElementById('vDisp').innerText = e.target.value;
});

document.getElementById('calcBtn').addEventListener('click', () => {
    const P = parseFloat(document.getElementById('pKw').value);
    const RPM = parseFloat(document.getElementById('rpm').value);
    const J = parseFloat(document.getElementById('jTotal').value);
    const vFact = parseFloat(document.getElementById('vSupp').value) / 100;
    
    // Logic: Use manual if checked, else use defaults
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 240) / 100;
    
    const loadRatedTPerc = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffsetPerc = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const sb = 0.2; // Breakdown slip point

    let labels = [], motorT = [], loadT = [], currentI = [];
    let time = 0; let energy = 0;
    const steps = 100;

    for (let i = 0; i <= steps; i++) {
        let n = i / steps;
        let s = Math.max(0.01, 1 - n); // Clamp slip to 0.01 to prevent infinite torque
        labels.push(Math.round(n * 100));

        // Kloss Torque
        let kloss = (2 * BDT) / ( (s/sb) + (sb/s) );
        // Smooth blend from LRT to Kloss
        let Tm_pu = (n < 0.2) ? LRT + (kloss - LRT) * (n/0.2) : kloss;
        let Tm = Tm_pu * Trated * Math.pow(vFact, 2);
        
        // Load Torque
        let Tl_pu = (document.getElementById('loadCurve').value === 'quad')
                    ? loadOffsetPerc + (loadRatedTPerc - loadOffsetPerc) * Math.pow(n, 2)
                    : loadOffsetPerc + (loadRatedTPerc - loadOffsetPerc);
        let Tl = Tl_pu * Trated;

        // Realistic Current
        let Im_pu = LRC * (1 - 0.15 * n) * vFact;
        if (n > 0.85) Im_pu *= (1 - (n - 0.85) / 0.15 * 0.8);

        motorT.push(Tm.toFixed(1));
        loadT.push(Tl.toFixed(1));
        currentI.push((Im_pu * 100).toFixed(0));

        // Integration (Stop at 99% speed)
        if (i < steps && n < 0.99) {
            let Ta = Tm - Tl;
            if (Ta > 0) {
                let dw = (1/steps) * (RPM * 2 * Math.PI / 60);
                let dt = (J * dw) / Ta;
                time += dt;
                energy += (P * Im_pu * dt);
            } else { time = Infinity; break; }
        }
    }

    document.getElementById('resTime').innerText = (time === Infinity) ? "STALL" : time.toFixed(2) + "s";
    document.getElementById('resEnergy').innerText = (time === Infinity) ? "--" : Math.round(energy) + " kJ";

    renderChart(labels, motorT, loadT, currentI);
});

function renderChart(l, m, ld, c) {
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: l,
            datasets: [
                { label: 'Motor (Nm)', data: m, borderColor: '#38bdf8', pointRadius: 0, yAxisID: 'y' },
                { label: 'Load (Nm)', data: ld, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, yAxisID: 'y' },
                { label: 'Current (%)', data: c, borderColor: '#f59e0b', pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            scales: {
                y: { title: { display: true, text: 'Torque (Nm)' } },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    });
}
