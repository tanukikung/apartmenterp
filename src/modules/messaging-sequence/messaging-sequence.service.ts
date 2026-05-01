import { prisma } from '@/lib/db';
import { z } from 'zod';
import { NotFoundError, BadRequestError } from '@/lib/utils/errors';
import { EventBus } from '@/lib/events/event-bus';
import { EventTypes } from '@/lib/events/types';
import { Prisma } from '@prisma/client';
import { Outbox } from '@/lib/outbox/outbox';

const SequenceCreateSchema = z.object({
  name: z.string().min(1).max(255),
  trigger: z.enum(['REGISTRATION_APPROVED', 'MOVE_OUT_CONFIRMED', 'CONTRACT_EXPIRING_SOON', 'MANUAL']),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  steps: z.array(z.object({
    stepOrder: z.number().int().min(0),
    delayDays: z.number().int().min(0).default(0),
    subject: z.string().optional(),
    contentTh: z.string().min(1),
    contentEn: z.string().optional(),
    messageType: z.enum(['TEXT', 'FLEX_RECEIPT', 'FLEX_ROOM', 'FLEX_MAINTENANCE', 'TEMPLATE_BUTTONS', 'TEMPLATE_CONFIRM']).default('TEXT'),
    responseType: z.enum(['NONE', 'ROOM_NO', 'NAME', 'PHONE', 'YES_NO', 'FREE_TEXT']).default('NONE'),
    invalidReply: z.string().optional(),
  })).optional(),
});

const SequenceUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  trigger: z.enum(['REGISTRATION_APPROVED', 'MOVE_OUT_CONFIRMED', 'CONTRACT_EXPIRING_SOON', 'MANUAL']).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const StepCreateSchema = z.object({
  stepOrder: z.number().int().min(0),
  delayDays: z.number().int().min(0).default(0),
  subject: z.string().optional(),
  contentTh: z.string().min(1),
  contentEn: z.string().optional(),
  messageType: z.enum(['TEXT', 'FLEX_RECEIPT', 'FLEX_ROOM', 'FLEX_MAINTENANCE', 'TEMPLATE_BUTTONS', 'TEMPLATE_CONFIRM']).default('TEXT'),
  responseType: z.enum(['NONE', 'ROOM_NO', 'NAME', 'PHONE', 'YES_NO', 'FREE_TEXT']).default('NONE'),
  invalidReply: z.string().optional(),
});

const StepUpdateSchema = z.object({
  stepOrder: z.number().int().min(0).optional(),
  delayDays: z.number().int().min(0).optional(),
  subject: z.string().optional(),
  contentTh: z.string().min(1).optional(),
  contentEn: z.string().optional(),
  messageType: z.enum(['TEXT', 'FLEX_RECEIPT', 'FLEX_ROOM', 'FLEX_MAINTENANCE', 'TEMPLATE_BUTTONS', 'TEMPLATE_CONFIRM']).optional(),
  responseType: z.enum(['NONE', 'ROOM_NO', 'NAME', 'PHONE', 'YES_NO', 'FREE_TEXT']).optional(),
  invalidReply: z.string().optional(),
});

export class MessagingSequenceService {
  private outbox: Outbox;

  constructor() {
    this.outbox = new Outbox();
  }

  async listSequences() {
    return prisma.messageSequence.findMany({
      include: { _count: { select: { steps: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSequenceById(id: string) {
    const sequence = await prisma.messageSequence.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });
    if (!sequence) throw new NotFoundError('MessageSequence', id);
    return sequence;
  }

  async createSequence(input: z.infer<typeof SequenceCreateSchema>) {
    const { steps, ...seqData } = SequenceCreateSchema.parse(input);
    return prisma.messageSequence.create({
      data: {
        ...seqData,
        steps: steps ? { create: steps } : undefined,
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }

  async updateSequence(id: string, input: z.infer<typeof SequenceUpdateSchema>) {
    await this.getSequenceById(id);
    return prisma.messageSequence.update({
      where: { id },
      data: SequenceUpdateSchema.parse(input),
    });
  }

  async deleteSequence(id: string) {
    await this.getSequenceById(id);
    await prisma.messageSequence.delete({ where: { id } });
    return { success: true };
  }

  async addStep(sequenceId: string, input: z.infer<typeof StepCreateSchema>) {
    await this.getSequenceById(sequenceId);
    const data = StepCreateSchema.parse(input);
    return prisma.messageSequenceStep.create({
      data: {
        ...data,
        sequenceId,
      },
    });
  }

  async updateStep(stepId: string, input: z.infer<typeof StepUpdateSchema>) {
    const step = await prisma.messageSequenceStep.findUnique({ where: { id: stepId } });
    if (!step) throw new NotFoundError('MessageSequenceStep', stepId);
    const data = StepUpdateSchema.parse(input);
    return prisma.messageSequenceStep.update({
      where: { id: stepId },
      data,
    });
  }

  async reorderSteps(sequenceId: string, stepId: string, targetOrder: number) {
    const steps = await prisma.messageSequenceStep.findMany({
      where: { sequenceId },
      orderBy: { stepOrder: 'asc' },
    });
    const movingStep = steps.find(s => s.id === stepId);
    if (!movingStep) throw new NotFoundError('MessageSequenceStep', stepId);
    if (targetOrder < 0 || targetOrder >= steps.length) {
      throw new BadRequestError('Invalid target order');
    }

    const sourceOrder = movingStep.stepOrder;
    if (sourceOrder === targetOrder) return { success: true };

    await prisma.$transaction(
      steps.flatMap(s => {
        if (s.id === stepId) {
          return [prisma.messageSequenceStep.update({ where: { id: stepId }, data: { stepOrder: targetOrder } })];
        } else if (sourceOrder < targetOrder) {
          if (s.stepOrder > sourceOrder && s.stepOrder <= targetOrder) {
            return [prisma.messageSequenceStep.update({ where: { id: s.id }, data: { stepOrder: s.stepOrder - 1 } })];
          }
        } else {
          if (s.stepOrder >= targetOrder && s.stepOrder < sourceOrder) {
            return [prisma.messageSequenceStep.update({ where: { id: s.id }, data: { stepOrder: s.stepOrder + 1 } })];
          }
        }
        return [];
      })
    );
    return { success: true };
  }

  async deleteStep(stepId: string) {
    const step = await prisma.messageSequenceStep.findUnique({ where: { id: stepId } });
    if (!step) throw new NotFoundError('MessageSequenceStep', stepId);
    await prisma.messageSequenceStep.delete({ where: { id: stepId } });
    return { success: true };
  }

  async fireSequence(sequenceId: string, tenantId: string, actorId?: string) {
    const sequence = await this.getSequenceById(sequenceId);
    if (!sequence.isActive || sequence.steps.length === 0) {
      throw new BadRequestError('Sequence is not active or has no steps');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, lineUserId: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    if (!tenant.lineUserId) throw new BadRequestError('Tenant has no LINE user ID');

    const now = new Date();
    const outboxWrites: Promise<unknown>[] = [];

    for (const step of sequence.steps) {
      const scheduledAt = new Date(now);
      scheduledAt.setDate(scheduledAt.getDate() + step.delayDays);

      outboxWrites.push(
        this.outbox.write(
          'Tenant',
          tenantId,
          'MessageSequenceStep',
          {
            sequenceId,
            stepId: step.id,
            stepOrder: step.stepOrder,
            lineUserId: tenant.lineUserId,
            messageType: step.messageType,
            subject: step.subject ?? null,
            contentTh: step.contentTh,
            contentEn: step.contentEn ?? null,
            responseType: step.responseType,
            invalidReply: step.invalidReply ?? null,
            firedBy: actorId ?? null,
          },
          scheduledAt
        )
      );
    }

    await Promise.all(outboxWrites);

    await EventBus.getInstance().publish(
      EventTypes.MESSAGE_SEQUENCE_TRIGGERED,
      'Tenant',
      tenantId,
      { sequenceId, sequenceName: sequence.name, stepCount: sequence.steps.length, tenantId }
    );

    return { success: true, scheduledSteps: outboxWrites.length };
  }
}

export const messagingSequenceService = new MessagingSequenceService();