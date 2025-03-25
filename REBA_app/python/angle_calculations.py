# Core REBA angle calculation functions

def calculate_neck_score(angle, twisted=False, side_bending=False):
    """
    Calculate the REBA score for the neck based on angle and adjustments
    
    Args:
        angle: The neck angle in degrees (negative = extension, positive = flexion)
        twisted: Boolean indicating if the neck is twisted
        side_bending: Boolean indicating if the neck is side bending
        
    Returns:
        The REBA score for the neck (1-3)
    """
    # Base score depends on flexion/extension angle
    if angle < 0:  # Extension (backward)
        base_score = 2
    elif angle > 20:  # Flexion > 20 degrees
        base_score = 2
    else:  # Flexion 0-20 degrees
        base_score = 1
    
    # Add adjustments
    if twisted:
        base_score += 1
    if side_bending:
        base_score += 1
    
    return base_score


def calculate_trunk_score(angle, twisted=False, side_bending=False):
    """
    Calculate the REBA score for the trunk based on angle and adjustments
    
    Args:
        angle: The trunk angle in degrees (negative = extension, positive = flexion)
        twisted: Boolean indicating if the trunk is twisted
        side_bending: Boolean indicating if the trunk is side bending
        
    Returns:
        The REBA score for the trunk (1-5)
    """
    # Determine base score from angle
    if -2.5 <= angle <= 2.5:  # Upright (near vertical)
        base_score = 1
    elif -20 <= angle < -2.5:  # Slight extension
        base_score = 2
    elif angle < -20:  # Significant extension
        base_score = 3
    elif 2.5 < angle <= 20:  # Slight flexion
        base_score = 2
    elif 20 < angle < 60:  # Moderate flexion
        base_score = 3
    else:  # angle >= 60, Significant flexion
        base_score = 4
    
    # Add adjustments
    if twisted:
        base_score += 1
    if side_bending:
        base_score += 1
    
    return base_score


def calculate_legs_score(angle, leg_raised=False):
    """
    Calculate the REBA score for the legs based on knee flexion angle and position
    
    Args:
        angle: The knee flexion angle in degrees (0 = straight leg)
        leg_raised: Boolean indicating if one leg is raised
        
    Returns:
        The REBA score for the legs (1-4)
    """
    # Start with base score of 1
    base_score = 1
    
    # Adjust score based on knee flexion
    if angle < 30:
        # Base score remains 1 for knee flexion < 30°
        pass
    elif angle < 60:
        # Score of 2 for knee flexion 30-60°
        base_score = 2
    else:
        # Score of 3 for knee flexion > 60°
        base_score = 3
    
    # Add for one leg raised
    if leg_raised:
        base_score += 1
    
    return base_score


def calculate_upper_arm_score(angle, shoulder_raised=False, arm_abducted=False, arm_supported=False):
    """
    Calculate the REBA score for the upper arm based on angle and adjustments
    
    Args:
        angle: The upper arm angle in degrees (negative = extension behind body, positive = flexion)
        shoulder_raised: Boolean indicating if the shoulder is raised
        arm_abducted: Boolean indicating if the arm is abducted
        arm_supported: Boolean indicating if the arm is supported or person is leaning
        
    Returns:
        The REBA score for the upper arm (1-6)
    """
    # Calculate base score from angle
    if angle < 0:  # Arm extended behind body
        base_score = 2
    elif angle <= 20:  # Slight flexion
        base_score = 1
    elif angle <= 45:  # Moderate flexion
        base_score = 2
    elif angle <= 90:  # High flexion
        base_score = 3
    else:  # > 90 degrees extreme flexion
        base_score = 4
    
    # Apply adjustments
    if shoulder_raised:
        base_score += 1
    if arm_abducted:
        base_score += 1
    if arm_supported:
        base_score -= 1  # This is the only score reduction in REBA
    
    # Ensure minimum score of 1
    return max(1, base_score)


def calculate_lower_arm_score(angle):
    """
    Calculate the REBA score for the lower arm based on flexion angle
    
    Args:
        angle: The elbow flexion angle in degrees (0 = straight arm, 90 = right angle)
        
    Returns:
        The REBA score for the lower arm (1-2)
    """
    # Ideal range is 60-100 degrees
    if 60 <= angle <= 100:
        return 1
    else:
        # Either < 60 (too extended) or > 100 (too flexed)
        return 2


def calculate_wrist_score(angle, twisted=False):
    """
    Calculate the REBA score for the wrist based on angle and twist
    
    Args:
        angle: The wrist angle in degrees (positive or negative = flexion/extension)
        twisted: Boolean indicating if the wrist is bent from midline or twisted
        
    Returns:
        The REBA score for the wrist (1-3)
    """
    # Base score depends on absolute angle (flexion or extension)
    if abs(angle) <= 15:  # Small angle
        base_score = 1
    else:  # Large angle
        base_score = 2
    
    # Add for wrist twisted or bent from midline
    if twisted:
        base_score += 1
    
    return base_score