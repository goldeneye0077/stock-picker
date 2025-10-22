/**
 * Swagger UI Express 类型声明
 */

declare module 'swagger-ui-express' {
  import { RequestHandler } from 'express';

  export interface SwaggerUiOptions {
    customCss?: string;
    customfavIcon?: string;
    customSiteTitle?: string;
    customJs?: string;
    swaggerOptions?: any;
    explorer?: boolean;
  }

  export const serve: RequestHandler[];
  export function setup(
    swaggerDoc: any,
    options?: SwaggerUiOptions
  ): RequestHandler;
}
