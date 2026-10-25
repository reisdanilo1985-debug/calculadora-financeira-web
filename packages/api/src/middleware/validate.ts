/**
 * Validação de corpo de requisição com zod (mesmo formato de erro de /api/calcular):
 *   400 { error: "Payload inválido — campo: mensagem" }
 *
 * Os esquemas são `passthrough` nas rotas: campos extras não quebram clientes
 * antigos, mas tipo errado, NaN, número infinito ou enum inválido viram 400 em
 * vez de 500 ou de um cálculo com valor absurdo.
 */

import { z, ZodTypeAny } from 'zod';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Aceita number ou string numérica ("1234.56"); rejeita NaN/Infinity. */
export const numero = z
  .union([z.number(), z.string().trim().min(1, 'deve ser um número válido')])
  .transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'deve ser um número válido' });
      return z.NEVER;
    }
    return n;
  });

/** Número opcional (ausente ou null passam; presente precisa ser válido). */
export const numeroOpcional = numero.nullish();

/** Booleano opcional; aceita também "true"/"false" de formulários. */
export const booleanoOpcional = z
  .union([z.boolean(), z.enum(['true', 'false']).transform(v => v === 'true')])
  .nullish();

/** Data AAAA-MM-DD (opcional). */
export const dataIsoOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato AAAA-MM-DD')
  .nullish();

export function mensagemErroZod(err: z.ZodError): string {
  const first = err.issues[0];
  const path = first.path.join('.');
  return `Payload inválido — ${path ? path + ': ' : ''}${first.message}`;
}

/** Middleware: valida `req.body` com o esquema e substitui pelo valor normalizado. */
export function validarCorpo(schema: ZodTypeAny): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: mensagemErroZod(parsed.error) });
      return;
    }
    req.body = parsed.data;
    next();
  };
}
