// Nesta página encontra-se as manipulações em javascript da tela de administração




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


// validação Tel

function MaskTel(mask, input) {
    const vetMask = mask.split("")
    const numTel = input.value.replace(/\D/g, "")
    const cursor = input.selectionStart
    const tecla = (window.event) ? event.keyCode : event.which

    for (let i = 0; i < numTel.length; i++) {
        vetMask.splice(vetMask.indexOf("_"), 1, numTel[i])
    }
    input.value = vetMask.join("")
    if (tecla != 37 && (cursor == 7)) {
        input.setSelectionRange(cursor + 1, cursor + 1)
    } else {
        input.setSelectionRange(cursor, cursor)
    }

}