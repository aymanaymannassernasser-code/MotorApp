if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('./service-worker.js'); }); }

const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

document.getElementById('vSupp').addEventListener('input', (e) => { document.getElementById('vDisp').innerText = e.target.value; });

document.getElementById('calcBtn').addEventListener('click', () => {
    const P = parseFloat(document.getElementById('pKw').value);
    const RPM = parseFloat(document.getElementById('rpm').value);
    const J = parseFloat(document.getElementById('jTotal').value);
    const vFact = parseFloat(document.getElementById('vSupp').value) / 100;
    
    // Datasheet values
    const LRT = (parseFloat(document.getElementById('overLRT').value) || 160) / 100;
    const LRC = (parseFloat(document.getElementById('overLRC').value) || 650) / 100;
    const BDT = 2.4; // Internal assumption for standard BDT
    
    // Load parameters
    const loadRatedTPerc = parseFloat(document.getElementById('loadDemand').value) / 100;
    const loadOffsetPerc = parseFloat(document.getElementById('loadOffset').value) / 100;
    
    const Trated = (P * 9550) / RPM;
    const ns = 1500; 
    const sb = 0.2; // Breakdown slip

    let labels = [], motorT = [], loadT = [], currentI = [];
    let totalTime = 0;
    let totalEnergy = 0; 
    const steps = 100;

    for (let i = 0; i <= steps; i++) {
        let n_perc = i / steps;
        let s = Math.max(0.001, 1 - n_perc);
        labels.push(Math.round(n_perc * 100));

        // Motor Torque (Kloss)
        let klossT = (2 * BDT) / ( (s / sb) + (sb / s) );
        if (n_perc < 0.2) {
            let blend = n_perc / 0.2;
            klossT = LRT * (1 - blend) + klossT * blend;
        }
        let Tm = klossT * Trated * Math.pow(vFact, 2);
        
        // Load Torque with Offset
        let Tl_base = (document.getElementById('loadCurve').value === 'quad') 
                      ? loadOffsetPerc + (loadRatedTPerc - loadOffsetPerc) * Math.pow(n_perc, 2)
                      : loadOffsetPerc + (loadRatedTPerc - loadOffsetPerc); // Constant
        
        let Tl = Tl_base * Trated;

        // Current Calculation
        let Im_pu = LRC * (1 - 0.15 * n_perc); 
        if (n_perc > 0.85) {
            let drop = (n_perc - 0.85) / 0.15;
            Im_pu = Im_pu * (1 - drop) + (1.0 * drop);
        }

        motorT.push(Tm.toFixed(1));
        loadT.push(Tl.toFixed(1));
        currentI.push((Im_pu * vFact * 100).toFixed(0));

        // Integration (Time & Energy)
        if (i < steps) {
            let Ta = Tm - Tl;
            if (Ta > 0) {
                let dw = (1 / steps) * (RPM * 2 * Math.PI / 60);
                let dt = (J * dw) / Ta;
                totalTime += dt;
                
                // Energy E = P * t. Rough estimate: P_rotor_loss = Slip * P_airgap
                // Simplified for field use: Total Energy in kJ
                totalEnergy += (P * (Im_pu * vFact) * dt); 
            } else { totalTime = Infinity; }
        }
    }

    document.getElementById('resTime').innerText = (totalTime === Infinity) ? "STALL" : totalTime.toFixed(2) + "s";
    document.getElementById('resEnergy').innerText = (totalTime === Infinity) ? "--" : Math.round(totalEnergy) + " kJ";
    document.getElementById('resPeakI').innerText = (LRC * vFact * 100).toFixed(0) + "% Ir";

    drawChart(labels, motorT, loadT, currentI);
});

function drawChart(labels, motor, load, current) {
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Motor Torque (Nm)', data: motor, borderColor: '#38bdf8', yAxisID: 'y', pointRadius: 0 },
                { label: 'Load Torque (Nm)', data: load, borderColor: '#f43f5e', borderDash: [5, 5], yAxisID: 'y', pointRadius: 0 },
                { label: 'Current (%)', data: current, borderColor: '#f59e0b', yAxisID: 'y1', pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Torque (Nm)' } },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', grid: { drawOnChartArea: false } }
            }
        }
    });
}
