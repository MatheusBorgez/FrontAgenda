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
    }

    logout() {
        this.body.querySelector("[botaoShutdown]").onclick = () => document.location.reload(true);
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
        this.body.querySelector("[botaoCancelar]").onclick = () => this.volteMenu();
    }

    volteMenu() {
        console.log(this.user);
        this.emit("loginAluno", this.user.login);
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
                            <label for="complemento">Complemento</label>
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXF1ZXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RpbnktZW1pdHRlci9pbmRleC5qcyIsInNyYy9hcHAuanMiLCJzcmMvY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzIiwic3JjL2NvbXBvbmVudHMvYWdlbmRhLmpzIiwic3JjL2NvbXBvbmVudHMvY2FkYXN0cm9BbHVuby5qcyIsInNyYy9jb21wb25lbnRzL2xvZ2luLmpzIiwic3JjL2NvbXBvbmVudHMvbWVudS5qcyIsInNyYy9jb21wb25lbnRzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL2NvbXBvbmVudHMvbXVzY3VsYWNhby5qcyIsInNyYy9jb21wb25lbnRzL3NhbGEuanMiLCJzcmMvdGVtcGxhdGVzL2FkbWluaXN0cmFjYW8uanMiLCJzcmMvdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanMiLCJzcmMvdGVtcGxhdGVzL2dyaWRNYXJjYWNhby5qcyIsInNyYy90ZW1wbGF0ZXMvbG9naW4uanMiLCJzcmMvdGVtcGxhdGVzL21lbnUuanMiLCJzcmMvdGVtcGxhdGVzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL3RlbXBsYXRlcy9tdXNjdWxhY2FvLmpzIiwiaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBLE1BQU0sUUFBUSxRQUFRLHVCQUFSLENBQWQ7QUFDQSxNQUFNLGdCQUFnQixRQUFRLCtCQUFSLENBQXRCO0FBQ0EsTUFBTSxPQUFPLFFBQVEsc0JBQVIsQ0FBYjtBQUNBLE1BQU0sYUFBYSxRQUFRLDRCQUFSLENBQW5CO0FBQ0EsTUFBTSxp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aEIsZUFBZ0I7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0tBL0UxQjtBQTBHSCxDQTNHRDs7O0FDOUJBLFFBQVEsTUFBUixHQUFpQixNQUFNO0FBQ25CLFdBQVE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzJNQUFSO0FBOEJILENBL0JEOzs7QUNBQSxRQUFRLE1BQVIsR0FBaUIsU0FBUztBQUN0QixXQUFROztvQkFFUSxLQUFNOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQUZ0QjtBQW1DSCxDQXBDRDs7O0FDQUEsTUFBTSxlQUFlLFFBQVEsbUJBQVIsQ0FBckI7O0FBRUEsUUFBUSxNQUFSLEdBQWlCLE1BQU07QUFDbkIsV0FBUTs7Ozs7Ozs7Ozs7OztFQWFWLGFBQWEsTUFBYixFQUFzQjs7Q0FicEI7QUFnQkgsQ0FqQkQ7OztBQ0ZBLE1BQU0sZUFBZSxRQUFRLG1CQUFSLENBQXJCOztBQUVBLFFBQVEsTUFBUixHQUFpQixZQUFZO0FBQ3pCLFdBQVE7Ozs7Ozs7Ozs7Ozs7RUFhVixhQUFhLE1BQWIsQ0FBb0IsUUFBcEIsQ0FBOEI7O0NBYjVCO0FBZ0JILENBakJEOzs7QUNGQSxNQUFNLE1BQU0sUUFBUSxVQUFSLENBQVo7O0FBRUEsT0FBTyxNQUFQLEdBQWdCLE1BQU07QUFDbEIsVUFBTSxPQUFPLFNBQVMsYUFBVCxDQUF1QixNQUF2QixDQUFiO0FBQ0EsUUFBSSxHQUFKLENBQVEsSUFBUixFQUFjLElBQWQ7QUFDSCxDQUhEIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiLy8gQnJvd3NlciBSZXF1ZXN0XHJcbi8vXHJcbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XHJcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cclxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XHJcbi8vXHJcbi8vICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcclxuLy9cclxuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxyXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXHJcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxyXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXHJcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxyXG5cclxuLy8gVU1EIEhFQURFUiBTVEFSVCBcclxuKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XHJcbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxyXG4gICAgICAgIGRlZmluZShbXSwgZmFjdG9yeSk7XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIC8vIE5vZGUuIERvZXMgbm90IHdvcmsgd2l0aCBzdHJpY3QgQ29tbW9uSlMsIGJ1dFxyXG4gICAgICAgIC8vIG9ubHkgQ29tbW9uSlMtbGlrZSBlbnZpcm9tZW50cyB0aGF0IHN1cHBvcnQgbW9kdWxlLmV4cG9ydHMsXHJcbiAgICAgICAgLy8gbGlrZSBOb2RlLlxyXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBCcm93c2VyIGdsb2JhbHMgKHJvb3QgaXMgd2luZG93KVxyXG4gICAgICAgIHJvb3QucmV0dXJuRXhwb3J0cyA9IGZhY3RvcnkoKTtcclxuICB9XHJcbn0odGhpcywgZnVuY3Rpb24gKCkge1xyXG4vLyBVTUQgSEVBREVSIEVORFxyXG5cclxudmFyIFhIUiA9IFhNTEh0dHBSZXF1ZXN0XHJcbmlmICghWEhSKSB0aHJvdyBuZXcgRXJyb3IoJ21pc3NpbmcgWE1MSHR0cFJlcXVlc3QnKVxyXG5yZXF1ZXN0LmxvZyA9IHtcclxuICAndHJhY2UnOiBub29wLCAnZGVidWcnOiBub29wLCAnaW5mbyc6IG5vb3AsICd3YXJuJzogbm9vcCwgJ2Vycm9yJzogbm9vcFxyXG59XHJcblxyXG52YXIgREVGQVVMVF9USU1FT1VUID0gMyAqIDYwICogMTAwMCAvLyAzIG1pbnV0ZXNcclxuXHJcbi8vXHJcbi8vIHJlcXVlc3RcclxuLy9cclxuXHJcbmZ1bmN0aW9uIHJlcXVlc3Qob3B0aW9ucywgY2FsbGJhY2spIHtcclxuICAvLyBUaGUgZW50cnktcG9pbnQgdG8gdGhlIEFQSTogcHJlcCB0aGUgb3B0aW9ucyBvYmplY3QgYW5kIHBhc3MgdGhlIHJlYWwgd29yayB0byBydW5feGhyLlxyXG4gIGlmKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJylcclxuICAgIHRocm93IG5ldyBFcnJvcignQmFkIGNhbGxiYWNrIGdpdmVuOiAnICsgY2FsbGJhY2spXHJcblxyXG4gIGlmKCFvcHRpb25zKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBvcHRpb25zIGdpdmVuJylcclxuXHJcbiAgdmFyIG9wdGlvbnNfb25SZXNwb25zZSA9IG9wdGlvbnMub25SZXNwb25zZTsgLy8gU2F2ZSB0aGlzIGZvciBsYXRlci5cclxuXHJcbiAgaWYodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnKVxyXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfTtcclxuICBlbHNlXHJcbiAgICBvcHRpb25zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRpb25zKSk7IC8vIFVzZSBhIGR1cGxpY2F0ZSBmb3IgbXV0YXRpbmcuXHJcblxyXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnNfb25SZXNwb25zZSAvLyBBbmQgcHV0IGl0IGJhY2suXHJcblxyXG4gIGlmIChvcHRpb25zLnZlcmJvc2UpIHJlcXVlc3QubG9nID0gZ2V0TG9nZ2VyKCk7XHJcblxyXG4gIGlmKG9wdGlvbnMudXJsKSB7XHJcbiAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJsO1xyXG4gICAgZGVsZXRlIG9wdGlvbnMudXJsO1xyXG4gIH1cclxuXHJcbiAgaWYoIW9wdGlvbnMudXJpICYmIG9wdGlvbnMudXJpICE9PSBcIlwiKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy51cmkgaXMgYSByZXF1aXJlZCBhcmd1bWVudFwiKTtcclxuXHJcbiAgaWYodHlwZW9mIG9wdGlvbnMudXJpICE9IFwic3RyaW5nXCIpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLnVyaSBtdXN0IGJlIGEgc3RyaW5nXCIpO1xyXG5cclxuICB2YXIgdW5zdXBwb3J0ZWRfb3B0aW9ucyA9IFsncHJveHknLCAnX3JlZGlyZWN0c0ZvbGxvd2VkJywgJ21heFJlZGlyZWN0cycsICdmb2xsb3dSZWRpcmVjdCddXHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bnN1cHBvcnRlZF9vcHRpb25zLmxlbmd0aDsgaSsrKVxyXG4gICAgaWYob3B0aW9uc1sgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSBdKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLlwiICsgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSArIFwiIGlzIG5vdCBzdXBwb3J0ZWRcIilcclxuXHJcbiAgb3B0aW9ucy5jYWxsYmFjayA9IGNhbGxiYWNrXHJcbiAgb3B0aW9ucy5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCAnR0VUJztcclxuICBvcHRpb25zLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge307XHJcbiAgb3B0aW9ucy5ib2R5ICAgID0gb3B0aW9ucy5ib2R5IHx8IG51bGxcclxuICBvcHRpb25zLnRpbWVvdXQgPSBvcHRpb25zLnRpbWVvdXQgfHwgcmVxdWVzdC5ERUZBVUxUX1RJTUVPVVRcclxuXHJcbiAgaWYob3B0aW9ucy5oZWFkZXJzLmhvc3QpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJPcHRpb25zLmhlYWRlcnMuaG9zdCBpcyBub3Qgc3VwcG9ydGVkXCIpO1xyXG5cclxuICBpZihvcHRpb25zLmpzb24pIHtcclxuICAgIG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgPSBvcHRpb25zLmhlYWRlcnMuYWNjZXB0IHx8ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG4gICAgaWYob3B0aW9ucy5tZXRob2QgIT09ICdHRVQnKVxyXG4gICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gJ2FwcGxpY2F0aW9uL2pzb24nXHJcblxyXG4gICAgaWYodHlwZW9mIG9wdGlvbnMuanNvbiAhPT0gJ2Jvb2xlYW4nKVxyXG4gICAgICBvcHRpb25zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXHJcbiAgICBlbHNlIGlmKHR5cGVvZiBvcHRpb25zLmJvZHkgIT09ICdzdHJpbmcnKVxyXG4gICAgICBvcHRpb25zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmJvZHkpXHJcbiAgfVxyXG4gIFxyXG4gIC8vQkVHSU4gUVMgSGFja1xyXG4gIHZhciBzZXJpYWxpemUgPSBmdW5jdGlvbihvYmopIHtcclxuICAgIHZhciBzdHIgPSBbXTtcclxuICAgIGZvcih2YXIgcCBpbiBvYmopXHJcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcclxuICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcclxuICAgICAgfVxyXG4gICAgcmV0dXJuIHN0ci5qb2luKFwiJlwiKTtcclxuICB9XHJcbiAgXHJcbiAgaWYob3B0aW9ucy5xcyl7XHJcbiAgICB2YXIgcXMgPSAodHlwZW9mIG9wdGlvbnMucXMgPT0gJ3N0cmluZycpPyBvcHRpb25zLnFzIDogc2VyaWFsaXplKG9wdGlvbnMucXMpO1xyXG4gICAgaWYob3B0aW9ucy51cmkuaW5kZXhPZignPycpICE9PSAtMSl7IC8vbm8gZ2V0IHBhcmFtc1xyXG4gICAgICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmkrJyYnK3FzO1xyXG4gICAgfWVsc2V7IC8vZXhpc3RpbmcgZ2V0IHBhcmFtc1xyXG4gICAgICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmkrJz8nK3FzO1xyXG4gICAgfVxyXG4gIH1cclxuICAvL0VORCBRUyBIYWNrXHJcbiAgXHJcbiAgLy9CRUdJTiBGT1JNIEhhY2tcclxuICB2YXIgbXVsdGlwYXJ0ID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICAvL3RvZG86IHN1cHBvcnQgZmlsZSB0eXBlICh1c2VmdWw/KVxyXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xyXG4gICAgcmVzdWx0LmJvdW5kcnkgPSAnLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLScrTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpKjEwMDAwMDAwMDApO1xyXG4gICAgdmFyIGxpbmVzID0gW107XHJcbiAgICBmb3IodmFyIHAgaW4gb2JqKXtcclxuICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XHJcbiAgICAgICAgICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgICAgICAgICAnLS0nK3Jlc3VsdC5ib3VuZHJ5K1wiXFxuXCIrXHJcbiAgICAgICAgICAgICAgICAnQ29udGVudC1EaXNwb3NpdGlvbjogZm9ybS1kYXRhOyBuYW1lPVwiJytwKydcIicrXCJcXG5cIitcclxuICAgICAgICAgICAgICAgIFwiXFxuXCIrXHJcbiAgICAgICAgICAgICAgICBvYmpbcF0rXCJcXG5cIlxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGxpbmVzLnB1c2goICctLScrcmVzdWx0LmJvdW5kcnkrJy0tJyApO1xyXG4gICAgcmVzdWx0LmJvZHkgPSBsaW5lcy5qb2luKCcnKTtcclxuICAgIHJlc3VsdC5sZW5ndGggPSByZXN1bHQuYm9keS5sZW5ndGg7XHJcbiAgICByZXN1bHQudHlwZSA9ICdtdWx0aXBhcnQvZm9ybS1kYXRhOyBib3VuZGFyeT0nK3Jlc3VsdC5ib3VuZHJ5O1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxuICB9XHJcbiAgXHJcbiAgaWYob3B0aW9ucy5mb3JtKXtcclxuICAgIGlmKHR5cGVvZiBvcHRpb25zLmZvcm0gPT0gJ3N0cmluZycpIHRocm93KCdmb3JtIG5hbWUgdW5zdXBwb3J0ZWQnKTtcclxuICAgIGlmKG9wdGlvbnMubWV0aG9kID09PSAnUE9TVCcpe1xyXG4gICAgICAgIHZhciBlbmNvZGluZyA9IChvcHRpb25zLmVuY29kaW5nIHx8ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBlbmNvZGluZztcclxuICAgICAgICBzd2l0Y2goZW5jb2Rpbmcpe1xyXG4gICAgICAgICAgICBjYXNlICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOlxyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5ib2R5ID0gc2VyaWFsaXplKG9wdGlvbnMuZm9ybSkucmVwbGFjZSgvJTIwL2csIFwiK1wiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdtdWx0aXBhcnQvZm9ybS1kYXRhJzpcclxuICAgICAgICAgICAgICAgIHZhciBtdWx0aSA9IG11bHRpcGFydChvcHRpb25zLmZvcm0pO1xyXG4gICAgICAgICAgICAgICAgLy9vcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBtdWx0aS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmJvZHkgPSBtdWx0aS5ib2R5O1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IG11bHRpLnR5cGU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdCA6IHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgZW5jb2Rpbmc6JytlbmNvZGluZyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICAvL0VORCBGT1JNIEhhY2tcclxuXHJcbiAgLy8gSWYgb25SZXNwb25zZSBpcyBib29sZWFuIHRydWUsIGNhbGwgYmFjayBpbW1lZGlhdGVseSB3aGVuIHRoZSByZXNwb25zZSBpcyBrbm93bixcclxuICAvLyBub3Qgd2hlbiB0aGUgZnVsbCByZXF1ZXN0IGlzIGNvbXBsZXRlLlxyXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnMub25SZXNwb25zZSB8fCBub29wXHJcbiAgaWYob3B0aW9ucy5vblJlc3BvbnNlID09PSB0cnVlKSB7XHJcbiAgICBvcHRpb25zLm9uUmVzcG9uc2UgPSBjYWxsYmFja1xyXG4gICAgb3B0aW9ucy5jYWxsYmFjayA9IG5vb3BcclxuICB9XHJcblxyXG4gIC8vIFhYWCBCcm93c2VycyBkbyBub3QgbGlrZSB0aGlzLlxyXG4gIC8vaWYob3B0aW9ucy5ib2R5KVxyXG4gIC8vICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBvcHRpb25zLmJvZHkubGVuZ3RoO1xyXG5cclxuICAvLyBIVFRQIGJhc2ljIGF1dGhlbnRpY2F0aW9uXHJcbiAgaWYoIW9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uICYmIG9wdGlvbnMuYXV0aClcclxuICAgIG9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uID0gJ0Jhc2ljICcgKyBiNjRfZW5jKG9wdGlvbnMuYXV0aC51c2VybmFtZSArICc6JyArIG9wdGlvbnMuYXV0aC5wYXNzd29yZCk7XHJcblxyXG4gIHJldHVybiBydW5feGhyKG9wdGlvbnMpXHJcbn1cclxuXHJcbnZhciByZXFfc2VxID0gMFxyXG5mdW5jdGlvbiBydW5feGhyKG9wdGlvbnMpIHtcclxuICB2YXIgeGhyID0gbmV3IFhIUlxyXG4gICAgLCB0aW1lZF9vdXQgPSBmYWxzZVxyXG4gICAgLCBpc19jb3JzID0gaXNfY3Jvc3NEb21haW4ob3B0aW9ucy51cmkpXHJcbiAgICAsIHN1cHBvcnRzX2NvcnMgPSAoJ3dpdGhDcmVkZW50aWFscycgaW4geGhyKVxyXG5cclxuICByZXFfc2VxICs9IDFcclxuICB4aHIuc2VxX2lkID0gcmVxX3NlcVxyXG4gIHhoci5pZCA9IHJlcV9zZXEgKyAnOiAnICsgb3B0aW9ucy5tZXRob2QgKyAnICcgKyBvcHRpb25zLnVyaVxyXG4gIHhoci5faWQgPSB4aHIuaWQgLy8gSSBrbm93IEkgd2lsbCB0eXBlIFwiX2lkXCIgZnJvbSBoYWJpdCBhbGwgdGhlIHRpbWUuXHJcblxyXG4gIGlmKGlzX2NvcnMgJiYgIXN1cHBvcnRzX2NvcnMpIHtcclxuICAgIHZhciBjb3JzX2VyciA9IG5ldyBFcnJvcignQnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IGNyb3NzLW9yaWdpbiByZXF1ZXN0OiAnICsgb3B0aW9ucy51cmkpXHJcbiAgICBjb3JzX2Vyci5jb3JzID0gJ3Vuc3VwcG9ydGVkJ1xyXG4gICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcclxuICB9XHJcblxyXG4gIHhoci50aW1lb3V0VGltZXIgPSBzZXRUaW1lb3V0KHRvb19sYXRlLCBvcHRpb25zLnRpbWVvdXQpXHJcbiAgZnVuY3Rpb24gdG9vX2xhdGUoKSB7XHJcbiAgICB0aW1lZF9vdXQgPSB0cnVlXHJcbiAgICB2YXIgZXIgPSBuZXcgRXJyb3IoJ0VUSU1FRE9VVCcpXHJcbiAgICBlci5jb2RlID0gJ0VUSU1FRE9VVCdcclxuICAgIGVyLmR1cmF0aW9uID0gb3B0aW9ucy50aW1lb3V0XHJcblxyXG4gICAgcmVxdWVzdC5sb2cuZXJyb3IoJ1RpbWVvdXQnLCB7ICdpZCc6eGhyLl9pZCwgJ21pbGxpc2Vjb25kcyc6b3B0aW9ucy50aW1lb3V0IH0pXHJcbiAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKVxyXG4gIH1cclxuXHJcbiAgLy8gU29tZSBzdGF0ZXMgY2FuIGJlIHNraXBwZWQgb3Zlciwgc28gcmVtZW1iZXIgd2hhdCBpcyBzdGlsbCBpbmNvbXBsZXRlLlxyXG4gIHZhciBkaWQgPSB7J3Jlc3BvbnNlJzpmYWxzZSwgJ2xvYWRpbmcnOmZhbHNlLCAnZW5kJzpmYWxzZX1cclxuXHJcbiAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IG9uX3N0YXRlX2NoYW5nZVxyXG4gIHhoci5vcGVuKG9wdGlvbnMubWV0aG9kLCBvcHRpb25zLnVyaSwgdHJ1ZSkgLy8gYXN5bmNocm9ub3VzXHJcbiAgaWYoaXNfY29ycylcclxuICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSAhISBvcHRpb25zLndpdGhDcmVkZW50aWFsc1xyXG4gIHhoci5zZW5kKG9wdGlvbnMuYm9keSlcclxuICByZXR1cm4geGhyXHJcblxyXG4gIGZ1bmN0aW9uIG9uX3N0YXRlX2NoYW5nZShldmVudCkge1xyXG4gICAgaWYodGltZWRfb3V0KVxyXG4gICAgICByZXR1cm4gcmVxdWVzdC5sb2cuZGVidWcoJ0lnbm9yaW5nIHRpbWVkIG91dCBzdGF0ZSBjaGFuZ2UnLCB7J3N0YXRlJzp4aHIucmVhZHlTdGF0ZSwgJ2lkJzp4aHIuaWR9KVxyXG5cclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdTdGF0ZSBjaGFuZ2UnLCB7J3N0YXRlJzp4aHIucmVhZHlTdGF0ZSwgJ2lkJzp4aHIuaWQsICd0aW1lZF9vdXQnOnRpbWVkX291dH0pXHJcblxyXG4gICAgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5PUEVORUQpIHtcclxuICAgICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3Qgc3RhcnRlZCcsIHsnaWQnOnhoci5pZH0pXHJcbiAgICAgIGZvciAodmFyIGtleSBpbiBvcHRpb25zLmhlYWRlcnMpXHJcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBvcHRpb25zLmhlYWRlcnNba2V5XSlcclxuICAgIH1cclxuXHJcbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuSEVBREVSU19SRUNFSVZFRClcclxuICAgICAgb25fcmVzcG9uc2UoKVxyXG5cclxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5MT0FESU5HKSB7XHJcbiAgICAgIG9uX3Jlc3BvbnNlKClcclxuICAgICAgb25fbG9hZGluZygpXHJcbiAgICB9XHJcblxyXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkRPTkUpIHtcclxuICAgICAgb25fcmVzcG9uc2UoKVxyXG4gICAgICBvbl9sb2FkaW5nKClcclxuICAgICAgb25fZW5kKClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG9uX3Jlc3BvbnNlKCkge1xyXG4gICAgaWYoZGlkLnJlc3BvbnNlKVxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBkaWQucmVzcG9uc2UgPSB0cnVlXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnR290IHJlc3BvbnNlJywgeydpZCc6eGhyLmlkLCAnc3RhdHVzJzp4aHIuc3RhdHVzfSlcclxuICAgIGNsZWFyVGltZW91dCh4aHIudGltZW91dFRpbWVyKVxyXG4gICAgeGhyLnN0YXR1c0NvZGUgPSB4aHIuc3RhdHVzIC8vIE5vZGUgcmVxdWVzdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgLy8gRGV0ZWN0IGZhaWxlZCBDT1JTIHJlcXVlc3RzLlxyXG4gICAgaWYoaXNfY29ycyAmJiB4aHIuc3RhdHVzQ29kZSA9PSAwKSB7XHJcbiAgICAgIHZhciBjb3JzX2VyciA9IG5ldyBFcnJvcignQ09SUyByZXF1ZXN0IHJlamVjdGVkOiAnICsgb3B0aW9ucy51cmkpXHJcbiAgICAgIGNvcnNfZXJyLmNvcnMgPSAncmVqZWN0ZWQnXHJcblxyXG4gICAgICAvLyBEbyBub3QgcHJvY2VzcyB0aGlzIHJlcXVlc3QgZnVydGhlci5cclxuICAgICAgZGlkLmxvYWRpbmcgPSB0cnVlXHJcbiAgICAgIGRpZC5lbmQgPSB0cnVlXHJcblxyXG4gICAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxyXG4gICAgfVxyXG5cclxuICAgIG9wdGlvbnMub25SZXNwb25zZShudWxsLCB4aHIpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBvbl9sb2FkaW5nKCkge1xyXG4gICAgaWYoZGlkLmxvYWRpbmcpXHJcbiAgICAgIHJldHVyblxyXG5cclxuICAgIGRpZC5sb2FkaW5nID0gdHJ1ZVxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1Jlc3BvbnNlIGJvZHkgbG9hZGluZycsIHsnaWQnOnhoci5pZH0pXHJcbiAgICAvLyBUT0RPOiBNYXliZSBzaW11bGF0ZSBcImRhdGFcIiBldmVudHMgYnkgd2F0Y2hpbmcgeGhyLnJlc3BvbnNlVGV4dFxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gb25fZW5kKCkge1xyXG4gICAgaWYoZGlkLmVuZClcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAgZGlkLmVuZCA9IHRydWVcclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IGRvbmUnLCB7J2lkJzp4aHIuaWR9KVxyXG5cclxuICAgIHhoci5ib2R5ID0geGhyLnJlc3BvbnNlVGV4dFxyXG4gICAgaWYob3B0aW9ucy5qc29uKSB7XHJcbiAgICAgIHRyeSAgICAgICAgeyB4aHIuYm9keSA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCkgfVxyXG4gICAgICBjYXRjaCAoZXIpIHsgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soZXIsIHhocikgICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBvcHRpb25zLmNhbGxiYWNrKG51bGwsIHhociwgeGhyLmJvZHkpXHJcbiAgfVxyXG5cclxufSAvLyByZXF1ZXN0XHJcblxyXG5yZXF1ZXN0LndpdGhDcmVkZW50aWFscyA9IGZhbHNlO1xyXG5yZXF1ZXN0LkRFRkFVTFRfVElNRU9VVCA9IERFRkFVTFRfVElNRU9VVDtcclxuXHJcbi8vXHJcbi8vIGRlZmF1bHRzXHJcbi8vXHJcblxyXG5yZXF1ZXN0LmRlZmF1bHRzID0gZnVuY3Rpb24ob3B0aW9ucywgcmVxdWVzdGVyKSB7XHJcbiAgdmFyIGRlZiA9IGZ1bmN0aW9uIChtZXRob2QpIHtcclxuICAgIHZhciBkID0gZnVuY3Rpb24gKHBhcmFtcywgY2FsbGJhY2spIHtcclxuICAgICAgaWYodHlwZW9mIHBhcmFtcyA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgcGFyYW1zID0geyd1cmknOiBwYXJhbXN9O1xyXG4gICAgICBlbHNlIHtcclxuICAgICAgICBwYXJhbXMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHBhcmFtcykpO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAodmFyIGkgaW4gb3B0aW9ucykge1xyXG4gICAgICAgIGlmIChwYXJhbXNbaV0gPT09IHVuZGVmaW5lZCkgcGFyYW1zW2ldID0gb3B0aW9uc1tpXVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBtZXRob2QocGFyYW1zLCBjYWxsYmFjaylcclxuICAgIH1cclxuICAgIHJldHVybiBkXHJcbiAgfVxyXG4gIHZhciBkZSA9IGRlZihyZXF1ZXN0KVxyXG4gIGRlLmdldCA9IGRlZihyZXF1ZXN0LmdldClcclxuICBkZS5wb3N0ID0gZGVmKHJlcXVlc3QucG9zdClcclxuICBkZS5wdXQgPSBkZWYocmVxdWVzdC5wdXQpXHJcbiAgZGUuaGVhZCA9IGRlZihyZXF1ZXN0LmhlYWQpXHJcbiAgcmV0dXJuIGRlXHJcbn1cclxuXHJcbi8vXHJcbi8vIEhUVFAgbWV0aG9kIHNob3J0Y3V0c1xyXG4vL1xyXG5cclxudmFyIHNob3J0Y3V0cyA9IFsgJ2dldCcsICdwdXQnLCAncG9zdCcsICdoZWFkJyBdO1xyXG5zaG9ydGN1dHMuZm9yRWFjaChmdW5jdGlvbihzaG9ydGN1dCkge1xyXG4gIHZhciBtZXRob2QgPSBzaG9ydGN1dC50b1VwcGVyQ2FzZSgpO1xyXG4gIHZhciBmdW5jICAgPSBzaG9ydGN1dC50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICByZXF1ZXN0W2Z1bmNdID0gZnVuY3Rpb24ob3B0cykge1xyXG4gICAgaWYodHlwZW9mIG9wdHMgPT09ICdzdHJpbmcnKVxyXG4gICAgICBvcHRzID0geydtZXRob2QnOm1ldGhvZCwgJ3VyaSc6b3B0c307XHJcbiAgICBlbHNlIHtcclxuICAgICAgb3B0cyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0cykpO1xyXG4gICAgICBvcHRzLm1ldGhvZCA9IG1ldGhvZDtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYXJncyA9IFtvcHRzXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmFwcGx5KGFyZ3VtZW50cywgWzFdKSk7XHJcbiAgICByZXR1cm4gcmVxdWVzdC5hcHBseSh0aGlzLCBhcmdzKTtcclxuICB9XHJcbn0pXHJcblxyXG4vL1xyXG4vLyBDb3VjaERCIHNob3J0Y3V0XHJcbi8vXHJcblxyXG5yZXF1ZXN0LmNvdWNoID0gZnVuY3Rpb24ob3B0aW9ucywgY2FsbGJhY2spIHtcclxuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXHJcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9XHJcblxyXG4gIC8vIEp1c3QgdXNlIHRoZSByZXF1ZXN0IEFQSSB0byBkbyBKU09OLlxyXG4gIG9wdGlvbnMuanNvbiA9IHRydWVcclxuICBpZihvcHRpb25zLmJvZHkpXHJcbiAgICBvcHRpb25zLmpzb24gPSBvcHRpb25zLmJvZHlcclxuICBkZWxldGUgb3B0aW9ucy5ib2R5XHJcblxyXG4gIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgbm9vcFxyXG5cclxuICB2YXIgeGhyID0gcmVxdWVzdChvcHRpb25zLCBjb3VjaF9oYW5kbGVyKVxyXG4gIHJldHVybiB4aHJcclxuXHJcbiAgZnVuY3Rpb24gY291Y2hfaGFuZGxlcihlciwgcmVzcCwgYm9keSkge1xyXG4gICAgaWYoZXIpXHJcbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSlcclxuXHJcbiAgICBpZigocmVzcC5zdGF0dXNDb2RlIDwgMjAwIHx8IHJlc3Auc3RhdHVzQ29kZSA+IDI5OSkgJiYgYm9keS5lcnJvcikge1xyXG4gICAgICAvLyBUaGUgYm9keSBpcyBhIENvdWNoIEpTT04gb2JqZWN0IGluZGljYXRpbmcgdGhlIGVycm9yLlxyXG4gICAgICBlciA9IG5ldyBFcnJvcignQ291Y2hEQiBlcnJvcjogJyArIChib2R5LmVycm9yLnJlYXNvbiB8fCBib2R5LmVycm9yLmVycm9yKSlcclxuICAgICAgZm9yICh2YXIga2V5IGluIGJvZHkpXHJcbiAgICAgICAgZXJba2V5XSA9IGJvZHlba2V5XVxyXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XHJcbiAgfVxyXG59XHJcblxyXG4vL1xyXG4vLyBVdGlsaXR5XHJcbi8vXHJcblxyXG5mdW5jdGlvbiBub29wKCkge31cclxuXHJcbmZ1bmN0aW9uIGdldExvZ2dlcigpIHtcclxuICB2YXIgbG9nZ2VyID0ge31cclxuICAgICwgbGV2ZWxzID0gWyd0cmFjZScsICdkZWJ1ZycsICdpbmZvJywgJ3dhcm4nLCAnZXJyb3InXVxyXG4gICAgLCBsZXZlbCwgaVxyXG5cclxuICBmb3IoaSA9IDA7IGkgPCBsZXZlbHMubGVuZ3RoOyBpKyspIHtcclxuICAgIGxldmVsID0gbGV2ZWxzW2ldXHJcblxyXG4gICAgbG9nZ2VyW2xldmVsXSA9IG5vb3BcclxuICAgIGlmKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlICYmIGNvbnNvbGVbbGV2ZWxdKVxyXG4gICAgICBsb2dnZXJbbGV2ZWxdID0gZm9ybWF0dGVkKGNvbnNvbGUsIGxldmVsKVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGxvZ2dlclxyXG59XHJcblxyXG5mdW5jdGlvbiBmb3JtYXR0ZWQob2JqLCBtZXRob2QpIHtcclxuICByZXR1cm4gZm9ybWF0dGVkX2xvZ2dlclxyXG5cclxuICBmdW5jdGlvbiBmb3JtYXR0ZWRfbG9nZ2VyKHN0ciwgY29udGV4dCkge1xyXG4gICAgaWYodHlwZW9mIGNvbnRleHQgPT09ICdvYmplY3QnKVxyXG4gICAgICBzdHIgKz0gJyAnICsgSlNPTi5zdHJpbmdpZnkoY29udGV4dClcclxuXHJcbiAgICByZXR1cm4gb2JqW21ldGhvZF0uY2FsbChvYmosIHN0cilcclxuICB9XHJcbn1cclxuXHJcbi8vIFJldHVybiB3aGV0aGVyIGEgVVJMIGlzIGEgY3Jvc3MtZG9tYWluIHJlcXVlc3QuXHJcbmZ1bmN0aW9uIGlzX2Nyb3NzRG9tYWluKHVybCkge1xyXG4gIHZhciBydXJsID0gL14oW1xcd1xcK1xcLlxcLV0rOikoPzpcXC9cXC8oW15cXC8/IzpdKikoPzo6KFxcZCspKT8pPy9cclxuXHJcbiAgLy8galF1ZXJ5ICM4MTM4LCBJRSBtYXkgdGhyb3cgYW4gZXhjZXB0aW9uIHdoZW4gYWNjZXNzaW5nXHJcbiAgLy8gYSBmaWVsZCBmcm9tIHdpbmRvdy5sb2NhdGlvbiBpZiBkb2N1bWVudC5kb21haW4gaGFzIGJlZW4gc2V0XHJcbiAgdmFyIGFqYXhMb2NhdGlvblxyXG4gIHRyeSB7IGFqYXhMb2NhdGlvbiA9IGxvY2F0aW9uLmhyZWYgfVxyXG4gIGNhdGNoIChlKSB7XHJcbiAgICAvLyBVc2UgdGhlIGhyZWYgYXR0cmlidXRlIG9mIGFuIEEgZWxlbWVudCBzaW5jZSBJRSB3aWxsIG1vZGlmeSBpdCBnaXZlbiBkb2N1bWVudC5sb2NhdGlvblxyXG4gICAgYWpheExvY2F0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggXCJhXCIgKTtcclxuICAgIGFqYXhMb2NhdGlvbi5ocmVmID0gXCJcIjtcclxuICAgIGFqYXhMb2NhdGlvbiA9IGFqYXhMb2NhdGlvbi5ocmVmO1xyXG4gIH1cclxuXHJcbiAgdmFyIGFqYXhMb2NQYXJ0cyA9IHJ1cmwuZXhlYyhhamF4TG9jYXRpb24udG9Mb3dlckNhc2UoKSkgfHwgW11cclxuICAgICwgcGFydHMgPSBydXJsLmV4ZWModXJsLnRvTG93ZXJDYXNlKCkgKVxyXG5cclxuICB2YXIgcmVzdWx0ID0gISEoXHJcbiAgICBwYXJ0cyAmJlxyXG4gICAgKCAgcGFydHNbMV0gIT0gYWpheExvY1BhcnRzWzFdXHJcbiAgICB8fCBwYXJ0c1syXSAhPSBhamF4TG9jUGFydHNbMl1cclxuICAgIHx8IChwYXJ0c1szXSB8fCAocGFydHNbMV0gPT09IFwiaHR0cDpcIiA/IDgwIDogNDQzKSkgIT0gKGFqYXhMb2NQYXJ0c1szXSB8fCAoYWpheExvY1BhcnRzWzFdID09PSBcImh0dHA6XCIgPyA4MCA6IDQ0MykpXHJcbiAgICApXHJcbiAgKVxyXG5cclxuICAvL2NvbnNvbGUuZGVidWcoJ2lzX2Nyb3NzRG9tYWluKCcrdXJsKycpIC0+ICcgKyByZXN1bHQpXHJcbiAgcmV0dXJuIHJlc3VsdFxyXG59XHJcblxyXG4vLyBNSVQgTGljZW5zZSBmcm9tIGh0dHA6Ly9waHBqcy5vcmcvZnVuY3Rpb25zL2Jhc2U2NF9lbmNvZGU6MzU4XHJcbmZ1bmN0aW9uIGI2NF9lbmMgKGRhdGEpIHtcclxuICAgIC8vIEVuY29kZXMgc3RyaW5nIHVzaW5nIE1JTUUgYmFzZTY0IGFsZ29yaXRobVxyXG4gICAgdmFyIGI2NCA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIjtcclxuICAgIHZhciBvMSwgbzIsIG8zLCBoMSwgaDIsIGgzLCBoNCwgYml0cywgaSA9IDAsIGFjID0gMCwgZW5jPVwiXCIsIHRtcF9hcnIgPSBbXTtcclxuXHJcbiAgICBpZiAoIWRhdGEpIHtcclxuICAgICAgICByZXR1cm4gZGF0YTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBhc3N1bWUgdXRmOCBkYXRhXHJcbiAgICAvLyBkYXRhID0gdGhpcy51dGY4X2VuY29kZShkYXRhKycnKTtcclxuXHJcbiAgICBkbyB7IC8vIHBhY2sgdGhyZWUgb2N0ZXRzIGludG8gZm91ciBoZXhldHNcclxuICAgICAgICBvMSA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xyXG4gICAgICAgIG8yID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XHJcbiAgICAgICAgbzMgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcclxuXHJcbiAgICAgICAgYml0cyA9IG8xPDwxNiB8IG8yPDw4IHwgbzM7XHJcblxyXG4gICAgICAgIGgxID0gYml0cz4+MTggJiAweDNmO1xyXG4gICAgICAgIGgyID0gYml0cz4+MTIgJiAweDNmO1xyXG4gICAgICAgIGgzID0gYml0cz4+NiAmIDB4M2Y7XHJcbiAgICAgICAgaDQgPSBiaXRzICYgMHgzZjtcclxuXHJcbiAgICAgICAgLy8gdXNlIGhleGV0cyB0byBpbmRleCBpbnRvIGI2NCwgYW5kIGFwcGVuZCByZXN1bHQgdG8gZW5jb2RlZCBzdHJpbmdcclxuICAgICAgICB0bXBfYXJyW2FjKytdID0gYjY0LmNoYXJBdChoMSkgKyBiNjQuY2hhckF0KGgyKSArIGI2NC5jaGFyQXQoaDMpICsgYjY0LmNoYXJBdChoNCk7XHJcbiAgICB9IHdoaWxlIChpIDwgZGF0YS5sZW5ndGgpO1xyXG5cclxuICAgIGVuYyA9IHRtcF9hcnIuam9pbignJyk7XHJcblxyXG4gICAgc3dpdGNoIChkYXRhLmxlbmd0aCAlIDMpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMikgKyAnPT0nO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0xKSArICc9JztcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZW5jO1xyXG59XHJcbiAgICByZXR1cm4gcmVxdWVzdDtcclxuLy9VTUQgRk9PVEVSIFNUQVJUXHJcbn0pKTtcclxuLy9VTUQgRk9PVEVSIEVORFxyXG4iLCJmdW5jdGlvbiBFICgpIHtcclxuICAvLyBLZWVwIHRoaXMgZW1wdHkgc28gaXQncyBlYXNpZXIgdG8gaW5oZXJpdCBmcm9tXHJcbiAgLy8gKHZpYSBodHRwczovL2dpdGh1Yi5jb20vbGlwc21hY2sgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vc2NvdHRjb3JnYW4vdGlueS1lbWl0dGVyL2lzc3Vlcy8zKVxyXG59XHJcblxyXG5FLnByb3RvdHlwZSA9IHtcclxuICBvbjogZnVuY3Rpb24gKG5hbWUsIGNhbGxiYWNrLCBjdHgpIHtcclxuICAgIHZhciBlID0gdGhpcy5lIHx8ICh0aGlzLmUgPSB7fSk7XHJcblxyXG4gICAgKGVbbmFtZV0gfHwgKGVbbmFtZV0gPSBbXSkpLnB1c2goe1xyXG4gICAgICBmbjogY2FsbGJhY2ssXHJcbiAgICAgIGN0eDogY3R4XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9LFxyXG5cclxuICBvbmNlOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2ssIGN0eCkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgZnVuY3Rpb24gbGlzdGVuZXIgKCkge1xyXG4gICAgICBzZWxmLm9mZihuYW1lLCBsaXN0ZW5lcik7XHJcbiAgICAgIGNhbGxiYWNrLmFwcGx5KGN0eCwgYXJndW1lbnRzKTtcclxuICAgIH07XHJcblxyXG4gICAgbGlzdGVuZXIuXyA9IGNhbGxiYWNrXHJcbiAgICByZXR1cm4gdGhpcy5vbihuYW1lLCBsaXN0ZW5lciwgY3R4KTtcclxuICB9LFxyXG5cclxuICBlbWl0OiBmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgdmFyIGRhdGEgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XHJcbiAgICB2YXIgZXZ0QXJyID0gKCh0aGlzLmUgfHwgKHRoaXMuZSA9IHt9KSlbbmFtZV0gfHwgW10pLnNsaWNlKCk7XHJcbiAgICB2YXIgaSA9IDA7XHJcbiAgICB2YXIgbGVuID0gZXZ0QXJyLmxlbmd0aDtcclxuXHJcbiAgICBmb3IgKGk7IGkgPCBsZW47IGkrKykge1xyXG4gICAgICBldnRBcnJbaV0uZm4uYXBwbHkoZXZ0QXJyW2ldLmN0eCwgZGF0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfSxcclxuXHJcbiAgb2ZmOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2spIHtcclxuICAgIHZhciBlID0gdGhpcy5lIHx8ICh0aGlzLmUgPSB7fSk7XHJcbiAgICB2YXIgZXZ0cyA9IGVbbmFtZV07XHJcbiAgICB2YXIgbGl2ZUV2ZW50cyA9IFtdO1xyXG5cclxuICAgIGlmIChldnRzICYmIGNhbGxiYWNrKSB7XHJcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBldnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGV2dHNbaV0uZm4gIT09IGNhbGxiYWNrICYmIGV2dHNbaV0uZm4uXyAhPT0gY2FsbGJhY2spXHJcbiAgICAgICAgICBsaXZlRXZlbnRzLnB1c2goZXZ0c1tpXSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBSZW1vdmUgZXZlbnQgZnJvbSBxdWV1ZSB0byBwcmV2ZW50IG1lbW9yeSBsZWFrXHJcbiAgICAvLyBTdWdnZXN0ZWQgYnkgaHR0cHM6Ly9naXRodWIuY29tL2xhemRcclxuICAgIC8vIFJlZjogaHR0cHM6Ly9naXRodWIuY29tL3Njb3R0Y29yZ2FuL3RpbnktZW1pdHRlci9jb21taXQvYzZlYmZhYTliYzk3M2IzM2QxMTBhODRhMzA3NzQyYjdjZjk0Yzk1MyNjb21taXRjb21tZW50LTUwMjQ5MTBcclxuXHJcbiAgICAobGl2ZUV2ZW50cy5sZW5ndGgpXHJcbiAgICAgID8gZVtuYW1lXSA9IGxpdmVFdmVudHNcclxuICAgICAgOiBkZWxldGUgZVtuYW1lXTtcclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEU7XHJcbm1vZHVsZS5leHBvcnRzLlRpbnlFbWl0dGVyID0gRTtcclxuIiwiY29uc3QgTG9naW4gPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL2xvZ2luLmpzXCIpO1xyXG5jb25zdCBBZG1pbmlzdHJhY2FvID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzXCIpO1xyXG5jb25zdCBNZW51ID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9tZW51LmpzXCIpO1xyXG5jb25zdCBNdXNjdWxhY2FvID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9tdXNjdWxhY2FvLmpzXCIpO1xyXG5jb25zdCBNdWx0aWZ1bmNpb25hbCA9IHJlcXVpcmUoXCIuL2NvbXBvbmVudHMvbXVsdGlmdW5jaW9uYWwuanNcIik7XHJcbmNvbnN0IFNhbGEgPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL3NhbGEuanNcIik7XHJcblxyXG5jbGFzcyBBcHAge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBuZXcgTG9naW4oYm9keSk7XHJcbiAgICAgICAgdGhpcy5hZG1pbmlzdHJhY2FvID0gbmV3IEFkbWluaXN0cmFjYW8oYm9keSk7XHJcbiAgICAgICAgdGhpcy5tZW51ID0gbmV3IE1lbnUoYm9keSk7XHJcbiAgICAgICAgdGhpcy5tdXNjdWxhY2FvID0gbmV3IE11c2N1bGFjYW8oYm9keSk7XHJcbiAgICAgICAgdGhpcy5tdWx0aWZ1bmNpb25hbCA9IG5ldyBNdWx0aWZ1bmNpb25hbChib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICBpbml0KCkge1xyXG4gICAgICAgIHRoaXMubG9naW4ucmVuZGVyKCk7XHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmxvZ2luRXZlbnRzKCk7XHJcbiAgICAgICAgdGhpcy5hZG1pbmlzdHJhY2FvRXZlbnRzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgbG9naW5FdmVudHMoKSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImVycm9yXCIsICgpID0+IGFsZXJ0KFwiVXN1YXJpbyBvdSBzZW5oYSBpbmNvcnJldG9zXCIpKTtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwibG9naW5BZG1pblwiLCAoKSA9PiB0aGlzLmFkbWluaXN0cmFjYW8ucmVuZGVyKCkpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJsb2dpbkFsdW5vXCIsIGxvZ2luID0+IHRoaXMubWVudS5yZW5kZXIobG9naW4pKTtcclxuICAgICAgICB0aGlzLnNhbGEub24oXCJsb2dpbkFsdW5vXCIsIGxvZ2luID0+IHRoaXMubWVudS5yZW5kZXIobG9naW4pKTtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwibXVsdGlmdW5jaW9uYWxcIiwgZGF0YSA9PiB0aGlzLm11bHRpZnVuY2lvbmFsLnJlbmRlcihkYXRhKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcIm11c2N1bGFjYW9cIiwgZGF0YSA9PiB0aGlzLm11c2N1bGFjYW8ucmVuZGVyKGRhdGEpKTtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwiYWx1bm9OYW9JbnNlcmlkb1wiLCAoKSA9PiBhbGVydChcIk9wcywgbyBhbHVubyBuw6NvIHBvZGUgc2VyIGluc2VyaWRvXCIpKTtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwiYWx1bm9JbnNlcmlkb1N1Y2Vzc29cIiwgKCkgPT4gYWxlcnQoXCJBbHVubyBpbnNlcmlkbyBjb20gc3VjZXNzb1wiKSk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRtaW5pc3RyYWNhb0V2ZW50cygpIHtcclxuICAgICAgICAvL3RoaXMuYWRtaW5pc3RyYWNhby5vbihcInByZWVuY2hhR3JpZFwiLCApO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFwcDsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9hZG1pbmlzdHJhY2FvLmpzXCIpO1xyXG5jb25zdCBMb2dpbiA9IHJlcXVpcmUoXCIuL2xvZ2luLmpzXCIpO1xyXG5jb25zdCBDYWRhc3Ryb0FsdW5vID0gcmVxdWlyZShcIi4vY2FkYXN0cm9BbHVuby5qc1wiKTtcclxuXHJcbmNsYXNzIEFkbWluaXN0cmFjYW8gZXh0ZW5kcyBBZ2VuZGEge1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IG5ldyBMb2dpbihib2R5KTtcclxuICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8gPSBuZXcgQ2FkYXN0cm9BbHVubyhib2R5KTtcclxuICAgICAgICB0aGlzLmVoRWRpY2FvID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMucmVuZGVyR3JpZEFsdW5vcygpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZEV2ZW50TGlzdGVuZXIoKSB7XHJcbiAgICAgICAgdGhpcy5sb2dvdXQoKTtcclxuICAgICAgICB0aGlzLmNsaWNrQm90YW9TYWx2YXIoKTtcclxuICAgICAgICB0aGlzLmNsaWNrQm90YW9BZGljaW9uYXIoKTtcclxuICAgICAgICB0aGlzLmJvdGFvRWRpdGFyKCk7XHJcbiAgICAgICAgdGhpcy5jbGlja0JvdGFvRXhjbHVpcigpO1xyXG4gICAgfVxyXG5cclxuICAgIGxvZ291dCgpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb1NodXRkb3duXVwiKS5vbmNsaWNrID0gKCkgPT4gZG9jdW1lbnQubG9jYXRpb24ucmVsb2FkKHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGNsaWNrQm90YW9FeGNsdWlyKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JvdGFvRXhjbHVpcl1cIikub25jbGljayA9ICgpID0+IHRoaXMuZXhjbHVhQWx1bm8oKTtcclxuICAgIH0gICAgXHJcblxyXG4gICAgY2xpY2tCb3Rhb1NhbHZhcigpIHtcclxuXHJcbiAgICAgICAgY29uc3QgZm9ybSA9IHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiZm9ybVwiKTtcclxuXHJcbiAgICAgICAgZm9ybS5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgY29uc3QgYWx1bm8gPSB0aGlzLm9idGVuaGFEYWRvc01vZGFsKGUpO1xyXG4gICAgICAgICAgICB0aGlzLmluc2lyYU91RWRpdGVBbHVubyhhbHVubyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgY2xpY2tCb3Rhb0FkaWNpb25hcigpIHtcclxuXHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9BZGljaW9uYXJdXCIpLm9uY2xpY2sgPSAoKSA9PiB0aGlzLmVoRWRpY2FvID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgYm90YW9FZGl0YXIoKSB7XHJcblxyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JvdGFvRWRpdGFyXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5jbGlja0JvdGFvRWRpdGFyKClcclxuICAgIH1cclxuXHJcbiAgICBjbGlja0JvdGFvRWRpdGFyKCkge1xyXG5cclxuICAgICAgICB0aGlzLmVoRWRpY2FvID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgbGV0IGFsdW5vc1NlbGVjaW9uYWRvcyA9IHRoaXMub2J0ZW5oYUFsdW5vc1NlbGVjaW9uYWRvcygpO1xyXG5cclxuICAgICAgICBpZiAoYWx1bm9zU2VsZWNpb25hZG9zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYWx1bm9zU2VsZWNpb25hZG9zLmxlbmd0aCA9PT0gMSkgeyAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLmFsdW5vU2VsZWNpb25hZG8gPSBhbHVub3NTZWxlY2lvbmFkb3NbMF0uZ2V0QXR0cmlidXRlKFwiY29kaWdvYWx1bm9cIik7XHJcbiAgICAgICAgICAgIHRoaXMuY2FkYXN0cm9BbHVuby5wcmVlbmNoYU1vZGFsRWRpY2FvKHRoaXMuYWx1bm9TZWxlY2lvbmFkbyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBhbGVydChcIlNlbGVjaW9uZSBhcGVuYXMgdW0gYWx1bm8gcGFyYSBlZGnDp8OjbyBwb3IgZmF2b3IhXCIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBvYnRlbmhhRGFkb3NNb2RhbChlKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IGNwZiA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbY3BmXVwiKS52YWx1ZTtcclxuXHJcbiAgICAgICAgY29uc3QgYWx1bm8gPSB7XHJcbiAgICAgICAgICAgIG5vbWU6IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbbm9tZV1cIikudmFsdWUsXHJcbiAgICAgICAgICAgIGNwZjogY3BmLFxyXG4gICAgICAgICAgICB0ZWxlZm9uZTogZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIlt0ZWxlZm9uZV1cIikudmFsdWUsXHJcbiAgICAgICAgICAgIGVtYWlsOiBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW2VtYWlsXVwiKS52YWx1ZSxcclxuICAgICAgICAgICAgZW5kZXJlY286IHRoaXMubW9udGVFbmRlcmVjbyhlLnRhcmdldCksXHJcbiAgICAgICAgICAgIG1hdHJpY3VsYTogdGhpcy5nZXJlTWF0cmljdWxhKGNwZilcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICByZXR1cm4gYWx1bm87XHJcbiAgICB9XHJcblxyXG4gICAgaW5zaXJhT3VFZGl0ZUFsdW5vKGFsdW5vKSB7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmVoRWRpY2FvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FkYXN0cm9BbHVuby5lZGl0ZUFsdW5vKGFsdW5vLCB0aGlzLmFsdW5vU2VsZWNpb25hZG8pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vLmluc2lyYUFsdW5vKGFsdW5vKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgICQoJyNtb2RhbENhZGFzdHJvQWx1bm8nKS5tb2RhbCgnaGlkZScpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyR3JpZEFsdW5vcygpO1xyXG4gICAgfVxyXG5cclxuICAgIGV4Y2x1YUFsdW5vKCkge1xyXG5cclxuICAgICAgICBsZXQgYWx1bm9zU2VsZWNpb25hZG9zID0gdGhpcy5vYnRlbmhhQWx1bm9zU2VsZWNpb25hZG9zKCk7XHJcblxyXG4gICAgICAgIGlmIChhbHVub3NTZWxlY2lvbmFkb3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChhbHVub3NTZWxlY2lvbmFkb3MubGVuZ3RoID09PSAxKSB7ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMuYWx1bm9TZWxlY2lvbmFkbyA9IGFsdW5vc1NlbGVjaW9uYWRvc1swXS5nZXRBdHRyaWJ1dGUoXCJjb2RpZ29hbHVub1wiKTtcclxuICAgICAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vLmV4Y2x1YUFsdW5vKHRoaXMuYWx1bm9TZWxlY2lvbmFkbyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBhbGVydChcIlNlbGVjaW9uZSBhcGVuYXMgdW0gYWx1bm8gcGFyYSBlZGnDp8OjbyBwb3IgZmF2b3IhXCIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJHcmlkQWx1bm9zKCkge1xyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJHRVRcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vYWRtaW5pc3RyYWNhb2AsXHJcbiAgICAgICAgICAgIGpzb246IHRydWVcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJlcnJvclwiLCBcIm7Do28gZm9pIHBvc3PDrXZlbCBjYXJyZWdhciBvcyBhbHVub3NcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkuaW5uZXJIVE1MID0gVGVtcGxhdGUucmVuZGVyKGRhdGEuYWx1bm9zKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgb2J0ZW5oYUFsdW5vc1NlbGVjaW9uYWRvcygpIHtcclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiBlc3RhU2VsZWNpb25hZG8oYWx1bm8pIHtcclxuICAgICAgICAgICAgcmV0dXJuIGFsdW5vLmNoZWNrZWQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgYWx1bm9zID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCJbYWx1bm9TZWxlY2lvbmFkb11cIikpO1xyXG4gICAgICAgIHJldHVybiBhbHVub3MuZmlsdGVyKGVzdGFTZWxlY2lvbmFkbyk7XHJcbiAgICB9XHJcblxyXG4gICAgbW9udGVFbmRlcmVjbyh0YXJnZXQpIHtcclxuICAgICAgICByZXR1cm4gdGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbY2lkYWRlXVwiKS52YWx1ZSArIFwiXFxuXCIgK1xyXG4gICAgICAgICAgICB0YXJnZXQucXVlcnlTZWxlY3RvcihcIltiYWlycm9dXCIpLnZhbHVlICsgXCJcXG5cIiArXHJcbiAgICAgICAgICAgIHRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW251bWVyb11cIikudmFsdWUgKyBcIlxcblwiICtcclxuICAgICAgICAgICAgdGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbY29tcGxlbWVudG9dXCIpLnZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIGdlcmVNYXRyaWN1bGEoY3BmKSB7XHJcbiAgICAgICAgY29uc3QgZGF0YSA9IG5ldyBEYXRlKCk7XHJcbiAgICAgICAgY29uc3QgYW5vID0gZGF0YS5nZXRGdWxsWWVhcigpO1xyXG4gICAgICAgIGNvbnN0IHNlZ3VuZG9zID0gZGF0YS5nZXRTZWNvbmRzKCk7XHJcbiAgICAgICAgcmV0dXJuIGFubyArIGNwZi5zbGljZSg4KSArIHNlZ3VuZG9zO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFkbWluaXN0cmFjYW87IiwiY29uc3QgVGlueUVtaXR0ZXIgPSByZXF1aXJlKFwidGlueS1lbWl0dGVyXCIpO1xyXG5jb25zdCBSZXF1ZXN0ID0gcmVxdWlyZShcImJyb3dzZXItcmVxdWVzdFwiKTtcclxuXHJcbmNsYXNzIEFnZW5kYSBleHRlbmRzIFRpbnlFbWl0dGVyIHtcclxuICAgIGNvbnN0cnVjdG9yKCl7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLnJlcXVlc3QgPSBSZXF1ZXN0O1xyXG4gICAgICAgIHRoaXMuVVJMID0gXCJodHRwOi8vbG9jYWxob3N0OjMzMzNcIjtcclxuICAgIH1cclxufVxyXG5tb2R1bGUuZXhwb3J0cyA9IEFnZW5kYTsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9jYWRhc3Ryb0FsdW5vLmpzXCIpO1xyXG5jb25zdCBMb2dpbiA9IHJlcXVpcmUoXCIuL2xvZ2luLmpzXCIpO1xyXG5cclxuY2xhc3MgQ2FkYXN0cm9BbHVubyBleHRlbmRzIEFnZW5kYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBuZXcgTG9naW4oYm9keSk7XHJcbiAgICB9O1xyXG5cclxuICAgIGluc2lyYUFsdW5vKGFsdW5vKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L2FkbWluaXN0cmFjYW9gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxyXG4gICAgICAgICAgICBib2R5OiB7XHJcbiAgICAgICAgICAgICAgICBub21lOiBhbHVuby5ub21lLFxyXG4gICAgICAgICAgICAgICAgY3BmOiBhbHVuby5jcGYsXHJcbiAgICAgICAgICAgICAgICB0ZWxlZm9uZTogYWx1bm8udGVsZWZvbmUsXHJcbiAgICAgICAgICAgICAgICBlbWFpbDogYWx1bm8uZW1haWwsXHJcbiAgICAgICAgICAgICAgICBlbmRlcmVjbzogYWx1bm8uZW5kZXJlY28sXHJcbiAgICAgICAgICAgICAgICBtYXRyaWN1bGE6IGFsdW5vLm1hdHJpY3VsYVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgaWYgKHJlc3Auc3RhdHVzICE9PSAyMDEpIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KGVycik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJhbHVub05hb0luc2VyaWRvXCIsIGVycik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFsZXJ0KFwiQWx1bm8gaW5zZXJpZG8gY29tIHN1Y2Vzc28hXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgfTtcclxuXHJcbiAgICBwcmVlbmNoYU1vZGFsRWRpY2FvKGNvZGlnb0FsdW5vKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJHRVRcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vYWRtaW5pc3RyYWNhby8ke2NvZGlnb0FsdW5vfWAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMCkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoXCJBbHVubyBuw6NvIGVuY29udHJhZG9cIik7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgYWx1bm8gPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbm9tZTogZGF0YS5ub21lLFxyXG4gICAgICAgICAgICAgICAgICAgIGNwZjogZGF0YS5jcGYsXHJcbiAgICAgICAgICAgICAgICAgICAgdGVsZWZvbmU6IGRhdGEudGVsZWZvbmUsXHJcbiAgICAgICAgICAgICAgICAgICAgZW1haWw6IGRhdGEuZW1haWwsXHJcbiAgICAgICAgICAgICAgICAgICAgZW5kZXJlY286IGRhdGEuZW5kZXJlY28sXHJcbiAgICAgICAgICAgICAgICAgICAgbWF0cmljdWxhOiBkYXRhLm1hdHJpY3VsYVxyXG4gICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjcGZdXCIpLnZhbHVlID0gYWx1bm8uY3BmO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbbm9tZV1cIikudmFsdWUgPSBhbHVuby5ub21lO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbdGVsZWZvbmVdXCIpLnZhbHVlID0gYWx1bm8udGVsZWZvbmU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltlbWFpbF1cIikudmFsdWUgPSBhbHVuby5lbWFpbDtcclxuICAgICAgICAgICAgICAgIHRoaXMubW9udGVFbmRlcmVjbyhhbHVuby5lbmRlcmVjbyk7XHJcblxyXG4gICAgICAgICAgICAgICAgJCgnI21vZGFsQ2FkYXN0cm9BbHVubycpLm1vZGFsKCdzaG93Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBtb250ZUVuZGVyZWNvKGVuZGVyZWNvKSB7XHJcblxyXG4gICAgICAgIGxldCBhcnJheUVuZGVyZWNvID0gZW5kZXJlY28uc3BsaXQoJ1xcbicpO1xyXG5cclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjaWRhZGVdXCIpLnZhbHVlID0gYXJyYXlFbmRlcmVjb1swXTtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltiYWlycm9dXCIpLnZhbHVlID0gYXJyYXlFbmRlcmVjb1sxXTtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltudW1lcm9dXCIpLnZhbHVlID0gYXJyYXlFbmRlcmVjb1syXTtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjb21wbGVtZW50b11cIikudmFsdWUgPSBhcnJheUVuZGVyZWNvWzNdO1xyXG4gICAgfVxyXG5cclxuICAgIGVkaXRlQWx1bm8oYWx1bm8sIGlkKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJQVVRcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vYWRtaW5pc3RyYWNhby8ke2lkfWAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgIGJvZHk6IHtcclxuICAgICAgICAgICAgICAgIGlkOiBhbHVuby5pZCxcclxuICAgICAgICAgICAgICAgIG5vbWU6IGFsdW5vLm5vbWUsXHJcbiAgICAgICAgICAgICAgICBjcGY6IGFsdW5vLmNwZixcclxuICAgICAgICAgICAgICAgIHRlbGVmb25lOiBhbHVuby50ZWxlZm9uZSxcclxuICAgICAgICAgICAgICAgIGVtYWlsOiBhbHVuby5lbWFpbCxcclxuICAgICAgICAgICAgICAgIGVuZGVyZWNvOiBhbHVuby5lbmRlcmVjbyxcclxuICAgICAgICAgICAgICAgIG1hdHJpY3VsYTogYWx1bm8ubWF0cmljdWxhXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoZXJyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImFsdW5vTmFvSW5zZXJpZG9cIiwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiQWx1bm8gZWRpdGFkbyBjb20gc3VjZXNzbyFcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5kaXNwb3NlTW9kYWwoKTtcclxuICAgIH1cclxuXHJcbiAgICBleGNsdWFBbHVubyhpZEFsdW5vKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxyXG4gICAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L2FkbWluaXN0cmFjYW8vJHtpZEFsdW5vfWAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy9yZXMuc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCAnKicpO1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoZXJyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImFsdW5vTmFvSW5zZXJpZG9cIiwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiQWx1bm8gZXhjbHXDrWRvIGNvbSBzdWNlc3NvIVwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH1cclxuXHJcbiAgICBkaXNwb3NlTW9kYWwoKSB7XHJcblxyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2NwZl1cIikudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW25vbWVdXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIlt0ZWxlZm9uZV1cIikudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2VtYWlsXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY2lkYWRlXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYmFpcnJvXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbbnVtZXJvXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY29tcGxlbWVudG9dXCIpLnZhbHVlID0gXCJcIjtcclxuXHJcbiAgICAgICAgJCgnI21vZGFsQ2FkYXN0cm9BbHVubycpLm1vZGFsKCdoaWRlJyk7XHJcbiAgICB9XHJcblxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IENhZGFzdHJvQWx1bm87IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvbG9naW4uanNcIik7XHJcblxyXG5jbGFzcyBMb2dpbiBleHRlbmRzIEFnZW5kYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLmJvZHkuaW5uZXJIVE1MID0gVGVtcGxhdGUucmVuZGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbdXN1YXJpb11cIikuZm9jdXMoKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMuZW52aWVGb3JtdWxhcmlvKCk7XHJcbiAgICAgICAgdGhpcy5lc3F1ZWNldVNlbmhhKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZW52aWVGb3JtdWxhcmlvKCkge1xyXG4gICAgICAgIGNvbnN0IGZvcm0gPSB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcImZvcm1cIik7XHJcblxyXG4gICAgICAgIGZvcm0uYWRkRXZlbnRMaXN0ZW5lcihcInN1Ym1pdFwiLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHVzdWFyaW8gPSBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW3VzdWFyaW9dXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBzZW5oYSA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbc2VuaGFdXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmF1dGVudGlxdWVVc3VhcmlvKHVzdWFyaW8sIHNlbmhhKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBhdXRlbnRpcXVlVXN1YXJpbyh1c3VhcmlvLCBzZW5oYSkge1xyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L0xvZ2luYCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICAgICAgYm9keToge1xyXG4gICAgICAgICAgICAgICAgbG9naW46IHVzdWFyaW8udmFsdWUsXHJcbiAgICAgICAgICAgICAgICBzZW5oYTogc2VuaGEudmFsdWVcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmxvZ2FVc3VhcmlvKHJlc3AsIGVyciwgZGF0YSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgbG9nYVVzdWFyaW8ocmVzcCwgZXJyLCBkYXRhKSB7XHJcblxyXG4gICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZW1pdChcImVycm9yXCIsIGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgeyAgICAgICAgICAgIFxyXG5cclxuICAgICAgICAgICAgaWYgKGRhdGEuYWRtaW4pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImxvZ2luQWRtaW5cIiwgZGF0YSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJsb2dpbkFsdW5vXCIsIGRhdGEubG9naW4pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGVzcXVlY2V1U2VuaGEoKSB7XHJcbiAgICAgICAgLy9jb2RpZ28gcHJhIGNoYW1hciBlbSBVUkxcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBMb2dpbjsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9tZW51LmpzXCIpO1xyXG5jb25zdCBNdWx0aWZ1bmNpb25hbCA9IHJlcXVpcmUoXCIuL211bHRpZnVuY2lvbmFsLmpzXCIpO1xyXG5jb25zdCBNdXNjdWxhY2FvID0gcmVxdWlyZShcIi4vbXVzY3VsYWNhby5qc1wiKTtcclxuXHJcbmNsYXNzIE1lbnUgZXh0ZW5kcyBBZ2VuZGEge1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICAgICAgdGhpcy5tdXNjdWxhY2FvID0gbmV3IE11c2N1bGFjYW8oYm9keSk7XHJcbiAgICAgICAgdGhpcy5tdWx0aWZ1bmNpb25hbCA9IG5ldyBNdWx0aWZ1bmNpb25hbChib2R5KTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgcmVuZGVyKGxvZ2luKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcihsb2dpbik7XHJcbiAgICAgICAgdGhpcy5vYnRlbmhhQ29kaWdvQWx1bm8obG9naW4pO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMuYm90YW9NdXNjdWxhY2FvKCk7XHJcbiAgICAgICAgdGhpcy5ib3Rhb011bHRpZnVuY2lvbmFsKCk7XHJcbiAgICAgICAgdGhpcy5sb2dvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dvdXQoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9zaHV0ZG93bl1cIikub25jbGljayA9ICgpID0+IGRvY3VtZW50LmxvY2F0aW9uLnJlbG9hZCh0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICBvYnRlbmhhQ29kaWdvQWx1bm8obG9naW4pIHtcclxuXHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IGxvZ2luO1xyXG5cclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L21lbnUvJHtsb2dpbn1gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgaWYgKHJlc3Auc3RhdHVzICE9PSAyMDApIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiQWx1bm8gbsOjbyBlbmNvbnRyYWRvXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2RpZ29BbHVubyA9IGRhdGEuaWQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBib3Rhb011c2N1bGFjYW8oKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9NdXNjdWxhY2FvXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5yZW5kZXJNdXNjdWxhY2FvKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyTXVzY3VsYWNhbygpIHtcclxuXHJcblxyXG4gICAgICAgIGNvbnN0IGRhdGEgPSB7XHJcbiAgICAgICAgICAgIGlkQWx1bm86IHRoaXMuY29kaWdvQWx1bm8sXHJcbiAgICAgICAgICAgIHNhbGE6IFwibXVzY3VsYWNhb1wiLFxyXG4gICAgICAgICAgICBsb2dpbjogdGhpcy5sb2dpblxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMubXVzY3VsYWNhby5yZW5kZXIoZGF0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgYm90YW9NdWx0aWZ1bmNpb25hbCgpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb011bHRpZnVuY2lvbmFsXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5yZW5kZXJNdWx0aWZ1bmNpb25hbCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlck11bHRpZnVuY2lvbmFsKCkge1xyXG5cclxuICAgICAgICBjb25zdCBkYXRhID0ge1xyXG4gICAgICAgICAgICBpZEFsdW5vOiB0aGlzLmNvZGlnb0FsdW5vLFxyXG4gICAgICAgICAgICBzYWxhOiBcIm11bHRpZnVuY2lvbmFsXCJcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLm11bHRpZnVuY2lvbmFsLnJlbmRlcihkYXRhKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNZW51OyIsImNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9tdWx0aWZ1bmNpb25hbC5qc1wiKTtcclxuY29uc3QgU2FsYSA9IHJlcXVpcmUoXCIuL3NhbGEuanNcIik7XHJcblxyXG5jbGFzcyBNdWx0aWZ1bmNpb25hbCBleHRlbmRzIFNhbGEge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoZGF0YSkge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLm9idGVuaGFIb3Jhcmlvc0FsdW5vcyhkYXRhKTtcclxuICAgICAgICB0aGlzLmxvZ2luID0gZGF0YTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNdWx0aWZ1bmNpb25hbDsiLCJjb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvbXVzY3VsYWNhby5qc1wiKTtcclxuY29uc3QgU2FsYSA9IHJlcXVpcmUoXCIuL3NhbGEuanNcIik7XHJcblxyXG5jbGFzcyBNdXNjdWxhY2FvIGV4dGVuZHMgU2FsYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihkYXRhKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMub2J0ZW5oYUhvcmFyaW9zQWx1bm9zKGRhdGEpO1xyXG4gICAgICAgIHRoaXMudXNlciA9IGRhdGE7XHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICB9XHJcblxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE11c2N1bGFjYW87IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBMb2dpbiA9IHJlcXVpcmUoXCIuL2xvZ2luLmpzXCIpO1xyXG5cclxuY2xhc3MgU2FsYSBleHRlbmRzIEFnZW5kYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBuZXcgTG9naW4oYm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmJvdGFvQ29uZmlybWFyKCk7XHJcbiAgICAgICAgdGhpcy5ib3Rhb0NhbmNlbGFyKCk7XHJcbiAgICAgICAgdGhpcy5sb2dvdXQoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dvdXQoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9TaHV0ZG93bl1cIikub25jbGljayA9ICgpID0+IGRvY3VtZW50LmxvY2F0aW9uLnJlbG9hZCh0cnVlKTtcclxuICAgIH0gICAgXHJcblxyXG4gICAgb2J0ZW5oYUhvcmFyaW9zQWx1bm9zKGxvZ2luKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9zYWxhLyR7bG9naW4uaWRBbHVub30vJHtsb2dpbi5zYWxhfWAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWVcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmF0dWFsaXplRHJvcERvd25zKGRhdGEuaG9yYXJpb3MpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGF0dWFsaXplRHJvcERvd25zKGhvcmFyaW9zKSB7XHJcblxyXG4gICAgICAgIGlmIChob3Jhcmlvcykge1xyXG5cclxuICAgICAgICAgICAgbGV0IGRyb3BEb3duSG9yYXJpb3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLmJvZHkucXVlcnlTZWxlY3RvckFsbChcIltzZWxlY2FvSG9yYXJpb11cIikpO1xyXG5cclxuICAgICAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGRyb3BEb3duSG9yYXJpb3MubGVuZ3RoOyBpbmRleCsrKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgZHJvcERvd25Ib3Jhcmlvc1tpbmRleF0udmFsdWUgPSBob3Jhcmlvc1tpbmRleF0uZmFpeGFIb3JhcmlvO1xyXG5cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBib3Rhb0NvbmZpcm1hcihkYXRhKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9Db25maXJtYXJdXCIpLm9uY2xpY2sgPSAoKSA9PiB0aGlzLmluc2lyZU91QXR1YWxpemVIb3JhcmlvKHRoaXMudXNlcik7XHJcbiAgICB9XHJcblxyXG4gICAgYm90YW9DYW5jZWxhcigpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0NhbmNlbGFyXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy52b2x0ZU1lbnUoKTsgXHJcbiAgICB9XHJcblxyXG4gICAgdm9sdGVNZW51KCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMudXNlcik7XHJcbiAgICAgICAgdGhpcy5lbWl0KFwibG9naW5BbHVub1wiLCB0aGlzLnVzZXIubG9naW4pO1xyXG4gICAgfVxyXG5cclxuICAgIGluc2lyZU91QXR1YWxpemVIb3JhcmlvKGxvZ2luKSB7XHJcblxyXG4gICAgICAgIGxldCBkcm9wRG93bkhvcmFyaW9zID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCJbc2VsZWNhb0hvcmFyaW9dXCIpKTtcclxuICAgICAgICBsZXQgZGlhc1NlbWFuYSA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiW2RpYVNlbWFuYV1cIikpO1xyXG5cclxuICAgICAgICB2YXIgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vc2FsYWAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgIGJvZHk6IHsgXHJcbiAgICAgICAgICAgICAgICBmYWl4YUhvcmFyaW86IFwiXCIsXHJcbiAgICAgICAgICAgICAgICBpZEFsdW5vOiBsb2dpbi5pZEFsdW5vLFxyXG4gICAgICAgICAgICAgICAgZGlhU2VtYW5hOiBcIlwiLFxyXG4gICAgICAgICAgICAgICAgc2FsYTogbG9naW4uc2FsYVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZHJvcERvd25Ib3Jhcmlvcy5sZW5ndGg7IGluZGV4KyspIHtcclxuXHJcbiAgICAgICAgICAgIG9wdHMuYm9keS5mYWl4YUhvcmFyaW8gPSBkcm9wRG93bkhvcmFyaW9zW2luZGV4XS52YWx1ZTtcclxuICAgICAgICAgICAgb3B0cy5ib2R5LmRpYVNlbWFuYSA9IGRpYXNTZW1hbmFbaW5kZXhdLmdldEF0dHJpYnV0ZSgnZGlhc2VtYW5hJyk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHJlc3Auc3RhdHVzICE9PSAyMDEpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5lbWl0KFwiYWx1bm9OYW9JbnNlcmlkb1wiLCBlcnIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNhbGE7IiwiY29uc3QgTW9kYWxDYWRhc3Ryb0FsdW5vID0gcmVxdWlyZShcIi4vY2FkYXN0cm9BbHVuby5qc1wiKTtcclxuXHJcbmNvbnN0IHJlbmRlckdyaWRBbHVub3MgPSBhbHVub3MgPT4ge1xyXG4gICAgcmV0dXJuIGFsdW5vcy5tYXAoYWx1bm8gPT4ge1xyXG5cclxuICAgICAgICBsZXQgY29yTGluaGEgPSBhbHVuby5pZCAlIDIgPT09IDAgPyBcImJhY2stZ3JpZHJvdzFcIiA6IFwiYmFjay1ncmlkcm93MlwiO1xyXG5cclxuICAgICAgICByZXR1cm4gYFxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3cgJHtjb3JMaW5oYX0gdGV4dC1kYXJrXCI+ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwIGZvcm0tY2hlY2tcIj5cclxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3M9XCJmb3JtLWNoZWNrLWlucHV0IG10LTRcIiBhbHVub1NlbGVjaW9uYWRvIGNvZGlnb0FsdW5vPSR7YWx1bm8uaWR9PlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0ZXh0LWNlbnRlciBtYi0yXCI+JHthbHVuby5ub21lfTwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIFwiPlxyXG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwidGV4dC1jZW50ZXIgbXQtM1wiPiR7YWx1bm8uY3BmfTwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIFwiPlxyXG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwidGV4dC1jZW50ZXIgbXQtM1wiPiR7YWx1bm8ubWF0cmljdWxhfTwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvZGl2PiAgICAgICAgXHJcbiAgICAgICAgPC9kaXY+YFxyXG4gICAgfSkuam9pbihcIlwiKTtcclxufVxyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSBhbHVub3MgPT4ge1xyXG4gICAgXHJcbiAgICByZXR1cm4gYFxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJpbWctZmx1aWQgdGV4dC1yaWdodCBtci01IG10LTUgdGV4dC13aGl0ZSBib3Rhb1NodXRkb3duXCIgYm90YW9TaHV0ZG93bj5cclxuICAgICAgICA8YSBocmVmPVwiI1wiPjxpbWcgc3JjPVwiLi9pbWFnZXMvc2h1dGRvd24ucG5nXCIgYWx0PVwiXCI+PC9hPlxyXG4gICAgICAgIDxzdHJvbmcgY2xhc3M9XCJtci0xXCI+U2Fpcjwvc3Ryb25nPlxyXG4gICAgPC9kaXY+XHJcbiAgICBcclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXJcIj5cclxuICAgICAgICA8ZGl2PlxyXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtMiBtdC0yXCI+XHJcbiAgICAgICAgICAgICAgICDDgXJlYSBBZG1pbmlzdHJhdGl2YVxyXG4gICAgICAgICAgICA8L3NwYW4+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XHJcbiAgICBcclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93ICBib3JkZXIgYm9yZGVyLXdoaXRlIGJhY2stZ3JpZCB0ZXh0LXdoaXRlXCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC1jZW50ZXJcIj5cclxuICAgICAgICAgICAgICAgIE5vbWVcclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIHRleHQtY2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICBDUEZcclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIHRleHQtY2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICBNYXRyw61jdWxhXHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAke3JlbmRlckdyaWRBbHVub3MoYWx1bm9zKX1cclxuXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lciBjb2wtc20gbXQtM1wiPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2VudGVyZWRcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeSBidG4tZGFya1wiIGRhdGEtdG9nZ2xlPVwibW9kYWxcIiBkYXRhLXRhcmdldD1cIiNtb2RhbENhZGFzdHJvQWx1bm9cIiBib3Rhb0FkaWNpb25hcj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgQWRpY2lvbmFyXHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrXCIgYm90YW9FZGl0YXI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRhclxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tZGFya1wiIGJvdGFvRXhjbHVpcj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgRXhjbHVpclxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgICAgICAgICAke01vZGFsQ2FkYXN0cm9BbHVuby5yZW5kZXIoKX1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PiAgICBcclxuICAgIGA7IFxyXG59IiwiXHJcbmNvbnN0IGlucHV0RW5kZXJlY28gPSBgXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY2lkYWRlXCI+Q2lkYWRlPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQgY2lkYWRlLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiYmFpcnJvXCI+QmFpcnJvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQgYmFpcnJvLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwibnVtZXJvXCI+TsO6bWVybzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiB0eXBlPVwidGV4dFwiIHJlcXVpcmVkIG51bWVyby8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImNvbXBsZW1lbnRvXCI+Q29tcGxlbWVudG88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdHlwZT1cInRleHRcIiBjb21wbGVtZW50by8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuYDtcclxuXHJcbmNvbnN0IG1vZGFsQ2FkYXN0cm9BbHVubyA9IGBcclxuPGRpdiBjbGFzcz1cIm1vZGFsIGZhZGVcIiBpZD1cIm1vZGFsQ2FkYXN0cm9BbHVub1wiIHRhYmluZGV4PVwiLTFcIiByb2xlPVwiZGlhbG9nXCIgYXJpYS1sYWJlbGxlZGJ5PVwidGl0dWxvTW9kYWxcIiBhcmlhLWhpZGRlbj1cInRydWVcIiBtb2RhbD5cclxuICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1kaWFsb2cgbW9kYWwtZGlhbG9nLWNlbnRlcmVkXCIgcm9sZT1cImRvY3VtZW50XCIgPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtaGVhZGVyXCI+XHJcbiAgICAgICAgICAgICAgICA8aDUgY2xhc3M9XCJtb2RhbC10aXRsZVwiIGlkPVwidGl0dWxvTW9kYWxcIj5BZGljaW9uYXIgTm92byBBbHVubzwvaDU+XHJcbiAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImNsb3NlXCIgZGF0YS1kaXNtaXNzPVwibW9kYWxcIiBhcmlhLWxhYmVsPVwiRmVjaGFyXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gYXJpYS1oaWRkZW49XCJ0cnVlXCI+JnRpbWVzOzwvc3Bhbj5cclxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIDxmb3JtPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWJvZHlcIj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbD5Ob21lIENvbXBsZXRvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFyayBjb2wtc21cIiBub21lPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCIgaWQ9XCJpbmNsdWRlX2RhdGVcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbD5EYXRhIGRlIE5hc2NpbWVudG88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrIGNvbC1zbVwiIGRhdGFOYXNjaW1lbnRvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImNwZlwiPkNQRjwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgaWQ9XCJjcGZcIiB0eXBlPVwidGV4dFwiIGF1dG9jb21wbGV0ZT1cIm9mZlwiIGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgY3BmPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwidGVsXCI+VGVsZWZvbmU8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGlkPVwidGVsXCIgdHlwZT1cInRleHRcIiBhdXRvY29tcGxldGU9XCJvZmZcIiBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHRlbGVmb25lPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImVtYWlsXCI+RS1tYWlsPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBpZD1cImVtYWlsXCIgdHlwZT1cInRleHRcIiBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIGVtYWlsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj4gICAgICAgICAgICAgICAgICAgIFxyXG5cclxuICAgICAgICAgICAgICAgICAgICAke2lucHV0RW5kZXJlY299XHJcblxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtZm9vdGVyXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIGRhdGEtZGlzbWlzcz1cIm1vZGFsXCI+RmVjaGFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwic3VibWl0XCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIiBib3Rhb1NhbHZhcj5TYWx2YXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8L2Zvcm0+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcbmA7XHJcblxyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSAoKSA9PiB7XHJcbiAgICByZXR1cm4gbW9kYWxDYWRhc3Ryb0FsdW5vO1xyXG59XHJcbiIsImNvbnN0IGRyb3BEb3duSG9yYXJpbyA9IGBcclxuPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgY29sLXNtIFwiPlxyXG4gICAgPGxhYmVsIGZvcj1cInNlbGVjdC1ob3VyXCI+U2VsZWNpb25lIG8gaG9yw6FyaW88L2xhYmVsPlxyXG4gICAgPHNlbGVjdCBjbGFzcz1cImZvcm0tY29udHJvbCBcIiBzZWxlY2FvSG9yYXJpbz5cclxuICAgICAgICA8b3B0aW9uPjA3OjAwIC0gMDc6MzA8L29wdGlvbj4gICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgPG9wdGlvbj4wNzo0MCAtIDA4OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4wODoyMCAtIDA4OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4wOTowMCAtIDA5OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4wOTo0MCAtIDEwOjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMDoyMCAtIDEwOjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMTowMCAtIDExOjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMTo0MCAtIDEyOjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMjoyMCAtIDEyOjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMzowMCAtIDEzOjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMzo0MCAtIDE0OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNDoyMCAtIDE0OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNTowMCAtIDE1OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNTo0MCAtIDE2OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNjoyMCAtIDE2OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNzowMCAtIDE3OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNzo0MCAtIDE4OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xODoyMCAtIDE4OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xOTowMCAtIDE5OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xOTo0MCAtIDIwOjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4yMDoyMCAtIDIwOjUwPC9vcHRpb24+XHJcbiAgICA8L3NlbGVjdD5cclxuPC9kaXY+XHJcbmA7XHJcblxyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSBob3JhcmlvcyA9PiB7XHJcbiAgICByZXR1cm4gYFxyXG48ZGl2IGNsYXNzPVwiY29udGFpbmVyICBib3JkZXIgYm9yZGVyLWRhcmsgIG10LTUgY29sLTZcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJyb3cgXCI+XHJcblxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC14bC1jZW50ZXIgYmFjay1ncmlkIHRleHQtd2hpdGVcIj5cclxuICAgICAgICAgICAgU2VsZWNpb25lIHVtIGhvcsOhcmlvIHBhcmEgY2FkYSBkaWEgZGEgc2VtYW5hOlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuXHJcbjxkaXYgY2xhc3M9XCJtYi0zXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cxIHRleHQtZGFyayBjb2wtNlwiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3cgXCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIG10LTRcIiBkaWFTZW1hbmE9XCJzZWd1bmRhXCI+XHJcbiAgICAgICAgICAgICAgICBTZWd1bmRhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG4gICAgXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIGNvbC02IGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cyIHRleHQtZGFya1wiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIiBkaWFTZW1hbmE9XCJ0ZXJjYVwiPlxyXG4gICAgICAgICAgICAgICAgVGVyw6dhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2wtNiBjb250YWluZXIgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzEgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiIGRpYVNlbWFuYT1cInF1YXJ0YVwiPlxyXG4gICAgICAgICAgICAgICAgUXVhcnRhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbC02IGNvbnRhaW5lciBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MiB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCIgZGlhU2VtYW5hPVwicXVpbnRhXCI+XHJcbiAgICAgICAgICAgICAgICBRdWludGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbC02IGNvbnRhaW5lciBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MSB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCIgZGlhU2VtYW5hPVwic2V4dGFcIj5cclxuICAgICAgICAgICAgICAgIFNleHRhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2wtNiBjb250YWluZXIgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzIgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC02XCIgZGlhU2VtYW5hPVwic2FiYWRvXCI+XHJcbiAgICAgICAgICAgICAgICBTw6FiYWRvOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuXHJcblxyXG48ZGl2IGNsYXNzPVwiIGNvbnRhaW5lciBjb2wtc21cIj5cclxuICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2VudGVyZWRcIj5cclxuXHJcbiAgICAgICAgICAgIDxidXR0b24gdHlwZT1cInN1Ym1pdFwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrXCIgYm90YW9Db25maXJtYXI+XHJcbiAgICAgICAgICAgICAgICBDb25maXJtYXJcclxuICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLWRhcmsgbWwtNVwiIGJvdGFvQ2FuY2VsYXI+XHJcbiAgICAgICAgICAgICAgICBDYW5jZWxhclxyXG4gICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5cclxuPHAgY2xhc3M9XCJ0ZXh0LWNlbnRlciB0ZXh0LXdoaXRlIGZvbnQtaXRhbGljIHAtM1wiPioqQ2FzbyBhbGd1bSBob3LDoXJpbyBhdGluamEgYSBsb3Rhw6fDo28gbcOheGltYSBkZSBhbHVub3MsIG8gPGJyPiBob3LDoXJpbyBmaWNhcsOhIGVtIHZlcm1lbGhvIGUgbsOjbyBwb2RlcsOhIHNlciBzZWxlY2lvbmFkby48L3A+XHJcblxyXG4gICAgYFxyXG59IiwiZXhwb3J0cy5yZW5kZXIgPSAoKSA9PiB7XHJcbiAgICByZXR1cm4gYCA8Ym9keT5cclxuICAgIDxsYWJlbCBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtdC04MFwiPkFjZXNzbyBkYSBDb250YTwvbGFiZWw+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY2FyZFwiIGlkPVwidGVsYUxvZ2luXCI+ICAgICAgIFxyXG4gICAgICAgIDxtYWluPiAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cclxuICAgICAgICAgICAgICAgIDxmb3JtPlxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwIHJzMSB2YWxpZGF0ZS1pbnB1dFwiIGRhdGEtdmFsaWRhdGU9XCJDYW1wbyBvYnJpZ2F0w7NyaW9cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJmb3JtLWNvbnRyb2xcIiBpZD1cIlwiIHBsYWNlaG9sZGVyPVwiVXN1w6FyaW9cIiB1c3VhcmlvPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgcnMyIHZhbGlkYXRlLWlucHV0XCIgZGF0YS12YWxpZGF0ZT1cIkNhbXBvIG9icmlnYXTDs3Jpb1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInBhc3N3b3JkXCIgY2xhc3M9XCJmb3JtLWNvbnRyb2xcIiBpZD1cIlwiIHBsYWNlaG9sZGVyPVwiU2VuaGFcIiBzZW5oYT5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwic3VibWl0XCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnkgYnRuIGJ0bi1vdXRsaW5lLWRhcmsgYnRuLWxnIGJ0bi1ibG9ja1wiIGJvdGFvTG9naW4+RW50cmFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRleHQtY2VudGVyIHctZnVsbCBwLXQtMjNcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGEgaHJlZj1cIiNcIiBjbGFzcz1cInRleHQtc2Vjb25kYXJ5XCI+XHJcblx0XHQgICAgXHRcdFx0XHRcdEVzcXVlY2V1IGEgU2VuaGE/IEVudHJlIGVtIENvbnRhdG8gQ29ub3NjbyBDbGljYW5kbyBBcXVpLlxyXG5cdFx0ICAgIFx0XHRcdFx0PC9hPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPC9mb3JtPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L21haW4+XHJcbiAgICAgICAgPGZvb3Rlcj48L2Zvb3Rlcj5cclxuICAgIDwvZGl2PlxyXG48L2JvZHk+XHJcbjxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9jb2RlLmpxdWVyeS5jb20vanF1ZXJ5LTMuMy4xLnNsaW0ubWluLmpzXCIgaW50ZWdyaXR5PVwic2hhMzg0LXE4aS9YKzk2NUR6TzByVDdhYks0MUpTdFFJQXFWZ1JWenBiem81c21YS3A0WWZSdkgrOGFidFRFMVBpNmppem9cIiBjcm9zc29yaWdpbj1cImFub255bW91c1wiPjwvc2NyaXB0PlxyXG48c2NyaXB0IHNyYz1cImh0dHBzOi8vY2RuanMuY2xvdWRmbGFyZS5jb20vYWpheC9saWJzL3BvcHBlci5qcy8xLjE0LjcvdW1kL3BvcHBlci5taW4uanNcIiBpbnRlZ3JpdHk9XCJzaGEzODQtVU8yZVQwQ3BIcWRTSlE2aEp0eTVLVnBodFBoeldqOVdPMWNsSFRNR2EzSkRad3JuUXE0c0Y4NmRJSE5EejBXMVwiIGNyb3Nzb3JpZ2luPVwiYW5vbnltb3VzXCI+PC9zY3JpcHQ+XHJcbjxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9zdGFja3BhdGguYm9vdHN0cmFwY2RuLmNvbS9ib290c3RyYXAvNC4zLjEvanMvYm9vdHN0cmFwLm1pbi5qc1wiIGludGVncml0eT1cInNoYTM4NC1KalNtVmd5ZDBwM3BYQjFyUmliWlVBWW9JSXk2T3JRNlZyaklFYUZmL25KR3pJeEZEc2Y0eDB4SU0rQjA3alJNXCIgY3Jvc3NvcmlnaW49XCJhbm9ueW1vdXNcIj48L3NjcmlwdD5gO1xyXG59IiwiZXhwb3J0cy5yZW5kZXIgPSBsb2dpbiA9PiB7XHJcbiAgICByZXR1cm4gYFxyXG5cclxuICAgIDxkaXYgY3BmQWx1bm89JHtsb2dpbn0+PC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwibGltaXRlclwiPlxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiaW1nLWZsdWlkIHRleHQtcmlnaHQgbXItNSBtdC01IHRleHQtd2hpdGUgYm90YW9TaHV0ZG93blwiIGJvdGFvU2h1dGRvd24+XHJcbiAgICAgICAgICAgIDxhIGhyZWY9XCIjXCI+PGltZyBzcmM9XCIuL2ltYWdlcy9zaHV0ZG93bi5wbmdcIiBhbHQ9XCJcIj48L2E+XHJcbiAgICAgICAgICAgIDxzdHJvbmcgY2xhc3M9XCJtci0xXCI+U2Fpcjwvc3Ryb25nPlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1sb2dpbjEwMFwiPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwid3JhcC1sb2dpbjEwMCBwLWItMTYwIHAtdC01MFwiPlxyXG5cclxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibG9naW4xMDAtZm9ybS10aXRsZSBwLWItNDNcIj5cclxuICAgICAgICAgICAgICAgICAgICBTZWxlY2lvbmUgdW1hIHNhbGEgcGFyYSBmYXplciBhIG1hcmNhw6fDo28gZGFzIGF1bGFzXHJcbiAgICAgICAgICAgICAgICA8L3NwYW4+XHJcblxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJtZW51MTAwLWZvcm0tYnRuMlwiIGJvdGFvTXVzY3VsYWNhbz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIE11c2N1bGHDp8OjbyAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cIm1lbnUxMDAtZm9ybS1idG4xXCIgYm90YW9NdWx0aWZ1bmNpb25hbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgTXVsdGlmdW5jaW9uYWxcclxuICAgICAgICAgICAgICAgICAgICA8L2E+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuYDtcclxufSIsImNvbnN0IEdyaWRNYXJjYWNhbyA9IHJlcXVpcmUoJy4vZ3JpZE1hcmNhY2FvLmpzJyk7XHJcblxyXG5leHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBgXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIFwiPlxyXG4gICAgPGRpdiBjbGFzcz1cImltZy1mbHVpZCB0ZXh0LXJpZ2h0IG1yLTUgbXQtNSB0ZXh0LXdoaXRlIGJvdGFvU2h1dGRvd25cIiBib3Rhb1NodXRkb3duPlxyXG4gICAgPGEgaHJlZj1cIiNcIj48aW1nIHNyYz1cIi4vaW1hZ2VzL3NodXRkb3duLnBuZ1wiIGFsdD1cIlwiPjwvYT5cclxuICAgIDxzdHJvbmcgY2xhc3M9XCJtci0xXCI+U2Fpcjwvc3Ryb25nPlxyXG48L2Rpdj5cclxuICAgIDxkaXY+XHJcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLTJcIj5cclxuICAgICAgICAgICAgU2FsYSBNdWx0aWZ1bmNpb25hbCAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgPC9zcGFuPlxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5cclxuJHtHcmlkTWFyY2FjYW8ucmVuZGVyKCl9XHJcblxyXG5gO1xyXG59IiwiY29uc3QgR3JpZE1hcmNhY2FvID0gcmVxdWlyZSgnLi9ncmlkTWFyY2FjYW8uanMnKTtcclxuXHJcbmV4cG9ydHMucmVuZGVyID0gaG9yYXJpb3MgPT4ge1xyXG4gICAgcmV0dXJuIGBcclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXIgXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwiaW1nLWZsdWlkIHRleHQtcmlnaHQgbXItNSBtdC01IHRleHQtd2hpdGUgYm90YW9TaHV0ZG93blwiIGJvdGFvU2h1dGRvd24+XHJcbiAgICA8YSBocmVmPVwiI1wiPjxpbWcgc3JjPVwiLi9pbWFnZXMvc2h1dGRvd24ucG5nXCIgYWx0PVwiXCI+PC9hPlxyXG4gICAgPHN0cm9uZyBjbGFzcz1cIm1yLTFcIj5TYWlyPC9zdHJvbmc+XHJcbjwvZGl2PlxyXG4gICAgPGRpdj5cclxuICAgICAgICA8c3BhbiBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtMlwiPlxyXG4gICAgICAgICAgICBTYWxhIE11c2N1bGFjYW8gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgIDwvc3Bhbj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuXHJcbiR7R3JpZE1hcmNhY2FvLnJlbmRlcihob3Jhcmlvcyl9XHJcblxyXG5gO1xyXG59IiwiY29uc3QgQXBwID0gcmVxdWlyZShcIi4vYXBwLmpzXCIpO1xyXG5cclxud2luZG93Lm9ubG9hZCA9ICgpID0+IHtcclxuICAgIGNvbnN0IG1haW4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwibWFpblwiKTtcclxuICAgIG5ldyBBcHAobWFpbikuaW5pdCgpO1xyXG59Il19
