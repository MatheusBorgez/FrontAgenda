const Agenda = require("./agenda");
const Template = require("../templates/cadastroAluno");

class CadastroAluno extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    render() {
        this.body.innerHTML = Template.render();
    }
}

module.exports = CadastroAluno;