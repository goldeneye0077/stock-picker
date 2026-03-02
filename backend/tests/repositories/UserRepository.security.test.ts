import crypto from 'crypto';
import { UserRepository } from '../../src/repositories/UserRepository';

const mockGet = jest.fn();
const mockRun = jest.fn();

jest.mock('../../src/config/database', () => ({
  getDatabase: () => ({
    get: mockGet,
    run: mockRun,
    all: jest.fn(),
    close: jest.fn(),
  }),
}));

describe('UserRepository Token Security', () => {
  const rawToken = 'raw-token-value';
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const futureDate = new Date(Date.now() + 60_000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getSession should query by token hash only', async () => {
    const repo = new UserRepository();
    mockGet.mockResolvedValueOnce({
      token: tokenHash,
      user_id: 42,
      expires_at: futureDate,
    });

    const result = await repo.getSession(rawToken);

    expect(result).toEqual({ userId: 42 });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0]).toContain('WHERE token = ?');
    expect(mockGet.mock.calls[0][0]).not.toMatch(/\sOR\s/i);
    expect(mockGet.mock.calls[0][1]).toEqual([tokenHash]);
  });

  it('deleteSession should delete by token hash only', async () => {
    const repo = new UserRepository();
    mockRun.mockResolvedValueOnce(undefined);

    await repo.deleteSession(rawToken);

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun.mock.calls[0][0]).toContain('WHERE token = ?');
    expect(mockRun.mock.calls[0][0]).not.toMatch(/\sOR\s/i);
    expect(mockRun.mock.calls[0][1]).toEqual([tokenHash]);
  });

  it('verifyRefreshToken should query by token hash only', async () => {
    const repo = new UserRepository();
    mockGet.mockResolvedValueOnce({
      token: tokenHash,
      user_id: 42,
      expires_at: futureDate,
    });

    const result = await repo.verifyRefreshToken(rawToken);

    expect(result).toEqual({
      userId: 42,
      expiresAt: futureDate,
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0]).toContain('WHERE token = ?');
    expect(mockGet.mock.calls[0][0]).not.toMatch(/\sOR\s/i);
    expect(mockGet.mock.calls[0][1]).toEqual([tokenHash]);
  });

  it('deleteRefreshToken should delete by token hash only', async () => {
    const repo = new UserRepository();
    mockRun.mockResolvedValueOnce(undefined);

    await repo.deleteRefreshToken(rawToken);

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun.mock.calls[0][0]).toContain('WHERE token = ?');
    expect(mockRun.mock.calls[0][0]).not.toMatch(/\sOR\s/i);
    expect(mockRun.mock.calls[0][1]).toEqual([tokenHash]);
  });
});
