const Agenda = require("./agenda.js");
const Template = require("../templates/cadastroAluno.js");
const Login = require("./login.js");

class CadastroAluno extends Agenda {
    constructor(body) {
        super();        
        this.login = new Login(body);
    }

    insiraAluno() {

    }

    editeAluno() {

    }

    excluaAluno() {
        
    }

}

module.exports = CadastroAluno;