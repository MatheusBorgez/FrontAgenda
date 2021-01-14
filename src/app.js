const Login = require("./components/login.js");
const CadastroAluno = require("./components/cadastroAluno.js");

class App {
    constructor(body) {
        this.login = new Login(body);
        this.cadastroAluno = new CadastroAluno(body);
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
        this.login.on("login", () => this.cadastroAluno.render());
    }
}

module.exports = App;