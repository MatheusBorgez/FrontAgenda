const Agenda = require("./agenda.js");
const Template = require("../templates/administracao.js");
const Login = require("./login.js");

class Administracao extends Agenda {
    constructor(body) {
        super();
        this.body = body;
        this.login = new Login(body);
    }

    render() {
        this.body.innerHTML = Template.render();
        this.addEventListener();
    }

    addEventListener() {
        this.logout();
    }

    logout() {
        this.body.querySelector("[botaoShutdown]").onClick(this.login.render());
    }
}

module.exports = Administracao;