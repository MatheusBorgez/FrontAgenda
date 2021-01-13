import Agenda from "../agenda.js";
import Template from "../templates/login.js";

class Login extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    render() {
        this.body.innerHTML = Template.render();
        this.body.querySelector("[usuario]").focus();
        this.addEventListener();
    }

    addEventListener() {
        this.envieFormulario();
        this.esqueceuSenha();
    }

    formSubmit() {
        const form = this.body.querySelector("form");
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const usuario = e.target.querySelector("[usuario]");
            const senha = e.target.querySelector("[senha]");
            const opts = {
                method: "POST",
                url: `${this.URL}`,
                json: true,
                body: {
                    usuario: usuario.value,
                    password: senha.value
                }
            };
            this.request(opts, (err, resp, data) => {
                if (err || resp.status === 401) {
                    this.emit("error", err);
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