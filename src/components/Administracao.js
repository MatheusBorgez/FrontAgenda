const Agenda = require("./agenda.js");
const Template = require("../templates/administracao.js");
const Login = require("./login.js");
const CadastroAluno = require("./cadastroAluno.js");

class Administracao extends Agenda {

    constructor(body) {
        super();
        this.body = body;
        this.login = new Login(body);
        this.cadastroAluno = new CadastroAluno(body);
        this.ehEdicao = false;
    }

    render() {
        this.renderGridAlunos();
    }

    addEventListener() {
        this.logout();
        this.clickBotaoSalvar();
        this.clickBotaoAdicionar();
        this.botaoEditar();
        this.clickBotaoExcluir();
        this.botaoPesquisa();
    }

    logout() {
        this.body.querySelector("[botaoShutdown]").onclick = () => document.location.reload(true);
    }

    botaoPesquisa() {
        this.body.querySelector('[botaoBuscar]').onclick = () => this.filtreAlunos();
    }

    clickBotaoExcluir() {
        this.body.querySelector("[botaoExcluir]").onclick = () => this.excluaAluno();
    }    

    clickBotaoSalvar() {

        const form = this.body.querySelector("form");

        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const aluno = this.obtenhaDadosModal(e);
            this.insiraOuEditeAluno(aluno);
        });
    }

    clickBotaoAdicionar() {

        this.body.querySelector("[botaoAdicionar]").onclick = () => this.ehEdicao = false;
    }

    botaoEditar() {

        this.body.querySelector("[botaoEditar]").onclick = () => this.clickBotaoEditar()
    }

    clickBotaoEditar() {

        this.ehEdicao = true;

        let alunosSelecionados = this.obtenhaAlunosSelecionados();

        if (alunosSelecionados.length === 0) {
            return;
        }

        if (alunosSelecionados.length === 1) {            
            this.alunoSelecionado = alunosSelecionados[0].getAttribute("codigoaluno");
            this.cadastroAluno.preenchaModalEdicao(this.alunoSelecionado);
        }
        else {
            alert("Selecione apenas um aluno para edição por favor!");
        }
    }

    filtreAlunos() {

        let termoBusca = this.body.querySelector('[labelBusca]').value;

        if(!termoBusca) {
            this.renderGridAlunos();
            return;
        }

        const opts = {
            method: "GET",
            url: `${this.URL}/administracao/busca/${termoBusca}`,
            crossDomain: true,
            json: true
        };

        this.request(opts, (err, resp, data) => {
            if (err) {
                this.emit("error", "não foi possível carregar os alunos");
            }
            else {
                this.body.innerHTML = Template.render(data.alunos);
                this.addEventListener();
            }
        });
    }

    obtenhaDadosModal(e) {

        const cpf = e.target.querySelector("[cpf]").value;

        const aluno = {
            nome: e.target.querySelector("[nome]").value,
            cpf: cpf,
            telefone: e.target.querySelector("[telefone]").value,
            email: e.target.querySelector("[email]").value,
            endereco: this.monteEndereco(e.target),
            matricula: this.gereMatricula(cpf)
        };

        return aluno;
    }

    insiraOuEditeAluno(aluno) {

        if (this.ehEdicao) {
            this.cadastroAluno.editeAluno(aluno, this.alunoSelecionado);
        }
        else {
            this.cadastroAluno.insiraAluno(aluno);
        }

        $('#modalCadastroAluno').modal('hide');
        this.renderGridAlunos();
    }

    excluaAluno() {

        let alunosSelecionados = this.obtenhaAlunosSelecionados();

        if (alunosSelecionados.length === 0) {
            return;
        }

        if (alunosSelecionados.length === 1) {            
            this.alunoSelecionado = alunosSelecionados[0].getAttribute("codigoaluno");
            this.cadastroAluno.excluaAluno(this.alunoSelecionado);
        }
        else {
            alert("Selecione apenas um aluno para edição por favor!");
        }

        this.renderGridAlunos();
    }

    renderGridAlunos() {
        const opts = {
            method: "GET",
            url: `${this.URL}/administracao`,
            json: true,
            crossDomain: true
        };

        this.request(opts, (err, resp, data) => {
            if (err) {
                this.emit("error", "não foi possível carregar os alunos");
            }
            else {
                this.body.innerHTML = Template.render(data.alunos);
                this.addEventListener();
            }
        });
    }

    obtenhaAlunosSelecionados() {
        
        function estaSelecionado(aluno) {
            return aluno.checked;
        }

        let alunos = Array.prototype.slice.call(this.body.querySelectorAll("[alunoSelecionado]"));
        return alunos.filter(estaSelecionado);
    }

    monteEndereco(target) {
        return target.querySelector("[cidade]").value + "\n" +
            target.querySelector("[bairro]").value + "\n" +
            target.querySelector("[numero]").value + "\n" +
            target.querySelector("[complemento]").value;
    }

    gereMatricula(cpf) {
        const data = new Date();
        const ano = data.getFullYear();
        const segundos = data.getSeconds();
        return ano + cpf.slice(8) + segundos;
    }
}

module.exports = Administracao;