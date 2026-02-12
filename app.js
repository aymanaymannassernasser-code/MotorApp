if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./service-worker.js'); });
}

const DESIGNS = {
    N: { lrt: 1.5, bdt: 2.4, pullup: 1.1, inrush: 6.0 },
    H: { lrt: 2.3, bdt: 2.1, pullup: 1.6, inrush: 5.5 }
};

const methodEl = document.getElementById('method');
const limitGroup = document.getElementById('limitGroup');
const vSlider = document.getElementById('voltageDrop');
const vValDisplay = document.getElementById('vVal');
const ctxT = document.getElementById('torqueChart').getContext('2d');
let torqueChart;

vSlider.addEventListener('input', (e) => { vValDisplay.innerText = e.target.value; });
methodEl.addEventListener('change', () => { limitGroup.style.display = methodEl.value === 'soft' ? 'block' : 'none'; });

// Print Function
document.getElementById('printBtn').addEventListener('click', () => {
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    const P = parseFloat(document.getElementById('power').value);
    const J = parseFloat(document.getElementById('inertia').value);
    const design = DESIGNS[document.getElementById('motorDesign').value];
    const method = methodEl.value;
    const limit = parseFloat(document.getElementById('currentLimit').value) / 100;
    const vFactor = Math.pow(parseFloat(vSlider.value) / 100, 2);

    const Trated = (P * 9550) / 1450;
    let speedPoints = [], motorT = [], loadT = [];
    let totalTime = 0;
    const steps = 40;

    for (let i = 0; i <= steps; i++) {
        let n = i / steps;
        speedPoints.push(Math.round(n * 100));

        let baseT = getTorqueCurveShape(n, design);
        let reduction = 1.0;
        
        if (method === 'soft') reduction = Math.pow(limit / design.inrush, 2);
        else if (method === 'stardelta' && n < 0.8) reduction = 0.33;
        
        let Tm = baseT * Trated * reduction * vFactor;
        let Tl = (document.getElementById('loadType').value === 'fan') ? Trated * Math.pow(n, 2) : Trated * 0.8; 
        
        motorT.push(Tm.toFixed(1));
        loadT.push(Tl.toFixed(1));

        if (i < steps) {
            let Ta = Tm - Tl;
            if (Ta > 0) {
                let deltaW = (1 / steps) * (1450 * 2 * Math.PI / 60);
                totalTime += (J * deltaW) / Ta;
            } else {
                totalTime = Infinity;
            }
        }
    }

    const irBase = (method === 'stardelta' ? 0.33 : 1) * (method === 'soft' ? limit / design.inrush : 1);
    document.getElementById('resI').innerText = (design.inrush * irBase * (parseFloat(vSlider.value)/100) * 100).toFixed(0) + "% Ir";
    
    const timeDisplay = document.getElementById('resTime');
    if (totalTime === Infinity) {
        timeDisplay.innerText = "STALL";
        timeDisplay.style.color = "#f43f5e";
    } else {
        timeDisplay.innerText = totalTime.toFixed(2) + "s";
        timeDisplay.style.color = "var(--accent)";
    }

    document.getElementById('warningBox').style.display = (totalTime > 12 || totalTime === Infinity) ? 'block' : 'none';
    renderChart(speedPoints, motorT, loadT);
});

function getTorqueCurveShape(n, d) {
    if (n < 0.7) return d.lrt + (d.pullup - d.lrt) * (n / 0.7);
    if (n < 0.9) return d.pullup + (d.bdt - d.pullup) * ((n - 0.7) / 0.2);
    return d.bdt - (d.bdt - 1.0) * ((n - 0.9) / 0.1);
}

function renderChart(labels, motor, load) {
    if (torqueChart) torqueChart.destroy();
    torqueChart = new Chart(ctxT, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Motor Torque', data: motor, borderColor: '#38bdf8', borderWidth: 3, pointRadius: 0, tension: 0.3 },
                { label: 'Load Torque', data: load, borderColor: '#94a3b8', borderDash: [5, 5], pointRadius: 0, tension: 0.3 }
            ]
        },
        options: {
            animation: false, // Set to false for cleaner PDF rendering
            plugins: { legend: { labels: { color: '#94a3b8' } } },
            scales: { 
                x: { grid: { color: '#334155' }, ticks: { color: '#64748b' } },
                y: { grid: { color: '#334155' }, ticks: { color: '#64748b' } }
            }
        }
    });
}
