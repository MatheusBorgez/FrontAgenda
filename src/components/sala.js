const Agenda = require("./agenda.js");

class Sala extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    addEventListener() {
        this.botaoConfirmar();
        this.botaoCancelar()
    }

    obtenhaHorariosAlunos(login) {
        const opts = {
            method: "GET",
            url: `${this.URL}/sala/${login.idAluno}/${login.sala}`,
            json: true
        };

        this.request(opts, (err, resp, data) => {
            this.atualizeDropDowns(data.horarios);
        });
    }

    atualizeDropDowns(horarios) {

        if (horarios) {

            let dropDownHorarios = Array.prototype.slice.call(this.body.querySelectorAll("[selecaoHorario]"));

            for (let index = 0; index < dropDownHorarios.length; index++) {

                dropDownHorarios[index].value = horarios[index].faixaHorario;

            }
        }
    }

    botaoConfirmar(data) {
        this.body.querySelector("[botaoConfirmar]").onclick = () => this.insireOuAtualizeHorario(this.login);
    }

    botaoCancelar() {
        this.body.querySelector("[botaoCancelar]").onclick = () => this.emit("loginAluno", this.login.login);
    }

    insireOuAtualizeHorario(login) {

        let dropDownHorarios = Array.prototype.slice.call(this.body.querySelectorAll("[selecaoHorario]"));

        const opts = {
            method: "POST",
            url: `${this.URL}/sala`,
            json: true,
            body: {
                horarios: [
                    {
                        faixaHorario: dropDownHorarios[0].value,
                        idAluno: login.idAluno,
                        diaSemana: "segunda",
                        sala: login.sala
                    },
                    {
                        faixaHorario: dropDownHorarios[1].value,
                        idAluno: login.idAluno,
                        diaSemana: "terca",
                        sala: login.sala
                    },
                    {
                        faixaHorario: dropDownHorarios[2].value,
                        idAluno: login.idAluno,
                        diaSemana: "quarta",
                        sala: login.sala
                    },
                    {
                        faixaHorario: dropDownHorarios[3].value,
                        idAluno: login.idAluno,
                        diaSemana: "quinta",
                        sala: login.sala
                    },
                    {
                        faixaHorario: dropDownHorarios[4].value,
                        idAluno: login.idAluno,
                        diaSemana: "sexta",
                        sala: login.sala
                    },
                    {
                        faixaHorario: dropDownHorarios[5].value,
                        idAluno: login.idAluno,
                        diaSemana: "sabado",
                        sala: login.sala
                    }
                ]
            }
        };

        debugger;

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 201) {
                this.emit("alunoNaoInserido", err);
            }
            else {
                this.alert("Horario inserido com sucesso!");
            }
        });
    }

}

module.exports = Sala;