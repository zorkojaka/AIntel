declare module 'express' {
  export interface Request {
    params: Record<string, any>;
    query: Record<string, any>;
    body?: any;
    [key: string]: any;
  }
  export interface Response {
    success: (...args: any[]) => any;
    fail: (...args: any[]) => any;
    status: (...args: any[]) => any;
    json: (...args: any[]) => any;
    end: (...args: any[]) => any;
    setHeader: (...args: any[]) => any;
    send: (...args: any[]) => any;
    [key: string]: any;
  }
  export type NextFunction = (...args: any[]) => any;
  export type RequestHandler = (...args: any[]) => any;
  export interface Router {
    get: (...args: any[]) => Router;
    post: (...args: any[]) => Router;
    put: (...args: any[]) => Router;
    patch: (...args: any[]) => Router;
    delete: (...args: any[]) => Router;
    use: (...args: any[]) => Router;
  }
  export function Router(): Router;
  const e: any;
  export default e;
}

declare module 'cors' {
  const fn: any;
  export default fn;
}

declare module 'mongoose' {
  namespace mongoose {
    class Schema<T = any> {
      constructor(definition?: any, options?: any);
      static Types: any;
      index?: (...args: any[]) => any;
      [key: string]: any;
    }
    const models: Record<string, any>;
    function model<T = any>(name: string, schema?: any): any;
    namespace Types {
      class ObjectId {
        constructor(value?: any);
        toString(): string;
      }
    }
    type Document = any;
    type Model<T = any> = any;
    function connect(uri: string, options?: any): any;
    function disconnect(): any;
    const connection: any;
  }
  const mongoose: any;
  const Schema: typeof mongoose.Schema;
  const model: typeof mongoose.model;
  const Types: typeof mongoose.Types;
  const models: typeof mongoose.models;
  type Document = any;
  type Model<T = any> = any;
  export { Schema, model, Types, models, Document, Model };
  export = mongoose;
}

declare module 'pdfkit' {
  const PDFDocument: any;
  export default PDFDocument;
}

declare module 'dotenv' {
  const config: any;
  export default config;
}

declare module 'ts-node-dev';
