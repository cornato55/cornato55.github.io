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
let magnifierBubble = null;
let magnifierCanvas = null;
let magnifierCtx = null;
let magnifierActive = false;
let bubbleScale = 3;

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

function calculateAngle(point1, point2, toolType) {
    // Create vector from point1 to point2 (in the order user drew them)
    const vector = {
        x: point2.x - point1.x,
        y: point2.y - point1.y
    };
    
	// For trunk angle (reference is vertical)
	if (toolType === 'trunk') {
		// Calculate trunk's absolute angle from vertical
		const trunkAngle = Math.atan2(vector.x, vector.y) * (180 / Math.PI);
		
		// We need to measure from North position (use complementary angle)
		let northAngle = 180 - Math.abs(trunkAngle);
		
		// Preserve original sign for direction
		if (trunkAngle < 0) northAngle = -northAngle;
		
		// Adjust based on subject facing direction
		if (subjectFacingDirection === 'right') {
			return northAngle; 
		} else { // 'left'
			return -northAngle; 
		}
	}
    
	// For neck angle
	if (toolType === 'neck') {
		const trunkPoints = lines['trunk'];
		if (!trunkPoints || trunkPoints.length < 2) {
			console.error("Trunk must be drawn before neck");
			return 0;
		}
		
		// Trunk vector from tailbone to neck
		const trunkVector = {
			x: trunkPoints[1].x - trunkPoints[0].x,
			y: trunkPoints[1].y - trunkPoints[0].y
		};
		
		// Calculate dot product
		const dotProduct = vector.x * trunkVector.x + vector.y * trunkVector.y;
		
		// Calculate magnitudes
		const vectorMag = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
		const trunkMag = Math.sqrt(trunkVector.x * trunkVector.x + trunkVector.y * trunkVector.y);
		
		// Calculate angle between vectors (0-180 degrees)
		let angle = Math.acos(dotProduct / (vectorMag * trunkMag)) * (180 / Math.PI);
		
		// Use cross product to determine direction
		const crossProduct = trunkVector.x * vector.y - trunkVector.y * vector.x;
		
		if (subjectFacingDirection === 'right') {
			angle = crossProduct < 0 ? angle : -angle;
		} else { // 'left'
			angle = crossProduct > 0 ? angle : -angle;
		}
		
		return -angle; // Negate the angle
	}
	
	// For upper leg angle (reference is trunk)
	if (toolType === 'upper-leg' && lines['trunk']) {
		const trunkPoints = lines['trunk'];
		if (!trunkPoints || trunkPoints.length < 2) {
			console.error("Trunk must be drawn before upper leg");
			return 0;
		}
		
		// Create trunk vector
		const trunkVector = {
			x: trunkPoints[1].x - trunkPoints[0].x,
			y: trunkPoints[1].y - trunkPoints[0].y
		};
		
		// Calculate trunk's absolute angle
		const trunkAngle = Math.atan2(trunkVector.x, trunkVector.y) * (180 / Math.PI);
		
		// Use North direction of trunk (no need to add 180°)
		const trunkNorthAngle = trunkAngle;
		
		// Calculate upper leg's absolute angle
		const upperLegAngle = Math.atan2(vector.x, vector.y) * (180 / Math.PI);
		
		// Calculate the angle from trunk's North direction to the upper leg
		let angle = upperLegAngle - trunkNorthAngle;
		
		// Get complementary angle to measure from North
		angle = 180 - Math.abs(angle);
		if (upperLegAngle < trunkNorthAngle) angle = -angle;
		
		// Normalize to [-180, 180]
		while (angle > 180) angle -= 360;
		while (angle < -180) angle += 360;
		
		// Adjust based on subject facing direction
		if (subjectFacingDirection === 'left') {
			angle = -angle; // Invert the angle for left-facing subjects
		}
		
		console.log(`Upper leg angle (trunk reference): ${angle.toFixed(1)}°`);
		return angle;
	}
    
    if (toolType === 'lower-leg' && lines['upper-leg']) {
        const upperLegPoints = lines['upper-leg'];
        if (!upperLegPoints || upperLegPoints.length < 2) {
            console.error("Upper leg must be drawn before lower leg");
            return 0;
        }
        
        // Create upper leg vector (hip to knee)
        const upperLegVector = {
            x: upperLegPoints[1].x - upperLegPoints[0].x,
            y: upperLegPoints[1].y - upperLegPoints[0].y
        };
        
        // Create lower leg vector (knee to ankle)
        const lowerLegVector = {
            x: vector.x,
            y: vector.y
        };
        
        // Calculate dot product
        const dotProduct = upperLegVector.x * lowerLegVector.x + upperLegVector.y * lowerLegVector.y;
        
        // Calculate magnitudes
        const upperLegMag = Math.sqrt(upperLegVector.x * upperLegVector.x + upperLegVector.y * upperLegVector.y);
        const lowerLegMag = Math.sqrt(lowerLegVector.x * lowerLegVector.x + lowerLegVector.y * lowerLegVector.y);
        
        // Protection against floating point errors
        const cosTheta = Math.max(-1, Math.min(1, dotProduct / (upperLegMag * lowerLegMag)));
        
        // Calculate the angle between the vectors (0-180 degrees)
        const angleBetween = Math.acos(cosTheta) * (180 / Math.PI);
        
        // For knee flexion, we want the deviation from a straight line (180°)
        // When the leg is straight, the angle between vectors is 180°, so deviation is 0°
        // When the knee is bent 90°, the angle between vectors is 90°, so deviation is 90°
        const kneeFlexion = 180 - angleBetween;
        
        console.log(`Knee angle (deviation from straight): ${kneeFlexion.toFixed(1)}°`);
        return kneeFlexion;
    }
	
	// Upper arm angle calculation using trunk as reference line
    if (toolType === 'upper-arm' && lines['trunk']) {
        // Get trunk points
        const trunkPoints = lines['trunk'];
        if (!trunkPoints || trunkPoints.length < 2) {
            console.error("Trunk must be drawn before upper arm");
            return 0;
        }
        
        // Create trunk vector
        const trunkVector = {
            x: trunkPoints[1].x - trunkPoints[0].x,
            y: trunkPoints[1].y - trunkPoints[0].y
        };
        
        // Calculate trunk's absolute angle with vertical (0° is down)
        const trunkAngle = Math.atan2(trunkVector.x, trunkVector.y) * (180 / Math.PI);
        
        // Calculate the "South" direction of the trunk (opposite direction)
        const trunkSouthAngle = (trunkAngle + 180) % 360;
        
        // Create arm vector
        const armVector = {
            x: vector.x,
            y: vector.y
        };
        
        // Calculate arm's absolute angle
        const armAngle = Math.atan2(armVector.x, armVector.y) * (180 / Math.PI);
        
        // Calculate the angle from trunk's South direction to the arm
        let angle = armAngle - trunkSouthAngle;
        
        // Normalize to [-180, 180]
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        
        // Adjust based on subject facing direction
        if (subjectFacingDirection === 'left') {
            angle = -angle; // Invert the angle for left-facing subjects
        }
        
        console.log(`Upper arm angle (trunk reference): ${angle.toFixed(1)}°`);
        return angle;
    }
    
	// For lower arm angle (reference is upper arm)
	if (toolType === 'lower-arm' && lines['upper-arm']) {
		const upperArmPoints = lines['upper-arm'];
		if (!upperArmPoints || upperArmPoints.length < 2) {
			console.error("Upper arm must be drawn before lower arm");
			return 0;
		}
		
		// Create upper arm vector
		const upperArmVector = {
			x: upperArmPoints[1].x - upperArmPoints[0].x,
			y: upperArmPoints[1].y - upperArmPoints[0].y
		};
		
		// Create lower arm vector
		const lowerArmVector = {
			x: vector.x,
			y: vector.y
		};
		
		// Calculate absolute angles
		const upperArmAngle = Math.atan2(upperArmVector.x, upperArmVector.y) * (180 / Math.PI);
		const lowerArmAngle = Math.atan2(lowerArmVector.x, lowerArmVector.y) * (180 / Math.PI);
		
		// Calculate the angle between the vectors
		let angle = Math.abs(lowerArmAngle - upperArmAngle);
		
		// Normalize to [0, 180] - the elbow only bends one way
		if (angle > 180) angle = 360 - angle;
		
		// Return directly as elbow flexion (0° when straight, 90° when bent at right angle)
		// No need to subtract from 180
		
		console.log(`Elbow flexion angle: ${angle.toFixed(1)}°`);
		return angle;
	}
		
    // For wrist angle (reference is lower arm)
    if (toolType === 'wrist' && lines['lower-arm']) {
        const lowerArmPoints = lines['lower-arm'];
        if (!lowerArmPoints || lowerArmPoints.length < 2) {
            console.error("Lower arm must be drawn before wrist");
            return 0;
        }
        
        // Create lower arm vector
        const lowerArmVector = {
            x: lowerArmPoints[1].x - lowerArmPoints[0].x,
            y: lowerArmPoints[1].y - lowerArmPoints[0].y
        };
        
        // Calculate lower arm's absolute angle
        const lowerArmAngle = Math.atan2(lowerArmVector.x, lowerArmVector.y) * (180 / Math.PI);
        
        // Calculate the "South" direction of the lower arm (opposite direction)
        const lowerArmSouthAngle = (lowerArmAngle + 180) % 360;
        
        // Calculate wrist's absolute angle
        const wristAngle = Math.atan2(vector.x, vector.y) * (180 / Math.PI);
        
        // Calculate the angle from lower arm's direction to the wrist
        let angle = wristAngle - lowerArmSouthAngle;
        
        // Normalize to [-180, 180]
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
		
		// The wrist can flex in both directions, but we want to ensure:
        // 1. Smaller angles are reported (acute rather than obtuse)
        // 2. Sign is correct based on facing direction
        
        // If angle is beyond ±90°, use the complementary angle
        if (Math.abs(angle) > 90) {
            // Preserve sign but use complementary angle
            angle = angle > 0 ? 180 - angle : -180 - angle;
        }
        
        // Adjust based on subject facing direction
        if (subjectFacingDirection === 'left') {
            angle = -angle; // Invert the angle for left-facing subjects
        }
        
        console.log(`Wrist angle (lower arm reference): ${angle.toFixed(1)}°`);
        return angle;
    }
    
    // Default case - if no specific toolType is matched
    // Measure angle from vertical (down direction)
    const verticalAngle = Math.atan2(0, 1) * (180 / Math.PI);  // 90 degrees (downward)
    const vectorAngle = Math.atan2(vector.x, vector.y) * (180 / Math.PI);
    
    let angle = vectorAngle - verticalAngle;
    
    // Normalize to [-180, 180]
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    
    console.log(`Default angle from vertical: ${angle.toFixed(1)}°`);
    return angle;
}

// Add this new function after calculateAngle
function updateDependentAngles(toolType) {
    const dependencyMap = {
        'trunk': ['neck', 'upper-arm', 'upper-leg'],  // Trunk affects neck, upper arm, and upper leg
        'upper-leg': ['lower-leg'],                   // Upper leg affects lower leg
        'upper-arm': ['lower-arm'],                   // Upper arm affects lower arm
        'lower-arm': ['wrist']                        // Lower arm affects wrist
    };
    
    // If this tool affects other measurements
    const dependents = dependencyMap[toolType];
    if (!dependents) return;
    
    // Recalculate all dependent angles
    dependents.forEach(dependent => {
        if (lines[dependent]) {
            // Recalculate the angle
            const pts = lines[dependent];
            angles[dependent] = calculateAngle(pts[0], pts[1], dependent);
        }
    });
}

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

function setupCompactButtons() {
    // Get elements
    const fileInput = document.getElementById('image-upload');
    const chooseButton = document.getElementById('choose-file');
    const cameraButton = document.getElementById('take-photo');
    const clearButton = document.getElementById('clear-canvas');
    
    if (!fileInput) {
        console.error('File input element not found');
        return;
    }
    
    // If buttons already exist in HTML, just add event listeners
    if (chooseButton && cameraButton && clearButton) {
        console.log('Using existing buttons from HTML');
        
        // Handle Choose File button click
        chooseButton.addEventListener('click', function() {
            fileInput.removeAttribute('capture');
            fileInput.click();
        });
        
        // Handle Camera button click
        cameraButton.addEventListener('click', function() {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if (isMobile) {
                fileInput.setAttribute('capture', 'environment');
                fileInput.click();
                setTimeout(() => fileInput.removeAttribute('capture'), 500);
            } else {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    openWebcam();
                } else {
                    alert("Camera not supported in this browser");
                }
            }
        });
        
        // Handle Clear button click
        clearButton.addEventListener('click', clearCanvas);
        
        return; // Exit early since buttons are already set up
    }
    
    // Fallback: Create buttons dynamically if they don't exist in HTML
    console.log('Creating buttons dynamically - buttons not found in HTML');
    
    const uploadContainer = document.querySelector('.upload-container');
    if (!uploadContainer) {
        console.error('Upload container not found');
        return;
    }
    
    // Look for existing button row or create one
    let buttonRow = uploadContainer.querySelector('.button-row');
    if (!buttonRow) {
        buttonRow = document.createElement('div');
        buttonRow.className = 'button-row';
        uploadContainer.appendChild(buttonRow);
    }
    
    // Clear existing content in button row
    buttonRow.innerHTML = '';
    
    // Create Choose button
    const chooseButtonDynamic = document.createElement('button');
    chooseButtonDynamic.className = 'compact-btn file-btn';
    chooseButtonDynamic.innerHTML = '📁 Choose File';
    chooseButtonDynamic.id = 'choose-file';
    
    // Create Camera button
    const cameraButtonDynamic = document.createElement('button');
    cameraButtonDynamic.className = 'compact-btn camera-btn';
    cameraButtonDynamic.innerHTML = '📷 Camera';
    cameraButtonDynamic.id = 'take-photo';
    
    // Create Clear button
    const clearButtonDynamic = document.createElement('button');
    clearButtonDynamic.className = 'compact-btn';
    clearButtonDynamic.innerHTML = '🗑️ Clear';
    clearButtonDynamic.id = 'clear-canvas';
    
    // Add event listeners
    chooseButtonDynamic.addEventListener('click', function() {
        fileInput.removeAttribute('capture');
        fileInput.click();
    });
    
    cameraButtonDynamic.addEventListener('click', function() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            fileInput.setAttribute('capture', 'environment');
            fileInput.click();
            setTimeout(() => fileInput.removeAttribute('capture'), 500);
        } else {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                openWebcam();
            } else {
                alert("Camera not supported in this browser");
            }
        }
    });
    
    clearButtonDynamic.addEventListener('click', clearCanvas);
    
    // Add buttons to the row
    buttonRow.appendChild(chooseButtonDynamic);
    buttonRow.appendChild(cameraButtonDynamic);
    buttonRow.appendChild(clearButtonDynamic);
}

// Function to handle desktop webcam
function openWebcam() {
    // Create minimal webcam UI
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    
    // Video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.style.maxWidth = '90%';
    video.style.maxHeight = '70vh';
    video.style.borderRadius = '4px';
    
    // Canvas for capture
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    
    // Button container
    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.gap = '10px';
    buttons.style.marginTop = '10px';
    
    // Capture button
    const captureBtn = document.createElement('button');
    captureBtn.className = 'compact-btn camera-btn';
    captureBtn.textContent = 'Take Photo';
    
    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'compact-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.backgroundColor = '#f44336';
    
    // Add elements
    buttons.appendChild(captureBtn);
    buttons.appendChild(cancelBtn);
    overlay.appendChild(video);
    overlay.appendChild(canvas);
    overlay.appendChild(buttons);
    document.body.appendChild(overlay);
    
    // Get webcam stream
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            
            // Handle capture
            captureBtn.onclick = () => {
                // Set canvas size
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Draw video frame to canvas
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                
                // Convert to blob
                canvas.toBlob(blob => {
                    // Create file
                    const file = new File([blob], 'webcam.jpg', { type: 'image/jpeg' });
                    
                    // Create FileList
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    
                    // Set to file input
                    const fileInput = document.getElementById('image-upload');
                    fileInput.files = dt.files;
                    
                    // Trigger change event
                    const event = new Event('change', { bubbles: true });
                    fileInput.dispatchEvent(event);
                    
                    // Close webcam
                    closeWebcam(stream, overlay);
                }, 'image/jpeg');
            };
            
            // Handle cancel
            cancelBtn.onclick = () => closeWebcam(stream, overlay);
        })
        .catch(err => {
            console.error('Webcam error:', err);
            document.body.removeChild(overlay);
            alert('Could not access webcam');
        });
}

// Close webcam helper
function closeWebcam(stream, overlay) {
    // Stop all tracks
    stream.getTracks().forEach(track => track.stop());
    
    // Remove overlay
    document.body.removeChild(overlay);
}

// 2. Improved handling of image upload for better mobile display
function handleImageUpload(e) {
    console.log('Image upload started');
    
    const file = e.target.files[0];
    if (!file) {
        console.error('No file selected');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(event) {
        uploadedImage = new Image();
        
        uploadedImage.onload = function() {
            console.log('Image loaded:', uploadedImage.width, 'x', uploadedImage.height);
            
            // Calculate container dimensions - available space for canvas
            const container = canvas.parentElement;
            const containerWidth = container.clientWidth - 20; // Allow some padding
            
            // Calculate aspect ratio
            const imageAspectRatio = uploadedImage.height / uploadedImage.width;
            
            // Set size based on container width while preserving aspect ratio
            let canvasWidth = containerWidth;
            let canvasHeight = Math.round(containerWidth * imageAspectRatio);
            
            // Check if image is too tall for viewport
            const maxHeight = window.innerHeight * 0.6; // Use 60% of viewport height max
            if (canvasHeight > maxHeight) {
                canvasHeight = maxHeight;
                canvasWidth = Math.round(maxHeight / imageAspectRatio);
            }
            
            // Reset canvas with new dimensions
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            canvas.style.width = canvasWidth + 'px';
            canvas.style.height = canvasHeight + 'px';
            
            // Clear and draw image
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            ctx.drawImage(uploadedImage, 0, 0, canvasWidth, canvasHeight);
            
            // Reset drawing state
            lines = {};
            points = [];
            angles = {};
            drawingStep = 0;
            isDrawing = false;
            
            // Mark upload step as complete
            const uploadItem = document.querySelector('[data-step="upload"]');
            if (uploadItem) {
                uploadItem.classList.add('complete');
            }
            
            // Show direction selection
            promptForSubjectDirection();
            
            console.log('Canvas set up with image');
        };
        
        uploadedImage.src = event.target.result;
    };
    
    reader.onerror = function() {
        console.error('Error reading file');
        alert('Error loading image. Please try another file.');
    };
    
    reader.readAsDataURL(file);
}

// 3. Add mobile-friendly touch feedback
function addTouchFeedback() {
    // Add CSS for touch feedback
    const style = document.createElement('style');
    style.textContent = `
        .tool-btn {
            transition: transform 0.1s, background-color 0.2s;
        }
        .tool-btn:active {
            transform: scale(0.95);
            background-color: #4CAF50 !important;
        }
        button:active {
            transform: scale(0.95);
        }
        /* Make buttons larger on mobile */
        @media (max-width: 768px) {
            .tool-btn, button {
                padding: 12px !important;
                margin: 5px !important;
                font-size: 16px !important;
            }
            /* Larger hit areas for controls */
            .controls-container button {
                min-height: 44px;
                min-width: 44px;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Add touch class to body if on mobile
    if ('ontouchstart' in window) {
        document.body.classList.add('touch-device');
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

    // Function to proceed with drawing trunk line
    function proceedToTrunkMeasurement() {
		// Update instruction text
		document.getElementById('instructions').textContent = 'Draw a line for the trunk position, from the tailbone to the base of the neck.';
		
		// Automatically select the trunk line tool
		selectTool('draw-trunk');
		
		// Update checkpoint status
		updateCheckpoints('upload');
		
		// Make trunk step available
		const trunkItem = document.querySelector('[data-step="trunk"]');
		if (trunkItem) {
			trunkItem.classList.add('available');
		}
		
	}

    // Add event listeners to buttons
	document.getElementById('facing-left').addEventListener('click', function() {
		subjectFacingDirection = 'left';
		document.body.removeChild(popup);
		document.body.removeChild(overlay);
		console.log('Subject direction set to: left');
		// Proceed with trunk measurement
		proceedToTrunkMeasurement();
	});

	document.getElementById('facing-right').addEventListener('click', function() {
		subjectFacingDirection = 'right';
		document.body.removeChild(popup);
		document.body.removeChild(overlay);
		console.log('Subject direction set to: right');
		// Proceed with trunk measurement
		proceedToTrunkMeasurement();
	});
}

// 4. Improved canvas coordinate calculation that works for both mouse and touch
function getCanvasCoordinates(e) {
    // Handle both mouse and touch events
    let clientX, clientY;
    
    if (e.type.startsWith('touch')) {
        // Touch event - either use first touch or first changed touch
        const touch = e.touches?.[0] || e.changedTouches?.[0];
        if (!touch) {
            console.error('No touch data available');
            return null;
        }
        clientX = touch.clientX;
        clientY = touch.clientY;
    } else {
        // Mouse event
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    // Get canvas position
    const rect = canvas.getBoundingClientRect();
    
    // Calculate coordinates within canvas
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Make sure the coordinates are within bounds
    if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) {
        console.warn('Coordinates outside canvas bounds', x, y);
    }
    
    return { x, y };
}

// Add touch event handlers for mobile support
function setupTouchEventListeners() {
    // Handle the touchstart event
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();  // Prevent default behavior like scrolling
        console.log('Touch start detected');

        // Ensure we're only starting a new line if it's not already in progress
        if (drawingStep === 0) {
            startDrawing(e);  // Start the drawing process
        }
    }, { passive: false });

    // Handle the touchmove event
    canvas.addEventListener('touchmove', function(e) {
        e.preventDefault();  // Prevent default behavior like scrolling
        console.log('Touch move detected');

        // Only show the preview if we're in drawing mode (i.e., step 1)
        if (drawingStep === 1) {
            drawPreview(e);  // Draw the preview line as the user moves their finger
        }
    }, { passive: false });

    // Handle the touchend event
    canvas.addEventListener('touchend', function(e) {
        e.preventDefault();  // Prevent default behavior like zooming or scrolling

        console.log('Touch end detected');
		console.log(e);

        // Only finalize if we have already placed the first point
        if (e.changedTouches && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];  // Get the final touch position
			console.log('Touch data', touch);
			
			if (touch) {
				const coords = getCanvasCoordinates({
					type: 'touch',
					changedTouches: [touch]
				});
				
				console.log('Canvas Coord:', coords);

				// Add the second point
				points.push(coords);

				// Call stopDrawing to finalize the line
				stopDrawing(e);  // Finalize the line and handle the cleanup
			} else {
				console.error('No valid touch data in changedTouches0');
			}
		} else {
			console.error('No changedTouched data available');
		}
    }, { passive: false });
}

// 1. Improved function to handle mouse and touch drawing start
function startDrawing(e) {
    console.log('Start drawing called with event type:', e.type);
    
    // Only proceed if a tool is selected
    if (!currentTool) {
        console.log('No tool selected');
        return;
    }

    e.preventDefault();
    
    // Get canvas coordinates
    const coords = getCanvasCoordinates(e);
    if (!coords) {
        console.error('Failed to get canvas coordinates');
        return;
    }
    
    console.log('Drawing start coordinates:', coords.x, coords.y);
    
    // Handle first click - start drawing a line
    if (drawingStep === 0) {
        // Start a new line
        points = [coords];
        drawingStep = 1;
        isDrawing = true;
        
        // Draw the first point
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, 6, 0, Math.PI * 2); // Larger point for better visibility
        ctx.fill();
        
        console.log('First point placed');
    }
}

// 2. Improved mousemove handler to draw preview line
function drawPreview(e) {
    // Only preview if we're in the drawing state
    if (drawingStep !== 1 || points.length === 0) {
        return;
    }
    
    e.preventDefault();
    
    // Get current coordinates
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    // Redraw everything
    redrawCanvas();
    
    // Draw preview line
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]); // Dashed line for preview
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash style
    
    // Redraw first point
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, 6, 0, Math.PI * 2);
    ctx.fill();
}

// 3. Improved handling for finishing a line
function completeLine(e) {
    console.log('Complete line called with event type:', e.type);
    
    // Only proceed if we have the first point already
    if (drawingStep !== 1 || points.length === 0 || !currentTool) {
        console.log('Not in drawing mode or no tool selected');
        return;
    }
    
    e.preventDefault();
    
    // Get final coordinates
    const coords = getCanvasCoordinates(e);
    if (!coords) {
        console.error('Failed to get canvas coordinates for line completion');
        return;
    }
    
    console.log('End drawing coordinates:', coords.x, coords.y);
    
    // Add the second point
    points.push(coords);
    
    // Get the tool type
    const toolType = currentTool.replace('draw-', '');
    
    // Save line points
    lines[toolType] = [...points];
    
    // Calculate angle
    const angle = calculateAngle(points[0], points[1], toolType);
    angles[toolType] = angle;
    
    console.log(`Line completed for ${toolType}, angle: ${angle.toFixed(1)}°`);
    
    // Redraw everything with the new line
    redrawCanvas();
    
    // Draw the final line
    drawLine(points[0], points[1], toolType);
    
    // Reset drawing state
    drawingStep = 0;
    isDrawing = false;
    
    // Enable undo button
    const undoButton = document.getElementById('undo-last');
    if (undoButton) {
        undoButton.disabled = false;
    }
    
    // Update checkpoints and move to next step
    updateCheckpointForTool(toolType);
    
    // Show adjustment popup if applicable
    showAdjustmentPopup(toolType);
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
        'upload': 'trunk',
        'trunk': 'neck',
        'neck': 'legs',
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
    // Check if all required lines are drawn
    const requiredLines = [
        'trunk',
        'neck',
        'upper-leg',
        'lower-leg',
        'upper-arm',
        'lower-arm', 
        'wrist'
    ];
    
    // Count how many required lines are completed
    let completedLines = 0;
    for (const line of requiredLines) {
        if (lines[line]) {
            completedLines++;
        }
    }
    
    console.log(`Completed ${completedLines} of ${requiredLines.length} required lines`);
    
    // Only enable calculate button if ALL required lines are drawn
    if (completedLines === requiredLines.length) {
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
        console.log("Enabled calculate button - all measurements complete");
    } else {
        // Disable calculate button if any required line is missing
        const calculateBtn = document.getElementById('calculate-btn');
        calculateBtn.disabled = true;
        console.log("Calculate button disabled - missing measurements");
    }
}

// Function to advance to the next tool in the sequence
function advanceToNextTool(toolType) {
    const nextToolMap = {
        'trunk': 'draw-neck',
        'neck': 'draw-upper-leg',
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
    
}

// Update instructions based on selected tool
function updateInstructions(toolId) {
    // Define instructions with subject direction context
    const baseInstructions = {
		'draw-reference': 'Draw a vertical reference line behind the subject (top to bottom).',
		'draw-neck': 'Draw a line starting at the base of the neck and ending at the top of the head.',
		'draw-trunk': 'Draw a line starting at the tailbone and ending at the base of the neck.',
		'draw-upper-leg': 'Draw a line starting at the hip and ending at the knee.',
		'draw-lower-leg': 'Draw a line starting at the knee and ending at the ankle.',
		'draw-upper-arm': 'Draw a line starting at the shoulder and ending at the elbow.',
		'draw-lower-arm': 'Draw a line starting at the elbow and ending at the wrist.',
		'draw-wrist': 'Draw a line starting at the wrist and ending at the fingertips.'
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

function toggleScoreDetails() {
    const details = document.getElementById('score-details');
    const button = document.querySelector('.toggle-details-btn');
    const icon = button.querySelector('.toggle-icon');
    
    if (details.classList.contains('collapsed')) {
        // Expand
        details.classList.remove('collapsed');
        details.classList.add('expanded');
        button.classList.add('expanded');
        button.innerHTML = '<span class="toggle-icon">▲</span>Hide Detailed Breakdown';
    } else {
        // Collapse
        details.classList.remove('expanded');
        details.classList.add('collapsed');
        button.classList.remove('expanded');
        button.innerHTML = '<span class="toggle-icon">▼</span>Show Detailed Breakdown';
    }
}

// Initialize magnifier bubble elements
function initializeMagnifier() {
    magnifierBubble = document.getElementById('magnifier-bubble');
    magnifierCanvas = document.getElementById('magnifier-canvas');
    
    if (magnifierBubble) {
        // Force hide the magnifier immediately
        magnifierBubble.style.display = 'none';
        magnifierBubble.style.visibility = 'hidden';
        magnifierBubble.style.top = '-9999px';
        magnifierBubble.style.left = '-9999px';
        magnifierActive = false;
        console.log('Magnifier hidden on init');
    }
    
    if (magnifierCanvas) {
        magnifierCtx = magnifierCanvas.getContext('2d');
        console.log('Magnifier initialized');
    } else {
        console.error('Magnifier canvas not found');
    }
}

// Show magnification bubble
function showMagnifierBubble(e, coords) {
    if (!magnifierBubble || !magnifierCanvas || !magnifierCtx) {
        console.error('Magnifier not initialized');
        return;
    }
    
    magnifierActive = true;
    
    // Get the current touch position
    const touch = e.touches[0];
    
    // Position the bubble relative to the touch point
    positionMagnifierBubble(touch.clientX, touch.clientY);
    
    // Show the bubble properly
    magnifierBubble.style.display = 'block';
    magnifierBubble.style.visibility = 'visible';
    
    // Update bubble content
    updateMagnifierContent(coords);
    
    // Update info text
    const info = document.getElementById('magnifier-info');
    if (drawingStep === 0) {
        info.textContent = 'Release to place first point';
    } else {
        info.textContent = 'Release to complete line';
    }
    
    console.log('Magnifier bubble shown');
}

// Position magnifier bubble directly above finger
function positionMagnifierBubble(touchX, touchY) {
    if (!magnifierBubble) return;
    
    const bubbleSize = 120;
    const offsetY = 140; // Fixed distance above finger
    
    // Center horizontally on finger, position above
    let bubbleX = touchX - (bubbleSize / 2);
    let bubbleY = touchY - offsetY;
    
    // Only adjust if going off screen edges
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Keep within horizontal bounds
    if (bubbleX < 10) {
        bubbleX = 10;
    } else if (bubbleX + bubbleSize > screenWidth - 10) {
        bubbleX = screenWidth - bubbleSize - 10;
    }
    
    // If too close to top, position below finger instead
    if (bubbleY < 10) {
        bubbleY = touchY + 30; // Below finger
    }
    
    // Apply the position
    magnifierBubble.style.left = bubbleX + 'px';
    magnifierBubble.style.top = bubbleY + 'px';
    
    console.log(`Magnifier positioned at: ${bubbleX}, ${bubbleY} (touch at: ${touchX}, ${touchY})`);
}

// Update magnifier bubble position and content
function updateMagnifierBubble(e, coords) {
    if (!magnifierActive || !magnifierBubble) return;
    
    // Get current touch position and reposition the bubble
    const touch = e.touches[0];
    positionMagnifierBubble(touch.clientX, touch.clientY);
    
    // Update content
    updateMagnifierContent(coords);
}

// Update the content inside the magnifier bubble
function updateMagnifierContent(coords) {
    if (!magnifierCtx || !uploadedImage) return;
    
    // Clear magnifier canvas
    magnifierCtx.clearRect(0, 0, 120, 120);
    
    // Calculate area to magnify (60x60 pixel area around touch point)
    const sourceSize = 40; // Size of area to magnify from main canvas
    const sourceX = Math.max(0, Math.min(canvas.width - sourceSize, coords.x - sourceSize/2));
    const sourceY = Math.max(0, Math.min(canvas.height - sourceSize, coords.y - sourceSize/2));
    
    // Draw magnified portion of the image
    magnifierCtx.drawImage(
        canvas,
        sourceX, sourceY, sourceSize, sourceSize, // Source area
        0, 0, 120, 120 // Destination (full magnifier)
    );
    
    // Draw existing points if any
    if (drawingStep === 1 && points.length > 0) {
        const firstPoint = points[0];
        // Check if first point is in visible area
        if (firstPoint.x >= sourceX && firstPoint.x <= sourceX + sourceSize &&
            firstPoint.y >= sourceY && firstPoint.y <= sourceY + sourceSize) {
            
            const magnifiedX = ((firstPoint.x - sourceX) / sourceSize) * 120;
            const magnifiedY = ((firstPoint.y - sourceY) / sourceSize) * 120;
            
            magnifierCtx.fillStyle = 'red';
            magnifierCtx.beginPath();
            magnifierCtx.arc(magnifiedX, magnifiedY, 4, 0, Math.PI * 2);
            magnifierCtx.fill();
        }
    }
}

// Draw preview line in magnifier for second point
function drawPreviewInMagnifier(coords) {
    if (!magnifierCtx || points.length === 0) return;
    
    // Redraw magnifier content first
    updateMagnifierContent(coords);
    
    const sourceSize = 40;
    const sourceX = Math.max(0, Math.min(canvas.width - sourceSize, coords.x - sourceSize/2));
    const sourceY = Math.max(0, Math.min(canvas.height - sourceSize, coords.y - sourceSize/2));
    
    const firstPoint = points[0];
    
    // Draw preview line if first point is visible
    if (firstPoint.x >= sourceX && firstPoint.x <= sourceX + sourceSize &&
        firstPoint.y >= sourceY && firstPoint.y <= sourceY + sourceSize) {
        
        const startX = ((firstPoint.x - sourceX) / sourceSize) * 120;
        const startY = ((firstPoint.y - sourceY) / sourceSize) * 120;
        const endX = ((coords.x - sourceX) / sourceSize) * 120;
        const endY = ((coords.y - sourceY) / sourceSize) * 120;
        
        magnifierCtx.strokeStyle = 'red';
        magnifierCtx.lineWidth = 2;
        magnifierCtx.setLineDash([3, 2]);
        magnifierCtx.beginPath();
        magnifierCtx.moveTo(startX, startY);
        magnifierCtx.lineTo(endX, endY);
        magnifierCtx.stroke();
        magnifierCtx.setLineDash([]);
    }
}

// Hide magnification bubble
function hideMagnifierBubble() {
    if (magnifierBubble) {
        magnifierBubble.style.display = 'none';
        magnifierBubble.style.visibility = 'hidden';
        magnifierBubble.style.top = '-9999px';
        magnifierBubble.style.left = '-9999px';
    }
    magnifierActive = false;
    console.log('Magnifier hidden');
}

function clearCanvas() {
	// Clear canvas
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	// Reset drawing state
	lines = {};
	points = [];
	angles = {};
	isDrawing = false;
	drawingStep = 0;
	currentTool = null;

	// Reset uploaded image
	uploadedImage = null;

	// Reset file input to allow selecting the same file again
	const fileInput = document.getElementById('image-upload');
	if (fileInput) {
	fileInput.value = '';
	}

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

	// Reset all tool buttons (remove selected class)
	document.querySelectorAll('.tool-btn').forEach(btn => {
	btn.classList.remove('selected');
	});

	// Reset checkpoints - both complete and available status
	document.querySelectorAll('.checkpoint-list li').forEach(li => {
	li.classList.remove('complete');
	li.classList.remove('available');
	li.classList.remove('active');
	});

	// Make first step available again (upload)
	const uploadStep = document.querySelector('[data-step="upload"]');
	if (uploadStep) {
	uploadStep.classList.add('available');
	}

	// Reset UI
	document.getElementById('instructions').textContent = 'Upload an image to begin the REBA assessment.';
	document.getElementById('calculate-btn').disabled = true;

	// Hide results section
	document.getElementById('results').style.display = 'none';
  
	// Remove all direction notes when clearing
	const directionNotes = document.querySelectorAll('.subject-direction-info');
	directionNotes.forEach(note => note.remove());

	// Also remove any paragraphs with direction text
	const allParagraphs = document.querySelectorAll('#results p');
	allParagraphs.forEach(p => {
		if (p.textContent && p.textContent.includes('Analysis performed with subject facing')) {
			p.remove();
		}
	});
  
	// Reset canvas to initial state with placeholder text
	ctx.fillStyle = '#333';
	ctx.font = '16px Arial';
	ctx.textAlign = 'center';
	ctx.fillText('Upload an image to begin', canvas.width/2, canvas.height/2);

	console.log("Canvas and UI completely reset, including uploaded image and file input");
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
// Make sure redrawCanvas updates all angle values properly
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
            
            // Recalculate angle if needed
            if (angles[toolType] === undefined) {
                angles[toolType] = calculateAngle(points[0], points[1], toolType);
            }
            
            // Draw angle text
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


// Function to open webcam on desktop
function openDesktopCamera() {
    // Create camera interface
    const cameraContainer = document.createElement('div');
    cameraContainer.id = 'camera-container';
    cameraContainer.style.position = 'fixed';
    cameraContainer.style.top = '0';
    cameraContainer.style.left = '0';
    cameraContainer.style.width = '100%';
    cameraContainer.style.height = '100%';
    cameraContainer.style.backgroundColor = 'rgba(0,0,0,0.9)';
    cameraContainer.style.zIndex = '9999';
    cameraContainer.style.display = 'flex';
    cameraContainer.style.flexDirection = 'column';
    cameraContainer.style.alignItems = 'center';
    cameraContainer.style.justifyContent = 'center';
    cameraContainer.style.padding = '20px';
    
    // Create video element
    const video = document.createElement('video');
    video.id = 'webcam-video';
    video.style.maxWidth = '100%';
    video.style.maxHeight = '60vh';
    video.style.backgroundColor = '#000';
    video.style.borderRadius = '8px';
    video.style.marginBottom = '15px';
    video.autoplay = true;
    video.playsInline = true;
    
    // Create canvas for capturing the image
    const canvas = document.createElement('canvas');
    canvas.id = 'capture-canvas';
    canvas.style.display = 'none';
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.marginTop = '10px';
    
    // Create capture button
    const captureButton = document.createElement('button');
    captureButton.textContent = 'Take Photo';
    captureButton.className = 'control-btn camera-btn';
    captureButton.style.padding = '10px 20px';
    
    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'control-btn';
    cancelButton.style.padding = '10px 20px';
    cancelButton.style.backgroundColor = '#f44336';
    
    // Add buttons to container
    buttonContainer.appendChild(captureButton);
    buttonContainer.appendChild(cancelButton);
    
    // Add everything to the camera container
    cameraContainer.appendChild(video);
    cameraContainer.appendChild(canvas);
    cameraContainer.appendChild(buttonContainer);
    
    // Add to page
    document.body.appendChild(cameraContainer);
    
    // Get user media
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(function(stream) {
            video.srcObject = stream;
            
            // Handle capture button click
            captureButton.addEventListener('click', function() {
                // Set canvas dimensions to match video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Draw the current frame to canvas
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                // Convert to data URL
                const imageDataURL = canvas.toDataURL('image/png');
                
                // Convert data URL to Blob
                const byteString = atob(imageDataURL.split(',')[1]);
                const mimeString = imageDataURL.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], { type: mimeString });
                
                // Create a File object
                const file = new File([blob], "webcam_capture.png", { type: 'image/png' });
                
                // Create a FileList-like object
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                
                // Set the file input's files
                const fileInput = document.getElementById('image-upload');
                fileInput.files = dataTransfer.files;
                
                // Trigger change event
                const event = new Event('change', { 'bubbles': true });
                fileInput.dispatchEvent(event);
                
                // Close the camera
                closeCamera(stream);
            });
            
            // Handle cancel button click
            cancelButton.addEventListener('click', function() {
                closeCamera(stream);
            });
        })
        .catch(function(error) {
            console.error("Error accessing webcam:", error);
            alert("Could not access webcam. Please check permissions and try again.");
            document.body.removeChild(cameraContainer);
        });
}

// Function to close camera
function closeCamera(stream) {
    // Stop all tracks in the stream
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    
    // Remove the camera container
    const cameraContainer = document.getElementById('camera-container');
    if (cameraContainer) {
        document.body.removeChild(cameraContainer);
    }
}

// Draw a line for a specific body part
function drawLine(point1, point2, toolType) {
    // Different colors for different body parts
    const colors = {
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

// 1. Better canvas scaling and handling for mobile
function resizeCanvas() {
    // Only resize if we have a canvas and if it's been initialized
    if (!canvas || !ctx) return;
    
    console.log('Resizing canvas');
    
    // If we have an uploaded image, make sure it fills the canvas properly
    if (uploadedImage) {
        // Get container dimensions
        const container = canvas.parentElement;
        const containerWidth = container.clientWidth - 20; // Allow some padding
        
        // Calculate aspect ratio
        const imageAspectRatio = uploadedImage.height / uploadedImage.width;
        
        // Set size based on container width while preserving aspect ratio
        let canvasWidth = containerWidth;
        let canvasHeight = Math.round(containerWidth * imageAspectRatio);
        
        // If too tall, scale down to fit viewport height
        const maxHeight = window.innerHeight * 0.6;
        if (canvasHeight > maxHeight) {
            canvasHeight = maxHeight;
            canvasWidth = Math.round(maxHeight / imageAspectRatio);
        }
        
        // Update canvas dimensions
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = canvasHeight + 'px';
        
        // Redraw the image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(uploadedImage, 0, 0, canvasWidth, canvasHeight);
        
        // Redraw any lines
        redrawCanvas();
    }
    
    // Make sure dimensions are synced
    synchronizeCanvasDimensions();
    
    console.log('Canvas resized to', canvas.width, 'x', canvas.height);
}

// 6. Improved init function
function initializeCanvas() {
    console.log('Initializing canvas');
    
    // Get canvas and context
    canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    
    ctx = canvas.getContext('2d');
    
    // Set initial canvas size
    canvas.width = 500;
    canvas.height = 400;
    canvas.style.width = '500px';
    canvas.style.height = '400px';
    
    // Add initial message
    ctx.fillStyle = '#333';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Upload an image to begin', canvas.width/2, canvas.height/2);
    
    // Listen for window resize
    window.addEventListener('resize', resizeCanvas);
    
    console.log('Canvas initialized');
}

function setupEventListeners() {
    console.log('Setting up event listeners');
    
    // Handle image upload
    const imageUpload = document.getElementById('image-upload');
    if (imageUpload) {
        // Remove existing listener first
        imageUpload.removeEventListener('change', handleImageUpload);
        imageUpload.addEventListener('change', handleImageUpload);
    }
    
    // Make sure canvas exists
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    // COMPLETELY REMOVE ALL OLD EVENT LISTENERS
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    canvas = newCanvas;
    ctx = canvas.getContext('2d');
    
    // Redraw image if it exists
    if (uploadedImage) {
        ctx.drawImage(uploadedImage, 0, 0, canvas.width, canvas.height);
        redrawCanvas();
    }
    
    // Detect if device supports touch
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    console.log('Setting up events for:', isTouchDevice ? 'TOUCH DEVICE' : 'MOUSE DEVICE');
    
    if (isTouchDevice) {
        // TOUCH EVENTS ONLY
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    } else {
        // MOUSE EVENTS ONLY  
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
    }
    
    // Tool selection buttons
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(btn => {
        btn.removeEventListener('click', handleToolClick); // Remove old listeners
        btn.addEventListener('click', handleToolClick);
    });
    
    // Other buttons
    const clearBtn = document.getElementById('clear-canvas');
    if (clearBtn) {
        clearBtn.removeEventListener('click', clearCanvas);
        clearBtn.addEventListener('click', clearCanvas);
    }
    
    const undoBtn = document.getElementById('undo-last');
    if (undoBtn) {
        undoBtn.removeEventListener('click', undoLastLine);
        undoBtn.addEventListener('click', undoLastLine);
    }
    
    const calcBtn = document.getElementById('calculate-btn');
    if (calcBtn) {
        calcBtn.removeEventListener('click', calculateREBA);
        calcBtn.addEventListener('click', calculateREBA);
    }
    
    console.log('Event listeners set up successfully');
}

// Separate handler functions to make them easier to remove
function handleToolClick() {
    selectTool(this.id);
}

function handleMouseDown(e) {
    e.preventDefault();
    if (!currentTool || drawingStep !== 0) return;
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    points = [coords];
    drawingStep = 1;
    isDrawing = true;
    
    // Draw first point
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, 6, 0, Math.PI * 2);
    ctx.fill();
    
    console.log('Mouse: First point placed at:', coords.x, coords.y);
}

function handleMouseMove(e) {
    if (drawingStep !== 1 || !isDrawing) return;
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    // Show preview line
    redrawCanvas();
    
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Redraw first point
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, 6, 0, Math.PI * 2);
    ctx.fill();
}

function handleMouseUp(e) {
    if (drawingStep !== 1 || !isDrawing || !currentTool) return;
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    // Make sure we moved at least 10 pixels
    const distance = Math.sqrt(Math.pow(coords.x - points[0].x, 2) + Math.pow(coords.y - points[0].y, 2));
    if (distance < 10) {
        console.log('Mouse: Line too short, ignoring');
        return;
    }
    
    finishLine(coords);
}

function handleTouchStart(e) {
    e.preventDefault();
    console.log('Touch start - current tool:', currentTool, 'drawing step:', drawingStep);
    
    if (!currentTool) {
        console.log('Touch start ignored - no tool selected');
        return;
    }
    
    const coords = getCanvasCoordinates(e);
    if (!coords) {
        console.log('Touch start - no valid coordinates');
        return;
    }
    
    console.log('Touch start coordinates:', coords);
    
    // Show magnifier immediately on touch
    showMagnifierBubble(e, coords);
}

function handleTouchMove(e) {
    e.preventDefault();
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    if (magnifierActive) {
        // Update magnifier bubble position and content
        updateMagnifierBubble(e, coords);
        
        // If we're drawing the second point, show preview line in magnifier
        if (drawingStep === 1 && points.length > 0) {
            drawPreviewInMagnifier(coords);
        }
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    console.log('Touch end - drawing step:', drawingStep, 'magnifier active:', magnifierActive);
    
    if (!magnifierActive) {
        console.log('Touch end - magnifier not active, ignoring');
        return;
    }
    
    const touch = e.changedTouches[0];
    if (!touch) {
        hideMagnifierBubble();
        return;
    }
    
    const coords = getCanvasCoordinates({ 
        type: 'touchend', 
        changedTouches: [touch] 
    });
    
    if (!coords) {
        hideMagnifierBubble();
        return;
    }
    
    // Place the point
    placeTouchPoint(coords);
    hideMagnifierBubble();
}

function handleTouchEnd(e) {
    e.preventDefault();
    console.log('Touch end - drawing step:', drawingStep, 'magnifier active:', magnifierActive);
    
    if (!magnifierActive) {
        console.log('Touch end - magnifier not active, ignoring');
        hideMagnifierBubble();
        return;
    }
    
    const touch = e.changedTouches[0];
    if (!touch) {
        hideMagnifierBubble();
        return;
    }
    
    const coords = getCanvasCoordinates({ 
        type: 'touchend', 
        changedTouches: [touch] 
    });
    
    if (!coords) {
        hideMagnifierBubble();
        return;
    }
    
    // Place the point
    placeTouchPoint(coords);
    hideMagnifierBubble();
}


// Place a point when touch ends
function placeTouchPoint(coords) {
    if (drawingStep === 0) {
        // First point
        points = [coords];
        drawingStep = 1;
        isDrawing = true;
        
        // Draw first point on main canvas
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, 8, 0, Math.PI * 2);
        ctx.fill();
        
        console.log('Touch: First point placed at:', coords.x, coords.y);
        
    } else if (drawingStep === 1 && points.length > 0) {
        // Second point - complete the line
        const distance = Math.sqrt(Math.pow(coords.x - points[0].x, 2) + Math.pow(coords.y - points[0].y, 2));
        
        if (distance < 15) {
            console.log('Touch: Line too short, ignoring. Distance:', distance);
            // Reset state
            drawingStep = 0;
            isDrawing = false;
            points = [];
            redrawCanvas();
            return;
        }
        
        finishLine(coords);
    }
}

function finishLine(coords) {
    // Complete the line
    points.push(coords);
    
    const toolType = currentTool.replace('draw-', '');
    lines[toolType] = [...points];
    
    // Calculate angle
    const angle = calculateAngle(points[0], points[1], toolType);
    angles[toolType] = angle;
    
    console.log(`Line completed for ${toolType}, angle: ${angle.toFixed(1)}°`);
    
    // Draw final line
    redrawCanvas();
    drawLine(points[0], points[1], toolType);
    
    // Reset state
    drawingStep = 0;
    isDrawing = false;
    points = [];
    
    // Update UI
    updateCheckpointForTool(toolType);
    showAdjustmentPopup(toolType);
}

// Fix 1: Improved touch event handling
function setupTouchEventListeners() {
    // Handle touch start - when user first touches the screen
    canvas.addEventListener('touchstart', function(e) {
        e.preventDefault(); // Prevent scrolling
        
        // Get the touch coordinates
        const touch = e.touches[0];
        if (!touch) return;
        
        // Convert touch to canvas coordinates
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        console.log('Touch start at:', x, y);
        
        // If not currently drawing, start drawing
        if (drawingStep === 0 && currentTool) {
            isDrawing = true;
            points = [{ x, y }];
            
            // Draw the first point
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Move to step 1 (line in progress)
            drawingStep = 1;
            console.log('First point placed');
        }
    }, { passive: false });
    
    // Handle touch move - when user moves finger on screen
    canvas.addEventListener('touchmove', function(e) {
        e.preventDefault(); // Prevent scrolling
        
        // Only continue if we're drawing and have placed the first point
        if (drawingStep !== 1 || !isDrawing) return;
        
        const touch = e.touches[0];
        if (!touch) return;
        
        // Convert touch to canvas coordinates
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // Redraw canvas and preview line
        redrawCanvas();
        
        // Draw preview line
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]); // Dashed line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Redraw first point
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, 4, 0, Math.PI * 2);
        ctx.fill();
    }, { passive: false });
    
    // Handle touch end - when user lifts finger
    canvas.addEventListener('touchend', function(e) {
        e.preventDefault();
        
        // Only continue if we're drawing and have placed the first point
        if (drawingStep !== 1 || !isDrawing) return;
        
        const touch = e.changedTouches[0]; // Use changedTouches for touchend
        if (!touch) return;
        
        // Convert touch to canvas coordinates
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // Add second point where the finger was lifted
        points.push({ x, y });
        
        // Save the line using the current tool
        if (currentTool) {
            const toolType = currentTool.replace('draw-', '');
            lines[toolType] = points.slice();
            
            // Calculate angle
            const angle = calculateAngle(points[0], points[1], toolType);
            angles[toolType] = angle;
            
            // Redraw canvas with final line
            redrawCanvas();
            
            // Draw the final line
            drawLine(points[0], points[1], toolType);
            
            // Show adjustments popup if needed
            showAdjustmentPopup(toolType);
            
            // Update checkpoint status
            updateCheckpointForTool(toolType);
            
            // Reset drawing state
            isDrawing = false;
            drawingStep = 0;
            points = [];
            
            console.log(`Line completed for ${toolType}, angle: ${angle.toFixed(1)}°`);
        }
    }, { passive: false });
}


// Calculate REBA score
function calculateREBA() {
    try {
        // Get angles from the drawn lines
        const neckAngle = angles['neck'] || 0;
        const trunkAngle = angles['trunk'] || 0;
        
        // For legs, calculate knee flexion angle
        const legsAngle = angles['lower-leg'] || 0;
        
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

// Function to handle desktop webcam
function openWebcam() {
    // Create minimal webcam UI
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    
    // Video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.style.maxWidth = '90%';
    video.style.maxHeight = '70vh';
    video.style.borderRadius = '4px';
    
    // Canvas for capture
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    
    // Button container
    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.gap = '10px';
    buttons.style.marginTop = '10px';
    
    // Capture button
    const captureBtn = document.createElement('button');
    captureBtn.className = 'compact-btn camera-btn';
    captureBtn.textContent = 'Take Photo';
    
    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'compact-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.backgroundColor = '#f44336';
    
    // Add elements
    buttons.appendChild(captureBtn);
    buttons.appendChild(cancelBtn);
    overlay.appendChild(video);
    overlay.appendChild(canvas);
    overlay.appendChild(buttons);
    document.body.appendChild(overlay);
    
    // Get webcam stream
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            
            // Handle capture
            captureBtn.onclick = () => {
                // Set canvas size
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Draw video frame to canvas
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                
                // Convert to blob
                canvas.toBlob(blob => {
                    // Create file
                    const file = new File([blob], 'webcam.jpg', { type: 'image/jpeg' });
                    
                    // Create FileList
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    
                    // Set to file input
                    const fileInput = document.getElementById('image-upload');
                    fileInput.files = dt.files;
                    
                    // Trigger change event
                    const event = new Event('change', { bubbles: true });
                    fileInput.dispatchEvent(event);
                    
                    // Close webcam
                    closeWebcam(stream, overlay);
                }, 'image/jpeg');
            };
            
            // Handle cancel
            cancelBtn.onclick = () => closeWebcam(stream, overlay);
        })
        .catch(err => {
            console.error('Webcam error:', err);
            document.body.removeChild(overlay);
            alert('Could not access webcam');
        });
}

// Close webcam helper
function closeWebcam(stream, overlay) {
    // Stop all tracks
    stream.getTracks().forEach(track => track.stop());
    
    // Remove overlay
    document.body.removeChild(overlay);
}

// displayREBAResults function with collapsible detailed scores
function displayREBAResults(result) {
    console.log("Displaying REBA results:", result);
    
    // Show results section
    document.getElementById('results').style.display = 'block';
    
    // Helper function to safely get values
    function safeValue(value, defaultValue = 0) {
        return value !== undefined && value !== null ? value : defaultValue;
    }
    
    // Set the main REBA score (most prominent)
    document.getElementById('final-reba-score').textContent = safeValue(result.final_score);
    
    // Set risk level and action required
    const riskInfo = getREBARiskLevel(safeValue(result.final_score));
    document.getElementById('risk-level').textContent = riskInfo.level;
    document.getElementById('action-required').textContent = riskInfo.action;
    
    // Set detailed breakdown scores (hidden by default)
    document.getElementById('trunk-score').textContent = safeValue(result.trunk_score || result.trunk);
    document.getElementById('neck-score').textContent = safeValue(result.neck_score || result.neck);
    document.getElementById('legs-score').textContent = safeValue(result.legs_score || result.legs);
    document.getElementById('group-a-score').textContent = safeValue(result.score_a || result.group_a);
    
    document.getElementById('upperarm-score').textContent = safeValue(result.upper_arm_score || result.upper_arm);
    document.getElementById('lowerarm-score').textContent = safeValue(result.lower_arm_score || result.lower_arm);
    document.getElementById('wrist-score').textContent = safeValue(result.wrist_score || result.wrist);
    document.getElementById('group-b-score').textContent = safeValue(result.score_b || result.group_b);
    
    document.getElementById('table-c-score').textContent = safeValue(result.table_c_score || result.table_c);
    document.getElementById('activity-score').textContent = safeValue(result.activity_score || result.activity);
    
    // Make sure the detailed scores start collapsed
    const details = document.getElementById('score-details');
    const button = document.querySelector('.toggle-details-btn');
    if (details && button) {
        details.classList.remove('expanded');
        details.classList.add('collapsed');
        button.classList.remove('expanded');
        button.innerHTML = '<span class="toggle-icon">▼</span>Show Detailed Breakdown';
    }
    
    // Remove ALL existing direction info to prevent duplication
	const existingDirectionInfos = document.querySelectorAll('.subject-direction-info');
	existingDirectionInfos.forEach(el => el.remove());

	// Also remove any paragraphs that contain the note text (backup cleanup)
	const allResultsParagraphs = document.querySelectorAll('#results p');
	allResultsParagraphs.forEach(p => {
		if (p.textContent && p.textContent.includes('Analysis performed with subject facing')) {
			p.remove();
		}
	});

	// Add explanation about subject direction (only after cleanup)
	const directionInfo = document.createElement('p');
	directionInfo.innerHTML = `<strong>Note:</strong> Analysis performed with subject facing ${subjectFacingDirection}.`;
	directionInfo.style.marginTop = "20px";
	directionInfo.style.fontStyle = "italic";
	directionInfo.className = 'subject-direction-info';

	// Insert after the main score area
	const mainScoreArea = document.querySelector('.reba-main-score');
	if (mainScoreArea) {
		mainScoreArea.after(directionInfo);
	} else {
		document.getElementById('results').appendChild(directionInfo);
	}  
    // Scroll to results
    document.getElementById('results').scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
    });
}

// Helper function to get risk level information
function getREBARiskLevel(score) {
    if (score >= 1 && score <= 3) {
        return {
            level: "Low Risk",
            action: "May need minor changes"
        };
    } else if (score >= 4 && score <= 7) {
        return {
            level: "Medium Risk", 
            action: "Further investigation, change may be needed"
        };
    } else if (score >= 8 && score <= 10) {
        return {
            level: "High Risk",
            action: "Investigate and implement changes soon"
        };
    } else if (score >= 11) {
        return {
            level: "Very High Risk",
            action: "Implement changes immediately"
        };
    } else {
        return {
            level: "Unknown Risk",
            action: "Review assessment"
        };
    }
}

function main() {
    console.log('Starting main initialization');
    
	setupCompactButtons();
	
	
    try {
        // Make app container visible
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.style.display = 'block';
        }
        
        // Hide loading message if present
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        // Initialize canvas
        initializeCanvas();
        
        // Set up event listeners for both desktop and mobile
        setupEventListeners();
        
        // Add mobile-friendly touch feedback
        addTouchFeedback();
        
        // Mark upload step as available
        const uploadStep = document.querySelector('[data-step="upload"]');
        if (uploadStep) {
            uploadStep.classList.add('available');
        }
		initializeMagnifier();
        
        console.log('Main initialization complete');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        alert('Error initializing application. Please reload the page.');
    }
}

// Run main when document is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    // If already loaded, run main immediately
    main();
}
