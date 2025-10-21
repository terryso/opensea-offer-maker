import { jest } from '@jest/globals';
import {
  FlowStateManager,
  FLOW_STATES,
  NAVIGATION_ACTIONS
} from '../utils/FlowStateManager';

// Create a simple mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

// Mock the logger module
jest.mock('../utils/logger', () => mockLogger);

describe('FlowStateManager', () => {
  let flowManager;

  beforeEach(() => {
    flowManager = new FlowStateManager();
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default state', () => {
      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_COLLECTION);
      expect(flowManager.getContext()).toEqual({});
      expect(flowManager.getHistory()).toEqual([]);
      expect(flowManager.isFlowCompleted()).toBe(false);
      expect(flowManager.isFlowCancelled()).toBe(false);
    });

    it('should accept custom initial state', () => {
      const customManager = new FlowStateManager({
        initialState: FLOW_STATES.SELECT_NFT,
        initialContext: { collectionId: 'test123' },
        maxHistorySize: 5
      });

      expect(customManager.getCurrentState()).toBe(FLOW_STATES.SELECT_NFT);
      expect(customManager.getContext()).toEqual({ collectionId: 'test123' });
      expect(customManager.getHistory()).toEqual([]);
    });

    it('should throw error for invalid initial state', () => {
      expect(() => {
        new FlowStateManager({ initialState: 'invalid-state' });
      }).toThrow('Invalid initial state: invalid-state');
    });

    it('should handle minimum history size', () => {
      const customManager = new FlowStateManager({ maxHistorySize: 0 });
      expect(customManager.maxHistorySize).toBe(1);
    });
  });

  describe('State Management', () => {
    it('should return current state correctly', () => {
      flowManager.currentState = FLOW_STATES.CONFIRM;
      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.CONFIRM);
    });

    it('should identify terminal states correctly', () => {
      flowManager.currentState = FLOW_STATES.DONE;
      expect(flowManager.isTerminal()).toBe(true);

      flowManager.currentState = FLOW_STATES.CANCELLED;
      expect(flowManager.isTerminal()).toBe(true);

      flowManager.currentState = FLOW_STATES.SELECT_COLLECTION;
      expect(flowManager.isTerminal()).toBe(false);
    });
  });

  describe('Context Management', () => {
    it('should get entire context when no key provided', () => {
      flowManager.context = { test: 'value', number: 42 };
      expect(flowManager.getContext()).toEqual({ test: 'value', number: 42 });
    });

    it('should get specific context value when key provided', () => {
      flowManager.context = { test: 'value', number: 42 };
      expect(flowManager.getContext('test')).toBe('value');
      expect(flowManager.getContext('number')).toBe(42);
      expect(flowManager.getContext('missing')).toBeUndefined();
    });

    it('should update context with object', () => {
      flowManager.updateContext({ test: 'value', number: 42 });
      expect(flowManager.getContext()).toEqual({ test: 'value', number: 42 });

      // Test merging
      flowManager.updateContext({ newField: 'new' });
      expect(flowManager.getContext()).toEqual({
        test: 'value',
        number: 42,
        newField: 'new'
      });
    });

    it('should update context with key-value pair', () => {
      flowManager.updateContext('test', 'value');
      expect(flowManager.getContext('test')).toBe('value');

      flowManager.updateContext('number', 42);
      expect(flowManager.getContext('number')).toBe(42);
    });

    it('should throw error for invalid context update parameters', () => {
      expect(() => flowManager.updateContext(null)).toThrow('Invalid context update parameters');
      expect(() => flowManager.updateContext('key')).toThrow('Invalid context update parameters');
      expect(() => flowManager.updateContext(123, 'value')).toThrow('Invalid context update parameters');
    });
  });

  describe('State Transitions', () => {
    it('should transition to valid states', () => {
      flowManager.transition(FLOW_STATES.SELECT_NFT, { nftId: 'nft123' });

      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_NFT);
      expect(flowManager.getContext('nftId')).toBe('nft123');
      expect(flowManager.getHistory()).toHaveLength(1);
      expect(flowManager.getHistory()[0].state).toBe(FLOW_STATES.SELECT_COLLECTION);
    });

    it('should add context data during transition', () => {
      flowManager.updateContext('initial', 'data');
      flowManager.transition(FLOW_STATES.SELECT_NFT, { nftId: 'nft123' });

      expect(flowManager.getContext()).toEqual({
        initial: 'data',
        nftId: 'nft123'
      });
    });

    it('should throw error for invalid target state', () => {
      expect(() => {
        flowManager.transition('invalid-state');
      }).toThrow('Invalid target state: invalid-state');
    });

    it('should throw error for invalid transition', () => {
      // Cannot transition from SELECT_COLLECTION directly to CONFIRM
      expect(() => {
        flowManager.transition(FLOW_STATES.CONFIRM);
      }).toThrow('Invalid transition from select-collection to confirm');
    });

    it('should throw error when transitioning from terminal state', () => {
      flowManager.currentState = FLOW_STATES.DONE;

      expect(() => {
        flowManager.transition(FLOW_STATES.SELECT_COLLECTION);
      }).toThrow('Cannot transition from terminal state: done');
    });

    it('should limit history size', () => {
      const smallHistoryManager = new FlowStateManager({ maxHistorySize: 2 });

      // Add 3 transitions (should keep only 2 in history)
      smallHistoryManager.transition(FLOW_STATES.SELECT_NFT);
      smallHistoryManager.transition(FLOW_STATES.SELECT_PRICING_METHOD);
      smallHistoryManager.transition(FLOW_STATES.INPUT_PRICING_VALUE);

      expect(smallHistoryManager.getHistory()).toHaveLength(2);
      expect(smallHistoryManager.getHistory()[0].state).toBe(FLOW_STATES.SELECT_NFT);
      expect(smallHistoryManager.getHistory()[1].state).toBe(FLOW_STATES.SELECT_PRICING_METHOD);
    });

    it('should include timestamps in history', () => {
      const beforeTime = new Date();
      flowManager.transition(FLOW_STATES.SELECT_NFT);
      const afterTime = new Date();

      const history = flowManager.getHistory();
      expect(history).toHaveLength(1);

      const historyTimestamp = new Date(history[0].timestamp);
      expect(historyTimestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(historyTimestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('Navigation Methods', () => {
    beforeEach(() => {
      // Set up a history for navigation tests
      flowManager.transition(FLOW_STATES.SELECT_NFT, { nftId: 'nft123' });
      flowManager.transition(FLOW_STATES.SELECT_PRICING_METHOD, { method: 'fixed' });
    });

    describe('back()', () => {
      it('should navigate back successfully', () => {
        expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_PRICING_METHOD);
        expect(flowManager.getContext('method')).toBe('fixed');

        const result = flowManager.back();

        expect(result).toBe(true);
        expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_NFT);
        expect(flowManager.getContext('nftId')).toBe('nft123');
        expect(flowManager.getContext('method')).toBeUndefined();
        expect(flowManager.getHistory()).toHaveLength(1);
      });

      it('should return false when no history available', () => {
        // Clear history
        flowManager.history = [];

        const result = flowManager.back();

        expect(result).toBe(false);
        expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_PRICING_METHOD);
      });

      it('should return false from terminal state', () => {
        flowManager.currentState = FLOW_STATES.DONE;

        const result = flowManager.back();

        expect(result).toBe(false);
        expect(flowManager.getCurrentState()).toBe(FLOW_STATES.DONE);
      });

      it('should reset completion status when going back', () => {
        // Due to Navigation Methods beforeEach, we start at SELECT_PRICING_METHOD
        // with history: [SELECT_COLLECTION, SELECT_NFT]
        expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_PRICING_METHOD);

        // Go back to SELECT_NFT
        flowManager.back();
        expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_NFT);
        expect(flowManager.isFlowCompleted()).toBe(false);
        expect(flowManager.isFlowCancelled()).toBe(false);

        // Go back to SELECT_COLLECTION
        flowManager.back();
        expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_COLLECTION);
        expect(flowManager.isFlowCompleted()).toBe(false);
        expect(flowManager.isFlowCancelled()).toBe(false);
      });
    });

    describe('cancel()', () => {
      it('should cancel the flow successfully', () => {
        expect(flowManager.isFlowCancelled()).toBe(false);

        flowManager.cancel();

        expect(flowManager.getCurrentState()).toBe(FLOW_STATES.CANCELLED);
        expect(flowManager.isFlowCancelled()).toBe(true);
        expect(flowManager.getHistory()).toHaveLength(3); // Current state added to history
      });

      it('should throw error when already cancelled', () => {
        flowManager.currentState = FLOW_STATES.CANCELLED;
        flowManager.isCancelled = true;

        expect(() => flowManager.cancel()).toThrow('Flow is already cancelled');
      });

      it('should throw error when already completed', () => {
        flowManager.currentState = FLOW_STATES.DONE;
        flowManager.isCompleted = true;

        expect(() => flowManager.cancel()).toThrow('Cannot cancel a completed flow');
      });
    });

    describe('complete()', () => {
      it('should complete the flow successfully', () => {
        expect(flowManager.isFlowCompleted()).toBe(false);

        flowManager.complete();

        expect(flowManager.getCurrentState()).toBe(FLOW_STATES.DONE);
        expect(flowManager.isFlowCompleted()).toBe(true);
        expect(flowManager.getHistory()).toHaveLength(3); // Current state added to history
      });

      it('should throw error when already completed', () => {
        flowManager.currentState = FLOW_STATES.DONE;
        flowManager.isCompleted = true;

        expect(() => flowManager.complete()).toThrow('Flow is already completed');
      });

      it('should throw error when cancelled', () => {
        flowManager.currentState = FLOW_STATES.CANCELLED;
        flowManager.isCancelled = true;

        expect(() => flowManager.complete()).toThrow('Cannot complete a cancelled flow');
      });
    });
  });

  describe('Utility Methods', () => {
    it('should get valid transitions for current state', () => {
      const transitions = flowManager.getValidTransitions();
      expect(transitions).toContain(FLOW_STATES.SELECT_NFT);
      expect(transitions).toContain(FLOW_STATES.CANCELLED);
      expect(transitions).not.toContain(FLOW_STATES.SELECT_COLLECTION);
    });

    it('should reset flow manager', () => {
      // Set up some state
      flowManager.transition(FLOW_STATES.SELECT_NFT, { nftId: 'test' });
      flowManager.updateContext('data', 'value');

      flowManager.reset(FLOW_STATES.CONFIRM, { reset: true });

      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.CONFIRM);
      expect(flowManager.getContext()).toEqual({ reset: true });
      expect(flowManager.getHistory()).toEqual([]);
      expect(flowManager.isFlowCompleted()).toBe(false);
      expect(flowManager.isFlowCancelled()).toBe(false);
    });

    it('should reset with default parameters', () => {
      flowManager.currentState = FLOW_STATES.DONE;
      flowManager.context = { some: 'data' };
      flowManager.history = [{ state: 'previous' }];

      flowManager.reset();

      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_COLLECTION);
      expect(flowManager.getContext()).toEqual({});
      expect(flowManager.getHistory()).toEqual([]);
    });
  });

  describe('Serialization', () => {
    it('should serialize flow state correctly', () => {
      flowManager.transition(FLOW_STATES.SELECT_NFT, { nftId: 'test123' });

      const serialized = flowManager.serialize();

      expect(serialized).toEqual({
        currentState: FLOW_STATES.SELECT_NFT,
        context: { nftId: 'test123' },
        history: [{
          state: FLOW_STATES.SELECT_COLLECTION,
          context: {},
          timestamp: expect.any(String)
        }],
        isCompleted: false,
        isCancelled: false,
        timestamp: expect.any(String)
      });
    });

    it('should deserialize flow state correctly', () => {
      const testData = {
        currentState: FLOW_STATES.CONFIRM,
        context: { collectionId: 'col123', nftId: 'nft456' },
        history: [{
          state: FLOW_STATES.SELECT_NFT,
          context: { collectionId: 'col123' },
          timestamp: '2023-01-01T00:00:00.000Z'
        }],
        isCompleted: false,
        isCancelled: false
      };

      flowManager.deserialize(testData);

      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.CONFIRM);
      expect(flowManager.getContext()).toEqual({
        collectionId: 'col123',
        nftId: 'nft456'
      });
      expect(flowManager.getHistory()).toEqual([{
        state: FLOW_STATES.SELECT_NFT,
        context: { collectionId: 'col123' },
        timestamp: '2023-01-01T00:00:00.000Z'
      }]);
      expect(flowManager.isFlowCompleted()).toBe(false);
      expect(flowManager.isFlowCancelled()).toBe(false);
    });

    it('should throw error for invalid serialization data', () => {
      expect(() => flowManager.deserialize(null)).toThrow('Invalid serialization data');
      expect(() => flowManager.deserialize(undefined)).toThrow('Invalid serialization data');
      expect(() => flowManager.deserialize('string')).toThrow('Invalid serialization data');
    });

    it('should throw error for missing required fields', () => {
      expect(() => flowManager.deserialize({})).toThrow('Missing required field: currentState');
      expect(() => flowManager.deserialize({ currentState: 'test' })).toThrow('Missing required field: context');
      expect(() => flowManager.deserialize({ currentState: 'test', context: {} })).toThrow('Missing required field: history');
    });

    it('should throw error for invalid state in data', () => {
      const invalidData = {
        currentState: 'invalid-state',
        context: {},
        history: []
      };

      expect(() => flowManager.deserialize(invalidData)).toThrow('Invalid state in data: invalid-state');
    });

    it('should handle missing boolean fields gracefully', () => {
      const data = {
        currentState: FLOW_STATES.SELECT_NFT,
        context: {},
        history: []
      };

      flowManager.deserialize(data);

      expect(flowManager.isFlowCompleted()).toBe(false);
      expect(flowManager.isFlowCancelled()).toBe(false);
    });
  });

  describe('Complete Flow Simulation', () => {
    it('should handle a complete interactive flow', () => {
      // Start at select collection
      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_COLLECTION);

      // Select collection
      flowManager.transition(FLOW_STATES.SELECT_NFT, { collectionId: 'col123' });
      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_NFT);
      expect(flowManager.getContext('collectionId')).toBe('col123');

      // Select NFT (add nftId to context)
      flowManager.transition(FLOW_STATES.SELECT_PRICING_METHOD, { nftId: 'nft456' });
      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_PRICING_METHOD);

      // Go back to NFT selection
      const backResult = flowManager.back();
      expect(backResult).toBe(true);
      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_NFT);
      // After going back, we should have collectionId but not nftId (since nftId was added later)
      expect(flowManager.getContext('collectionId')).toBe('col123');
      expect(flowManager.getContext('nftId')).toBeUndefined();

      // Continue to pricing (need to add nftId again since we went back)
      flowManager.transition(FLOW_STATES.SELECT_PRICING_METHOD, { nftId: 'nft456' });
      flowManager.transition(FLOW_STATES.INPUT_PRICING_VALUE, { method: 'fixed' });
      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.INPUT_PRICING_VALUE);

      // Add pricing and go to confirm
      flowManager.transition(FLOW_STATES.CONFIRM, { price: '0.1' });
      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.CONFIRM);

      // Complete the flow
      flowManager.complete();
      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.DONE);
      expect(flowManager.isFlowCompleted()).toBe(true);

      // Verify complete context
      const finalContext = flowManager.getContext();
      expect(finalContext).toEqual({
        collectionId: 'col123',
        nftId: 'nft456',
        method: 'fixed',
        price: '0.1'
      });
    });

    it('should handle cancellation flow', () => {
      flowManager.transition(FLOW_STATES.SELECT_NFT, { collectionId: 'col123' });
      flowManager.transition(FLOW_STATES.SELECT_PRICING_METHOD, { nftId: 'nft456' });

      // Cancel the flow
      flowManager.cancel();

      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.CANCELLED);
      expect(flowManager.isFlowCancelled()).toBe(true);

      // Cannot navigate from cancelled state
      expect(() => flowManager.transition(FLOW_STATES.SELECT_NFT)).toThrow();
      expect(flowManager.back()).toBe(false);
    });
  });

  describe('Constants', () => {
    it('should export correct flow states', () => {
      expect(FLOW_STATES.SELECT_COLLECTION).toBe('select-collection');
      expect(FLOW_STATES.SELECT_NFT).toBe('select-nft');
      expect(FLOW_STATES.SELECT_PRICING_METHOD).toBe('select-pricing-method');
      expect(FLOW_STATES.INPUT_PRICING_VALUE).toBe('input-pricing-value');
      expect(FLOW_STATES.CONFIRM).toBe('confirm');
      expect(FLOW_STATES.DONE).toBe('done');
      expect(FLOW_STATES.CANCELLED).toBe('cancelled');
    });

    it('should export correct navigation actions', () => {
      expect(NAVIGATION_ACTIONS.BACK).toBe('back');
      expect(NAVIGATION_ACTIONS.CANCEL).toBe('cancel');
      expect(NAVIGATION_ACTIONS.NEXT).toBe('next');
      expect(NAVIGATION_ACTIONS.COMPLETE).toBe('complete');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty context object in transition', () => {
      flowManager.transition(FLOW_STATES.SELECT_NFT, {});

      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_NFT);
      expect(flowManager.getContext()).toEqual({});
    });

    it('should handle no context parameter in transition', () => {
      flowManager.transition(FLOW_STATES.SELECT_NFT);

      expect(flowManager.getCurrentState()).toBe(FLOW_STATES.SELECT_NFT);
      expect(flowManager.getContext()).toEqual({});
    });

    it('should preserve context when no additional data provided', () => {
      flowManager.updateContext('existing', 'data');
      flowManager.transition(FLOW_STATES.SELECT_NFT);

      expect(flowManager.getContext('existing')).toBe('data');
    });

    it('should handle complex context objects', () => {
      const complexContext = {
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' }
        },
        string: 'test',
        number: 42,
        boolean: true,
        nullValue: null
      };

      flowManager.updateContext(complexContext);

      expect(flowManager.getContext()).toEqual(complexContext);
    });
  });
});
