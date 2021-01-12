window.onload = () => {
    alert("Bem-vindo");
}



//função para confirmação de agendamento.
function action_confirm() {
    let msg;
    let msg_tela = confirm("Deseja confirmar a seleção?");
    if (msg_tela == true) {
        msg = "Obrigado por selecionar os horários na sala de musculação!"
        alert(msg);
        window.location.replace("file:///D:/Biblioteca/Documentos/GitHub/Projeto-agenda-NODE/menu.html");
    } else {
        window.location.reload();
    }

}
// função para cancelamento
function action_cancel() {

    let msg_tela = confirm("Deseja voltar a tela de seleção de salas?");
    if (msg_tela == true) {
        window.location.replace("file:///D:/Biblioteca/Documentos/GitHub/Projeto-agenda-NODE/menu.html");
    } else {
        window.location.reload();
    }

}

//função para chamar tela sala de musculação

function tela_musc() {
    window.location.href = "file:///D:/Biblioteca/Documentos/GitHub/Projeto-agenda-NODE/agenda_musc.html";

}

//função para chamar tela sala de multifuncional
function tela_mult() {
    return window.location.href = "file:///D:/Biblioteca/Documentos/GitHub/Projeto-agenda-NODE/agenda_mult.html";
}

// Preenchimento automatico endereço pelo cep

$("#cep").focusout(function() {
    //Aqui vai o código	
    $.ajax({
        //O campo URL diz o caminho de onde virá os dados
        //É importante concatenar o valor digitado no CEP
        url: 'https://viacep.com.br/ws/' + $(this).val() + '/json/unicode/',
        //Aqui você deve preencher o tipo de dados que será lido,
        //no caso, estamos lendo JSON.
        dataType: 'json',
        //SUCESS é referente a função que será executada caso
        //ele consiga ler a fonte de dados com sucesso.
        //O parâmetro dentro da função se refere ao nome da variável
        //que você vai dar para ler esse objeto.
        success: function(resposta) {
            //Agora basta definir os valores que você deseja preencher
            //automaticamente nos campos acima.
            $("#logradouro").val(resposta.logradouro);
            $("#complemento").val(resposta.complemento);
            $("#bairro").val(resposta.bairro);
            $("#cidade").val(resposta.localidade);
            $("#uf").val(resposta.uf);
            //Vamos incluir para que o Número seja focado automaticamente
            //melhorando a experiência do usuário
            $("#numero").focus();
        }
    });
});

// Validação CPF
$("#cpf").mask("999.999.999-99");