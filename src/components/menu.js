const Agenda = require("./agenda.js");
const Template = require("../templates/menu.js");

class Menu extends Agenda {

    constructor(body) {
        super();
        this.body = body;
    }

    render(login) {
        debugger;
        this.body.innerHTML = Template.render(login);
        this.obtenhaCodigoAluno(login);
        this.addEventListener();
    }

    addEventListener() {
        this.botaoMusculacao();
        this.botaoMultifuncional();
    }

    obtenhaCodigoAluno(login) {

        debugger;

        const opts = {
            method: "GET",
            url: `${this.URL}/menu/${login}`,
            json: true,
        }

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 200) {
                alert("Aluno não encontrado");
                return;
            }
            else {
                this.codigoAluno = data.id;
            }
        });
    }

    botaoMusculacao() {
        this.body.querySelector("[botaoEditar]").onclick = () => this.chame()
    }

    botaoMultifuncional() {

    }
}

module.exports = Menu;