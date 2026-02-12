const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

document.getElementById('useManual').addEventListener('change', e => {
    document.getElementById('manualFields').style.display = e.target.checked ? 'grid' : 'none';
});
document.getElementById('method').addEventListener('change', e => {
    document.getElementById('softSettings').style.display = e.target.value === 'soft' ? 'grid' : 'none';
});

document.getElementById('calcBtn').addEventListener('click', () => {
    const P = parseFloat(document.getElementById('pKw').value) || 30;
    const RPM = parseFloat(document.getElementById('rpm').value) || 1475;
    const Ir = parseFloat(document.getElementById('iRated').value) || 55;
    const J_tot = (parseFloat(document.getElementById('jMotor').value) || 0) + (parseFloat(document.getElementById('jLoad').value) || 0);
    const vNet = parseFloat(document.getElementById('vSuppVal').value) / 100;
    const limitA2s = parseFloat(document.getElementById('thermalLimit').value) || 1;

    const LRT = (document.getElementById('useManual').checked ? parseFloat(document.getElementById('overLRT').value) : 160) / 100;
    const LRC = (document.getElementById('useManual').checked ? parseFloat(document.getElementById('overLRC').value) : 650) / 100;
    const BDT = (document.getElementById('useManual').checked ? parseFloat(document.getElementById('overBDT').value) : 230) / 100;
    
    const loadDemand = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffset = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const s_nom = (1500 - RPM) / 1500;
    const sb = 0.22; 

    let labels = [], motorT = [], loadT = [], currentI = [];
    let totalTime = 0, totalA2s = 0, stalledAt = null;

    for (let i = 0; i <= 100; i++) {
        let n = i / 100; 
        let s = Math.max(s_nom, 1 - n);
        labels.push(i);

        let v_applied = vNet;
        if (document.getElementById('method').value === 'soft') {
            const iInit = (parseFloat(document.getElementById('softInit')?.value) || 200) / 100;
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            
            // Pedestal + Linear Ramp up to the Limit
            let i_target = iInit + (totalTime / Math.max(0.1, rampT)) * (iLimit - iInit);
            i_target = Math.min(i_target, iLimit); 
            
            // Required voltage to push that target current through motor impedance at current slip
            v_applied = Math.min(vNet, i_target / LRC);
        }

        // Torque calculation with voltage drop
        let k_denom = (s / sb) + (sb / s);
        let Tm = ((2 * BDT) / k_denom) * Math.pow(v_applied, 2);
        if (n < 0.15) Tm = (LRT * Math.pow(v_applied, 2)) + (Tm - (LRT * Math.pow(v_applied, 2))) * Math.sin((n/0.15) * (Math.PI/2));

        // Current calculation (Constant plateau logic)
        let Im = (LRC * v_applied);
        if (n > 0.85) {
            let decay = 1 / (1 + Math.pow((n - 0.85) / 0.15, 4) * 5);
            Im = Math.max(loadDemand, Im * decay);
        }
        if (n >= 0.99) Im = loadDemand;

        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        if (i < 100 && n < (1 - s_nom)) {
            let Ta_pu = Tm - Tl;
            if (Ta_pu > 0.001 && !stalledAt) {
                let dt = (J_tot * (RPM * 2 * Math.PI / 60 / 100)) / (Ta_pu * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im * Ir, 2) * dt;
            } else if (!stalledAt && n < 0.95) {
                stalledAt = i; 
            }
        }
    }

    const timeRes = document.getElementById('resTime');
    if (stalledAt) {
        timeRes.innerText = "STALLED";
        timeRes.style.color = "#f43f5e";
    } else {
        timeRes.innerText = totalTime.toFixed(2) + "s";
        timeRes.style.color = "#fff";
    }
    
    document.getElementById('resThermal').innerText = Math.round(totalA2s).toLocaleString();
    document.getElementById('resCap').innerText = ((totalA2s / limitA2s) * 100).toFixed(1) + "%";

    updateChart(labels, motorT, loadT, currentI, vNet * 100, stalledAt);
});

function updateChart(l, m, ld, c, vFinal, stallIdx) {
    if (masterChart) masterChart.destroy();
    
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: l,
            datasets: [
                { label: `Motor Torque (at ${vFinal}% System Voltage)`, data: m, borderColor: '#38bdf8', borderWidth: 2.5, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
                { label: 'Load Resistance Torque', data: ld, borderColor: '#f43f5e', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, yAxisID: 'y' },
                { label: 'Current Profile (%)', data: c, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.05)', fill: true, borderWidth: 2, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed (Percentage of Synchronous RPM)', color: '#64748b' }, grid: { color: '#f1f5f9' } },
                y: { title: { display: true, text: 'Torque (% of Rated)', color: '#64748b' }, min: 0, max: 300, grid: { color: '#f1f5f9' } },
                y1: { title: { display: true, text: 'Current (% of Rated)', color: '#64748b' }, position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, padding: 20, font: { size: 12 } } },
                tooltip: { mode: 'index', intersect: false }
            }
        }
    });
}
