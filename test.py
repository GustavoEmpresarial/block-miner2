import os
import re
import fitz  # PyMuPDF
import polars as pl
import xlsxwriter

folder_path = r"C:\Users\joaop\Downloads\notas edemilson"

# REGRA 1: O [\s:]* garante que só pode existir espaço, enter ou ':' entre a palavra e o número. 
# Se tiver a palavra "Data de Emissão", o script ignora e não cai na pegadinha do Código de Verificação.
re_nfse = re.compile(r"N[úu]mero\s+da\s+NFS-e[\s:]*(\d{4,9})\b", re.IGNORECASE)

# REGRA 2: Pula os cabeçalhos bagunçados da prefeitura e pega o primeiro valor em R$
re_valor = re.compile(r"Valor\s+dos\s+Servi[çc]os\D{0,150}?R\$\s*([\d\.,]+)", re.IGNORECASE)

dados = []

def converter_para_numero(valor_str):
    if valor_str == "Não encontrado":
        return valor_str
    try:
        valor_limpo = valor_str.replace(".", "").replace(",", ".")
        return float(valor_limpo)
    except:
        return valor_str

def extrair_ordem_arquivo(nome_arquivo):
    """Extrai o número entre parênteses para forçar a ordenação real dos arquivos"""
    match = re.search(r"\((\d+)\)", nome_arquivo)
    return int(match.group(1)) if match else 0

print("Iniciando extração com bloqueio de código de verificação...")

for filename in os.listdir(folder_path):
    if not filename.lower().endswith(".pdf"):
        continue

    filepath = os.path.join(folder_path, filename)
    nome_min = filename.lower()
    
    # Classificação
    if "agra canceladas" in nome_min:
        categoria = "Agra Canceladas"
    elif "agra" in nome_min:
        categoria = "Agra"
    elif "alibem canceladas" in nome_min:
        categoria = "Alibem Canceladas"
    elif "alibem" in nome_min:
        categoria = "Alibem"
    else:
        continue

    # Pegando a numeração do arquivo para organizar depois
    ordem_arquivo = extrair_ordem_arquivo(filename)

    try:
        with fitz.open(filepath) as doc:
            for page_num, page in enumerate(doc, start=1):
                texto = page.get_text("text")
                
                match_nfse = re_nfse.search(texto)
                match_valor = re_valor.search(texto)
                
                num_nfse = match_nfse.group(1) if match_nfse else "Não encontrado"
                valor_texto = match_valor.group(1) if match_valor else "Não encontrado"
                
                valor_final = converter_para_numero(valor_texto)
                
                dados.append({
                    "Categoria": categoria,
                    "Ordem_Arquivo": ordem_arquivo, 
                    "Arquivo": filename,
                    "Página": page_num,
                    "Número da NFS-e": num_nfse,
                    "Valor dos Serviços (R$)": valor_final
                })
    except Exception as e:
        print(f"Erro ao ler o arquivo {filename}: {e}")

if dados:
    print("\nOrdenando perfeitamente pelas páginas e gerando o Excel...")
    
    df = pl.DataFrame(dados)
    
    # ORDENAÇÃO MATEMÁTICA: Garante a sequência lógica de arquivos e páginas
    df = df.sort(["Categoria", "Ordem_Arquivo", "Página"])
    
    abas = {
        # O .drop esconde as colunas de uso interno para deixar seu Excel limpo
        "Agra": df.filter(pl.col("Categoria") == "Agra").drop(["Categoria", "Ordem_Arquivo"]),
        "Agra Canceladas": df.filter(pl.col("Categoria") == "Agra Canceladas").drop(["Categoria", "Ordem_Arquivo"]),
        "Alibem": df.filter(pl.col("Categoria") == "Alibem").drop(["Categoria", "Ordem_Arquivo"]),
        "Alibem Canceladas": df.filter(pl.col("Categoria") == "Alibem Canceladas").drop(["Categoria", "Ordem_Arquivo"])
    }

    output_path = os.path.join(folder_path, "Relatorio_Notas_Edemilson_Final.xlsx")
    
    with xlsxwriter.Workbook(output_path) as workbook:
        formato_moeda = workbook.add_format({'num_format': 'R$ #,##0.00'})
        
        for nome_aba, df_aba in abas.items():
            worksheet = workbook.add_worksheet(nome_aba)
            
            # Escrevendo os cabeçalhos
            for col_num, col_name in enumerate(df_aba.columns):
                worksheet.write(0, col_num, col_name)
                
            # Escrevendo os dados
            for row_num, row_data in enumerate(df_aba.iter_rows(), start=1):
                for col_num, cell_data in enumerate(row_data):
                    # Formata a coluna "Valor dos Serviços (R$)" como Moeda
                    if col_num == 3 and isinstance(cell_data, float):
                        worksheet.write(row_num, col_num, cell_data, formato_moeda)
                    else:
                        worksheet.write(row_num, col_num, cell_data)

    print(f"\nExtração concluída com sucesso! Planilha pronta em:\n{output_path}")
else:
    print("Nenhum dado correspondente foi encontrado.")