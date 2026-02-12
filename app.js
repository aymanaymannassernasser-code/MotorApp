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
    const vSuppNom = parseFloat(document.getElementById('vSuppVal').value) / 100;
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

        // Physics Logic
        let v_applied = vSuppNom;
        if (document.getElementById('method').value === 'soft') {
            const iLimit = parseFloat(document.getElementById('softLimit').value) / 100;
            const rampT = parseFloat(document.getElementById('softRamp').value);
            let v_ramp = (200/LRC) + (totalTime / Math.max(0.1, rampT)) * (vSuppNom - (200/LRC));
            v_applied = Math.min(vSuppNom, v_ramp, iLimit / LRC);
        }

        let k_denom = (s / sb) + (sb / s);
        let Tm = ((2 * BDT) / k_denom) * Math.pow(v_applied, 2);
        if (n < 0.15) Tm = (LRT * Math.pow(v_applied, 2)) + (Tm - (LRT * Math.pow(v_applied, 2))) * Math.sin((n/0.15) * (Math.PI/2));

        let Im = (LRC * v_applied);
        if (n > 0.85) Im = Math.max(loadDemand, Im * (1 / (1 + Math.pow((n - 0.85) / 0.15, 4) * 5)));
        if (n >= 0.99) Im = loadDemand;

        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? loadOffset + (loadDemand - loadOffset) * Math.pow(n, 2)
                 : loadOffset + (loadDemand - loadOffset);

        motorT.push((Tm * 100).toFixed(1));
        loadT.push((Tl * 100).toFixed(1));
        currentI.push((Im * 100).toFixed(0));

        // Acceleration Logic (Keep calculating even if stalled for the plot)
        if (i < 100 && n < (1 - s_nom)) {
            let Ta_pu = Tm - Tl;
            if (Ta_pu > 0.002 && !stalledAt) {
                let dt = (J_tot * (RPM * 2 * Math.PI / 60 / 100)) / (Ta_pu * Trated);
                totalTime += dt;
                totalA2s += Math.pow(Im * Ir, 2) * dt;
            } else if (!stalledAt) {
                stalledAt = i; // Mark where it happened
            }
        }
    }

    // Results with Stall Logic
    const timeRes = document.getElementById('resTime');
    const timeCard = document.getElementById('timeCard');
    if (stalledAt) {
        timeRes.innerText = "STALLED";
        timeCard.style.borderBottomColor = "#f43f5e";
    } else {
        timeRes.innerText = totalTime.toFixed(2) + "s";
        timeCard.style.borderBottomColor = "#38bdf8";
    }
    
    document.getElementById('resThermal').innerText = Math.round(totalA2s).toLocaleString() + " A²s";
    document.getElementById('resCap').innerText = ((totalA2s / limitA2s) * 100).toFixed(1) + "%";

    updateChart(labels, motorT, loadT, currentI, vSuppNom * 100, stalledAt);
});

function updateChart(l, m, ld, c, vFinal, stallIdx) {
    if (masterChart) masterChart.destroy();
    
    const stallPlugin = {
        id: 'stallLine',
        beforeDraw: (chart) => {
            if (stallIdx !== null) {
                const {ctx, chartArea: {top, bottom, left, right}, scales: {x}} = chart;
                const xPos = x.getPixelForValue(stallIdx);
                ctx.save();
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
                ctx.setLineDash([5, 5]);
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(xPos, top); ctx.lineTo(xPos, bottom); ctx.stroke();
                ctx.fillStyle = '#f43f5e';
                ctx.fillText('STALL POINT', xPos + 5, top + 20);
                ctx.restore();
            }
        }
    };

    masterChart = new Chart(ctx, {
        type: 'line',
        plugins: [stallPlugin],
        data: {
            labels: l,
            datasets: [
                { label: `Motor Torque @ ${vFinal}% V`, data: m, borderColor: '#38bdf8', borderWidth: 3, pointRadius: 0, tension: 0.3, yAxisID: 'y' },
                { label: 'Load Demand Torque', data: ld, borderColor: '#f43f5e', borderDash: [5,5], pointRadius: 0, yAxisID: 'y' },
                { label: 'Starting Current (%)', data: c, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, pointRadius: 0, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Speed (% RPM)', font: { weight: 'bold' } }, grid: { color: '#e2e8f0' } },
                y: { title: { display: true, text: 'Torque (%)', font: { weight: 'bold' } }, min: 0, max: 300, grid: { color: '#e2e8f0' } },
                y1: { title: { display: true, text: 'Current (%)', font: { weight: 'bold' } }, position: 'right', min: 0, max: 800, grid: { drawOnChartArea: false } }
            },
            plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6 } } }
        }
    });
}
