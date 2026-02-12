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

document.getElementById('calcBtn').addEventListener('click', () => {
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const RPM = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const J_total = (parseFloat(document.getElementById('jMotor').value) || 0) + (parseFloat(document.getElementById('jLoad').value) || 0);
    const vNet = parseFloat(document.getElementById('vSupp').value) / 100;
    const limitA2s = parseFloat(document.getElementById('thermalLimit').value) || 1;

    const isManual = document.getElementById('useManual').checked;
    const LRT = (isManual ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (isManual ? parseFloat(document.getElementById('overLRC').value) : 600) / 100;
    const BDT = (isManual ? parseFloat(document.getElementById('overBDT').value) : 220) / 100;
    
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const s_nom = (1500 - RPM) / 1500;
    const sb = 0.22; 

    let labels = [], motorT = [], loadT = [], currentI = [], voltageV = [];
    let totalTime = 0, totalA2s = 0, isStalled = false;
    const steps = 100;

    for (let i = 0; i <= steps; i++) {
        let n = i / steps; 
        let s = Math.max(s_nom, 1 - n);
        labels.push(Math.round(n * 100));

        let v_applied = vNet;
        if (document.getElementById('method').value === 'soft') {
            const iInit = parseFloat(document.getElementById('softInit').value) / 100;
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            
            let v_ramp = (iInit / LRC) + (totalTime / Math.max(0.1, rampT)) * (vNet - (iInit/LRC));
            let v_limit = iLimit / LRC;
            v_applied = Math.min(vNet, v_ramp, v_limit);
        }
        voltageV.push((v_applied * 100).toFixed(0));

        let k_denom = (s / sb) + (sb / s);
        let Tm_pu = (2 * BDT) / k_denom;
        if (n < 0.15) Tm_pu = LRT + (Tm_pu - LRT) * Math.sin((n/0.15) * (Math.PI/2));
        let Tm = Tm_pu * Math.pow(v_applied, 2);

        let Im_pu = LRC * v_applied;
        if (n > 0.85) {
            let decay = 1 / (1 + Math.pow((n - 0.85) / 0.15, 4) * 5);
            Im_pu = Math.max(loadDemand, Im_pu * decay);
        }
        if (n >= 0.99) Im_pu = loadDemand;

        motorT.push((Tm * 100).toFixed(1));
        let Tl_pu = (document.getElementById('loadCurve').value === 'quad') 
                    ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                    : loadOffset + (loadDemand - loadOffset);
        loadT.push((Tl_pu * 100).toFixed(1));
        currentI.push((Im_pu * 100).toFixed(0));

        if (i < steps && n < (1 - s_nom)) {
            let Ta_pu = Tm - Tl_pu;
            if (Ta_pu > 0.005) {
                let dOmega = (1/steps) * (RPM * 2 * Math.PI / 60);
                let dt = (J_total * dOmega) / (Ta_pu * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im_pu * Ir, 2) * dt;
            } else if (n < 0.9) {
                isStalled = true; break;
            }
        }
    }

    document.getElementById('resTime').innerText = isStalled ? "STALL" : totalTime.toFixed(2) + "s";
    document.getElementById('resThermal').innerText = isStalled ? "--" : Math.round(totalA2s).toLocaleString();
    document.getElementById('resCap').innerText = isStalled ? "--" : ((totalA2s / limitA2s) * 100).toFixed(1) + "%";

    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Torque (%)', data: motorT, borderColor: '#38bdf8', pointRadius: 0, tension: 0.3, yAxisID: 'y' },
                { label: 'Load (%)', data: loadT, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, yAxisID: 'y' },
                { label: 'Current (%)', data: currentI, borderColor: '#f59e0b', pointRadius: 0, tension: 0.2, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { min: 0, max: 300 },
                y1: { position: 'right', min: 0, max: 800 }
            }
        }
    });
});
