# REBA scoring tables and final score calculation

def calculate_table_a(neck_score, trunk_score, legs_score):
    """
    Look up the Posture A score using the REBA Table A
    
    Args:
        neck_score: REBA score for neck (1-3)
        trunk_score: REBA score for trunk (1-5)
        legs_score: REBA score for legs (1-4)
        
    Returns:
        The Posture A score from Table A (1-9)
    """
    # Table A lookup matrix
    table_a = [
        # Neck=1
        [
            # Legs 1,2,3,4
            [ 1, 2, 3, 4 ],  # Trunk=1
            [ 2, 3, 4, 5 ],  # Trunk=2
            [ 3, 4, 5, 6 ],  # Trunk=3
            [ 4, 5, 6, 7 ],  # Trunk=4
            [ 5, 6, 7, 8 ],  # Trunk=5
        ],
        # Neck=2
        [
            # Legs 1,2,3,4
            [ 1, 3, 4, 5 ],  # Trunk=1
            [ 2, 4, 5, 6 ],  # Trunk=2
            [ 3, 5, 6, 7 ],  # Trunk=3
            [ 4, 6, 7, 8 ],  # Trunk=4
            [ 5, 7, 8, 9 ],  # Trunk=5
        ],
        # Neck=3
        [
            # Legs 1,2,3,4
            [ 3, 3, 5, 6 ],  # Trunk=1
            [ 3, 5, 6, 7 ],  # Trunk=2
            [ 4, 6, 7, 8 ],  # Trunk=3
            [ 5, 7, 8, 9 ],  # Trunk=4
            [ 6, 8, 9, 9 ],  # Trunk=5
        ]
    ]
    
    # Ensure indices are within bounds
    neck_idx = min(max(neck_score - 1, 0), 2)  # 0-2 (for scores 1-3)
    trunk_idx = min(max(trunk_score - 1, 0), 4)  # 0-4 (for scores 1-5)
    legs_idx = min(max(legs_score - 1, 0), 3)  # 0-3 (for scores 1-4)
    
    # Return the looked-up score
    return table_a[neck_idx][trunk_idx][legs_idx]


def calculate_table_b(upper_arm_score, lower_arm_score, wrist_score):
    """
    Look up the Posture B score using the REBA Table B
    
    Args:
        upper_arm_score: REBA score for upper arm (1-6)
        lower_arm_score: REBA score for lower arm (1-2)
        wrist_score: REBA score for wrist (1-3)
        
    Returns:
        The Posture B score from Table B (1-9)
    """
    # Table B lookup matrix
    table_b = [
        # Lower Arm=1
        [
            # Wrist 1,2,3
            [ 1, 2, 2 ],  # Upper Arm=1
            [ 1, 2, 3 ],  # Upper Arm=2
            [ 3, 4, 5 ],  # Upper Arm=3
            [ 4, 5, 5 ],  # Upper Arm=4
            [ 6, 7, 8 ],  # Upper Arm=5
            [ 7, 8, 8 ],  # Upper Arm=6
        ],
        # Lower Arm=2
        [
            # Wrist 1,2,3
            [ 1, 2, 3 ],  # Upper Arm=1
            [ 2, 3, 4 ],  # Upper Arm=2
            [ 4, 5, 5 ],  # Upper Arm=3
            [ 5, 6, 7 ],  # Upper Arm=4
            [ 7, 8, 8 ],  # Upper Arm=5
            [ 8, 9, 9 ],  # Upper Arm=6
        ]
    ]
    
    # Ensure indices are within bounds
    upper_arm_idx = min(max(upper_arm_score - 1, 0), 5)  # 0-5 (for scores 1-6)
    lower_arm_idx = min(max(lower_arm_score - 1, 0), 1)  # 0-1 (for scores 1-2)
    wrist_idx = min(max(wrist_score - 1, 0), 2)  # 0-2 (for scores 1-3)
    
    # Return the looked-up score
    return table_b[lower_arm_idx][upper_arm_idx][wrist_idx]


def calculate_table_c(score_a, score_b):
    """
    Look up the Table C score using the REBA Table C
    
    Args:
        score_a: Score A (Posture A + Force/Load score, 1-12)
        score_b: Score B (Posture B + Coupling score, 1-12)
        
    Returns:
        The Table C score (1-12)
    """
    # Table C lookup matrix
    table_c = [
        # Score B values (1-12)
        #  1  2  3  4  5  6  7  8  9 10 11 12
        [  1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7 ],  # Score A=1
        [  1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8 ],  # Score A=2
        [  2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8 ],  # Score A=3
        [  3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9 ],  # Score A=4
        [  4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9 ],  # Score A=5
        [  6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10 ],  # Score A=6
        [  7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11 ],  # Score A=7
        [  8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11 ],  # Score A=8
        [  9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12 ],  # Score A=9
        [ 10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12 ],  # Score A=10
        [ 11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12 ],  # Score A=11
        [ 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12 ],  # Score A=12
    ]
    
    # Ensure indices are within bounds
    score_a_idx = min(max(score_a - 1, 0), 11)  # 0-11 (for scores 1-12)
    score_b_idx = min(max(score_b - 1, 0), 11)  # 0-11 (for scores 1-12)
    
    # Return the looked-up score
    return table_c[score_a_idx][score_b_idx]


def calculate_force_score(force_level, shock=False):
    """
    Calculate the Force/Load score
    
    Args:
        force_level: Level of force/load (0=light, 1=medium, 2=heavy)
        shock: Boolean indicating if there is shock or rapid buildup of force
        
    Returns:
        The Force/Load score (0-3)
    """
    score = force_level  # 0 for light, 1 for medium, 2 for heavy
    if shock:
        score += 1
    return score


def calculate_coupling_score(coupling_quality):
    """
    Return the Coupling score
    
    Args:
        coupling_quality: Quality of grip/coupling (0=good, 1=fair, 2=poor, 3=unacceptable)
        
    Returns:
        The Coupling score (0-3)
    """
    return coupling_quality  # 0-3 based on quality


def calculate_activity_score(static_posture, repeated_actions, rapid_changes):
    """
    Calculate the Activity score
    
    Args:
        static_posture: Boolean indicating if one or more body parts are static for >1 min
        repeated_actions: Boolean indicating if there are repeated small range actions (>4/min)
        rapid_changes: Boolean indicating if there are rapid large changes in posture
        
    Returns:
        The Activity score (0-3)
    """
    score = 0
    if static_posture:
        score += 1
    if repeated_actions:
        score += 1
    if rapid_changes:
        score += 1
    return score


def get_risk_level(final_score):
    """
    Determine the risk level based on the final REBA score
    
    Args:
        final_score: The final REBA score (1-15)
        
    Returns:
        A string describing the risk level and recommended action
    """
    if final_score >= 11:
        return "Very High Risk. Implement Change"
    elif final_score >= 8:
        return "High Risk. Investigate and Implement Change Soon"
    elif final_score >= 4:
        return "Medium Risk. Further Investigation, Change Soon"
    else:
        return "Low Risk. Change May Be Needed"


def calculate_final_reba_score(component_scores):
    """
    Calculate the final REBA score from all component scores
    
    Args:
        component_scores: Dictionary containing all component scores
        
    Returns:
        Dictionary with all intermediate calculations and the final REBA score
    """
    # Extract individual scores from component_scores dictionary
    neck_score = component_scores['neck']
    trunk_score = component_scores['trunk']
    legs_score = component_scores['legs']
    force_score = component_scores['force']
    
    upper_arm_score = component_scores['upper_arm']
    lower_arm_score = component_scores['lower_arm']
    wrist_score = component_scores['wrist']
    coupling_score = component_scores['coupling']
    
    activity_score = component_scores['activity']
    
    # Calculate table scores
    posture_a = calculate_table_a(neck_score, trunk_score, legs_score)
    score_a = posture_a + force_score
    
    posture_b = calculate_table_b(upper_arm_score, lower_arm_score, wrist_score)
    score_b = posture_b + coupling_score
    
    table_c_score = calculate_table_c(score_a, score_b)
    final_score = table_c_score + activity_score
    
    # Determine risk level
    risk_level = get_risk_level(final_score)
    
    # Return all scores for detailed report
    return {
        'posture_a': posture_a,
        'score_a': score_a,
        'posture_b': posture_b,
        'score_b': score_b,
        'table_c_score': table_c_score,
        'final_score': final_score,
        'risk_level': risk_level
    }