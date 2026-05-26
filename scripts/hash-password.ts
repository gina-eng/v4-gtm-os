/**
 * Gera um hash bcrypt pra colar no campo `password_hash` de um user no Supabase.
 *
 * Uso: `npm run hash-password`
 *
 * O script pede a senha em prompt oculto (não aparece no terminal nem no
 * history do shell, contanto que você digite — não cole via argv).
 * A senha nunca toca disco. O hash é printado no stdout pra você copiar e
 * colar no Table Editor da Supabase.
 */

import bcrypt from "bcryptjs";
import * as readline from "node:readline";

const BCRYPT_ROUNDS = 12;

async function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Desabilita o echo do que é digitado pra senha não vazar visualmente.
    // _writeToOutput é interno mas é a forma padrão de fazer prompt oculto sem dep extra.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rlAny = rl as any;
    const origWrite = rlAny._writeToOutput.bind(rl);
    rlAny._writeToOutput = (s: string) => {
      // Mantém o texto da pergunta visível; oculta o que o user digita.
      if (s.startsWith(question) || s === "\r\n" || s === "\n") {
        origWrite(s);
      }
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const password = (await promptHidden("Senha (digitando — não aparece): ")).trim();
  if (!password) {
    console.error("Senha vazia. Abortando.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Senha muito curta (mínimo 8 caracteres). Abortando.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  console.log("\nHash bcrypt gerado. Copie a linha inteira abaixo e cole no");
  console.log("campo `password_hash` da linha do user no Supabase Table Editor:\n");
  console.log(hash);
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
