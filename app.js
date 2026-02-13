Chart.register(window['chartjs-plugin-annotation']);
const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});

document.getElementById('calcBtn').addEventListener('click', () => {
    const P = parseFloat(document.getElementById('pKw').value);
    const rpmRated = parseFloat(document.getElementById('rpm').value);
    const Ir = parseFloat(document.getElementById('iRated').value);
    const hotStallTime = parseFloat(document.getElementById('stallTime').value);
    const J_total = parseFloat(document.getElementById('jMotor').value) + parseFloat(document.getElementById('jLoad').value);
    
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
    const sb = s_nom * (BDT + Math.sqrt(BDT**2 - 1)); // Realistic breakdown slip calc

    let labels = [], motorT = [], loadT = [], currentI = [];
    let totalTime = 0, totalA2s = 0, stallIdx = null, opSpeed = 0;
    let k_max_required = 0;

    // Numerical Integration
    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let speedActual = n * syncSpeed;
        let s = Math.max(0.0001, (syncSpeed - speedActual) / syncSpeed);
        labels.push(i);

        // Control Logic
        let v_applied = (document.getElementById('method').value === 'soft') ? Math.min(1.0, iLimit / LRC) : 1.0;

        // Motor Torque (Kloss)
        let Tm = ((2 * BDT) / ((s / sb) + (sb / s))) * Math.pow(v_applied, 2);
        if (n < 0.2) {
            let startT = LRT * Math.pow(v_applied, 2);
            Tm = startT + (Tm - startT) * (n / 0.2);
        }

        // Load Torque
        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        // Required I for acceleration safety
        let Tm_full = Tm / Math.pow(v_applied, 2);
        let k_at_point = Math.sqrt((Tl + 0.1) / Tm_full); 
        if (k_at_point > k_max_required) k_max_required = k_at_point;

        // Current
        let Im = (LRC * v_applied);
        if (Tm > Tl && n > 0.9) {
             // In linear region, current drops as speed approaches sync
             let s_current = (syncSpeed - speedActual) / syncSpeed;
             Im = loadDemand + (LRC * v_applied - loadDemand) * (s_current / 0.1);
        }

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        // Acceleration and Stall Check
        let accT = Tm - Tl;
        if (i < 100 && accT > 0) {
            let dt = (J_total * (syncSpeed * 2 * Math.PI / 60 / 100)) / (accT * Trated);
            totalTime += dt;
            totalA2s += Math.pow(Im * Ir, 2) * dt;
            opSpeed = speedActual;
        } else if (accT <= 0 && stallIdx === null && i > 5) {
            stallIdx = i;
        }
    }

    // Results
    document.getElementById('resTime').innerText = stallIdx ? "STALLED" : totalTime.toFixed(2) + "s";
    document.getElementById('resOpSpeed').innerText = stallIdx ? "0 RPM" : Math.round(opSpeed) + " RPM";
    document.getElementById('resMinI').innerText = Math.round(k_max_required * LRC * 100) + "%";
    
    let limitA2s = Math.pow(LRC * Ir, 2) * hotStallTime;
    let capUsed = (totalA2s / limitA2s) * 100;
    document.getElementById('resCap').innerText = capUsed.toFixed(1) + "%";

    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Torque (%)', data: motorT, borderColor: '#38bdf8', borderWidth: 2, pointRadius: 0 },
                { label: 'Load (%)', data: loadT, borderColor: '#f43f5e', borderDash: [3,3], pointRadius: 0 },
                { label: 'Current (%)', data: currentI, borderColor: '#f59e0b', yAxisID: 'y1', pointRadius: 0 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                annotation: {
                    annotations: stallIdx ? {
                        line1: { type: 'line', xMin: stallIdx, xMax: stallIdx, borderColor: 'red', borderWidth: 2, label: { display: true, content: 'STALL' } }
                    } : {}
                }
            },
            scales: {
                y: { min: 0, max: 300 },
                y1: { position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } }
            }
        }
    });
});
