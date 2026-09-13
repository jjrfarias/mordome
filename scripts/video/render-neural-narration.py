import asyncio
import subprocess
from pathlib import Path

import edge_tts


ROOT = Path(__file__).resolve().parents[2]
FFMPEG = ROOT / ".tools" / "ffmpeg" / "bin" / "ffmpeg.exe"
VOICE = "pt-BR-AntonioNeural"

SCRIPTS = {
    "saas": [
        "Um restaurante funciona em muitos lugares ao mesmo tempo: no balcão, nas mesas, na cozinha, no delivery e na administração. O Mordomê conecta tudo em uma única plataforma.",
        "Após a contratação, o proprietário recebe seu acesso, configura a empresa, cria as unidades e prepara a operação de forma simples e guiada.",
        "Cada cliente pode administrar vários estabelecimentos, com cardápios, preços, estoques, caixas, equipes e resultados separados por unidade.",
        "No ponto de venda, tudo acontece em poucos toques. Produtos, adicionais, observações, descontos autorizados, identificação do cliente e diferentes formas de pagamento.",
        "No salão, as mesas são organizadas por área e responsável. O atendente abre comandas, lança pedidos, acompanha rodadas, transfere mesas, divide e fecha a conta.",
        "Os pedidos seguem automaticamente para cada praça de preparo. A cozinha acompanha prioridades e etapas, enquanto impressoras locais recebem comandas e comprovantes.",
        "O mesmo catálogo alimenta o cardápio digital, os pedidos para retirada, o delivery próprio e as integrações externas, sem duplicar cadastros.",
        "Cada venda pode consumir automaticamente ingredientes, bebidas e embalagens. As fichas técnicas controlam quantidades, rendimento, perdas, custos e produção em lote.",
        "Entradas, inventários, estoque mínimo e transferências entre unidades mantêm a operação abastecida e totalmente rastreável.",
        "Caixa, Pix, cartões, T E F, emissão fiscal, sangrias, suprimentos, reembolsos e conciliação financeira trabalham de forma integrada.",
        "E se a internet cair? Com Nuvem mais Local, ponto de venda, salão, cozinha, caixa e impressão continuam na rede interna. Quando a conexão volta, tudo é sincronizado.",
        "Controle para quem administra. Agilidade para quem atende. Online ou offline. Mordomê. Toda a operação em um só lugar.",
    ],
    "betao": [
        "Uma história construída em família merece uma operação preparada para continuar crescendo.",
        "O Mordomê ganhou uma experiência exclusiva para a Família Betão, com identidade, cores e linguagem próprias.",
        "No balcão, hot dogs, bebidas, porções e adicionais ficam prontos para uma venda rápida, organizada e segura.",
        "No salão, cada pedido conecta mesa, atendente e cozinha, seguindo diretamente para a praça responsável.",
        "O mesmo cardápio atende balcão, mesas, retirada e delivery em todas as unidades.",
        "Mesmo sem internet, a Família Betão continua atendendo. Quando a conexão volta, o Mordomê sincroniza tudo.",
        "Mordomê para a Família Betão. Tradição para servir. Tecnologia para crescer.",
    ],
}


async def synthesize(text: str, destination: Path) -> None:
    temp_mp3 = destination.with_suffix(".neural.mp3")
    communicator = edge_tts.Communicate(
        text,
        VOICE,
        rate="-4%",
        pitch="-2Hz",
        volume="+0%",
    )
    await communicator.save(str(temp_mp3))
    subprocess.run(
        [
            str(FFMPEG),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(temp_mp3),
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=7",
            "-ar",
            "48000",
            "-ac",
            "2",
            str(destination),
        ],
        check=True,
    )
    temp_mp3.unlink()


async def main() -> None:
    for variant, scenes in SCRIPTS.items():
        output_dir = ROOT / "artifacts" / "videos" / variant / "narration"
        output_dir.mkdir(parents=True, exist_ok=True)
        for index, text in enumerate(scenes, start=1):
            destination = output_dir / f"{index:02d}.wav"
            await synthesize(text, destination)
            print(f"NARRATION {variant}/{destination.name}")


if __name__ == "__main__":
    asyncio.run(main())
