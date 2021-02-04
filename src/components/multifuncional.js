const Agenda = require("./agenda.js");
const Template = require("../templates/multifuncional.js");
const Menu = require("./menu.js");

class Multifuncional extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    render() {
        this.obtenhaHorariosAlunos();
        this.body.innerHTML = Template.render();
    }

    obtenhaHorariosAlunos() {

    }
}

module.exports = Multifuncional;