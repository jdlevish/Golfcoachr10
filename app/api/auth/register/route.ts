import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(80).optional()
});

const registerDbInitErrorToken =
  process.env.REGISTER_DB_INIT_ERROR_TOKEN ?? 'register_db_init';
const registerDbBusyErrorToken =
  process.env.REGISTER_DB_BUSY_ERROR_TOKEN ?? 'register_db_busy';
const registerGenericErrorToken =
  process.env.REGISTER_GENERIC_ERROR_TOKEN ?? 'register_generic';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isSqliteLockedError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2010' &&
  typeof error.meta?.message === 'string' &&
  error.meta.message.toLowerCase().includes('database is locked');

const withSqliteRetry = async <T>(operation: () => Promise<T>) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSqliteLockedError(error)) throw error;
      lastError = error;
      await sleep(attempt * 120);
    }
  }

  throw lastError;
};

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid registration payload.' },
      { status: 400 }
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name ?? null;
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const createAccount = async () => {
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }

    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash
      }
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  };

  try {
    return await withSqliteRetry(createAccount);
  } catch (error) {
    console.error('Register route failed:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2021') {
        return NextResponse.json(
          {
            error: 'Database is not initialized yet. Run Prisma migration and try again.',
            token: registerDbInitErrorToken
          },
          { status: 503 }
        );
      }
      if (error.code === 'P2002') {
        return NextResponse.json(
          { error: 'An account with this email already exists.' },
          { status: 409 }
        );
      }
      if (isSqliteLockedError(error)) {
        return NextResponse.json(
          {
            error: 'Database is busy. Please retry in a moment.',
            token: registerDbBusyErrorToken
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Could not create account.', token: registerGenericErrorToken },
      { status: 500 }
    );
  }
}
