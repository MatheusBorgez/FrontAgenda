const Agenda = require("./agenda.js");
const Template = require("../templates/login.js");

class Login extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    render() {
        this.body.innerHTML = Template.render();
        debugger;
        this.body.querySelector("[usuario]").focus();
        this.addEventListener();
    }

    addEventListener() {
        this.envieFormulario();
        this.esqueceuSenha();
    }

    envieFormulario() {
        const form = this.body.querySelector("form");
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const usuario = e.target.querySelector("[usuario]");
            const senha = e.target.querySelector("[senha]");
            const opts = {
                method: "POST",
                url: `${this.URL}/Login`,
                json: true,
                body: {
                    usuario: usuario.value,
                    password: senha.value
                }
            };
            this.request(opts, (err, resp, data) => {
                if (err || resp.status === 401) {
                    this.emit("error", err);
                    alert("Usuário ou senha incorretos");
                }
                else {
                    this.emit("cadastroAluno", data);
                }
            });
        });
    }

    esqueceuSenha() {
        //codigo pra chamar em URL
    }
}

module.exports = Login;