const Template = require("../templates/musculacao.js");
const Sala = require("./sala.js");

class Musculacao extends Sala {
    constructor(body) {
        super();
        this.body = body;
    }

    render(data) {
        this.obtenhaHorariosAlunos(data);
        this.body.innerHTML = Template.render();
    }
    
    obtenhaHorariosAlunos(data) {

        debugger;

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