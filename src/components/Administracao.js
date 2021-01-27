const Agenda = require("./agenda.js");
const Template = require("../templates/administracao.js");
const Login = require("./login.js");
const CadastroAluno = require("./cadastroAluno.js");

class Administracao extends Agenda {
    constructor(body) {
        super();
        this.body = body;
        this.login = new Login(body);
        this.cadastroAluno = new CadastroAluno(body);
    }

    render() {
        this.body.innerHTML = Template.render();
        this.addEventListener();
        this.monteGrid();
    }

    addEventListener() {
        this.logout();
        this.modalCadastroAluno();
    }

    logout() {
        this.body.querySelector("[botaoShutdown]").onClick = () => this.login.render();
    }

    modalCadastroAluno() {
        this.body.querySelector("[botaoAdicionar]").onClick = this.chameModal();
    }

    chameModal() {
        this.cadastroAluno.render();
    }

    monteGrid() {
        const opts = {
            method: "GET",
            url: `${this.URL}/administracao`,
            json: true
        };

        this.request(opts, (err, resp, data) => {
            //mostraAlunos(data);
        });
    }
}

module.exports = Administracao;