import TinyEmitter from "tiny-emitter";
import Request from "browser-request";

class Agenda extends TinyEmitter {
    constructor(){
        super();
        this.request = Request;
        this.URL = "http://localhost:3333";
    }
}
module.exports = Agenda;