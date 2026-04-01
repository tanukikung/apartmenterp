export function mapPrismaError(err: unknown) {
  if (!err || typeof err !== 'object') return null;

  if ((err as { code?: string }).code === 'P2002') {
    return { status: 409, message: 'Duplicate record' };
  }

  if ((err as { code?: string }).code === 'P2025') {
    return { status: 404, message: 'Record not found' };
  }

  return null;
}
