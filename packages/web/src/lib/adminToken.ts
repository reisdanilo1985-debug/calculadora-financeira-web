/**
 * Credencial administrativa (header x-admin-token) para operações que disparam
 * cargas nas fontes externas: refresh de índices e das premissas da Tesouraria.
 *
 * O token fica SÓ EM MEMÓRIA (variável do módulo): não vai para localStorage
 * nem sessionStorage, então não sobrevive a um recarregamento nem fica
 * acessível a outro script que leia o armazenamento do site. É pedido ao
 * usuário na primeira vez (ou quando a API responde 401/403) e reaproveitado
 * enquanto a aba estiver aberta.
 */

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

let tokenEmMemoria: string | null = null;

export class OperacaoAdminCancelada extends Error {
  constructor() {
    super('Operação cancelada: token administrativo não informado.');
    this.name = 'OperacaoAdminCancelada';
  }
}

/** Cabeçalhos a anexar numa chamada administrativa (vazio quando não há token). */
export function cabecalhosAdmin(token: string | null): Record<string, string> {
  return token ? { [ADMIN_TOKEN_HEADER]: token } : {};
}

/**
 * Executa `acao` com o token em memória; em 401/403 pede o token (até 2 vezes),
 * guarda em memória e tenta de novo. Outros erros (503 sem ADMIN_TOKEN no
 * servidor, 429, 500) sobem para quem chamou.
 */
export async function executarComoAdmin<T>(acao: (token: string | null) => Promise<T>, descricao: string): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await acao(tokenEmMemoria);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status !== 401 && status !== 403) throw err;
      tokenEmMemoria = null;
      if (tentativa >= 2) throw err;
      const informado = window.prompt(
        status === 403
          ? `Token administrativo inválido. Informe o token para ${descricao}:`
          : `Informe o token administrativo para ${descricao}:`,
      );
      if (!informado || !informado.trim()) throw new OperacaoAdminCancelada();
      tokenEmMemoria = informado.trim();
    }
  }
}

/** Mensagem amigável para erros das operações administrativas. */
export function mensagemErroAdmin(err: any, padrao: string): string {
  if (err instanceof OperacaoAdminCancelada) return err.message;
  return err?.response?.data?.error || err?.message || padrao;
}
