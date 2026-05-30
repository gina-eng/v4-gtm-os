-- Phase 5: Eventos vira canal inbound de funil curto.
-- 1) Remove a coluna mix_eventos (P16 outbound) — eventos não é mais subcanal outbound.
-- 2) Apaga linhas legadas de premissa_conversao_outbound com subcanal='eventos'.
--    O enum subcanal_outbound mantém o valor para compatibilidade.
ALTER TABLE "premissa_horizonte" DROP COLUMN "mix_eventos";
DELETE FROM "premissa_conversao_outbound" WHERE "subcanal" = 'eventos';
