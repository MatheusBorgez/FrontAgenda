const Agenda = require("./agenda.js");
const Template = require("../templates/menu.js");

class Menu extends Agenda {

    constructor(body) {
        super();
        this.body = body;
    }

    render() {
        this.body.innerHTML = Template.render();
        this.addEventListener();
    }

    addEventListener() {
        this.botaoMusculacao();
        this.botaoMultifuncional();
    }

    botaoMusculacao() {
        this.body.querySelector("[botaoEditar]").onclick = () => this.chame()
    }

    botaoMultifuncional() {

    }
}

module.exports = Menu;