// GitHub Pages compatibility check for Chart.js plugins
if (typeof Chart !== 'undefined' && window['chartjs-plugin-annotation']) {
    Chart.register(window['chartjs-plugin-annotation']);
}

const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

// UI Logic
document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});

document.getElementById('pdfBtn').addEventListener('click', () => {
    const ref = document.getElementById('projRef').value || "Unnamed Project";
    document.getElementById('printRef').innerText = `Reference: ${ref} | Date: ${new Date().toLocaleDateString()}`;
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // 1. Inputs
    const P = parseFloat(document.getElementById('pKw').value);
    const rpmRated = parseFloat(document.getElementById('rpm').value);
    const Ir = parseFloat(document.getElementById('iRated').value);
    const hotStallTime = parseFloat(document.getElementById('stallTime').value);
    const J_total = parseFloat(document.getElementById('jMotor').value) + parseFloat(document.getElementById('jLoad').value);
    
    const vDrop = parseFloat(document.getElementById('vDrop').value) / 100;
    const vGrid = 1.0 - vDrop; // Voltage available at terminals

    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 230) / 100;
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;
    const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;

    const Trated = (P * 9550) / rpmRated;
    const syncSpeed = rpmRated > 1200 ? 1500 : (rpmRated > 800 ? 1000 : 750);
    const s_nom = (syncSpeed - rpmRated) / syncSpeed;
    const sb = s_nom * (BDT + Math.sqrt(BDT**2 - 1));

    let labels = [], motorT = [], loadT = [], currentI = [];
    let totalTime = 0, totalA2s = 0, stallIdx = null, opSpeed = 0;
    let k_max_required = 0;

    // 2. Step Simulation
    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let speedActual = n * syncSpeed;
        let s = Math.max(0.0001, (syncSpeed - speedActual) / syncSpeed);
        labels.push(i);

        // Calculate V_applied based on Method + Grid Drop
        let v_applied = vGrid; 
        if (document.getElementById('method').value === 'soft') {
            // Soft starter limit caps the voltage further if iLimit < LRC * vGrid
            v_applied = Math.min(vGrid, iLimit / LRC);
        }

        // Torque scales with square of Applied Voltage
        let Tm = ((2 * BDT) / ((s / sb) + (sb / s))) * Math.pow(v_applied, 2);
        if (n < 0.2) {
            let startT = LRT * Math.pow(v_applied, 2);
            Tm = startT + (Tm - startT) * (n / 0.2);
        }

        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        // Required Current Factor (k) calculation with 10% safety margin
        let Tm_full_volt = Tm / Math.pow(v_applied, 2);
        let k_at_point = Math.sqrt((Tl + 0.1) / Tm_full_volt); 
        if (k_at_point > k_max_required) k_max_required = k_at_point;

        // Current Calculation
        let Im = (LRC * v_applied);
        if (Tm > Tl && n > 0.95) {
             let s_current = (syncSpeed - speedActual) / syncSpeed;
             Im = loadDemand + (LRC * vGrid - loadDemand) * (s_current / 0.05);
        }
        if (n >= 1.0) Im = loadDemand;

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        // Physics Integration
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

    // 3. Update Visuals
    document.getElementById('resTime').innerText = stallIdx ? "STALLED" : totalTime.toFixed(2) + "s";
    document.getElementById('resOpSpeed').innerText = stallIdx ? "0 RPM" : Math.round(opSpeed) + " RPM";
    document.getElementById('resMinI').innerText = Math.round(k_max_required * LRC * 100) + "%";
    
    let limitA2s = Math.pow(LRC * Ir, 2) * hotStallTime;
    let capUsed = (totalA2s / limitA2s) * 100;
    document.getElementById('resCap').innerText = capUsed.toFixed(1) + "%";
    document.getElementById('resCap').style.color = capUsed > 100 ? "red" : "white";

    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Motor Torque (%)', data: motorT, borderColor: '#38bdf8', borderWidth: 2.5, pointRadius: 0 },
                { label: 'Load Demand (%)', data: loadT, borderColor: '#f43f5e', borderDash: [3,3], pointRadius: 0 },
                { label: 'Current (%)', data: currentI, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.05)', fill: true, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                annotation: {
                    annotations: stallIdx ? {
                        line1: { type: 'line', xMin: stallIdx, xMax: stallIdx, borderColor: 'red', borderWidth: 3, label: { display: true, content: 'STALL point', backgroundColor: 'red' } }
                    } : {}
                }
            },
            scales: {
                x: { title: { display: true, text: 'Speed (% RPM)' } },
                y: { title: { display: true, text: 'Torque (%)' }, min: 0, max: 300 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } }
            }
        }
    });
});
