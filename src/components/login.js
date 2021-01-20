const Agenda = require("./agenda.js");
const Template = require("../templates/login.js");

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

    envieFormulario() {
        const form = this.body.querySelector("form");
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const usuario = e.target.querySelector("[usuario]");
            const senha = e.target.querySelector("[senha]");
            this.autentiqueUsuario(usuario, senha);
        });
    }

    autentiqueUsuario(usuario, senha) {
        
        const opts = {
            method: "POST",
            url: `${this.URL}/Login`,
            json: true,
            body: {
                login: usuario.value,
                senha: senha.value
            }
        };       

        this.request(opts, (err, resp, data) => {
            
            this.logaUsuario(resp, err, data);
        });
    }

    logaUsuario(resp, err, data) {

        debugger;

        if (resp.status !== 200) {
            this.emit("error", err);
        }
        else {
            this.emit("login", data);
        }
    }

    esqueceuSenha() {
        //codigo pra chamar em URL
    }    
}

module.exports = Login;