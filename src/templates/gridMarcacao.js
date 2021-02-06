const dropDownHorario = `
<div class="form-group col-sm ">
    <label for="select-hour">Selecione o horário</label>
    <select class="form-control " selecaoHorario>
        <option>07:00 - 07:30</option>                      
        <option>07:40 - 08:10</option>
        <option>08:20 - 08:50</option>
        <option>09:00 - 09:30</option>
        <option>09:40 - 10:10</option>
        <option>10:20 - 10:50</option>
        <option>11:00 - 11:30</option>
        <option>11:40 - 12:10</option>
        <option>12:20 - 12:50</option>
        <option>13:00 - 13:30</option>
        <option>13:40 - 14:10</option>
        <option>14:20 - 14:50</option>
        <option>15:00 - 15:30</option>
        <option>15:40 - 16:10</option>
        <option>16:20 - 16:50</option>
        <option>17:00 - 17:30</option>
        <option>17:40 - 18:10</option>
        <option>18:20 - 18:50</option>
        <option>19:00 - 19:30</option>
        <option>19:40 - 20:10</option>
        <option>20:20 - 20:50</option>
    </select>
</div>
`;


exports.render = horarios => {
    return `
<div class="container  border border-dark  mt-5 col-6">
    <div class="row ">

        <div class="col-sm text-xl-center back-grid text-white">
            Selecione um horário para cada dia da semana:
        </div>

    </div>
</div>

<div class="mb-3">
    <div class="container border border-dark back-gridrow1 text-dark col-6">
        <div class="row ">

            <div class="col-sm mt-4">
                Segunda-feira:
            </div>
            
            ${dropDownHorario}
            
        </div>
    </div>
    
    <div class="container col-6 border border-dark back-gridrow2 text-dark">
        <div class="row">

            <div class="col-sm">
                Terça-feira:
            </div>

            ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow1 text-dark">
        <div class="row">

            <div class="col-sm">
                Quarta-feira:
            </div>

           ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow2 text-dark">
        <div class="row">

            <div class="col-sm">
                Quinta-feira:
            </div>

            ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow1 text-dark">
        <div class="row">

            <div class="col-sm">
                Sexta-feira:
            </div>
            
            ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow2 text-dark">
        <div class="row">

            <div class="col-6">
                Sábado:
            </div>

            ${dropDownHorario}

        </div>
    </div>
</div>


<div class=" container col-sm">
    <div class="row">
        <div class="centered">

            <button type="submit" class="btn btn-dark" botaoConfirmar>
                Confirmar
             </button>

            <button type="button" class="btn btn-dark ml-5" botaoCancelar>
                Cancelar
            </button>

        </div>

    </div>
</div>

<p class="text-center text-white font-italic p-3">**Caso algum horário atinja a lotação máxima de alunos, o <br> horário ficará em vermelho e não poderá ser selecionado.</p>

    `
}