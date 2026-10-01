// Telefone de contato do estabelecimento: persistido só com dígitos (DDD + número, 10 ou 11
// dígitos) e formatado na apresentação.

// Retorna os dígitos, `null` para "sem telefone" (campo vazio) ou `undefined` quando inválido.
export function normalizeBrazilPhone(value: string): string | null | undefined {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 0) return null;
  return digits.length === 10 || digits.length === 11 ? digits : undefined;
}

export function formatBrazilPhone(digits: string | null | undefined) {
  if (!digits) return null;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}
