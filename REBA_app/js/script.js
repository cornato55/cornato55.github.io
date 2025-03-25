// Variables to store drawing state
let canvas, ctx;
let lines = {};
let points = [];
let currentTool = null;
let isDrawing = false;
let referenceDirection = 'vertical';
let previewLine = null;
let angles = {};

// Add this function near the top of the script, after variable declarations
function handleImageUpload(e) {
    console.log('handleImageUpload function called');
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                console.log('Image loaded');
                
                // Resize canvas to match image dimensions
                canvas.width = img.width;
                canvas.height = img.height;
                canvas.style.width = '100%';
                canvas.style.maxWidth = img.width + 'px';
                
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
                
                console.log('Canvas setup complete');
                
                // Force a redraw and recalculate scaling
                resizeCanvas();
            };
            img.onerror = function() {
                console.error('Error loading image');
            };
            img.src = event.target.result;
        };
        reader.onerror = function() {
            console.error('Error reading file');
        };
        reader.readAsDataURL(file);
    }
}

function startDrawing(e) {
    console.log('Start drawing called');
    console.log('Current tool:', currentTool);
    
    if (!currentTool) {
        console.log('No current tool selected');
        return;
    }
    
    isDrawing = true;
    
    // Get canvas coordinates
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    console.log('Drawing start coordinates:', x, y);
    
    // Start a new line
    points = [{x, y}];
    
    // Draw the first point
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawPreview(e) {
    if (!isDrawing || points.length === 0) return;
    
    // Get canvas coordinates
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Redraw the image and all lines
    redrawCanvas();
    
    // Draw preview line
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
}

function stopDrawing(e) {
    if (!isDrawing || !currentTool) return;
    
    // Get canvas coordinates
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Add ending point
    points.push({x, y});
    
    // Save the line
    const toolType = currentTool.replace('draw-', '');
    lines[toolType] = points.slice();
    
    // Calculate angle for this line
    const angle = calculateAngle(points[0], points[1], toolType);
    angles[toolType] = angle;
    
    // Draw final line
    redrawCanvas();
    drawLine(points[0], points[1], toolType);
    
    // Draw angle text
    const midX = (points[0].x + points[1].x) / 2;
    const midY = (points[0].y + points[1].y) / 2;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.font = '14px Arial';
    ctx.strokeText(`${angle.toFixed(1)}°`, midX + 10, midY);
    ctx.fillText(`${angle.toFixed(1)}°`, midX + 10, midY);
    
    // Reset drawing state
    isDrawing = false;
    points = [];
    
    // Enable undo button
    document.getElementById('undo-last').disabled = false;
    
    // Update checkpoints
    updateCheckpointForTool(toolType);
    
    // Auto-advance to next tool
    advanceToNextTool(toolType);
}

function updateCheckpoints(step) {
    // Mark the current step as complete
    const stepItem = document.querySelector(`[data-step="${step}"]`);
    if (stepItem) {
        stepItem.classList.add('complete');
    }
    
    // Make next step available
    const nextSteps = {
        'upload': 'reference',
        'reference': 'neck',
        'neck': 'trunk',
        'trunk': 'legs',
        'legs': 'arms',
        'arms': 'wrist',
        'wrist': 'adjustments'
    };
    
    const nextStep = nextSteps[step];
    if (nextStep) {
        const nextItem = document.querySelector(`[data-step="${nextStep}"]`);
        if (nextItem) {
            nextItem.classList.add('available');
        }
    }
    
    // Enable calculation button if all required steps are complete
    if (lines['reference'] && lines['neck'] && lines['trunk'] && 
        lines['upper-leg'] && lines['lower-leg'] && 
        lines['upper-arm'] && lines['lower-arm'] && lines['wrist']) {
        document.getElementById('adjustments-form').style.display = 'block';
        document.getElementById('calculate-btn').disabled = false;
        
        // Mark adjustments step as available
        document.querySelector('[data-step="adjustments"]').classList.add('available');
    }
}

function updateCheckpointForTool(toolType) {
    if (toolType === 'reference') {
        updateCheckpoints('upload');
    } else if (toolType === 'neck') {
        updateCheckpoints('reference');
    } else if (toolType === 'trunk') {
        updateCheckpoints('neck');
    } else if (toolType === 'upper-leg' || toolType === 'lower-leg') {
        if (lines['upper-leg'] && lines['lower-leg']) {
            updateCheckpoints('trunk');
        }
    } else if (toolType === 'upper-arm' || toolType === 'lower-arm') {
        if (lines['upper-arm'] && lines['lower-arm']) {
            updateCheckpoints('legs');
        }
    } else if (toolType === 'wrist') {
        updateCheckpoints('arms');
    }
}

// Initialize Pyodide
async function main() {
    console.log('Main function started');
    console.log('Document state:', document.readyState);
    
    try {
        // Ensure app container is visible
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.style.display = 'block';
        }
        
        // Load Pyodide
        document.getElementById('loading').style.display = 'block';
        
        const pyodide = await loadPyodide();
        window.pyodide = pyodide;
        
        // Load the Python REBA calculator functions
        await loadREBACalculator();
        
        document.getElementById('loading').style.display = 'none';
        
        // Initialize canvas and event listeners
        initializeCanvas();
        setupEventListeners();
        
        // Mark first step as complete
        const uploadStep = document.querySelector('[data-step="upload"]');
        if (uploadStep) {
            uploadStep.classList.add('available');
        }
        
        console.log('Main initialization complete');
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

function clearCanvas() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Reset drawing state
    lines = {};
    points = [];
    angles = {};
    
    // Redraw the image if available
    if (document.getElementById('image-upload').files.length > 0) {
        const img = new Image();
        img.src = URL.createObjectURL(document.getElementById('image-upload').files[0]);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    
    // Reset checkpoints
    document.querySelectorAll('.checkpoint-list li').forEach(li => {
        li.classList.remove('complete');
        li.classList.remove('available');
    });
    
    // Make first step available again
    document.querySelector('[data-step="upload"]').classList.add('available');
    
    // Reset UI
    document.getElementById('instructions').textContent = 'Upload an image to begin the REBA assessment.';
    document.getElementById('undo-last').disabled = true;
    document.getElementById('calculate-btn').disabled = true;
    document.getElementById('adjustments-form').style.display = 'none';
    document.getElementById('results').style.display = 'none';
}

function undoLastLine() {
    if (currentTool) {
        const toolType = currentTool.replace('draw-', '');
        if (lines[toolType]) {
            delete lines[toolType];
            delete angles[toolType];
            redrawCanvas();
        }
    }
    
    // If no more lines, disable undo button
    if (Object.keys(lines).length === 0) {
        document.getElementById('undo-last').disabled = true;
    }
}

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw the image if available
    if (document.getElementById('image-upload').files.length > 0) {
        const img = new Image();
        img.src = URL.createObjectURL(document.getElementById('image-upload').files[0]);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    
    // Redraw all saved lines
    for (const [toolType, points] of Object.entries(lines)) {
        if (points && points.length >= 2) {
            drawLine(points[0], points[1], toolType);
            
            // Redraw angle text
            if (angles[toolType] !== undefined) {
                const midX = (points[0].x + points[1].x) / 2;
                const midY = (points[0].y + points[1].y) / 2;
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 3;
                ctx.font = '14px Arial';
                ctx.strokeText(`${angles[toolType].toFixed(1)}°`, midX + 10, midY);
                ctx.fillText(`${angles[toolType].toFixed(1)}°`, midX + 10, midY);
            }
        }
    }
}

function drawLine(point1, point2, toolType) {
    // Different colors for different body parts
    const colors = {
        'reference': '#FFFFFF',
        'neck': '#FF5722',
        'trunk': '#2196F3',
        'upper-leg': '#4CAF50',
        'lower-leg': '#8BC34A',
        'upper-arm': '#FFC107',
        'lower-arm': '#FFEB3B',
        'wrist': '#9C27B0'
    };
    
    // Draw the line
    ctx.strokeStyle = colors[toolType] || '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(point1.x, point1.y);
    ctx.lineTo(point2.x, point2.y);
    ctx.stroke();
    
    // Draw end points
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(point1.x, point1.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(point2.x, point2.y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Add label
    const midX = (point1.x + point2.x) / 2;
    const midY = (point1.y + point2.y) / 2;
    ctx.fillStyle = 'black';
    ctx.font = '12px Arial';
    const labelMap = {
        'reference': 'Reference',
        'neck': 'Neck',
        'trunk': 'Trunk',
        'upper-leg': 'Upper Leg',
        'lower-leg': 'Lower Leg',
        'upper-arm': 'Upper Arm',
        'lower-arm': 'Lower Arm',
        'wrist': 'Wrist'
    };
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeText(labelMap[toolType], midX - 20, midY - 10);
    ctx.fillText(labelMap[toolType], midX - 20, midY - 10);
}

// Set up event listeners
function setupEventListeners() {
    console.log('Document state:', document.readyState);
    console.log('Attempting to set up event listeners');
    
    // Log all elements to diagnose what's missing
    console.log('Image Upload Element:', document.getElementById('image-upload'));
    console.log('Canvas Element:', document.getElementById('canvas'));
    console.log('App Container:', document.getElementById('app-container'));
    
    // Comprehensive logging of all potential issues
    try {
        const imageUpload = document.getElementById('image-upload');
        const canvas = document.getElementById('canvas');
        const appContainer = document.getElementById('app-container');
        
        if (!appContainer) {
            console.error('App container is missing!');
            return;
        }
        
        if (appContainer.style.display === 'none') {
            console.warn('App container is hidden');
        }
        
        if (!imageUpload) {
            console.error('Image upload element is missing');
            return;
        }
        
        if (!canvas) {
            console.error('Canvas element is missing');
            return;
        }
        
        // Proceed with event listener setup
        imageUpload.addEventListener('change', handleImageUpload);
        
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', drawPreview);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);
        
        // Add other event listeners similarly
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                selectTool(this.id);
            });
        });
        
        document.getElementById('clear-canvas').addEventListener('click', clearCanvas);
        document.getElementById('undo-last').addEventListener('click', undoLastLine);
        document.getElementById('calculate-btn').addEventListener('click', calculateREBA);
        
        console.log('All event listeners set up successfully');
    } catch (error) {
        console.error('Error setting up event listeners:', error);
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

function advanceToNextTool(toolType) {
    const nextToolMap = {
        'reference': 'draw-neck',
        'neck': 'draw-trunk',
        'trunk': 'draw-upper-leg',
        'upper-leg': 'draw-lower-leg',
        'lower-leg': 'draw-upper-arm',
        'upper-arm': 'draw-lower-arm',
        'lower-arm': 'draw-wrist'
    };
    
    const nextTool = nextToolMap[toolType];
    if (nextTool) {
        selectTool(nextTool);
    }
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
