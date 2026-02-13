const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

// UI Logic
document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});
document.getElementById('method').addEventListener('change', e => {
    document.getElementById('softSettings').style.display = e.target.value === 'soft' ? 'grid' : 'none';
});

document.getElementById('pdfBtn').addEventListener('click', () => {
    const ref = document.getElementById('projRef').value || "Project_Report";
    document.getElementById('printRef').innerText = `Ref: ${ref} | Analysis: ${new Date().toLocaleDateString()}`;
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // 1. Inputs & Constants
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const RPM = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const hotStallTime = parseFloat(document.getElementById('stallTime').value) || 15;
    const J_tot = (parseFloat(document.getElementById('jMotor').value) || 0) + (parseFloat(document.getElementById('jLoad').value) || 0.5);
    const vNet = (parseFloat(document.getElementById('vSuppVal').value) || 100) / 100;
    
    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) || 160 : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) || 650 : 650) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) || 230 : 230) / 100;
    
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

    // 2. Numerical Integration Loop
    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let s = Math.max(s_nom, 1 - n);
        labels.push(i);

        // Soft Start Voltage logic
        let v_applied = vNet;
        if (document.getElementById('method').value === 'soft') {
            const iLimit = (parseFloat(document.getElementById('softLimit').value) || 350) / 100;
            v_applied = Math.min(vNet, iLimit / LRC);
        }

        // Motor Torque (Kloss Eq)
        let Tm = ((2 * BDT) / ((s / sb) + (sb / s))) * Math.pow(v_applied, 2);
        if (n < 0.2) {
            let startT = LRT * Math.pow(v_applied, 2);
            Tm = startT + (Tm - startT) * (n / 0.2);
        }

        // Load Torque
        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        // Current
        let Im = (LRC * v_applied);
        if (n > 0.9) Im = loadDemand + (Im - loadDemand) * (1 - (n-0.9)/0.1); 
        if (n >= 1.0) Im = loadDemand;

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        // Stall & Integration Logic
        let accT = Tm - Tl;
        if (i < 98) minAccT = Math.min(minAccT, accT);

        // Find worst case ratio for Min Current calculation
        let Tm_full_voltage = Tm / Math.pow(v_applied, 2);
        let k_required = Math.sqrt(Tl / Tm_full_voltage);
        if (k_required > worstCaseK) worstCaseK = k_required;

        if (i < 100 && n < (1 - s_nom)) {
            if (accT > 0.01 && stallIdx === null) {
                let dt = (J_tot * (RPM * 2 * Math.PI / 60 / 100)) / (accT * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im * Ir, 2) * dt;
            } else if (stallIdx === null && i > 0) {
                stallIdx = i;
            }
        }
    }

    // 3. Final Results & Min Current (10% Buffer)
    const minReqI = worstCaseK * LRC * 1.1; 
    document.getElementById('resTime').innerText = stallIdx ? "STALLED" : totalTime.toFixed(2) + "s";
    document.getElementById('resMinTorque').innerText = (minAccT * 100).toFixed(1) + "%";
    document.getElementById('resMinI').innerText = (minReqI * 100).toFixed(0) + "%";
    document.getElementById('resThermal').innerText = Math.round(totalA2s).toLocaleString();
    
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
                { label: 'Motor Torque (%)', data: motorT, borderColor: '#38bdf8', borderWidth: 3, pointRadius: 0 },
                { label: 'Load Demand (%)', data: loadT, borderColor: '#f43f5e', borderDash: [2,2], pointRadius: 0 },
                { label: 'Current (%)', data: currentI, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.05)', fill: true, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                annotation: stallIdx ? {
                    annotations: {
                        line1: { type: 'line', xMin: stallIdx, xMax: stallIdx, borderColor: 'rgba(244, 63, 94, 0.8)', borderWidth: 3, label: { content: 'STALL', display: true, backgroundColor: '#f43f5e' } }
                    }
                } : {}
            },
            scales: {
                x: { title: { display: true, text: 'Speed (% RPM)' } },
                y: { title: { display: true, text: 'Torque (%)' }, min: 0, max: 300 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } }
            }
        }
    });
});
