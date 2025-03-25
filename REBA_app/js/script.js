// Variables to store drawing state
let canvas, ctx;
let lines = {};
let points = [];
let currentTool = null;
let isDrawing = false;
let referenceDirection = 'vertical';
let previewLine = null;
let angles = {};

// Initialize Pyodide
async function main() {
    try {
        // Load Pyodide
        document.getElementById('loading').style.display = 'block';
        document.getElementById('app-container').style.display = 'none';
        
        const pyodide = await loadPyodide();
        window.pyodide = pyodide;
        
        // Load the Python REBA calculator functions
        await loadREBACalculator();
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        
        // Initialize canvas and event listeners
        initializeCanvas();
        setupEventListeners();
        
        // Mark first step as complete if we got here
        document.querySelector('[data-step="upload"]').classList.add('available');
    } catch (error) {
        console.error("Failed to load Pyodide:", error);
        document.getElementById('loading').innerHTML = 'Error loading Python environment: ' + error.message;
    }
}

// Load Python code for REBA calculator
async function loadREBACalculator() {
    try {
        // Load angle calculations and scoring functions from Python files
        const angleCalcResponse = await fetch('./python/angle_calculations.py');
        const angleCalcCode = await angleCalcResponse.text();
        
        const tablesResponse = await fetch('./python/tables_scoring.py');
        const tablesCode = await tablesResponse.text();
        
        // Run the Python code
        await window.pyodide.runPythonAsync(angleCalcCode);
        await window.pyodide.runPythonAsync(tablesCode);
        
        console.log("REBA Calculator Python code loaded successfully");
    } catch (error) {
        console.error("Failed to load REBA calculator Python code:", error);
        throw error; // Re-throw to be caught by caller
    }
}

// Initialize canvas
function initializeCanvas() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    // Resize handler to maintain aspect ratio
    window.addEventListener('resize', resizeCanvas);
    
    // Initial setup
    resizeCanvas();
}

// Resize canvas to maintain aspect ratio
function resizeCanvas() {
    const container = canvas.parentElement;
    const maxWidth = container.clientWidth;
    
    if (canvas.width > maxWidth) {
        const aspectRatio = canvas.height / canvas.width;
        canvas.style.width = maxWidth + 'px';
        canvas.style.height = (maxWidth * aspectRatio) + 'px';
    } else {
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';
    }
}

// Set up event listeners
function setupEventListeners() {
    // Image upload
    document.getElementById('image-upload').addEventListener('change', handleImageUpload);
    
    // Canvas drawing events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', drawPreview);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    
    // Tool selection buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            selectTool(this.id);
        });
    });
    
    // Other buttons
    document.getElementById('clear-canvas').addEventListener('click', clearCanvas);
    document.getElementById('undo-last').addEventListener('click', undoLastLine);
    document.getElementById('calculate-btn').addEventListener('click', calculateREBA);
}

// Handle image upload
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                // Resize canvas to match image dimensions
                canvas.width = img.width;
                canvas.height = img.height;
                resizeCanvas();
                
                // Clear canvas and draw image
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                
                // Reset drawing state
                lines = {};
                points = [];
                angles = {};
                
                // Update UI
                document.getElementById('instructions').textContent = 'Now draw a vertical reference line.';
                selectTool('draw-reference');
                updateCheckpoints('upload');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Select drawing tool
function selectTool(toolId) {
    // Reset previous selection
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Set new tool
    currentTool = toolId;
    document.getElementById(toolId).classList.add('selected');
    
    // Update instructions
    updateInstructions(toolId);
}

// Update instructions based on selected tool
function updateInstructions(toolId) {
    const instructions = {
        'draw-reference': 'Draw a vertical reference line on the image (floor to ceiling).',
        'draw-neck': 'Draw a line for the neck position.',
        'draw-trunk': 'Draw a line for the trunk position.',
        'draw-upper-leg': 'Draw a line for the upper leg.',
        'draw-lower-leg': 'Draw a line for the lower leg.',
        'draw-upper-arm': 'Draw a line for the upper arm.',
        'draw-lower-arm': 'Draw a line for the lower arm.',
        'draw-wrist': 'Draw a line for the wrist position.'
    };
    
    document.getElementById('instructions').textContent = instructions[toolId] || 'Select a tool to continue.';
}

// ... [rest of the functions from the previous script remain the same]

// Calculate REBA score
async function calculateREBA() {
    try {
        // Get angles from the drawn lines
        const neckAngle = angles['neck'] || 0;
        const trunkAngle = angles['trunk'] || 0;
        const legsAngle = Math.abs(angles['lower-leg'] - angles['upper-leg']) || 0;
        const upperArmAngle = angles['upper-arm'] || 0;
        const lowerArmAngle = Math.abs(angles['lower-arm'] - angles['upper-arm']) || 0;
        const wristAngle = Math.abs(angles['wrist'] - angles['lower-arm']) || 0;
        
        // Get adjustment values
        const neckTwisted = document.getElementById('neck-twisted').checked;
        const neckSideBending = document.getElementById('neck-side-bending').checked;
        const trunkTwisted = document.getElementById('trunk-twisted').checked;
        const trunkSideBending = document.getElementById('trunk-side-bending').checked;
        const legRaised = document.getElementById('leg-raised').checked;
        const shoulderRaised = document.getElementById('shoulder-raised').checked;
        const armAbducted = document.getElementById('arm-abducted').checked;
        const armSupported = document.getElementById('arm-supported').checked;
        const wristTwisted = document.getElementById('wrist-twisted').checked;
        const forceLevel = parseInt(document.getElementById('force-load').value);
        const shock = document.getElementById('shock-force').checked;
        const coupling = parseInt(document.getElementById('coupling').value);
        const staticPosture = document.getElementById('static-posture').checked;
        const repeatedActions = document.getElementById('repeated-actions').checked;
        const rapidChanges = document.getElementById('rapid-changes').checked;
        
        // Calculate individual component scores using Python functions
        const neckScore = await window.pyodide.runPythonAsync(`calculate_neck_score(${neckAngle}, ${neckTwisted}, ${neckSideBending})`);
        const trunkScore = await window.pyodide.runPythonAsync(`calculate_trunk_score(${trunkAngle}, ${trunkTwisted}, ${trunkSideBending})`);
        const legsScore = await window.pyodide.runPythonAsync(`calculate_legs_score(${legsAngle}, ${legRaised})`);
        const upperArmScore = await window.pyodide.runPythonAsync(`calculate_upper_arm_score(${upperArmAngle}, ${shoulderRaised}, ${armAbducted}, ${armSupported})`);
        const lowerArmScore = await window.pyodide.runPythonAsync(`calculate_lower_arm_score(${lowerArmAngle})`);
        const wristScore = await window.pyodide.runPythonAsync(`calculate_wrist_score(${wristAngle}, ${wristTwisted})`);
        const forceScore = await window.pyodide.runPythonAsync(`calculate_force_score(${forceLevel}, ${shock})`);
        const couplingScore = await window.pyodide.runPythonAsync(`calculate_coupling_score(${coupling})`);
        const activityScore = await window.pyodide.runPythonAsync(`calculate_activity_score(${staticPosture}, ${repeatedActions}, ${rapidChanges})`);
        
        // Create a dictionary of component scores to pass to the final calculation
        const componentScores = {
            'neck': neckScore,
            'trunk': trunkScore,
            'legs': legsScore,
            'force': forceScore,
            'upper_arm': upperArmScore,
            'lower_arm': lowerArmScore,
            'wrist': wristScore,
            'coupling': couplingScore,
            'activity': activityScore
        };
        
        // Convert scores to a Python dictionary
        const pyComponentScores = window.pyodide.toPy(componentScores);
        
        // Calculate final REBA score
        const finalResults = await window.pyodide.runPythonAsync(
            'calculate_final_reba_score(component_scores)',
            {component_scores: pyComponentScores}
        );
        
        // Convert Python dictionary to JavaScript object
        const jsResults = finalResults.toJs({create_proxies: false});
        
        // Merge with angle values for display
        const displayResults = {
            ...jsResults,
            neck_angle: neckAngle,
            trunk_angle: trunkAngle,
            legs_angle: legsAngle,
            upper_arm_angle: upperArmAngle,
            lower_arm_angle: lowerArmAngle,
            wrist_angle: wristAngle
        };
        
        // Display results
        displayREBAResults(displayResults);
    } catch (error) {
        console.error("Error calculating REBA score:", error);
        alert("Error calculating REBA score. Please check the console for details.");
    }
}

// Display results in the UI
function displayREBAResults(result) {
    // Show results section
    document.getElementById('results').style.display = 'block';
    
    // Update Group A scores
    document.getElementById('neck-score').textContent = result.neck_score;
    document.getElementById('neck-angle-value').textContent = result.neck_angle.toFixed(1);
    
    document.getElementById('trunk-score').textContent = result.trunk_score;
    document.getElementById('trunk-angle-value').textContent = result.trunk_angle.toFixed(1);
    
    document.getElementById('legs-score').textContent = result.legs_score;
    document.getElementById('legs-angle-value').textContent = result.legs_angle.toFixed(1);
    
    document.getElementById('posture-a-score').textContent = result.posture_a;
    document.getElementById('force-score').textContent = result.force_score;
    document.getElementById('score-a').textContent = result.score_a;
    
    // Update Group B scores
    document.getElementById('upper-arm-score').textContent = result.upper_arm_score;
    document.getElementById('upper-arm-angle-value').textContent = result.upper_arm_angle.toFixed(1);
    
    document.getElementById('lower-arm-score').textContent = result.lower_arm_score;
    document.getElementById('lower-arm-angle-value').textContent = result.lower_arm_angle.toFixed(1);
    
    document.getElementById('wrist-score').textContent = result.wrist_score;
    document.getElementById('wrist-angle-value').textContent = result.wrist_angle.toFixed(1);
    
    document.getElementById('posture-b-score').textContent = result.posture_b;
    document.getElementById('coupling-score').textContent = result.coupling_score;
    document.getElementById('score-b').textContent = result.score_b;
    
    // Update final scores
    document.getElementById('table-c-score').textContent = result.table_c_score;
    document.getElementById('activity-score').textContent = result.activity_score;
    document.getElementById('final-score').textContent = result.final_score;
    
    // Update risk level with appropriate styling
    const riskLevelElement = document.getElementById('risk-level');
    riskLevelElement.textContent = result.risk_level;
    
    // Add risk level class for styling
    riskLevelElement.className = 'risk-level';
    if (result.risk_level.includes("Very High")) {
        riskLevelElement.classList.add('risk-very-high');
    } else if (result.risk_level.includes("High")) {
        riskLevelElement.classList.add('risk-high');
    } else if (result.risk_level.includes("Medium")) {
        riskLevelElement.classList.add('risk-medium');
    } else {
        riskLevelElement.classList.add('risk-low');
    }
    
    // Scroll to results
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

// Run main function on page load
window.onload = main;
