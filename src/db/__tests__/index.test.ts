// Test framework detected: vitest
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('drizzle-orm/neon-http', () => {
  return {
    drizzle: vi.fn(() => ({ __mocked: true })),
  };
});

describe('db initialization (drizzle-orm/neon-http)', () => {
  const ENV_BACKUP = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ENV_BACKUP };
  });

  afterEach(() => {
    process.env = ENV_BACKUP;
  });

  test('initializes db with DATABASE_URL when set (happy path)', async () => {
    const url = 'postgres://user:pass@host:5432/db';
    process.env.DATABASE_URL = url;

    const { drizzle } = await import('drizzle-orm/neon-http');
    const { db } = await import('../index'); // from src/db/__tests__/ -> path fixed during write
    expect(db).toBeDefined();
    expect((drizzle as unknown as any).mock).toBeDefined();
    expect((drizzle as unknown as any).mock.calls.length).toBe(1);
    expect((drizzle as unknown as any).mock.calls[0][0]).toBe(url);
  });

  test('passes empty string when DATABASE_URL is empty (edge case)', async () => {
    process.env.DATABASE_URL = '';

    const { drizzle } = await import('drizzle-orm/neon-http');
    await import('../index');

    expect((drizzle as unknown as any).mock.calls[0][0]).toBe('');
  });

  test('passes undefined when DATABASE_URL is undefined (current behavior due to non-null assertion) [guards missing]', async () => {
    delete process.env.DATABASE_URL;

    const { drizzle } = await import('drizzle-orm/neon-http');
    await import('../index');

    expect((drizzle as unknown as any).mock.calls[0][0]).toBeUndefined();
  });
});