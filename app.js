if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./service-worker.js'); });
}

const DESIGNS = {
    N: { lrt: 1.5, bdt: 2.4, pullup: 1.1, inrush: 6.0 },
    H: { lrt: 2.3, bdt: 2.1, pullup: 1.6, inrush: 5.5 }
};

const vSlider = document.getElementById('voltageDrop');
const vValDisplay = document.getElementById('vVal');
const ctxT = document.getElementById('torqueChart').getContext('2d');
let torqueChart;

vSlider.addEventListener('input', (e) => { vValDisplay.innerText = e.target.value; });
document.getElementById('method').addEventListener('change', (e) => {
    document.getElementById('limitGroup').style.display = e.target.value === 'soft' ? 'block' : 'none';
});

document.getElementById('printBtn').addEventListener('click', () => {
    const proj = document.getElementById('projectName').value || "Standard Motor Simulation";
    document.getElementById('pdfProjectName').innerText = "Project: " + proj;
    window.print();
});

document.getElementById('calcBtn').addEventListener('click', () => {
    const P = parseFloat(document.getElementById('power').value);
    const J = parseFloat(document.getElementById('inertia').value);
    const design = DESIGNS[document.getElementById('motorDesign').value];
    const method = document.getElementById('method').value;
    const limit = parseFloat(document.getElementById('currentLimit').value) / 100;
    const vFactor = Math.pow(parseFloat(vSlider.value) / 100, 2);

    const Trated = (P * 9550) / 1450;
    let speedPoints = [], motorT = [], loadT = [];
    let totalTime = 0;
    const steps = 30;

    for (let i = 0; i <= steps; i++) {
        let n = i / steps;
        speedPoints.push(Math.round(n * 100));

        let baseT = (n < 0.7) ? design.lrt + (design.pullup - design.lrt) * (n / 0.7) :
                    (n < 0.9) ? design.pullup + (design.bdt - design.pullup) * ((n - 0.7) / 0.2) :
                    design.bdt - (design.bdt - 1.0) * ((n - 0.9) / 0.1);

        let reduction = (method === 'soft') ? Math.pow(limit / design.inrush, 2) : 
                        (method === 'stardelta' && n < 0.8) ? 0.33 : 1.0;
        
        let Tm = baseT * Trated * reduction * vFactor;
        let Tl = (document.getElementById('loadType').value === 'fan') ? Trated * Math.pow(n, 2) : Trated * 0.8; 
        
        motorT.push(Tm.toFixed(1));
        loadT.push(Tl.toFixed(1));

        if (i < steps) {
            let Ta = Tm - Tl;
            if (Ta > 0) {
                let deltaW = (1 / steps) * (1450 * 2 * Math.PI / 60);
                totalTime += (J * deltaW) / Ta;
            } else { totalTime = Infinity; }
        }
    }

    const irBase = (method === 'stardelta' ? 0.33 : 1) * (method === 'soft' ? limit / design.inrush : 1);
    document.getElementById('resI').innerText = (design.inrush * irBase * (parseFloat(vSlider.value)/100) * 100).toFixed(0) + "% Ir";
    
    const timeDisplay = document.getElementById('resTime');
    timeDisplay.innerText = (totalTime === Infinity) ? "STALLED" : totalTime.toFixed(2) + "s";
    timeDisplay.style.color = (totalTime === Infinity) ? "#f43f5e" : "#38bdf8";

    document.getElementById('warningBox').style.display = (totalTime > 12 || totalTime === Infinity) ? 'block' : 'none';
    
    renderChart(speedPoints, motorT, loadT);
});

function renderChart(labels, motor, load) {
    if (torqueChart) torqueChart.destroy();
    torqueChart = new Chart(ctxT, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Motor Torque (Nm)', data: motor, borderColor: '#38bdf8', borderWidth: 2, pointRadius: 0, tension: 0.3 },
                { label: 'Load Torque (Nm)', data: load, borderColor: '#64748b', borderDash: [5, 5], pointRadius: 0, tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#334155' } } },
            scales: { 
                x: { ticks: { color: '#64748b' } },
                y: { ticks: { color: '#64748b' } }
            }
        }
    });
}
