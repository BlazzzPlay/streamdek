import { describe, it, expect, beforeEach } from '@jest/globals';
import { Logger } from '../../common/logger';
import { streamDeck, resetMocks } from '../../__mocks__/@elgato/streamdeck';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    resetMocks();
    logger = new Logger();
  });

  describe('when isDebug is false (default)', () => {
    it('should always log errors', () => {
      logger.error('something broke');

      expect(streamDeck.logger.error).toHaveBeenCalledWith('something broke');
    });

    it('should NOT log info messages', () => {
      logger.info('this is info');

      expect(streamDeck.logger.info).not.toHaveBeenCalled();
    });

    it('should NOT log debug messages', () => {
      logger.debug('this is debug');

      expect(streamDeck.logger.debug).not.toHaveBeenCalled();
    });

    it('should NOT log trace messages', () => {
      logger.trace('this is trace');

      expect(streamDeck.logger.trace).not.toHaveBeenCalled();
    });

    it('should NOT log warn messages', () => {
      logger.warn('this is warn');

      expect(streamDeck.logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('when isDebug is true', () => {
    beforeEach(() => {
      logger.isDebug = true;
    });

    it('should log info messages', () => {
      logger.info('debug info');

      expect(streamDeck.logger.info).toHaveBeenCalledWith('debug info');
    });

    it('should log debug messages', () => {
      logger.debug('debug message');

      expect(streamDeck.logger.debug).toHaveBeenCalledWith('debug message');
    });

    it('should log trace messages', () => {
      logger.trace('trace message');

      expect(streamDeck.logger.trace).toHaveBeenCalledWith('trace message');
    });

    it('should log warn messages', () => {
      logger.warn('warning message');

      expect(streamDeck.logger.warn).toHaveBeenCalledWith('warning message');
    });

    it('should still log errors', () => {
      logger.error('debug error');

      expect(streamDeck.logger.error).toHaveBeenCalledWith('debug error');
    });
  });

  describe('toggling debug mode', () => {
    it('should switch from silent to verbose when isDebug is enabled', () => {
      logger.debug('silent'); // should not log
      expect(streamDeck.logger.debug).not.toHaveBeenCalled();

      logger.isDebug = true;
      logger.debug('verbose'); // should log
      expect(streamDeck.logger.debug).toHaveBeenCalledWith('verbose');
    });

    it('should switch from verbose to silent when isDebug is disabled', () => {
      logger.isDebug = true;
      logger.debug('verbose'); // should log
      expect(streamDeck.logger.debug).toHaveBeenCalledWith('verbose');

      resetMocks();

      logger.isDebug = false;
      logger.debug('silent again'); // should NOT log
      expect(streamDeck.logger.debug).not.toHaveBeenCalled();
    });
  });
});
