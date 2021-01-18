//função para confirmação de agendamento.
function action_confirm() {
    let msg;
    let msg_tela = confirm("Deseja confirmar a seleção?");
    if (msg_tela == true) {
        msg = "Obrigado por selecionar os horários na sala de musculação!";
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