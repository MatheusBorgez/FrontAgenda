const Template = require("../templates/multifuncional.js");
const Sala = require("./sala.js");

class Multifuncional extends Sala {
    constructor(body) {
        super();
        this.body = body;
    }
    addEventListener() {

        this.logout();
    }

    logout() {

        this.body.querySelector("[botaoShutdown]").onclick = () => document.location.reload(true);
    }
    render(data) {
        this.body.innerHTML = Template.render();
        this.obtenhaHorariosAlunos(data);
        this.login = data;
    }
}

module.exports = Multifuncional;