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

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 201) {
                alert(err);
                this.emit("alunoNaoInserido", err);
            }
            else {
                this.alert("Aluno inserido com sucesso!");
            }
        });

    };

    preenchaModalEdicao(codigoAluno) {
        const aluno = this.carregueDadosAluno(codigoAluno);
        
        this.body.querySelector("[cpf]").value = aluno.cpf;
        this.body.querySelector("[nome]").value = aluno.nome;
        this.body.querySelector("[telefone]").value = aluno.telefone;
        this.body.querySelector("[email]").value = aluno.email;
        //this.body.querySelector(e.target),        
    }

    carregueDadosAluno(codigoAluno) {
        const opts = {
            method: "GET",
            url: `${this.URL}/administracao/${codigoAluno}`,
            json: true,
        }

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 201) {
                alert("Aluno não encontrado");
            }
            else {
                return {
                    nome: data.nome,
                    cpf: data.cpf,
                    telefone: data.telefone,
                    email: data.email,
                    endereco: data.endereco,
                    matricula: data.matricula
                }
            }
        })
    }

    editeAluno(aluno) {

        const opts = {
            method: "PUT",
            url: `${this.URL}/administracao/${aluno.id}`,
            json: true,
            body: {
                id: aluno.id,
                nome: aluno.nome,
                cpf: aluno.cpf,
                telefone: aluno.telefone,
                email: aluno.email,
                endereco: aluno.endereco,
                matricula: aluno.matricula
            }
        };

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 201) {
                alert(err);
                this.emit("alunoNaoInserido", err);
            }
            else {
                this.alert("Aluno editado com sucesso!");
            }
        });

    }

    excluaAluno(aluno) {

    }

}

module.exports = CadastroAluno;