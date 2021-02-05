const Agenda = require("./agenda.js");
const Template = require("../templates/musculacao.js");
const Menu = require("./menu");

class Musculacao extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    render(data) {
        obtenhaHorariosAlunos(data);
        this.body.innerHTML = Template.render();
    }
    
    obtenhaHorariosAlunos(data) {
        const opts = {
            method: "GET",
            url: `${this.URL}/sala/${data.idAluno}/${data.sala}`,
            json: true
        };

        this.request(opts, (err, resp, data) => {
            if (err) {
                this.emit("error", "não foi possível carregar os alunos");
            }
            else {
                this.body.innerHTML = Template.render(data.horarios);
                this.addEventListener();
            }
        });
    }

}

module.exports = Musculacao;