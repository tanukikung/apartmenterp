/**
 * API Documentation and OpenAPI Schema Definitions
 * Used for generating Swagger/OpenAPI docs
 */

export const API_DOCS = {
  info: {
    title: 'Apartment ERP API',
    version: '1.0.0',
    description: 'Comprehensive apartment/building management system API',
    contact: {
      name: 'Development Team',
      email: 'dev@apartment-erp.local',
    },
  },

  servers: [
    {
      url: 'http://localhost:3001/api',
      description: 'Development server',
    },
    {
      url: 'https://api.apartment-erp.com',
      description: 'Production server',
    },
  ],

  components: {
    schemas: {
      // Core response wrappers
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
          meta: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              requestId: { type: 'string' },
            },
          },
        },
      },

      PaginatedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'array',
            items: { type: 'object' },
          },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'integer', example: 0 },
              pageSize: { type: 'integer', example: 10 },
              total: { type: 'integer', example: 100 },
              totalPages: { type: 'integer', example: 10 },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },

      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string' },
              statusCode: { type: 'integer', example: 400 },
              name: { type: 'string', example: 'ValidationError' },
            },
          },
        },
      },

      // Entity schemas
      Invoice: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          invoiceNumber: { type: 'string' },
          roomId: { type: 'string', format: 'uuid' },
          tenantId: { type: 'string', format: 'uuid' },
          periodMonth: { type: 'integer', minimum: 1, maximum: 12 },
          periodYear: { type: 'integer', minimum: 2020 },
          totalAmount: { type: 'number', minimum: 0, format: 'double' },
          status: {
            type: 'string',
            enum: ['GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED'],
          },
          dueDate: { type: 'string', format: 'date' },
          sentAt: { type: 'string', format: 'date-time' },
          viewedAt: { type: 'string', format: 'date-time' },
          paidAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: [
          'id',
          'invoiceNumber',
          'roomId',
          'tenantId',
          'periodMonth',
          'periodYear',
          'totalAmount',
          'status',
        ],
      },

      Room: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          roomNumber: { type: 'string' },
          floorId: { type: 'string', format: 'uuid' },
          rentableArea: { type: 'number', minimum: 0, format: 'double' },
          type: { type: 'string' },
          maxOccupants: { type: 'integer', minimum: 1 },
          status: {
            type: 'string',
            enum: ['OCCUPIED', 'VACANT', 'MAINTENANCE', 'RESERVED'],
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'roomNumber', 'floorId', 'status'],
      },

      Tenant: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string', pattern: '^[0-9]{10}$' },
          email: { type: 'string', format: 'email' },
          idNumber: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'firstName', 'lastName'],
      },

      Contract: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          roomId: { type: 'string', format: 'uuid' },
          tenantId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          monthlyRent: { type: 'number', minimum: 0, format: 'double' },
          deposit: { type: 'number', minimum: 0, format: 'double' },
          status: {
            type: 'string',
            enum: ['ACTIVE', 'PENDING', 'ENDED', 'CANCELLED'],
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'roomId', 'tenantId', 'startDate', 'status'],
      },

      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          bankAccountId: { type: 'string', format: 'uuid' },
          amount: { type: 'number', minimum: 0, format: 'double' },
          reference: { type: 'string' },
          transferDate: { type: 'string', format: 'date' },
          status: {
            type: 'string',
            enum: ['PENDING', 'MATCHED', 'UNMATCHED', 'FAILED'],
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'bankAccountId', 'amount', 'status'],
      },

      // Common query parameters
      PaginationParams: {
        page: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Zero-indexed page number',
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 10,
          description: 'Items per page',
        },
        sortBy: {
          type: 'string',
          description: 'Field to sort by',
        },
        sortOrder: {
          type: 'string',
          enum: ['asc', 'desc'],
          default: 'asc',
        },
      },
    },

    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      sessionAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'auth',
      },
    },
  },

  paths: {
    '/invoices': {
      get: {
        summary: 'List invoices',
        description: 'Retrieve paginated list of invoices with optional filtering',
        tags: ['Invoices'],
        parameters: [
          { $ref: '#/components/schemas/PaginationParams/page' },
          { $ref: '#/components/schemas/PaginationParams/pageSize' },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED'],
            },
          },
          {
            name: 'roomId',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedResponse' },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create invoice',
        tags: ['Invoices'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  roomId: { type: 'string', format: 'uuid' },
                  periodMonth: { type: 'integer' },
                  periodYear: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SuccessResponse' },
              },
            },
          },
        },
      },
    },
  },
};

// Generate Swagger JSON
export function generateSwaggerJson() {
  return {
    openapi: '3.0.0',
    ...API_DOCS,
  };
}
