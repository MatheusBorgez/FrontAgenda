const Agenda = require("./agenda.js");
const Template = require("../templates/cadastroAluno.js");
const Login = require("./login.js");

class CadastroAluno extends Agenda {
    constructor(body) {
        super();
        this.body = body;
        this.login = new Login(body);
    };

    insiraAluno(aluno) {

        debugger;
        const opts = {
            method: "POST",
            url: `${this.URL}/administracao`,
            json: true,
            body: {
                nome: aluno.nome,                
                cpf: aluno.cpf,
                telefone: aluno.telefone,
                email: aluno.email,
                endereco: aluno.endereco,
                matricula: aluno.matricula
            }
        };

        this.request(opts, ( err, resp, data) => {
            if (resp.status !== 201) {
                alert(err);
                this.emit("alunoNaoInserido", err);
            }
            else {
                this.alert("Aluno inserido com sucesso!");
            }
        });

    };

    editeAluno(aluno) {

    }

    excluaAluno(aluno) {
        
    }

}

module.exports = CadastroAluno;