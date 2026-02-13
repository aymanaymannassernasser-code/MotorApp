// Bullet-proof plugin registration
window.onload = function() {
    if (typeof Chart !== 'undefined' && window['chartjs-plugin-annotation']) {
        Chart.register(window['chartjs-plugin-annotation']);
    }
};

let masterChart;

// UI Toggles
document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});

// PDF Generator
document.getElementById('pdfBtn').addEventListener('click', () => {
    const ref = document.getElementById('projRef').value || "Motor_Analysis_Report";
    document.getElementById('printRef').innerText = `Ref: ${ref} | Gen Date: ${new Date().toLocaleString()}`;
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // 1. Inputs & Calculation Pre-reqs
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const rpmRated = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const hotStallTime = parseFloat(document.getElementById('stallTime').value) || 15;
    const J_total = (parseFloat(document.getElementById('jMotor').value) || 0) + (parseFloat(document.getElementById('jLoad').value) || 0);
    
    const vDrop = (parseFloat(document.getElementById('vDrop').value) || 0) / 100;
    const vGrid = 1.0 - vDrop; 

    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 230) / 100;
    
    const loadDemand = (parseFloat(document.getElementById('loadDemand').value) || 0) / 100;
    const loadOffset = (parseFloat(document.getElementById('loadOffset').value) || 0) / 100;
    const iLimit = (parseFloat(document.getElementById('softLimit').value) || 350) / 100;

    const Trated = (P * 9550) / rpmRated;
    const syncSpeed = rpmRated > 1200 ? 1500 : (rpmRated > 800 ? 1000 : 750);
    const s_nom = (syncSpeed - rpmRated) / syncSpeed;
    const sb = s_nom * (BDT + Math.sqrt(BDT**2 - 1));

    let labels = [], motorT = [], loadT = [], currentI = [];
    let totalTime = 0, totalA2s = 0, stallIdx = null, opSpeed = 0;
    let k_max_required = 0;

    // 2. The Physics Engine
    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let speedActual = n * syncSpeed;
        let s = Math.max(0.0001, (syncSpeed - speedActual) / syncSpeed);
        labels.push(i);

        let v_applied = vGrid; 
        if (document.getElementById('method').value === 'soft') {
            v_applied = Math.min(vGrid, iLimit / LRC);
        }

        // Kloss Equation for Torque
        let Tm = ((2 * BDT) / ((s / sb) + (sb / s))) * Math.pow(v_applied, 2);
        if (n < 0.2) {
            let startT = LRT * Math.pow(v_applied, 2);
            Tm = startT + (Tm - startT) * (n / 0.2);
        }

        // Load Torque Selection
        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        // Required Current Analysis
        let Tm_full_volt = Tm / Math.pow(v_applied, 2);
        let k_at_point = Math.sqrt((Tl + 0.1) / Tm_full_volt); 
        if (k_at_point > k_max_required) k_max_required = k_at_point;

        // Current Simulation
        let Im = (LRC * v_applied);
        if (Tm > Tl && n > 0.95) {
             let s_current = (syncSpeed - speedActual) / syncSpeed;
             Im = loadDemand + (LRC * vGrid - loadDemand) * (s_current / 0.05);
        }
        if (n >= 1.0) Im = loadDemand;

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        // Integration of motion
        let accT = Tm - Tl;
        if (i < 100 && accT > 0.005) {
            let dt = (J_total * (syncSpeed * 2 * Math.PI / 60 / 100)) / (accT * Trated);
            totalTime += dt;
            totalA2s += Math.pow(Im * Ir, 2) * dt;
            opSpeed = speedActual;
        } else if (accT <= 0.005 && stallIdx === null && i > 5) {
            stallIdx = i;
        }
    }

    // 3. Results Output
    document.getElementById('resTime').innerText = stallIdx ? "STALLED" : totalTime.toFixed(2) + "s";
    document.getElementById('resOpSpeed').innerText = stallIdx ? "0 RPM" : Math.round(opSpeed) + " RPM";
    document.getElementById('resMinI').innerText = Math.round(k_max_required * LRC * 100) + "%";
    
    const limitA2s = Math.pow(LRC * Ir, 2) * hotStallTime;
    const capUsed = (totalA2s / limitA2s) * 100;
    const capElement = document.getElementById('resCap');
    capElement.innerText = capUsed.toFixed(1) + "%";
    capElement.style.color = (capUsed > 100 || stallIdx) ? "var(--danger)" : "white";

    // 4. Charting
    const ctx = document.getElementById('masterChart').getContext('2d');
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Torque (%)', data: motorT, borderColor: '#38bdf8', borderWidth: 2.5, pointRadius: 0 },
                { label: 'Load (%)', data: loadT, borderColor: '#f43f5e', borderDash: [3,3], pointRadius: 0 },
                { label: 'Current (%)', data: currentI, borderColor: '#f59e0b', fill: false, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                annotation: {
                    annotations: stallIdx ? {
                        line1: { type: 'line', xMin: stallIdx, xMax: stallIdx, borderColor: 'red', borderWidth: 3, label: { display: true, content: 'STALL', backgroundColor: 'red' } }
                    } : {}
                }
            },
            scales: {
                y: { min: 0, max: 300, title: { display: true, text: 'Torque %' } },
                y1: { position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false }, title: { display: true, text: 'Current %' } }
            }
        }
    });
});
