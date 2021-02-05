const Agenda = require("./agenda.js");
const Menu = require("./menu.js");

class Sala extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }    

    addEventListener() {
        this.confirmarHorario();
    }

    obtenhaHorariosAlunos(data) {
        const opts = {
            method: "GET",
            url: `${this.URL}/sala/${data.idAluno}/${data.sala}`,
            json: true
        };

        this.request(opts, (err, resp, data) => {            
            
            if (data.horarios) {                

                var dropDownHorarios = Array.prototype.slice.call(this.body.querySelectorAll("[selecaoHorario]"));

                for(let index; index < dropDownHorarios.length; index++) {
                    dropDownHorarios[index].value = data.horarios[index].faixaHorario;
                }
            }
        });
    }

    confirmarHorario() {
        this.body.querySelector(['botaoCancelar']).onclick = insireOuAtualizeHorario();        
    }

    insireOuAtualizeHorario() {

    }

}

module.exports = Sala;