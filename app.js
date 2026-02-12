// Register SW
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('./service-worker.js'); }); }

const ctx = document.getElementById('masterChart').getContext('2d');
let masterChart;

document.getElementById('vSupp').addEventListener('input', (e) => { document.getElementById('vDisp').innerText = e.target.value; });
document.getElementById('printBtn').addEventListener('click', () => { 
    document.getElementById('pdfProject').innerText = "Project: " + (document.getElementById('projName').value || "Unnamed");
    window.print(); 
});

document.getElementById('calcBtn').addEventListener('click', runSimulation);

function runSimulation() {
    // Inputs
    const P = parseFloat(document.getElementById('pKw').value);
    const RPM = parseFloat(document.getElementById('rpm').value);
    const J_total = parseFloat(document.getElementById('jMot').value) + parseFloat(document.getElementById('jLoad').value);
    const effFactor = parseFloat(document.getElementById('efficiency').value);
    const necInrush = parseFloat(document.getElementById('necCode').value);
    const method = document.getElementById('method').value;
    const vSupp = parseFloat(document.getElementById('vSupp').value) / 100;
    
    // Calculated Rated Values
    const T_rated = (P * 9550) / RPM;
    const I_lrc_mult = necInrush * effFactor; // Combined effect of NEC code and Efficiency
    
    let speedPoints = [], motorT = [], loadT = [], currentP = [];
    let time = 0;
    const steps = 50;

    for (let i = 0; i <= steps; i++) {
        let n = i / steps; // Normalised speed
        speedPoints.push(Math.round(n * 100));

        // 1. Realistic Torque Curve using Kloss-style interpolation
        // Standard NEMA B curve shape
        let baseT_perc = 0;
        if (n < 0.1) baseT_perc = 1.5; // LRT
        else if (n < 0.8) baseT_perc = 1.5 + (0.5 * (n / 0.8)); // Rise to BDT
        else if (n < 0.95) baseT_perc = 2.0 + (0.4 * ((n-0.8)/0.15)); // Peak BDT
        else baseT_perc = 2.4 - (1.4 * ((n-0.95)/0.05)); // Drop to Rated

        // Apply Voltage Reduction (T proportional to V^2)
        let v_applied = vSupp;
        if (method === 'stardelta' && n < 0.8) v_applied = vSupp * 0.577;
        
        let Tm = baseT_perc * T_rated * Math.pow(v_applied, 2);
        
        // 2. Load Torque
        let Tl = (document.getElementById('loadCurve').value === 'quad') 
                 ? T_rated * Math.pow(n, 2) 
                 : T_rated * 0.8;

        motorT.push(Tm.toFixed(1));
        loadT.push(Tl.toFixed(1));

        // 3. Current (%) - Linear with Voltage
        let Im = (n < 0.85) ? I_lrc_mult * v_applied : (I_lrc_mult * v_applied) * (1 - (n - 0.85) / 0.15 * 0.8);
        currentP.push((Im * 100).toFixed(0));

        // 4. Time Integration
        if (i < steps) {
            let T_accel = Tm - Tl;
            if (T_accel > 0) {
                let deltaW = (1 / steps) * (RPM * 2 * Math.PI / 60);
                time += (J_total * deltaW) / T_accel;
            } else {
                time = Infinity;
            }
        }
    }

    // Update UI
    document.getElementById('calcLRT').innerText = (1.5 * Math.pow(vSupp, 2) * 100).toFixed(0) + "%";
    document.getElementById('calcLRC').innerText = (I_lrc_mult * vSupp * 100).toFixed(0) + "%";
    document.getElementById('resTime').innerText = (time === Infinity) ? "STALLED" : time.toFixed(2) + "s";
    document.getElementById('stallWarn').style.display = (time === Infinity || time > 15) ? 'block' : 'none';

    drawChart(speedPoints, motorT, loadT, currentP);
}

function drawChart(labels, motor, load, current) {
    if (masterChart) masterChart.destroy();
    masterChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Motor Torque (Nm)', data: motor, borderColor: '#0ea5e9', yAxisID: 'y' },
                { label: 'Load Torque (Nm)', data: load, borderColor: '#64748b', borderDash: [5, 5], yAxisID: 'y' },
                { label: 'Current (%)', data: current, borderColor: '#f59e0b', yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Torque (Nm)' }, position: 'left' },
                y1: { title: { display: true, text: 'Current (%)' }, position: 'right', grid: { drawOnChartArea: false } },
                x: { title: { display: true, text: 'Speed (%)' } }
            }
        }
    });
}
