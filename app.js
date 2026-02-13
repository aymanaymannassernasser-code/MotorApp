Chart.register(window['chartjs-plugin-annotation']);

const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});
document.getElementById('method').addEventListener('change', e => {
    document.getElementById('softSettings').style.display = e.target.value === 'soft' ? 'block' : 'none';
});

document.getElementById('pdfBtn').addEventListener('click', () => {
    document.getElementById('printRef').innerText = "Ref: " + (document.getElementById('projRef').value || "Project Analysis");
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // 1. Inputs
    const P = parseFloat(document.getElementById('pKw').value);
    const RPM = parseFloat(document.getElementById('rpm').value);
    const Ir = parseFloat(document.getElementById('iRated').value);
    const hotStallTime = parseFloat(document.getElementById('stallTime').value);
    const J_motor = parseFloat(document.getElementById('jMotor').value);
    const J_load = parseFloat(document.getElementById('jLoad').value);
    const J_total = J_motor + J_load;
    
    const vNet = (parseFloat(document.getElementById('vSuppVal').value)) / 100;
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 230) / 100;
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;

    const limitA2s = Math.pow(LRC * Ir, 2) * hotStallTime;
    const Trated = (P * 9550) / RPM;
    const s_nom = (1500 - RPM) / 1500;
    const sb = 0.22; // Typical Breakdown slip

    let labels = [], motorT = [], loadT = [], currentI = [];
    let totalTime = 0, totalA2s = 0, stallIdx = null;
    let minAccT = 999;
    let k_max_required = 0;

    // 2. Step Simulation (0% to 100% speed)
    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let s = Math.max(s_nom, 1 - n);
        labels.push(i);

        let v_applied = vNet;
        if (document.getElementById('method').value === 'soft') {
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            v_applied = Math.min(vNet, iLimit / LRC);
        }

        // Motor Torque Model (Kloss Eq + LRT linear interp for start)
        let Tm = ((2 * BDT) / ((s / sb) + (sb / s))) * Math.pow(v_applied, 2);
        if (n < 0.2) {
            let startT = LRT * Math.pow(v_applied, 2);
            Tm = startT + (Tm - startT) * (n / 0.2);
        }

        // Load Torque Model
        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        // Required Current at this specific speed point
        let Tm_full = Tm / Math.pow(v_applied, 2);
        let k_at_point = Math.sqrt((Tl + 0.05) / Tm_full); 
        if (k_at_point > k_max_required) k_max_required = k_at_point;

        // Effective Current
        let Im = (LRC * v_applied);
        if (n > 0.95) Im = loadDemand; // Post-acceleration

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        // Acceleration
        let accT = Tm - Tl;
        if (i < 95) minAccT = Math.min(minAccT, accT);

        if (i < 100 && n < (1 - s_nom)) {
            if (accT > 0.01 && stallIdx === null) {
                // Time for 1% speed step: dt = J * delta_omega / Torque
                let dt = (J_total * (1500 * 2 * Math.PI / 60 / 100)) / (accT * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im * Ir, 2) * dt;
            } else if (stallIdx === null && i > 0) {
                stallIdx = i;
            }
        }
    }

    // 3. Results Output
    document.getElementById('resTime').innerText = stallIdx ? "STALLED" : totalTime.toFixed(2) + "s";
    document.getElementById('resMinTorque').innerText = (minAccT * 100).toFixed(1) + "%";
    document.getElementById('resMinI').innerText = Math.round(k_max_required * LRC * 100) + "%";
    
    let capUsed = (totalA2s / limitA2s) * 100;
    document.getElementById('resCap').innerText = capUsed.toFixed(1) + "%";
    document.getElementById('resCap').style.color = (capUsed > 100 || stallIdx) ? "#f43f5e" : "#fff";

    // 4. Chart Rendering
    if (masterChart) masterChart.destroy();
    
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Motor Torque (%)', data: motorT, borderColor: '#38bdf8', borderWidth: 2.5, pointRadius: 0 },
                { label: 'Load Torque (%)', data: loadT, borderColor: '#f43f5e', borderDash: [3,3], pointRadius: 0 },
                { label: 'Current (%)', data: currentI, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.05)', fill: true, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                annotation: {
                    annotations: stallIdx ? {
                        line1: { type: 'line', xMin: stallIdx, xMax: stallIdx, borderColor: 'red', borderWidth: 2, label: { display: true, content: 'STALL point', backgroundColor: 'red' } }
                    } : {}
                }
            },
            scales: {
                x: { title: { display: true, text: 'Speed (%)' } },
                y: { title: { display: true, text: 'Torque (%)' }, min: 0, max: 300 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } }
            }
        }
    });
});
