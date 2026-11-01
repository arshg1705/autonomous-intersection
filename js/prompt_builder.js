/**
 * Prompt Builder & Response Parser for LLM Batch Traffic Control
 * Formats decentralized local telemetry into structured prompt and validates JSON actions.
 */

class PromptBuilder {
  /**
   * System Prompt explaining the driving physics, rules of the road, and JSON output schema.
   */
  static getSystemPrompt() {
    return `You are the centralized real-time neural driving controller for an autonomous 4-way intersection.
You receive local sensor telemetry for 20 autonomous vehicles simultaneously.
In this single batch call, you must output the next physical driving decision for EVERY vehicle (IDs 0 to 19).

SAFETY INVARIANTS:
1. ZERO COLLISIONS: Under no circumstance may any vehicle contact another.
   - Front Sensor: If front distance is closing (relative_speed < 0) or distance < (speed * 1.6 + 3.5), you MUST output "BRAKE".
   - If front distance < 5.0m, output emergency "BRAKE" with intensity: 1.0.
   - If front vehicle is stationary (speed == 0), ego vehicle must stop with at least 3.0m safety gap.

2. TRAFFIC LIGHT LAWS:
   - RED:
     * If before stop line (passed_stop_line: false): Calculate braking intensity to bring car to a smooth halt before distance_to_stop_line reaches 0. If stopped at line, hold BRAKE (intensity: 0.6) or MAINTAIN.
     * If already entered intersection (passed_stop_line: true): DO NOT STOP inside the intersection box! Output ACCELERATE or MAINTAIN to clear the intersection immediately.
   - YELLOW:
     * Resolve the Dilemma Zone: If car is moving fast (> 5.0 m/s) and close to stop line (< 12m), stopping in time is impossible without harsh lockup; output MAINTAIN or ACCELERATE to safely clear before red.
     * If car is farther away (> 16m) or slow, output BRAKE to stop before the line.
   - GREEN:
     * ACCELERATE up to 10.0-12.0 m/s if front is clear.

3. ANTI-GRIDLOCK & ZERO DEADLOCKS:
   - If light is GREEN but front traffic is stalled across the intersection, DO NOT enter the intersection box; hold at the stop line.
   - Once past the stop line (passed_stop_line: true), vehicles have absolute clearance priority. NEVER stop or yield to lateral vehicles inside the intersection box; output ACCELERATE to flush through promptly.

OUTPUT FORMAT:
Return ONLY a valid JSON array of exactly 20 objects, one per car. Do not add markdown explanation outside the JSON.
Schema:
[
  { "id": 0, "action": "ACCELERATE" | "BRAKE" | "MAINTAIN", "throttle": float 0.0-1.0 (if ACCELERATE), "intensity": float 0.0-1.0 (if BRAKE) },
  ...
]`;
  }

  /**
   * Formats batch local telemetry array into the user prompt string
   * STRICT CONSTRAINT: ONLY decentralized local telemetry is included. NO GLOBAL (x, y) COORDINATES.
   */
  static formatBatchPrompt(batchTelemetry) {
    return JSON.stringify({
      timestamp: Date.now(),
      active_vehicles_count: batchTelemetry.length,
      telemetry: batchTelemetry
    }, null, 2);
  }

  /**
   * Cleans and parses LLM text response into structured action array
   */
  static parseLLMResponse(responseText) {
    if (!responseText || typeof responseText !== 'string') {
      throw new Error("Empty or non-string response received from LLM");
    }

    // Strip Markdown code blocks if present
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();

    // Sometimes models wrap array in { "decisions": [...] } or { "actions": [...] }
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // Attempt to extract JSON array substring
      const startIdx = cleaned.indexOf('[');
      const endIdx = cleaned.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        parsed = JSON.parse(cleaned.substring(startIdx, endIdx + 1));
      } else {
        throw new Error(`Failed to parse JSON response: ${e.message}`);
      }
    }

    if (!Array.isArray(parsed)) {
      if (parsed.actions && Array.isArray(parsed.actions)) {
        parsed = parsed.actions;
      } else if (parsed.decisions && Array.isArray(parsed.decisions)) {
        parsed = parsed.decisions;
      } else if (parsed.telemetry && Array.isArray(parsed.telemetry)) {
        parsed = parsed.telemetry;
      } else {
        throw new Error("LLM output is not a JSON array of car actions");
      }
    }

    // Sanitize and validate every car entry
    const sanitizedActions = new Map();
    for (const item of parsed) {
      if (item && typeof item.id === 'number') {
        const action = (item.action || 'MAINTAIN').toUpperCase();
        const validAction = ['ACCELERATE', 'BRAKE', 'MAINTAIN'].includes(action) ? action : 'MAINTAIN';

        sanitizedActions.set(item.id, {
          id: item.id,
          action: validAction,
          throttle: typeof item.throttle === 'number' ? Math.max(0, Math.min(1.0, item.throttle)) : 0.7,
          intensity: typeof item.intensity === 'number' ? Math.max(0, Math.min(1.0, item.intensity)) : 0.7
        });
      }
    }

    return sanitizedActions;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PromptBuilder;
}
