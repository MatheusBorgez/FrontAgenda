(function() {
    function r(e, n, t) {
        function o(i, f) {
            if (!n[i]) {
                if (!e[i]) { var c = "function" == typeof require && require; if (!f && c) return c(i, !0); if (u) return u(i, !0); var a = new Error("Cannot find module '" + i + "'"); throw a.code = "MODULE_NOT_FOUND", a }
                var p = n[i] = { exports: {} };
                e[i][0].call(p.exports, function(r) { var n = e[i][1][r]; return o(n || r) }, p, p.exports, r, e, n, t)
            }
            return n[i].exports
        }
        for (var u = "function" == typeof require && require, i = 0; i < t.length; i++) o(t[i]);
        return o
    }
    return r
})()({
    1: [function(require, module, exports) {
        window.onload = () => {
            // alert("Bem-vindo");
        };

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

        // Preenchimento automatico endereço pelo cep

        $("#cep").focusout(function() {

            $.ajax({
                url: 'https://viacep.com.br/ws/' + $(this).val() + '/json/unicode/',
                dataType: 'json',
                success: function(resposta) {
                    $("#logradouro").val(resposta.logradouro);
                    $("#complemento").val(resposta.complemento);
                    $("#bairro").val(resposta.bairro);
                    $("#cidade").val(resposta.localidade);
                    $("#uf").val(resposta.uf);
                    $("#numero").focus();
                }
            });
        });



    }, {}]
}, {}, [1]);
// Validação CPF
function MaskCpf(mask, input) {
    const vetMask = mask.split("")
    const numCpf = input.value.replace(/\D/g, "")
    const cursor = input.selectionStart
    const tecla = (window.event) ? event.keyCode : event.which

    for (let i = 0; i < numCpf.length; i++) {
        vetMask.splice(vetMask.indexOf("_"), 1, numCpf[i])
    }
    input.value = vetMask.join("")
    if (tecla != 37 && (cursor == 3 || cursor == 7 || cursor == 11)) {
        input.setSelectionRange(cursor + 1, cursor + 1)
    } else {
        input.setSelectionRange(cursor, cursor)
    }

}