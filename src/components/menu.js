const Agenda = require("./agenda.js");
const Template = require("../templates/menu.js");
const Multifuncional = require("./multifuncional.js");
const Musculacao = require("./musculacao.js");

class Menu extends Agenda {

    constructor(body) {
        super();
        this.body = body;
        this.musculacao = new Musculacao(body);
        this.multifuncional = new Multifuncional(body);
    }


    render(login) {
        this.body.innerHTML = Template.render(login);
        this.obtenhaCodigoAluno(login);
        this.addEventListener();
    }


    addEventListener() {
        this.botaoMusculacao();
        this.botaoMultifuncional();
        this.logout();
    }

    logout() {

        this.body.querySelector("[botaoshutdown]").onclick = () => document.location.reload(true);
        debugger;
    }

    obtenhaCodigoAluno(login) {

        const opts = {
            method: "GET",
            url: `${this.URL}/menu/${login}`,
            json: true,
        }

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 200) {
                alert("Aluno não encontrado");
                return;
            } else {
                this.codigoAluno = data.id;
            }
        });
    }

    botaoMusculacao() {
        const data = {
            idAluno: this.codigoAluno,
            sala: "musculacao"
        };

        this.body.querySelector("[botaoMusculacao]").onclick = () => this.musculacao.render(data);
    }

    botaoMultifuncional() {
        const data = {
            idAluno: this.codigoAluno,
            sala: "multifuncional"
        };

        this.body.querySelector("[botaoMultifuncional]").onclick = () => this.multifuncional.render(data);
    }
}

module.exports = Menu;