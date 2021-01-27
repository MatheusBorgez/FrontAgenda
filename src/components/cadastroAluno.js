const Agenda = require("./agenda.js");
const Template = require("../templates/cadastroAluno.js");
const Login = require("./login.js");

class CadastroAluno extends Agenda {
    constructor(body) {
        super();
        this.body = body;
        this.login = new Login(body);
    }

    render() {
        this.body.innerHTML += Template.render();
        //this.addEventListener();
        //this.monteGrid();
    }
}

module.exports = CadastroAluno;