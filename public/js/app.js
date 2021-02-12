(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
// Browser Request
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// UMD HEADER START 
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.returnExports = factory();
  }
}(this, function () {
// UMD HEADER END

var XHR = XMLHttpRequest
if (!XHR) throw new Error('missing XMLHttpRequest')
request.log = {
  'trace': noop, 'debug': noop, 'info': noop, 'warn': noop, 'error': noop
}

var DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

//
// request
//

function request(options, callback) {
  // The entry-point to the API: prep the options object and pass the real work to run_xhr.
  if(typeof callback !== 'function')
    throw new Error('Bad callback given: ' + callback)

  if(!options)
    throw new Error('No options given')

  var options_onResponse = options.onResponse; // Save this for later.

  if(typeof options === 'string')
    options = {'uri':options};
  else
    options = JSON.parse(JSON.stringify(options)); // Use a duplicate for mutating.

  options.onResponse = options_onResponse // And put it back.

  if (options.verbose) request.log = getLogger();

  if(options.url) {
    options.uri = options.url;
    delete options.url;
  }

  if(!options.uri && options.uri !== "")
    throw new Error("options.uri is a required argument");

  if(typeof options.uri != "string")
    throw new Error("options.uri must be a string");

  var unsupported_options = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
  for (var i = 0; i < unsupported_options.length; i++)
    if(options[ unsupported_options[i] ])
      throw new Error("options." + unsupported_options[i] + " is not supported")

  options.callback = callback
  options.method = options.method || 'GET';
  options.headers = options.headers || {};
  options.body    = options.body || null
  options.timeout = options.timeout || request.DEFAULT_TIMEOUT

  if(options.headers.host)
    throw new Error("Options.headers.host is not supported");

  if(options.json) {
    options.headers.accept = options.headers.accept || 'application/json'
    if(options.method !== 'GET')
      options.headers['content-type'] = 'application/json'

    if(typeof options.json !== 'boolean')
      options.body = JSON.stringify(options.json)
    else if(typeof options.body !== 'string')
      options.body = JSON.stringify(options.body)
  }
  
  //BEGIN QS Hack
  var serialize = function(obj) {
    var str = [];
    for(var p in obj)
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    return str.join("&");
  }
  
  if(options.qs){
    var qs = (typeof options.qs == 'string')? options.qs : serialize(options.qs);
    if(options.uri.indexOf('?') !== -1){ //no get params
        options.uri = options.uri+'&'+qs;
    }else{ //existing get params
        options.uri = options.uri+'?'+qs;
    }
  }
  //END QS Hack
  
  //BEGIN FORM Hack
  var multipart = function(obj) {
    //todo: support file type (useful?)
    var result = {};
    result.boundry = '-------------------------------'+Math.floor(Math.random()*1000000000);
    var lines = [];
    for(var p in obj){
        if (obj.hasOwnProperty(p)) {
            lines.push(
                '--'+result.boundry+"\n"+
                'Content-Disposition: form-data; name="'+p+'"'+"\n"+
                "\n"+
                obj[p]+"\n"
            );
        }
    }
    lines.push( '--'+result.boundry+'--' );
    result.body = lines.join('');
    result.length = result.body.length;
    result.type = 'multipart/form-data; boundary='+result.boundry;
    return result;
  }
  
  if(options.form){
    if(typeof options.form == 'string') throw('form name unsupported');
    if(options.method === 'POST'){
        var encoding = (options.encoding || 'application/x-www-form-urlencoded').toLowerCase();
        options.headers['content-type'] = encoding;
        switch(encoding){
            case 'application/x-www-form-urlencoded':
                options.body = serialize(options.form).replace(/%20/g, "+");
                break;
            case 'multipart/form-data':
                var multi = multipart(options.form);
                //options.headers['content-length'] = multi.length;
                options.body = multi.body;
                options.headers['content-type'] = multi.type;
                break;
            default : throw new Error('unsupported encoding:'+encoding);
        }
    }
  }
  //END FORM Hack

  // If onResponse is boolean true, call back immediately when the response is known,
  // not when the full request is complete.
  options.onResponse = options.onResponse || noop
  if(options.onResponse === true) {
    options.onResponse = callback
    options.callback = noop
  }

  // XXX Browsers do not like this.
  //if(options.body)
  //  options.headers['content-length'] = options.body.length;

  // HTTP basic authentication
  if(!options.headers.authorization && options.auth)
    options.headers.authorization = 'Basic ' + b64_enc(options.auth.username + ':' + options.auth.password);

  return run_xhr(options)
}

var req_seq = 0
function run_xhr(options) {
  var xhr = new XHR
    , timed_out = false
    , is_cors = is_crossDomain(options.uri)
    , supports_cors = ('withCredentials' in xhr)

  req_seq += 1
  xhr.seq_id = req_seq
  xhr.id = req_seq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  if(is_cors && !supports_cors) {
    var cors_err = new Error('Browser does not support cross-origin request: ' + options.uri)
    cors_err.cors = 'unsupported'
    return options.callback(cors_err, xhr)
  }

  xhr.timeoutTimer = setTimeout(too_late, options.timeout)
  function too_late() {
    timed_out = true
    var er = new Error('ETIMEDOUT')
    er.code = 'ETIMEDOUT'
    er.duration = options.timeout

    request.log.error('Timeout', { 'id':xhr._id, 'milliseconds':options.timeout })
    return options.callback(er, xhr)
  }

  // Some states can be skipped over, so remember what is still incomplete.
  var did = {'response':false, 'loading':false, 'end':false}

  xhr.onreadystatechange = on_state_change
  xhr.open(options.method, options.uri, true) // asynchronous
  if(is_cors)
    xhr.withCredentials = !! options.withCredentials
  xhr.send(options.body)
  return xhr

  function on_state_change(event) {
    if(timed_out)
      return request.log.debug('Ignoring timed out state change', {'state':xhr.readyState, 'id':xhr.id})

    request.log.debug('State change', {'state':xhr.readyState, 'id':xhr.id, 'timed_out':timed_out})

    if(xhr.readyState === XHR.OPENED) {
      request.log.debug('Request started', {'id':xhr.id})
      for (var key in options.headers)
        xhr.setRequestHeader(key, options.headers[key])
    }

    else if(xhr.readyState === XHR.HEADERS_RECEIVED)
      on_response()

    else if(xhr.readyState === XHR.LOADING) {
      on_response()
      on_loading()
    }

    else if(xhr.readyState === XHR.DONE) {
      on_response()
      on_loading()
      on_end()
    }
  }

  function on_response() {
    if(did.response)
      return

    did.response = true
    request.log.debug('Got response', {'id':xhr.id, 'status':xhr.status})
    clearTimeout(xhr.timeoutTimer)
    xhr.statusCode = xhr.status // Node request compatibility

    // Detect failed CORS requests.
    if(is_cors && xhr.statusCode == 0) {
      var cors_err = new Error('CORS request rejected: ' + options.uri)
      cors_err.cors = 'rejected'

      // Do not process this request further.
      did.loading = true
      did.end = true

      return options.callback(cors_err, xhr)
    }

    options.onResponse(null, xhr)
  }

  function on_loading() {
    if(did.loading)
      return

    did.loading = true
    request.log.debug('Response body loading', {'id':xhr.id})
    // TODO: Maybe simulate "data" events by watching xhr.responseText
  }

  function on_end() {
    if(did.end)
      return

    did.end = true
    request.log.debug('Request done', {'id':xhr.id})

    xhr.body = xhr.responseText
    if(options.json) {
      try        { xhr.body = JSON.parse(xhr.responseText) }
      catch (er) { return options.callback(er, xhr)        }
    }

    options.callback(null, xhr, xhr.body)
  }

} // request

request.withCredentials = false;
request.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;

//
// defaults
//

request.defaults = function(options, requester) {
  var def = function (method) {
    var d = function (params, callback) {
      if(typeof params === 'string')
        params = {'uri': params};
      else {
        params = JSON.parse(JSON.stringify(params));
      }
      for (var i in options) {
        if (params[i] === undefined) params[i] = options[i]
      }
      return method(params, callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  return de
}

//
// HTTP method shortcuts
//

var shortcuts = [ 'get', 'put', 'post', 'head' ];
shortcuts.forEach(function(shortcut) {
  var method = shortcut.toUpperCase();
  var func   = shortcut.toLowerCase();

  request[func] = function(opts) {
    if(typeof opts === 'string')
      opts = {'method':method, 'uri':opts};
    else {
      opts = JSON.parse(JSON.stringify(opts));
      opts.method = method;
    }

    var args = [opts].concat(Array.prototype.slice.apply(arguments, [1]));
    return request.apply(this, args);
  }
})

//
// CouchDB shortcut
//

request.couch = function(options, callback) {
  if(typeof options === 'string')
    options = {'uri':options}

  // Just use the request API to do JSON.
  options.json = true
  if(options.body)
    options.json = options.body
  delete options.body

  callback = callback || noop

  var xhr = request(options, couch_handler)
  return xhr

  function couch_handler(er, resp, body) {
    if(er)
      return callback(er, resp, body)

    if((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
      // The body is a Couch JSON object indicating the error.
      er = new Error('CouchDB error: ' + (body.error.reason || body.error.error))
      for (var key in body)
        er[key] = body[key]
      return callback(er, resp, body);
    }

    return callback(er, resp, body);
  }
}

//
// Utility
//

function noop() {}

function getLogger() {
  var logger = {}
    , levels = ['trace', 'debug', 'info', 'warn', 'error']
    , level, i

  for(i = 0; i < levels.length; i++) {
    level = levels[i]

    logger[level] = noop
    if(typeof console !== 'undefined' && console && console[level])
      logger[level] = formatted(console, level)
  }

  return logger
}

function formatted(obj, method) {
  return formatted_logger

  function formatted_logger(str, context) {
    if(typeof context === 'object')
      str += ' ' + JSON.stringify(context)

    return obj[method].call(obj, str)
  }
}

// Return whether a URL is a cross-domain request.
function is_crossDomain(url) {
  var rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/

  // jQuery #8138, IE may throw an exception when accessing
  // a field from window.location if document.domain has been set
  var ajaxLocation
  try { ajaxLocation = location.href }
  catch (e) {
    // Use the href attribute of an A element since IE will modify it given document.location
    ajaxLocation = document.createElement( "a" );
    ajaxLocation.href = "";
    ajaxLocation = ajaxLocation.href;
  }

  var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || []
    , parts = rurl.exec(url.toLowerCase() )

  var result = !!(
    parts &&
    (  parts[1] != ajaxLocParts[1]
    || parts[2] != ajaxLocParts[2]
    || (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? 80 : 443))
    )
  )

  //console.debug('is_crossDomain('+url+') -> ' + result)
  return result
}

// MIT License from http://phpjs.org/functions/base64_encode:358
function b64_enc (data) {
    // Encodes string using MIME base64 algorithm
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc="", tmp_arr = [];

    if (!data) {
        return data;
    }

    // assume utf8 data
    // data = this.utf8_encode(data+'');

    do { // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = o1<<16 | o2<<8 | o3;

        h1 = bits>>18 & 0x3f;
        h2 = bits>>12 & 0x3f;
        h3 = bits>>6 & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    enc = tmp_arr.join('');

    switch (data.length % 3) {
        case 1:
            enc = enc.slice(0, -2) + '==';
        break;
        case 2:
            enc = enc.slice(0, -1) + '=';
        break;
    }

    return enc;
}
    return request;
//UMD FOOTER START
}));
//UMD FOOTER END

},{}],2:[function(require,module,exports){
function E () {
  // Keep this empty so it's easier to inherit from
  // (via https://github.com/lipsmack from https://github.com/scottcorgan/tiny-emitter/issues/3)
}

E.prototype = {
  on: function (name, callback, ctx) {
    var e = this.e || (this.e = {});

    (e[name] || (e[name] = [])).push({
      fn: callback,
      ctx: ctx
    });

    return this;
  },

  once: function (name, callback, ctx) {
    var self = this;
    function listener () {
      self.off(name, listener);
      callback.apply(ctx, arguments);
    };

    listener._ = callback
    return this.on(name, listener, ctx);
  },

  emit: function (name) {
    var data = [].slice.call(arguments, 1);
    var evtArr = ((this.e || (this.e = {}))[name] || []).slice();
    var i = 0;
    var len = evtArr.length;

    for (i; i < len; i++) {
      evtArr[i].fn.apply(evtArr[i].ctx, data);
    }

    return this;
  },

  off: function (name, callback) {
    var e = this.e || (this.e = {});
    var evts = e[name];
    var liveEvents = [];

    if (evts && callback) {
      for (var i = 0, len = evts.length; i < len; i++) {
        if (evts[i].fn !== callback && evts[i].fn._ !== callback)
          liveEvents.push(evts[i]);
      }
    }

    // Remove event from queue to prevent memory leak
    // Suggested by https://github.com/lazd
    // Ref: https://github.com/scottcorgan/tiny-emitter/commit/c6ebfaa9bc973b33d110a84a307742b7cf94c953#commitcomment-5024910

    (liveEvents.length)
      ? e[name] = liveEvents
      : delete e[name];

    return this;
  }
};

module.exports = E;
module.exports.TinyEmitter = E;

},{}],3:[function(require,module,exports){
const Login = require("./components/login.js");
const Administracao = require("./components/administracao.js");
const Menu = require("./components/menu.js");
const Musculacao = require("./components/musculacao.js");
const Multifuncional = require("./components/multifuncional.js");
const Sala = require("./components/sala.js");

class App {
    constructor(body) {
        this.login = new Login(body);
        this.administracao = new Administracao(body);
        this.menu = new Menu(body);
        this.musculacao = new Musculacao(body);
        this.multifuncional = new Multifuncional(body);
        this.sala = new Sala(body);
    }

    init() {
        this.login.render();
        this.addEventListener();
    }

    addEventListener() {
        this.loginEvents();
        this.administracaoEvents();
    }

    loginEvents() {
        this.login.on("error", () => alert("Usuario ou senha incorretos"));
        this.login.on("loginAdmin", () => this.administracao.render());
        this.login.on("loginAluno", login => this.menu.render(login));
        this.sala.on("loginAluno", login => this.menu.render(login));
        this.login.on("multifuncional", data => this.multifuncional.render(data));
        this.login.on("musculacao", data => this.musculacao.render(data));
        this.login.on("alunoNaoInserido", () => alert("Ops, o aluno não pode ser inserido"));
        this.login.on("alunoInseridoSucesso", () => alert("Aluno inserido com sucesso"));
    }

    administracaoEvents() {
        //this.administracao.on("preenchaGrid", );
    }
}

module.exports = App;

},{"./components/administracao.js":4,"./components/login.js":7,"./components/menu.js":8,"./components/multifuncional.js":9,"./components/musculacao.js":10,"./components/sala.js":11}],4:[function(require,module,exports){
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

        form.addEventListener("submit", e => {
            e.preventDefault();
            const aluno = this.obtenhaDadosModal(e);
            this.insiraOuEditeAluno(aluno);
        });
    }

    clickBotaoAdicionar() {

        this.body.querySelector("[botaoAdicionar]").onclick = () => this.ehEdicao = false;
    }

    botaoEditar() {

        this.body.querySelector("[botaoEditar]").onclick = () => this.clickBotaoEditar();
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
        } else {
            alert("Selecione apenas um aluno para edição por favor!");
        }
    }

    filtreAlunos() {

        let termoBusca = this.body.querySelector('[labelBusca]').value;

        if (!termoBusca) {
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
            } else {
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
        } else {
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
        } else {
            alert("Selecione apenas um aluno para edição por favor!");
        }
    }

    renderGridAlunos() {
        const opts = {
            method: "GET",
            url: `${this.URL}/administracao`,
            json: true
        };

        this.request(opts, (err, resp, data) => {
            if (err) {
                this.emit("error", "não foi possível carregar os alunos");
            } else {
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
        return target.querySelector("[cidade]").value + "\n" + target.querySelector("[bairro]").value + "\n" + target.querySelector("[numero]").value + "\n" + target.querySelector("[complemento]").value;
    }

    gereMatricula(cpf) {
        const data = new Date();
        const ano = data.getFullYear();
        const segundos = data.getSeconds();
        return ano + cpf.slice(8) + segundos;
    }
}

module.exports = Administracao;

},{"../templates/administracao.js":12,"./agenda.js":5,"./cadastroAluno.js":6,"./login.js":7}],5:[function(require,module,exports){
const TinyEmitter = require("tiny-emitter");
const Request = require("browser-request");

class Agenda extends TinyEmitter {
    constructor() {
        super();
        this.request = Request;
        this.URL = "http://localhost:3333";
    }
}
module.exports = Agenda;

},{"browser-request":1,"tiny-emitter":2}],6:[function(require,module,exports){
const Agenda = require("./agenda.js");
const Template = require("../templates/cadastroAluno.js");
const Login = require("./login.js");

class CadastroAluno extends Agenda {
    constructor(body) {
        super();
        this.body = body;
        this.login = new Login(body);
    }

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
            } else {
                this.alert("Aluno inserido com sucesso!");
            }
        });
    }

    preenchaModalEdicao(codigoAluno) {

        const opts = {
            method: "GET",
            url: `${this.URL}/administracao/${codigoAluno}`,
            json: true
        };

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 200) {
                alert("Aluno não encontrado");
                return;
            } else {

                const aluno = {
                    nome: data.nome,
                    cpf: data.cpf,
                    telefone: data.telefone,
                    email: data.email,
                    endereco: data.endereco,
                    matricula: data.matricula
                };

                this.body.querySelector("[cpf]").value = aluno.cpf;
                this.body.querySelector("[nome]").value = aluno.nome;
                this.body.querySelector("[telefone]").value = aluno.telefone;
                this.body.querySelector("[email]").value = aluno.email;
                this.monteEndereco(aluno.endereco);

                $('#modalCadastroAluno').modal('show');
            }
        });
    }

    monteEndereco(endereco) {

        let arrayEndereco = endereco.split('\n');

        this.body.querySelector("[cidade]").value = arrayEndereco[0];
        this.body.querySelector("[bairro]").value = arrayEndereco[1];
        this.body.querySelector("[numero]").value = arrayEndereco[2];
        this.body.querySelector("[complemento]").value = arrayEndereco[3];
    }

    editeAluno(aluno, id) {

        const opts = {
            method: "PUT",
            url: `${this.URL}/administracao/${id}`,
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
            } else {
                alert("Aluno editado com sucesso!");
            }
        });

        this.disposeModal();
    }

    excluaAluno(idAluno) {
        const opts = {
            method: "DELETE",
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            url: `${this.URL}/administracao/${idAluno}`,
            json: true
        };

        //res.setHeader('Access-Control-Allow-Origin', '*');

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 201) {
                alert(err);
                this.emit("alunoNaoInserido", err);
            } else {
                alert("Aluno excluído com sucesso!");
            }
        });
    }

    disposeModal() {

        this.body.querySelector("[cpf]").value = "";
        this.body.querySelector("[nome]").value = "";
        this.body.querySelector("[telefone]").value = "";
        this.body.querySelector("[email]").value = "";
        this.body.querySelector("[cidade]").value = "";
        this.body.querySelector("[bairro]").value = "";
        this.body.querySelector("[numero]").value = "";
        this.body.querySelector("[complemento]").value = "";

        $('#modalCadastroAluno').modal('hide');
    }

}

module.exports = CadastroAluno;

},{"../templates/cadastroAluno.js":13,"./agenda.js":5,"./login.js":7}],7:[function(require,module,exports){
const Agenda = require("./agenda.js");
const Template = require("../templates/login.js");

class Login extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    render() {
        this.body.innerHTML = Template.render();
        this.body.querySelector("[usuario]").focus();
        this.addEventListener();
    }

    addEventListener() {
        this.envieFormulario();
        this.esqueceuSenha();
    }

    envieFormulario() {
        const form = this.body.querySelector("form");

        form.addEventListener("submit", e => {
            e.preventDefault();
            const usuario = e.target.querySelector("[usuario]");
            const senha = e.target.querySelector("[senha]");
            this.autentiqueUsuario(usuario, senha);
        });
    }

    autentiqueUsuario(usuario, senha) {
        const opts = {
            method: "POST",
            url: `${this.URL}/Login`,
            json: true,
            body: {
                login: usuario.value,
                senha: senha.value
            }
        };

        this.request(opts, (err, resp, data) => {

            this.logaUsuario(resp, err, data);
        });
    }

    logaUsuario(resp, err, data) {

        if (resp.status !== 200) {
            this.emit("error", err);
        } else {

            if (data.admin) {
                this.emit("loginAdmin", data);
            } else {
                this.emit("loginAluno", data.login);
            }
        }
    }

    esqueceuSenha() {
        //codigo pra chamar em URL
    }
}

module.exports = Login;

},{"../templates/login.js":15,"./agenda.js":5}],8:[function(require,module,exports){
const Agenda = require("./agenda.js");
const Template = require("../templates/menu.js");
const Multifuncional = require("./multifuncional.js");
const Musculacao = require("./musculacao.js");

class Menu extends Agenda {

    constructor(body) {
        super();
        this.body = body;
        this.musculacao = new Musculacao(body);
        this.multifuncional = new Multifuncional(body);
    }

    render(login) {
        this.body.innerHTML = Template.render(login);
        this.obtenhaCodigoAluno(login);
        this.addEventListener();
    }

    addEventListener() {
        this.botaoMusculacao();
        this.botaoMultifuncional();
        this.logout();
    }

    logout() {
        this.body.querySelector("[botaoshutdown]").onclick = () => document.location.reload(true);
    }

    obtenhaCodigoAluno(login) {

        this.login = login;

        const opts = {
            method: "GET",
            url: `${this.URL}/menu/${login}`,
            json: true
        };

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 200) {
                alert("Aluno não encontrado");
                return;
            } else {
                this.codigoAluno = data.id;
            }
        });
    }

    botaoMusculacao() {
        this.body.querySelector("[botaoMusculacao]").onclick = () => this.renderMusculacao();
    }

    renderMusculacao() {

        const data = {
            idAluno: this.codigoAluno,
            sala: "musculacao",
            login: this.login
        };

        this.musculacao.render(data);
    }

    botaoMultifuncional() {
        this.body.querySelector("[botaoMultifuncional]").onclick = () => this.renderMultifuncional();
    }

    renderMultifuncional() {

        const data = {
            idAluno: this.codigoAluno,
            sala: "multifuncional"
        };

        this.multifuncional.render(data);
    }
}

module.exports = Menu;

},{"../templates/menu.js":16,"./agenda.js":5,"./multifuncional.js":9,"./musculacao.js":10}],9:[function(require,module,exports){
const Template = require("../templates/multifuncional.js");
const Sala = require("./sala.js");

class Multifuncional extends Sala {
    constructor(body) {
        super();
        this.body = body;
    }

    render(data) {
        this.body.innerHTML = Template.render();
        this.obtenhaHorariosAlunos(data);
        this.login = data;
        this.addEventListener();
    }
}

module.exports = Multifuncional;

},{"../templates/multifuncional.js":17,"./sala.js":11}],10:[function(require,module,exports){
const Template = require("../templates/musculacao.js");
const Sala = require("./sala.js");

class Musculacao extends Sala {
    constructor(body) {
        super();
        this.body = body;
    }

    render(data) {
        this.body.innerHTML = Template.render();
        this.obtenhaHorariosAlunos(data);
        this.user = data;
        this.addEventListener();
    }

}

module.exports = Musculacao;

},{"../templates/musculacao.js":18,"./sala.js":11}],11:[function(require,module,exports){
const Agenda = require("./agenda.js");
const Login = require("./login.js");

class Sala extends Agenda {
    constructor(body) {
        super();
        this.body = body;
        this.login = new Login(body);
    }

    addEventListener() {
        this.botaoConfirmar();
        this.botaoCancelar();
        this.logout();
    }

    logout() {
        this.body.querySelector("[botaoShutdown]").onclick = () => document.location.reload(true);
    }

    obtenhaHorariosAlunos(login) {
        const opts = {
            method: "GET",
            url: `${this.URL}/sala/${login.idAluno}/${login.sala}`,
            json: true
        };

        this.request(opts, (err, resp, data) => {
            this.atualizeDropDowns(data.horarios);
        });
    }

    atualizeDropDowns(horarios) {

        if (horarios) {

            let dropDownHorarios = Array.prototype.slice.call(this.body.querySelectorAll("[selecaoHorario]"));

            for (let index = 0; index < dropDownHorarios.length; index++) {

                dropDownHorarios[index].value = horarios[index].faixaHorario;
            }
        }
    }

    botaoConfirmar(data) {
        this.body.querySelector("[botaoConfirmar]").onclick = () => this.insireOuAtualizeHorario(this.user);
    }

    botaoCancelar() {
        this.body.querySelector("[botaoCancelar]").onclick = () => document.location.reload(true);
    }

    insireOuAtualizeHorario(login) {

        let dropDownHorarios = Array.prototype.slice.call(this.body.querySelectorAll("[selecaoHorario]"));
        let diasSemana = Array.prototype.slice.call(this.body.querySelectorAll("[diaSemana]"));

        var opts = {
            method: "POST",
            url: `${this.URL}/sala`,
            json: true,
            body: {
                faixaHorario: "",
                idAluno: login.idAluno,
                diaSemana: "",
                sala: login.sala
            }
        };

        for (let index = 0; index < dropDownHorarios.length; index++) {

            opts.body.faixaHorario = dropDownHorarios[index].value;
            opts.body.diaSemana = diasSemana[index].getAttribute('diasemana');

            this.request(opts, (err, resp, data) => {
                if (resp.status !== 201) {
                    return this.emit("alunoNaoInserido", err);
                }
            });
        }
    }
}

module.exports = Sala;

},{"./agenda.js":5,"./login.js":7}],12:[function(require,module,exports){
const ModalCadastroAluno = require("./cadastroAluno.js");

const renderGridAlunos = alunos => {
    return alunos.map(aluno => {

        let corLinha = aluno.id % 2 === 0 ? "back-gridrow1" : "back-gridrow2";

        return `
        <div class="row ${corLinha} text-dark">            
            <div class="col-sm">
                <div class="form-group form-check">
                    <input type="checkbox" class="form-check-input mt-4" alunoSelecionado codigoAluno=${aluno.id}>
                </div>
                <label class="text-center mb-2">${aluno.nome}</label>
            </div>
        
            <div class="col-sm ">
                <label class="text-center mt-3">${aluno.cpf}</label>
            </div>
        
            <div class="col-sm ">
                <label class="text-center mt-3">${aluno.matricula}</label>
            </div>        
        </div>`;
    }).join("");
};

exports.render = alunos => {

    return `

    <div class="img-fluid text-right mr-5 mt-5 text-white botaoShutdown" botaoShutdown>
        <a href="#"><img src="./images/shutdown.png" alt=""></a>
        <strong class="mr-1">Sair</strong>
    </div>
    
    <div class="container">
        <div>
            <span class="login100-form-title p-b-43 p-2 mt-2">
                Área Administrativa
            </span>
        </div>
    </div>

    <div class="container">
    <div class="row ">
                <div class="col-sm">
                    <div id="divBusca" class="busca" busca >
                        <input type="search" id="txtBusca" placeholder="Buscar..." labelBusca />
                        <a class="" href="#">
                            <img src="./images/pesquisa.png" id="btnBusca" alt="Buscar" botaoBuscar />
                        </a>
                    </div>
                </div>
            </div>
    
        <div class="row  border border-white back-grid text-white">
            <div class="col-sm text-center">
                Nome
            </div>

            <div class="col-sm text-center">
                CPF
            </div>

            <div class="col-sm text-center">
                Matrícula
            </div>
        </div>

        ${renderGridAlunos(alunos)}

        <div class="container col-sm mt-3">
            <div class="row">
                <div class="centered">
                                
                    <button type="button" class="btn btn-primary btn-dark" data-toggle="modal" data-target="#modalCadastroAluno" botaoAdicionar>
                        Adicionar
                    </button>

                    <button type="button" class="btn btn-dark" botaoEditar>
                        Editar
                    </button>

                    <button type="button" class="btn btn-dark" botaoExcluir>
                        Excluir
                    </button>

                    ${ModalCadastroAluno.render()}
                    
                </div>
            </div>
        </div>
    </div>    
    `;
};

},{"./cadastroAluno.js":13}],13:[function(require,module,exports){
const inputEndereco = `
                    <div class="row">
                        <div class="col-sm">
                            <label for="cidade">Cidade</label>
                            <input class="border border-dark" type="text" required cidade/>
                        </div>
                        
                        <div class="col-sm">
                            <label for="bairro">Bairro</label>
                            <input class="border border-dark" type="text" required bairro/>
                        </div>
                    </div>

                    <div class="row">                    
                        <div class="col-sm">
                            <label for="numero">Número</label>
                            <input class="border border-dark" type="text" required numero/>
                        </div>

                        <div class="col-sm">
                            <label for="complemento">Logradouro</label>
                            <input class="border border-dark" type="text" complemento/>
                        </div>
                    </div>

`;

const modalCadastroAluno = `
<div class="modal fade" id="modalCadastroAluno" tabindex="-1" role="dialog" aria-labelledby="tituloModal" aria-hidden="true" modal>
    <div class="modal-dialog modal-dialog-centered" role="document" >
        <div class="modal-content">
            
            <div class="modal-header">
                <h5 class="modal-title" id="tituloModal">Adicionar Novo Aluno</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Fechar">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            
            <form>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-sm">
                            <label>Nome Completo</label>
                            <input class="border border-dark col-sm" nome>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-sm" id="include_date">
                            <label>Data de Nascimento</label>
                            <input class="border border-dark col-sm" dataNascimento>
                        </div>
                        <div class="col-sm">
                            <label for="cpf">CPF</label>
                            <input id="cpf" type="text" autocomplete="off" class="border border-dark" cpf>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-sm">
                            <label for="tel">Telefone</label>
                            <input id="tel" type="text" autocomplete="off" class="border border-dark" telefone>
                        </div>
                        <div class="col-sm">
                            <label for="email">E-mail</label>
                            <input id="email" type="text" class="border border-dark" email>
                        </div>
                    </div>                    

                    ${inputEndereco}

                </div>
                    
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Fechar</button>
                    <button type="submit" class="btn btn-primary" botaoSalvar>Salvar</button>
                </div>
            </form>
        </div>
    </div>
</div>
`;

exports.render = () => {
    return modalCadastroAluno;
};

},{}],14:[function(require,module,exports){
const dropDownHorario = `
<div class="form-group col-sm ">
    <label for="select-hour">Selecione o horário</label>
    <select class="form-control " selecaoHorario>
        <option>07:00 - 07:30</option>                      
        <option>07:40 - 08:10</option>
        <option>08:20 - 08:50</option>
        <option>09:00 - 09:30</option>
        <option>09:40 - 10:10</option>
        <option>10:20 - 10:50</option>
        <option>11:00 - 11:30</option>
        <option>11:40 - 12:10</option>
        <option>12:20 - 12:50</option>
        <option>13:00 - 13:30</option>
        <option>13:40 - 14:10</option>
        <option>14:20 - 14:50</option>
        <option>15:00 - 15:30</option>
        <option>15:40 - 16:10</option>
        <option>16:20 - 16:50</option>
        <option>17:00 - 17:30</option>
        <option>17:40 - 18:10</option>
        <option>18:20 - 18:50</option>
        <option>19:00 - 19:30</option>
        <option>19:40 - 20:10</option>
        <option>20:20 - 20:50</option>
    </select>
</div>
`;

exports.render = horarios => {
    return `
<div class="container  border border-dark  mt-5 col-6">
    <div class="row ">

        <div class="col-sm text-xl-center back-grid text-white">
            Selecione um horário para cada dia da semana:
        </div>

    </div>
</div>

<div class="mb-3">
    <div class="container border border-dark back-gridrow1 text-dark col-6">
        <div class="row ">

            <div class="col-sm mt-4" diaSemana="segunda">
                Segunda-feira:
            </div>
            
            ${dropDownHorario}
            
        </div>
    </div>
    
    <div class="container col-6 border border-dark back-gridrow2 text-dark">
        <div class="row">

            <div class="col-sm" diaSemana="terca">
                Terça-feira:
            </div>

            ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow1 text-dark">
        <div class="row">

            <div class="col-sm" diaSemana="quarta">
                Quarta-feira:
            </div>

           ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow2 text-dark">
        <div class="row">

            <div class="col-sm" diaSemana="quinta">
                Quinta-feira:
            </div>

            ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow1 text-dark">
        <div class="row">

            <div class="col-sm" diaSemana="sexta">
                Sexta-feira:
            </div>
            
            ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow2 text-dark">
        <div class="row">

            <div class="col-6" diaSemana="sabado">
                Sábado:
            </div>

            ${dropDownHorario}

        </div>
    </div>
</div>


<div class=" container col-sm">
    <div class="row">
        <div class="centered">

            <button type="submit" class="btn btn-dark" botaoConfirmar>
                Confirmar
             </button>

            <button type="button" class="btn btn-dark ml-5" botaoCancelar>
                Cancelar
            </button>

        </div>

    </div>
</div>

<p class="text-center text-white font-italic p-3">**Caso algum horário atinja a lotação máxima de alunos, o <br> horário ficará em vermelho e não poderá ser selecionado.</p>

    `;
};

},{}],15:[function(require,module,exports){
exports.render = () => {
    return ` <body>
    <label class="login100-form-title p-b-43 p-t-80">Acesso da Conta</label>
    <div class="card" id="telaLogin">       
        <main>        
            <div class="card-body">
                <form>
                    <div class="form-group rs1 validate-input" data-validate="Campo obrigatório">
                        <input type="text" class="form-control" id="" placeholder="Usuário" usuario>
                    </div>


                    <div class="form-group rs2 validate-input" data-validate="Campo obrigatório">
                        <input type="password" class="form-control" id="" placeholder="Senha" senha>
                    </div>

                    <button type="submit" class="btn btn-primary btn btn-outline-dark btn-lg btn-block" botaoLogin>Entrar</button>
                    <div class="text-center w-full p-t-23">
                        <a href="#" class="text-secondary">
		    					Esqueceu a Senha? Entre em Contato Conosco Clicando Aqui.
		    				</a>
                    </div>
                </form>
            </div>
        </main>
        <footer></footer>
    </div>
</body>
<script src="https://code.jquery.com/jquery-3.3.1.slim.min.js" integrity="sha384-q8i/X+965DzO0rT7abK41JStQIAqVgRVzpbzo5smXKp4YfRvH+8abtTE1Pi6jizo" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>`;
};

},{}],16:[function(require,module,exports){
exports.render = login => {
    return `

    <div cpfAluno=${login}></div>
    <div class="limiter">

        <div class="img-fluid text-right mr-5 mt-5 text-white botaoShutdown" botaoShutdown>
            <a href="#"><img src="./images/shutdown.png" alt=""></a>
            <strong class="mr-1">Sair</strong>
        </div>


        <div class="container-login100">
            <div class="wrap-login100 p-b-160 p-t-50">

                <span class="login100-form-title p-b-43">
                    Selecione uma sala para fazer a marcação das aulas
                </span>

                <div class="container-menu100-btn">
                    <button class="menu100-form-btn2" botaoMusculacao>
                            Musculação                            
                    </button>
                </div>

            <div class="container-menu100-btn">
                <button class="menu100-form-btn1" botaoMultifuncional>
                        Multifuncional
                    </a>
                    </button>
            </div>

        </div>
    </div>
</div>
`;
};

},{}],17:[function(require,module,exports){
const GridMarcacao = require('./gridMarcacao.js');

exports.render = () => {
    return `
    <div class="container ">
    <div class="img-fluid text-right mr-5 mt-5 text-white botaoShutdown" botaoShutdown>
    <a href="#"><img src="./images/shutdown.png" alt=""></a>
    <strong class="mr-1">Sair</strong>
</div>
    <div>
        <span class="login100-form-title p-b-43 p-2">
            Sala Multifuncional                    
        </span>
    </div>
</div>

${GridMarcacao.render()}

`;
};

},{"./gridMarcacao.js":14}],18:[function(require,module,exports){
const GridMarcacao = require('./gridMarcacao.js');

exports.render = horarios => {
    return `
    <div class="container ">
    <div class="img-fluid text-right mr-5 mt-5 text-white botaoShutdown" botaoShutdown>
    <a href="#"><img src="./images/shutdown.png" alt=""></a>
    <strong class="mr-1">Sair</strong>
</div>
    <div>
        <span class="login100-form-title p-b-43 p-2">
            Sala Musculacao                    
        </span>
    </div>
</div>

${GridMarcacao.render(horarios)}

`;
};

},{"./gridMarcacao.js":14}],19:[function(require,module,exports){
const App = require("./app.js");

window.onload = () => {
    const main = document.querySelector("main");
    new App(main).init();
};

},{"./app.js":3}]},{},[19])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXF1ZXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RpbnktZW1pdHRlci9pbmRleC5qcyIsInNyYy9hcHAuanMiLCJzcmMvY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzIiwic3JjL2NvbXBvbmVudHMvYWdlbmRhLmpzIiwic3JjL2NvbXBvbmVudHMvY2FkYXN0cm9BbHVuby5qcyIsInNyYy9jb21wb25lbnRzL2xvZ2luLmpzIiwic3JjL2NvbXBvbmVudHMvbWVudS5qcyIsInNyYy9jb21wb25lbnRzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL2NvbXBvbmVudHMvbXVzY3VsYWNhby5qcyIsInNyYy9jb21wb25lbnRzL3NhbGEuanMiLCJzcmMvdGVtcGxhdGVzL2FkbWluaXN0cmFjYW8uanMiLCJzcmMvdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanMiLCJzcmMvdGVtcGxhdGVzL2dyaWRNYXJjYWNhby5qcyIsInNyYy90ZW1wbGF0ZXMvbG9naW4uanMiLCJzcmMvdGVtcGxhdGVzL21lbnUuanMiLCJzcmMvdGVtcGxhdGVzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL3RlbXBsYXRlcy9tdXNjdWxhY2FvLmpzIiwiaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBLE1BQU0sUUFBUSxRQUFRLHVCQUFSLENBQWQ7QUFDQSxNQUFNLGdCQUFnQixRQUFRLCtCQUFSLENBQXRCO0FBQ0EsTUFBTSxPQUFPLFFBQVEsc0JBQVIsQ0FBYjtBQUNBLE1BQU0sYUFBYSxRQUFRLDRCQUFSLENBQW5CO0FBQ0EsTUFBTSxp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QUFhLE1BQWIsRUFBc0I7O0NBYnBCO0FBZ0JILENBakJEOzs7QUNGQSxNQUFNLGVBQWUsUUFBUSxtQkFBUixDQUFyQjs7QUFFQSxRQUFRLE1BQVIsR0FBaUIsWUFBWTtBQUN6QixXQUFROzs7Ozs7Ozs7Ozs7O0VBYVYsYUFBYSxNQUFiLENBQW9CLFFBQXBCLENBQThCOztDQWI1QjtBQWdCSCxDQWpCRDs7O0FDRkEsTUFBTSxNQUFNLFFBQVEsVUFBUixDQUFaOztBQUVBLE9BQU8sTUFBUCxHQUFnQixNQUFNO0FBQ2xCLFVBQU0sT0FBTyxTQUFTLGFBQVQsQ0FBdUIsTUFBdkIsQ0FBYjtBQUNBLFFBQUksR0FBSixDQUFRLElBQVIsRUFBYyxJQUFkO0FBQ0gsQ0FIRCIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8vIEJyb3dzZXIgUmVxdWVzdFxyXG4vL1xyXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xyXG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXHJcbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxyXG4vL1xyXG4vLyAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXHJcbi8vXHJcbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcclxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxyXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cclxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxyXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cclxuXHJcbi8vIFVNRCBIRUFERVIgU1RBUlQgXHJcbihmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSkge1xyXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xyXG4gICAgICAgIC8vIEFNRC4gUmVnaXN0ZXIgYXMgYW4gYW5vbnltb3VzIG1vZHVsZS5cclxuICAgICAgICBkZWZpbmUoW10sIGZhY3RvcnkpO1xyXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICAvLyBOb2RlLiBEb2VzIG5vdCB3b3JrIHdpdGggc3RyaWN0IENvbW1vbkpTLCBidXRcclxuICAgICAgICAvLyBvbmx5IENvbW1vbkpTLWxpa2UgZW52aXJvbWVudHMgdGhhdCBzdXBwb3J0IG1vZHVsZS5leHBvcnRzLFxyXG4gICAgICAgIC8vIGxpa2UgTm9kZS5cclxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gQnJvd3NlciBnbG9iYWxzIChyb290IGlzIHdpbmRvdylcclxuICAgICAgICByb290LnJldHVybkV4cG9ydHMgPSBmYWN0b3J5KCk7XHJcbiAgfVxyXG59KHRoaXMsIGZ1bmN0aW9uICgpIHtcclxuLy8gVU1EIEhFQURFUiBFTkRcclxuXHJcbnZhciBYSFIgPSBYTUxIdHRwUmVxdWVzdFxyXG5pZiAoIVhIUikgdGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIFhNTEh0dHBSZXF1ZXN0JylcclxucmVxdWVzdC5sb2cgPSB7XHJcbiAgJ3RyYWNlJzogbm9vcCwgJ2RlYnVnJzogbm9vcCwgJ2luZm8nOiBub29wLCAnd2Fybic6IG5vb3AsICdlcnJvcic6IG5vb3BcclxufVxyXG5cclxudmFyIERFRkFVTFRfVElNRU9VVCA9IDMgKiA2MCAqIDEwMDAgLy8gMyBtaW51dGVzXHJcblxyXG4vL1xyXG4vLyByZXF1ZXN0XHJcbi8vXHJcblxyXG5mdW5jdGlvbiByZXF1ZXN0KG9wdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgLy8gVGhlIGVudHJ5LXBvaW50IHRvIHRoZSBBUEk6IHByZXAgdGhlIG9wdGlvbnMgb2JqZWN0IGFuZCBwYXNzIHRoZSByZWFsIHdvcmsgdG8gcnVuX3hoci5cclxuICBpZih0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhZCBjYWxsYmFjayBnaXZlbjogJyArIGNhbGxiYWNrKVxyXG5cclxuICBpZighb3B0aW9ucylcclxuICAgIHRocm93IG5ldyBFcnJvcignTm8gb3B0aW9ucyBnaXZlbicpXHJcblxyXG4gIHZhciBvcHRpb25zX29uUmVzcG9uc2UgPSBvcHRpb25zLm9uUmVzcG9uc2U7IC8vIFNhdmUgdGhpcyBmb3IgbGF0ZXIuXHJcblxyXG4gIGlmKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJylcclxuICAgIG9wdGlvbnMgPSB7J3VyaSc6b3B0aW9uc307XHJcbiAgZWxzZVxyXG4gICAgb3B0aW9ucyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0aW9ucykpOyAvLyBVc2UgYSBkdXBsaWNhdGUgZm9yIG11dGF0aW5nLlxyXG5cclxuICBvcHRpb25zLm9uUmVzcG9uc2UgPSBvcHRpb25zX29uUmVzcG9uc2UgLy8gQW5kIHB1dCBpdCBiYWNrLlxyXG5cclxuICBpZiAob3B0aW9ucy52ZXJib3NlKSByZXF1ZXN0LmxvZyA9IGdldExvZ2dlcigpO1xyXG5cclxuICBpZihvcHRpb25zLnVybCkge1xyXG4gICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVybDtcclxuICAgIGRlbGV0ZSBvcHRpb25zLnVybDtcclxuICB9XHJcblxyXG4gIGlmKCFvcHRpb25zLnVyaSAmJiBvcHRpb25zLnVyaSAhPT0gXCJcIilcclxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIGlzIGEgcmVxdWlyZWQgYXJndW1lbnRcIik7XHJcblxyXG4gIGlmKHR5cGVvZiBvcHRpb25zLnVyaSAhPSBcInN0cmluZ1wiKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy51cmkgbXVzdCBiZSBhIHN0cmluZ1wiKTtcclxuXHJcbiAgdmFyIHVuc3VwcG9ydGVkX29wdGlvbnMgPSBbJ3Byb3h5JywgJ19yZWRpcmVjdHNGb2xsb3dlZCcsICdtYXhSZWRpcmVjdHMnLCAnZm9sbG93UmVkaXJlY3QnXVxyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdW5zdXBwb3J0ZWRfb3B0aW9ucy5sZW5ndGg7IGkrKylcclxuICAgIGlmKG9wdGlvbnNbIHVuc3VwcG9ydGVkX29wdGlvbnNbaV0gXSlcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy5cIiArIHVuc3VwcG9ydGVkX29wdGlvbnNbaV0gKyBcIiBpcyBub3Qgc3VwcG9ydGVkXCIpXHJcblxyXG4gIG9wdGlvbnMuY2FsbGJhY2sgPSBjYWxsYmFja1xyXG4gIG9wdGlvbnMubWV0aG9kID0gb3B0aW9ucy5tZXRob2QgfHwgJ0dFVCc7XHJcbiAgb3B0aW9ucy5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xyXG4gIG9wdGlvbnMuYm9keSAgICA9IG9wdGlvbnMuYm9keSB8fCBudWxsXHJcbiAgb3B0aW9ucy50aW1lb3V0ID0gb3B0aW9ucy50aW1lb3V0IHx8IHJlcXVlc3QuREVGQVVMVF9USU1FT1VUXHJcblxyXG4gIGlmKG9wdGlvbnMuaGVhZGVycy5ob3N0KVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiT3B0aW9ucy5oZWFkZXJzLmhvc3QgaXMgbm90IHN1cHBvcnRlZFwiKTtcclxuXHJcbiAgaWYob3B0aW9ucy5qc29uKSB7XHJcbiAgICBvcHRpb25zLmhlYWRlcnMuYWNjZXB0ID0gb3B0aW9ucy5oZWFkZXJzLmFjY2VwdCB8fCAnYXBwbGljYXRpb24vanNvbidcclxuICAgIGlmKG9wdGlvbnMubWV0aG9kICE9PSAnR0VUJylcclxuICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG5cclxuICAgIGlmKHR5cGVvZiBvcHRpb25zLmpzb24gIT09ICdib29sZWFuJylcclxuICAgICAgb3B0aW9ucy5ib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5qc29uKVxyXG4gICAgZWxzZSBpZih0eXBlb2Ygb3B0aW9ucy5ib2R5ICE9PSAnc3RyaW5nJylcclxuICAgICAgb3B0aW9ucy5ib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5ib2R5KVxyXG4gIH1cclxuICBcclxuICAvL0JFR0lOIFFTIEhhY2tcclxuICB2YXIgc2VyaWFsaXplID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICB2YXIgc3RyID0gW107XHJcbiAgICBmb3IodmFyIHAgaW4gb2JqKVxyXG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XHJcbiAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdKSk7XHJcbiAgICAgIH1cclxuICAgIHJldHVybiBzdHIuam9pbihcIiZcIik7XHJcbiAgfVxyXG4gIFxyXG4gIGlmKG9wdGlvbnMucXMpe1xyXG4gICAgdmFyIHFzID0gKHR5cGVvZiBvcHRpb25zLnFzID09ICdzdHJpbmcnKT8gb3B0aW9ucy5xcyA6IHNlcmlhbGl6ZShvcHRpb25zLnFzKTtcclxuICAgIGlmKG9wdGlvbnMudXJpLmluZGV4T2YoJz8nKSAhPT0gLTEpeyAvL25vIGdldCBwYXJhbXNcclxuICAgICAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJpKycmJytxcztcclxuICAgIH1lbHNleyAvL2V4aXN0aW5nIGdldCBwYXJhbXNcclxuICAgICAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJpKyc/JytxcztcclxuICAgIH1cclxuICB9XHJcbiAgLy9FTkQgUVMgSGFja1xyXG4gIFxyXG4gIC8vQkVHSU4gRk9STSBIYWNrXHJcbiAgdmFyIG11bHRpcGFydCA9IGZ1bmN0aW9uKG9iaikge1xyXG4gICAgLy90b2RvOiBzdXBwb3J0IGZpbGUgdHlwZSAodXNlZnVsPylcclxuICAgIHZhciByZXN1bHQgPSB7fTtcclxuICAgIHJlc3VsdC5ib3VuZHJ5ID0gJy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0nK01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSoxMDAwMDAwMDAwKTtcclxuICAgIHZhciBsaW5lcyA9IFtdO1xyXG4gICAgZm9yKHZhciBwIGluIG9iail7XHJcbiAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xyXG4gICAgICAgICAgICBsaW5lcy5wdXNoKFxyXG4gICAgICAgICAgICAgICAgJy0tJytyZXN1bHQuYm91bmRyeStcIlxcblwiK1xyXG4gICAgICAgICAgICAgICAgJ0NvbnRlbnQtRGlzcG9zaXRpb246IGZvcm0tZGF0YTsgbmFtZT1cIicrcCsnXCInK1wiXFxuXCIrXHJcbiAgICAgICAgICAgICAgICBcIlxcblwiK1xyXG4gICAgICAgICAgICAgICAgb2JqW3BdK1wiXFxuXCJcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBsaW5lcy5wdXNoKCAnLS0nK3Jlc3VsdC5ib3VuZHJ5KyctLScgKTtcclxuICAgIHJlc3VsdC5ib2R5ID0gbGluZXMuam9pbignJyk7XHJcbiAgICByZXN1bHQubGVuZ3RoID0gcmVzdWx0LmJvZHkubGVuZ3RoO1xyXG4gICAgcmVzdWx0LnR5cGUgPSAnbXVsdGlwYXJ0L2Zvcm0tZGF0YTsgYm91bmRhcnk9JytyZXN1bHQuYm91bmRyeTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfVxyXG4gIFxyXG4gIGlmKG9wdGlvbnMuZm9ybSl7XHJcbiAgICBpZih0eXBlb2Ygb3B0aW9ucy5mb3JtID09ICdzdHJpbmcnKSB0aHJvdygnZm9ybSBuYW1lIHVuc3VwcG9ydGVkJyk7XHJcbiAgICBpZihvcHRpb25zLm1ldGhvZCA9PT0gJ1BPU1QnKXtcclxuICAgICAgICB2YXIgZW5jb2RpbmcgPSAob3B0aW9ucy5lbmNvZGluZyB8fCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gZW5jb2Rpbmc7XHJcbiAgICAgICAgc3dpdGNoKGVuY29kaW5nKXtcclxuICAgICAgICAgICAgY2FzZSAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJzpcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IHNlcmlhbGl6ZShvcHRpb25zLmZvcm0pLnJlcGxhY2UoLyUyMC9nLCBcIitcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnbXVsdGlwYXJ0L2Zvcm0tZGF0YSc6XHJcbiAgICAgICAgICAgICAgICB2YXIgbXVsdGkgPSBtdWx0aXBhcnQob3B0aW9ucy5mb3JtKTtcclxuICAgICAgICAgICAgICAgIC8vb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddID0gbXVsdGkubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5ib2R5ID0gbXVsdGkuYm9keTtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBtdWx0aS50eXBlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQgOiB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIGVuY29kaW5nOicrZW5jb2RpbmcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbiAgLy9FTkQgRk9STSBIYWNrXHJcblxyXG4gIC8vIElmIG9uUmVzcG9uc2UgaXMgYm9vbGVhbiB0cnVlLCBjYWxsIGJhY2sgaW1tZWRpYXRlbHkgd2hlbiB0aGUgcmVzcG9uc2UgaXMga25vd24sXHJcbiAgLy8gbm90IHdoZW4gdGhlIGZ1bGwgcmVxdWVzdCBpcyBjb21wbGV0ZS5cclxuICBvcHRpb25zLm9uUmVzcG9uc2UgPSBvcHRpb25zLm9uUmVzcG9uc2UgfHwgbm9vcFxyXG4gIGlmKG9wdGlvbnMub25SZXNwb25zZSA9PT0gdHJ1ZSkge1xyXG4gICAgb3B0aW9ucy5vblJlc3BvbnNlID0gY2FsbGJhY2tcclxuICAgIG9wdGlvbnMuY2FsbGJhY2sgPSBub29wXHJcbiAgfVxyXG5cclxuICAvLyBYWFggQnJvd3NlcnMgZG8gbm90IGxpa2UgdGhpcy5cclxuICAvL2lmKG9wdGlvbnMuYm9keSlcclxuICAvLyAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddID0gb3B0aW9ucy5ib2R5Lmxlbmd0aDtcclxuXHJcbiAgLy8gSFRUUCBiYXNpYyBhdXRoZW50aWNhdGlvblxyXG4gIGlmKCFvcHRpb25zLmhlYWRlcnMuYXV0aG9yaXphdGlvbiAmJiBvcHRpb25zLmF1dGgpXHJcbiAgICBvcHRpb25zLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA9ICdCYXNpYyAnICsgYjY0X2VuYyhvcHRpb25zLmF1dGgudXNlcm5hbWUgKyAnOicgKyBvcHRpb25zLmF1dGgucGFzc3dvcmQpO1xyXG5cclxuICByZXR1cm4gcnVuX3hocihvcHRpb25zKVxyXG59XHJcblxyXG52YXIgcmVxX3NlcSA9IDBcclxuZnVuY3Rpb24gcnVuX3hocihvcHRpb25zKSB7XHJcbiAgdmFyIHhociA9IG5ldyBYSFJcclxuICAgICwgdGltZWRfb3V0ID0gZmFsc2VcclxuICAgICwgaXNfY29ycyA9IGlzX2Nyb3NzRG9tYWluKG9wdGlvbnMudXJpKVxyXG4gICAgLCBzdXBwb3J0c19jb3JzID0gKCd3aXRoQ3JlZGVudGlhbHMnIGluIHhocilcclxuXHJcbiAgcmVxX3NlcSArPSAxXHJcbiAgeGhyLnNlcV9pZCA9IHJlcV9zZXFcclxuICB4aHIuaWQgPSByZXFfc2VxICsgJzogJyArIG9wdGlvbnMubWV0aG9kICsgJyAnICsgb3B0aW9ucy51cmlcclxuICB4aHIuX2lkID0geGhyLmlkIC8vIEkga25vdyBJIHdpbGwgdHlwZSBcIl9pZFwiIGZyb20gaGFiaXQgYWxsIHRoZSB0aW1lLlxyXG5cclxuICBpZihpc19jb3JzICYmICFzdXBwb3J0c19jb3JzKSB7XHJcbiAgICB2YXIgY29yc19lcnIgPSBuZXcgRXJyb3IoJ0Jyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBjcm9zcy1vcmlnaW4gcmVxdWVzdDogJyArIG9wdGlvbnMudXJpKVxyXG4gICAgY29yc19lcnIuY29ycyA9ICd1bnN1cHBvcnRlZCdcclxuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGNvcnNfZXJyLCB4aHIpXHJcbiAgfVxyXG5cclxuICB4aHIudGltZW91dFRpbWVyID0gc2V0VGltZW91dCh0b29fbGF0ZSwgb3B0aW9ucy50aW1lb3V0KVxyXG4gIGZ1bmN0aW9uIHRvb19sYXRlKCkge1xyXG4gICAgdGltZWRfb3V0ID0gdHJ1ZVxyXG4gICAgdmFyIGVyID0gbmV3IEVycm9yKCdFVElNRURPVVQnKVxyXG4gICAgZXIuY29kZSA9ICdFVElNRURPVVQnXHJcbiAgICBlci5kdXJhdGlvbiA9IG9wdGlvbnMudGltZW91dFxyXG5cclxuICAgIHJlcXVlc3QubG9nLmVycm9yKCdUaW1lb3V0JywgeyAnaWQnOnhoci5faWQsICdtaWxsaXNlY29uZHMnOm9wdGlvbnMudGltZW91dCB9KVxyXG4gICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soZXIsIHhocilcclxuICB9XHJcblxyXG4gIC8vIFNvbWUgc3RhdGVzIGNhbiBiZSBza2lwcGVkIG92ZXIsIHNvIHJlbWVtYmVyIHdoYXQgaXMgc3RpbGwgaW5jb21wbGV0ZS5cclxuICB2YXIgZGlkID0geydyZXNwb25zZSc6ZmFsc2UsICdsb2FkaW5nJzpmYWxzZSwgJ2VuZCc6ZmFsc2V9XHJcblxyXG4gIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBvbl9zdGF0ZV9jaGFuZ2VcclxuICB4aHIub3BlbihvcHRpb25zLm1ldGhvZCwgb3B0aW9ucy51cmksIHRydWUpIC8vIGFzeW5jaHJvbm91c1xyXG4gIGlmKGlzX2NvcnMpXHJcbiAgICB4aHIud2l0aENyZWRlbnRpYWxzID0gISEgb3B0aW9ucy53aXRoQ3JlZGVudGlhbHNcclxuICB4aHIuc2VuZChvcHRpb25zLmJvZHkpXHJcbiAgcmV0dXJuIHhoclxyXG5cclxuICBmdW5jdGlvbiBvbl9zdGF0ZV9jaGFuZ2UoZXZlbnQpIHtcclxuICAgIGlmKHRpbWVkX291dClcclxuICAgICAgcmV0dXJuIHJlcXVlc3QubG9nLmRlYnVnKCdJZ25vcmluZyB0aW1lZCBvdXQgc3RhdGUgY2hhbmdlJywgeydzdGF0ZSc6eGhyLnJlYWR5U3RhdGUsICdpZCc6eGhyLmlkfSlcclxuXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnU3RhdGUgY2hhbmdlJywgeydzdGF0ZSc6eGhyLnJlYWR5U3RhdGUsICdpZCc6eGhyLmlkLCAndGltZWRfb3V0Jzp0aW1lZF9vdXR9KVxyXG5cclxuICAgIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuT1BFTkVEKSB7XHJcbiAgICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IHN0YXJ0ZWQnLCB7J2lkJzp4aHIuaWR9KVxyXG4gICAgICBmb3IgKHZhciBrZXkgaW4gb3B0aW9ucy5oZWFkZXJzKVxyXG4gICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGtleSwgb3B0aW9ucy5oZWFkZXJzW2tleV0pXHJcbiAgICB9XHJcblxyXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkhFQURFUlNfUkVDRUlWRUQpXHJcbiAgICAgIG9uX3Jlc3BvbnNlKClcclxuXHJcbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuTE9BRElORykge1xyXG4gICAgICBvbl9yZXNwb25zZSgpXHJcbiAgICAgIG9uX2xvYWRpbmcoKVxyXG4gICAgfVxyXG5cclxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5ET05FKSB7XHJcbiAgICAgIG9uX3Jlc3BvbnNlKClcclxuICAgICAgb25fbG9hZGluZygpXHJcbiAgICAgIG9uX2VuZCgpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBvbl9yZXNwb25zZSgpIHtcclxuICAgIGlmKGRpZC5yZXNwb25zZSlcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAgZGlkLnJlc3BvbnNlID0gdHJ1ZVxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ0dvdCByZXNwb25zZScsIHsnaWQnOnhoci5pZCwgJ3N0YXR1cyc6eGhyLnN0YXR1c30pXHJcbiAgICBjbGVhclRpbWVvdXQoeGhyLnRpbWVvdXRUaW1lcilcclxuICAgIHhoci5zdGF0dXNDb2RlID0geGhyLnN0YXR1cyAvLyBOb2RlIHJlcXVlc3QgY29tcGF0aWJpbGl0eVxyXG5cclxuICAgIC8vIERldGVjdCBmYWlsZWQgQ09SUyByZXF1ZXN0cy5cclxuICAgIGlmKGlzX2NvcnMgJiYgeGhyLnN0YXR1c0NvZGUgPT0gMCkge1xyXG4gICAgICB2YXIgY29yc19lcnIgPSBuZXcgRXJyb3IoJ0NPUlMgcmVxdWVzdCByZWplY3RlZDogJyArIG9wdGlvbnMudXJpKVxyXG4gICAgICBjb3JzX2Vyci5jb3JzID0gJ3JlamVjdGVkJ1xyXG5cclxuICAgICAgLy8gRG8gbm90IHByb2Nlc3MgdGhpcyByZXF1ZXN0IGZ1cnRoZXIuXHJcbiAgICAgIGRpZC5sb2FkaW5nID0gdHJ1ZVxyXG4gICAgICBkaWQuZW5kID0gdHJ1ZVxyXG5cclxuICAgICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcclxuICAgIH1cclxuXHJcbiAgICBvcHRpb25zLm9uUmVzcG9uc2UobnVsbCwgeGhyKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gb25fbG9hZGluZygpIHtcclxuICAgIGlmKGRpZC5sb2FkaW5nKVxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBkaWQubG9hZGluZyA9IHRydWVcclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXNwb25zZSBib2R5IGxvYWRpbmcnLCB7J2lkJzp4aHIuaWR9KVxyXG4gICAgLy8gVE9ETzogTWF5YmUgc2ltdWxhdGUgXCJkYXRhXCIgZXZlbnRzIGJ5IHdhdGNoaW5nIHhoci5yZXNwb25zZVRleHRcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG9uX2VuZCgpIHtcclxuICAgIGlmKGRpZC5lbmQpXHJcbiAgICAgIHJldHVyblxyXG5cclxuICAgIGRpZC5lbmQgPSB0cnVlXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVxdWVzdCBkb25lJywgeydpZCc6eGhyLmlkfSlcclxuXHJcbiAgICB4aHIuYm9keSA9IHhoci5yZXNwb25zZVRleHRcclxuICAgIGlmKG9wdGlvbnMuanNvbikge1xyXG4gICAgICB0cnkgICAgICAgIHsgeGhyLmJvZHkgPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpIH1cclxuICAgICAgY2F0Y2ggKGVyKSB7IHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgb3B0aW9ucy5jYWxsYmFjayhudWxsLCB4aHIsIHhoci5ib2R5KVxyXG4gIH1cclxuXHJcbn0gLy8gcmVxdWVzdFxyXG5cclxucmVxdWVzdC53aXRoQ3JlZGVudGlhbHMgPSBmYWxzZTtcclxucmVxdWVzdC5ERUZBVUxUX1RJTUVPVVQgPSBERUZBVUxUX1RJTUVPVVQ7XHJcblxyXG4vL1xyXG4vLyBkZWZhdWx0c1xyXG4vL1xyXG5cclxucmVxdWVzdC5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9wdGlvbnMsIHJlcXVlc3Rlcikge1xyXG4gIHZhciBkZWYgPSBmdW5jdGlvbiAobWV0aG9kKSB7XHJcbiAgICB2YXIgZCA9IGZ1bmN0aW9uIChwYXJhbXMsIGNhbGxiYWNrKSB7XHJcbiAgICAgIGlmKHR5cGVvZiBwYXJhbXMgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgIHBhcmFtcyA9IHsndXJpJzogcGFyYW1zfTtcclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgcGFyYW1zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShwYXJhbXMpKTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKHZhciBpIGluIG9wdGlvbnMpIHtcclxuICAgICAgICBpZiAocGFyYW1zW2ldID09PSB1bmRlZmluZWQpIHBhcmFtc1tpXSA9IG9wdGlvbnNbaV1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbWV0aG9kKHBhcmFtcywgY2FsbGJhY2spXHJcbiAgICB9XHJcbiAgICByZXR1cm4gZFxyXG4gIH1cclxuICB2YXIgZGUgPSBkZWYocmVxdWVzdClcclxuICBkZS5nZXQgPSBkZWYocmVxdWVzdC5nZXQpXHJcbiAgZGUucG9zdCA9IGRlZihyZXF1ZXN0LnBvc3QpXHJcbiAgZGUucHV0ID0gZGVmKHJlcXVlc3QucHV0KVxyXG4gIGRlLmhlYWQgPSBkZWYocmVxdWVzdC5oZWFkKVxyXG4gIHJldHVybiBkZVxyXG59XHJcblxyXG4vL1xyXG4vLyBIVFRQIG1ldGhvZCBzaG9ydGN1dHNcclxuLy9cclxuXHJcbnZhciBzaG9ydGN1dHMgPSBbICdnZXQnLCAncHV0JywgJ3Bvc3QnLCAnaGVhZCcgXTtcclxuc2hvcnRjdXRzLmZvckVhY2goZnVuY3Rpb24oc2hvcnRjdXQpIHtcclxuICB2YXIgbWV0aG9kID0gc2hvcnRjdXQudG9VcHBlckNhc2UoKTtcclxuICB2YXIgZnVuYyAgID0gc2hvcnRjdXQudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgcmVxdWVzdFtmdW5jXSA9IGZ1bmN0aW9uKG9wdHMpIHtcclxuICAgIGlmKHR5cGVvZiBvcHRzID09PSAnc3RyaW5nJylcclxuICAgICAgb3B0cyA9IHsnbWV0aG9kJzptZXRob2QsICd1cmknOm9wdHN9O1xyXG4gICAgZWxzZSB7XHJcbiAgICAgIG9wdHMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdHMpKTtcclxuICAgICAgb3B0cy5tZXRob2QgPSBtZXRob2Q7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGFyZ3MgPSBbb3B0c10uY29uY2F0KEFycmF5LnByb3RvdHlwZS5zbGljZS5hcHBseShhcmd1bWVudHMsIFsxXSkpO1xyXG4gICAgcmV0dXJuIHJlcXVlc3QuYXBwbHkodGhpcywgYXJncyk7XHJcbiAgfVxyXG59KVxyXG5cclxuLy9cclxuLy8gQ291Y2hEQiBzaG9ydGN1dFxyXG4vL1xyXG5cclxucmVxdWVzdC5jb3VjaCA9IGZ1bmN0aW9uKG9wdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgaWYodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnKVxyXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfVxyXG5cclxuICAvLyBKdXN0IHVzZSB0aGUgcmVxdWVzdCBBUEkgdG8gZG8gSlNPTi5cclxuICBvcHRpb25zLmpzb24gPSB0cnVlXHJcbiAgaWYob3B0aW9ucy5ib2R5KVxyXG4gICAgb3B0aW9ucy5qc29uID0gb3B0aW9ucy5ib2R5XHJcbiAgZGVsZXRlIG9wdGlvbnMuYm9keVxyXG5cclxuICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IG5vb3BcclxuXHJcbiAgdmFyIHhociA9IHJlcXVlc3Qob3B0aW9ucywgY291Y2hfaGFuZGxlcilcclxuICByZXR1cm4geGhyXHJcblxyXG4gIGZ1bmN0aW9uIGNvdWNoX2hhbmRsZXIoZXIsIHJlc3AsIGJvZHkpIHtcclxuICAgIGlmKGVyKVxyXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpXHJcblxyXG4gICAgaWYoKHJlc3Auc3RhdHVzQ29kZSA8IDIwMCB8fCByZXNwLnN0YXR1c0NvZGUgPiAyOTkpICYmIGJvZHkuZXJyb3IpIHtcclxuICAgICAgLy8gVGhlIGJvZHkgaXMgYSBDb3VjaCBKU09OIG9iamVjdCBpbmRpY2F0aW5nIHRoZSBlcnJvci5cclxuICAgICAgZXIgPSBuZXcgRXJyb3IoJ0NvdWNoREIgZXJyb3I6ICcgKyAoYm9keS5lcnJvci5yZWFzb24gfHwgYm9keS5lcnJvci5lcnJvcikpXHJcbiAgICAgIGZvciAodmFyIGtleSBpbiBib2R5KVxyXG4gICAgICAgIGVyW2tleV0gPSBib2R5W2tleV1cclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpO1xyXG4gIH1cclxufVxyXG5cclxuLy9cclxuLy8gVXRpbGl0eVxyXG4vL1xyXG5cclxuZnVuY3Rpb24gbm9vcCgpIHt9XHJcblxyXG5mdW5jdGlvbiBnZXRMb2dnZXIoKSB7XHJcbiAgdmFyIGxvZ2dlciA9IHt9XHJcbiAgICAsIGxldmVscyA9IFsndHJhY2UnLCAnZGVidWcnLCAnaW5mbycsICd3YXJuJywgJ2Vycm9yJ11cclxuICAgICwgbGV2ZWwsIGlcclxuXHJcbiAgZm9yKGkgPSAwOyBpIDwgbGV2ZWxzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBsZXZlbCA9IGxldmVsc1tpXVxyXG5cclxuICAgIGxvZ2dlcltsZXZlbF0gPSBub29wXHJcbiAgICBpZih0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZSAmJiBjb25zb2xlW2xldmVsXSlcclxuICAgICAgbG9nZ2VyW2xldmVsXSA9IGZvcm1hdHRlZChjb25zb2xlLCBsZXZlbClcclxuICB9XHJcblxyXG4gIHJldHVybiBsb2dnZXJcclxufVxyXG5cclxuZnVuY3Rpb24gZm9ybWF0dGVkKG9iaiwgbWV0aG9kKSB7XHJcbiAgcmV0dXJuIGZvcm1hdHRlZF9sb2dnZXJcclxuXHJcbiAgZnVuY3Rpb24gZm9ybWF0dGVkX2xvZ2dlcihzdHIsIGNvbnRleHQpIHtcclxuICAgIGlmKHR5cGVvZiBjb250ZXh0ID09PSAnb2JqZWN0JylcclxuICAgICAgc3RyICs9ICcgJyArIEpTT04uc3RyaW5naWZ5KGNvbnRleHQpXHJcblxyXG4gICAgcmV0dXJuIG9ialttZXRob2RdLmNhbGwob2JqLCBzdHIpXHJcbiAgfVxyXG59XHJcblxyXG4vLyBSZXR1cm4gd2hldGhlciBhIFVSTCBpcyBhIGNyb3NzLWRvbWFpbiByZXF1ZXN0LlxyXG5mdW5jdGlvbiBpc19jcm9zc0RvbWFpbih1cmwpIHtcclxuICB2YXIgcnVybCA9IC9eKFtcXHdcXCtcXC5cXC1dKzopKD86XFwvXFwvKFteXFwvPyM6XSopKD86OihcXGQrKSk/KT8vXHJcblxyXG4gIC8vIGpRdWVyeSAjODEzOCwgSUUgbWF5IHRocm93IGFuIGV4Y2VwdGlvbiB3aGVuIGFjY2Vzc2luZ1xyXG4gIC8vIGEgZmllbGQgZnJvbSB3aW5kb3cubG9jYXRpb24gaWYgZG9jdW1lbnQuZG9tYWluIGhhcyBiZWVuIHNldFxyXG4gIHZhciBhamF4TG9jYXRpb25cclxuICB0cnkgeyBhamF4TG9jYXRpb24gPSBsb2NhdGlvbi5ocmVmIH1cclxuICBjYXRjaCAoZSkge1xyXG4gICAgLy8gVXNlIHRoZSBocmVmIGF0dHJpYnV0ZSBvZiBhbiBBIGVsZW1lbnQgc2luY2UgSUUgd2lsbCBtb2RpZnkgaXQgZ2l2ZW4gZG9jdW1lbnQubG9jYXRpb25cclxuICAgIGFqYXhMb2NhdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoIFwiYVwiICk7XHJcbiAgICBhamF4TG9jYXRpb24uaHJlZiA9IFwiXCI7XHJcbiAgICBhamF4TG9jYXRpb24gPSBhamF4TG9jYXRpb24uaHJlZjtcclxuICB9XHJcblxyXG4gIHZhciBhamF4TG9jUGFydHMgPSBydXJsLmV4ZWMoYWpheExvY2F0aW9uLnRvTG93ZXJDYXNlKCkpIHx8IFtdXHJcbiAgICAsIHBhcnRzID0gcnVybC5leGVjKHVybC50b0xvd2VyQ2FzZSgpIClcclxuXHJcbiAgdmFyIHJlc3VsdCA9ICEhKFxyXG4gICAgcGFydHMgJiZcclxuICAgICggIHBhcnRzWzFdICE9IGFqYXhMb2NQYXJ0c1sxXVxyXG4gICAgfHwgcGFydHNbMl0gIT0gYWpheExvY1BhcnRzWzJdXHJcbiAgICB8fCAocGFydHNbM10gfHwgKHBhcnRzWzFdID09PSBcImh0dHA6XCIgPyA4MCA6IDQ0MykpICE9IChhamF4TG9jUGFydHNbM10gfHwgKGFqYXhMb2NQYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKVxyXG4gICAgKVxyXG4gIClcclxuXHJcbiAgLy9jb25zb2xlLmRlYnVnKCdpc19jcm9zc0RvbWFpbignK3VybCsnKSAtPiAnICsgcmVzdWx0KVxyXG4gIHJldHVybiByZXN1bHRcclxufVxyXG5cclxuLy8gTUlUIExpY2Vuc2UgZnJvbSBodHRwOi8vcGhwanMub3JnL2Z1bmN0aW9ucy9iYXNlNjRfZW5jb2RlOjM1OFxyXG5mdW5jdGlvbiBiNjRfZW5jIChkYXRhKSB7XHJcbiAgICAvLyBFbmNvZGVzIHN0cmluZyB1c2luZyBNSU1FIGJhc2U2NCBhbGdvcml0aG1cclxuICAgIHZhciBiNjQgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCI7XHJcbiAgICB2YXIgbzEsIG8yLCBvMywgaDEsIGgyLCBoMywgaDQsIGJpdHMsIGkgPSAwLCBhYyA9IDAsIGVuYz1cIlwiLCB0bXBfYXJyID0gW107XHJcblxyXG4gICAgaWYgKCFkYXRhKSB7XHJcbiAgICAgICAgcmV0dXJuIGRhdGE7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gYXNzdW1lIHV0ZjggZGF0YVxyXG4gICAgLy8gZGF0YSA9IHRoaXMudXRmOF9lbmNvZGUoZGF0YSsnJyk7XHJcblxyXG4gICAgZG8geyAvLyBwYWNrIHRocmVlIG9jdGV0cyBpbnRvIGZvdXIgaGV4ZXRzXHJcbiAgICAgICAgbzEgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcclxuICAgICAgICBvMiA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xyXG4gICAgICAgIG8zID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XHJcblxyXG4gICAgICAgIGJpdHMgPSBvMTw8MTYgfCBvMjw8OCB8IG8zO1xyXG5cclxuICAgICAgICBoMSA9IGJpdHM+PjE4ICYgMHgzZjtcclxuICAgICAgICBoMiA9IGJpdHM+PjEyICYgMHgzZjtcclxuICAgICAgICBoMyA9IGJpdHM+PjYgJiAweDNmO1xyXG4gICAgICAgIGg0ID0gYml0cyAmIDB4M2Y7XHJcblxyXG4gICAgICAgIC8vIHVzZSBoZXhldHMgdG8gaW5kZXggaW50byBiNjQsIGFuZCBhcHBlbmQgcmVzdWx0IHRvIGVuY29kZWQgc3RyaW5nXHJcbiAgICAgICAgdG1wX2FyclthYysrXSA9IGI2NC5jaGFyQXQoaDEpICsgYjY0LmNoYXJBdChoMikgKyBiNjQuY2hhckF0KGgzKSArIGI2NC5jaGFyQXQoaDQpO1xyXG4gICAgfSB3aGlsZSAoaSA8IGRhdGEubGVuZ3RoKTtcclxuXHJcbiAgICBlbmMgPSB0bXBfYXJyLmpvaW4oJycpO1xyXG5cclxuICAgIHN3aXRjaCAoZGF0YS5sZW5ndGggJSAzKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICBlbmMgPSBlbmMuc2xpY2UoMCwgLTIpICsgJz09JztcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMSkgKyAnPSc7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGVuYztcclxufVxyXG4gICAgcmV0dXJuIHJlcXVlc3Q7XHJcbi8vVU1EIEZPT1RFUiBTVEFSVFxyXG59KSk7XHJcbi8vVU1EIEZPT1RFUiBFTkRcclxuIiwiZnVuY3Rpb24gRSAoKSB7XHJcbiAgLy8gS2VlcCB0aGlzIGVtcHR5IHNvIGl0J3MgZWFzaWVyIHRvIGluaGVyaXQgZnJvbVxyXG4gIC8vICh2aWEgaHR0cHM6Ly9naXRodWIuY29tL2xpcHNtYWNrIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL3Njb3R0Y29yZ2FuL3RpbnktZW1pdHRlci9pc3N1ZXMvMylcclxufVxyXG5cclxuRS5wcm90b3R5cGUgPSB7XHJcbiAgb246IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaywgY3R4KSB7XHJcbiAgICB2YXIgZSA9IHRoaXMuZSB8fCAodGhpcy5lID0ge30pO1xyXG5cclxuICAgIChlW25hbWVdIHx8IChlW25hbWVdID0gW10pKS5wdXNoKHtcclxuICAgICAgZm46IGNhbGxiYWNrLFxyXG4gICAgICBjdHg6IGN0eFxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfSxcclxuXHJcbiAgb25jZTogZnVuY3Rpb24gKG5hbWUsIGNhbGxiYWNrLCBjdHgpIHtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIGZ1bmN0aW9uIGxpc3RlbmVyICgpIHtcclxuICAgICAgc2VsZi5vZmYobmFtZSwgbGlzdGVuZXIpO1xyXG4gICAgICBjYWxsYmFjay5hcHBseShjdHgsIGFyZ3VtZW50cyk7XHJcbiAgICB9O1xyXG5cclxuICAgIGxpc3RlbmVyLl8gPSBjYWxsYmFja1xyXG4gICAgcmV0dXJuIHRoaXMub24obmFtZSwgbGlzdGVuZXIsIGN0eCk7XHJcbiAgfSxcclxuXHJcbiAgZW1pdDogZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgIHZhciBkYXRhID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xyXG4gICAgdmFyIGV2dEFyciA9ICgodGhpcy5lIHx8ICh0aGlzLmUgPSB7fSkpW25hbWVdIHx8IFtdKS5zbGljZSgpO1xyXG4gICAgdmFyIGkgPSAwO1xyXG4gICAgdmFyIGxlbiA9IGV2dEFyci5sZW5ndGg7XHJcblxyXG4gICAgZm9yIChpOyBpIDwgbGVuOyBpKyspIHtcclxuICAgICAgZXZ0QXJyW2ldLmZuLmFwcGx5KGV2dEFycltpXS5jdHgsIGRhdGEpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH0sXHJcblxyXG4gIG9mZjogZnVuY3Rpb24gKG5hbWUsIGNhbGxiYWNrKSB7XHJcbiAgICB2YXIgZSA9IHRoaXMuZSB8fCAodGhpcy5lID0ge30pO1xyXG4gICAgdmFyIGV2dHMgPSBlW25hbWVdO1xyXG4gICAgdmFyIGxpdmVFdmVudHMgPSBbXTtcclxuXHJcbiAgICBpZiAoZXZ0cyAmJiBjYWxsYmFjaykge1xyXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gZXZ0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG4gICAgICAgIGlmIChldnRzW2ldLmZuICE9PSBjYWxsYmFjayAmJiBldnRzW2ldLmZuLl8gIT09IGNhbGxiYWNrKVxyXG4gICAgICAgICAgbGl2ZUV2ZW50cy5wdXNoKGV2dHNbaV0pO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVtb3ZlIGV2ZW50IGZyb20gcXVldWUgdG8gcHJldmVudCBtZW1vcnkgbGVha1xyXG4gICAgLy8gU3VnZ2VzdGVkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS9sYXpkXHJcbiAgICAvLyBSZWY6IGh0dHBzOi8vZ2l0aHViLmNvbS9zY290dGNvcmdhbi90aW55LWVtaXR0ZXIvY29tbWl0L2M2ZWJmYWE5YmM5NzNiMzNkMTEwYTg0YTMwNzc0MmI3Y2Y5NGM5NTMjY29tbWl0Y29tbWVudC01MDI0OTEwXHJcblxyXG4gICAgKGxpdmVFdmVudHMubGVuZ3RoKVxyXG4gICAgICA/IGVbbmFtZV0gPSBsaXZlRXZlbnRzXHJcbiAgICAgIDogZGVsZXRlIGVbbmFtZV07XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBFO1xyXG5tb2R1bGUuZXhwb3J0cy5UaW55RW1pdHRlciA9IEU7XHJcbiIsImNvbnN0IExvZ2luID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9sb2dpbi5qc1wiKTtcclxuY29uc3QgQWRtaW5pc3RyYWNhbyA9IHJlcXVpcmUoXCIuL2NvbXBvbmVudHMvYWRtaW5pc3RyYWNhby5qc1wiKTtcclxuY29uc3QgTWVudSA9IHJlcXVpcmUoXCIuL2NvbXBvbmVudHMvbWVudS5qc1wiKTtcclxuY29uc3QgTXVzY3VsYWNhbyA9IHJlcXVpcmUoXCIuL2NvbXBvbmVudHMvbXVzY3VsYWNhby5qc1wiKTtcclxuY29uc3QgTXVsdGlmdW5jaW9uYWwgPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL211bHRpZnVuY2lvbmFsLmpzXCIpO1xyXG5jb25zdCBTYWxhID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9zYWxhLmpzXCIpO1xyXG5cclxuY2xhc3MgQXBwIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICB0aGlzLmxvZ2luID0gbmV3IExvZ2luKGJvZHkpO1xyXG4gICAgICAgIHRoaXMuYWRtaW5pc3RyYWNhbyA9IG5ldyBBZG1pbmlzdHJhY2FvKGJvZHkpO1xyXG4gICAgICAgIHRoaXMubWVudSA9IG5ldyBNZW51KGJvZHkpO1xyXG4gICAgICAgIHRoaXMubXVzY3VsYWNhbyA9IG5ldyBNdXNjdWxhY2FvKGJvZHkpO1xyXG4gICAgICAgIHRoaXMubXVsdGlmdW5jaW9uYWwgPSBuZXcgTXVsdGlmdW5jaW9uYWwoYm9keSk7XHJcbiAgICAgICAgdGhpcy5zYWxhID0gbmV3IFNhbGEoYm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5pdCgpIHtcclxuICAgICAgICB0aGlzLmxvZ2luLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZEV2ZW50TGlzdGVuZXIoKSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbkV2ZW50cygpO1xyXG4gICAgICAgIHRoaXMuYWRtaW5pc3RyYWNhb0V2ZW50cygpO1xyXG4gICAgfVxyXG5cclxuICAgIGxvZ2luRXZlbnRzKCkge1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJlcnJvclwiLCAoKSA9PiBhbGVydChcIlVzdWFyaW8gb3Ugc2VuaGEgaW5jb3JyZXRvc1wiKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImxvZ2luQWRtaW5cIiwgKCkgPT4gdGhpcy5hZG1pbmlzdHJhY2FvLnJlbmRlcigpKTtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwibG9naW5BbHVub1wiLCBsb2dpbiA9PiB0aGlzLm1lbnUucmVuZGVyKGxvZ2luKSk7XHJcbiAgICAgICAgdGhpcy5zYWxhLm9uKFwibG9naW5BbHVub1wiLCBsb2dpbiA9PiB0aGlzLm1lbnUucmVuZGVyKGxvZ2luKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcIm11bHRpZnVuY2lvbmFsXCIsIGRhdGEgPT4gdGhpcy5tdWx0aWZ1bmNpb25hbC5yZW5kZXIoZGF0YSkpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJtdXNjdWxhY2FvXCIsIGRhdGEgPT4gdGhpcy5tdXNjdWxhY2FvLnJlbmRlcihkYXRhKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImFsdW5vTmFvSW5zZXJpZG9cIiwgKCkgPT4gYWxlcnQoXCJPcHMsIG8gYWx1bm8gbsOjbyBwb2RlIHNlciBpbnNlcmlkb1wiKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImFsdW5vSW5zZXJpZG9TdWNlc3NvXCIsICgpID0+IGFsZXJ0KFwiQWx1bm8gaW5zZXJpZG8gY29tIHN1Y2Vzc29cIikpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkbWluaXN0cmFjYW9FdmVudHMoKSB7XHJcbiAgICAgICAgLy90aGlzLmFkbWluaXN0cmFjYW8ub24oXCJwcmVlbmNoYUdyaWRcIiwgKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBcHA7IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvYWRtaW5pc3RyYWNhby5qc1wiKTtcclxuY29uc3QgTG9naW4gPSByZXF1aXJlKFwiLi9sb2dpbi5qc1wiKTtcclxuY29uc3QgQ2FkYXN0cm9BbHVubyA9IHJlcXVpcmUoXCIuL2NhZGFzdHJvQWx1bm8uanNcIik7XHJcblxyXG5jbGFzcyBBZG1pbmlzdHJhY2FvIGV4dGVuZHMgQWdlbmRhIHtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBuZXcgTG9naW4oYm9keSk7XHJcbiAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vID0gbmV3IENhZGFzdHJvQWx1bm8oYm9keSk7XHJcbiAgICAgICAgdGhpcy5laEVkaWNhbyA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLnJlbmRlckdyaWRBbHVub3MoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMubG9nb3V0KCk7XHJcbiAgICAgICAgdGhpcy5jbGlja0JvdGFvU2FsdmFyKCk7XHJcbiAgICAgICAgdGhpcy5jbGlja0JvdGFvQWRpY2lvbmFyKCk7XHJcbiAgICAgICAgdGhpcy5ib3Rhb0VkaXRhcigpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tCb3Rhb0V4Y2x1aXIoKTtcclxuICAgICAgICB0aGlzLmJvdGFvUGVzcXVpc2EoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dvdXQoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9TaHV0ZG93bl1cIikub25jbGljayA9ICgpID0+IGRvY3VtZW50LmxvY2F0aW9uLnJlbG9hZCh0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICBib3Rhb1Blc3F1aXNhKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKCdbYm90YW9CdXNjYXJdJykub25jbGljayA9ICgpID0+IHRoaXMuZmlsdHJlQWx1bm9zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgY2xpY2tCb3Rhb0V4Y2x1aXIoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9FeGNsdWlyXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5leGNsdWFBbHVubygpO1xyXG4gICAgfSAgICBcclxuXHJcbiAgICBjbGlja0JvdGFvU2FsdmFyKCkge1xyXG5cclxuICAgICAgICBjb25zdCBmb3JtID0gdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJmb3JtXCIpO1xyXG5cclxuICAgICAgICBmb3JtLmFkZEV2ZW50TGlzdGVuZXIoXCJzdWJtaXRcIiwgKGUpID0+IHtcclxuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBjb25zdCBhbHVubyA9IHRoaXMub2J0ZW5oYURhZG9zTW9kYWwoZSk7XHJcbiAgICAgICAgICAgIHRoaXMuaW5zaXJhT3VFZGl0ZUFsdW5vKGFsdW5vKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjbGlja0JvdGFvQWRpY2lvbmFyKCkge1xyXG5cclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0FkaWNpb25hcl1cIikub25jbGljayA9ICgpID0+IHRoaXMuZWhFZGljYW8gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBib3Rhb0VkaXRhcigpIHtcclxuXHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9FZGl0YXJdXCIpLm9uY2xpY2sgPSAoKSA9PiB0aGlzLmNsaWNrQm90YW9FZGl0YXIoKVxyXG4gICAgfVxyXG5cclxuICAgIGNsaWNrQm90YW9FZGl0YXIoKSB7XHJcblxyXG4gICAgICAgIHRoaXMuZWhFZGljYW8gPSB0cnVlO1xyXG5cclxuICAgICAgICBsZXQgYWx1bm9zU2VsZWNpb25hZG9zID0gdGhpcy5vYnRlbmhhQWx1bm9zU2VsZWNpb25hZG9zKCk7XHJcblxyXG4gICAgICAgIGlmIChhbHVub3NTZWxlY2lvbmFkb3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChhbHVub3NTZWxlY2lvbmFkb3MubGVuZ3RoID09PSAxKSB7ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMuYWx1bm9TZWxlY2lvbmFkbyA9IGFsdW5vc1NlbGVjaW9uYWRvc1swXS5nZXRBdHRyaWJ1dGUoXCJjb2RpZ29hbHVub1wiKTtcclxuICAgICAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vLnByZWVuY2hhTW9kYWxFZGljYW8odGhpcy5hbHVub1NlbGVjaW9uYWRvKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiU2VsZWNpb25lIGFwZW5hcyB1bSBhbHVubyBwYXJhIGVkacOnw6NvIHBvciBmYXZvciFcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZpbHRyZUFsdW5vcygpIHtcclxuXHJcbiAgICAgICAgbGV0IHRlcm1vQnVzY2EgPSB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcignW2xhYmVsQnVzY2FdJykudmFsdWU7XHJcblxyXG4gICAgICAgIGlmKCF0ZXJtb0J1c2NhKSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyR3JpZEFsdW5vcygpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L2FkbWluaXN0cmFjYW8vYnVzY2EvJHt0ZXJtb0J1c2NhfWAsXHJcbiAgICAgICAgICAgIGNyb3NzRG9tYWluOiB0cnVlLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgaWYgKGVycikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiZXJyb3JcIiwgXCJuw6NvIGZvaSBwb3Nzw612ZWwgY2FycmVnYXIgb3MgYWx1bm9zXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcihkYXRhLmFsdW5vcyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIG9idGVuaGFEYWRvc01vZGFsKGUpIHtcclxuXHJcbiAgICAgICAgY29uc3QgY3BmID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltjcGZdXCIpLnZhbHVlO1xyXG5cclxuICAgICAgICBjb25zdCBhbHVubyA9IHtcclxuICAgICAgICAgICAgbm9tZTogZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltub21lXVwiKS52YWx1ZSxcclxuICAgICAgICAgICAgY3BmOiBjcGYsXHJcbiAgICAgICAgICAgIHRlbGVmb25lOiBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW3RlbGVmb25lXVwiKS52YWx1ZSxcclxuICAgICAgICAgICAgZW1haWw6IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbZW1haWxdXCIpLnZhbHVlLFxyXG4gICAgICAgICAgICBlbmRlcmVjbzogdGhpcy5tb250ZUVuZGVyZWNvKGUudGFyZ2V0KSxcclxuICAgICAgICAgICAgbWF0cmljdWxhOiB0aGlzLmdlcmVNYXRyaWN1bGEoY3BmKVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHJldHVybiBhbHVubztcclxuICAgIH1cclxuXHJcbiAgICBpbnNpcmFPdUVkaXRlQWx1bm8oYWx1bm8pIHtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZWhFZGljYW8pIHtcclxuICAgICAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vLmVkaXRlQWx1bm8oYWx1bm8sIHRoaXMuYWx1bm9TZWxlY2lvbmFkbyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8uaW5zaXJhQWx1bm8oYWx1bm8pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgJCgnI21vZGFsQ2FkYXN0cm9BbHVubycpLm1vZGFsKCdoaWRlJyk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJHcmlkQWx1bm9zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZXhjbHVhQWx1bm8oKSB7XHJcblxyXG4gICAgICAgIGxldCBhbHVub3NTZWxlY2lvbmFkb3MgPSB0aGlzLm9idGVuaGFBbHVub3NTZWxlY2lvbmFkb3MoKTtcclxuXHJcbiAgICAgICAgaWYgKGFsdW5vc1NlbGVjaW9uYWRvcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGFsdW5vc1NlbGVjaW9uYWRvcy5sZW5ndGggPT09IDEpIHsgICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhpcy5hbHVub1NlbGVjaW9uYWRvID0gYWx1bm9zU2VsZWNpb25hZG9zWzBdLmdldEF0dHJpYnV0ZShcImNvZGlnb2FsdW5vXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8uZXhjbHVhQWx1bm8odGhpcy5hbHVub1NlbGVjaW9uYWRvKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiU2VsZWNpb25lIGFwZW5hcyB1bSBhbHVubyBwYXJhIGVkacOnw6NvIHBvciBmYXZvciFcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckdyaWRBbHVub3MoKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvYCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImVycm9yXCIsIFwibsOjbyBmb2kgcG9zc8OtdmVsIGNhcnJlZ2FyIG9zIGFsdW5vc1wiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoZGF0YS5hbHVub3MpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBvYnRlbmhhQWx1bm9zU2VsZWNpb25hZG9zKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZ1bmN0aW9uIGVzdGFTZWxlY2lvbmFkbyhhbHVubykge1xyXG4gICAgICAgICAgICByZXR1cm4gYWx1bm8uY2hlY2tlZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBhbHVub3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLmJvZHkucXVlcnlTZWxlY3RvckFsbChcIlthbHVub1NlbGVjaW9uYWRvXVwiKSk7XHJcbiAgICAgICAgcmV0dXJuIGFsdW5vcy5maWx0ZXIoZXN0YVNlbGVjaW9uYWRvKTtcclxuICAgIH1cclxuXHJcbiAgICBtb250ZUVuZGVyZWNvKHRhcmdldCkge1xyXG4gICAgICAgIHJldHVybiB0YXJnZXQucXVlcnlTZWxlY3RvcihcIltjaWRhZGVdXCIpLnZhbHVlICsgXCJcXG5cIiArXHJcbiAgICAgICAgICAgIHRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW2JhaXJyb11cIikudmFsdWUgKyBcIlxcblwiICtcclxuICAgICAgICAgICAgdGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbbnVtZXJvXVwiKS52YWx1ZSArIFwiXFxuXCIgK1xyXG4gICAgICAgICAgICB0YXJnZXQucXVlcnlTZWxlY3RvcihcIltjb21wbGVtZW50b11cIikudmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgZ2VyZU1hdHJpY3VsYShjcGYpIHtcclxuICAgICAgICBjb25zdCBkYXRhID0gbmV3IERhdGUoKTtcclxuICAgICAgICBjb25zdCBhbm8gPSBkYXRhLmdldEZ1bGxZZWFyKCk7XHJcbiAgICAgICAgY29uc3Qgc2VndW5kb3MgPSBkYXRhLmdldFNlY29uZHMoKTtcclxuICAgICAgICByZXR1cm4gYW5vICsgY3BmLnNsaWNlKDgpICsgc2VndW5kb3M7XHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQWRtaW5pc3RyYWNhbzsiLCJjb25zdCBUaW55RW1pdHRlciA9IHJlcXVpcmUoXCJ0aW55LWVtaXR0ZXJcIik7XHJcbmNvbnN0IFJlcXVlc3QgPSByZXF1aXJlKFwiYnJvd3Nlci1yZXF1ZXN0XCIpO1xyXG5cclxuY2xhc3MgQWdlbmRhIGV4dGVuZHMgVGlueUVtaXR0ZXIge1xyXG4gICAgY29uc3RydWN0b3IoKXtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMucmVxdWVzdCA9IFJlcXVlc3Q7XHJcbiAgICAgICAgdGhpcy5VUkwgPSBcImh0dHA6Ly9sb2NhbGhvc3Q6MzMzM1wiO1xyXG4gICAgfVxyXG59XHJcbm1vZHVsZS5leHBvcnRzID0gQWdlbmRhOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanNcIik7XHJcbmNvbnN0IExvZ2luID0gcmVxdWlyZShcIi4vbG9naW4uanNcIik7XHJcblxyXG5jbGFzcyBDYWRhc3Ryb0FsdW5vIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IG5ldyBMb2dpbihib2R5KTtcclxuICAgIH07XHJcblxyXG4gICAgaW5zaXJhQWx1bm8oYWx1bm8pIHtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vYWRtaW5pc3RyYWNhb2AsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgIGJvZHk6IHtcclxuICAgICAgICAgICAgICAgIG5vbWU6IGFsdW5vLm5vbWUsXHJcbiAgICAgICAgICAgICAgICBjcGY6IGFsdW5vLmNwZixcclxuICAgICAgICAgICAgICAgIHRlbGVmb25lOiBhbHVuby50ZWxlZm9uZSxcclxuICAgICAgICAgICAgICAgIGVtYWlsOiBhbHVuby5lbWFpbCxcclxuICAgICAgICAgICAgICAgIGVuZGVyZWNvOiBhbHVuby5lbmRlcmVjbyxcclxuICAgICAgICAgICAgICAgIG1hdHJpY3VsYTogYWx1bm8ubWF0cmljdWxhXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoZXJyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImFsdW5vTmFvSW5zZXJpZG9cIiwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWxlcnQoXCJBbHVubyBpbnNlcmlkbyBjb20gc3VjZXNzbyFcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICB9O1xyXG5cclxuICAgIHByZWVuY2hhTW9kYWxFZGljYW8oY29kaWdvQWx1bm8pIHtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvLyR7Y29kaWdvQWx1bm99YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAwKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChcIkFsdW5vIG7Do28gZW5jb250cmFkb1wiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBhbHVubyA9IHtcclxuICAgICAgICAgICAgICAgICAgICBub21lOiBkYXRhLm5vbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgY3BmOiBkYXRhLmNwZixcclxuICAgICAgICAgICAgICAgICAgICB0ZWxlZm9uZTogZGF0YS50ZWxlZm9uZSxcclxuICAgICAgICAgICAgICAgICAgICBlbWFpbDogZGF0YS5lbWFpbCxcclxuICAgICAgICAgICAgICAgICAgICBlbmRlcmVjbzogZGF0YS5lbmRlcmVjbyxcclxuICAgICAgICAgICAgICAgICAgICBtYXRyaWN1bGE6IGRhdGEubWF0cmljdWxhXHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2NwZl1cIikudmFsdWUgPSBhbHVuby5jcGY7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltub21lXVwiKS52YWx1ZSA9IGFsdW5vLm5vbWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIlt0ZWxlZm9uZV1cIikudmFsdWUgPSBhbHVuby50ZWxlZm9uZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2VtYWlsXVwiKS52YWx1ZSA9IGFsdW5vLmVtYWlsO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tb250ZUVuZGVyZWNvKGFsdW5vLmVuZGVyZWNvKTtcclxuXHJcbiAgICAgICAgICAgICAgICAkKCcjbW9kYWxDYWRhc3Ryb0FsdW5vJykubW9kYWwoJ3Nob3cnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIG1vbnRlRW5kZXJlY28oZW5kZXJlY28pIHtcclxuXHJcbiAgICAgICAgbGV0IGFycmF5RW5kZXJlY28gPSBlbmRlcmVjby5zcGxpdCgnXFxuJyk7XHJcblxyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2NpZGFkZV1cIikudmFsdWUgPSBhcnJheUVuZGVyZWNvWzBdO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JhaXJyb11cIikudmFsdWUgPSBhcnJheUVuZGVyZWNvWzFdO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW251bWVyb11cIikudmFsdWUgPSBhcnJheUVuZGVyZWNvWzJdO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2NvbXBsZW1lbnRvXVwiKS52YWx1ZSA9IGFycmF5RW5kZXJlY29bM107XHJcbiAgICB9XHJcblxyXG4gICAgZWRpdGVBbHVubyhhbHVubywgaWQpIHtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvLyR7aWR9YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICAgICAgYm9keToge1xyXG4gICAgICAgICAgICAgICAgaWQ6IGFsdW5vLmlkLFxyXG4gICAgICAgICAgICAgICAgbm9tZTogYWx1bm8ubm9tZSxcclxuICAgICAgICAgICAgICAgIGNwZjogYWx1bm8uY3BmLFxyXG4gICAgICAgICAgICAgICAgdGVsZWZvbmU6IGFsdW5vLnRlbGVmb25lLFxyXG4gICAgICAgICAgICAgICAgZW1haWw6IGFsdW5vLmVtYWlsLFxyXG4gICAgICAgICAgICAgICAgZW5kZXJlY286IGFsdW5vLmVuZGVyZWNvLFxyXG4gICAgICAgICAgICAgICAgbWF0cmljdWxhOiBhbHVuby5tYXRyaWN1bGFcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAxKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChlcnIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiYWx1bm9OYW9JbnNlcmlkb1wiLCBlcnIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoXCJBbHVubyBlZGl0YWRvIGNvbSBzdWNlc3NvIVwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmRpc3Bvc2VNb2RhbCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGV4Y2x1YUFsdW5vKGlkQWx1bm8pIHtcclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXHJcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKidcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vYWRtaW5pc3RyYWNhby8ke2lkQWx1bm99YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvL3Jlcy5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsICcqJyk7XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAxKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChlcnIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiYWx1bm9OYW9JbnNlcmlkb1wiLCBlcnIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoXCJBbHVubyBleGNsdcOtZG8gY29tIHN1Y2Vzc28hXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgfVxyXG5cclxuICAgIGRpc3Bvc2VNb2RhbCgpIHtcclxuXHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY3BmXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbbm9tZV1cIikudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW3RlbGVmb25lXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbZW1haWxdXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjaWRhZGVdXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltiYWlycm9dXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltudW1lcm9dXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjb21wbGVtZW50b11cIikudmFsdWUgPSBcIlwiO1xyXG5cclxuICAgICAgICAkKCcjbW9kYWxDYWRhc3Ryb0FsdW5vJykubW9kYWwoJ2hpZGUnKTtcclxuICAgIH1cclxuXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQ2FkYXN0cm9BbHVubzsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9sb2dpbi5qc1wiKTtcclxuXHJcbmNsYXNzIExvZ2luIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIlt1c3VhcmlvXVwiKS5mb2N1cygpO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZEV2ZW50TGlzdGVuZXIoKSB7XHJcbiAgICAgICAgdGhpcy5lbnZpZUZvcm11bGFyaW8oKTtcclxuICAgICAgICB0aGlzLmVzcXVlY2V1U2VuaGEoKTtcclxuICAgIH1cclxuXHJcbiAgICBlbnZpZUZvcm11bGFyaW8oKSB7XHJcbiAgICAgICAgY29uc3QgZm9ybSA9IHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiZm9ybVwiKTtcclxuXHJcbiAgICAgICAgZm9ybS5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgY29uc3QgdXN1YXJpbyA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbdXN1YXJpb11cIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlbmhhID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltzZW5oYV1cIik7XHJcbiAgICAgICAgICAgIHRoaXMuYXV0ZW50aXF1ZVVzdWFyaW8odXN1YXJpbywgc2VuaGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGF1dGVudGlxdWVVc3VhcmlvKHVzdWFyaW8sIHNlbmhhKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vTG9naW5gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxyXG4gICAgICAgICAgICBib2R5OiB7XHJcbiAgICAgICAgICAgICAgICBsb2dpbjogdXN1YXJpby52YWx1ZSxcclxuICAgICAgICAgICAgICAgIHNlbmhhOiBzZW5oYS52YWx1ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuXHJcbiAgICAgICAgICAgIHRoaXMubG9nYVVzdWFyaW8ocmVzcCwgZXJyLCBkYXRhKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dhVXN1YXJpbyhyZXNwLCBlcnIsIGRhdGEpIHtcclxuXHJcbiAgICAgICAgaWYgKHJlc3Auc3RhdHVzICE9PSAyMDApIHtcclxuICAgICAgICAgICAgdGhpcy5lbWl0KFwiZXJyb3JcIiwgZXJyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7ICAgICAgICAgICAgXHJcblxyXG4gICAgICAgICAgICBpZiAoZGF0YS5hZG1pbikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwibG9naW5BZG1pblwiLCBkYXRhKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImxvZ2luQWx1bm9cIiwgZGF0YS5sb2dpbik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZXNxdWVjZXVTZW5oYSgpIHtcclxuICAgICAgICAvL2NvZGlnbyBwcmEgY2hhbWFyIGVtIFVSTFxyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IExvZ2luOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL21lbnUuanNcIik7XHJcbmNvbnN0IE11bHRpZnVuY2lvbmFsID0gcmVxdWlyZShcIi4vbXVsdGlmdW5jaW9uYWwuanNcIik7XHJcbmNvbnN0IE11c2N1bGFjYW8gPSByZXF1aXJlKFwiLi9tdXNjdWxhY2FvLmpzXCIpO1xyXG5cclxuY2xhc3MgTWVudSBleHRlbmRzIEFnZW5kYSB7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgICAgICB0aGlzLm11c2N1bGFjYW8gPSBuZXcgTXVzY3VsYWNhbyhib2R5KTtcclxuICAgICAgICB0aGlzLm11bHRpZnVuY2lvbmFsID0gbmV3IE11bHRpZnVuY2lvbmFsKGJvZHkpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICByZW5kZXIobG9naW4pIHtcclxuICAgICAgICB0aGlzLmJvZHkuaW5uZXJIVE1MID0gVGVtcGxhdGUucmVuZGVyKGxvZ2luKTtcclxuICAgICAgICB0aGlzLm9idGVuaGFDb2RpZ29BbHVubyhsb2dpbik7XHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIGFkZEV2ZW50TGlzdGVuZXIoKSB7XHJcbiAgICAgICAgdGhpcy5ib3Rhb011c2N1bGFjYW8oKTtcclxuICAgICAgICB0aGlzLmJvdGFvTXVsdGlmdW5jaW9uYWwoKTtcclxuICAgICAgICB0aGlzLmxvZ291dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGxvZ291dCgpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb3NodXRkb3duXVwiKS5vbmNsaWNrID0gKCkgPT4gZG9jdW1lbnQubG9jYXRpb24ucmVsb2FkKHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIG9idGVuaGFDb2RpZ29BbHVubyhsb2dpbikge1xyXG5cclxuICAgICAgICB0aGlzLmxvZ2luID0gbG9naW47XHJcblxyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJHRVRcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vbWVudS8ke2xvZ2lufWAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMCkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoXCJBbHVubyBuw6NvIGVuY29udHJhZG9cIik7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvZGlnb0FsdW5vID0gZGF0YS5pZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGJvdGFvTXVzY3VsYWNhbygpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb011c2N1bGFjYW9dXCIpLm9uY2xpY2sgPSAoKSA9PiB0aGlzLnJlbmRlck11c2N1bGFjYW8oKTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJNdXNjdWxhY2FvKCkge1xyXG5cclxuXHJcbiAgICAgICAgY29uc3QgZGF0YSA9IHtcclxuICAgICAgICAgICAgaWRBbHVubzogdGhpcy5jb2RpZ29BbHVubyxcclxuICAgICAgICAgICAgc2FsYTogXCJtdXNjdWxhY2FvXCIsXHJcbiAgICAgICAgICAgIGxvZ2luOiB0aGlzLmxvZ2luXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5tdXNjdWxhY2FvLnJlbmRlcihkYXRhKTtcclxuICAgIH1cclxuXHJcbiAgICBib3Rhb011bHRpZnVuY2lvbmFsKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JvdGFvTXVsdGlmdW5jaW9uYWxdXCIpLm9uY2xpY2sgPSAoKSA9PiB0aGlzLnJlbmRlck11bHRpZnVuY2lvbmFsKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyTXVsdGlmdW5jaW9uYWwoKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IGRhdGEgPSB7XHJcbiAgICAgICAgICAgIGlkQWx1bm86IHRoaXMuY29kaWdvQWx1bm8sXHJcbiAgICAgICAgICAgIHNhbGE6IFwibXVsdGlmdW5jaW9uYWxcIlxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMubXVsdGlmdW5jaW9uYWwucmVuZGVyKGRhdGEpO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE1lbnU7IiwiY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL211bHRpZnVuY2lvbmFsLmpzXCIpO1xyXG5jb25zdCBTYWxhID0gcmVxdWlyZShcIi4vc2FsYS5qc1wiKTtcclxuXHJcbmNsYXNzIE11bHRpZnVuY2lvbmFsIGV4dGVuZHMgU2FsYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihkYXRhKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMub2J0ZW5oYUhvcmFyaW9zQWx1bm9zKGRhdGEpO1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBkYXRhO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE11bHRpZnVuY2lvbmFsOyIsImNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9tdXNjdWxhY2FvLmpzXCIpO1xyXG5jb25zdCBTYWxhID0gcmVxdWlyZShcIi4vc2FsYS5qc1wiKTtcclxuXHJcbmNsYXNzIE11c2N1bGFjYW8gZXh0ZW5kcyBTYWxhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKGRhdGEpIHtcclxuICAgICAgICB0aGlzLmJvZHkuaW5uZXJIVE1MID0gVGVtcGxhdGUucmVuZGVyKCk7XHJcbiAgICAgICAgdGhpcy5vYnRlbmhhSG9yYXJpb3NBbHVub3MoZGF0YSk7XHJcbiAgICAgICAgdGhpcy51c2VyID0gZGF0YTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTXVzY3VsYWNhbzsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IExvZ2luID0gcmVxdWlyZShcIi4vbG9naW4uanNcIik7XHJcblxyXG5jbGFzcyBTYWxhIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IG5ldyBMb2dpbihib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMuYm90YW9Db25maXJtYXIoKTtcclxuICAgICAgICB0aGlzLmJvdGFvQ2FuY2VsYXIoKTtcclxuICAgICAgICB0aGlzLmxvZ291dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGxvZ291dCgpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb1NodXRkb3duXVwiKS5vbmNsaWNrID0gKCkgPT4gZG9jdW1lbnQubG9jYXRpb24ucmVsb2FkKHRydWUpO1xyXG4gICAgfSAgICBcclxuXHJcbiAgICBvYnRlbmhhSG9yYXJpb3NBbHVub3MobG9naW4pIHtcclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L3NhbGEvJHtsb2dpbi5pZEFsdW5vfS8ke2xvZ2luLnNhbGF9YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuYXR1YWxpemVEcm9wRG93bnMoZGF0YS5ob3Jhcmlvcyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgYXR1YWxpemVEcm9wRG93bnMoaG9yYXJpb3MpIHtcclxuXHJcbiAgICAgICAgaWYgKGhvcmFyaW9zKSB7XHJcblxyXG4gICAgICAgICAgICBsZXQgZHJvcERvd25Ib3JhcmlvcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiW3NlbGVjYW9Ib3JhcmlvXVwiKSk7XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZHJvcERvd25Ib3Jhcmlvcy5sZW5ndGg7IGluZGV4KyspIHtcclxuXHJcbiAgICAgICAgICAgICAgICBkcm9wRG93bkhvcmFyaW9zW2luZGV4XS52YWx1ZSA9IGhvcmFyaW9zW2luZGV4XS5mYWl4YUhvcmFyaW87XHJcblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGJvdGFvQ29uZmlybWFyKGRhdGEpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0NvbmZpcm1hcl1cIikub25jbGljayA9ICgpID0+IHRoaXMuaW5zaXJlT3VBdHVhbGl6ZUhvcmFyaW8odGhpcy51c2VyKTtcclxuICAgIH1cclxuXHJcbiAgICBib3Rhb0NhbmNlbGFyKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JvdGFvQ2FuY2VsYXJdXCIpLm9uY2xpY2sgPSAoKSA9PiBkb2N1bWVudC5sb2NhdGlvbi5yZWxvYWQodHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5zaXJlT3VBdHVhbGl6ZUhvcmFyaW8obG9naW4pIHtcclxuXHJcbiAgICAgICAgbGV0IGRyb3BEb3duSG9yYXJpb3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLmJvZHkucXVlcnlTZWxlY3RvckFsbChcIltzZWxlY2FvSG9yYXJpb11cIikpO1xyXG4gICAgICAgIGxldCBkaWFzU2VtYW5hID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCJbZGlhU2VtYW5hXVwiKSk7XHJcblxyXG4gICAgICAgIHZhciBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9zYWxhYCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICAgICAgYm9keTogeyBcclxuICAgICAgICAgICAgICAgIGZhaXhhSG9yYXJpbzogXCJcIixcclxuICAgICAgICAgICAgICAgIGlkQWx1bm86IGxvZ2luLmlkQWx1bm8sXHJcbiAgICAgICAgICAgICAgICBkaWFTZW1hbmE6IFwiXCIsXHJcbiAgICAgICAgICAgICAgICBzYWxhOiBsb2dpbi5zYWxhXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBkcm9wRG93bkhvcmFyaW9zLmxlbmd0aDsgaW5kZXgrKykge1xyXG5cclxuICAgICAgICAgICAgb3B0cy5ib2R5LmZhaXhhSG9yYXJpbyA9IGRyb3BEb3duSG9yYXJpb3NbaW5kZXhdLnZhbHVlO1xyXG4gICAgICAgICAgICBvcHRzLmJvZHkuZGlhU2VtYW5hID0gZGlhc1NlbWFuYVtpbmRleF0uZ2V0QXR0cmlidXRlKCdkaWFzZW1hbmEnKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmVtaXQoXCJhbHVub05hb0luc2VyaWRvXCIsIGVycik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU2FsYTsiLCJjb25zdCBNb2RhbENhZGFzdHJvQWx1bm8gPSByZXF1aXJlKFwiLi9jYWRhc3Ryb0FsdW5vLmpzXCIpO1xyXG5cclxuY29uc3QgcmVuZGVyR3JpZEFsdW5vcyA9IGFsdW5vcyA9PiB7XHJcbiAgICByZXR1cm4gYWx1bm9zLm1hcChhbHVubyA9PiB7XHJcblxyXG4gICAgICAgIGxldCBjb3JMaW5oYSA9IGFsdW5vLmlkICUgMiA9PT0gMCA/IFwiYmFjay1ncmlkcm93MVwiIDogXCJiYWNrLWdyaWRyb3cyXCI7XHJcblxyXG4gICAgICAgIHJldHVybiBgXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvdyAke2NvckxpbmhhfSB0ZXh0LWRhcmtcIj4gICAgICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgZm9ybS1jaGVja1wiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjbGFzcz1cImZvcm0tY2hlY2staW5wdXQgbXQtNFwiIGFsdW5vU2VsZWNpb25hZG8gY29kaWdvQWx1bm89JHthbHVuby5pZH0+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cInRleHQtY2VudGVyIG1iLTJcIj4ke2FsdW5vLm5vbWV9PC9sYWJlbD5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gXCI+XHJcbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0ZXh0LWNlbnRlciBtdC0zXCI+JHthbHVuby5jcGZ9PC9sYWJlbD5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gXCI+XHJcbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0ZXh0LWNlbnRlciBtdC0zXCI+JHthbHVuby5tYXRyaWN1bGF9PC9sYWJlbD5cclxuICAgICAgICAgICAgPC9kaXY+ICAgICAgICBcclxuICAgICAgICA8L2Rpdj5gXHJcbiAgICB9KS5qb2luKFwiXCIpO1xyXG59XHJcblxyXG5leHBvcnRzLnJlbmRlciA9IGFsdW5vcyA9PiB7XHJcblxyXG4gICAgcmV0dXJuIGBcclxuXHJcbiAgICA8ZGl2IGNsYXNzPVwiaW1nLWZsdWlkIHRleHQtcmlnaHQgbXItNSBtdC01IHRleHQtd2hpdGUgYm90YW9TaHV0ZG93blwiIGJvdGFvU2h1dGRvd24+XHJcbiAgICAgICAgPGEgaHJlZj1cIiNcIj48aW1nIHNyYz1cIi4vaW1hZ2VzL3NodXRkb3duLnBuZ1wiIGFsdD1cIlwiPjwvYT5cclxuICAgICAgICA8c3Ryb25nIGNsYXNzPVwibXItMVwiPlNhaXI8L3N0cm9uZz5cclxuICAgIDwvZGl2PlxyXG4gICAgXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XHJcbiAgICAgICAgPGRpdj5cclxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLTIgbXQtMlwiPlxyXG4gICAgICAgICAgICAgICAgw4FyZWEgQWRtaW5pc3RyYXRpdmFcclxuICAgICAgICAgICAgPC9zcGFuPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lclwiPlxyXG4gICAgPGRpdiBjbGFzcz1cInJvdyBcIj5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiZGl2QnVzY2FcIiBjbGFzcz1cImJ1c2NhXCIgYnVzY2EgPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInNlYXJjaFwiIGlkPVwidHh0QnVzY2FcIiBwbGFjZWhvbGRlcj1cIkJ1c2Nhci4uLlwiIGxhYmVsQnVzY2EgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGEgY2xhc3M9XCJcIiBocmVmPVwiI1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9XCIuL2ltYWdlcy9wZXNxdWlzYS5wbmdcIiBpZD1cImJ0bkJ1c2NhXCIgYWx0PVwiQnVzY2FyXCIgYm90YW9CdXNjYXIgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9hPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvdyAgYm9yZGVyIGJvcmRlci13aGl0ZSBiYWNrLWdyaWQgdGV4dC13aGl0ZVwiPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIHRleHQtY2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICBOb21lXHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbSB0ZXh0LWNlbnRlclwiPlxyXG4gICAgICAgICAgICAgICAgQ1BGXHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbSB0ZXh0LWNlbnRlclwiPlxyXG4gICAgICAgICAgICAgICAgTWF0csOtY3VsYVxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgJHtyZW5kZXJHcmlkQWx1bm9zKGFsdW5vcyl9XHJcblxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXIgY29sLXNtIG10LTNcIj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNlbnRlcmVkXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnkgYnRuLWRhcmtcIiBkYXRhLXRvZ2dsZT1cIm1vZGFsXCIgZGF0YS10YXJnZXQ9XCIjbW9kYWxDYWRhc3Ryb0FsdW5vXCIgYm90YW9BZGljaW9uYXI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEFkaWNpb25hclxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tZGFya1wiIGJvdGFvRWRpdGFyPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBFZGl0YXJcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLWRhcmtcIiBib3Rhb0V4Y2x1aXI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEV4Y2x1aXJcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgJHtNb2RhbENhZGFzdHJvQWx1bm8ucmVuZGVyKCl9XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj4gICAgXHJcbiAgICBgO1xyXG59IiwiY29uc3QgaW5wdXRFbmRlcmVjbyA9IGBcclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJjaWRhZGVcIj5DaWRhZGU8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdHlwZT1cInRleHRcIiByZXF1aXJlZCBjaWRhZGUvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJiYWlycm9cIj5CYWlycm88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdHlwZT1cInRleHRcIiByZXF1aXJlZCBiYWlycm8vPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJudW1lcm9cIj5Ow7ptZXJvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQgbnVtZXJvLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY29tcGxlbWVudG9cIj5Mb2dyYWRvdXJvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHR5cGU9XCJ0ZXh0XCIgY29tcGxlbWVudG8vPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbmA7XHJcblxyXG5jb25zdCBtb2RhbENhZGFzdHJvQWx1bm8gPSBgXHJcbjxkaXYgY2xhc3M9XCJtb2RhbCBmYWRlXCIgaWQ9XCJtb2RhbENhZGFzdHJvQWx1bm9cIiB0YWJpbmRleD1cIi0xXCIgcm9sZT1cImRpYWxvZ1wiIGFyaWEtbGFiZWxsZWRieT1cInRpdHVsb01vZGFsXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCIgbW9kYWw+XHJcbiAgICA8ZGl2IGNsYXNzPVwibW9kYWwtZGlhbG9nIG1vZGFsLWRpYWxvZy1jZW50ZXJlZFwiIHJvbGU9XCJkb2N1bWVudFwiID5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtY29udGVudFwiPlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWhlYWRlclwiPlxyXG4gICAgICAgICAgICAgICAgPGg1IGNsYXNzPVwibW9kYWwtdGl0bGVcIiBpZD1cInRpdHVsb01vZGFsXCI+QWRpY2lvbmFyIE5vdm8gQWx1bm88L2g1PlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJjbG9zZVwiIGRhdGEtZGlzbWlzcz1cIm1vZGFsXCIgYXJpYS1sYWJlbD1cIkZlY2hhclwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPiZ0aW1lczs8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICA8Zm9ybT5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1ib2R5XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWw+Tm9tZSBDb21wbGV0bzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmsgY29sLXNtXCIgbm9tZT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiIGlkPVwiaW5jbHVkZV9kYXRlXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWw+RGF0YSBkZSBOYXNjaW1lbnRvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFyayBjb2wtc21cIiBkYXRhTmFzY2ltZW50bz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJjcGZcIj5DUEY8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGlkPVwiY3BmXCIgdHlwZT1cInRleHRcIiBhdXRvY29tcGxldGU9XCJvZmZcIiBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIGNwZj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cInRlbFwiPlRlbGVmb25lPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBpZD1cInRlbFwiIHR5cGU9XCJ0ZXh0XCIgYXV0b2NvbXBsZXRlPVwib2ZmXCIgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiB0ZWxlZm9uZT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJlbWFpbFwiPkUtbWFpbDwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgaWQ9XCJlbWFpbFwiIHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiBlbWFpbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+ICAgICAgICAgICAgICAgICAgICBcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgJHtpbnB1dEVuZGVyZWNvfVxyXG5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWZvb3RlclwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBkYXRhLWRpc21pc3M9XCJtb2RhbFwiPkZlY2hhcjwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cInN1Ym1pdFwiIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCIgYm90YW9TYWx2YXI+U2FsdmFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPC9mb3JtPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5gO1xyXG5cclxuXHJcbmV4cG9ydHMucmVuZGVyID0gKCkgPT4ge1xyXG4gICAgcmV0dXJuIG1vZGFsQ2FkYXN0cm9BbHVubztcclxufSIsImNvbnN0IGRyb3BEb3duSG9yYXJpbyA9IGBcclxuPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgY29sLXNtIFwiPlxyXG4gICAgPGxhYmVsIGZvcj1cInNlbGVjdC1ob3VyXCI+U2VsZWNpb25lIG8gaG9yw6FyaW88L2xhYmVsPlxyXG4gICAgPHNlbGVjdCBjbGFzcz1cImZvcm0tY29udHJvbCBcIiBzZWxlY2FvSG9yYXJpbz5cclxuICAgICAgICA8b3B0aW9uPjA3OjAwIC0gMDc6MzA8L29wdGlvbj4gICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgPG9wdGlvbj4wNzo0MCAtIDA4OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4wODoyMCAtIDA4OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4wOTowMCAtIDA5OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4wOTo0MCAtIDEwOjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMDoyMCAtIDEwOjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMTowMCAtIDExOjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMTo0MCAtIDEyOjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMjoyMCAtIDEyOjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMzowMCAtIDEzOjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMzo0MCAtIDE0OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNDoyMCAtIDE0OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNTowMCAtIDE1OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNTo0MCAtIDE2OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNjoyMCAtIDE2OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNzowMCAtIDE3OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNzo0MCAtIDE4OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xODoyMCAtIDE4OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xOTowMCAtIDE5OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xOTo0MCAtIDIwOjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4yMDoyMCAtIDIwOjUwPC9vcHRpb24+XHJcbiAgICA8L3NlbGVjdD5cclxuPC9kaXY+XHJcbmA7XHJcblxyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSBob3JhcmlvcyA9PiB7XHJcbiAgICByZXR1cm4gYFxyXG48ZGl2IGNsYXNzPVwiY29udGFpbmVyICBib3JkZXIgYm9yZGVyLWRhcmsgIG10LTUgY29sLTZcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJyb3cgXCI+XHJcblxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC14bC1jZW50ZXIgYmFjay1ncmlkIHRleHQtd2hpdGVcIj5cclxuICAgICAgICAgICAgU2VsZWNpb25lIHVtIGhvcsOhcmlvIHBhcmEgY2FkYSBkaWEgZGEgc2VtYW5hOlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuXHJcbjxkaXYgY2xhc3M9XCJtYi0zXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cxIHRleHQtZGFyayBjb2wtNlwiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3cgXCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIG10LTRcIiBkaWFTZW1hbmE9XCJzZWd1bmRhXCI+XHJcbiAgICAgICAgICAgICAgICBTZWd1bmRhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG4gICAgXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIGNvbC02IGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cyIHRleHQtZGFya1wiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIiBkaWFTZW1hbmE9XCJ0ZXJjYVwiPlxyXG4gICAgICAgICAgICAgICAgVGVyw6dhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2wtNiBjb250YWluZXIgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzEgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiIGRpYVNlbWFuYT1cInF1YXJ0YVwiPlxyXG4gICAgICAgICAgICAgICAgUXVhcnRhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbC02IGNvbnRhaW5lciBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MiB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCIgZGlhU2VtYW5hPVwicXVpbnRhXCI+XHJcbiAgICAgICAgICAgICAgICBRdWludGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbC02IGNvbnRhaW5lciBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MSB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCIgZGlhU2VtYW5hPVwic2V4dGFcIj5cclxuICAgICAgICAgICAgICAgIFNleHRhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2wtNiBjb250YWluZXIgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzIgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC02XCIgZGlhU2VtYW5hPVwic2FiYWRvXCI+XHJcbiAgICAgICAgICAgICAgICBTw6FiYWRvOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuXHJcblxyXG48ZGl2IGNsYXNzPVwiIGNvbnRhaW5lciBjb2wtc21cIj5cclxuICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2VudGVyZWRcIj5cclxuXHJcbiAgICAgICAgICAgIDxidXR0b24gdHlwZT1cInN1Ym1pdFwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrXCIgYm90YW9Db25maXJtYXI+XHJcbiAgICAgICAgICAgICAgICBDb25maXJtYXJcclxuICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLWRhcmsgbWwtNVwiIGJvdGFvQ2FuY2VsYXI+XHJcbiAgICAgICAgICAgICAgICBDYW5jZWxhclxyXG4gICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5cclxuPHAgY2xhc3M9XCJ0ZXh0LWNlbnRlciB0ZXh0LXdoaXRlIGZvbnQtaXRhbGljIHAtM1wiPioqQ2FzbyBhbGd1bSBob3LDoXJpbyBhdGluamEgYSBsb3Rhw6fDo28gbcOheGltYSBkZSBhbHVub3MsIG8gPGJyPiBob3LDoXJpbyBmaWNhcsOhIGVtIHZlcm1lbGhvIGUgbsOjbyBwb2RlcsOhIHNlciBzZWxlY2lvbmFkby48L3A+XHJcblxyXG4gICAgYFxyXG59IiwiZXhwb3J0cy5yZW5kZXIgPSAoKSA9PiB7XHJcbiAgICByZXR1cm4gYCA8Ym9keT5cclxuICAgIDxsYWJlbCBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtdC04MFwiPkFjZXNzbyBkYSBDb250YTwvbGFiZWw+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY2FyZFwiIGlkPVwidGVsYUxvZ2luXCI+ICAgICAgIFxyXG4gICAgICAgIDxtYWluPiAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cclxuICAgICAgICAgICAgICAgIDxmb3JtPlxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwIHJzMSB2YWxpZGF0ZS1pbnB1dFwiIGRhdGEtdmFsaWRhdGU9XCJDYW1wbyBvYnJpZ2F0w7NyaW9cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJmb3JtLWNvbnRyb2xcIiBpZD1cIlwiIHBsYWNlaG9sZGVyPVwiVXN1w6FyaW9cIiB1c3VhcmlvPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgcnMyIHZhbGlkYXRlLWlucHV0XCIgZGF0YS12YWxpZGF0ZT1cIkNhbXBvIG9icmlnYXTDs3Jpb1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInBhc3N3b3JkXCIgY2xhc3M9XCJmb3JtLWNvbnRyb2xcIiBpZD1cIlwiIHBsYWNlaG9sZGVyPVwiU2VuaGFcIiBzZW5oYT5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwic3VibWl0XCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnkgYnRuIGJ0bi1vdXRsaW5lLWRhcmsgYnRuLWxnIGJ0bi1ibG9ja1wiIGJvdGFvTG9naW4+RW50cmFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRleHQtY2VudGVyIHctZnVsbCBwLXQtMjNcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGEgaHJlZj1cIiNcIiBjbGFzcz1cInRleHQtc2Vjb25kYXJ5XCI+XHJcblx0XHQgICAgXHRcdFx0XHRcdEVzcXVlY2V1IGEgU2VuaGE/IEVudHJlIGVtIENvbnRhdG8gQ29ub3NjbyBDbGljYW5kbyBBcXVpLlxyXG5cdFx0ICAgIFx0XHRcdFx0PC9hPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPC9mb3JtPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L21haW4+XHJcbiAgICAgICAgPGZvb3Rlcj48L2Zvb3Rlcj5cclxuICAgIDwvZGl2PlxyXG48L2JvZHk+XHJcbjxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9jb2RlLmpxdWVyeS5jb20vanF1ZXJ5LTMuMy4xLnNsaW0ubWluLmpzXCIgaW50ZWdyaXR5PVwic2hhMzg0LXE4aS9YKzk2NUR6TzByVDdhYks0MUpTdFFJQXFWZ1JWenBiem81c21YS3A0WWZSdkgrOGFidFRFMVBpNmppem9cIiBjcm9zc29yaWdpbj1cImFub255bW91c1wiPjwvc2NyaXB0PlxyXG48c2NyaXB0IHNyYz1cImh0dHBzOi8vY2RuanMuY2xvdWRmbGFyZS5jb20vYWpheC9saWJzL3BvcHBlci5qcy8xLjE0LjcvdW1kL3BvcHBlci5taW4uanNcIiBpbnRlZ3JpdHk9XCJzaGEzODQtVU8yZVQwQ3BIcWRTSlE2aEp0eTVLVnBodFBoeldqOVdPMWNsSFRNR2EzSkRad3JuUXE0c0Y4NmRJSE5EejBXMVwiIGNyb3Nzb3JpZ2luPVwiYW5vbnltb3VzXCI+PC9zY3JpcHQ+XHJcbjxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9zdGFja3BhdGguYm9vdHN0cmFwY2RuLmNvbS9ib290c3RyYXAvNC4zLjEvanMvYm9vdHN0cmFwLm1pbi5qc1wiIGludGVncml0eT1cInNoYTM4NC1KalNtVmd5ZDBwM3BYQjFyUmliWlVBWW9JSXk2T3JRNlZyaklFYUZmL25KR3pJeEZEc2Y0eDB4SU0rQjA3alJNXCIgY3Jvc3NvcmlnaW49XCJhbm9ueW1vdXNcIj48L3NjcmlwdD5gO1xyXG59IiwiZXhwb3J0cy5yZW5kZXIgPSBsb2dpbiA9PiB7XHJcbiAgICByZXR1cm4gYFxyXG5cclxuICAgIDxkaXYgY3BmQWx1bm89JHtsb2dpbn0+PC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwibGltaXRlclwiPlxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiaW1nLWZsdWlkIHRleHQtcmlnaHQgbXItNSBtdC01IHRleHQtd2hpdGUgYm90YW9TaHV0ZG93blwiIGJvdGFvU2h1dGRvd24+XHJcbiAgICAgICAgICAgIDxhIGhyZWY9XCIjXCI+PGltZyBzcmM9XCIuL2ltYWdlcy9zaHV0ZG93bi5wbmdcIiBhbHQ9XCJcIj48L2E+XHJcbiAgICAgICAgICAgIDxzdHJvbmcgY2xhc3M9XCJtci0xXCI+U2Fpcjwvc3Ryb25nPlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1sb2dpbjEwMFwiPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwid3JhcC1sb2dpbjEwMCBwLWItMTYwIHAtdC01MFwiPlxyXG5cclxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibG9naW4xMDAtZm9ybS10aXRsZSBwLWItNDNcIj5cclxuICAgICAgICAgICAgICAgICAgICBTZWxlY2lvbmUgdW1hIHNhbGEgcGFyYSBmYXplciBhIG1hcmNhw6fDo28gZGFzIGF1bGFzXHJcbiAgICAgICAgICAgICAgICA8L3NwYW4+XHJcblxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJtZW51MTAwLWZvcm0tYnRuMlwiIGJvdGFvTXVzY3VsYWNhbz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIE11c2N1bGHDp8OjbyAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cIm1lbnUxMDAtZm9ybS1idG4xXCIgYm90YW9NdWx0aWZ1bmNpb25hbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgTXVsdGlmdW5jaW9uYWxcclxuICAgICAgICAgICAgICAgICAgICA8L2E+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuYDtcclxufSIsImNvbnN0IEdyaWRNYXJjYWNhbyA9IHJlcXVpcmUoJy4vZ3JpZE1hcmNhY2FvLmpzJyk7XHJcblxyXG5leHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBgXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIFwiPlxyXG4gICAgPGRpdiBjbGFzcz1cImltZy1mbHVpZCB0ZXh0LXJpZ2h0IG1yLTUgbXQtNSB0ZXh0LXdoaXRlIGJvdGFvU2h1dGRvd25cIiBib3Rhb1NodXRkb3duPlxyXG4gICAgPGEgaHJlZj1cIiNcIj48aW1nIHNyYz1cIi4vaW1hZ2VzL3NodXRkb3duLnBuZ1wiIGFsdD1cIlwiPjwvYT5cclxuICAgIDxzdHJvbmcgY2xhc3M9XCJtci0xXCI+U2Fpcjwvc3Ryb25nPlxyXG48L2Rpdj5cclxuICAgIDxkaXY+XHJcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLTJcIj5cclxuICAgICAgICAgICAgU2FsYSBNdWx0aWZ1bmNpb25hbCAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgPC9zcGFuPlxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5cclxuJHtHcmlkTWFyY2FjYW8ucmVuZGVyKCl9XHJcblxyXG5gO1xyXG59IiwiY29uc3QgR3JpZE1hcmNhY2FvID0gcmVxdWlyZSgnLi9ncmlkTWFyY2FjYW8uanMnKTtcclxuXHJcbmV4cG9ydHMucmVuZGVyID0gaG9yYXJpb3MgPT4ge1xyXG4gICAgcmV0dXJuIGBcclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXIgXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwiaW1nLWZsdWlkIHRleHQtcmlnaHQgbXItNSBtdC01IHRleHQtd2hpdGUgYm90YW9TaHV0ZG93blwiIGJvdGFvU2h1dGRvd24+XHJcbiAgICA8YSBocmVmPVwiI1wiPjxpbWcgc3JjPVwiLi9pbWFnZXMvc2h1dGRvd24ucG5nXCIgYWx0PVwiXCI+PC9hPlxyXG4gICAgPHN0cm9uZyBjbGFzcz1cIm1yLTFcIj5TYWlyPC9zdHJvbmc+XHJcbjwvZGl2PlxyXG4gICAgPGRpdj5cclxuICAgICAgICA8c3BhbiBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtMlwiPlxyXG4gICAgICAgICAgICBTYWxhIE11c2N1bGFjYW8gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIDwvc3Bhbj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuXHJcbiR7R3JpZE1hcmNhY2FvLnJlbmRlcihob3Jhcmlvcyl9XHJcblxyXG5gO1xyXG59IiwiY29uc3QgQXBwID0gcmVxdWlyZShcIi4vYXBwLmpzXCIpO1xyXG5cclxud2luZG93Lm9ubG9hZCA9ICgpID0+IHtcclxuICAgIGNvbnN0IG1haW4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwibWFpblwiKTtcclxuICAgIG5ldyBBcHAobWFpbikuaW5pdCgpO1xyXG59Il19
