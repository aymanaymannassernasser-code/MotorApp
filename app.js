// Register the plugin globally for Chart.js
Chart.register(window['chartjs-plugin-annotation']);

const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});
document.getElementById('method').addEventListener('change', e => {
    document.getElementById('softSettings').style.display = e.target.value === 'soft' ? 'grid' : 'none';
});

document.getElementById('pdfBtn').addEventListener('click', () => {
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // 1. Inputs
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const RPM = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const hotStallTime = parseFloat(document.getElementById('stallTime').value) || 15;
    const J_tot = parseFloat(document.getElementById('jTotal').value) || 1.0;
    const vNet = (parseFloat(document.getElementById('vSuppVal').value) || 100) / 100;
    
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 230) / 100;
    
    const loadDemand = (parseFloat(document.getElementById('loadDemand').value) || 95) / 100;
    const loadOffset = (parseFloat(document.getElementById('loadOffset').value) || 20) / 100;

    const limitA2s = Math.pow(LRC * Ir, 2) * hotStallTime;
    const Trated = (P * 9550) / RPM;
    const s_nom = (1500 - RPM) / 1500;
    const sb = 0.22; 

    let labels = [], motorT = [], loadT = [], currentI = [];
    let totalTime = 0, totalA2s = 0, stallIdx = null;
    let minAccT = 999;
    let worstCaseK = 0.1;

    // 2. Calculation Loop
    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let s = Math.max(s_nom, 1 - n);
        labels.push(i);

        let v_applied = vNet;
        if (document.getElementById('method').value === 'soft') {
            const iLimit = (parseFloat(document.getElementById('softLimit').value) || 350) / 100;
            v_applied = Math.min(vNet, iLimit / LRC);
        }

        let Tm = ((2 * BDT) / ((s / sb) + (sb / s))) * Math.pow(v_applied, 2);
        if (n < 0.2) {
            let startT = LRT * Math.pow(v_applied, 2);
            Tm = startT + (Tm - startT) * (n / 0.2);
        }

        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        let Im = (LRC * v_applied);
        if (n > 0.9) Im = loadDemand + (Im - loadDemand) * (1 - (n-0.9)/0.1); 
        if (n >= 1.0) Im = loadDemand;

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        let accT = Tm - Tl;
        if (i < 98) minAccT = Math.min(minAccT, accT);

        // Required Current Logic (k = current ratio)
        let Tm_full = Tm / Math.pow(v_applied, 2);
        let k = Math.sqrt((Tl + 0.05) / Tm_full); // Added 5% physical margin
        if (k > worstCaseK) worstCaseK = k;

        if (i < 100 && n < (1 - s_nom)) {
            if (accT > 0.01 && stallIdx === null) {
                let dt = (J_tot * (RPM * 2 * Math.PI / 60 / 100)) / (Math.max(0.01, accT) * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im * Ir, 2) * dt;
            } else if (stallIdx === null && i > 0) {
                stallIdx = i;
            }
        }
    }

    // 3. Update Results
    const minReqI = worstCaseK * LRC;
    document.getElementById('resTime').innerText = stallIdx ? "STALLED" : totalTime.toFixed(2) + "s";
    document.getElementById('resMinTorque').innerText = (minAccT * 100).toFixed(1) + "%";
    document.getElementById('resMinI').innerText = Math.round(minReqI * 100) + "%";
    document.getElementById('resThermal').innerText = Math.round(totalA2s).toLocaleString();
    
    let capUsed = (totalA2s / limitA2s) * 100;
    document.getElementById('resCap').innerText = capUsed.toFixed(1) + "%";
    document.getElementById('resCap').style.color = (capUsed > 100 || stallIdx) ? "#f43f5e" : "#fff";

    // 4. Charting
    if (masterChart) masterChart.destroy();
    
    const annotations = {};
    if (stallIdx !== null) {
        annotations.line1 = {
            type: 'line',
            xMin: stallIdx,
            xMax: stallIdx,
            borderColor: 'red',
            borderWidth: 2,
            label: {
                display: true,
                content: 'STALL',
                backgroundColor: 'red',
                color: 'white'
            }
        };
    }

    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Torque (%)', data: motorT, borderColor: '#38bdf8', borderWidth: 3, pointRadius: 0 },
                { label: 'Load (%)', data: loadT, borderColor: '#f43f5e', borderDash: [2,2], pointRadius: 0 },
                { label: 'Current (%)', data: currentI, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.05)', fill: true, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { annotation: { annotations } },
            scales: {
                x: { title: { display: true, text: 'Speed (%)' } },
                y: { title: { display: true, text: 'Torque (%)' }, min: 0, max: 300 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } }
            }
        }
    });
});
