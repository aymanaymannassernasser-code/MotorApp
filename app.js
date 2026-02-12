const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});
document.getElementById('method').addEventListener('change', e => {
    document.getElementById('softSettings').style.display = e.target.value === 'soft' ? 'grid' : 'none';
});

document.getElementById('pdfBtn').addEventListener('click', () => {
    const ref = document.getElementById('projRef').value || "Unnamed_Project";
    document.getElementById('printRef').innerText = "Project: " + ref + " | Date: " + new Date().toLocaleDateString();
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    // Inputs
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

    let labels = [], motorT = [], loadT = [], currentI = [], voltageV = [];
    let totalTime = 0, totalA2s = 0;
    let minNetTorque = 999;
    let stallSpeedIdx = null;

    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let s = Math.max(s_nom, 1 - n);
        labels.push(i);

        let v_applied = vNet;
        if (document.getElementById('method').value === 'soft') {
            const iInit = (parseFloat(document.getElementById('softInit').value) || 200) / 100;
            const iLimit = (parseFloat(document.getElementById('softLimit').value) || 350) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value) || 5;
            let i_target = iInit + (totalTime / Math.max(0.1, rampT)) * (iLimit - iInit);
            v_applied = Math.min(vNet, Math.min(i_target, iLimit) / LRC);
        }

        let Tm = ((2 * BDT) / ((s / sb) + (sb / s))) * Math.pow(v_applied, 2);
        if (n < 0.15) {
            let startT = LRT * Math.pow(v_applied, 2);
            Tm = startT + (Tm - startT) * Math.sin((n/0.15) * (Math.PI/2));
        }

        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        let Im = (LRC * v_applied);
        if (n > 0.85) {
            let decay = 1 / (1 + Math.pow((n - 0.85) / 0.15, 4) * 5);
            Im = Math.max(loadDemand, Im * decay);
        }
        if (n >= 0.99) Im = loadDemand;

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));
        voltageV.push((v_applied * 100).toFixed(0));

        // Physics Logic
        let netT = Tm - Tl;
        if (i < 98) minNetTorque = Math.min(minNetTorque, netT);

        if (i < 100 && n < (1 - s_nom)) {
            if (netT > 0.005 && stallSpeedIdx === null) {
                let dt = (J_tot * (RPM * 2 * Math.PI / 60 / 100)) / (netT * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im * Ir, 2) * dt;
            } else if (stallSpeedIdx === null) {
                stallSpeedIdx = i;
            }
        }
    }

    // Min Required Current Logic: T proportional to I^2. 
    // We need (Tm_original * k^2) > Tl. So k = sqrt(Tl/Tm_original).
    // Min I = LRC * k.
    let minIRequired = 0;
    for(let i=0; i<100; i++) {
        let Tm_full = parseFloat(motorT[i]) / Math.pow(parseFloat(voltageV[i])/100, 2);
        let req_k = Math.sqrt((parseFloat(loadT[i]) + 5) / Tm_full); // +5% safety margin
        minIRequired = Math.max(minIRequired, req_k * LRC);
    }

    document.getElementById('resTime').innerText = stallSpeedIdx ? "STALL" : totalTime.toFixed(2) + "s";
    document.getElementById('resMinTorque').innerText = (minNetTorque * 100).toFixed(1) + "%";
    document.getElementById('resMinI').innerText = (minIRequired * 100).toFixed(0) + "%";
    document.getElementById('resThermal').innerText = Math.round(totalA2s).toLocaleString() + " A2s";
    let capUsed = (totalA2s / limitA2s) * 100;
    document.getElementById('resCap').innerText = capUsed.toFixed(1) + "%";

    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Torque (%)', data: motorT, borderColor: '#38bdf8', borderWidth: 3, pointRadius: 0 },
                { label: 'Load Curve', data: loadT, borderColor: '#f43f5e', borderDash: [2,2], pointRadius: 0 },
                { label: 'Current (%)', data: currentI, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.05)', fill: true, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                autocolors: false,
                annotation: stallSpeedIdx ? {
                    annotations: {
                        line1: { type: 'line', xMin: stallSpeedIdx, xMax: stallSpeedIdx, borderColor: 'red', borderWidth: 2, label: { content: 'STALL POINT', display: true } }
                    }
                } : {}
            },
            scales: {
                x: { title: { display: true, text: 'Speed (%)' } },
                y: { title: { display: true, text: 'Torque (%)' }, min: 0, max: 300 },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', min: 0, max: 800 }
            }
        }
    });
});
