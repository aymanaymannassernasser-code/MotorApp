// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js');
    });
}

const ctxT = document.getElementById('torqueChart').getContext('2d');
let torqueChart;

document.getElementById('calcBtn').addEventListener('click', () => {
    const P = parseFloat(document.getElementById('power').value);
    const J = parseFloat(document.getElementById('inertia').value);
    const method = document.getElementById('method').value;

    // Simplified Engineering Logic
    const baseTorque = (P * 9550) / 1450; // Assuming 4-pole motor
    let multiplier = method === 'dol' ? 2.2 : (method === 'stardelta' ? 0.7 : 1.1);
    
    const startingCurrent = method === 'dol' ? '600%' : (method === 'stardelta' ? '200%' : '300%');
    document.getElementById('resI').innerText = startingCurrent;
    document.getElementById('resTime').innerText = (J * 2).toFixed(2); // Mock calc

    renderCharts(baseTorque, multiplier);
});

function renderCharts(base, mult) {
    if (torqueChart) torqueChart.destroy();
    
    torqueChart = new Chart(ctxT, {
        type: 'line',
        data: {
            labels: [0, 20, 40, 60, 80, 100],
            datasets: [{
                label: 'Torque (Nm) vs Speed (%)',
                data: [base * mult, base * (mult * 0.9), base * mult, base * 2.5, base],
                borderColor: '#3498db',
                tension: 0.4
            }]
        },
        options: { responsive: true }
    });
}