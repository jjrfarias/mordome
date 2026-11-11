import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Política de Privacidade | Mordomê",
  description: "Como o Mordomê trata dados pessoais, dados das lojas e informações das integrações com Instagram e Meta. Saiba como exercer seus direitos e solicitar exclusão.",
  alternates: { canonical: "https://mordome.jordaoconsultoria.com/privacidade" },
};

export default function PrivacyPage() {
  return <article><h1>Política de Privacidade</h1><p className={styles.updated}>Última atualização: 11 de novembro de 2026.</p>
    <p>Esta política explica o tratamento de dados no <strong>Mordomê</strong>, sistema de gestão de bares e restaurantes disponibilizado pela <strong>Jordão Consultoria</strong>, incluindo o recurso TV / Fotos e vídeos e a conexão com o Instagram pela Meta.</p>
    <div className={styles.notice}>Para dúvidas, solicitações sobre seus dados ou exclusão, escreva para <a href="mailto:jorgefarias@jordaoconsultoria.com">jorgefarias@jordaoconsultoria.com</a>. Você pode entrar em contato mesmo sem acesso ao sistema.</div>
    <h2>1. Responsabilidades pelo tratamento</h2>
    <p>A Jordão Consultoria administra o Mordomê e o atendimento relacionado à plataforma. Os estabelecimentos que utilizam o sistema definem como usam os dados de seus clientes, funcionários e fornecedores em suas operações. Nesses casos, o Mordomê trata os dados para prestar o serviço ao estabelecimento, conforme suas instruções e as obrigações aplicáveis. Uma solicitação pode exigir a participação do estabelecimento responsável.</p>
    <h2>2. Dados tratados</h2>
    <ul><li><strong>Conta e acesso:</strong> nome, usuário, e-mail quando informado, credenciais protegidas, permissões, vínculos com empresas e lojas, sessões e registros de segurança.</li>
      <li><strong>Operação do estabelecimento:</strong> informações cadastradas sobre clientes, equipe e fornecedores, contatos, endereços de entrega, pedidos, vendas, pagamentos, registros financeiros e fiscais, conforme os módulos utilizados. Recursos de entrega podem tratar localização quando habilitada e autorizada.</li>
      <li><strong>TV / Fotos e vídeos:</strong> fotos e vídeos enviados, nomes dos arquivos, configurações de exibição, identificação das TVs, credenciais de acesso das telas e datas de acesso.</li>
      <li><strong>Dados técnicos:</strong> endereço IP, informações do navegador, datas e registros de ações necessários à operação, auditoria e proteção do sistema.</li>
      <li><strong>Suporte:</strong> informações que você envia ao entrar em contato para atendimento ou para exercer direitos sobre seus dados.</li></ul>
    <p><strong>Participação por QR Code:</strong> clientes podem enviar fotos e vídeos sem criar conta. Guardamos o arquivo, seu nome, data do envio e o registro da autorização de exibição. A equipe da loja pode revisar esses arquivos; somente os aprovados entram na programação pública da TV. Para retirar sua autorização e solicitar a remoção, procure a loja ou use o contato acima, identificando o estabelecimento e o arquivo.</p>
    <h2>3. Instagram e Meta</h2>
    <p>A conexão com o Instagram está temporariamente pausada no Mordomê. O envio de arquivos e a participação por QR Code funcionam independentemente dessa integração.</p>
    <p>A conexão é opcional e depende de autorização na Meta. O Mordomê pode receber identificadores da conta profissional do Instagram, nome de usuário, identificadores do portfólio empresarial e do usuário de sistema, informações da autorização e tokens de acesso. Para a programação da TV, consulta os stories disponibilizados pela API, incluindo identificadores, tipo de mídia, endereços de imagens, vídeos e miniaturas e datas de publicação.</p>
    <p>Esses dados são usados para identificar a conta autorizada, vinculá-la à loja escolhida, validar e manter a conexão e exibir seus stories nas TVs autorizadas. A integração de TV não utiliza mensagens privadas, listas de contatos, comentários ou dados de anúncios para montar a programação, nem publica conteúdo no Instagram.</p>
    <p>Você informa sua senha do Instagram ou Facebook na própria Meta. O Mordomê recebe a autorização, não essa senha. Os tokens são mantidos cifrados no servidor e não são apresentados nas telas de TV. A Meta trata os dados recebidos em seus próprios serviços conforme suas políticas, incluindo a <a href="https://privacycenter.instagram.com/policy/" rel="noreferrer">Política de Privacidade do Instagram</a>.</p>
    <h2>4. Finalidades e fundamentos</h2>
    <p>Os dados são tratados para prestar os serviços contratados, autenticar usuários, aplicar permissões por estabelecimento, executar as funcionalidades solicitadas, oferecer suporte, prevenir uso indevido e manter registros necessários ao cumprimento de obrigações e ao exercício de direitos. Conforme a finalidade e a relação com o titular, o tratamento pode se apoiar na execução de contrato, em obrigações legais, em interesses legítimos de segurança e operação ou no consentimento quando aplicável. A autorização de uma integração pode ser retirada.</p>
    <h2>5. Compartilhamento e exibição</h2>
    <p>Os dados podem ser acessados por usuários autorizados do estabelecimento e por fornecedores necessários à hospedagem, armazenamento, envio de e-mails e demais integrações habilitadas. O Mordomê utiliza infraestrutura da Railway e armazenamento compatível com S3 para arquivos da TV. Esses serviços podem processar dados fora do Brasil; o tratamento deve observar as regras aplicáveis à proteção e à transferência de dados.</p>
    <p>Fotos, vídeos e stories selecionados serão visíveis às pessoas diante das TVs e a quem possuir acesso autorizado à tela. O responsável pela loja deve selecionar conteúdo adequado para essa exibição e proteger seus links de TV. Dados também podem ser fornecidos quando necessários ao cumprimento de obrigação legal ou de determinação válida de autoridade competente.</p>
    <h2>6. Cookies e proteção</h2>
    <p>O sistema utiliza cookies de sessão e de autorização para manter o login e identificar as TVs vinculadas. Bloqueá-los ou apagá-los pode exigir novo login ou nova ativação da TV. São aplicados controles de acesso por loja, conexões HTTPS em produção, proteção de credenciais e registros de auditoria. Nenhum sistema elimina integralmente os riscos de acesso indevido.</p>
    <h2>7. Conservação e exclusão</h2>
    <p>Os dados operacionais são conservados enquanto necessários à prestação do serviço, às finalidades informadas e às obrigações aplicáveis. Registros financeiros, fiscais, de segurança e auditoria podem precisar ser mantidos por razões legais ou para exercício de direitos. Não há um único prazo de retenção para todas essas categorias.</p>
    <p>Stories vencidos deixam de ser exibidos. Desconectar o Instagram no Mordomê remove a credencial e os identificadores da conexão ativa, o cache de stories, suas preferências e autorizações pendentes daquela loja. Registros históricos de auditoria podem conservar informações sobre a conexão, como identificador ou nome da conta, e exigem avaliação própria quando houver pedido de exclusão. Fotos e vídeos enviados separadamente continuam disponíveis até serem removidos.</p>
    <p>A exclusão da conexão não apaga a conta do Instagram, os registros operacionais do estabelecimento ou o conteúdo já recebido por uma tela desconectada. Eventuais cópias de segurança e registros sujeitos a retenção podem não ser eliminados no mesmo momento dos dados ativos; o atendimento informará as limitações aplicáveis ao pedido.</p>
    <h2>8. Seus direitos e contato</h2>
    <p>Você pode solicitar informações sobre o tratamento, confirmação e acesso aos seus dados, correção, exclusão ou anonimização quando aplicável, revogação de consentimento e avaliação dos demais direitos previstos na legislação de proteção de dados. Para isso, escreva para <a href="mailto:jorgefarias@jordaoconsultoria.com">jorgefarias@jordaoconsultoria.com</a>.</p>
    <p>Podemos pedir informações proporcionais para confirmar sua identidade e o vínculo com a conta ou estabelecimento, evitando excluir ou revelar dados de terceiros. Nunca envie senhas, tokens ou chaves secretas. As solicitações serão avaliadas conforme a legislação aplicável, com informação sobre providências e eventuais motivos de retenção. Consulte as <Link href="/exclusao-de-dados">instruções de exclusão de dados</Link>.</p>
    <h2>9. Atualizações</h2><p>Esta política pode ser atualizada para refletir mudanças no serviço ou nos requisitos aplicáveis. A data no início identifica a versão publicada. Alterações relevantes serão comunicadas pelos canais de contato ou pelo sistema, conforme aplicável.</p>
  </article>;
}
