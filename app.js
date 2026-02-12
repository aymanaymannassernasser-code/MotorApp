// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./service-worker.js'); });
}

// Industry Constants for Motor Designs (Torque as % of Rated)
const DESIGNS = {
    N: { lrt: 1.5, bdt: 2.4, pullup: 1.1, inrush: 6.0 }, // Standard Design B
    H: { lrt: 2.3, bdt: 2.1, pullup: 1.6, inrush: 5.5 }  // High Torque Design C
};

const methodEl = document.getElementById('method');
const limitGroup = document.getElementById('limitGroup');
const ctxT = document.getElementById('torqueChart').getContext('2d');
let torqueChart;

// Show/Hide Soft Start Limit input
methodEl.addEventListener('change', () => {
    limitGroup.style.display = methodEl.value === 'soft' ? 'block' : 'none';
});

document.getElementById('calcBtn').addEventListener('click', calculateStarting);

function calculateStarting() {
    const P = parseFloat(document.getElementById('power').value);
    const J = parseFloat(document.getElementById('inertia').value);
    const design = DESIGNS[document.getElementById('motorDesign').value];
    const method = methodEl.value;
    const limit = parseFloat(document.getElementById('currentLimit').value) / 100;

    const Trated = (P * 9550) / 1450; // Nominal Torque
    let speedPoints = [], motorT = [], loadT = [];
    let totalTime = 0;
    const steps = 20; // 5% speed increments

    for (let i = 0; i <= steps; i++) {
        let n = i / steps; // current speed as 0.0 to 1.0
        speedPoints.push(Math.round(n * 100));

        // 1. Calculate Motor Torque
        let baseT = getTorqueCurveShape(n, design);
        let reduction = 1.0;
        
        if (method === 'soft') {
            reduction = Math.pow(limit / design.inrush, 2);
        } else if (method === 'stardelta' && n < 0.8) {
            reduction = 0.33;
        }
        
        let Tm = baseT * Trated * reduction;
        motorT.push(Tm.toFixed(1));

        // 2. Calculate Load Torque
        let Tl = (document.getElementById('loadType').value === 'fan') 
            ? Trated * Math.pow(n, 2) 
            : Trated * 0.8; 
        loadT.push(Tl.toFixed(1));

        // 3. Acceleration Time Integration
        if (i < steps) {
            let Ta = Tm - Tl;
            if (Ta > 0) {
                let deltaW = (1 / steps) * (1450 * 2 * Math.PI / 60);
                totalTime += (J * deltaW) / Ta;
            }
        }
    }

    // Update UI
    document.getElementById('resI').innerText = method === 'soft' ? (limit * 100) + "%" : (design.inrush * (method === 'stardelta' ? 0.33 : 1) * 100).toFixed(0) + "%";
    document.getElementById('resTime').innerText = totalTime.toFixed(2) + "s";
    document.getElementById('warningBox').style.display = totalTime > 10 ? 'block' : 'none';

    renderChart(speedPoints, motorT, loadT);
}

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
                { label: 'Motor Torque (Nm)', data: motor, borderColor: '#2c3e50', backgroundColor: 'transparent', tension: 0.3 },
                { label: 'Load Torque (Nm)', data: load, borderColor: '#e74c3c', borderDash: [5, 5], backgroundColor: 'transparent', tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            scales: { x: { title: { display: true, text: 'Speed (%)' } }, y: { title: { display: true, text: 'Torque (Nm)' } } }
        }
    });
}
