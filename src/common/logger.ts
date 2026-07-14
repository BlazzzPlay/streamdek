import { streamDeck } from '@elgato/streamdeck';

/**
 * Thin wrapper around streamDeck.logger with a debug toggle.
 * In non-debug mode, only errors are forwarded to the SDK logger.
 * In debug mode, all log levels are forwarded.
 */
export class Logger {
  private debugEnabled: boolean;

  constructor(debugEnabled = false) {
    this.debugEnabled = debugEnabled;
  }

  get isDebug(): boolean {
    return this.debugEnabled;
  }

  set isDebug(value: boolean) {
    this.debugEnabled = value;
  }

  trace(message: string): void {
    if (this.debugEnabled) {
      streamDeck.logger.trace(message);
    }
  }

  debug(message: string): void {
    if (this.debugEnabled) {
      streamDeck.logger.debug(message);
    }
  }

  info(message: string): void {
    if (this.debugEnabled) {
      streamDeck.logger.info(message);
    }
  }

  warn(message: string): void {
    if (this.debugEnabled) {
      streamDeck.logger.warn(message);
    }
  }

  error(message: string): void {
    // Always log errors, regardless of debug mode
    streamDeck.logger.error(message);
  }
}

/** Singleton logger instance */
export const logger = new Logger();
