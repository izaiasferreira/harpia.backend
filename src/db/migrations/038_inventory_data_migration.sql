-- Migration 038: Refazer migração do inventory incluindo regional e seccional
DO $$
DECLARE
    rec         RECORD;
    pda_id      INTEGER;
    imp_id      INTEGER;
    maq_id      INTEGER;
BEGIN
    -- 1. Apagar os dados migrados anteriormente
    DELETE FROM equipment WHERE id IN (
        SELECT equipment_id 
        FROM equipment_assignments 
        WHERE observacao = 'Migrado da tabela inventory legada'
    );

    -- 2. Refazer a migração
    FOR rec IN
        SELECT DISTINCT ON (i.agente) 
            i.*, 
            c.seccional as colab_seccional, 
            c.regional as colab_regional
        FROM inventory i
        LEFT JOIN colaboradores c ON LOWER(c."ID") = LOWER(i.agente)
        WHERE i.agente IS NOT NULL
        ORDER BY i.agente, i.updated_at DESC NULLS LAST, i.id DESC
    LOOP

        -- ── PDA ────────────────────────────────────────────────────────────────
        IF rec.pda_numero_serie IS NOT NULL OR rec.pda_imei_1 IS NOT NULL THEN
            INSERT INTO equipment (
                tipo, estado, regional, seccional, dados, status, criado_por, created_at, updated_at
            ) VALUES (
                'pda',
                COALESCE(rec.estado, 'pi'),
                rec.colab_regional,
                rec.colab_seccional,
                jsonb_build_object(
                    'imei_1',         rec.pda_imei_1,
                    'imei_2',         rec.pda_imei_2,
                    'numero_serie',   rec.pda_numero_serie,
                    'marca',          rec.pda_marca,
                    'modelo',         rec.pda_modelo,
                    'numero_chip',    rec.pda_numero_chip,
                    'versao_android', rec.pda_versao_android
                ),
                'em_uso',
                'sistema',
                COALESCE(rec.created_at, NOW()),
                COALESCE(rec.updated_at, NOW())
            ) RETURNING id INTO pda_id;

            INSERT INTO equipment_assignments (
                equipment_id, agente, assignado_por, assignado_por_nome,
                data_associacao, status, observacao
            ) VALUES (
                pda_id, COALESCE(rec.agente, 'Desconhecido'),
                'sistema', 'Migração automática',
                COALESCE(rec.created_at, NOW()), 'ativa',
                'Migrado da tabela inventory legada'
            );
        END IF;

        -- ── Impressora ─────────────────────────────────────────────────────────
        IF rec.impressora_numero_serie IS NOT NULL
           AND rec.impressora_numero_serie NOT ILIKE '%nao possui%'
           AND rec.impressora_numero_serie NOT ILIKE '%não possui%'
        THEN
            INSERT INTO equipment (
                tipo, estado, regional, seccional, dados, status, criado_por, created_at, updated_at
            ) VALUES (
                'impressora',
                COALESCE(rec.estado, 'pi'),
                rec.colab_regional,
                rec.colab_seccional,
                jsonb_build_object(
                    'numero_serie', rec.impressora_numero_serie,
                    'modelo',       rec.impressora_modelo,
                    'marca',        rec.impressora_marca
                ),
                'em_uso',
                'sistema',
                COALESCE(rec.created_at, NOW()),
                COALESCE(rec.updated_at, NOW())
            ) RETURNING id INTO imp_id;

            INSERT INTO equipment_assignments (
                equipment_id, agente, assignado_por, assignado_por_nome,
                data_associacao, status, observacao
            ) VALUES (
                imp_id, COALESCE(rec.agente, 'Desconhecido'),
                'sistema', 'Migração automática',
                COALESCE(rec.created_at, NOW()), 'ativa',
                'Migrado da tabela inventory legada'
            );
        END IF;

        -- ── Maquineta ──────────────────────────────────────────────────────────
        IF rec.maquininha_numero_serie IS NOT NULL
           AND rec.maquininha_numero_serie NOT ILIKE '%nao possui%'
           AND rec.maquininha_numero_serie NOT ILIKE '%não possui%'
        THEN
            INSERT INTO equipment (
                tipo, estado, regional, seccional, dados, status, criado_por, created_at, updated_at
            ) VALUES (
                'maquineta',
                COALESCE(rec.estado, 'pi'),
                rec.colab_regional,
                rec.colab_seccional,
                jsonb_build_object(
                    'numero_serie',  rec.maquininha_numero_serie,
                    'numero_logico', rec.maquininha_numero_logico
                ),
                'em_uso',
                'sistema',
                COALESCE(rec.created_at, NOW()),
                COALESCE(rec.updated_at, NOW())
            ) RETURNING id INTO maq_id;

            INSERT INTO equipment_assignments (
                equipment_id, agente, assignado_por, assignado_por_nome,
                data_associacao, status, observacao
            ) VALUES (
                maq_id, COALESCE(rec.agente, 'Desconhecido'),
                'sistema', 'Migração automática',
                COALESCE(rec.created_at, NOW()), 'ativa',
                'Migrado da tabela inventory legada'
            );
        END IF;

    END LOOP;
END $$;
