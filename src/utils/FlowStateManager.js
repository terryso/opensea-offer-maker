import logger from './logger.js';

/**
 * Flow states for interactive CLI flows
 * @readonly
 * @enum {string}
 */
export const FLOW_STATES = {
  SELECT_COLLECTION: 'select-collection',
  SELECT_NFT: 'select-nft',
  SELECT_PRICING_METHOD: 'select-pricing-method',
  INPUT_PRICING_VALUE: 'input-pricing-value',
  CONFIRM: 'confirm',
  DONE: 'done',
  CANCELLED: 'cancelled'
};

/**
 * Navigation actions for flow control
 * @readonly
 * @enum {string}
 */
export const NAVIGATION_ACTIONS = {
  BACK: 'back',
  CANCEL: 'cancel',
  NEXT: 'next',
  COMPLETE: 'complete'
};

/**
 * Valid state transitions for the flow state machine
 * Maps current state to array of allowed next states
 * @type {Object<string, string[]>}
 */
const VALID_TRANSITIONS = {
  [FLOW_STATES.SELECT_COLLECTION]: [
    FLOW_STATES.SELECT_NFT,
    FLOW_STATES.CANCELLED
  ],
  [FLOW_STATES.SELECT_NFT]: [
    FLOW_STATES.SELECT_PRICING_METHOD,
    FLOW_STATES.SELECT_COLLECTION, // Back
    FLOW_STATES.CANCELLED
  ],
  [FLOW_STATES.SELECT_PRICING_METHOD]: [
    FLOW_STATES.INPUT_PRICING_VALUE,
    FLOW_STATES.SELECT_NFT, // Back
    FLOW_STATES.CANCELLED
  ],
  [FLOW_STATES.INPUT_PRICING_VALUE]: [
    FLOW_STATES.CONFIRM,
    FLOW_STATES.SELECT_PRICING_METHOD, // Back
    FLOW_STATES.CANCELLED
  ],
  [FLOW_STATES.CONFIRM]: [
    FLOW_STATES.DONE,
    FLOW_STATES.INPUT_PRICING_VALUE, // Back
    FLOW_STATES.CANCELLED
  ],
  [FLOW_STATES.DONE]: [], // Terminal state
  [FLOW_STATES.CANCELLED]: [] // Terminal state
};

/**
 * Terminal states that cannot transition to other states
 * @type {Set<string>}
 */
const TERMINAL_STATES = new Set([
  FLOW_STATES.DONE,
  FLOW_STATES.CANCELLED
]);

/**
 * FlowStateManager - Manages interactive CLI flow state and navigation
 *
 * Provides a state machine pattern for complex user interaction flows
 * with navigation history, context management, and validation.
 *
 * @example
 * ```javascript
 * import { FlowStateManager, FLOW_STATES } from './FlowStateManager.js';
 *
 * const flowManager = new FlowStateManager();
 *
 * // Transition to next state with context data
 * flowManager.transition(FLOW_STATES.SELECT_COLLECTION, {
 *   collectionId: 'abc123'
 * });
 *
 * // Navigate back to previous state
 * flowManager.back();
 *
 * // Get current state context
 * const context = flowManager.getContext();
 * ```
 */
export class FlowStateManager {
  /**
   * Creates a new FlowStateManager instance
   * @param {Object} options - Configuration options
   * @param {string} options.initialState - Initial flow state (default: SELECT_COLLECTION)
   * @param {Object} options.initialContext - Initial context data
   * @param {number} options.maxHistorySize - Maximum navigation history size
   */
  constructor(options = {}) {
    const {
      initialState = FLOW_STATES.SELECT_COLLECTION,
      initialContext = {},
      maxHistorySize = 20
    } = options;

    // Validate initial state
    if (!Object.values(FLOW_STATES).includes(initialState)) {
      throw new Error(`Invalid initial state: ${initialState}`);
    }

    this.currentState = initialState;
    this.context = { ...initialContext };
    this.history = [];
    this.maxHistorySize = Math.max(1, maxHistorySize);
    this.isCompleted = false;
    this.isCancelled = false;

    logger.debug(`FlowStateManager initialized with state: ${initialState}`);
  }

  /**
   * Gets the current flow state
   * @returns {string} Current state
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * Gets the navigation history
   * @returns {Array<Object>} Array of historical states with context
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Gets context data for the current state
   * @param {string} [key] - Optional context key to retrieve
   * @returns {*} Context data or specific value if key provided
   */
  getContext(key) {
    if (key !== undefined) {
      return this.context[key];
    }
    return { ...this.context };
  }

  /**
   * Updates context data for the current state
   * @param {Object|string} data - Context data or key
   * @param {*} [value] - Value if providing key-value pair
   */
  updateContext(data, value) {
    if (typeof data === 'string' && value !== undefined) {
      // Single key-value update
      this.context[data] = value;
    } else if (typeof data === 'object' && data !== null) {
      // Merge object data
      this.context = { ...this.context, ...data };
    } else {
      throw new Error('Invalid context update parameters');
    }

    logger.debug(`Context updated for state ${this.currentState}`);
  }

  /**
   * Transitions to a new state with optional context data
   * @param {string} nextState - Target state to transition to
   * @param {Object} [contextData] - Additional context data to merge
   * @throws {Error} If transition is invalid
   */
  transition(nextState, contextData = {}) {
    // Validate target state
    if (!Object.values(FLOW_STATES).includes(nextState)) {
      throw new Error(`Invalid target state: ${nextState}`);
    }

    // Check if current state is terminal
    if (TERMINAL_STATES.has(this.currentState)) {
      throw new Error(`Cannot transition from terminal state: ${this.currentState}`);
    }

    // Validate transition
    if (!VALID_TRANSITIONS[this.currentState].includes(nextState)) {
      throw new Error(
        `Invalid transition from ${this.currentState} to ${nextState}. ` +
        `Valid transitions: ${VALID_TRANSITIONS[this.currentState].join(', ')}`
      );
    }

    // Add current state to history before transitioning
    this.history.push({
      state: this.currentState,
      context: { ...this.context },
      timestamp: new Date().toISOString()
    });

    // Trim history if it exceeds max size
    while (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Update state and context
    this.currentState = nextState;
    if (Object.keys(contextData).length > 0) {
      this.context = { ...this.context, ...contextData };
    }

    // Update completion status
    this.isCompleted = this.currentState === FLOW_STATES.DONE;
    this.isCancelled = this.currentState === FLOW_STATES.CANCELLED;

    logger.debug(`Transitioned from previous state to: ${nextState}`);
  }

  /**
   * Navigates back to the previous state
   * @returns {boolean} True if navigation was successful, false if no history
   */
  back() {
    if (this.history.length === 0) {
      logger.debug('No history available for navigation back');
      return false;
    }

    if (TERMINAL_STATES.has(this.currentState)) {
      logger.debug(`Cannot go back from terminal state: ${this.currentState}`);
      return false;
    }

    const previousState = this.history.pop();

    // Restore previous state and context
    this.currentState = previousState.state;
    this.context = { ...previousState.context };
    this.isCompleted = false;
    this.isCancelled = false;

    logger.debug(`Navigated back to: ${previousState.state}`);
    return true;
  }

  /**
   * Cancels the current flow
   * @throws {Error} If flow is already completed or cancelled
   */
  cancel() {
    if (this.isCancelled) {
      throw new Error('Flow is already cancelled');
    }

    if (this.isCompleted) {
      throw new Error('Cannot cancel a completed flow');
    }

    // Add current state to history before cancelling
    this.history.push({
      state: this.currentState,
      context: { ...this.context },
      timestamp: new Date().toISOString()
    });

    this.currentState = FLOW_STATES.CANCELLED;
    this.isCancelled = true;

    logger.info('Flow cancelled by user');
  }

  /**
   * Completes the current flow successfully
   * @throws {Error} If flow is already completed or cancelled
   */
  complete() {
    if (this.isCompleted) {
      throw new Error('Flow is already completed');
    }

    if (this.isCancelled) {
      throw new Error('Cannot complete a cancelled flow');
    }

    // Add current state to history before completing
    this.history.push({
      state: this.currentState,
      context: { ...this.context },
      timestamp: new Date().toISOString()
    });

    this.currentState = FLOW_STATES.DONE;
    this.isCompleted = true;

    logger.info('Flow completed successfully');
  }

  /**
   * Checks if the flow is completed
   * @returns {boolean} True if flow is in DONE state
   */
  isFlowCompleted() {
    return this.isCompleted;
  }

  /**
   * Checks if the flow is cancelled
   * @returns {boolean} True if flow is in CANCELLED state
   */
  isFlowCancelled() {
    return this.isCancelled;
  }

  /**
   * Checks if the flow is in a terminal state (completed or cancelled)
   * @returns {boolean} True if flow is in terminal state
   */
  isTerminal() {
    return TERMINAL_STATES.has(this.currentState);
  }

  /**
   * Gets valid transitions from the current state
   * @returns {Array<string>} Array of valid next states
   */
  getValidTransitions() {
    return [...VALID_TRANSITIONS[this.currentState]];
  }

  /**
   * Resets the flow manager to initial state
   * @param {string} [resetState] - State to reset to (default: SELECT_COLLECTION)
   * @param {Object} [resetContext] - Context to reset to
   */
  reset(resetState = FLOW_STATES.SELECT_COLLECTION, resetContext = {}) {
    this.currentState = resetState;
    this.context = { ...resetContext };
    this.history = [];
    this.isCompleted = false;
    this.isCancelled = false;

    logger.debug(`Flow reset to state: ${resetState}`);
  }

  /**
   * Serializes the current flow state for persistence
   * @returns {Object} Serialized flow data
   */
  serialize() {
    return {
      currentState: this.currentState,
      context: { ...this.context },
      history: [...this.history],
      isCompleted: this.isCompleted,
      isCancelled: this.isCancelled,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Deserializes and restores flow state from serialized data
   * @param {Object} data - Serialized flow data
   * @throws {Error} If data is invalid or corrupted
   */
  deserialize(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid serialization data');
    }

    // Validate required fields
    const requiredFields = ['currentState', 'context', 'history'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate state
    if (!Object.values(FLOW_STATES).includes(data.currentState)) {
      throw new Error(`Invalid state in data: ${data.currentState}`);
    }

    // Restore state
    this.currentState = data.currentState;
    this.context = { ...data.context };
    this.history = [...data.history];
    this.isCompleted = data.isCompleted || false;
    this.isCancelled = data.isCancelled || false;

    logger.debug(`Flow deserialized to state: ${data.currentState}`);
  }
}

export default FlowStateManager;
