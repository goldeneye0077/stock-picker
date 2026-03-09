import express from 'express';
import request from 'supertest';
import fs from 'fs';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';
import { AppError, ErrorCode } from '../../src/utils/errors';

describe('errorHandler logging policy', () => {
  let appendFileSpy: jest.SpiedFunction<typeof fs.promises.appendFile>;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    appendFileSpy = jest.spyOn(fs.promises, 'appendFile').mockResolvedValue(undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    appendFileSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  function createApp() {
    const app = express();

    app.get('/bad-request', (_req, _res, next) => {
      next(new AppError('invalid query', 400, ErrorCode.INVALID_PARAMETER, { secret: 'x' }));
    });

    app.get('/boom', () => {
      throw new Error('unexpected failure');
    });

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
  }

  it('does not persist handled 4xx errors to error.log', async () => {
    const app = createApp();

    await request(app).get('/bad-request').expect(400);

    expect(appendFileSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('persists unexpected 5xx errors to error.log', async () => {
    const app = createApp();

    await request(app).get('/boom').expect(500);

    expect(appendFileSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not persist framework 404 responses to error.log', async () => {
    const app = createApp();

    await request(app).get('/missing-route').expect(404);

    expect(appendFileSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
