-- Adiciona suporte a múltiplas coordenadas por service note (até 5 pontos interligados)
-- coordinates_path armazena um array JSON: [{"lat": -5.09, "lng": -42.80}, ...]
-- coordinates, latitude, longitude continuam como a coordenada primária (primeiro ponto)

ALTER TABLE service_notes ADD COLUMN IF NOT EXISTS coordinates_path JSONB;
