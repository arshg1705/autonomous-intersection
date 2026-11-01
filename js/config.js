/**
 * Autonomous Intersection Multi-Agent Simulation Configuration
 * All physical, geometric, timing, and model parameters.
 */

const CONFIG = {
  // Vehicle Population
  NUM_VEHICLES: 20,

  // Vehicle Physical Dimensions (meters)
  CAR_LENGTH: 4.5,
  CAR_WIDTH: 2.0,
  CAR_WHEELBASE: 2.7,

  // Kinematic & Acceleration Limits (m/s^2, m/s)
  MAX_SPEED: 12.0,            // ~43 km/h urban intersection speed limit
  MIN_SPEED: 0.0,
  MAX_ACCELERATION: 3.2,      // Max positive acceleration (throttle = 1.0)
  MAX_BRAKING: 6.5,           // Max deceleration under hard braking (intensity = 1.0)
  COMFORTABLE_BRAKING: 2.8,   // Target comfortable deceleration
  COAST_DECELERATION: 0.15,   // Natural rolling friction on MAINTAIN

  // Sensor Ranges (Local Observability)
  SENSOR: {
    FRONT_RANGE: 65.0,        // Max forward radar range (meters)
    REAR_RANGE: 40.0,         // Max rear-view radar range (meters)
    SIDE_RANGE: 8.0,          // Blind-spot lateral sensor range (meters)
    SAFE_FOLLOWING_TIME: 1.8, // 2-second rule buffer
    MIN_STANDSTILL_GAP: 3.0   // Min distance to maintain at complete stop
  },

  // Geometry: 4-Way Intersection
  INTERSECTION: {
    ROAD_WIDTH: 24.0,         // 4 lanes each direction (2 incoming, 2 outgoing)
    LANE_WIDTH: 3.5,
    INTERSECTION_RADIUS: 14.0,// Half-width of the intersection box
    APPROACH_LENGTH: 90.0,    // Length of each approach road arm
    TOTAL_WORLD_SIZE: 220.0,  // Boundary for spawning and clearing
    STOP_LINE_OFFSET: 14.5    // Distance from center (0,0) to stop line
  },

  // Traffic Light Phase Timing (Seconds)
  LIGHTS: {
    GREEN_DURATION: 12.0,     // Green phase duration
    YELLOW_DURATION: 3.5,     // Yellow phase duration
    ALL_RED_DURATION: 2.0     // All-red clearance interval to flush intersection
  },

  // LLM Decision Tick Loop
  SIMULATION: {
    DECISION_TICK_INTERVAL_MS: 1000, // 1 Hz LLM batch decision cycle (1 tick per second)
    PHYSICS_FPS: 60,                 // Continuous physics integration at 60 FPS
    MAX_HISTORY_ENTRIES: 50
  },

  // LLM Provider Presets & Default Configurations
  LLM_PROVIDERS: {
    BUILTIN_SIMULATOR: {
      name: "High-Fidelity Built-in Local Reasoner (Offline)",
      id: "simulator",
      description: "Instant, deterministic LLM-grade local reasoning engine. Zero API key needed, zero latency freeze.",
      requiresKey: false
    },
    GEMINI_FLASH: {
      name: "Google Gemini 2.0 Flash",
      id: "gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      model: "gemini-2.0-flash",
      description: "Google's ultra-fast flagship multimodal model with native JSON schema.",
      requiresKey: true
    },
    GROQ_LLAMA: {
      name: "Groq (Llama 3.3 70B Versatile)",
      id: "groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.3-70b-versatile",
      description: "Blazing fast LPU inference (~200ms latency for all 20 cars).",
      requiresKey: true
    },
    OPENAI_GPT4O_MINI: {
      name: "OpenAI GPT-4o Mini",
      id: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini",
      description: "Fast, accurate OpenAI model with structured response format.",
      requiresKey: true
    },
    OLLAMA_LOCAL: {
      name: "Local Ollama (Llama 3.2 / Mistral / Qwen)",
      id: "ollama",
      endpoint: "http://localhost:11434/api/chat",
      model: "llama3.2:latest",
      description: "Private local inference running on your own machine.",
      requiresKey: false
    }
  }
};

// Export for ES modules and standard browser globals
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
