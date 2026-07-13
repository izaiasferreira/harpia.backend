CREATE TABLE IF NOT EXISTS equipment_types (
    slug VARCHAR(50) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    identificador VARCHAR(50),
    campos JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Inserindo os tipos existentes
INSERT INTO equipment_types (slug, label, identificador, campos) VALUES 
('pda', 'PDA', 'imei_1', '[
    {"key": "imei_1", "tipo": "imei", "label": "IMEI 1", "required": false, "maxLength": 17, "validation": "imei"},
    {"key": "imei_2", "tipo": "imei", "label": "IMEI 2", "required": false, "maxLength": 17, "validation": "imei"},
    {"key": "numero_serie", "tipo": "text", "label": "Nº Série", "required": true},
    {"key": "numero_chip", "tipo": "telefone", "label": "Nº Chip", "required": false, "validation": "telefone_br"},
    {"key": "marca", "tipo": "select", "label": "Marca", "options": ["SAMSUNG", "HONEYWELL"], "required": true},
    {"key": "modelo", "tipo": "select_dependente", "label": "Modelo", "dependeDe": "marca", "required": true, "optionsPor": {"SAMSUNG": ["SM-A015M", "SM-A015G", "SM-A025M", "SM-A035M", "SM-A045M", "SM-A047M", "SM-A055M", "SM-A057M", "SM-A058M", "SM-A105M", "SM-A107M", "SM-A115M", "SM-A125M", "SM-A135M", "SM-A145M", "SM-A155M", "SM-A205M", "SM-A207M", "SM-A215M", "SM-A225M", "SM-A235M", "SM-A245M", "SM-A305M", "SM-A315F", "SM-A325M", "SM-A326M", "SM-A336M", "SM-A515F", "SM-A525M", "SM-A526B", "SM-A528B", "SM-A536B", "SM-A546E", "SM-A705M", "SM-A715F", "SM-A725F", "SM-A736B"], "HONEYWELL": ["EDA50", "EDA51K", "EDA51", "EDA52", "EDA61", "EDA62", "EDA71", "CT40", "CT45"]}},
    {"key": "versao_android", "tipo": "select", "label": "Versão Android", "options": ["5.0", "5.1", "6.0", "7.0", "7.1", "8.0", "8.1", "9.0", "10.0", "11.0", "12.0", "13.0", "14.0", "15.0", "16.0"], "required": true}
]'),
('impressora', 'Impressora', 'numero_serie', '[
    {"key": "numero_serie", "tipo": "text", "label": "Nº Série", "required": true, "validation": "impressora_serie"},
    {"key": "marca", "tipo": "select", "label": "Marca", "options": ["ZEBRA"], "required": true},
    {"key": "modelo", "tipo": "select", "label": "Modelo", "options": ["ZQ520", "ZQ521"], "required": true}
]'),
('maquineta', 'Maquineta', 'numero_serie', '[
    {"key": "numero_serie", "tipo": "text", "label": "Nº Série", "required": true},
    {"key": "numero_logico", "tipo": "text", "label": "Nº Lógico (TID)", "required": true}
]') ON CONFLICT (slug) DO NOTHING;
