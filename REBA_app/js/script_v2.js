// Variables to store drawing state
let canvas, ctx;
let lines = {};
let points = [];
let currentTool = null;
let isDrawing = false;
let referenceDirection = 'vertical';
let previewLine = null;
let angles = {};
let uploadedImage = null;
let drawingStep = 0; // 0: not drawing, 1: first point placed, waiting for second click
let subjectFacingDirection = 'right'; // Default value, will be set by user

let adjustments = {
  neck: { twisted: false, sideBending: false },
  trunk: { twisted: false, sideBending: false },
  legs: { raised: false },
  arms: { shoulderRaised: false, abducted: false, supported: false },
  wrist: { twisted: false },
  force: { level: 0, shock: false },
  coupling: { quality: 0 },
  activity: { staticPosture: false, repeatedActions: false, rapidChanges: false }
};

function synchronizeCanvasDimensions() {
    // Make sure display and internal dimensions are correctly related
    const displayWidth = parseFloat(canvas.style.width) || canvas.clientWidth;
    const displayHeight = parseFloat(canvas.style.height) || canvas.clientHeight;
    
    // Ensure CSS values have 'px' units
    if (!canvas.style.width.endsWith('px')) {
        canvas.style.width = displayWidth + 'px';
    }
    if (!canvas.style.height.endsWith('px')) {
        canvas.style.height = displayHeight + 'px';
    }
    
    console.log(`Canvas synchronized - Display: ${displayWidth}x${displayHeight}, Internal: ${canvas.width}x${canvas.height}`);
}

function calculateUpperArmAngle(shoulderPoint, elbowPoint) {
    // Get the trunk vector (assuming shoulder is at trunk[0] and hip is at trunk[1])
    const trunkVector = {
        x: lines['trunk'][0].x - lines['trunk'][1].x,
        y: lines['trunk'][0].y - lines['trunk'][1].y
    };
    
    // Get the upper arm vector
    const upperArmVector = {
        x: elbowPoint.x - shoulderPoint.x,
        y: elbowPoint.y - shoulderPoint.y
    };
    
    // Calculate the angle between vectors
    const dotProduct = trunkVector.x * upperArmVector.x + trunkVector.y * upperArmVector.y;
    const trunkMag = Math.sqrt(trunkVector.x * trunkVector.x + trunkVector.y * trunkVector.y);
    const armMag = Math.sqrt(upperArmVector.x * upperArmVector.x + upperArmVector.y * upperArmVector.y);
    
    // Calculate the angle in degrees
    let angle = Math.acos(dotProduct / (trunkMag * armMag)) * (180 / Math.PI);
    
    // Using cross product to determine if arm is in front or behind the trunk
    const crossProduct = trunkVector.x * upperArmVector.y - trunkVector.y * upperArmVector.x;
    
    // Determine if the arm is in front (anterior) or behind (posterior)
    const isArmInFront = (subjectFacingDirection === 'right' && crossProduct < 0) || 
                          (subjectFacingDirection === 'left' && crossProduct > 0);
    
    // Return positive angle for anterior (in front) and negative for posterior (behind)
    return isArmInFront ? angle : -angle;
}

// Calculate angle between two points for a specific body part
function calculateAngle(point1, point2, toolType) {
    // Don't calculate angle for reference line
    if (toolType === 'reference') {
        return 0;
    }
    
    // Special case for upper arm
    if (toolType === 'upper-arm' && lines['trunk']) {
        return calculateUpperArmAngle(point1, point2);
    }
    
    // For all other body parts, use the standard calculation
    // Calculate vector for this line
    const vector = {
        x: point2.x - point1.x,
        y: point2.y - point1.y
    };
    
    // Default reference is vertical (0, -1) because canvas Y is inverted
    let refVector = { x: 0, y: -1 };
    
    // For body parts that need reference to other body parts
    if (toolType === 'neck') {
        // Neck reference is trunk
        if (lines['trunk']) {
            const trunkVector = {
                x: lines['trunk'][1].x - lines['trunk'][0].x,
                y: lines['trunk'][1].y - lines['trunk'][0].y
            };
            refVector = trunkVector;
        }
    } else if (toolType === 'lower-arm') {
        // Lower arm reference is upper arm
        if (lines['upper-arm']) {
            const upperArmVector = {
                x: lines['upper-arm'][1].x - lines['upper-arm'][0].x,
                y: lines['upper-arm'][1].y - lines['upper-arm'][0].y
            };
            refVector = upperArmVector;
        }
    } else if (toolType === 'wrist') {
        // Wrist reference is lower arm
        if (lines['lower-arm']) {
            const lowerArmVector = {
                x: lines['lower-arm'][1].x - lines['lower-arm'][0].x,
                y: lines['lower-arm'][1].y - lines['lower-arm'][0].y
            };
            refVector = lowerArmVector;
        }
    } else if (toolType === 'lower-leg') {
        // Lower leg reference is upper leg
        if (lines['upper-leg']) {
            const upperLegVector = {
                x: lines['upper-leg'][1].x - lines['upper-leg'][0].x,
                y: lines['upper-leg'][1].y - lines['upper-leg'][0].y
            };
            refVector = upperLegVector;
        }
    } else if (toolType === 'trunk' || toolType === 'upper-leg') {
        // These use the reference line
        if (lines['reference']) {
            const referenceVector = {
                x: lines['reference'][1].x - lines['reference'][0].x,
                y: lines['reference'][1].y - lines['reference'][0].y
            };
            refVector = referenceVector;
        }
    }
    
    // Calculate dot product
    const dotProduct = vector.x * refVector.x + vector.y * refVector.y;
    
    // Calculate magnitudes
    const vectorMag = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    const refMag = Math.sqrt(refVector.x * refVector.x + refVector.y * refVector.y);
    
    // Calculate angle using dot product formula
    let angle = Math.acos(dotProduct / (vectorMag * refMag)) * (180 / Math.PI);
    
    // Use cross product to determine direction
    const crossProduct = vector.x * refVector.y - vector.y * refVector.x;
    
    // Adjust angle sign based on cross product
    if (crossProduct < 0) {
        angle = -angle;
    }
    
    // Fix trunk angle for right-facing subjects
    if (toolType === 'trunk' && subjectFacingDirection === 'right') {
        angle = -angle; // Invert the sign for trunk when subject faces right
    }
    
    console.log(`${toolType} angle: ${angle.toFixed(1)}° (Subject facing: ${subjectFacingDirection})`);
    
    return angle;
}

// REBA Calculation Functions (Converted from Python to JavaScript)

// Neck score calculation
function calculateNeckScore(angle, twisted = false, sideBending = false) {
    // Base score depends on flexion/extension angle
    let baseScore;
    
    if (angle < 0) {  // Extension (backward)
        baseScore = 2;
    } else if (angle > 20) {  // Flexion > 20 degrees
        baseScore = 2;
    } else {  // Flexion 0-20 degrees (always scores 1)
        baseScore = 1;
    }
    
    // Add adjustments
    if (twisted) {
        baseScore += 1;
    }
    if (sideBending) {
        baseScore += 1;
    }
    
    console.log(`Neck score: ${baseScore} (angle: ${angle.toFixed(1)}°)`);
    return baseScore;
}

// Trunk score calculation
function calculateTrunkScore(angle, twisted = false, sideBending = false) {
    // Determine base score from angle with 3° margin for upright position
    let baseScore;
    
    if (-3 <= angle && angle <= 3) {  // Upright (with 3° margin)
        baseScore = 1;
    } else if (angle < -3) {  // Extension
        baseScore = 2;
    } else if (3 < angle && angle <= 20) {  // Slight flexion
        baseScore = 2;
    } else if (20 < angle && angle < 60) {  // Moderate flexion
        baseScore = 3;
    } else {  // angle >= 60, Significant flexion
        baseScore = 4;
    }
    
    // Add adjustments
    if (twisted) {
        baseScore += 1;
    }
    if (sideBending) {
        baseScore += 1;
    }
    
    console.log(`Trunk score: ${baseScore} (angle: ${angle.toFixed(1)}°)`);
    return baseScore;
}

// Legs score calculation
function calculateLegsScore(angle, legRaised = false) {
    // Start with base score of 1 (bilateral weight bearing)
    let baseScore = 1;
    
    // Adjust score based on knee flexion
    if (angle <= 30) {
        // Base score remains 1 for knee flexion ≤ 30°
    } else if (angle <= 60) {
        // Score of 2 for knee flexion 31-60°
        baseScore = 2;
    } else {
        // Score of 3 for knee flexion > 60°
        baseScore = 3;
    }
    
    // Add for one leg raised
    if (legRaised) {
        baseScore += 1;
    }
    
    console.log(`Legs score: ${baseScore} (angle: ${angle.toFixed(1)}°)`);
    return baseScore;
}

// Upper arm score calculation
function calculateUpperArmScore(angle, shoulderRaised = false, armAbducted = false, armSupported = false) {
    // Calculate base score from angle
    let baseScore;
    
    if (angle < -20) {  // Extension > 20°
        baseScore = 2;
    } else if (-20 <= angle && angle <= 20) {  // -20° to 20° (slight movement)
        baseScore = 1;
    } else if (20 < angle && angle <= 45) {  // 21° to 45° flexion
        baseScore = 2;
    } else if (45 < angle && angle <= 90) {  // 46° to 90° flexion
        baseScore = 3;
    } else {  // > 90° flexion
        baseScore = 4;
    }
    
    // Apply adjustments
    if (shoulderRaised) {
        baseScore += 1;
    }
    if (armAbducted) {
        baseScore += 1;
    }
    if (armSupported || angle < 0) {  // Support or gravity assisted position
        baseScore -= 1;
    }
    
    // Ensure minimum score of 1
    baseScore = Math.max(1, baseScore);
    
    console.log(`Upper arm score: ${baseScore} (angle: ${angle.toFixed(1)}°)`);
    return baseScore;
}

// Lower arm score calculation
function calculateLowerArmScore(angle) {
    // Optimal range is 60-100 degrees
    if (60 <= angle && angle <= 100) {
        console.log(`Lower arm score: 1 (angle: ${angle.toFixed(1)}°)`);
        return 1;
    } else {
        // Either < 60 (too extended) or > 100 (too flexed)
        console.log(`Lower arm score: 2 (angle: ${angle.toFixed(1)}°)`);
        return 2;
    }
}

// Wrist score calculation
function calculateWristScore(angle, twisted = false) {
    // Base score depends on absolute angle (flexion or extension)
    let baseScore;
    
    if (Math.abs(angle) <= 15) {  // -15° to 15°
        baseScore = 1;
    } else {  // > 15° in either direction
        baseScore = 2;
    }
    
    // Add for wrist twisted or bent from midline
    if (twisted) {
        baseScore += 1;
    }
    
    console.log(`Wrist score: ${baseScore} (angle: ${angle.toFixed(1)}°)`);
    return baseScore;
}

function logREBAScores(angles, scores) {
    console.log("========== REBA SCORE CALCULATION ==========");
    console.log(`Subject facing: ${subjectFacingDirection}`);
    console.log(`Neck angle: ${angles.neck?.toFixed(1)}° → Score: ${scores.neck}`);
    console.log(`Trunk angle: ${angles.trunk?.toFixed(1)}° → Score: ${scores.trunk}`);
    console.log(`Legs angle: ${angles.legs?.toFixed(1)}° → Score: ${scores.legs}`);
    console.log(`Upper arm angle: ${angles.upper_arm?.toFixed(1)}° → Score: ${scores.upper_arm}`);
    console.log(`Lower arm angle: ${angles.lower_arm?.toFixed(1)}° → Score: ${scores.lower_arm}`);
    console.log(`Wrist angle: ${angles.wrist?.toFixed(1)}° → Score: ${scores.wrist}`);
    console.log(`Force/Load score: ${scores.force}`);
    console.log(`Coupling score: ${scores.coupling}`);
    console.log(`Activity score: ${scores.activity}`);
    console.log(`Table A score: ${scores.posture_a}`);
    console.log(`Score A: ${scores.score_a}`);
    console.log(`Table B score: ${scores.posture_b}`);
    console.log(`Score B: ${scores.score_b}`);
    console.log(`Table C score: ${scores.table_c_score}`);
    console.log(`FINAL REBA SCORE: ${scores.final_score} → ${scores.risk_level}`);
    console.log("===========================================");
}

// Table A lookup function
function calculateTableA(neckScore, trunkScore, legsScore) {
    // Table A lookup matrix (3D array)
    const tableA = [
        // Neck=1
        [
            // Legs 1,2,3,4
            [1, 2, 3, 4],  // Trunk=1
            [2, 3, 4, 5],  // Trunk=2
            [3, 4, 5, 6],  // Trunk=3
            [4, 5, 6, 7],  // Trunk=4
            [5, 6, 7, 8],  // Trunk=5
        ],
        // Neck=2
        [
            // Legs 1,2,3,4
            [1, 3, 4, 5],  // Trunk=1
            [2, 4, 5, 6],  // Trunk=2
            [3, 5, 6, 7],  // Trunk=3
            [4, 6, 7, 8],  // Trunk=4
            [5, 7, 8, 9],  // Trunk=5
        ],
        // Neck=3
        [
            // Legs 1,2,3,4
            [3, 3, 5, 6],  // Trunk=1
            [3, 5, 6, 7],  // Trunk=2
            [4, 6, 7, 8],  // Trunk=3
            [5, 7, 8, 9],  // Trunk=4
            [6, 8, 9, 9],  // Trunk=5
        ]
    ];
    
    // Ensure indices are within bounds
    const neckIdx = Math.min(Math.max(neckScore - 1, 0), 2);  // 0-2 (for scores 1-3)
    const trunkIdx = Math.min(Math.max(trunkScore - 1, 0), 4);  // 0-4 (for scores 1-5)
    const legsIdx = Math.min(Math.max(legsScore - 1, 0), 3);  // 0-3 (for scores 1-4)
    
    // Return the looked-up score
    return tableA[neckIdx][trunkIdx][legsIdx];
}

// Table B lookup function
function calculateTableB(upperArmScore, lowerArmScore, wristScore) {
    // Table B lookup matrix
    const tableB = [
        // Lower Arm=1
        [
            // Wrist 1,2,3
            [1, 2, 2],  // Upper Arm=1
            [1, 2, 3],  // Upper Arm=2
            [3, 4, 5],  // Upper Arm=3
            [4, 5, 5],  // Upper Arm=4
            [6, 7, 8],  // Upper Arm=5
            [7, 8, 8],  // Upper Arm=6
        ],
        // Lower Arm=2
        [
            // Wrist 1,2,3
            [1, 2, 3],  // Upper Arm=1
            [2, 3, 4],  // Upper Arm=2
            [4, 5, 5],  // Upper Arm=3
            [5, 6, 7],  // Upper Arm=4
            [7, 8, 8],  // Upper Arm=5
            [8, 9, 9],  // Upper Arm=6
        ]
    ];
    
    // Ensure indices are within bounds
    const upperArmIdx = Math.min(Math.max(upperArmScore - 1, 0), 5);  // 0-5 (for scores 1-6)
    const lowerArmIdx = Math.min(Math.max(lowerArmScore - 1, 0), 1);  // 0-1 (for scores 1-2)
    const wristIdx = Math.min(Math.max(wristScore - 1, 0), 2);  // 0-2 (for scores 1-3)
    
    // Return the looked-up score
    return tableB[lowerArmIdx][upperArmIdx][wristIdx];
}

// Table C lookup function
function calculateTableC(scoreA, scoreB) {
    // Table C lookup matrix
    const tableC = [
        // Score B values (1-12)
        // 1  2  3  4  5  6  7  8  9 10 11 12
        [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],  // Score A=1
        [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],  // Score A=2
        [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],  // Score A=3
        [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],  // Score A=4
        [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],  // Score A=5
        [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],  // Score A=6
        [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],  // Score A=7
        [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],  // Score A=8
        [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],  // Score A=9
        [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],  // Score A=10
        [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],  // Score A=11
        [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],  // Score A=12
    ];
    
    // Ensure indices are within bounds
    const scoreAIdx = Math.min(Math.max(scoreA - 1, 0), 11);  // 0-11 (for scores 1-12)
    const scoreBIdx = Math.min(Math.max(scoreB - 1, 0), 11);  // 0-11 (for scores 1-12)
    
    // Return the looked-up score
    return tableC[scoreAIdx][scoreBIdx];
}

// Force score calculation
function calculateForceScore(forceLevel, shock = false) {
    let score = forceLevel;  // 0 for light, 1 for medium, 2 for heavy
    if (shock) {
        score += 1;
    }
    return score;
}

// Coupling score calculation
function calculateCouplingScore(couplingQuality) {
    return couplingQuality;  // 0-3 based on quality
}

// Activity score calculation
function calculateActivityScore(staticPosture, repeatedActions, rapidChanges) {
    let score = 0;
    if (staticPosture) {
        score += 1;
    }
    if (repeatedActions) {
        score += 1;
    }
    if (rapidChanges) {
        score += 1;
    }
    return score;
}

// Get risk level based on final score
function getRiskLevel(finalScore) {
    if (finalScore >= 11) {
        return "Very High Risk. Implement Change";
    } else if (finalScore >= 8) {
        return "High Risk. Investigate and Implement Change Soon";
    } else if (finalScore >= 4) {
        return "Medium Risk. Further Investigation, Change Soon";
    } else {
        return "Low Risk. Change May Be Needed";
    }
}

// Calculate final REBA score from all components
function calculateFinalRebaScore(scores) {
    // Extract scores from the object
    const { neck, trunk, legs, force, upper_arm, lower_arm, wrist, coupling, activity } = scores;
    
    // Calculate table scores
    const postureA = calculateTableA(neck, trunk, legs);
    const scoreA = postureA + force;
    
    const postureB = calculateTableB(upper_arm, lower_arm, wrist);
    const scoreB = postureB + coupling;
    
    const tableCScore = calculateTableC(scoreA, scoreB);
    const finalScore = tableCScore + activity;
    
    // Determine risk level
    const riskLevel = getRiskLevel(finalScore);
    
    // Return all scores for detailed report
    return {
        'neck_score': neck,
        'trunk_score': trunk,
        'legs_score': legs,
        'force_score': force,
        'upper_arm_score': upper_arm,
        'lower_arm_score': lower_arm,
        'wrist_score': wrist,
        'coupling_score': coupling,
        'activity_score': activity,
        'posture_a': postureA,
        'score_a': scoreA,
        'posture_b': postureB,
        'score_b': scoreB,
        'table_c_score': tableCScore,
        'final_score': finalScore,
        'risk_level': riskLevel
    };
}

function handleImageUpload(e) {
    console.log('handleImageUpload function called');
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            uploadedImage = new Image();
            uploadedImage.onload = function() {
                console.log('Image loaded');
                
                // Calculate container dimensions
                const container = canvas.parentElement;
                const containerWidth = container.clientWidth - 40; // Allow some padding
                
                // Calculate aspect ratio-preserving dimensions
                const imageAspectRatio = uploadedImage.height / uploadedImage.width;
                
                // Set size based on container width while preserving aspect ratio
                let canvasWidth = containerWidth;
                let canvasHeight = Math.round(containerWidth * imageAspectRatio);
                
                // If too tall, scale down to fit viewport height
                const maxHeight = window.innerHeight * 0.7;
                if (canvasHeight > maxHeight) {
                    canvasHeight = maxHeight;
                    canvasWidth = Math.round(maxHeight / imageAspectRatio);
                }
                
                // Set internal canvas dimensions (pixel resolution)
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                
                // Set display dimensions to match exactly
                canvas.style.width = canvasWidth + 'px';
                canvas.style.height = canvasHeight + 'px';
                
                // Ensure dimensions are synchronized
                synchronizeCanvasDimensions();
                
                // Draw the image with proper aspect ratio
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(uploadedImage, 0, 0, canvasWidth, canvasHeight);
                
                // Reset drawing state
                lines = {};
                points = [];
                angles = {};
                drawingStep = 0;
                
                // Mark upload step as complete
                const uploadItem = document.querySelector('[data-step="upload"]');
                if (uploadItem) {
                    uploadItem.classList.add('complete');
                }
                
                // Prompt for subject direction before proceeding
                promptForSubjectDirection();
                
                // NOTE: The following steps will now be handled in the callbacks of promptForSubjectDirection()
                
                console.log('Canvas setup complete with proper aspect ratio:', canvas.width, 'x', canvas.height);
            };
            uploadedImage.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function promptForSubjectDirection() {
    // Create a popup overlay
    const popup = document.createElement('div');
    popup.className = 'direction-popup';
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#1f1f1f';
    popup.style.color = '#e0e0e0';
    popup.style.padding = '20px';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    popup.style.zIndex = '1000';
    popup.style.maxWidth = '90%';
    popup.style.width = 'auto';
    popup.style.textAlign = 'center';

    // Create popup content
    popup.innerHTML = `
        <h3>Which direction is the subject facing?</h3>
        <p>This helps calculate angles correctly.</p>
        <div style="display: flex; justify-content: space-around; margin-top: 20px;">
            <button id="facing-left" style="padding: 10px 20px; background-color: #64b5f6; border: none; border-radius: 4px; color: white; cursor: pointer; margin: 5px;">Facing Left</button>
            <button id="facing-right" style="padding: 10px 20px; background-color: #64b5f6; border: none; border-radius: 4px; color: white; cursor: pointer; margin: 5px;">Facing Right</button>
        </div>
    `;

    // Add an overlay to prevent clicking outside
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '999';
    
    // Add to document
    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    // Function to proceed with drawing reference line
    function proceedToReferenceLineTool() {
        // Update instruction text
        document.getElementById('instructions').textContent = 'Draw a vertical reference line behind the subject.';
        
        // Automatically select the reference line tool
        selectTool('draw-reference');
        
        // Update checkpoint status
        updateCheckpoints('upload');
        
        // Make reference step available
        const referenceItem = document.querySelector('[data-step="reference"]');
        if (referenceItem) {
            referenceItem.classList.add('available');
        }
    }

    // Add event listeners to buttons
    document.getElementById('facing-left').addEventListener('click', function() {
        subjectFacingDirection = 'left';
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
        console.log('Subject direction set to: left');
        // Proceed with drawing reference line
        proceedToReferenceLineTool();
    });

    document.getElementById('facing-right').addEventListener('click', function() {
        subjectFacingDirection = 'right';
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
        console.log('Subject direction set to: right');
        // Proceed with drawing reference line
        proceedToReferenceLineTool();
    });
}


function getCanvasCoordinates(e) {
    // First, check if this is a touch event
    let clientX, clientY;
    if (e.type.startsWith('touch')) {
        const touch = e.touches[0] || e.changedTouches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    // Get the canvas position
    const rect = canvas.getBoundingClientRect();
    
    // Calculate coordinates - direct mapping without scaling
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    return { x, y };
}

// Add touch event handlers for mobile support
function setupTouchEventListeners() {
    // Convert touch events to mouse events
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault(); // Prevent scrolling when touching the canvas
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    }, false);
    
    canvas.addEventListener('touchmove', function(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        canvas.dispatchEvent(mouseEvent);
    }, false);
    
    canvas.addEventListener('touchend', function(e) {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup', {});
        canvas.dispatchEvent(mouseEvent);
    }, false);
}

// Start drawing
function startDrawing(e) {
    console.log('Start drawing called');
    console.log('Current tool:', currentTool);
    
    if (!currentTool) {
        console.log('No current tool selected');
        return;
    }

    e.preventDefault();
    
    // Check if click is within canvas boundaries
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    
    // Ensure the click is within the canvas
    if (clientX < rect.left || clientX > rect.right || 
        clientY < rect.top || clientY > rect.bottom) {
        console.log('Click outside canvas boundaries');
        return;
    }
    
    // Get canvas coordinates
    const coordinates = getCanvasCoordinates(e);
    const x = coordinates.x;
    const y = coordinates.y;
    
    console.log('Drawing coordinates:', x, y, 'Step:', drawingStep);
    
    // First click - place first point
    if (drawingStep === 0) {
        // Start a new line
        points = [{x, y}];
        
        // Draw the first point
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Update state
        drawingStep = 1;
        
        console.log('First point placed');
    } 
    // Second click - complete the line
    else if (drawingStep === 1) {
        // Add second point
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
        drawingStep = 0;
        points = [];
        
        // Enable undo button
        document.getElementById('undo-last').disabled = false;
        
        // Update checkpoints
        updateCheckpointForTool(toolType);
        
        // Show adjustment popup
        showAdjustmentPopup(toolType);
        
        console.log('Line completed');
    }
}

// Draw preview line
function drawPreview(e) {
    // Only preview if first point is placed
    if (drawingStep !== 1 || points.length === 0) return;
    
    e.preventDefault();
    
    // Get canvas coordinates
    const coordinates = getCanvasCoordinates(e);
    const x = coordinates.x;
    const y = coordinates.y;
    
    // Redraw the canvas
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
    
    // Redraw the first point for emphasis
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, 4, 0, Math.PI * 2);
    ctx.fill();
}

// Stop drawing and complete the line
function stopDrawing(e) {
    if (!isDrawing || !currentTool) return;
    
    e.preventDefault();
    
	const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
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
    
    // Show adjustment popup
    showAdjustmentPopup(toolType);
	
	// If all measurements are complete, update instructions and highlight calculate button
    if (toolType === 'wrist' && 
        lines['reference'] && lines['neck'] && lines['trunk'] && 
        lines['upper-leg'] && lines['lower-leg'] && 
        lines['upper-arm'] && lines['lower-arm'] && lines['wrist']) {
        
        // Update instruction text
        document.getElementById('instructions').textContent = 'All measurements complete. Click "Calculate REBA Score" to see results.';
        
        // Enable and highlight calculate button
        const calculateBtn = document.getElementById('calculate-btn');
        calculateBtn.disabled = false;
        
        // Scroll to the calculate button
        calculateBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
	
}

// Show adjustment popup for additional factors
function showAdjustmentPopup(toolType) {
    // Create a popup overlay
    const popup = document.createElement('div');
    popup.className = 'adjustment-popup';
    popup.style.position = 'absolute';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = 'white';
    popup.style.padding = '20px';
    popup.style.borderRadius = '10px';
    popup.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.3)';
    popup.style.zIndex = '1000';
    popup.style.maxWidth = '400px';
    popup.style.width = '90%';
    popup.style.color = '#333'; // Ensure readable text

    // Create popup content based on the tool type
    let content = '';
    let controls = '';

    switch (toolType) {
        case 'neck':
            content = `<h3>Neck Adjustments</h3>
                      <p>Please select any additional factors for the neck position:</p>`;
            controls = `
              <div class="adjustment-control">
                <input type="checkbox" id="popup-neck-twisted" />
                <label for="popup-neck-twisted">Neck is twisted</label>
              </div>
              <div class="adjustment-control">
                <input type="checkbox" id="popup-neck-side-bending" />
                <label for="popup-neck-side-bending">Neck is side bending</label>
              </div>`;
            break;
        case 'trunk':
            content = `<h3>Trunk Adjustments</h3>
                      <p>Please select any additional factors for the trunk position:</p>`;
            controls = `
              <div class="adjustment-control">
                <input type="checkbox" id="popup-trunk-twisted" />
                <label for="popup-trunk-twisted">Trunk is twisted</label>
              </div>
              <div class="adjustment-control">
                <input type="checkbox" id="popup-trunk-side-bending" />
                <label for="popup-trunk-side-bending">Trunk is side bending</label>
              </div>`;
            break;
        case 'upper-leg':
            content = `<h3>Legs Adjustments</h3>
                      <p>Please select any additional factors for the leg position:</p>`;
            controls = `
              <div class="adjustment-control">
                <input type="checkbox" id="popup-leg-raised" />
                <label for="popup-leg-raised">Leg is raised / weight on one side</label>
              </div>`;
            break;
        case 'upper-arm':
            content = `<h3>Upper Arm Adjustments</h3>
                      <p>Please select any additional factors for the arm position:</p>`;
            controls = `
              <div class="adjustment-control">
                <input type="checkbox" id="popup-shoulder-raised" />
                <label for="popup-shoulder-raised">Shoulder is raised</label>
              </div>
              <div class="adjustment-control">
                <input type="checkbox" id="popup-arm-abducted" />
                <label for="popup-arm-abducted">Arm is abducted</label>
              </div>
              <div class="adjustment-control">
                <input type="checkbox" id="popup-arm-supported" />
                <label for="popup-arm-supported">Arm is supported / person leaning</label>
              </div>`;
            break;
        case 'wrist':
            content = `<h3>Wrist Adjustments</h3>
                      <p>Please select any additional factors for the wrist position:</p>`;
            controls = `
              <div class="adjustment-control">
                <input type="checkbox" id="popup-wrist-twisted" />
                <label for="popup-wrist-twisted">Wrist is twisted / deviated</label>
              </div>`;
            break;
        case 'lower-leg':
            // Show force and coupling adjustments when lower leg is completed
            content = `<h3>Force and Coupling</h3>
                      <p>Please select the appropriate force/load and coupling quality:</p>`;
            controls = `
              <div class="adjustment-control">
                <label for="popup-force-load">Force/Load:</label>
                <select id="popup-force-load">
                  <option value="0">< 5 kg (light)</option>
                  <option value="1">5-10 kg (medium)</option>
                  <option value="2">> 10 kg (heavy)</option>
                </select>
              </div>
              <div class="adjustment-control">
                <input type="checkbox" id="popup-shock-force" />
                <label for="popup-shock-force">Sudden or jerky forces</label>
              </div>
              <div class="adjustment-control">
                <label for="popup-coupling">Coupling/Grip:</label>
                <select id="popup-coupling">
                  <option value="0">Good (well-fitted handles)</option>
                  <option value="1">Fair (acceptable but not ideal)</option>
                  <option value="2">Poor (not acceptable)</option>
                  <option value="3">Unacceptable (unsafe, no handles)</option>
                </select>
              </div>`;
            break;
        case 'lower-arm':
        case 'reference':
            // Skip adjustments for these
            advanceToNextTool(toolType);
            return;
        default:
            if (toolType === 'wrist' && Object.keys(lines).length >= 7) {
                // Final activity adjustments after all measurements are done
                content = `<h3>Activity Adjustments</h3>
                        <p>Please select any additional activity factors:</p>`;
                controls = `
                <div class="adjustment-control">
                  <input type="checkbox" id="popup-static-posture" />
                  <label for="popup-static-posture">Static posture (held >1 minute)</label>
                </div>
                <div class="adjustment-control">
                  <input type="checkbox" id="popup-repeated-actions" />
                  <label for="popup-repeated-actions">Repeated actions (>4x per minute)</label>
                </div>
                <div class="adjustment-control">
                  <input type="checkbox" id="popup-rapid-changes" />
                  <label for="popup-rapid-changes">Rapid changes in posture</label>
                </div>`;
            } else {
                // Skip and advance to next tool
                advanceToNextTool(toolType);
                return;
            }
    }

    // Build the popup HTML
    popup.innerHTML = `
      ${content}
      <form id="adjustment-form">
        ${controls}
        <div class="button-group" style="margin-top: 20px; text-align: right;">
          <button type="button" id="popup-next" style="padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px;">Next</button>
        </div>
      </form>
    `;

    // Add the popup to the body
    document.body.appendChild(popup);

    // Add an overlay to prevent clicking outside
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '999';
    document.body.appendChild(overlay);

    // Add event listeners to the buttons
    document.getElementById('popup-next').addEventListener('click', function() {
        saveAdjustments(toolType);
        closePopup();
        advanceToNextTool(toolType);
    });
    
    // Function to close the popup
    function closePopup() {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    }

    // Function to save the adjustments
    function saveAdjustments(toolType) {
        switch (toolType) {
            case 'neck':
                adjustments.neck.twisted = document.getElementById('popup-neck-twisted').checked;
                adjustments.neck.sideBending = document.getElementById('popup-neck-side-bending').checked;
                break;
            case 'trunk':
                adjustments.trunk.twisted = document.getElementById('popup-trunk-twisted').checked;
                adjustments.trunk.sideBending = document.getElementById('popup-trunk-side-bending').checked;
                break;
            case 'upper-leg':
                adjustments.legs.raised = document.getElementById('popup-leg-raised').checked;
                break;
            case 'upper-arm':
                adjustments.arms.shoulderRaised = document.getElementById('popup-shoulder-raised').checked;
                adjustments.arms.abducted = document.getElementById('popup-arm-abducted').checked;
                adjustments.arms.supported = document.getElementById('popup-arm-supported').checked;
                break;
            case 'wrist':
                adjustments.wrist.twisted = document.getElementById('popup-wrist-twisted').checked;
                break;
            case 'lower-leg':
                adjustments.force.level = parseInt(document.getElementById('popup-force-load').value);
                adjustments.force.shock = document.getElementById('popup-shock-force').checked;
                adjustments.coupling.quality = parseInt(document.getElementById('popup-coupling').value);
                break;
            default:
                if (toolType === 'wrist' && Object.keys(lines).length >= 7) {
                    adjustments.activity.staticPosture = document.getElementById('popup-static-posture').checked;
                    adjustments.activity.repeatedActions = document.getElementById('popup-repeated-actions').checked;
                    adjustments.activity.rapidChanges = document.getElementById('popup-rapid-changes').checked;
                    
                    // If this is the final adjustment, calculate the REBA score
                    if (Object.keys(lines).length >= 7) {
                        calculateREBA();
                    }
                }
        }
    }
}

// Update checkpoints
function updateCheckpoints(step) {
    // Mark the current step as complete
    const stepItem = document.querySelector(`[data-step="${step}"]`);
    if (stepItem) {
        stepItem.classList.add('complete');
    }
    
    // Make next step available based on the defined sequence
    const nextSteps = {
        'upload': 'reference',
        'reference': 'neck',
        'neck': 'trunk',
        'trunk': 'legs',
        'legs': 'arms',
        'arms': 'wrist'
    };
    
    const nextStep = nextSteps[step];
    if (nextStep) {
        const nextItem = document.querySelector(`[data-step="${nextStep}"]`);
        if (nextItem) {
            nextItem.classList.add('available');
        }
    }
}


function updateCheckpointForTool(toolType) {
    // Directly mark the corresponding checkpoint as complete based on the tool used
    if (toolType === 'reference') {
        // Mark reference step as complete immediately
        const referenceItem = document.querySelector('[data-step="reference"]');
        if (referenceItem) {
            referenceItem.classList.add('complete');
        }
        // Make neck step available
        const neckItem = document.querySelector('[data-step="neck"]');
        if (neckItem) {
            neckItem.classList.add('available');
        }
    } else if (toolType === 'neck') {
        // Mark neck step as complete immediately
        const neckItem = document.querySelector('[data-step="neck"]');
        if (neckItem) {
            neckItem.classList.add('complete');
        }
        // Make trunk step available
        const trunkItem = document.querySelector('[data-step="trunk"]');
        if (trunkItem) {
            trunkItem.classList.add('available');
        }
    } else if (toolType === 'trunk') {
        // Mark trunk step as complete immediately
        const trunkItem = document.querySelector('[data-step="trunk"]');
        if (trunkItem) {
            trunkItem.classList.add('complete');
        }
        // Make legs step available
        const legsItem = document.querySelector('[data-step="legs"]');
        if (legsItem) {
            legsItem.classList.add('available');
        }
    } else if (toolType === 'lower-leg') {
        // If both leg lines are drawn, mark legs as complete
        if (lines['upper-leg'] && lines['lower-leg']) {
            const legsItem = document.querySelector('[data-step="legs"]');
            if (legsItem) {
                legsItem.classList.add('complete');
            }
            // Make arms step available
            const armsItem = document.querySelector('[data-step="arms"]');
            if (armsItem) {
                armsItem.classList.add('available');
            }
        }
    } else if (toolType === 'lower-arm') {
        // If both arm lines are drawn, mark arms as complete
        if (lines['upper-arm'] && lines['lower-arm']) {
            const armsItem = document.querySelector('[data-step="arms"]');
            if (armsItem) {
                armsItem.classList.add('complete');
            }
            // Make wrist step available
            const wristItem = document.querySelector('[data-step="wrist"]');
            if (wristItem) {
                wristItem.classList.add('available');
            }
        }
    } else if (toolType === 'wrist') {
        // Mark wrist step as complete immediately
        const wristItem = document.querySelector('[data-step="wrist"]');
        if (wristItem) {
            wristItem.classList.add('complete');
        }
        
        // Update instruction text
        document.getElementById('instructions').textContent = 'All measurements complete. Calculate REBA score.';
        
        // Enable calculate button
        const calculateBtn = document.getElementById('calculate-btn');
        calculateBtn.disabled = false;
    }
    
    // Check if all required steps are complete
    checkAllStepsComplete();
}

// Add this helper function to check if all steps are complete
function checkAllStepsComplete() {
    if (lines['reference'] && lines['neck'] && lines['trunk'] && 
        lines['upper-leg'] && lines['lower-leg'] && 
        lines['upper-arm'] && lines['lower-arm'] && lines['wrist']) {
        
        // Make sure all checkpoints are marked as complete
        document.querySelectorAll('.checkpoint-list li').forEach(li => {
            if (li.dataset.step !== 'upload') { // Skip upload since it's handled differently
                li.classList.add('complete');
            }
        });
        
        // Update instruction text
        document.getElementById('instructions').textContent = 'All measurements complete. Calculate REBA score.';
        
        // Enable calculate button
        const calculateBtn = document.getElementById('calculate-btn');
        calculateBtn.disabled = false;
    }
}

// Function to advance to the next tool in the sequence
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

// Select drawing tool
function selectTool(toolId) {
    // Reset previous selection
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Remove active class from all checkpoints
    document.querySelectorAll('.checkpoint-list li').forEach(li => {
        li.classList.remove('active');
    });
    
    // Set new tool
    currentTool = toolId;
    document.getElementById(toolId).classList.add('selected');
    
    // Map tool ID to checkpoint step
    const toolToStep = {
        'draw-reference': 'reference',
        'draw-neck': 'neck',
        'draw-trunk': 'trunk',
        'draw-upper-leg': 'legs',
        'draw-lower-leg': 'legs',
        'draw-upper-arm': 'arms',
        'draw-lower-arm': 'arms',
        'draw-wrist': 'wrist'
    };
    
    // Highlight current step in checkpoint list
    const step = toolToStep[toolId];
    if (step) {
        const stepItem = document.querySelector(`[data-step="${step}"]`);
        if (stepItem) {
            stepItem.classList.add('active');
        }
    }
    
    // Update instructions
    updateInstructions(toolId);
    
    // Show drawing guidance
    const toolType = toolId.replace('draw-', '');
    showDrawingGuidance(toolType);
}

// Update instructions based on selected tool
function updateInstructions(toolId) {
    // Define instructions with subject direction context
    const baseInstructions = {
        'draw-reference': 'Draw a vertical reference line behind the subject (floor to ceiling).',
        'draw-neck': 'Draw a line for the neck position, from the base of the neck to the top of the head.',
        'draw-trunk': 'Draw a line for the trunk position, from the tailbone to the base of the neck.',
        'draw-upper-leg': 'Draw a line for the upper leg, from the hip to the knee.',
        'draw-lower-leg': 'Draw a line for the lower leg, from the knee to the ankle.',
        'draw-upper-arm': 'Draw a line for the upper arm, from the shoulder to the elbow.',
        'draw-lower-arm': 'Draw a line for the lower arm, from the elbow to the wrist.',
        'draw-wrist': 'Draw a line for the wrist position, from the wrist to the end of the hand.'
    };
    
    // Get the base instruction
    let instruction = baseInstructions[toolId] || 'Select a tool to continue.';
    
    // Add subject direction context
    if (toolId && toolId !== 'draw-reference') {
        instruction += ` (Subject facing ${subjectFacingDirection})`;
    }
    
    // Check if all measurements are complete
    if (lines['reference'] && lines['neck'] && lines['trunk'] && 
        lines['upper-leg'] && lines['lower-leg'] && 
        lines['upper-arm'] && lines['lower-arm'] && lines['wrist']) {
        
        instruction = 'All measurements complete. Click "Calculate REBA Score" to see results.';
    }
    
    document.getElementById('instructions').textContent = instruction;
}

// Clear canvas and reset drawing state
function clearCanvas() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Reset drawing state
  lines = {};
  points = [];
  angles = {};
  isDrawing = false;
  drawingStep = 0;
  
  // Reset adjustments
  adjustments = {
    neck: { twisted: false, sideBending: false },
    trunk: { twisted: false, sideBending: false },
    legs: { raised: false },
    arms: { shoulderRaised: false, abducted: false, supported: false },
    wrist: { twisted: false },
    force: { level: 0, shock: false },
    coupling: { quality: 0 },
    activity: { staticPosture: false, repeatedActions: false, rapidChanges: false }
  };
  
  // Redraw the image if available
  if (uploadedImage) {
    ctx.drawImage(uploadedImage, 0, 0, canvas.width, canvas.height);
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
  document.getElementById('results').style.display = 'none';
}

// Undo last drawn line
function undoLastLine() {
    // Reset drawing state in case we're in the middle of drawing
    isDrawing = false;
    drawingStep = 0;
    points = [];
    
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

// Redraw canvas with all saved lines
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw the image if available
    if (uploadedImage) {
        ctx.drawImage(uploadedImage, 0, 0, canvas.width, canvas.height);
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

// Draw a line for a specific body part
// Draw a line for a specific body part
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
    
    // Draw angle text - but only if not reference line
    if (toolType !== 'reference' && angles[toolType] !== undefined) {
        const midX = (point1.x + point2.x) / 2;
        const midY = (point1.y + point2.y) / 2;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.font = '14px Arial';
        ctx.strokeText(`${angles[toolType].toFixed(1)}°`, midX + 10, midY);
        ctx.fillText(`${angles[toolType].toFixed(1)}°`, midX + 10, midY);
    }
}

// Initialize canvas
function initializeCanvas() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    // Prevent any transform effects on mouse events
    canvas.addEventListener('mousedown', function(e) {
        // Stop event propagation to prevent other handlers that might cause zooming
        e.stopPropagation();
    });
    
    // Resize handler to maintain aspect ratio
    window.addEventListener('resize', resizeCanvas);
    
    // Initial setup
    resizeCanvas();
	
	synchronizeCanvasDimensions();
}

// Resize canvas to maintain aspect ratio
function resizeCanvas() {
    // Keep the canvas size fixed at its original dimensions
    // This prevents unexpected scaling
    const container = canvas.parentElement;
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    
    // Only adjust the CSS size, not the canvas dimensions
    canvas.style.width = originalWidth + 'px';
    canvas.style.height = originalHeight + 'px';
	
	synchronizeCanvasDimensions();
}

// Add a visual indicator for the subject's orientation
function createOrientationIndicator() {
    // Create an indicator element showing which direction the subject should face
    const indicator = document.createElement('div');
    indicator.id = 'orientation-indicator';
    indicator.style.position = 'absolute';
    indicator.style.top = '10px';
    indicator.style.right = '10px';
    indicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    indicator.style.color = 'white';
    indicator.style.padding = '5px 10px';
    indicator.style.borderRadius = '4px';
    indicator.style.fontSize = '14px';
    indicator.style.zIndex = '900';
    
    // Set content based on direction
    indicator.innerHTML = `Subject facing: <strong>${subjectFacingDirection}</strong>`;
    
    // Add to the drawing container
    const container = document.querySelector('.drawing-area');
    if (container) {
        container.style.position = 'relative'; // Ensure positioned parent
        container.appendChild(indicator);
    }
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
        
        // Setup touch events for mobile
        setupTouchEventListeners();
		
		canvas.addEventListener('touchstart', function(e) {
			e.preventDefault();
			startDrawing(e);
		}, { passive: false });
		
		canvas.addEventListener('touchmove', function(e) {
			e.preventDefault();
			drawPreview(e);
		}, { passive: false });
		
		window.addEventListener('mousemove', function(e) {
			if (isDrawing) {
				drawPreview(e);
			}
		});
    
		window.addEventListener('mouseup', function(e) {
			if (isDrawing) {
				stopDrawing(e);
			}
		});
		
		// Add similar handlers for touch events on mobile
		window.addEventListener('touchmove', function(e) {
			if (isDrawing) {
				e.preventDefault(); // Prevent scrolling while drawing
				drawPreview(e);
			}
		}, { passive: false });
		
		window.addEventListener('touchend', function(e) {
			if (isDrawing) {
				stopDrawing(e);
			}
		});
			
        // Add other event listeners similarly
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                selectTool(this.id);
            });
        });
        
        document.getElementById('clear-canvas').addEventListener('click', function() {
			clearCanvas();
			drawingStep = 0;
		});
        document.getElementById('undo-last').addEventListener('click', function() {
			undoLastLine();
			drawingStep = 0;
		});
        document.getElementById('calculate-btn').addEventListener('click', calculateREBA);
        
        // Add meta viewport tag for better mobile responsiveness if not already present
        if (!document.querySelector('meta[name="viewport"]')) {
            const metaViewport = document.createElement('meta');
            metaViewport.name = 'viewport';
            metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            document.head.appendChild(metaViewport);
        }
        
        console.log('All event listeners set up successfully');
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }
}

// Calculate REBA score
function calculateREBA() {
    try {
        // Get angles from the drawn lines
        const neckAngle = angles['neck'] || 0;
        const trunkAngle = angles['trunk'] || 0;
        
        // For legs, calculate knee flexion angle
        const legsAngle = Math.abs(angles['lower-leg'] - angles['upper-leg']) || 0;
        
        // For upper arm, angle is relative to trunk
        const upperArmAngle = angles['upper-arm'] || 0;
        
        // For lower arm, angle is relative to upper arm
        const lowerArmAngle = Math.abs(angles['lower-arm'] - angles['upper-arm']) || 0;
        
        // For wrist, angle is relative to lower arm
        const wristAngle = Math.abs(angles['wrist'] - angles['lower-arm']) || 0;
        
        // Get adjustment values from the stored adjustments
        const neckTwisted = adjustments.neck.twisted;
        const neckSideBending = adjustments.neck.sideBending;
        const trunkTwisted = adjustments.trunk.twisted;
        const trunkSideBending = adjustments.trunk.sideBending;
        const legRaised = adjustments.legs.raised;
        const shoulderRaised = adjustments.arms.shoulderRaised;
        const armAbducted = adjustments.arms.abducted;
        const armSupported = adjustments.arms.supported;
        const wristTwisted = adjustments.wrist.twisted;
        const forceLevel = adjustments.force.level;
        const shock = adjustments.force.shock;
        const coupling = adjustments.coupling.quality;
        const staticPosture = adjustments.activity.staticPosture;
        const repeatedActions = adjustments.activity.repeatedActions;
        const rapidChanges = adjustments.activity.rapidChanges;
        
        // Calculate individual component scores
        const neckScore = calculateNeckScore(neckAngle, neckTwisted, neckSideBending);
        const trunkScore = calculateTrunkScore(trunkAngle, trunkTwisted, trunkSideBending);
        const legsScore = calculateLegsScore(legsAngle, legRaised);
        const upperArmScore = calculateUpperArmScore(upperArmAngle, shoulderRaised, armAbducted, armSupported);
        const lowerArmScore = calculateLowerArmScore(lowerArmAngle);
        const wristScore = calculateWristScore(wristAngle, wristTwisted);
        const forceScore = calculateForceScore(forceLevel, shock);
        const couplingScore = calculateCouplingScore(coupling);
        const activityScore = calculateActivityScore(staticPosture, repeatedActions, rapidChanges);
        
        // Store all angles for display and debugging
        const angleValues = {
            neck: neckAngle,
            trunk: trunkAngle,
            legs: legsAngle,
            upper_arm: upperArmAngle,
            lower_arm: lowerArmAngle,
            wrist: wristAngle
        };
        
        // Calculate final REBA score
        const finalResults = calculateFinalRebaScore({
            neck: neckScore,
            trunk: trunkScore,
            legs: legsScore,
            force: forceScore,
            upper_arm: upperArmScore,
            lower_arm: lowerArmScore,
            wrist: wristScore,
            coupling: couplingScore,
            activity: activityScore
        });
        
        // Log all scores with angles for debugging
        logREBAScores(angleValues, finalResults);
        
        // Merge with angle values for display
        const displayResults = {
            ...finalResults,
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
        console.error("Error details:", {
            angles: JSON.stringify(angles),
            adjustments: JSON.stringify(adjustments)
        });
        alert("Error calculating REBA score. Please check the console for details.");
    }
}

function downloadImageWithMeasurements() {
    // Create a temporary link element
    const link = document.createElement('a');
    
    // Get the canvas data as a data URL
    const canvasData = canvas.toDataURL('image/png');
    
    // Set link attributes
    link.download = 'reba_assessment.png';
    link.href = canvasData;
    
    // Trigger the download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function addDownloadButton() {
    // Create the button
    const downloadButton = document.createElement('button');
    downloadButton.id = 'download-image';
    downloadButton.textContent = 'Download Image';
    downloadButton.style.backgroundColor = '#64b5f6';
    downloadButton.style.color = 'white';
    downloadButton.style.border = 'none';
    downloadButton.style.padding = '10px 15px';
    downloadButton.style.borderRadius = '4px';
    downloadButton.style.cursor = 'pointer';
    downloadButton.style.margin = '10px';
    
    // Add event listener
    downloadButton.addEventListener('click', downloadImageWithMeasurements);
    
    // Find a good place to add it - next to the clear canvas button
    const clearCanvasButton = document.getElementById('clear-canvas');
    if (clearCanvasButton && clearCanvasButton.parentNode) {
        clearCanvasButton.parentNode.appendChild(downloadButton);
    }
}

// displayREBAResults function for better presentation
function displayREBAResults(result) {
    // Show results section
    document.getElementById('results').style.display = 'block';
    
    // Helper function to safely get values
    function safeValue(value, defaultValue = 0) {
        return value !== undefined && value !== null ? value : defaultValue;
    }
    
    // Update Group A scores
    document.getElementById('neck-score').textContent = safeValue(result.neck_score);
    document.getElementById('neck-angle-value').textContent = safeValue(result.neck_angle).toFixed(1);
    
    document.getElementById('trunk-score').textContent = safeValue(result.trunk_score);
    document.getElementById('trunk-angle-value').textContent = safeValue(result.trunk_angle).toFixed(1);
    
    document.getElementById('legs-score').textContent = safeValue(result.legs_score);
    document.getElementById('legs-angle-value').textContent = safeValue(result.legs_angle).toFixed(1);
    
    document.getElementById('posture-a-score').textContent = safeValue(result.posture_a);
    document.getElementById('force-score').textContent = safeValue(result.force_score);
    document.getElementById('score-a').textContent = safeValue(result.score_a);
    
    // Update Group B scores
    document.getElementById('upper-arm-score').textContent = safeValue(result.upper_arm_score);
    document.getElementById('upper-arm-angle-value').textContent = safeValue(result.upper_arm_angle).toFixed(1);
    
    document.getElementById('lower-arm-score').textContent = safeValue(result.lower_arm_score);
    document.getElementById('lower-arm-angle-value').textContent = safeValue(result.lower_arm_angle).toFixed(1);
    
    document.getElementById('wrist-score').textContent = safeValue(result.wrist_score);
    document.getElementById('wrist-angle-value').textContent = safeValue(result.wrist_angle).toFixed(1);
    
    document.getElementById('posture-b-score').textContent = safeValue(result.posture_b);
    document.getElementById('coupling-score').textContent = safeValue(result.coupling_score);
    document.getElementById('score-b').textContent = safeValue(result.score_b);
    
    // Update final scores
    document.getElementById('table-c-score').textContent = safeValue(result.table_c_score);
    document.getElementById('activity-score').textContent = safeValue(result.activity_score);
    document.getElementById('final-score').textContent = safeValue(result.final_score);
    
    // Update risk level with appropriate styling
    const riskLevelElement = document.getElementById('risk-level');
    const riskDescriptionElement = document.getElementById('risk-description');
    
    // Default risk level text if none provided
    let riskLevelText = "Risk level not available";
    
    // Only use the actual risk level if it exists and is a string
    if (result && result.risk_level && typeof result.risk_level === 'string') {
        riskLevelText = result.risk_level;
    }
    
    riskLevelElement.textContent = riskLevelText;
    
    // Reset classes
    riskLevelElement.className = 'risk-level';
    
    // Add appropriate risk class based on text content
    if (typeof riskLevelText === 'string') {
        if (riskLevelText.indexOf("Very High") >= 0) {
            riskLevelElement.classList.add('risk-very-high');
            riskDescriptionElement.textContent = "Score 11+ indicates very high risk. Implement changes immediately.";
        } else if (riskLevelText.indexOf("High") >= 0) {
            riskLevelElement.classList.add('risk-high');
            riskDescriptionElement.textContent = "Score 8-10 indicates high risk. Investigate and implement changes soon.";
        } else if (riskLevelText.indexOf("Medium") >= 0) {
            riskLevelElement.classList.add('risk-medium');
            riskDescriptionElement.textContent = "Score 4-7 indicates medium risk. Further investigation, change may be needed.";
        } else {
            riskLevelElement.classList.add('risk-low');
            riskDescriptionElement.textContent = "Score 1-3 indicates low risk. May need minor changes.";
        }
    } else {
        // Default styling
        riskLevelElement.classList.add('risk-low');
    }
    
    // Add explanation about subject direction
    const directionInfo = document.createElement('p');
    directionInfo.innerHTML = `<strong>Note:</strong> Analysis performed with subject facing ${subjectFacingDirection}.`;
    directionInfo.style.marginTop = "20px";
    directionInfo.style.fontStyle = "italic";
    
    // Find the risk description element and insert after it
    if (riskDescriptionElement) {
        riskDescriptionElement.after(directionInfo);
    } else {
        // If risk description element not found, append to results
        document.getElementById('results').appendChild(directionInfo);
    }
    
	const downloadButton = document.createElement('button');
	downloadButton.textContent = 'Download Image with Measurements';
	downloadButton.style.backgroundColor = '#64b5f6';
	downloadButton.style.color = 'white';
	downloadButton.style.border = 'none';
	downloadButton.style.padding = '10px 20px';
	downloadButton.style.borderRadius = '4px';
	downloadButton.style.cursor = 'pointer';
	downloadButton.style.marginTop = '20px';
	downloadButton.style.marginRight = '10px';
	downloadButton.onclick = downloadImageWithMeasurements;
	
	const buttonContainer = document.createElement('div');
	buttonContainer.style.textAlign = 'center';
	buttonContainer.style.marginTop = '20px';
	buttonContainer.appendChild(downloadButton);
	document.getElementById('results').appendChild(buttonContainer);
	
    // Scroll to results
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

// Main initialization function
function main() {
    console.log('Main function started');
    console.log('Document state:', document.readyState);
	
	addDownloadButton();
    
    try {
        // Ensure app container is visible
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.style.display = 'block';
        }
        
        // Show loading message
        document.getElementById('loading').style.display = 'block';
        
        // Hide loading message now that we don't need Pyodide
        document.getElementById('loading').style.display = 'none';
        
        // Initialize canvas and event listeners
        initializeCanvas();
        setupEventListeners();
        
        // Mark first step as complete
        const uploadStep = document.querySelector('[data-step="upload"]');
        if (uploadStep) {
            uploadStep.classList.add('available');
        }
        
		synchronizeCanvasDimensions();
		
        console.log('Main initialization complete');
    } catch (error) {
        console.error("Failed to initialize application:", error);
        document.getElementById('loading').innerHTML = 'Error initializing application: ' + error.message;
    }
}

// Run main function when document is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
