const Agenda = require("./agenda");
const Template = require("../templates/cadastroAlunoAterrissagem");

class CadastroAlunoAterrissagem extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    render() {
        this.body.innerHTML = Template.render();
    }
}

module.exports = CadastroAluno;