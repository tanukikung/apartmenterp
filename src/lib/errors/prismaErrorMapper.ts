export function mapPrismaError(err: unknown) {
  if (!err || typeof err !== 'object') return null;

  if ((err as { code?: string }).code === 'P2002') {
    return {
      status: 409,
      message: 'A record with this value already exists. Please check for duplicate email, phone, or LINE User ID.',
      code: 'DUPLICATE_RECORD',
    };
  }

  if ((err as { code?: string }).code === 'P2003') {
    return { status: 400, message: 'Foreign key constraint failed: referenced record does not exist', code: 'INVALID_REFERENCE' };
  }

  if ((err as { code?: string }).code === 'P2025') {
    return { status: 404, message: 'Record not found', code: 'NOT_FOUND' };
  }

  return null;
}
