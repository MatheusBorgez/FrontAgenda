const Login = require("./components/login.js");
const Administracao = require("./components/Administracao.js");

class App {
    constructor(body) {
        this.login = new Login(body);
        this.administracao = new Administracao(body);
    }

    init() {
        this.login.render();
        this.addEventListener();
    }

    addEventListener() {
        this.loginEvents();
        //this.cadastroAlunoEvents();
    }

    loginEvents() {
        this.login.on("error", () => alert("Usuario ou senha incorretos"));
        this.login.on("login", () => this.administracao.render());
    }
}

module.exports = App;