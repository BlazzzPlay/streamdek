import { jest } from '@jest/globals';

// Mock for @elgato/streamdeck SDK — provides testable stubs

const mockLogger = {
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

export const streamDeck = {
  logger: mockLogger,
  settings: {
    getGlobalSettings: jest.fn().mockResolvedValue({}),
    setGlobalSettings: jest.fn().mockResolvedValue(undefined),
  },
  system: {},
  connect: jest.fn().mockResolvedValue(undefined),
};

export default streamDeck;

/**
 * Base class for all Stream Deck actions.
 * Provides lifecycle hooks: onKeyDown, onDialRotate, onDialDown, etc.
 */
export class SingletonAction<T = any> {
  readonly manifestId: string | undefined;

  get actions(): Iterable<any> {
    return [];
  }

  onKeyDown?(ev: any): Promise<void> | void;
  onKeyUp?(ev: any): Promise<void> | void;
  onDialRotate?(ev: any): Promise<void> | void;
  onDialDown?(ev: any): Promise<void> | void;
  onDialUp?(ev: any): Promise<void> | void;
  onWillAppear?(ev: any): Promise<void> | void;
  onWillDisappear?(ev: any): Promise<void> | void;
  onDidReceiveSettings?(ev: any): Promise<void> | void;
  onTouchTap?(ev: any): Promise<void> | void;
  onSendToPlugin?(ev: any): Promise<void> | void;
  onTitleParametersDidChange?(ev: any): Promise<void> | void;
}

/** Decorator factory — registers an action with its manifest UUID */
export function action(_definition: { UUID: string }): ClassDecorator {
  return (_target: any, _context?: any) => {
    // No-op: decorator metadata is handled at build time by the SDK
  };
}

/** Stub types — erased at runtime, only needed for TS compilation */
export type KeyDownEvent<T = any> = any;
export type DialRotateEvent<T = any> = any;
export type DialDownEvent<T = any> = any;
export type DidReceiveSettingsEvent<T = any> = any;

/** Reset all mock call counters for clean tests */
export function resetMocks(): void {
  mockLogger.trace.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.info.mockReset();
  mockLogger.warn.mockReset();
  mockLogger.error.mockReset();
  streamDeck.settings.getGlobalSettings.mockReset();
  streamDeck.settings.setGlobalSettings.mockReset();
  streamDeck.connect.mockReset();
}
