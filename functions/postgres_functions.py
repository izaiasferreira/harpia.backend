import os
from dotenv import load_dotenv
load_dotenv()
import psycopg
from datetime import datetime

def connect_postgres():
    conn = psycopg.connect(
        host=os.getenv("PG_HOST"),
        port=int(os.getenv("PG_PORT")) or 5432,
        dbname=os.getenv("PG_DATABASE"),
        user=os.getenv("PG_USER"),
        password=os.getenv("PG_PASSWORD"),
    )
    return conn

def pendencias(region="all"):
    conn = connect_postgres()
    cur = conn.cursor()
    
    query = f"""
        SELECT
            instalacao,
            etapa,
            seccional,
            regional,
            concluido
        FROM matriz
        WHERE concluido = 'PENDENTE'
        AND data_leit_prev LIKE '%' || TO_CHAR(CURRENT_DATE, 'MM.YYYY')
    """


    if region != "all":
        query += f"AND regional = '{region.upper()}'"

    cur.execute(query)
    data = cur.fetchall()
    conn.close()
    
    if len(data) == 0:
        return {'type': 'text', 'text': "Nenhuma instalação encontrada."}
    unified ={}
    for row in data:
        if row[3] not in unified:
            unified[row[3]] = {}
        if row[2] not in unified[row[3]]:
            unified[row[3]][row[2]] = []
        unified[row[3]][row[2]].append(row)
    text = ''
    for regional in unified:
        total = 0
        text += f"REGIONAL {regional}\n"
        for seccional in unified[regional]:
            text += f" - {seccional.strip()} : \n"
            etapas = []
            for row in unified[regional][seccional]:
                if row[1] not in etapas:
                    etapas.append(row[1])
            
            #organizar etapas
            etapas.sort()
            print(etapas)

            for etapa in etapas:
                quant = len([row for row in unified[regional][seccional] if row[1] == etapa])
                text += f"  - Etapa {etapa}: {quant}\n"
                total += quant
            
        text += f"\nTOTAL:{total}\n"
    return {'type': 'text', 'text': text}

def pendencias_json(region="all"):
    conn = connect_postgres()
    cur = conn.cursor()
    
    query = f"""
        SELECT
            instalacao,
            etapa,
            seccional,
            regional,
            concluido,
            data_leit_prev,
            agente,
            nome_agente
        FROM matriz
        WHERE concluido = 'PENDENTE'
        AND data_leit_prev LIKE '%' || TO_CHAR(CURRENT_DATE, 'MM.YYYY')
    """


    if region != "all":
        query += f"AND regional = '{region.upper()}'"

    cur.execute(query)
    data = cur.fetchall()
    conn.close()
    
    return data

def cnl(region="all", dateinit=datetime.now().strftime("%d.%m.%Y"), dateend=datetime.now().strftime("%d.%m.%Y")):
    conn = connect_postgres()
    cur = conn.cursor()

    params = [dateinit, dateend]
    
    query = f"""
        SELECT
            instalacao,
            etapa,
            seccional,
            regional,
            ntlei,
            concluido,
            status_ds
        FROM matriz
        WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY') 
            BETWEEN TO_DATE(%s, 'DD.MM.YYYY') AND TO_DATE(%s, 'DD.MM.YYYY')
            AND concluido = 'CONCLUIDO'
            AND ntlei NOT LIKE 'A%%'
            AND ntlei NOT IN ('B09', 'B10', 'B15')
            AND status_ds = 'LG'
    """


    if region != "all":
        query += f"AND regional = %s"
        params.append(region.upper())

    
    cur.execute(query, params)
    data = cur.fetchall()
    conn.close()
    
    print(len(data))

    if len(data) == 0:
        return {'type': 'text', 'text': "Nenhuma instalação encontrada."}
    unified ={}
    for row in data:
        if row[3] not in unified:
            unified[row[3]] = {}
        if row[2] not in unified[row[3]]:
            unified[row[3]][row[2]] = []
        unified[row[3]][row[2]].append(row)
    text = ''
    for regional in unified:
        text += f"REGIONAL {regional}\n"
        total = 0
        for seccional in unified[regional]:
            text += f" - {seccional.strip()} : {len(unified[regional][seccional])}\n"
            total += len(unified[regional][seccional])
        unified[regional]['total'] = total
        text += f"\nTOTAL: {total}\n"
    return {'type': 'text', 'text': text}

def C12_json(region="all", dateinit=datetime.now().strftime("%d.%m.%Y"), dateend=datetime.now().strftime("%d.%m.%Y")):
    conn = connect_postgres()
    cur = conn.cursor()

    params = [dateinit, dateend]
    
    query = f"""
        SELECT
            instalacao,
            etapa,
            seccional,
            regional,
            ntlei,
            agente,
            nome_agente,
            status_ds,
            hora_conclusao,
            latitude,
            longitude
        FROM matriz
        WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY') 
            BETWEEN TO_DATE(%s, 'DD.MM.YYYY') AND TO_DATE(%s, 'DD.MM.YYYY')
            AND ntlei = 'C12'
            AND status_ds = 'LG'
    """


    if region != "all":
        query += f"AND regional = %s"
        params.append(region.upper())

    
    cur.execute(query, params)
    data = cur.fetchall()
    conn.close()
    
    return data


def E02_json(region="all", dateinit=datetime.now().strftime("%d.%m.%Y"), dateend=datetime.now().strftime("%d.%m.%Y")):
    conn = connect_postgres()
    cur = conn.cursor()

    params = [dateinit, dateend]
    
    query = f"""
        SELECT
            instalacao,
            etapa,
            seccional,
            regional,
            ntlei,
            agente,
            nome_agente,
            status_ds,
            hora_conclusao,
            latitude,
            longitude
        FROM matriz
        WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY') 
            BETWEEN TO_DATE(%s, 'DD.MM.YYYY') AND TO_DATE(%s, 'DD.MM.YYYY')
            AND ntlei = 'E02'
    """


    if region != "all":
        query += f"AND regional = %s"
        params.append(region.upper())

    
    cur.execute(query, params)
    data = cur.fetchall()
    conn.close()
    
    return data

def C16_json(region="all", dateinit=datetime.now().strftime("%d.%m.%Y"), dateend=datetime.now().strftime("%d.%m.%Y")):
    conn = connect_postgres()
    cur = conn.cursor()

    params = [dateinit, dateend]
    
    query = f"""
        SELECT
            instalacao,
            etapa,
            seccional,
            regional,
            ntlei,
            agente,
            nome_agente,
            status_ds,
            hora_conclusao,
            latitude,
            longitude
        FROM matriz
        WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY') 
            BETWEEN TO_DATE(%s, 'DD.MM.YYYY') AND TO_DATE(%s, 'DD.MM.YYYY')
            AND ntlei = 'C16'
    """


    if region != "all":
        query += f"AND regional = %s"
        params.append(region.upper())

    
    cur.execute(query, params)
    data = cur.fetchall()
    conn.close()
    
    return data

def not_start_services():
    conn = connect_postgres()
    cur = conn.cursor()

    query = f"""
        SELECT 
            agente, 
            nome_agente, 
            seccional, 
            regional,
            COUNT(*) FILTER (WHERE concluido = 'PENDENTE') AS total_pendencias,
            TO_CHAR(CURRENT_DATE, 'DD.MM.YYYY') as date
        FROM matriz
        WHERE 
            data_leit_prev LIKE '%' || TO_CHAR(CURRENT_DATE, 'MM.YYYY')
            and agente <> ''
        GROUP BY agente, nome_agente, seccional, regional
        HAVING 
            COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao = TO_CHAR(CURRENT_DATE, 'DD.MM.YYYY')) = 0
            AND COUNT(*) FILTER (WHERE concluido = 'PENDENTE') > 0
    """

    
    cur.execute(query)
    data = cur.fetchall()
    conn.close()
    
    return data

def completed_services():
    conn = connect_postgres()
    cur = conn.cursor()

    query = f"""
        SELECT 
            agente, 
            nome_agente, 
            seccional, 
            regional,
            COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO') AS total_concluidas,
            TO_CHAR(CURRENT_DATE, 'DD.MM.YYYY') as date
        FROM matriz
        WHERE 
            data_leit_prev LIKE '%' || TO_CHAR(CURRENT_DATE, 'MM.YYYY')
            and agente <> ''
        GROUP BY agente, nome_agente, seccional, regional
        HAVING 
            COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao = TO_CHAR(CURRENT_DATE, 'DD.MM.YYYY')) > 0
            AND COUNT(*) FILTER (WHERE concluido = 'PENDENTE') = 0
    """

    
    cur.execute(query)
    data = cur.fetchall()
    conn.close()
    
    return data

def perdas(region="all", dateinit=datetime.now().strftime("%d.%m.%Y"), dateend=datetime.now().strftime("%d.%m.%Y")):
    conn = connect_postgres()
    cur = conn.cursor()

    params = [dateinit, dateend]
    
    query = f"""
        SELECT
            instalacao,
            etapa,
            seccional,
            regional,
            ntlei,
            apontamento,
            tem_perda,
            motivo_perda,
            perda_prevista_mensal
        FROM matriz
        WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY') 
            BETWEEN TO_DATE(%s, 'DD.MM.YYYY') AND TO_DATE(%s, 'DD.MM.YYYY')
            AND tem_perda = 'PERDA'
            AND perda_prevista_mensal <> '0'
    """


    if region != "all":
        query += f"AND regional = %s"
        params.append(region.upper())

    
    cur.execute(query, params)
    data = cur.fetchall()
    conn.close()

    if len(data) == 0:
        return {'type': 'text', 'text': "Nenhuma instalação encontrada."}
    unified ={}

    for row in data:
        if row[3] not in unified:
            unified[row[3]] = {}
        if row[2] not in unified[row[3]]:
            unified[row[3]][row[2]] = []
        unified[row[3]][row[2]].append(row)
    text = ''
    for regional in unified:
        text += f"REGIONAL {regional}\n"
        perda_regional = 0
        for seccional in unified[regional]:
            perda_seccional = 0
            for row in unified[regional][seccional]:
                perda_seccional += int(row[8])
            perda_regional += perda_seccional
            text += f" - {seccional.strip()} : {perda_seccional} kWh\n"

        text += f"\nTOTAL: {perda_regional} kWh\n"
    return {'type': 'text', 'text': text}

def perdas_json(region="all", dateinit=datetime.now().strftime("%d.%m.%Y"), dateend=datetime.now().strftime("%d.%m.%Y")):
    conn = connect_postgres()
    cur = conn.cursor()

    params = [dateinit, dateend]
    
    query = f"""
        SELECT
            instalacao,
            etapa,
            seccional,
            regional,
            motivo_perda,
            perda_prevista_mensal,
            agente,
            nome_agente,
            latitude,
            longitude
        FROM matriz
        WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY') 
            BETWEEN TO_DATE(%s, 'DD.MM.YYYY') AND TO_DATE(%s, 'DD.MM.YYYY')
            AND tem_perda = 'PERDA'
            AND perda_prevista_mensal <> '0'
    """


    if region != "all":
        query += f"AND regional = %s"
        params.append(region.upper())

    
    cur.execute(query, params)
    data = cur.fetchall()
    conn.close()

    return data

def get_installation(insts=None):
    conn = connect_postgres()
    cur = conn.cursor()
    
    query = f"""
        SELECT
            INSTALACAO,
            CONTA_CONTRATO,
            MEDIDOR,
            NOME,
            ENDERECO,
            COMPLEMENTO,
            BAIRRO,
            LOCALIDADE,
            CEP,
            PONTO_REFERENCIA,
            TEL_MOVEL,
            LATITUDE,
            LONGITUDE,
            LTRIM(MEDIDOR_ANTERIOR, '0') AS MEDIDOR_ANTERIOR,
            LTRIM(MEDIDOR_POSTERIOR, '0') AS MEDIDOR_POSTERIOR
        FROM cadastro
        WHERE LTRIM(INSTALACAO, '0') = LTRIM('{insts}', '0')
    """
    print(query)
    cur.execute(query)
    data = cur.fetchone()
    conn.close()
    
    
    if data is None:
        return []
    if data is not None:
        result = {
            "instalacao": data[0],
            "conta_contrato": data[1],
            "medidor": data[2],
            "nome": data[3],
            "endereco": data[4],
            "complemento": data[5],
            "bairro": data[6],
            "localidade": data[7],
            "cep": data[8],
            "ponto_referencia": data[9],
            "contato": data[10],
            "medidor_anterior": data[13],
            "medidor_posterior": data[14],
            "localizacao": f"https://www.google.com/maps?q={data[11]},{data[12]}"
        }
        return result

def get_files_for_revalidate():
    conn = connect_postgres()
    cur = conn.cursor()

    query = f"""
        SELECT
            *
        FROM auditoria
        WHERE VALIDACAO = 'FALSO'
        AND revalidacao = 'None'
    """
    cur.execute(query)
    data = cur.fetchall()
    conn.close()
    
    if len(data) == 0:
        return []
    
    return [{'instalacao': row[0], 'data_foto': row[4], 'hora_foto':row[5],'apontamento': row[1], 'foto':os.getenv("API_URL") + "/" + row[11]} for row in data]

def save_revalidate_file(instalacao, data, validation):
    conn = connect_postgres()
    cur = conn.cursor()
    
    query = f"""
        UPDATE auditoria
        SET revalidacao = '{validation}'
        WHERE instalacao = '{instalacao}'
        AND data_conclusao = '{data}'
    """
    cur.execute(query)
    conn.commit()
    conn.close()
    
    return {'status': 'success'}
