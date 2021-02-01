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