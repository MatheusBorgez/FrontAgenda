const Agenda = require("./agenda.js");
const Template = require("../templates/musculacao.js");
const Menu = require("./menu");

class Musculacao extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    render() {
        this.body.innerHTML = Template.render();
    }
    
}

module.exports = Musculacao;