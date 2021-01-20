const Agenda = require("./agenda");
const Template = require("../templates/Administracao");

class Administracao extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    render() {
        this.body.innerHTML = Template.render();
    }
}

module.exports = Administracao;