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

},{"./components/administracao.js":4,"./components/login.js":7,"./components/menu.js":8,"./components/multifuncional.js":9,"./components/musculacao.js":10}],4:[function(require,module,exports){
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
                this.body.querySelector("[cidade]").value = aluno.endereco.slice(8);
                this.body.querySelector("[bairro]").value = aluno.endereco.slice(8);
                this.body.querySelector("[numero]").value = aluno.endereco.slice(8);
                this.body.querySelector("[complemento]").value = aluno.endereco.slice(8);

                $('#modalCadastroAluno').modal('show');
            }
        });
        //this.body.querySelector(e.target),        
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
            url: `${this.URL}/administracao/${idAluno}`,
            crossDomain: true,
            json: true
        };

        this.request(opts, (err, resp, data) => {
            resp.setHeader('Access-Control-Allow-Origin', '*');
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
        debugger;
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
        debugger;

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
        this.addEventListener();
        this.login = data;
    }

}

module.exports = Musculacao;

},{"../templates/musculacao.js":18,"./sala.js":11}],11:[function(require,module,exports){
const Agenda = require("./agenda.js");

class Sala extends Agenda {
    constructor(body) {
        super();
        this.body = body;
    }

    addEventListener() {
        this.botaoConfirmar();
        this.botaoCancelar();
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
        this.body.querySelector("[botaoConfirmar]").onclick = () => this.insireOuAtualizeHorario(this.login);
    }

    botaoCancelar() {
        this.body.querySelector("[botaoCancelar]").onclick = () => this.emit("loginAluno", this.login.login);
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
                    this.emit("alunoNaoInserido", err);
                } else {
                    alert("Horario inserido com sucesso!");
                }
            });
        }
    }

}

module.exports = Sala;

},{"./agenda.js":5}],12:[function(require,module,exports){
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
<<<<<<< HEAD
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXF1ZXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RpbnktZW1pdHRlci9pbmRleC5qcyIsInNyYy9hcHAuanMiLCJzcmMvY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzIiwic3JjL2NvbXBvbmVudHMvYWdlbmRhLmpzIiwic3JjL2NvbXBvbmVudHMvY2FkYXN0cm9BbHVuby5qcyIsInNyYy9jb21wb25lbnRzL2xvZ2luLmpzIiwic3JjL2NvbXBvbmVudHMvbWVudS5qcyIsInNyYy9jb21wb25lbnRzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL2NvbXBvbmVudHMvbXVzY3VsYWNhby5qcyIsInNyYy9jb21wb25lbnRzL3NhbGEuanMiLCJzcmMvdGVtcGxhdGVzL2FkbWluaXN0cmFjYW8uanMiLCJzcmMvdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanMiLCJzcmMvdGVtcGxhdGVzL2dyaWRNYXJjYWNhby5qcyIsInNyYy90ZW1wbGF0ZXMvbG9naW4uanMiLCJzcmMvdGVtcGxhdGVzL21lbnUuanMiLCJzcmMvdGVtcGxhdGVzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL3RlbXBsYXRlcy9tdXNjdWxhY2FvLmpzIiwiaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBLE1BQU0sUUFBUSxRQUFRLHVCQUFSLENBQWQ7QUFDQSxNQUFNLGdCQUFnQixRQUFRLCtCQUFSLENBQXRCO0FBQ0EsTUFBTSxPQUFPLFFBQVEsc0JBQVIsQ0FBYjtBQUNBLE1BQU0sYUFBYSxRQUFRLDRCQUFSLENBQW5CO0FBQ0EsTUFBTSxp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LFVBQVIsQ0FBWjs7QUFFQSxPQUFPLE1BQVAsR0FBZ0IsTUFBTTtBQUNsQixVQUFNLE9BQU8sU0FBUyxhQUFULENBQXVCLE1BQXZCLENBQWI7QUFDQSxRQUFJLEdBQUosQ0FBUSxJQUFSLEVBQWMsSUFBZDtBQUNILENBSEQiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvLyBCcm93c2VyIFJlcXVlc3RcclxuLy9cclxuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcclxuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxyXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcclxuLy9cclxuLy8gICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxyXG4vL1xyXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXHJcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcclxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXHJcbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcclxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXHJcblxyXG4vLyBVTUQgSEVBREVSIFNUQVJUIFxyXG4oZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcclxuICAgIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcclxuICAgICAgICAvLyBBTUQuIFJlZ2lzdGVyIGFzIGFuIGFub255bW91cyBtb2R1bGUuXHJcbiAgICAgICAgZGVmaW5lKFtdLCBmYWN0b3J5KTtcclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgLy8gTm9kZS4gRG9lcyBub3Qgd29yayB3aXRoIHN0cmljdCBDb21tb25KUywgYnV0XHJcbiAgICAgICAgLy8gb25seSBDb21tb25KUy1saWtlIGVudmlyb21lbnRzIHRoYXQgc3VwcG9ydCBtb2R1bGUuZXhwb3J0cyxcclxuICAgICAgICAvLyBsaWtlIE5vZGUuXHJcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIEJyb3dzZXIgZ2xvYmFscyAocm9vdCBpcyB3aW5kb3cpXHJcbiAgICAgICAgcm9vdC5yZXR1cm5FeHBvcnRzID0gZmFjdG9yeSgpO1xyXG4gIH1cclxufSh0aGlzLCBmdW5jdGlvbiAoKSB7XHJcbi8vIFVNRCBIRUFERVIgRU5EXHJcblxyXG52YXIgWEhSID0gWE1MSHR0cFJlcXVlc3RcclxuaWYgKCFYSFIpIHRocm93IG5ldyBFcnJvcignbWlzc2luZyBYTUxIdHRwUmVxdWVzdCcpXHJcbnJlcXVlc3QubG9nID0ge1xyXG4gICd0cmFjZSc6IG5vb3AsICdkZWJ1Zyc6IG5vb3AsICdpbmZvJzogbm9vcCwgJ3dhcm4nOiBub29wLCAnZXJyb3InOiBub29wXHJcbn1cclxuXHJcbnZhciBERUZBVUxUX1RJTUVPVVQgPSAzICogNjAgKiAxMDAwIC8vIDMgbWludXRlc1xyXG5cclxuLy9cclxuLy8gcmVxdWVzdFxyXG4vL1xyXG5cclxuZnVuY3Rpb24gcmVxdWVzdChvcHRpb25zLCBjYWxsYmFjaykge1xyXG4gIC8vIFRoZSBlbnRyeS1wb2ludCB0byB0aGUgQVBJOiBwcmVwIHRoZSBvcHRpb25zIG9iamVjdCBhbmQgcGFzcyB0aGUgcmVhbCB3b3JrIHRvIHJ1bl94aHIuXHJcbiAgaWYodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdCYWQgY2FsbGJhY2sgZ2l2ZW46ICcgKyBjYWxsYmFjaylcclxuXHJcbiAgaWYoIW9wdGlvbnMpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIG9wdGlvbnMgZ2l2ZW4nKVxyXG5cclxuICB2YXIgb3B0aW9uc19vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlOyAvLyBTYXZlIHRoaXMgZm9yIGxhdGVyLlxyXG5cclxuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXHJcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9O1xyXG4gIGVsc2VcclxuICAgIG9wdGlvbnMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdGlvbnMpKTsgLy8gVXNlIGEgZHVwbGljYXRlIGZvciBtdXRhdGluZy5cclxuXHJcbiAgb3B0aW9ucy5vblJlc3BvbnNlID0gb3B0aW9uc19vblJlc3BvbnNlIC8vIEFuZCBwdXQgaXQgYmFjay5cclxuXHJcbiAgaWYgKG9wdGlvbnMudmVyYm9zZSkgcmVxdWVzdC5sb2cgPSBnZXRMb2dnZXIoKTtcclxuXHJcbiAgaWYob3B0aW9ucy51cmwpIHtcclxuICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmw7XHJcbiAgICBkZWxldGUgb3B0aW9ucy51cmw7XHJcbiAgfVxyXG5cclxuICBpZighb3B0aW9ucy51cmkgJiYgb3B0aW9ucy51cmkgIT09IFwiXCIpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLnVyaSBpcyBhIHJlcXVpcmVkIGFyZ3VtZW50XCIpO1xyXG5cclxuICBpZih0eXBlb2Ygb3B0aW9ucy51cmkgIT0gXCJzdHJpbmdcIilcclxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIG11c3QgYmUgYSBzdHJpbmdcIik7XHJcblxyXG4gIHZhciB1bnN1cHBvcnRlZF9vcHRpb25zID0gWydwcm94eScsICdfcmVkaXJlY3RzRm9sbG93ZWQnLCAnbWF4UmVkaXJlY3RzJywgJ2ZvbGxvd1JlZGlyZWN0J11cclxuICBmb3IgKHZhciBpID0gMDsgaSA8IHVuc3VwcG9ydGVkX29wdGlvbnMubGVuZ3RoOyBpKyspXHJcbiAgICBpZihvcHRpb25zWyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldIF0pXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMuXCIgKyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldICsgXCIgaXMgbm90IHN1cHBvcnRlZFwiKVxyXG5cclxuICBvcHRpb25zLmNhbGxiYWNrID0gY2FsbGJhY2tcclxuICBvcHRpb25zLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kIHx8ICdHRVQnO1xyXG4gIG9wdGlvbnMuaGVhZGVycyA9IG9wdGlvbnMuaGVhZGVycyB8fCB7fTtcclxuICBvcHRpb25zLmJvZHkgICAgPSBvcHRpb25zLmJvZHkgfHwgbnVsbFxyXG4gIG9wdGlvbnMudGltZW91dCA9IG9wdGlvbnMudGltZW91dCB8fCByZXF1ZXN0LkRFRkFVTFRfVElNRU9VVFxyXG5cclxuICBpZihvcHRpb25zLmhlYWRlcnMuaG9zdClcclxuICAgIHRocm93IG5ldyBFcnJvcihcIk9wdGlvbnMuaGVhZGVycy5ob3N0IGlzIG5vdCBzdXBwb3J0ZWRcIik7XHJcblxyXG4gIGlmKG9wdGlvbnMuanNvbikge1xyXG4gICAgb3B0aW9ucy5oZWFkZXJzLmFjY2VwdCA9IG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgfHwgJ2FwcGxpY2F0aW9uL2pzb24nXHJcbiAgICBpZihvcHRpb25zLm1ldGhvZCAhPT0gJ0dFVCcpXHJcbiAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSAnYXBwbGljYXRpb24vanNvbidcclxuXHJcbiAgICBpZih0eXBlb2Ygb3B0aW9ucy5qc29uICE9PSAnYm9vbGVhbicpXHJcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuanNvbilcclxuICAgIGVsc2UgaWYodHlwZW9mIG9wdGlvbnMuYm9keSAhPT0gJ3N0cmluZycpXHJcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuYm9keSlcclxuICB9XHJcbiAgXHJcbiAgLy9CRUdJTiBRUyBIYWNrXHJcbiAgdmFyIHNlcmlhbGl6ZSA9IGZ1bmN0aW9uKG9iaikge1xyXG4gICAgdmFyIHN0ciA9IFtdO1xyXG4gICAgZm9yKHZhciBwIGluIG9iailcclxuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xyXG4gICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xyXG4gICAgICB9XHJcbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xyXG4gIH1cclxuICBcclxuICBpZihvcHRpb25zLnFzKXtcclxuICAgIHZhciBxcyA9ICh0eXBlb2Ygb3B0aW9ucy5xcyA9PSAnc3RyaW5nJyk/IG9wdGlvbnMucXMgOiBzZXJpYWxpemUob3B0aW9ucy5xcyk7XHJcbiAgICBpZihvcHRpb25zLnVyaS5pbmRleE9mKCc/JykgIT09IC0xKXsgLy9ubyBnZXQgcGFyYW1zXHJcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnJicrcXM7XHJcbiAgICB9ZWxzZXsgLy9leGlzdGluZyBnZXQgcGFyYW1zXHJcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnPycrcXM7XHJcbiAgICB9XHJcbiAgfVxyXG4gIC8vRU5EIFFTIEhhY2tcclxuICBcclxuICAvL0JFR0lOIEZPUk0gSGFja1xyXG4gIHZhciBtdWx0aXBhcnQgPSBmdW5jdGlvbihvYmopIHtcclxuICAgIC8vdG9kbzogc3VwcG9ydCBmaWxlIHR5cGUgKHVzZWZ1bD8pXHJcbiAgICB2YXIgcmVzdWx0ID0ge307XHJcbiAgICByZXN1bHQuYm91bmRyeSA9ICctLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tJytNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqMTAwMDAwMDAwMCk7XHJcbiAgICB2YXIgbGluZXMgPSBbXTtcclxuICAgIGZvcih2YXIgcCBpbiBvYmope1xyXG4gICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcclxuICAgICAgICAgICAgbGluZXMucHVzaChcclxuICAgICAgICAgICAgICAgICctLScrcmVzdWx0LmJvdW5kcnkrXCJcXG5cIitcclxuICAgICAgICAgICAgICAgICdDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCInK3ArJ1wiJytcIlxcblwiK1xyXG4gICAgICAgICAgICAgICAgXCJcXG5cIitcclxuICAgICAgICAgICAgICAgIG9ialtwXStcIlxcblwiXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgbGluZXMucHVzaCggJy0tJytyZXN1bHQuYm91bmRyeSsnLS0nICk7XHJcbiAgICByZXN1bHQuYm9keSA9IGxpbmVzLmpvaW4oJycpO1xyXG4gICAgcmVzdWx0Lmxlbmd0aCA9IHJlc3VsdC5ib2R5Lmxlbmd0aDtcclxuICAgIHJlc3VsdC50eXBlID0gJ211bHRpcGFydC9mb3JtLWRhdGE7IGJvdW5kYXJ5PScrcmVzdWx0LmJvdW5kcnk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG4gIH1cclxuICBcclxuICBpZihvcHRpb25zLmZvcm0pe1xyXG4gICAgaWYodHlwZW9mIG9wdGlvbnMuZm9ybSA9PSAnc3RyaW5nJykgdGhyb3coJ2Zvcm0gbmFtZSB1bnN1cHBvcnRlZCcpO1xyXG4gICAgaWYob3B0aW9ucy5tZXRob2QgPT09ICdQT1NUJyl7XHJcbiAgICAgICAgdmFyIGVuY29kaW5nID0gKG9wdGlvbnMuZW5jb2RpbmcgfHwgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IGVuY29kaW5nO1xyXG4gICAgICAgIHN3aXRjaChlbmNvZGluZyl7XHJcbiAgICAgICAgICAgIGNhc2UgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmJvZHkgPSBzZXJpYWxpemUob3B0aW9ucy5mb3JtKS5yZXBsYWNlKC8lMjAvZywgXCIrXCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ211bHRpcGFydC9mb3JtLWRhdGEnOlxyXG4gICAgICAgICAgICAgICAgdmFyIG11bHRpID0gbXVsdGlwYXJ0KG9wdGlvbnMuZm9ybSk7XHJcbiAgICAgICAgICAgICAgICAvL29wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IG11bHRpLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IG11bHRpLmJvZHk7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gbXVsdGkudHlwZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0IDogdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBlbmNvZGluZzonK2VuY29kaW5nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG4gIC8vRU5EIEZPUk0gSGFja1xyXG5cclxuICAvLyBJZiBvblJlc3BvbnNlIGlzIGJvb2xlYW4gdHJ1ZSwgY2FsbCBiYWNrIGltbWVkaWF0ZWx5IHdoZW4gdGhlIHJlc3BvbnNlIGlzIGtub3duLFxyXG4gIC8vIG5vdCB3aGVuIHRoZSBmdWxsIHJlcXVlc3QgaXMgY29tcGxldGUuXHJcbiAgb3B0aW9ucy5vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlIHx8IG5vb3BcclxuICBpZihvcHRpb25zLm9uUmVzcG9uc2UgPT09IHRydWUpIHtcclxuICAgIG9wdGlvbnMub25SZXNwb25zZSA9IGNhbGxiYWNrXHJcbiAgICBvcHRpb25zLmNhbGxiYWNrID0gbm9vcFxyXG4gIH1cclxuXHJcbiAgLy8gWFhYIEJyb3dzZXJzIGRvIG5vdCBsaWtlIHRoaXMuXHJcbiAgLy9pZihvcHRpb25zLmJvZHkpXHJcbiAgLy8gIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IG9wdGlvbnMuYm9keS5sZW5ndGg7XHJcblxyXG4gIC8vIEhUVFAgYmFzaWMgYXV0aGVudGljYXRpb25cclxuICBpZighb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24gJiYgb3B0aW9ucy5hdXRoKVxyXG4gICAgb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24gPSAnQmFzaWMgJyArIGI2NF9lbmMob3B0aW9ucy5hdXRoLnVzZXJuYW1lICsgJzonICsgb3B0aW9ucy5hdXRoLnBhc3N3b3JkKTtcclxuXHJcbiAgcmV0dXJuIHJ1bl94aHIob3B0aW9ucylcclxufVxyXG5cclxudmFyIHJlcV9zZXEgPSAwXHJcbmZ1bmN0aW9uIHJ1bl94aHIob3B0aW9ucykge1xyXG4gIHZhciB4aHIgPSBuZXcgWEhSXHJcbiAgICAsIHRpbWVkX291dCA9IGZhbHNlXHJcbiAgICAsIGlzX2NvcnMgPSBpc19jcm9zc0RvbWFpbihvcHRpb25zLnVyaSlcclxuICAgICwgc3VwcG9ydHNfY29ycyA9ICgnd2l0aENyZWRlbnRpYWxzJyBpbiB4aHIpXHJcblxyXG4gIHJlcV9zZXEgKz0gMVxyXG4gIHhoci5zZXFfaWQgPSByZXFfc2VxXHJcbiAgeGhyLmlkID0gcmVxX3NlcSArICc6ICcgKyBvcHRpb25zLm1ldGhvZCArICcgJyArIG9wdGlvbnMudXJpXHJcbiAgeGhyLl9pZCA9IHhoci5pZCAvLyBJIGtub3cgSSB3aWxsIHR5cGUgXCJfaWRcIiBmcm9tIGhhYml0IGFsbCB0aGUgdGltZS5cclxuXHJcbiAgaWYoaXNfY29ycyAmJiAhc3VwcG9ydHNfY29ycykge1xyXG4gICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdCcm93c2VyIGRvZXMgbm90IHN1cHBvcnQgY3Jvc3Mtb3JpZ2luIHJlcXVlc3Q6ICcgKyBvcHRpb25zLnVyaSlcclxuICAgIGNvcnNfZXJyLmNvcnMgPSAndW5zdXBwb3J0ZWQnXHJcbiAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxyXG4gIH1cclxuXHJcbiAgeGhyLnRpbWVvdXRUaW1lciA9IHNldFRpbWVvdXQodG9vX2xhdGUsIG9wdGlvbnMudGltZW91dClcclxuICBmdW5jdGlvbiB0b29fbGF0ZSgpIHtcclxuICAgIHRpbWVkX291dCA9IHRydWVcclxuICAgIHZhciBlciA9IG5ldyBFcnJvcignRVRJTUVET1VUJylcclxuICAgIGVyLmNvZGUgPSAnRVRJTUVET1VUJ1xyXG4gICAgZXIuZHVyYXRpb24gPSBvcHRpb25zLnRpbWVvdXRcclxuXHJcbiAgICByZXF1ZXN0LmxvZy5lcnJvcignVGltZW91dCcsIHsgJ2lkJzp4aHIuX2lkLCAnbWlsbGlzZWNvbmRzJzpvcHRpb25zLnRpbWVvdXQgfSlcclxuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpXHJcbiAgfVxyXG5cclxuICAvLyBTb21lIHN0YXRlcyBjYW4gYmUgc2tpcHBlZCBvdmVyLCBzbyByZW1lbWJlciB3aGF0IGlzIHN0aWxsIGluY29tcGxldGUuXHJcbiAgdmFyIGRpZCA9IHsncmVzcG9uc2UnOmZhbHNlLCAnbG9hZGluZyc6ZmFsc2UsICdlbmQnOmZhbHNlfVxyXG5cclxuICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gb25fc3RhdGVfY2hhbmdlXHJcbiAgeGhyLm9wZW4ob3B0aW9ucy5tZXRob2QsIG9wdGlvbnMudXJpLCB0cnVlKSAvLyBhc3luY2hyb25vdXNcclxuICBpZihpc19jb3JzKVxyXG4gICAgeGhyLndpdGhDcmVkZW50aWFscyA9ICEhIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzXHJcbiAgeGhyLnNlbmQob3B0aW9ucy5ib2R5KVxyXG4gIHJldHVybiB4aHJcclxuXHJcbiAgZnVuY3Rpb24gb25fc3RhdGVfY2hhbmdlKGV2ZW50KSB7XHJcbiAgICBpZih0aW1lZF9vdXQpXHJcbiAgICAgIHJldHVybiByZXF1ZXN0LmxvZy5kZWJ1ZygnSWdub3JpbmcgdGltZWQgb3V0IHN0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZH0pXHJcblxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1N0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZCwgJ3RpbWVkX291dCc6dGltZWRfb3V0fSlcclxuXHJcbiAgICBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLk9QRU5FRCkge1xyXG4gICAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVxdWVzdCBzdGFydGVkJywgeydpZCc6eGhyLmlkfSlcclxuICAgICAgZm9yICh2YXIga2V5IGluIG9wdGlvbnMuaGVhZGVycylcclxuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIG9wdGlvbnMuaGVhZGVyc1trZXldKVxyXG4gICAgfVxyXG5cclxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5IRUFERVJTX1JFQ0VJVkVEKVxyXG4gICAgICBvbl9yZXNwb25zZSgpXHJcblxyXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkxPQURJTkcpIHtcclxuICAgICAgb25fcmVzcG9uc2UoKVxyXG4gICAgICBvbl9sb2FkaW5nKClcclxuICAgIH1cclxuXHJcbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuRE9ORSkge1xyXG4gICAgICBvbl9yZXNwb25zZSgpXHJcbiAgICAgIG9uX2xvYWRpbmcoKVxyXG4gICAgICBvbl9lbmQoKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gb25fcmVzcG9uc2UoKSB7XHJcbiAgICBpZihkaWQucmVzcG9uc2UpXHJcbiAgICAgIHJldHVyblxyXG5cclxuICAgIGRpZC5yZXNwb25zZSA9IHRydWVcclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdHb3QgcmVzcG9uc2UnLCB7J2lkJzp4aHIuaWQsICdzdGF0dXMnOnhoci5zdGF0dXN9KVxyXG4gICAgY2xlYXJUaW1lb3V0KHhoci50aW1lb3V0VGltZXIpXHJcbiAgICB4aHIuc3RhdHVzQ29kZSA9IHhoci5zdGF0dXMgLy8gTm9kZSByZXF1ZXN0IGNvbXBhdGliaWxpdHlcclxuXHJcbiAgICAvLyBEZXRlY3QgZmFpbGVkIENPUlMgcmVxdWVzdHMuXHJcbiAgICBpZihpc19jb3JzICYmIHhoci5zdGF0dXNDb2RlID09IDApIHtcclxuICAgICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdDT1JTIHJlcXVlc3QgcmVqZWN0ZWQ6ICcgKyBvcHRpb25zLnVyaSlcclxuICAgICAgY29yc19lcnIuY29ycyA9ICdyZWplY3RlZCdcclxuXHJcbiAgICAgIC8vIERvIG5vdCBwcm9jZXNzIHRoaXMgcmVxdWVzdCBmdXJ0aGVyLlxyXG4gICAgICBkaWQubG9hZGluZyA9IHRydWVcclxuICAgICAgZGlkLmVuZCA9IHRydWVcclxuXHJcbiAgICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGNvcnNfZXJyLCB4aHIpXHJcbiAgICB9XHJcblxyXG4gICAgb3B0aW9ucy5vblJlc3BvbnNlKG51bGwsIHhocilcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG9uX2xvYWRpbmcoKSB7XHJcbiAgICBpZihkaWQubG9hZGluZylcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAgZGlkLmxvYWRpbmcgPSB0cnVlXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVzcG9uc2UgYm9keSBsb2FkaW5nJywgeydpZCc6eGhyLmlkfSlcclxuICAgIC8vIFRPRE86IE1heWJlIHNpbXVsYXRlIFwiZGF0YVwiIGV2ZW50cyBieSB3YXRjaGluZyB4aHIucmVzcG9uc2VUZXh0XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBvbl9lbmQoKSB7XHJcbiAgICBpZihkaWQuZW5kKVxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBkaWQuZW5kID0gdHJ1ZVxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3QgZG9uZScsIHsnaWQnOnhoci5pZH0pXHJcblxyXG4gICAgeGhyLmJvZHkgPSB4aHIucmVzcG9uc2VUZXh0XHJcbiAgICBpZihvcHRpb25zLmpzb24pIHtcclxuICAgICAgdHJ5ICAgICAgICB7IHhoci5ib2R5ID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KSB9XHJcbiAgICAgIGNhdGNoIChlcikgeyByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKSAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG9wdGlvbnMuY2FsbGJhY2sobnVsbCwgeGhyLCB4aHIuYm9keSlcclxuICB9XHJcblxyXG59IC8vIHJlcXVlc3RcclxuXHJcbnJlcXVlc3Qud2l0aENyZWRlbnRpYWxzID0gZmFsc2U7XHJcbnJlcXVlc3QuREVGQVVMVF9USU1FT1VUID0gREVGQVVMVF9USU1FT1VUO1xyXG5cclxuLy9cclxuLy8gZGVmYXVsdHNcclxuLy9cclxuXHJcbnJlcXVlc3QuZGVmYXVsdHMgPSBmdW5jdGlvbihvcHRpb25zLCByZXF1ZXN0ZXIpIHtcclxuICB2YXIgZGVmID0gZnVuY3Rpb24gKG1ldGhvZCkge1xyXG4gICAgdmFyIGQgPSBmdW5jdGlvbiAocGFyYW1zLCBjYWxsYmFjaykge1xyXG4gICAgICBpZih0eXBlb2YgcGFyYW1zID09PSAnc3RyaW5nJylcclxuICAgICAgICBwYXJhbXMgPSB7J3VyaSc6IHBhcmFtc307XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHBhcmFtcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocGFyYW1zKSk7XHJcbiAgICAgIH1cclxuICAgICAgZm9yICh2YXIgaSBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgaWYgKHBhcmFtc1tpXSA9PT0gdW5kZWZpbmVkKSBwYXJhbXNbaV0gPSBvcHRpb25zW2ldXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG1ldGhvZChwYXJhbXMsIGNhbGxiYWNrKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGRcclxuICB9XHJcbiAgdmFyIGRlID0gZGVmKHJlcXVlc3QpXHJcbiAgZGUuZ2V0ID0gZGVmKHJlcXVlc3QuZ2V0KVxyXG4gIGRlLnBvc3QgPSBkZWYocmVxdWVzdC5wb3N0KVxyXG4gIGRlLnB1dCA9IGRlZihyZXF1ZXN0LnB1dClcclxuICBkZS5oZWFkID0gZGVmKHJlcXVlc3QuaGVhZClcclxuICByZXR1cm4gZGVcclxufVxyXG5cclxuLy9cclxuLy8gSFRUUCBtZXRob2Qgc2hvcnRjdXRzXHJcbi8vXHJcblxyXG52YXIgc2hvcnRjdXRzID0gWyAnZ2V0JywgJ3B1dCcsICdwb3N0JywgJ2hlYWQnIF07XHJcbnNob3J0Y3V0cy5mb3JFYWNoKGZ1bmN0aW9uKHNob3J0Y3V0KSB7XHJcbiAgdmFyIG1ldGhvZCA9IHNob3J0Y3V0LnRvVXBwZXJDYXNlKCk7XHJcbiAgdmFyIGZ1bmMgICA9IHNob3J0Y3V0LnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gIHJlcXVlc3RbZnVuY10gPSBmdW5jdGlvbihvcHRzKSB7XHJcbiAgICBpZih0eXBlb2Ygb3B0cyA9PT0gJ3N0cmluZycpXHJcbiAgICAgIG9wdHMgPSB7J21ldGhvZCc6bWV0aG9kLCAndXJpJzpvcHRzfTtcclxuICAgIGVsc2Uge1xyXG4gICAgICBvcHRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRzKSk7XHJcbiAgICAgIG9wdHMubWV0aG9kID0gbWV0aG9kO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBhcmdzID0gW29wdHNdLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuYXBwbHkoYXJndW1lbnRzLCBbMV0pKTtcclxuICAgIHJldHVybiByZXF1ZXN0LmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gIH1cclxufSlcclxuXHJcbi8vXHJcbi8vIENvdWNoREIgc2hvcnRjdXRcclxuLy9cclxuXHJcbnJlcXVlc3QuY291Y2ggPSBmdW5jdGlvbihvcHRpb25zLCBjYWxsYmFjaykge1xyXG4gIGlmKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJylcclxuICAgIG9wdGlvbnMgPSB7J3VyaSc6b3B0aW9uc31cclxuXHJcbiAgLy8gSnVzdCB1c2UgdGhlIHJlcXVlc3QgQVBJIHRvIGRvIEpTT04uXHJcbiAgb3B0aW9ucy5qc29uID0gdHJ1ZVxyXG4gIGlmKG9wdGlvbnMuYm9keSlcclxuICAgIG9wdGlvbnMuanNvbiA9IG9wdGlvbnMuYm9keVxyXG4gIGRlbGV0ZSBvcHRpb25zLmJvZHlcclxuXHJcbiAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBub29wXHJcblxyXG4gIHZhciB4aHIgPSByZXF1ZXN0KG9wdGlvbnMsIGNvdWNoX2hhbmRsZXIpXHJcbiAgcmV0dXJuIHhoclxyXG5cclxuICBmdW5jdGlvbiBjb3VjaF9oYW5kbGVyKGVyLCByZXNwLCBib2R5KSB7XHJcbiAgICBpZihlcilcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KVxyXG5cclxuICAgIGlmKChyZXNwLnN0YXR1c0NvZGUgPCAyMDAgfHwgcmVzcC5zdGF0dXNDb2RlID4gMjk5KSAmJiBib2R5LmVycm9yKSB7XHJcbiAgICAgIC8vIFRoZSBib2R5IGlzIGEgQ291Y2ggSlNPTiBvYmplY3QgaW5kaWNhdGluZyB0aGUgZXJyb3IuXHJcbiAgICAgIGVyID0gbmV3IEVycm9yKCdDb3VjaERCIGVycm9yOiAnICsgKGJvZHkuZXJyb3IucmVhc29uIHx8IGJvZHkuZXJyb3IuZXJyb3IpKVxyXG4gICAgICBmb3IgKHZhciBrZXkgaW4gYm9keSlcclxuICAgICAgICBlcltrZXldID0gYm9keVtrZXldXHJcbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KTtcclxuICB9XHJcbn1cclxuXHJcbi8vXHJcbi8vIFV0aWxpdHlcclxuLy9cclxuXHJcbmZ1bmN0aW9uIG5vb3AoKSB7fVxyXG5cclxuZnVuY3Rpb24gZ2V0TG9nZ2VyKCkge1xyXG4gIHZhciBsb2dnZXIgPSB7fVxyXG4gICAgLCBsZXZlbHMgPSBbJ3RyYWNlJywgJ2RlYnVnJywgJ2luZm8nLCAnd2FybicsICdlcnJvciddXHJcbiAgICAsIGxldmVsLCBpXHJcblxyXG4gIGZvcihpID0gMDsgaSA8IGxldmVscy5sZW5ndGg7IGkrKykge1xyXG4gICAgbGV2ZWwgPSBsZXZlbHNbaV1cclxuXHJcbiAgICBsb2dnZXJbbGV2ZWxdID0gbm9vcFxyXG4gICAgaWYodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIGNvbnNvbGUgJiYgY29uc29sZVtsZXZlbF0pXHJcbiAgICAgIGxvZ2dlcltsZXZlbF0gPSBmb3JtYXR0ZWQoY29uc29sZSwgbGV2ZWwpXHJcbiAgfVxyXG5cclxuICByZXR1cm4gbG9nZ2VyXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZvcm1hdHRlZChvYmosIG1ldGhvZCkge1xyXG4gIHJldHVybiBmb3JtYXR0ZWRfbG9nZ2VyXHJcblxyXG4gIGZ1bmN0aW9uIGZvcm1hdHRlZF9sb2dnZXIoc3RyLCBjb250ZXh0KSB7XHJcbiAgICBpZih0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpXHJcbiAgICAgIHN0ciArPSAnICcgKyBKU09OLnN0cmluZ2lmeShjb250ZXh0KVxyXG5cclxuICAgIHJldHVybiBvYmpbbWV0aG9kXS5jYWxsKG9iaiwgc3RyKVxyXG4gIH1cclxufVxyXG5cclxuLy8gUmV0dXJuIHdoZXRoZXIgYSBVUkwgaXMgYSBjcm9zcy1kb21haW4gcmVxdWVzdC5cclxuZnVuY3Rpb24gaXNfY3Jvc3NEb21haW4odXJsKSB7XHJcbiAgdmFyIHJ1cmwgPSAvXihbXFx3XFwrXFwuXFwtXSs6KSg/OlxcL1xcLyhbXlxcLz8jOl0qKSg/OjooXFxkKykpPyk/L1xyXG5cclxuICAvLyBqUXVlcnkgIzgxMzgsIElFIG1heSB0aHJvdyBhbiBleGNlcHRpb24gd2hlbiBhY2Nlc3NpbmdcclxuICAvLyBhIGZpZWxkIGZyb20gd2luZG93LmxvY2F0aW9uIGlmIGRvY3VtZW50LmRvbWFpbiBoYXMgYmVlbiBzZXRcclxuICB2YXIgYWpheExvY2F0aW9uXHJcbiAgdHJ5IHsgYWpheExvY2F0aW9uID0gbG9jYXRpb24uaHJlZiB9XHJcbiAgY2F0Y2ggKGUpIHtcclxuICAgIC8vIFVzZSB0aGUgaHJlZiBhdHRyaWJ1dGUgb2YgYW4gQSBlbGVtZW50IHNpbmNlIElFIHdpbGwgbW9kaWZ5IGl0IGdpdmVuIGRvY3VtZW50LmxvY2F0aW9uXHJcbiAgICBhamF4TG9jYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCBcImFcIiApO1xyXG4gICAgYWpheExvY2F0aW9uLmhyZWYgPSBcIlwiO1xyXG4gICAgYWpheExvY2F0aW9uID0gYWpheExvY2F0aW9uLmhyZWY7XHJcbiAgfVxyXG5cclxuICB2YXIgYWpheExvY1BhcnRzID0gcnVybC5leGVjKGFqYXhMb2NhdGlvbi50b0xvd2VyQ2FzZSgpKSB8fCBbXVxyXG4gICAgLCBwYXJ0cyA9IHJ1cmwuZXhlYyh1cmwudG9Mb3dlckNhc2UoKSApXHJcblxyXG4gIHZhciByZXN1bHQgPSAhIShcclxuICAgIHBhcnRzICYmXHJcbiAgICAoICBwYXJ0c1sxXSAhPSBhamF4TG9jUGFydHNbMV1cclxuICAgIHx8IHBhcnRzWzJdICE9IGFqYXhMb2NQYXJ0c1syXVxyXG4gICAgfHwgKHBhcnRzWzNdIHx8IChwYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKSAhPSAoYWpheExvY1BhcnRzWzNdIHx8IChhamF4TG9jUGFydHNbMV0gPT09IFwiaHR0cDpcIiA/IDgwIDogNDQzKSlcclxuICAgIClcclxuICApXHJcblxyXG4gIC8vY29uc29sZS5kZWJ1ZygnaXNfY3Jvc3NEb21haW4oJyt1cmwrJykgLT4gJyArIHJlc3VsdClcclxuICByZXR1cm4gcmVzdWx0XHJcbn1cclxuXHJcbi8vIE1JVCBMaWNlbnNlIGZyb20gaHR0cDovL3BocGpzLm9yZy9mdW5jdGlvbnMvYmFzZTY0X2VuY29kZTozNThcclxuZnVuY3Rpb24gYjY0X2VuYyAoZGF0YSkge1xyXG4gICAgLy8gRW5jb2RlcyBzdHJpbmcgdXNpbmcgTUlNRSBiYXNlNjQgYWxnb3JpdGhtXHJcbiAgICB2YXIgYjY0ID0gXCJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvPVwiO1xyXG4gICAgdmFyIG8xLCBvMiwgbzMsIGgxLCBoMiwgaDMsIGg0LCBiaXRzLCBpID0gMCwgYWMgPSAwLCBlbmM9XCJcIiwgdG1wX2FyciA9IFtdO1xyXG5cclxuICAgIGlmICghZGF0YSkge1xyXG4gICAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGFzc3VtZSB1dGY4IGRhdGFcclxuICAgIC8vIGRhdGEgPSB0aGlzLnV0ZjhfZW5jb2RlKGRhdGErJycpO1xyXG5cclxuICAgIGRvIHsgLy8gcGFjayB0aHJlZSBvY3RldHMgaW50byBmb3VyIGhleGV0c1xyXG4gICAgICAgIG8xID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XHJcbiAgICAgICAgbzIgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcclxuICAgICAgICBvMyA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xyXG5cclxuICAgICAgICBiaXRzID0gbzE8PDE2IHwgbzI8PDggfCBvMztcclxuXHJcbiAgICAgICAgaDEgPSBiaXRzPj4xOCAmIDB4M2Y7XHJcbiAgICAgICAgaDIgPSBiaXRzPj4xMiAmIDB4M2Y7XHJcbiAgICAgICAgaDMgPSBiaXRzPj42ICYgMHgzZjtcclxuICAgICAgICBoNCA9IGJpdHMgJiAweDNmO1xyXG5cclxuICAgICAgICAvLyB1c2UgaGV4ZXRzIHRvIGluZGV4IGludG8gYjY0LCBhbmQgYXBwZW5kIHJlc3VsdCB0byBlbmNvZGVkIHN0cmluZ1xyXG4gICAgICAgIHRtcF9hcnJbYWMrK10gPSBiNjQuY2hhckF0KGgxKSArIGI2NC5jaGFyQXQoaDIpICsgYjY0LmNoYXJBdChoMykgKyBiNjQuY2hhckF0KGg0KTtcclxuICAgIH0gd2hpbGUgKGkgPCBkYXRhLmxlbmd0aCk7XHJcblxyXG4gICAgZW5jID0gdG1wX2Fyci5qb2luKCcnKTtcclxuXHJcbiAgICBzd2l0Y2ggKGRhdGEubGVuZ3RoICUgMykge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0yKSArICc9PSc7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgICBlbmMgPSBlbmMuc2xpY2UoMCwgLTEpICsgJz0nO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBlbmM7XHJcbn1cclxuICAgIHJldHVybiByZXF1ZXN0O1xyXG4vL1VNRCBGT09URVIgU1RBUlRcclxufSkpO1xyXG4vL1VNRCBGT09URVIgRU5EXHJcbiIsImZ1bmN0aW9uIEUgKCkge1xyXG4gIC8vIEtlZXAgdGhpcyBlbXB0eSBzbyBpdCdzIGVhc2llciB0byBpbmhlcml0IGZyb21cclxuICAvLyAodmlhIGh0dHBzOi8vZ2l0aHViLmNvbS9saXBzbWFjayBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9zY290dGNvcmdhbi90aW55LWVtaXR0ZXIvaXNzdWVzLzMpXHJcbn1cclxuXHJcbkUucHJvdG90eXBlID0ge1xyXG4gIG9uOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2ssIGN0eCkge1xyXG4gICAgdmFyIGUgPSB0aGlzLmUgfHwgKHRoaXMuZSA9IHt9KTtcclxuXHJcbiAgICAoZVtuYW1lXSB8fCAoZVtuYW1lXSA9IFtdKSkucHVzaCh7XHJcbiAgICAgIGZuOiBjYWxsYmFjayxcclxuICAgICAgY3R4OiBjdHhcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH0sXHJcblxyXG4gIG9uY2U6IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaywgY3R4KSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBmdW5jdGlvbiBsaXN0ZW5lciAoKSB7XHJcbiAgICAgIHNlbGYub2ZmKG5hbWUsIGxpc3RlbmVyKTtcclxuICAgICAgY2FsbGJhY2suYXBwbHkoY3R4LCBhcmd1bWVudHMpO1xyXG4gICAgfTtcclxuXHJcbiAgICBsaXN0ZW5lci5fID0gY2FsbGJhY2tcclxuICAgIHJldHVybiB0aGlzLm9uKG5hbWUsIGxpc3RlbmVyLCBjdHgpO1xyXG4gIH0sXHJcblxyXG4gIGVtaXQ6IGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICB2YXIgZGF0YSA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcclxuICAgIHZhciBldnRBcnIgPSAoKHRoaXMuZSB8fCAodGhpcy5lID0ge30pKVtuYW1lXSB8fCBbXSkuc2xpY2UoKTtcclxuICAgIHZhciBpID0gMDtcclxuICAgIHZhciBsZW4gPSBldnRBcnIubGVuZ3RoO1xyXG5cclxuICAgIGZvciAoaTsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIGV2dEFycltpXS5mbi5hcHBseShldnRBcnJbaV0uY3R4LCBkYXRhKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9LFxyXG5cclxuICBvZmY6IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaykge1xyXG4gICAgdmFyIGUgPSB0aGlzLmUgfHwgKHRoaXMuZSA9IHt9KTtcclxuICAgIHZhciBldnRzID0gZVtuYW1lXTtcclxuICAgIHZhciBsaXZlRXZlbnRzID0gW107XHJcblxyXG4gICAgaWYgKGV2dHMgJiYgY2FsbGJhY2spIHtcclxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGV2dHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuICAgICAgICBpZiAoZXZ0c1tpXS5mbiAhPT0gY2FsbGJhY2sgJiYgZXZ0c1tpXS5mbi5fICE9PSBjYWxsYmFjaylcclxuICAgICAgICAgIGxpdmVFdmVudHMucHVzaChldnRzW2ldKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlbW92ZSBldmVudCBmcm9tIHF1ZXVlIHRvIHByZXZlbnQgbWVtb3J5IGxlYWtcclxuICAgIC8vIFN1Z2dlc3RlZCBieSBodHRwczovL2dpdGh1Yi5jb20vbGF6ZFxyXG4gICAgLy8gUmVmOiBodHRwczovL2dpdGh1Yi5jb20vc2NvdHRjb3JnYW4vdGlueS1lbWl0dGVyL2NvbW1pdC9jNmViZmFhOWJjOTczYjMzZDExMGE4NGEzMDc3NDJiN2NmOTRjOTUzI2NvbW1pdGNvbW1lbnQtNTAyNDkxMFxyXG5cclxuICAgIChsaXZlRXZlbnRzLmxlbmd0aClcclxuICAgICAgPyBlW25hbWVdID0gbGl2ZUV2ZW50c1xyXG4gICAgICA6IGRlbGV0ZSBlW25hbWVdO1xyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRTtcclxubW9kdWxlLmV4cG9ydHMuVGlueUVtaXR0ZXIgPSBFO1xyXG4iLCJjb25zdCBMb2dpbiA9IHJlcXVpcmUoXCIuL2NvbXBvbmVudHMvbG9naW4uanNcIik7XHJcbmNvbnN0IEFkbWluaXN0cmFjYW8gPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL2FkbWluaXN0cmFjYW8uanNcIik7XHJcbmNvbnN0IE1lbnUgPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL21lbnUuanNcIik7XHJcbmNvbnN0IE11c2N1bGFjYW8gPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL211c2N1bGFjYW8uanNcIik7XHJcbmNvbnN0IE11bHRpZnVuY2lvbmFsID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9tdWx0aWZ1bmNpb25hbC5qc1wiKTtcclxuXHJcbmNsYXNzIEFwcCB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IG5ldyBMb2dpbihib2R5KTtcclxuICAgICAgICB0aGlzLmFkbWluaXN0cmFjYW8gPSBuZXcgQWRtaW5pc3RyYWNhbyhib2R5KTtcclxuICAgICAgICB0aGlzLm1lbnUgPSBuZXcgTWVudShib2R5KTtcclxuICAgICAgICB0aGlzLm11c2N1bGFjYW8gPSBuZXcgTXVzY3VsYWNhbyhib2R5KTtcclxuICAgICAgICB0aGlzLm11bHRpZnVuY2lvbmFsID0gbmV3IE11bHRpZnVuY2lvbmFsKGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIGluaXQoKSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMubG9naW5FdmVudHMoKTtcclxuICAgICAgICB0aGlzLmFkbWluaXN0cmFjYW9FdmVudHMoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dpbkV2ZW50cygpIHtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwiZXJyb3JcIiwgKCkgPT4gYWxlcnQoXCJVc3VhcmlvIG91IHNlbmhhIGluY29ycmV0b3NcIikpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJsb2dpbkFkbWluXCIsICgpID0+IHRoaXMuYWRtaW5pc3RyYWNhby5yZW5kZXIoKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImxvZ2luQWx1bm9cIiwgbG9naW4gPT4gdGhpcy5tZW51LnJlbmRlcihsb2dpbikpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJtdWx0aWZ1bmNpb25hbFwiLCBkYXRhID0+IHRoaXMubXVsdGlmdW5jaW9uYWwucmVuZGVyKGRhdGEpKTtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwibXVzY3VsYWNhb1wiLCBkYXRhID0+IHRoaXMubXVzY3VsYWNhby5yZW5kZXIoZGF0YSkpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJhbHVub05hb0luc2VyaWRvXCIsICgpID0+IGFsZXJ0KFwiT3BzLCBvIGFsdW5vIG7Do28gcG9kZSBzZXIgaW5zZXJpZG9cIikpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJhbHVub0luc2VyaWRvU3VjZXNzb1wiLCAoKSA9PiBhbGVydChcIkFsdW5vIGluc2VyaWRvIGNvbSBzdWNlc3NvXCIpKTtcclxuICAgIH1cclxuXHJcbiAgICBhZG1pbmlzdHJhY2FvRXZlbnRzKCkge1xyXG4gICAgICAgIC8vdGhpcy5hZG1pbmlzdHJhY2FvLm9uKFwicHJlZW5jaGFHcmlkXCIsICk7XHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQXBwOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2FkbWluaXN0cmFjYW8uanNcIik7XHJcbmNvbnN0IExvZ2luID0gcmVxdWlyZShcIi4vbG9naW4uanNcIik7XHJcbmNvbnN0IENhZGFzdHJvQWx1bm8gPSByZXF1aXJlKFwiLi9jYWRhc3Ryb0FsdW5vLmpzXCIpO1xyXG5cclxuY2xhc3MgQWRtaW5pc3RyYWNhbyBleHRlbmRzIEFnZW5kYSB7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgICAgICB0aGlzLmxvZ2luID0gbmV3IExvZ2luKGJvZHkpO1xyXG4gICAgICAgIHRoaXMuY2FkYXN0cm9BbHVubyA9IG5ldyBDYWRhc3Ryb0FsdW5vKGJvZHkpO1xyXG4gICAgICAgIHRoaXMuZWhFZGljYW8gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJHcmlkQWx1bm9zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmxvZ291dCgpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tCb3Rhb1NhbHZhcigpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tCb3Rhb0FkaWNpb25hcigpO1xyXG4gICAgICAgIHRoaXMuYm90YW9FZGl0YXIoKTtcclxuICAgICAgICB0aGlzLmNsaWNrQm90YW9FeGNsdWlyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgbG9nb3V0KCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JvdGFvU2h1dGRvd25dXCIpLm9uY2xpY2sgPSAoKSA9PiBkb2N1bWVudC5sb2NhdGlvbi5yZWxvYWQodHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgY2xpY2tCb3Rhb0V4Y2x1aXIoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9FeGNsdWlyXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5leGNsdWFBbHVubygpO1xyXG4gICAgfSAgICBcclxuXHJcbiAgICBjbGlja0JvdGFvU2FsdmFyKCkge1xyXG5cclxuICAgICAgICBjb25zdCBmb3JtID0gdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJmb3JtXCIpO1xyXG5cclxuICAgICAgICBmb3JtLmFkZEV2ZW50TGlzdGVuZXIoXCJzdWJtaXRcIiwgKGUpID0+IHtcclxuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBjb25zdCBhbHVubyA9IHRoaXMub2J0ZW5oYURhZG9zTW9kYWwoZSk7XHJcbiAgICAgICAgICAgIHRoaXMuaW5zaXJhT3VFZGl0ZUFsdW5vKGFsdW5vKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjbGlja0JvdGFvQWRpY2lvbmFyKCkge1xyXG5cclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0FkaWNpb25hcl1cIikub25jbGljayA9ICgpID0+IHRoaXMuZWhFZGljYW8gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBib3Rhb0VkaXRhcigpIHtcclxuXHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9FZGl0YXJdXCIpLm9uY2xpY2sgPSAoKSA9PiB0aGlzLmNsaWNrQm90YW9FZGl0YXIoKVxyXG4gICAgfVxyXG5cclxuICAgIGNsaWNrQm90YW9FZGl0YXIoKSB7XHJcblxyXG4gICAgICAgIHRoaXMuZWhFZGljYW8gPSB0cnVlO1xyXG5cclxuICAgICAgICBsZXQgYWx1bm9zU2VsZWNpb25hZG9zID0gdGhpcy5vYnRlbmhhQWx1bm9zU2VsZWNpb25hZG9zKCk7XHJcblxyXG4gICAgICAgIGlmIChhbHVub3NTZWxlY2lvbmFkb3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChhbHVub3NTZWxlY2lvbmFkb3MubGVuZ3RoID09PSAxKSB7ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMuYWx1bm9TZWxlY2lvbmFkbyA9IGFsdW5vc1NlbGVjaW9uYWRvc1swXS5nZXRBdHRyaWJ1dGUoXCJjb2RpZ29hbHVub1wiKTtcclxuICAgICAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vLnByZWVuY2hhTW9kYWxFZGljYW8odGhpcy5hbHVub1NlbGVjaW9uYWRvKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiU2VsZWNpb25lIGFwZW5hcyB1bSBhbHVubyBwYXJhIGVkacOnw6NvIHBvciBmYXZvciFcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG9idGVuaGFEYWRvc01vZGFsKGUpIHtcclxuXHJcbiAgICAgICAgY29uc3QgY3BmID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltjcGZdXCIpLnZhbHVlO1xyXG5cclxuICAgICAgICBjb25zdCBhbHVubyA9IHtcclxuICAgICAgICAgICAgbm9tZTogZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltub21lXVwiKS52YWx1ZSxcclxuICAgICAgICAgICAgY3BmOiBjcGYsXHJcbiAgICAgICAgICAgIHRlbGVmb25lOiBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW3RlbGVmb25lXVwiKS52YWx1ZSxcclxuICAgICAgICAgICAgZW1haWw6IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbZW1haWxdXCIpLnZhbHVlLFxyXG4gICAgICAgICAgICBlbmRlcmVjbzogdGhpcy5tb250ZUVuZGVyZWNvKGUudGFyZ2V0KSxcclxuICAgICAgICAgICAgbWF0cmljdWxhOiB0aGlzLmdlcmVNYXRyaWN1bGEoY3BmKVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHJldHVybiBhbHVubztcclxuICAgIH1cclxuXHJcbiAgICBpbnNpcmFPdUVkaXRlQWx1bm8oYWx1bm8pIHtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZWhFZGljYW8pIHtcclxuICAgICAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vLmVkaXRlQWx1bm8oYWx1bm8sIHRoaXMuYWx1bm9TZWxlY2lvbmFkbyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8uaW5zaXJhQWx1bm8oYWx1bm8pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgJCgnI21vZGFsQ2FkYXN0cm9BbHVubycpLm1vZGFsKCdoaWRlJyk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJHcmlkQWx1bm9zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZXhjbHVhQWx1bm8oKSB7XHJcblxyXG4gICAgICAgIGxldCBhbHVub3NTZWxlY2lvbmFkb3MgPSB0aGlzLm9idGVuaGFBbHVub3NTZWxlY2lvbmFkb3MoKTtcclxuXHJcbiAgICAgICAgaWYgKGFsdW5vc1NlbGVjaW9uYWRvcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGFsdW5vc1NlbGVjaW9uYWRvcy5sZW5ndGggPT09IDEpIHsgICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhpcy5hbHVub1NlbGVjaW9uYWRvID0gYWx1bm9zU2VsZWNpb25hZG9zWzBdLmdldEF0dHJpYnV0ZShcImNvZGlnb2FsdW5vXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8uZXhjbHVhQWx1bm8odGhpcy5hbHVub1NlbGVjaW9uYWRvKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiU2VsZWNpb25lIGFwZW5hcyB1bSBhbHVubyBwYXJhIGVkacOnw6NvIHBvciBmYXZvciFcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckdyaWRBbHVub3MoKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvYCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImVycm9yXCIsIFwibsOjbyBmb2kgcG9zc8OtdmVsIGNhcnJlZ2FyIG9zIGFsdW5vc1wiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoZGF0YS5hbHVub3MpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBvYnRlbmhhQWx1bm9zU2VsZWNpb25hZG9zKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZ1bmN0aW9uIGVzdGFTZWxlY2lvbmFkbyhhbHVubykge1xyXG4gICAgICAgICAgICByZXR1cm4gYWx1bm8uY2hlY2tlZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBhbHVub3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLmJvZHkucXVlcnlTZWxlY3RvckFsbChcIlthbHVub1NlbGVjaW9uYWRvXVwiKSk7XHJcbiAgICAgICAgcmV0dXJuIGFsdW5vcy5maWx0ZXIoZXN0YVNlbGVjaW9uYWRvKTtcclxuICAgIH1cclxuXHJcbiAgICBtb250ZUVuZGVyZWNvKHRhcmdldCkge1xyXG4gICAgICAgIHJldHVybiB0YXJnZXQucXVlcnlTZWxlY3RvcihcIltjaWRhZGVdXCIpLnZhbHVlICsgXCJcXG5cIiArXHJcbiAgICAgICAgICAgIHRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW2JhaXJyb11cIikudmFsdWUgKyBcIlxcblwiICtcclxuICAgICAgICAgICAgdGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbbnVtZXJvXVwiKS52YWx1ZSArIFwiXFxuXCIgK1xyXG4gICAgICAgICAgICB0YXJnZXQucXVlcnlTZWxlY3RvcihcIltjb21wbGVtZW50b11cIikudmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgZ2VyZU1hdHJpY3VsYShjcGYpIHtcclxuICAgICAgICBjb25zdCBkYXRhID0gbmV3IERhdGUoKTtcclxuICAgICAgICBjb25zdCBhbm8gPSBkYXRhLmdldEZ1bGxZZWFyKCk7XHJcbiAgICAgICAgY29uc3Qgc2VndW5kb3MgPSBkYXRhLmdldFNlY29uZHMoKTtcclxuICAgICAgICByZXR1cm4gYW5vICsgY3BmLnNsaWNlKDgpICsgc2VndW5kb3M7XHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQWRtaW5pc3RyYWNhbzsiLCJjb25zdCBUaW55RW1pdHRlciA9IHJlcXVpcmUoXCJ0aW55LWVtaXR0ZXJcIik7XHJcbmNvbnN0IFJlcXVlc3QgPSByZXF1aXJlKFwiYnJvd3Nlci1yZXF1ZXN0XCIpO1xyXG5cclxuY2xhc3MgQWdlbmRhIGV4dGVuZHMgVGlueUVtaXR0ZXIge1xyXG4gICAgY29uc3RydWN0b3IoKXtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMucmVxdWVzdCA9IFJlcXVlc3Q7XHJcbiAgICAgICAgdGhpcy5VUkwgPSBcImh0dHA6Ly9sb2NhbGhvc3Q6MzMzM1wiO1xyXG4gICAgfVxyXG59XHJcbm1vZHVsZS5leHBvcnRzID0gQWdlbmRhOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanNcIik7XHJcbmNvbnN0IExvZ2luID0gcmVxdWlyZShcIi4vbG9naW4uanNcIik7XHJcblxyXG5jbGFzcyBDYWRhc3Ryb0FsdW5vIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IG5ldyBMb2dpbihib2R5KTtcclxuICAgIH07XHJcblxyXG4gICAgaW5zaXJhQWx1bm8oYWx1bm8pIHtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vYWRtaW5pc3RyYWNhb2AsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgIGJvZHk6IHtcclxuICAgICAgICAgICAgICAgIG5vbWU6IGFsdW5vLm5vbWUsXHJcbiAgICAgICAgICAgICAgICBjcGY6IGFsdW5vLmNwZixcclxuICAgICAgICAgICAgICAgIHRlbGVmb25lOiBhbHVuby50ZWxlZm9uZSxcclxuICAgICAgICAgICAgICAgIGVtYWlsOiBhbHVuby5lbWFpbCxcclxuICAgICAgICAgICAgICAgIGVuZGVyZWNvOiBhbHVuby5lbmRlcmVjbyxcclxuICAgICAgICAgICAgICAgIG1hdHJpY3VsYTogYWx1bm8ubWF0cmljdWxhXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoZXJyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImFsdW5vTmFvSW5zZXJpZG9cIiwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWxlcnQoXCJBbHVubyBpbnNlcmlkbyBjb20gc3VjZXNzbyFcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICB9O1xyXG5cclxuICAgIHByZWVuY2hhTW9kYWxFZGljYW8oY29kaWdvQWx1bm8pIHtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvLyR7Y29kaWdvQWx1bm99YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAwKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChcIkFsdW5vIG7Do28gZW5jb250cmFkb1wiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBhbHVubyA9IHtcclxuICAgICAgICAgICAgICAgICAgICBub21lOiBkYXRhLm5vbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgY3BmOiBkYXRhLmNwZixcclxuICAgICAgICAgICAgICAgICAgICB0ZWxlZm9uZTogZGF0YS50ZWxlZm9uZSxcclxuICAgICAgICAgICAgICAgICAgICBlbWFpbDogZGF0YS5lbWFpbCxcclxuICAgICAgICAgICAgICAgICAgICBlbmRlcmVjbzogZGF0YS5lbmRlcmVjbyxcclxuICAgICAgICAgICAgICAgICAgICBtYXRyaWN1bGE6IGRhdGEubWF0cmljdWxhXHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2NwZl1cIikudmFsdWUgPSBhbHVuby5jcGY7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltub21lXVwiKS52YWx1ZSA9IGFsdW5vLm5vbWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIlt0ZWxlZm9uZV1cIikudmFsdWUgPSBhbHVuby50ZWxlZm9uZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2VtYWlsXVwiKS52YWx1ZSA9IGFsdW5vLmVtYWlsO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY2lkYWRlXVwiKS52YWx1ZSA9IGFsdW5vLmVuZGVyZWNvLnNsaWNlKDgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYmFpcnJvXVwiKS52YWx1ZSA9IGFsdW5vLmVuZGVyZWNvLnNsaWNlKDgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbbnVtZXJvXVwiKS52YWx1ZSA9IGFsdW5vLmVuZGVyZWNvLnNsaWNlKDgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY29tcGxlbWVudG9dXCIpLnZhbHVlID0gYWx1bm8uZW5kZXJlY28uc2xpY2UoOCk7XHJcblxyXG4gICAgICAgICAgICAgICAgJCgnI21vZGFsQ2FkYXN0cm9BbHVubycpLm1vZGFsKCdzaG93Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICAvL3RoaXMuYm9keS5xdWVyeVNlbGVjdG9yKGUudGFyZ2V0KSwgICAgICAgIFxyXG4gICAgfVxyXG5cclxuICAgIGVkaXRlQWx1bm8oYWx1bm8sIGlkKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJQVVRcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vYWRtaW5pc3RyYWNhby8ke2lkfWAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgIGJvZHk6IHtcclxuICAgICAgICAgICAgICAgIGlkOiBhbHVuby5pZCxcclxuICAgICAgICAgICAgICAgIG5vbWU6IGFsdW5vLm5vbWUsXHJcbiAgICAgICAgICAgICAgICBjcGY6IGFsdW5vLmNwZixcclxuICAgICAgICAgICAgICAgIHRlbGVmb25lOiBhbHVuby50ZWxlZm9uZSxcclxuICAgICAgICAgICAgICAgIGVtYWlsOiBhbHVuby5lbWFpbCxcclxuICAgICAgICAgICAgICAgIGVuZGVyZWNvOiBhbHVuby5lbmRlcmVjbyxcclxuICAgICAgICAgICAgICAgIG1hdHJpY3VsYTogYWx1bm8ubWF0cmljdWxhXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoZXJyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImFsdW5vTmFvSW5zZXJpZG9cIiwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiQWx1bm8gZWRpdGFkbyBjb20gc3VjZXNzbyFcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5kaXNwb3NlTW9kYWwoKTtcclxuICAgIH1cclxuXHJcbiAgICBleGNsdWFBbHVubyhpZEFsdW5vKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvLyR7aWRBbHVub31gLFxyXG4gICAgICAgICAgICBjcm9zc0RvbWFpbjogdHJ1ZSxcclxuICAgICAgICAgICAganNvbjogdHJ1ZVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIHJlc3Auc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCAnKicpO1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoZXJyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImFsdW5vTmFvSW5zZXJpZG9cIiwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiQWx1bm8gZXhjbHXDrWRvIGNvbSBzdWNlc3NvIVwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH1cclxuXHJcbiAgICBkaXNwb3NlTW9kYWwoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY3BmXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbbm9tZV1cIikudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW3RlbGVmb25lXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbZW1haWxdXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjaWRhZGVdXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltiYWlycm9dXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltudW1lcm9dXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjb21wbGVtZW50b11cIikudmFsdWUgPSBcIlwiO1xyXG5cclxuICAgICAgICAkKCcjbW9kYWxDYWRhc3Ryb0FsdW5vJykubW9kYWwoJ2hpZGUnKTtcclxuICAgIH1cclxuXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQ2FkYXN0cm9BbHVubzsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9sb2dpbi5qc1wiKTtcclxuXHJcbmNsYXNzIExvZ2luIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIlt1c3VhcmlvXVwiKS5mb2N1cygpO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZEV2ZW50TGlzdGVuZXIoKSB7XHJcbiAgICAgICAgdGhpcy5lbnZpZUZvcm11bGFyaW8oKTtcclxuICAgICAgICB0aGlzLmVzcXVlY2V1U2VuaGEoKTtcclxuICAgIH1cclxuXHJcbiAgICBlbnZpZUZvcm11bGFyaW8oKSB7XHJcbiAgICAgICAgY29uc3QgZm9ybSA9IHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiZm9ybVwiKTtcclxuXHJcbiAgICAgICAgZm9ybS5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgY29uc3QgdXN1YXJpbyA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbdXN1YXJpb11cIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlbmhhID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltzZW5oYV1cIik7XHJcbiAgICAgICAgICAgIHRoaXMuYXV0ZW50aXF1ZVVzdWFyaW8odXN1YXJpbywgc2VuaGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGF1dGVudGlxdWVVc3VhcmlvKHVzdWFyaW8sIHNlbmhhKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vTG9naW5gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxyXG4gICAgICAgICAgICBib2R5OiB7XHJcbiAgICAgICAgICAgICAgICBsb2dpbjogdXN1YXJpby52YWx1ZSxcclxuICAgICAgICAgICAgICAgIHNlbmhhOiBzZW5oYS52YWx1ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuXHJcbiAgICAgICAgICAgIHRoaXMubG9nYVVzdWFyaW8ocmVzcCwgZXJyLCBkYXRhKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dhVXN1YXJpbyhyZXNwLCBlcnIsIGRhdGEpIHtcclxuXHJcbiAgICAgICAgaWYgKHJlc3Auc3RhdHVzICE9PSAyMDApIHtcclxuICAgICAgICAgICAgdGhpcy5lbWl0KFwiZXJyb3JcIiwgZXJyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7ICAgICAgICAgICAgXHJcblxyXG4gICAgICAgICAgICBpZiAoZGF0YS5hZG1pbikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwibG9naW5BZG1pblwiLCBkYXRhKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImxvZ2luQWx1bm9cIiwgZGF0YS5sb2dpbik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZXNxdWVjZXVTZW5oYSgpIHtcclxuICAgICAgICAvL2NvZGlnbyBwcmEgY2hhbWFyIGVtIFVSTFxyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IExvZ2luOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL21lbnUuanNcIik7XHJcbmNvbnN0IE11bHRpZnVuY2lvbmFsID0gcmVxdWlyZShcIi4vbXVsdGlmdW5jaW9uYWwuanNcIik7XHJcbmNvbnN0IE11c2N1bGFjYW8gPSByZXF1aXJlKFwiLi9tdXNjdWxhY2FvLmpzXCIpO1xyXG5cclxuY2xhc3MgTWVudSBleHRlbmRzIEFnZW5kYSB7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgICAgICB0aGlzLm11c2N1bGFjYW8gPSBuZXcgTXVzY3VsYWNhbyhib2R5KTtcclxuICAgICAgICB0aGlzLm11bHRpZnVuY2lvbmFsID0gbmV3IE11bHRpZnVuY2lvbmFsKGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihsb2dpbikge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIobG9naW4pO1xyXG4gICAgICAgIHRoaXMub2J0ZW5oYUNvZGlnb0FsdW5vKGxvZ2luKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMuYm90YW9NdXNjdWxhY2FvKCk7XHJcbiAgICAgICAgdGhpcy5ib3Rhb011bHRpZnVuY2lvbmFsKCk7XHJcbiAgICB9XHJcblxyXG4gICAgb2J0ZW5oYUNvZGlnb0FsdW5vKGxvZ2luKSB7XHJcblxyXG4gICAgICAgIHRoaXMubG9naW4gPSBsb2dpbjtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9tZW51LyR7bG9naW59YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAwKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChcIkFsdW5vIG7Do28gZW5jb250cmFkb1wiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29kaWdvQWx1bm8gPSBkYXRhLmlkO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgYm90YW9NdXNjdWxhY2FvKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JvdGFvTXVzY3VsYWNhb11cIikub25jbGljayA9ICgpID0+IHRoaXMucmVuZGVyTXVzY3VsYWNhbygpOyBcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJNdXNjdWxhY2FvKCkge1xyXG4gICAgICAgIGRlYnVnZ2VyO1xyXG5cclxuICAgICAgICBjb25zdCBkYXRhID0ge1xyXG4gICAgICAgICAgICBpZEFsdW5vOiB0aGlzLmNvZGlnb0FsdW5vLFxyXG4gICAgICAgICAgICBzYWxhOiBcIm11c2N1bGFjYW9cIixcclxuICAgICAgICAgICAgbG9naW46IHRoaXMubG9naW5cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLm11c2N1bGFjYW8ucmVuZGVyKGRhdGEpO1xyXG4gICAgfVxyXG5cclxuICAgIGJvdGFvTXVsdGlmdW5jaW9uYWwoKSB7ICAgICAgICBcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb011bHRpZnVuY2lvbmFsXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5yZW5kZXJNdWx0aWZ1bmNpb25hbCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlck11bHRpZnVuY2lvbmFsKCkge1xyXG5cclxuICAgICAgICBjb25zdCBkYXRhID0ge1xyXG4gICAgICAgICAgICBpZEFsdW5vOiB0aGlzLmNvZGlnb0FsdW5vLFxyXG4gICAgICAgICAgICBzYWxhOiBcIm11bHRpZnVuY2lvbmFsXCJcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLm11bHRpZnVuY2lvbmFsLnJlbmRlcihkYXRhKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNZW51OyIsImNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9tdWx0aWZ1bmNpb25hbC5qc1wiKTtcclxuY29uc3QgU2FsYSA9IHJlcXVpcmUoXCIuL3NhbGEuanNcIik7XHJcblxyXG5jbGFzcyBNdWx0aWZ1bmNpb25hbCBleHRlbmRzIFNhbGEge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoZGF0YSkge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLm9idGVuaGFIb3Jhcmlvc0FsdW5vcyhkYXRhKTtcclxuICAgICAgICB0aGlzLmxvZ2luID0gZGF0YTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNdWx0aWZ1bmNpb25hbDsiLCJjb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvbXVzY3VsYWNhby5qc1wiKTtcclxuY29uc3QgU2FsYSA9IHJlcXVpcmUoXCIuL3NhbGEuanNcIik7XHJcblxyXG5jbGFzcyBNdXNjdWxhY2FvIGV4dGVuZHMgU2FsYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihkYXRhKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMub2J0ZW5oYUhvcmFyaW9zQWx1bm9zKGRhdGEpO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBkYXRhO1xyXG4gICAgfVxyXG4gICAgXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTXVzY3VsYWNhbzsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcblxyXG5jbGFzcyBTYWxhIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmJvdGFvQ29uZmlybWFyKCk7XHJcbiAgICAgICAgdGhpcy5ib3Rhb0NhbmNlbGFyKClcclxuICAgIH1cclxuXHJcbiAgICBvYnRlbmhhSG9yYXJpb3NBbHVub3MobG9naW4pIHtcclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L3NhbGEvJHtsb2dpbi5pZEFsdW5vfS8ke2xvZ2luLnNhbGF9YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuYXR1YWxpemVEcm9wRG93bnMoZGF0YS5ob3Jhcmlvcyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgYXR1YWxpemVEcm9wRG93bnMoaG9yYXJpb3MpIHtcclxuXHJcbiAgICAgICAgaWYgKGhvcmFyaW9zKSB7XHJcblxyXG4gICAgICAgICAgICBsZXQgZHJvcERvd25Ib3JhcmlvcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiW3NlbGVjYW9Ib3JhcmlvXVwiKSk7XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZHJvcERvd25Ib3Jhcmlvcy5sZW5ndGg7IGluZGV4KyspIHtcclxuXHJcbiAgICAgICAgICAgICAgICBkcm9wRG93bkhvcmFyaW9zW2luZGV4XS52YWx1ZSA9IGhvcmFyaW9zW2luZGV4XS5mYWl4YUhvcmFyaW87XHJcblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGJvdGFvQ29uZmlybWFyKGRhdGEpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0NvbmZpcm1hcl1cIikub25jbGljayA9ICgpID0+IHRoaXMuaW5zaXJlT3VBdHVhbGl6ZUhvcmFyaW8odGhpcy5sb2dpbik7XHJcbiAgICB9XHJcblxyXG4gICAgYm90YW9DYW5jZWxhcigpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0NhbmNlbGFyXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5lbWl0KFwibG9naW5BbHVub1wiLCB0aGlzLmxvZ2luLmxvZ2luKTtcclxuICAgIH1cclxuXHJcbiAgICBpbnNpcmVPdUF0dWFsaXplSG9yYXJpbyhsb2dpbikge1xyXG5cclxuICAgICAgICBsZXQgZHJvcERvd25Ib3JhcmlvcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiW3NlbGVjYW9Ib3JhcmlvXVwiKSk7XHJcbiAgICAgICAgbGV0IGRpYXNTZW1hbmEgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLmJvZHkucXVlcnlTZWxlY3RvckFsbChcIltkaWFTZW1hbmFdXCIpKTtcclxuXHJcbiAgICAgICAgdmFyIG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L3NhbGFgLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxyXG4gICAgICAgICAgICBib2R5OiB7IFxyXG4gICAgICAgICAgICAgICAgZmFpeGFIb3JhcmlvOiBcIlwiLFxyXG4gICAgICAgICAgICAgICAgaWRBbHVubzogbG9naW4uaWRBbHVubyxcclxuICAgICAgICAgICAgICAgIGRpYVNlbWFuYTogXCJcIixcclxuICAgICAgICAgICAgICAgIHNhbGE6IGxvZ2luLnNhbGFcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGRyb3BEb3duSG9yYXJpb3MubGVuZ3RoOyBpbmRleCsrKSB7XHJcblxyXG4gICAgICAgICAgICBvcHRzLmJvZHkuZmFpeGFIb3JhcmlvID0gZHJvcERvd25Ib3Jhcmlvc1tpbmRleF0udmFsdWU7XHJcbiAgICAgICAgICAgIG9wdHMuYm9keS5kaWFTZW1hbmEgPSBkaWFzU2VtYW5hW2luZGV4XS5nZXRBdHRyaWJ1dGUoJ2RpYXNlbWFuYScpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiYWx1bm9OYW9JbnNlcmlkb1wiLCBlcnIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWxlcnQoXCJIb3JhcmlvIGluc2VyaWRvIGNvbSBzdWNlc3NvIVwiKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgIH1cclxuXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU2FsYTsiLCJjb25zdCBNb2RhbENhZGFzdHJvQWx1bm8gPSByZXF1aXJlKFwiLi9jYWRhc3Ryb0FsdW5vLmpzXCIpO1xyXG5cclxuY29uc3QgcmVuZGVyR3JpZEFsdW5vcyA9IGFsdW5vcyA9PiB7XHJcbiAgICByZXR1cm4gYWx1bm9zLm1hcChhbHVubyA9PiB7XHJcblxyXG4gICAgICAgIGxldCBjb3JMaW5oYSA9IGFsdW5vLmlkICUgMiA9PT0gMCA/IFwiYmFjay1ncmlkcm93MVwiIDogXCJiYWNrLWdyaWRyb3cyXCI7XHJcblxyXG4gICAgICAgIHJldHVybiBgXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvdyAke2NvckxpbmhhfSB0ZXh0LWRhcmtcIj4gICAgICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgZm9ybS1jaGVja1wiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjbGFzcz1cImZvcm0tY2hlY2staW5wdXQgbXQtNFwiIGFsdW5vU2VsZWNpb25hZG8gY29kaWdvQWx1bm89JHthbHVuby5pZH0+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cInRleHQtY2VudGVyIG1iLTJcIj4ke2FsdW5vLm5vbWV9PC9sYWJlbD5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gXCI+XHJcbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0ZXh0LWNlbnRlciBtdC0zXCI+JHthbHVuby5jcGZ9PC9sYWJlbD5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gXCI+XHJcbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0ZXh0LWNlbnRlciBtdC0zXCI+JHthbHVuby5tYXRyaWN1bGF9PC9sYWJlbD5cclxuICAgICAgICAgICAgPC9kaXY+ICAgICAgICBcclxuICAgICAgICA8L2Rpdj5gXHJcbiAgICB9KS5qb2luKFwiXCIpO1xyXG59XHJcblxyXG5leHBvcnRzLnJlbmRlciA9IGFsdW5vcyA9PiB7XHJcbiAgICBcclxuICAgIHJldHVybiBgXHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImltZy1mbHVpZCB0ZXh0LXJpZ2h0IG1yLTUgbXQtNSB0ZXh0LXdoaXRlIGJvdGFvU2h1dGRvd25cIiBib3Rhb1NodXRkb3duPlxyXG4gICAgICAgIDxhIGhyZWY9XCIjXCI+PGltZyBzcmM9XCIuL2ltYWdlcy9zaHV0ZG93bi5wbmdcIiBhbHQ9XCJcIj48L2E+XHJcbiAgICAgICAgPHN0cm9uZyBjbGFzcz1cIm1yLTFcIj5TYWlyPC9zdHJvbmc+XHJcbiAgICA8L2Rpdj5cclxuICAgIFxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lclwiPlxyXG4gICAgICAgIDxkaXY+XHJcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibG9naW4xMDAtZm9ybS10aXRsZSBwLWItNDMgcC0yIG10LTJcIj5cclxuICAgICAgICAgICAgICAgIMOBcmVhIEFkbWluaXN0cmF0aXZhXHJcbiAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXJcIj5cclxuICAgIFxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3cgIGJvcmRlciBib3JkZXItd2hpdGUgYmFjay1ncmlkIHRleHQtd2hpdGVcIj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbSB0ZXh0LWNlbnRlclwiPlxyXG4gICAgICAgICAgICAgICAgTm9tZVxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC1jZW50ZXJcIj5cclxuICAgICAgICAgICAgICAgIENQRlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC1jZW50ZXJcIj5cclxuICAgICAgICAgICAgICAgIE1hdHLDrWN1bGFcclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICR7cmVuZGVyR3JpZEFsdW5vcyhhbHVub3MpfVxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIGNvbC1zbSBtdC0zXCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjZW50ZXJlZFwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5IGJ0bi1kYXJrXCIgZGF0YS10b2dnbGU9XCJtb2RhbFwiIGRhdGEtdGFyZ2V0PVwiI21vZGFsQ2FkYXN0cm9BbHVub1wiIGJvdGFvQWRpY2lvbmFyPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBBZGljaW9uYXJcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLWRhcmtcIiBib3Rhb0VkaXRhcj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdGFyXHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrXCIgYm90YW9FeGNsdWlyPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBFeGNsdWlyXHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICR7TW9kYWxDYWRhc3Ryb0FsdW5vLnJlbmRlcigpfVxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+ICAgIFxyXG4gICAgYDsgXHJcbn0iLCJcclxuY29uc3QgaW5wdXRFbmRlcmVjbyA9IGBcclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJjaWRhZGVcIj5DaWRhZGU8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdHlwZT1cInRleHRcIiByZXF1aXJlZCBjaWRhZGUvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJiYWlycm9cIj5CYWlycm88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdHlwZT1cInRleHRcIiByZXF1aXJlZCBiYWlycm8vPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJudW1lcm9cIj5Ow7ptZXJvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQgbnVtZXJvLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY29tcGxlbWVudG9cIj5Db21wbGVtZW50bzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiB0eXBlPVwidGV4dFwiIGNvbXBsZW1lbnRvLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG5gO1xyXG5cclxuY29uc3QgbW9kYWxDYWRhc3Ryb0FsdW5vID0gYFxyXG48ZGl2IGNsYXNzPVwibW9kYWwgZmFkZVwiIGlkPVwibW9kYWxDYWRhc3Ryb0FsdW5vXCIgdGFiaW5kZXg9XCItMVwiIHJvbGU9XCJkaWFsb2dcIiBhcmlhLWxhYmVsbGVkYnk9XCJ0aXR1bG9Nb2RhbFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiIG1vZGFsPlxyXG4gICAgPGRpdiBjbGFzcz1cIm1vZGFsLWRpYWxvZyBtb2RhbC1kaWFsb2ctY2VudGVyZWRcIiByb2xlPVwiZG9jdW1lbnRcIiA+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWNvbnRlbnRcIj5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1oZWFkZXJcIj5cclxuICAgICAgICAgICAgICAgIDxoNSBjbGFzcz1cIm1vZGFsLXRpdGxlXCIgaWQ9XCJ0aXR1bG9Nb2RhbFwiPkFkaWNpb25hciBOb3ZvIEFsdW5vPC9oNT5cclxuICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiY2xvc2VcIiBkYXRhLWRpc21pc3M9XCJtb2RhbFwiIGFyaWEtbGFiZWw9XCJGZWNoYXJcIj5cclxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBhcmlhLWhpZGRlbj1cInRydWVcIj4mdGltZXM7PC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgPGZvcm0+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtYm9keVwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsPk5vbWUgQ29tcGxldG88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrIGNvbC1zbVwiIG5vbWU+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIiBpZD1cImluY2x1ZGVfZGF0ZVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsPkRhdGEgZGUgTmFzY2ltZW50bzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmsgY29sLXNtXCIgZGF0YU5hc2NpbWVudG8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY3BmXCI+Q1BGPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBpZD1cImNwZlwiIHR5cGU9XCJ0ZXh0XCIgYXV0b2NvbXBsZXRlPVwib2ZmXCIgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiBjcGY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJ0ZWxcIj5UZWxlZm9uZTwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgaWQ9XCJ0ZWxcIiB0eXBlPVwidGV4dFwiIGF1dG9jb21wbGV0ZT1cIm9mZlwiIGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdGVsZWZvbmU+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiZW1haWxcIj5FLW1haWw8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGlkPVwiZW1haWxcIiB0eXBlPVwidGV4dFwiIGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgZW1haWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PiAgICAgICAgICAgICAgICAgICAgXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICR7aW5wdXRFbmRlcmVjb31cclxuXHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1mb290ZXJcIj5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tc2Vjb25kYXJ5XCIgZGF0YS1kaXNtaXNzPVwibW9kYWxcIj5GZWNoYXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGJvdGFvU2FsdmFyPlNhbHZhcjwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvZm9ybT5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuYDtcclxuXHJcblxyXG5leHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBtb2RhbENhZGFzdHJvQWx1bm87XHJcbn1cclxuIiwiY29uc3QgZHJvcERvd25Ib3JhcmlvID0gYFxyXG48ZGl2IGNsYXNzPVwiZm9ybS1ncm91cCBjb2wtc20gXCI+XHJcbiAgICA8bGFiZWwgZm9yPVwic2VsZWN0LWhvdXJcIj5TZWxlY2lvbmUgbyBob3LDoXJpbzwvbGFiZWw+XHJcbiAgICA8c2VsZWN0IGNsYXNzPVwiZm9ybS1jb250cm9sIFwiIHNlbGVjYW9Ib3JhcmlvPlxyXG4gICAgICAgIDxvcHRpb24+MDc6MDAgLSAwNzozMDwvb3B0aW9uPiAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICA8b3B0aW9uPjA3OjQwIC0gMDg6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjA4OjIwIC0gMDg6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjA5OjAwIC0gMDk6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjA5OjQwIC0gMTA6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjEwOjIwIC0gMTA6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjExOjAwIC0gMTE6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjExOjQwIC0gMTI6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjEyOjIwIC0gMTI6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjEzOjAwIC0gMTM6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjEzOjQwIC0gMTQ6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE0OjIwIC0gMTQ6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE1OjAwIC0gMTU6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE1OjQwIC0gMTY6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE2OjIwIC0gMTY6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE3OjAwIC0gMTc6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE3OjQwIC0gMTg6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE4OjIwIC0gMTg6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE5OjAwIC0gMTk6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE5OjQwIC0gMjA6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjIwOjIwIC0gMjA6NTA8L29wdGlvbj5cclxuICAgIDwvc2VsZWN0PlxyXG48L2Rpdj5cclxuYDtcclxuXHJcblxyXG5leHBvcnRzLnJlbmRlciA9IGhvcmFyaW9zID0+IHtcclxuICAgIHJldHVybiBgXHJcbjxkaXYgY2xhc3M9XCJjb250YWluZXIgIGJvcmRlciBib3JkZXItZGFyayAgbXQtNSBjb2wtNlwiPlxyXG4gICAgPGRpdiBjbGFzcz1cInJvdyBcIj5cclxuXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbSB0ZXh0LXhsLWNlbnRlciBiYWNrLWdyaWQgdGV4dC13aGl0ZVwiPlxyXG4gICAgICAgICAgICBTZWxlY2lvbmUgdW0gaG9yw6FyaW8gcGFyYSBjYWRhIGRpYSBkYSBzZW1hbmE6XHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5cclxuPGRpdiBjbGFzcz1cIm1iLTNcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXIgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzEgdGV4dC1kYXJrIGNvbC02XCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvdyBcIj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gbXQtNFwiIGRpYVNlbWFuYT1cInNlZ3VuZGFcIj5cclxuICAgICAgICAgICAgICAgIFNlZ3VuZGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgICBcclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXIgY29sLTYgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzIgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiIGRpYVNlbWFuYT1cInRlcmNhXCI+XHJcbiAgICAgICAgICAgICAgICBUZXLDp2EtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbC02IGNvbnRhaW5lciBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MSB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCIgZGlhU2VtYW5hPVwicXVhcnRhXCI+XHJcbiAgICAgICAgICAgICAgICBRdWFydGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAke2Ryb3BEb3duSG9yYXJpb31cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29sLTYgY29udGFpbmVyIGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cyIHRleHQtZGFya1wiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIiBkaWFTZW1hbmE9XCJxdWludGFcIj5cclxuICAgICAgICAgICAgICAgIFF1aW50YS1mZWlyYTpcclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAke2Ryb3BEb3duSG9yYXJpb31cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29sLTYgY29udGFpbmVyIGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cxIHRleHQtZGFya1wiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIiBkaWFTZW1hbmE9XCJzZXh0YVwiPlxyXG4gICAgICAgICAgICAgICAgU2V4dGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbC02IGNvbnRhaW5lciBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MiB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLTZcIiBkaWFTZW1hbmE9XCJzYWJhZG9cIj5cclxuICAgICAgICAgICAgICAgIFPDoWJhZG86XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5cclxuXHJcbjxkaXYgY2xhc3M9XCIgY29udGFpbmVyIGNvbC1zbVwiPlxyXG4gICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJjZW50ZXJlZFwiPlxyXG5cclxuICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwic3VibWl0XCIgY2xhc3M9XCJidG4gYnRuLWRhcmtcIiBib3Rhb0NvbmZpcm1hcj5cclxuICAgICAgICAgICAgICAgIENvbmZpcm1hclxyXG4gICAgICAgICAgICAgPC9idXR0b24+XHJcblxyXG4gICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tZGFyayBtbC01XCIgYm90YW9DYW5jZWxhcj5cclxuICAgICAgICAgICAgICAgIENhbmNlbGFyXHJcbiAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcblxyXG48cCBjbGFzcz1cInRleHQtY2VudGVyIHRleHQtd2hpdGUgZm9udC1pdGFsaWMgcC0zXCI+KipDYXNvIGFsZ3VtIGhvcsOhcmlvIGF0aW5qYSBhIGxvdGHDp8OjbyBtw6F4aW1hIGRlIGFsdW5vcywgbyA8YnI+IGhvcsOhcmlvIGZpY2Fyw6EgZW0gdmVybWVsaG8gZSBuw6NvIHBvZGVyw6Egc2VyIHNlbGVjaW9uYWRvLjwvcD5cclxuXHJcbiAgICBgXHJcbn0iLCJleHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBgIDxib2R5PlxyXG4gICAgPGxhYmVsIGNsYXNzPVwibG9naW4xMDAtZm9ybS10aXRsZSBwLWItNDMgcC10LTgwXCI+QWNlc3NvIGRhIENvbnRhPC9sYWJlbD5cclxuICAgIDxkaXYgY2xhc3M9XCJjYXJkXCIgaWQ9XCJ0ZWxhTG9naW5cIj4gICAgICAgXHJcbiAgICAgICAgPG1haW4+ICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxyXG4gICAgICAgICAgICAgICAgPGZvcm0+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgcnMxIHZhbGlkYXRlLWlucHV0XCIgZGF0YS12YWxpZGF0ZT1cIkNhbXBvIG9icmlnYXTDs3Jpb1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cImZvcm0tY29udHJvbFwiIGlkPVwiXCIgcGxhY2Vob2xkZXI9XCJVc3XDoXJpb1wiIHVzdWFyaW8+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cCByczIgdmFsaWRhdGUtaW5wdXRcIiBkYXRhLXZhbGlkYXRlPVwiQ2FtcG8gb2JyaWdhdMOzcmlvXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwicGFzc3dvcmRcIiBjbGFzcz1cImZvcm0tY29udHJvbFwiIGlkPVwiXCIgcGxhY2Vob2xkZXI9XCJTZW5oYVwiIHNlbmhhPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeSBidG4gYnRuLW91dGxpbmUtZGFyayBidG4tbGcgYnRuLWJsb2NrXCIgYm90YW9Mb2dpbj5FbnRyYXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwidGV4dC1jZW50ZXIgdy1mdWxsIHAtdC0yM1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8YSBocmVmPVwiI1wiIGNsYXNzPVwidGV4dC1zZWNvbmRhcnlcIj5cclxuXHRcdCAgICBcdFx0XHRcdFx0RXNxdWVjZXUgYSBTZW5oYT8gRW50cmUgZW0gQ29udGF0byBDb25vc2NvIENsaWNhbmRvIEFxdWkuXHJcblx0XHQgICAgXHRcdFx0XHQ8L2E+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8L2Zvcm0+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvbWFpbj5cclxuICAgICAgICA8Zm9vdGVyPjwvZm9vdGVyPlxyXG4gICAgPC9kaXY+XHJcbjwvYm9keT5cclxuPHNjcmlwdCBzcmM9XCJodHRwczovL2NvZGUuanF1ZXJ5LmNvbS9qcXVlcnktMy4zLjEuc2xpbS5taW4uanNcIiBpbnRlZ3JpdHk9XCJzaGEzODQtcThpL1grOTY1RHpPMHJUN2FiSzQxSlN0UUlBcVZnUlZ6cGJ6bzVzbVhLcDRZZlJ2SCs4YWJ0VEUxUGk2aml6b1wiIGNyb3Nzb3JpZ2luPVwiYW5vbnltb3VzXCI+PC9zY3JpcHQ+XHJcbjxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9jZG5qcy5jbG91ZGZsYXJlLmNvbS9hamF4L2xpYnMvcG9wcGVyLmpzLzEuMTQuNy91bWQvcG9wcGVyLm1pbi5qc1wiIGludGVncml0eT1cInNoYTM4NC1VTzJlVDBDcEhxZFNKUTZoSnR5NUtWcGh0UGh6V2o5V08xY2xIVE1HYTNKRFp3cm5RcTRzRjg2ZElITkR6MFcxXCIgY3Jvc3NvcmlnaW49XCJhbm9ueW1vdXNcIj48L3NjcmlwdD5cclxuPHNjcmlwdCBzcmM9XCJodHRwczovL3N0YWNrcGF0aC5ib290c3RyYXBjZG4uY29tL2Jvb3RzdHJhcC80LjMuMS9qcy9ib290c3RyYXAubWluLmpzXCIgaW50ZWdyaXR5PVwic2hhMzg0LUpqU21WZ3lkMHAzcFhCMXJSaWJaVUFZb0lJeTZPclE2VnJqSUVhRmYvbkpHekl4RkRzZjR4MHhJTStCMDdqUk1cIiBjcm9zc29yaWdpbj1cImFub255bW91c1wiPjwvc2NyaXB0PmA7XHJcbn0iLCJleHBvcnRzLnJlbmRlciA9IGxvZ2luID0+IHtcclxuICAgIHJldHVybiBgXHJcbiAgICA8ZGl2IGNwZkFsdW5vPSR7bG9naW59PjwvZGl2PlxyXG4gICAgPGRpdiBjbGFzcz1cImxpbWl0ZXJcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXItbG9naW4xMDBcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwid3JhcC1sb2dpbjEwMCBwLWItMTYwIHAtdC01MFwiPlxyXG5cclxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00M1wiPlxyXG4gICAgICAgICAgICAgICAgICAgIFNlbGVjaW9uZSB1bWEgc2FsYSBwYXJhIGZhemVyIGEgbWFyY2HDp8OjbyBkYXMgYXVsYXNcclxuICAgICAgICAgICAgICAgIDwvc3Bhbj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXItbWVudTEwMC1idG5cIj5cclxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJtZW51MTAwLWZvcm0tYnRuMlwiIGJvdGFvTXVzY3VsYWNhbz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIE11c2N1bGHDp8OjbyAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXItbWVudTEwMC1idG5cIj5cclxuICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJtZW51MTAwLWZvcm0tYnRuMVwiIGJvdGFvTXVsdGlmdW5jaW9uYWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIE11bHRpZnVuY2lvbmFsXHJcbiAgICAgICAgICAgICAgICAgICAgPC9hPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcbmA7XHJcbn0iLCJjb25zdCBHcmlkTWFyY2FjYW8gPSByZXF1aXJlKCcuL2dyaWRNYXJjYWNhby5qcycpO1xyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSAoKSA9PiB7XHJcbiAgICByZXR1cm4gYFxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lciBcIj5cclxuICAgIDxkaXY+XHJcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLTJcIj5cclxuICAgICAgICAgICAgU2FsYSBNdWx0aWZ1bmNpb25hbCAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgPC9zcGFuPlxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5cclxuJHtHcmlkTWFyY2FjYW8ucmVuZGVyKCl9XHJcblxyXG5gO1xyXG59IiwiY29uc3QgR3JpZE1hcmNhY2FvID0gcmVxdWlyZSgnLi9ncmlkTWFyY2FjYW8uanMnKTtcclxuXHJcbmV4cG9ydHMucmVuZGVyID0gaG9yYXJpb3MgPT4ge1xyXG4gICAgcmV0dXJuIGBcclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXIgXCI+XHJcbiAgICA8ZGl2PlxyXG4gICAgICAgIDxzcGFuIGNsYXNzPVwibG9naW4xMDAtZm9ybS10aXRsZSBwLWItNDMgcC0yXCI+XHJcbiAgICAgICAgICAgIFNhbGEgTXVzY3VsYWNhbyAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgPC9zcGFuPlxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5cclxuJHtHcmlkTWFyY2FjYW8ucmVuZGVyKGhvcmFyaW9zKX1cclxuXHJcbmA7XHJcbn0iLCJjb25zdCBBcHAgPSByZXF1aXJlKFwiLi9hcHAuanNcIik7XHJcblxyXG53aW5kb3cub25sb2FkID0gKCkgPT4ge1xyXG4gICAgY29uc3QgbWFpbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJtYWluXCIpO1xyXG4gICAgbmV3IEFwcChtYWluKS5pbml0KCk7XHJcbn0iXX0=
=======
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXF1ZXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RpbnktZW1pdHRlci9pbmRleC5qcyIsInNyYy9hcHAuanMiLCJzcmMvY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzIiwic3JjL2NvbXBvbmVudHMvYWdlbmRhLmpzIiwic3JjL2NvbXBvbmVudHMvY2FkYXN0cm9BbHVuby5qcyIsInNyYy9jb21wb25lbnRzL2xvZ2luLmpzIiwic3JjL2NvbXBvbmVudHMvbWVudS5qcyIsInNyYy9jb21wb25lbnRzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL2NvbXBvbmVudHMvbXVzY3VsYWNhby5qcyIsInNyYy9jb21wb25lbnRzL3NhbGEuanMiLCJzcmMvdGVtcGxhdGVzL2FkbWluaXN0cmFjYW8uanMiLCJzcmMvdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanMiLCJzcmMvdGVtcGxhdGVzL2dyaWRNYXJjYWNhby5qcyIsInNyYy90ZW1wbGF0ZXMvbG9naW4uanMiLCJzcmMvdGVtcGxhdGVzL21lbnUuanMiLCJzcmMvdGVtcGxhdGVzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL3RlbXBsYXRlcy9tdXNjdWxhY2FvLmpzIiwiaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBLE1BQU0sUUFBUSxRQUFRLHVCQUFSLENBQWQ7QUFDQSxNQUFNLGdCQUFnQixRQUFRLCtCQUFSLENBQXRCO0FBQ0EsTUFBTSxPQUFPLFFBQVEsc0JBQVIsQ0FBYjtBQUNBLE1BQU0sYUFBYSxRQUFRLDRCQUFSLENBQW5CO0FBQ0EsTUFBTSxp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TSxlQUFlLFFBQVEsbUJBQVIsQ0FBckI7O0FBRUEsUUFBUSxNQUFSLEdBQWlCLE1BQU07QUFDbkIsV0FBUTs7Ozs7Ozs7O0VBU1YsYUFBYSxNQUFiLEVBQXNCOztDQVRwQjtBQVlILENBYkQ7OztBQ0ZBLE1BQU0sZUFBZSxRQUFRLG1CQUFSLENBQXJCOztBQUVBLFFBQVEsTUFBUixHQUFpQixZQUFZO0FBQ3pCLFdBQVE7Ozs7Ozs7OztFQVNWLGFBQWEsTUFBYixDQUFvQixRQUFwQixDQUE4Qjs7Q0FUNUI7QUFZSCxDQWJEOzs7QUNGQSxNQUFNLE1BQU0sUUFBUSxVQUFSLENBQVo7O0FBRUEsT0FBTyxNQUFQLEdBQWdCLE1BQU07QUFDbEIsVUFBTSxPQUFPLFNBQVMsYUFBVCxDQUF1QixNQUF2QixDQUFiO0FBQ0EsUUFBSSxHQUFKLENBQVEsSUFBUixFQUFjLElBQWQ7QUFDSCxDQUhEIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiLy8gQnJvd3NlciBSZXF1ZXN0XHJcbi8vXHJcbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XHJcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cclxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XHJcbi8vXHJcbi8vICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcclxuLy9cclxuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxyXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXHJcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxyXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXHJcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxyXG5cclxuLy8gVU1EIEhFQURFUiBTVEFSVCBcclxuKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XHJcbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxyXG4gICAgICAgIGRlZmluZShbXSwgZmFjdG9yeSk7XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIC8vIE5vZGUuIERvZXMgbm90IHdvcmsgd2l0aCBzdHJpY3QgQ29tbW9uSlMsIGJ1dFxyXG4gICAgICAgIC8vIG9ubHkgQ29tbW9uSlMtbGlrZSBlbnZpcm9tZW50cyB0aGF0IHN1cHBvcnQgbW9kdWxlLmV4cG9ydHMsXHJcbiAgICAgICAgLy8gbGlrZSBOb2RlLlxyXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBCcm93c2VyIGdsb2JhbHMgKHJvb3QgaXMgd2luZG93KVxyXG4gICAgICAgIHJvb3QucmV0dXJuRXhwb3J0cyA9IGZhY3RvcnkoKTtcclxuICB9XHJcbn0odGhpcywgZnVuY3Rpb24gKCkge1xyXG4vLyBVTUQgSEVBREVSIEVORFxyXG5cclxudmFyIFhIUiA9IFhNTEh0dHBSZXF1ZXN0XHJcbmlmICghWEhSKSB0aHJvdyBuZXcgRXJyb3IoJ21pc3NpbmcgWE1MSHR0cFJlcXVlc3QnKVxyXG5yZXF1ZXN0LmxvZyA9IHtcclxuICAndHJhY2UnOiBub29wLCAnZGVidWcnOiBub29wLCAnaW5mbyc6IG5vb3AsICd3YXJuJzogbm9vcCwgJ2Vycm9yJzogbm9vcFxyXG59XHJcblxyXG52YXIgREVGQVVMVF9USU1FT1VUID0gMyAqIDYwICogMTAwMCAvLyAzIG1pbnV0ZXNcclxuXHJcbi8vXHJcbi8vIHJlcXVlc3RcclxuLy9cclxuXHJcbmZ1bmN0aW9uIHJlcXVlc3Qob3B0aW9ucywgY2FsbGJhY2spIHtcclxuICAvLyBUaGUgZW50cnktcG9pbnQgdG8gdGhlIEFQSTogcHJlcCB0aGUgb3B0aW9ucyBvYmplY3QgYW5kIHBhc3MgdGhlIHJlYWwgd29yayB0byBydW5feGhyLlxyXG4gIGlmKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJylcclxuICAgIHRocm93IG5ldyBFcnJvcignQmFkIGNhbGxiYWNrIGdpdmVuOiAnICsgY2FsbGJhY2spXHJcblxyXG4gIGlmKCFvcHRpb25zKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBvcHRpb25zIGdpdmVuJylcclxuXHJcbiAgdmFyIG9wdGlvbnNfb25SZXNwb25zZSA9IG9wdGlvbnMub25SZXNwb25zZTsgLy8gU2F2ZSB0aGlzIGZvciBsYXRlci5cclxuXHJcbiAgaWYodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnKVxyXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfTtcclxuICBlbHNlXHJcbiAgICBvcHRpb25zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRpb25zKSk7IC8vIFVzZSBhIGR1cGxpY2F0ZSBmb3IgbXV0YXRpbmcuXHJcblxyXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnNfb25SZXNwb25zZSAvLyBBbmQgcHV0IGl0IGJhY2suXHJcblxyXG4gIGlmIChvcHRpb25zLnZlcmJvc2UpIHJlcXVlc3QubG9nID0gZ2V0TG9nZ2VyKCk7XHJcblxyXG4gIGlmKG9wdGlvbnMudXJsKSB7XHJcbiAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJsO1xyXG4gICAgZGVsZXRlIG9wdGlvbnMudXJsO1xyXG4gIH1cclxuXHJcbiAgaWYoIW9wdGlvbnMudXJpICYmIG9wdGlvbnMudXJpICE9PSBcIlwiKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy51cmkgaXMgYSByZXF1aXJlZCBhcmd1bWVudFwiKTtcclxuXHJcbiAgaWYodHlwZW9mIG9wdGlvbnMudXJpICE9IFwic3RyaW5nXCIpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLnVyaSBtdXN0IGJlIGEgc3RyaW5nXCIpO1xyXG5cclxuICB2YXIgdW5zdXBwb3J0ZWRfb3B0aW9ucyA9IFsncHJveHknLCAnX3JlZGlyZWN0c0ZvbGxvd2VkJywgJ21heFJlZGlyZWN0cycsICdmb2xsb3dSZWRpcmVjdCddXHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bnN1cHBvcnRlZF9vcHRpb25zLmxlbmd0aDsgaSsrKVxyXG4gICAgaWYob3B0aW9uc1sgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSBdKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLlwiICsgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSArIFwiIGlzIG5vdCBzdXBwb3J0ZWRcIilcclxuXHJcbiAgb3B0aW9ucy5jYWxsYmFjayA9IGNhbGxiYWNrXHJcbiAgb3B0aW9ucy5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCAnR0VUJztcclxuICBvcHRpb25zLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge307XHJcbiAgb3B0aW9ucy5ib2R5ICAgID0gb3B0aW9ucy5ib2R5IHx8IG51bGxcclxuICBvcHRpb25zLnRpbWVvdXQgPSBvcHRpb25zLnRpbWVvdXQgfHwgcmVxdWVzdC5ERUZBVUxUX1RJTUVPVVRcclxuXHJcbiAgaWYob3B0aW9ucy5oZWFkZXJzLmhvc3QpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJPcHRpb25zLmhlYWRlcnMuaG9zdCBpcyBub3Qgc3VwcG9ydGVkXCIpO1xyXG5cclxuICBpZihvcHRpb25zLmpzb24pIHtcclxuICAgIG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgPSBvcHRpb25zLmhlYWRlcnMuYWNjZXB0IHx8ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG4gICAgaWYob3B0aW9ucy5tZXRob2QgIT09ICdHRVQnKVxyXG4gICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gJ2FwcGxpY2F0aW9uL2pzb24nXHJcblxyXG4gICAgaWYodHlwZW9mIG9wdGlvbnMuanNvbiAhPT0gJ2Jvb2xlYW4nKVxyXG4gICAgICBvcHRpb25zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXHJcbiAgICBlbHNlIGlmKHR5cGVvZiBvcHRpb25zLmJvZHkgIT09ICdzdHJpbmcnKVxyXG4gICAgICBvcHRpb25zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmJvZHkpXHJcbiAgfVxyXG4gIFxyXG4gIC8vQkVHSU4gUVMgSGFja1xyXG4gIHZhciBzZXJpYWxpemUgPSBmdW5jdGlvbihvYmopIHtcclxuICAgIHZhciBzdHIgPSBbXTtcclxuICAgIGZvcih2YXIgcCBpbiBvYmopXHJcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcclxuICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcclxuICAgICAgfVxyXG4gICAgcmV0dXJuIHN0ci5qb2luKFwiJlwiKTtcclxuICB9XHJcbiAgXHJcbiAgaWYob3B0aW9ucy5xcyl7XHJcbiAgICB2YXIgcXMgPSAodHlwZW9mIG9wdGlvbnMucXMgPT0gJ3N0cmluZycpPyBvcHRpb25zLnFzIDogc2VyaWFsaXplKG9wdGlvbnMucXMpO1xyXG4gICAgaWYob3B0aW9ucy51cmkuaW5kZXhPZignPycpICE9PSAtMSl7IC8vbm8gZ2V0IHBhcmFtc1xyXG4gICAgICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmkrJyYnK3FzO1xyXG4gICAgfWVsc2V7IC8vZXhpc3RpbmcgZ2V0IHBhcmFtc1xyXG4gICAgICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmkrJz8nK3FzO1xyXG4gICAgfVxyXG4gIH1cclxuICAvL0VORCBRUyBIYWNrXHJcbiAgXHJcbiAgLy9CRUdJTiBGT1JNIEhhY2tcclxuICB2YXIgbXVsdGlwYXJ0ID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICAvL3RvZG86IHN1cHBvcnQgZmlsZSB0eXBlICh1c2VmdWw/KVxyXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xyXG4gICAgcmVzdWx0LmJvdW5kcnkgPSAnLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLScrTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpKjEwMDAwMDAwMDApO1xyXG4gICAgdmFyIGxpbmVzID0gW107XHJcbiAgICBmb3IodmFyIHAgaW4gb2JqKXtcclxuICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XHJcbiAgICAgICAgICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgICAgICAgICAnLS0nK3Jlc3VsdC5ib3VuZHJ5K1wiXFxuXCIrXHJcbiAgICAgICAgICAgICAgICAnQ29udGVudC1EaXNwb3NpdGlvbjogZm9ybS1kYXRhOyBuYW1lPVwiJytwKydcIicrXCJcXG5cIitcclxuICAgICAgICAgICAgICAgIFwiXFxuXCIrXHJcbiAgICAgICAgICAgICAgICBvYmpbcF0rXCJcXG5cIlxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGxpbmVzLnB1c2goICctLScrcmVzdWx0LmJvdW5kcnkrJy0tJyApO1xyXG4gICAgcmVzdWx0LmJvZHkgPSBsaW5lcy5qb2luKCcnKTtcclxuICAgIHJlc3VsdC5sZW5ndGggPSByZXN1bHQuYm9keS5sZW5ndGg7XHJcbiAgICByZXN1bHQudHlwZSA9ICdtdWx0aXBhcnQvZm9ybS1kYXRhOyBib3VuZGFyeT0nK3Jlc3VsdC5ib3VuZHJ5O1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxuICB9XHJcbiAgXHJcbiAgaWYob3B0aW9ucy5mb3JtKXtcclxuICAgIGlmKHR5cGVvZiBvcHRpb25zLmZvcm0gPT0gJ3N0cmluZycpIHRocm93KCdmb3JtIG5hbWUgdW5zdXBwb3J0ZWQnKTtcclxuICAgIGlmKG9wdGlvbnMubWV0aG9kID09PSAnUE9TVCcpe1xyXG4gICAgICAgIHZhciBlbmNvZGluZyA9IChvcHRpb25zLmVuY29kaW5nIHx8ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBlbmNvZGluZztcclxuICAgICAgICBzd2l0Y2goZW5jb2Rpbmcpe1xyXG4gICAgICAgICAgICBjYXNlICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOlxyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5ib2R5ID0gc2VyaWFsaXplKG9wdGlvbnMuZm9ybSkucmVwbGFjZSgvJTIwL2csIFwiK1wiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdtdWx0aXBhcnQvZm9ybS1kYXRhJzpcclxuICAgICAgICAgICAgICAgIHZhciBtdWx0aSA9IG11bHRpcGFydChvcHRpb25zLmZvcm0pO1xyXG4gICAgICAgICAgICAgICAgLy9vcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBtdWx0aS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmJvZHkgPSBtdWx0aS5ib2R5O1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IG11bHRpLnR5cGU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdCA6IHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgZW5jb2Rpbmc6JytlbmNvZGluZyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICAvL0VORCBGT1JNIEhhY2tcclxuXHJcbiAgLy8gSWYgb25SZXNwb25zZSBpcyBib29sZWFuIHRydWUsIGNhbGwgYmFjayBpbW1lZGlhdGVseSB3aGVuIHRoZSByZXNwb25zZSBpcyBrbm93bixcclxuICAvLyBub3Qgd2hlbiB0aGUgZnVsbCByZXF1ZXN0IGlzIGNvbXBsZXRlLlxyXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnMub25SZXNwb25zZSB8fCBub29wXHJcbiAgaWYob3B0aW9ucy5vblJlc3BvbnNlID09PSB0cnVlKSB7XHJcbiAgICBvcHRpb25zLm9uUmVzcG9uc2UgPSBjYWxsYmFja1xyXG4gICAgb3B0aW9ucy5jYWxsYmFjayA9IG5vb3BcclxuICB9XHJcblxyXG4gIC8vIFhYWCBCcm93c2VycyBkbyBub3QgbGlrZSB0aGlzLlxyXG4gIC8vaWYob3B0aW9ucy5ib2R5KVxyXG4gIC8vICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBvcHRpb25zLmJvZHkubGVuZ3RoO1xyXG5cclxuICAvLyBIVFRQIGJhc2ljIGF1dGhlbnRpY2F0aW9uXHJcbiAgaWYoIW9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uICYmIG9wdGlvbnMuYXV0aClcclxuICAgIG9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uID0gJ0Jhc2ljICcgKyBiNjRfZW5jKG9wdGlvbnMuYXV0aC51c2VybmFtZSArICc6JyArIG9wdGlvbnMuYXV0aC5wYXNzd29yZCk7XHJcblxyXG4gIHJldHVybiBydW5feGhyKG9wdGlvbnMpXHJcbn1cclxuXHJcbnZhciByZXFfc2VxID0gMFxyXG5mdW5jdGlvbiBydW5feGhyKG9wdGlvbnMpIHtcclxuICB2YXIgeGhyID0gbmV3IFhIUlxyXG4gICAgLCB0aW1lZF9vdXQgPSBmYWxzZVxyXG4gICAgLCBpc19jb3JzID0gaXNfY3Jvc3NEb21haW4ob3B0aW9ucy51cmkpXHJcbiAgICAsIHN1cHBvcnRzX2NvcnMgPSAoJ3dpdGhDcmVkZW50aWFscycgaW4geGhyKVxyXG5cclxuICByZXFfc2VxICs9IDFcclxuICB4aHIuc2VxX2lkID0gcmVxX3NlcVxyXG4gIHhoci5pZCA9IHJlcV9zZXEgKyAnOiAnICsgb3B0aW9ucy5tZXRob2QgKyAnICcgKyBvcHRpb25zLnVyaVxyXG4gIHhoci5faWQgPSB4aHIuaWQgLy8gSSBrbm93IEkgd2lsbCB0eXBlIFwiX2lkXCIgZnJvbSBoYWJpdCBhbGwgdGhlIHRpbWUuXHJcblxyXG4gIGlmKGlzX2NvcnMgJiYgIXN1cHBvcnRzX2NvcnMpIHtcclxuICAgIHZhciBjb3JzX2VyciA9IG5ldyBFcnJvcignQnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IGNyb3NzLW9yaWdpbiByZXF1ZXN0OiAnICsgb3B0aW9ucy51cmkpXHJcbiAgICBjb3JzX2Vyci5jb3JzID0gJ3Vuc3VwcG9ydGVkJ1xyXG4gICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcclxuICB9XHJcblxyXG4gIHhoci50aW1lb3V0VGltZXIgPSBzZXRUaW1lb3V0KHRvb19sYXRlLCBvcHRpb25zLnRpbWVvdXQpXHJcbiAgZnVuY3Rpb24gdG9vX2xhdGUoKSB7XHJcbiAgICB0aW1lZF9vdXQgPSB0cnVlXHJcbiAgICB2YXIgZXIgPSBuZXcgRXJyb3IoJ0VUSU1FRE9VVCcpXHJcbiAgICBlci5jb2RlID0gJ0VUSU1FRE9VVCdcclxuICAgIGVyLmR1cmF0aW9uID0gb3B0aW9ucy50aW1lb3V0XHJcblxyXG4gICAgcmVxdWVzdC5sb2cuZXJyb3IoJ1RpbWVvdXQnLCB7ICdpZCc6eGhyLl9pZCwgJ21pbGxpc2Vjb25kcyc6b3B0aW9ucy50aW1lb3V0IH0pXHJcbiAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKVxyXG4gIH1cclxuXHJcbiAgLy8gU29tZSBzdGF0ZXMgY2FuIGJlIHNraXBwZWQgb3Zlciwgc28gcmVtZW1iZXIgd2hhdCBpcyBzdGlsbCBpbmNvbXBsZXRlLlxyXG4gIHZhciBkaWQgPSB7J3Jlc3BvbnNlJzpmYWxzZSwgJ2xvYWRpbmcnOmZhbHNlLCAnZW5kJzpmYWxzZX1cclxuXHJcbiAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IG9uX3N0YXRlX2NoYW5nZVxyXG4gIHhoci5vcGVuKG9wdGlvbnMubWV0aG9kLCBvcHRpb25zLnVyaSwgdHJ1ZSkgLy8gYXN5bmNocm9ub3VzXHJcbiAgaWYoaXNfY29ycylcclxuICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSAhISBvcHRpb25zLndpdGhDcmVkZW50aWFsc1xyXG4gIHhoci5zZW5kKG9wdGlvbnMuYm9keSlcclxuICByZXR1cm4geGhyXHJcblxyXG4gIGZ1bmN0aW9uIG9uX3N0YXRlX2NoYW5nZShldmVudCkge1xyXG4gICAgaWYodGltZWRfb3V0KVxyXG4gICAgICByZXR1cm4gcmVxdWVzdC5sb2cuZGVidWcoJ0lnbm9yaW5nIHRpbWVkIG91dCBzdGF0ZSBjaGFuZ2UnLCB7J3N0YXRlJzp4aHIucmVhZHlTdGF0ZSwgJ2lkJzp4aHIuaWR9KVxyXG5cclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdTdGF0ZSBjaGFuZ2UnLCB7J3N0YXRlJzp4aHIucmVhZHlTdGF0ZSwgJ2lkJzp4aHIuaWQsICd0aW1lZF9vdXQnOnRpbWVkX291dH0pXHJcblxyXG4gICAgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5PUEVORUQpIHtcclxuICAgICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3Qgc3RhcnRlZCcsIHsnaWQnOnhoci5pZH0pXHJcbiAgICAgIGZvciAodmFyIGtleSBpbiBvcHRpb25zLmhlYWRlcnMpXHJcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBvcHRpb25zLmhlYWRlcnNba2V5XSlcclxuICAgIH1cclxuXHJcbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuSEVBREVSU19SRUNFSVZFRClcclxuICAgICAgb25fcmVzcG9uc2UoKVxyXG5cclxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5MT0FESU5HKSB7XHJcbiAgICAgIG9uX3Jlc3BvbnNlKClcclxuICAgICAgb25fbG9hZGluZygpXHJcbiAgICB9XHJcblxyXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkRPTkUpIHtcclxuICAgICAgb25fcmVzcG9uc2UoKVxyXG4gICAgICBvbl9sb2FkaW5nKClcclxuICAgICAgb25fZW5kKClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG9uX3Jlc3BvbnNlKCkge1xyXG4gICAgaWYoZGlkLnJlc3BvbnNlKVxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBkaWQucmVzcG9uc2UgPSB0cnVlXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnR290IHJlc3BvbnNlJywgeydpZCc6eGhyLmlkLCAnc3RhdHVzJzp4aHIuc3RhdHVzfSlcclxuICAgIGNsZWFyVGltZW91dCh4aHIudGltZW91dFRpbWVyKVxyXG4gICAgeGhyLnN0YXR1c0NvZGUgPSB4aHIuc3RhdHVzIC8vIE5vZGUgcmVxdWVzdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgLy8gRGV0ZWN0IGZhaWxlZCBDT1JTIHJlcXVlc3RzLlxyXG4gICAgaWYoaXNfY29ycyAmJiB4aHIuc3RhdHVzQ29kZSA9PSAwKSB7XHJcbiAgICAgIHZhciBjb3JzX2VyciA9IG5ldyBFcnJvcignQ09SUyByZXF1ZXN0IHJlamVjdGVkOiAnICsgb3B0aW9ucy51cmkpXHJcbiAgICAgIGNvcnNfZXJyLmNvcnMgPSAncmVqZWN0ZWQnXHJcblxyXG4gICAgICAvLyBEbyBub3QgcHJvY2VzcyB0aGlzIHJlcXVlc3QgZnVydGhlci5cclxuICAgICAgZGlkLmxvYWRpbmcgPSB0cnVlXHJcbiAgICAgIGRpZC5lbmQgPSB0cnVlXHJcblxyXG4gICAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxyXG4gICAgfVxyXG5cclxuICAgIG9wdGlvbnMub25SZXNwb25zZShudWxsLCB4aHIpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBvbl9sb2FkaW5nKCkge1xyXG4gICAgaWYoZGlkLmxvYWRpbmcpXHJcbiAgICAgIHJldHVyblxyXG5cclxuICAgIGRpZC5sb2FkaW5nID0gdHJ1ZVxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1Jlc3BvbnNlIGJvZHkgbG9hZGluZycsIHsnaWQnOnhoci5pZH0pXHJcbiAgICAvLyBUT0RPOiBNYXliZSBzaW11bGF0ZSBcImRhdGFcIiBldmVudHMgYnkgd2F0Y2hpbmcgeGhyLnJlc3BvbnNlVGV4dFxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gb25fZW5kKCkge1xyXG4gICAgaWYoZGlkLmVuZClcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAgZGlkLmVuZCA9IHRydWVcclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IGRvbmUnLCB7J2lkJzp4aHIuaWR9KVxyXG5cclxuICAgIHhoci5ib2R5ID0geGhyLnJlc3BvbnNlVGV4dFxyXG4gICAgaWYob3B0aW9ucy5qc29uKSB7XHJcbiAgICAgIHRyeSAgICAgICAgeyB4aHIuYm9keSA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCkgfVxyXG4gICAgICBjYXRjaCAoZXIpIHsgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soZXIsIHhocikgICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBvcHRpb25zLmNhbGxiYWNrKG51bGwsIHhociwgeGhyLmJvZHkpXHJcbiAgfVxyXG5cclxufSAvLyByZXF1ZXN0XHJcblxyXG5yZXF1ZXN0LndpdGhDcmVkZW50aWFscyA9IGZhbHNlO1xyXG5yZXF1ZXN0LkRFRkFVTFRfVElNRU9VVCA9IERFRkFVTFRfVElNRU9VVDtcclxuXHJcbi8vXHJcbi8vIGRlZmF1bHRzXHJcbi8vXHJcblxyXG5yZXF1ZXN0LmRlZmF1bHRzID0gZnVuY3Rpb24ob3B0aW9ucywgcmVxdWVzdGVyKSB7XHJcbiAgdmFyIGRlZiA9IGZ1bmN0aW9uIChtZXRob2QpIHtcclxuICAgIHZhciBkID0gZnVuY3Rpb24gKHBhcmFtcywgY2FsbGJhY2spIHtcclxuICAgICAgaWYodHlwZW9mIHBhcmFtcyA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgcGFyYW1zID0geyd1cmknOiBwYXJhbXN9O1xyXG4gICAgICBlbHNlIHtcclxuICAgICAgICBwYXJhbXMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHBhcmFtcykpO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAodmFyIGkgaW4gb3B0aW9ucykge1xyXG4gICAgICAgIGlmIChwYXJhbXNbaV0gPT09IHVuZGVmaW5lZCkgcGFyYW1zW2ldID0gb3B0aW9uc1tpXVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBtZXRob2QocGFyYW1zLCBjYWxsYmFjaylcclxuICAgIH1cclxuICAgIHJldHVybiBkXHJcbiAgfVxyXG4gIHZhciBkZSA9IGRlZihyZXF1ZXN0KVxyXG4gIGRlLmdldCA9IGRlZihyZXF1ZXN0LmdldClcclxuICBkZS5wb3N0ID0gZGVmKHJlcXVlc3QucG9zdClcclxuICBkZS5wdXQgPSBkZWYocmVxdWVzdC5wdXQpXHJcbiAgZGUuaGVhZCA9IGRlZihyZXF1ZXN0LmhlYWQpXHJcbiAgcmV0dXJuIGRlXHJcbn1cclxuXHJcbi8vXHJcbi8vIEhUVFAgbWV0aG9kIHNob3J0Y3V0c1xyXG4vL1xyXG5cclxudmFyIHNob3J0Y3V0cyA9IFsgJ2dldCcsICdwdXQnLCAncG9zdCcsICdoZWFkJyBdO1xyXG5zaG9ydGN1dHMuZm9yRWFjaChmdW5jdGlvbihzaG9ydGN1dCkge1xyXG4gIHZhciBtZXRob2QgPSBzaG9ydGN1dC50b1VwcGVyQ2FzZSgpO1xyXG4gIHZhciBmdW5jICAgPSBzaG9ydGN1dC50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICByZXF1ZXN0W2Z1bmNdID0gZnVuY3Rpb24ob3B0cykge1xyXG4gICAgaWYodHlwZW9mIG9wdHMgPT09ICdzdHJpbmcnKVxyXG4gICAgICBvcHRzID0geydtZXRob2QnOm1ldGhvZCwgJ3VyaSc6b3B0c307XHJcbiAgICBlbHNlIHtcclxuICAgICAgb3B0cyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0cykpO1xyXG4gICAgICBvcHRzLm1ldGhvZCA9IG1ldGhvZDtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYXJncyA9IFtvcHRzXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmFwcGx5KGFyZ3VtZW50cywgWzFdKSk7XHJcbiAgICByZXR1cm4gcmVxdWVzdC5hcHBseSh0aGlzLCBhcmdzKTtcclxuICB9XHJcbn0pXHJcblxyXG4vL1xyXG4vLyBDb3VjaERCIHNob3J0Y3V0XHJcbi8vXHJcblxyXG5yZXF1ZXN0LmNvdWNoID0gZnVuY3Rpb24ob3B0aW9ucywgY2FsbGJhY2spIHtcclxuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXHJcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9XHJcblxyXG4gIC8vIEp1c3QgdXNlIHRoZSByZXF1ZXN0IEFQSSB0byBkbyBKU09OLlxyXG4gIG9wdGlvbnMuanNvbiA9IHRydWVcclxuICBpZihvcHRpb25zLmJvZHkpXHJcbiAgICBvcHRpb25zLmpzb24gPSBvcHRpb25zLmJvZHlcclxuICBkZWxldGUgb3B0aW9ucy5ib2R5XHJcblxyXG4gIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgbm9vcFxyXG5cclxuICB2YXIgeGhyID0gcmVxdWVzdChvcHRpb25zLCBjb3VjaF9oYW5kbGVyKVxyXG4gIHJldHVybiB4aHJcclxuXHJcbiAgZnVuY3Rpb24gY291Y2hfaGFuZGxlcihlciwgcmVzcCwgYm9keSkge1xyXG4gICAgaWYoZXIpXHJcbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSlcclxuXHJcbiAgICBpZigocmVzcC5zdGF0dXNDb2RlIDwgMjAwIHx8IHJlc3Auc3RhdHVzQ29kZSA+IDI5OSkgJiYgYm9keS5lcnJvcikge1xyXG4gICAgICAvLyBUaGUgYm9keSBpcyBhIENvdWNoIEpTT04gb2JqZWN0IGluZGljYXRpbmcgdGhlIGVycm9yLlxyXG4gICAgICBlciA9IG5ldyBFcnJvcignQ291Y2hEQiBlcnJvcjogJyArIChib2R5LmVycm9yLnJlYXNvbiB8fCBib2R5LmVycm9yLmVycm9yKSlcclxuICAgICAgZm9yICh2YXIga2V5IGluIGJvZHkpXHJcbiAgICAgICAgZXJba2V5XSA9IGJvZHlba2V5XVxyXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XHJcbiAgfVxyXG59XHJcblxyXG4vL1xyXG4vLyBVdGlsaXR5XHJcbi8vXHJcblxyXG5mdW5jdGlvbiBub29wKCkge31cclxuXHJcbmZ1bmN0aW9uIGdldExvZ2dlcigpIHtcclxuICB2YXIgbG9nZ2VyID0ge31cclxuICAgICwgbGV2ZWxzID0gWyd0cmFjZScsICdkZWJ1ZycsICdpbmZvJywgJ3dhcm4nLCAnZXJyb3InXVxyXG4gICAgLCBsZXZlbCwgaVxyXG5cclxuICBmb3IoaSA9IDA7IGkgPCBsZXZlbHMubGVuZ3RoOyBpKyspIHtcclxuICAgIGxldmVsID0gbGV2ZWxzW2ldXHJcblxyXG4gICAgbG9nZ2VyW2xldmVsXSA9IG5vb3BcclxuICAgIGlmKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlICYmIGNvbnNvbGVbbGV2ZWxdKVxyXG4gICAgICBsb2dnZXJbbGV2ZWxdID0gZm9ybWF0dGVkKGNvbnNvbGUsIGxldmVsKVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGxvZ2dlclxyXG59XHJcblxyXG5mdW5jdGlvbiBmb3JtYXR0ZWQob2JqLCBtZXRob2QpIHtcclxuICByZXR1cm4gZm9ybWF0dGVkX2xvZ2dlclxyXG5cclxuICBmdW5jdGlvbiBmb3JtYXR0ZWRfbG9nZ2VyKHN0ciwgY29udGV4dCkge1xyXG4gICAgaWYodHlwZW9mIGNvbnRleHQgPT09ICdvYmplY3QnKVxyXG4gICAgICBzdHIgKz0gJyAnICsgSlNPTi5zdHJpbmdpZnkoY29udGV4dClcclxuXHJcbiAgICByZXR1cm4gb2JqW21ldGhvZF0uY2FsbChvYmosIHN0cilcclxuICB9XHJcbn1cclxuXHJcbi8vIFJldHVybiB3aGV0aGVyIGEgVVJMIGlzIGEgY3Jvc3MtZG9tYWluIHJlcXVlc3QuXHJcbmZ1bmN0aW9uIGlzX2Nyb3NzRG9tYWluKHVybCkge1xyXG4gIHZhciBydXJsID0gL14oW1xcd1xcK1xcLlxcLV0rOikoPzpcXC9cXC8oW15cXC8/IzpdKikoPzo6KFxcZCspKT8pPy9cclxuXHJcbiAgLy8galF1ZXJ5ICM4MTM4LCBJRSBtYXkgdGhyb3cgYW4gZXhjZXB0aW9uIHdoZW4gYWNjZXNzaW5nXHJcbiAgLy8gYSBmaWVsZCBmcm9tIHdpbmRvdy5sb2NhdGlvbiBpZiBkb2N1bWVudC5kb21haW4gaGFzIGJlZW4gc2V0XHJcbiAgdmFyIGFqYXhMb2NhdGlvblxyXG4gIHRyeSB7IGFqYXhMb2NhdGlvbiA9IGxvY2F0aW9uLmhyZWYgfVxyXG4gIGNhdGNoIChlKSB7XHJcbiAgICAvLyBVc2UgdGhlIGhyZWYgYXR0cmlidXRlIG9mIGFuIEEgZWxlbWVudCBzaW5jZSBJRSB3aWxsIG1vZGlmeSBpdCBnaXZlbiBkb2N1bWVudC5sb2NhdGlvblxyXG4gICAgYWpheExvY2F0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggXCJhXCIgKTtcclxuICAgIGFqYXhMb2NhdGlvbi5ocmVmID0gXCJcIjtcclxuICAgIGFqYXhMb2NhdGlvbiA9IGFqYXhMb2NhdGlvbi5ocmVmO1xyXG4gIH1cclxuXHJcbiAgdmFyIGFqYXhMb2NQYXJ0cyA9IHJ1cmwuZXhlYyhhamF4TG9jYXRpb24udG9Mb3dlckNhc2UoKSkgfHwgW11cclxuICAgICwgcGFydHMgPSBydXJsLmV4ZWModXJsLnRvTG93ZXJDYXNlKCkgKVxyXG5cclxuICB2YXIgcmVzdWx0ID0gISEoXHJcbiAgICBwYXJ0cyAmJlxyXG4gICAgKCAgcGFydHNbMV0gIT0gYWpheExvY1BhcnRzWzFdXHJcbiAgICB8fCBwYXJ0c1syXSAhPSBhamF4TG9jUGFydHNbMl1cclxuICAgIHx8IChwYXJ0c1szXSB8fCAocGFydHNbMV0gPT09IFwiaHR0cDpcIiA/IDgwIDogNDQzKSkgIT0gKGFqYXhMb2NQYXJ0c1szXSB8fCAoYWpheExvY1BhcnRzWzFdID09PSBcImh0dHA6XCIgPyA4MCA6IDQ0MykpXHJcbiAgICApXHJcbiAgKVxyXG5cclxuICAvL2NvbnNvbGUuZGVidWcoJ2lzX2Nyb3NzRG9tYWluKCcrdXJsKycpIC0+ICcgKyByZXN1bHQpXHJcbiAgcmV0dXJuIHJlc3VsdFxyXG59XHJcblxyXG4vLyBNSVQgTGljZW5zZSBmcm9tIGh0dHA6Ly9waHBqcy5vcmcvZnVuY3Rpb25zL2Jhc2U2NF9lbmNvZGU6MzU4XHJcbmZ1bmN0aW9uIGI2NF9lbmMgKGRhdGEpIHtcclxuICAgIC8vIEVuY29kZXMgc3RyaW5nIHVzaW5nIE1JTUUgYmFzZTY0IGFsZ29yaXRobVxyXG4gICAgdmFyIGI2NCA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIjtcclxuICAgIHZhciBvMSwgbzIsIG8zLCBoMSwgaDIsIGgzLCBoNCwgYml0cywgaSA9IDAsIGFjID0gMCwgZW5jPVwiXCIsIHRtcF9hcnIgPSBbXTtcclxuXHJcbiAgICBpZiAoIWRhdGEpIHtcclxuICAgICAgICByZXR1cm4gZGF0YTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBhc3N1bWUgdXRmOCBkYXRhXHJcbiAgICAvLyBkYXRhID0gdGhpcy51dGY4X2VuY29kZShkYXRhKycnKTtcclxuXHJcbiAgICBkbyB7IC8vIHBhY2sgdGhyZWUgb2N0ZXRzIGludG8gZm91ciBoZXhldHNcclxuICAgICAgICBvMSA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xyXG4gICAgICAgIG8yID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XHJcbiAgICAgICAgbzMgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcclxuXHJcbiAgICAgICAgYml0cyA9IG8xPDwxNiB8IG8yPDw4IHwgbzM7XHJcblxyXG4gICAgICAgIGgxID0gYml0cz4+MTggJiAweDNmO1xyXG4gICAgICAgIGgyID0gYml0cz4+MTIgJiAweDNmO1xyXG4gICAgICAgIGgzID0gYml0cz4+NiAmIDB4M2Y7XHJcbiAgICAgICAgaDQgPSBiaXRzICYgMHgzZjtcclxuXHJcbiAgICAgICAgLy8gdXNlIGhleGV0cyB0byBpbmRleCBpbnRvIGI2NCwgYW5kIGFwcGVuZCByZXN1bHQgdG8gZW5jb2RlZCBzdHJpbmdcclxuICAgICAgICB0bXBfYXJyW2FjKytdID0gYjY0LmNoYXJBdChoMSkgKyBiNjQuY2hhckF0KGgyKSArIGI2NC5jaGFyQXQoaDMpICsgYjY0LmNoYXJBdChoNCk7XHJcbiAgICB9IHdoaWxlIChpIDwgZGF0YS5sZW5ndGgpO1xyXG5cclxuICAgIGVuYyA9IHRtcF9hcnIuam9pbignJyk7XHJcblxyXG4gICAgc3dpdGNoIChkYXRhLmxlbmd0aCAlIDMpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMikgKyAnPT0nO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0xKSArICc9JztcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZW5jO1xyXG59XHJcbiAgICByZXR1cm4gcmVxdWVzdDtcclxuLy9VTUQgRk9PVEVSIFNUQVJUXHJcbn0pKTtcclxuLy9VTUQgRk9PVEVSIEVORFxyXG4iLCJmdW5jdGlvbiBFICgpIHtcclxuICAvLyBLZWVwIHRoaXMgZW1wdHkgc28gaXQncyBlYXNpZXIgdG8gaW5oZXJpdCBmcm9tXHJcbiAgLy8gKHZpYSBodHRwczovL2dpdGh1Yi5jb20vbGlwc21hY2sgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vc2NvdHRjb3JnYW4vdGlueS1lbWl0dGVyL2lzc3Vlcy8zKVxyXG59XHJcblxyXG5FLnByb3RvdHlwZSA9IHtcclxuICBvbjogZnVuY3Rpb24gKG5hbWUsIGNhbGxiYWNrLCBjdHgpIHtcclxuICAgIHZhciBlID0gdGhpcy5lIHx8ICh0aGlzLmUgPSB7fSk7XHJcblxyXG4gICAgKGVbbmFtZV0gfHwgKGVbbmFtZV0gPSBbXSkpLnB1c2goe1xyXG4gICAgICBmbjogY2FsbGJhY2ssXHJcbiAgICAgIGN0eDogY3R4XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9LFxyXG5cclxuICBvbmNlOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2ssIGN0eCkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgZnVuY3Rpb24gbGlzdGVuZXIgKCkge1xyXG4gICAgICBzZWxmLm9mZihuYW1lLCBsaXN0ZW5lcik7XHJcbiAgICAgIGNhbGxiYWNrLmFwcGx5KGN0eCwgYXJndW1lbnRzKTtcclxuICAgIH07XHJcblxyXG4gICAgbGlzdGVuZXIuXyA9IGNhbGxiYWNrXHJcbiAgICByZXR1cm4gdGhpcy5vbihuYW1lLCBsaXN0ZW5lciwgY3R4KTtcclxuICB9LFxyXG5cclxuICBlbWl0OiBmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgdmFyIGRhdGEgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XHJcbiAgICB2YXIgZXZ0QXJyID0gKCh0aGlzLmUgfHwgKHRoaXMuZSA9IHt9KSlbbmFtZV0gfHwgW10pLnNsaWNlKCk7XHJcbiAgICB2YXIgaSA9IDA7XHJcbiAgICB2YXIgbGVuID0gZXZ0QXJyLmxlbmd0aDtcclxuXHJcbiAgICBmb3IgKGk7IGkgPCBsZW47IGkrKykge1xyXG4gICAgICBldnRBcnJbaV0uZm4uYXBwbHkoZXZ0QXJyW2ldLmN0eCwgZGF0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfSxcclxuXHJcbiAgb2ZmOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2spIHtcclxuICAgIHZhciBlID0gdGhpcy5lIHx8ICh0aGlzLmUgPSB7fSk7XHJcbiAgICB2YXIgZXZ0cyA9IGVbbmFtZV07XHJcbiAgICB2YXIgbGl2ZUV2ZW50cyA9IFtdO1xyXG5cclxuICAgIGlmIChldnRzICYmIGNhbGxiYWNrKSB7XHJcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBldnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGV2dHNbaV0uZm4gIT09IGNhbGxiYWNrICYmIGV2dHNbaV0uZm4uXyAhPT0gY2FsbGJhY2spXHJcbiAgICAgICAgICBsaXZlRXZlbnRzLnB1c2goZXZ0c1tpXSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBSZW1vdmUgZXZlbnQgZnJvbSBxdWV1ZSB0byBwcmV2ZW50IG1lbW9yeSBsZWFrXHJcbiAgICAvLyBTdWdnZXN0ZWQgYnkgaHR0cHM6Ly9naXRodWIuY29tL2xhemRcclxuICAgIC8vIFJlZjogaHR0cHM6Ly9naXRodWIuY29tL3Njb3R0Y29yZ2FuL3RpbnktZW1pdHRlci9jb21taXQvYzZlYmZhYTliYzk3M2IzM2QxMTBhODRhMzA3NzQyYjdjZjk0Yzk1MyNjb21taXRjb21tZW50LTUwMjQ5MTBcclxuXHJcbiAgICAobGl2ZUV2ZW50cy5sZW5ndGgpXHJcbiAgICAgID8gZVtuYW1lXSA9IGxpdmVFdmVudHNcclxuICAgICAgOiBkZWxldGUgZVtuYW1lXTtcclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEU7XHJcbm1vZHVsZS5leHBvcnRzLlRpbnlFbWl0dGVyID0gRTtcclxuIiwiY29uc3QgTG9naW4gPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL2xvZ2luLmpzXCIpO1xyXG5jb25zdCBBZG1pbmlzdHJhY2FvID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzXCIpO1xyXG5jb25zdCBNZW51ID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9tZW51LmpzXCIpO1xyXG5jb25zdCBNdXNjdWxhY2FvID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9tdXNjdWxhY2FvLmpzXCIpO1xyXG5jb25zdCBNdWx0aWZ1bmNpb25hbCA9IHJlcXVpcmUoXCIuL2NvbXBvbmVudHMvbXVsdGlmdW5jaW9uYWwuanNcIik7XHJcblxyXG5jbGFzcyBBcHAge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBuZXcgTG9naW4oYm9keSk7XHJcbiAgICAgICAgdGhpcy5hZG1pbmlzdHJhY2FvID0gbmV3IEFkbWluaXN0cmFjYW8oYm9keSk7XHJcbiAgICAgICAgdGhpcy5tZW51ID0gbmV3IE1lbnUoYm9keSk7XHJcbiAgICAgICAgdGhpcy5tdXNjdWxhY2FvID0gbmV3IE11c2N1bGFjYW8oYm9keSk7XHJcbiAgICAgICAgdGhpcy5tdWx0aWZ1bmNpb25hbCA9IG5ldyBNdWx0aWZ1bmNpb25hbChib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICBpbml0KCkge1xyXG4gICAgICAgIHRoaXMubG9naW4ucmVuZGVyKCk7XHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmxvZ2luRXZlbnRzKCk7XHJcbiAgICAgICAgdGhpcy5hZG1pbmlzdHJhY2FvRXZlbnRzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgbG9naW5FdmVudHMoKSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImVycm9yXCIsICgpID0+IGFsZXJ0KFwiVXN1YXJpbyBvdSBzZW5oYSBpbmNvcnJldG9zXCIpKTtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwibG9naW5BZG1pblwiLCAoKSA9PiB0aGlzLmFkbWluaXN0cmFjYW8ucmVuZGVyKCkpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJsb2dpbkFsdW5vXCIsIGRhdGEgPT4gdGhpcy5tZW51LnJlbmRlcihkYXRhLmxvZ2luKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcIm11bHRpZnVuY2lvbmFsXCIsIGRhdGEgPT4gdGhpcy5tdWx0aWZ1bmNpb25hbC5yZW5kZXIoZGF0YSkpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJtdXNjdWxhY2FvXCIsIGRhdGEgPT4gdGhpcy5tdXNjdWxhY2FvLnJlbmRlcihkYXRhKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImFsdW5vTmFvSW5zZXJpZG9cIiwgKCkgPT4gYWxlcnQoXCJPcHMsIG8gYWx1bm8gbsOjbyBwb2RlIHNlciBpbnNlcmlkb1wiKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImFsdW5vSW5zZXJpZG9TdWNlc3NvXCIsICgpID0+IGFsZXJ0KFwiQWx1bm8gaW5zZXJpZG8gY29tIHN1Y2Vzc29cIikpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkbWluaXN0cmFjYW9FdmVudHMoKSB7XHJcbiAgICAgICAgLy90aGlzLmFkbWluaXN0cmFjYW8ub24oXCJwcmVlbmNoYUdyaWRcIiwgKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBcHA7IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvYWRtaW5pc3RyYWNhby5qc1wiKTtcclxuY29uc3QgTG9naW4gPSByZXF1aXJlKFwiLi9sb2dpbi5qc1wiKTtcclxuY29uc3QgQ2FkYXN0cm9BbHVubyA9IHJlcXVpcmUoXCIuL2NhZGFzdHJvQWx1bm8uanNcIik7XHJcblxyXG5jbGFzcyBBZG1pbmlzdHJhY2FvIGV4dGVuZHMgQWdlbmRhIHtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBuZXcgTG9naW4oYm9keSk7XHJcbiAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vID0gbmV3IENhZGFzdHJvQWx1bm8oYm9keSk7XHJcbiAgICAgICAgdGhpcy5laEVkaWNhbyA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLnJlbmRlckdyaWRBbHVub3MoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMubG9nb3V0KCk7XHJcbiAgICAgICAgdGhpcy5jbGlja0JvdGFvU2FsdmFyKCk7XHJcbiAgICAgICAgdGhpcy5jbGlja0JvdGFvQWRpY2lvbmFyKCk7XHJcbiAgICAgICAgdGhpcy5ib3Rhb0VkaXRhcigpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tCb3Rhb0V4Y2x1aXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dvdXQoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9TaHV0ZG93bl1cIikub25jbGljayA9ICgpID0+IGRvY3VtZW50LmxvY2F0aW9uLnJlbG9hZCh0cnVlKTtcclxuICAgIH1cclxuXHJcbiAgICBjbGlja0JvdGFvRXhjbHVpcigpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0V4Y2x1aXJdXCIpLm9uY2xpY2sgPSAoKSA9PiB0aGlzLmV4Y2x1YUFsdW5vKCk7XHJcbiAgICB9ICAgIFxyXG5cclxuICAgIGNsaWNrQm90YW9TYWx2YXIoKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IGZvcm0gPSB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcImZvcm1cIik7XHJcblxyXG4gICAgICAgIGZvcm0uYWRkRXZlbnRMaXN0ZW5lcihcInN1Ym1pdFwiLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFsdW5vID0gdGhpcy5vYnRlbmhhRGFkb3NNb2RhbChlKTtcclxuICAgICAgICAgICAgdGhpcy5pbnNpcmFPdUVkaXRlQWx1bm8oYWx1bm8pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGNsaWNrQm90YW9BZGljaW9uYXIoKSB7XHJcblxyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JvdGFvQWRpY2lvbmFyXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5laEVkaWNhbyA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGJvdGFvRWRpdGFyKCkge1xyXG5cclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0VkaXRhcl1cIikub25jbGljayA9ICgpID0+IHRoaXMuY2xpY2tCb3Rhb0VkaXRhcigpXHJcbiAgICB9XHJcblxyXG4gICAgY2xpY2tCb3Rhb0VkaXRhcigpIHtcclxuXHJcbiAgICAgICAgdGhpcy5laEVkaWNhbyA9IHRydWU7XHJcblxyXG4gICAgICAgIGxldCBhbHVub3NTZWxlY2lvbmFkb3MgPSB0aGlzLm9idGVuaGFBbHVub3NTZWxlY2lvbmFkb3MoKTtcclxuXHJcbiAgICAgICAgaWYgKGFsdW5vc1NlbGVjaW9uYWRvcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGFsdW5vc1NlbGVjaW9uYWRvcy5sZW5ndGggPT09IDEpIHsgICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhpcy5hbHVub1NlbGVjaW9uYWRvID0gYWx1bm9zU2VsZWNpb25hZG9zWzBdLmdldEF0dHJpYnV0ZShcImNvZGlnb2FsdW5vXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8ucHJlZW5jaGFNb2RhbEVkaWNhbyh0aGlzLmFsdW5vU2VsZWNpb25hZG8pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgYWxlcnQoXCJTZWxlY2lvbmUgYXBlbmFzIHVtIGFsdW5vIHBhcmEgZWRpw6fDo28gcG9yIGZhdm9yIVwiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgb2J0ZW5oYURhZG9zTW9kYWwoZSkge1xyXG5cclxuICAgICAgICBjb25zdCBjcGYgPSBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW2NwZl1cIikudmFsdWU7XHJcblxyXG4gICAgICAgIGNvbnN0IGFsdW5vID0ge1xyXG4gICAgICAgICAgICBub21lOiBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW25vbWVdXCIpLnZhbHVlLFxyXG4gICAgICAgICAgICBjcGY6IGNwZixcclxuICAgICAgICAgICAgdGVsZWZvbmU6IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbdGVsZWZvbmVdXCIpLnZhbHVlLFxyXG4gICAgICAgICAgICBlbWFpbDogZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltlbWFpbF1cIikudmFsdWUsXHJcbiAgICAgICAgICAgIGVuZGVyZWNvOiB0aGlzLm1vbnRlRW5kZXJlY28oZS50YXJnZXQpLFxyXG4gICAgICAgICAgICBtYXRyaWN1bGE6IHRoaXMuZ2VyZU1hdHJpY3VsYShjcGYpXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGFsdW5vO1xyXG4gICAgfVxyXG5cclxuICAgIGluc2lyYU91RWRpdGVBbHVubyhhbHVubykge1xyXG5cclxuICAgICAgICBpZiAodGhpcy5laEVkaWNhbykge1xyXG4gICAgICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8uZWRpdGVBbHVubyhhbHVubywgdGhpcy5hbHVub1NlbGVjaW9uYWRvKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FkYXN0cm9BbHVuby5pbnNpcmFBbHVubyhhbHVubyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAkKCcjbW9kYWxDYWRhc3Ryb0FsdW5vJykubW9kYWwoJ2hpZGUnKTtcclxuICAgICAgICB0aGlzLnJlbmRlckdyaWRBbHVub3MoKTtcclxuICAgIH1cclxuXHJcbiAgICBleGNsdWFBbHVubygpIHtcclxuXHJcbiAgICAgICAgbGV0IGFsdW5vc1NlbGVjaW9uYWRvcyA9IHRoaXMub2J0ZW5oYUFsdW5vc1NlbGVjaW9uYWRvcygpO1xyXG5cclxuICAgICAgICBpZiAoYWx1bm9zU2VsZWNpb25hZG9zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYWx1bm9zU2VsZWNpb25hZG9zLmxlbmd0aCA9PT0gMSkgeyAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB0aGlzLmFsdW5vU2VsZWNpb25hZG8gPSBhbHVub3NTZWxlY2lvbmFkb3NbMF0uZ2V0QXR0cmlidXRlKFwiY29kaWdvYWx1bm9cIik7XHJcbiAgICAgICAgICAgIHRoaXMuY2FkYXN0cm9BbHVuby5leGNsdWFBbHVubyh0aGlzLmFsdW5vU2VsZWNpb25hZG8pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgYWxlcnQoXCJTZWxlY2lvbmUgYXBlbmFzIHVtIGFsdW5vIHBhcmEgZWRpw6fDo28gcG9yIGZhdm9yIVwiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyR3JpZEFsdW5vcygpIHtcclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L2FkbWluaXN0cmFjYW9gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgaWYgKGVycikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiZXJyb3JcIiwgXCJuw6NvIGZvaSBwb3Nzw612ZWwgY2FycmVnYXIgb3MgYWx1bm9zXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcihkYXRhLmFsdW5vcyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIG9idGVuaGFBbHVub3NTZWxlY2lvbmFkb3MoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZnVuY3Rpb24gZXN0YVNlbGVjaW9uYWRvKGFsdW5vKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBhbHVuby5jaGVja2VkO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGFsdW5vcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiW2FsdW5vU2VsZWNpb25hZG9dXCIpKTtcclxuICAgICAgICByZXR1cm4gYWx1bm9zLmZpbHRlcihlc3RhU2VsZWNpb25hZG8pO1xyXG4gICAgfVxyXG5cclxuICAgIG1vbnRlRW5kZXJlY28odGFyZ2V0KSB7XHJcbiAgICAgICAgcmV0dXJuIHRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW2NpZGFkZV1cIikudmFsdWUgKyBcIlxcblwiICtcclxuICAgICAgICAgICAgdGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbYmFpcnJvXVwiKS52YWx1ZSArIFwiXFxuXCIgK1xyXG4gICAgICAgICAgICB0YXJnZXQucXVlcnlTZWxlY3RvcihcIltudW1lcm9dXCIpLnZhbHVlICsgXCJcXG5cIiArXHJcbiAgICAgICAgICAgIHRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW2NvbXBsZW1lbnRvXVwiKS52YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICBnZXJlTWF0cmljdWxhKGNwZikge1xyXG4gICAgICAgIGNvbnN0IGRhdGEgPSBuZXcgRGF0ZSgpO1xyXG4gICAgICAgIGNvbnN0IGFubyA9IGRhdGEuZ2V0RnVsbFllYXIoKTtcclxuICAgICAgICBjb25zdCBzZWd1bmRvcyA9IGRhdGEuZ2V0U2Vjb25kcygpO1xyXG4gICAgICAgIHJldHVybiBhbm8gKyBjcGYuc2xpY2UoOCkgKyBzZWd1bmRvcztcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBZG1pbmlzdHJhY2FvOyIsImNvbnN0IFRpbnlFbWl0dGVyID0gcmVxdWlyZShcInRpbnktZW1pdHRlclwiKTtcclxuY29uc3QgUmVxdWVzdCA9IHJlcXVpcmUoXCJicm93c2VyLXJlcXVlc3RcIik7XHJcblxyXG5jbGFzcyBBZ2VuZGEgZXh0ZW5kcyBUaW55RW1pdHRlciB7XHJcbiAgICBjb25zdHJ1Y3Rvcigpe1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0ID0gUmVxdWVzdDtcclxuICAgICAgICB0aGlzLlVSTCA9IFwiaHR0cDovL2xvY2FsaG9zdDozMzMzXCI7XHJcbiAgICB9XHJcbn1cclxubW9kdWxlLmV4cG9ydHMgPSBBZ2VuZGE7IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvY2FkYXN0cm9BbHVuby5qc1wiKTtcclxuY29uc3QgTG9naW4gPSByZXF1aXJlKFwiLi9sb2dpbi5qc1wiKTtcclxuXHJcbmNsYXNzIENhZGFzdHJvQWx1bm8gZXh0ZW5kcyBBZ2VuZGEge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgICAgICB0aGlzLmxvZ2luID0gbmV3IExvZ2luKGJvZHkpO1xyXG4gICAgfTtcclxuXHJcbiAgICBpbnNpcmFBbHVubyhhbHVubykge1xyXG5cclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvYCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICAgICAgYm9keToge1xyXG4gICAgICAgICAgICAgICAgbm9tZTogYWx1bm8ubm9tZSxcclxuICAgICAgICAgICAgICAgIGNwZjogYWx1bm8uY3BmLFxyXG4gICAgICAgICAgICAgICAgdGVsZWZvbmU6IGFsdW5vLnRlbGVmb25lLFxyXG4gICAgICAgICAgICAgICAgZW1haWw6IGFsdW5vLmVtYWlsLFxyXG4gICAgICAgICAgICAgICAgZW5kZXJlY286IGFsdW5vLmVuZGVyZWNvLFxyXG4gICAgICAgICAgICAgICAgbWF0cmljdWxhOiBhbHVuby5tYXRyaWN1bGFcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAxKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChlcnIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiYWx1bm9OYW9JbnNlcmlkb1wiLCBlcnIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hbGVydChcIkFsdW5vIGluc2VyaWRvIGNvbSBzdWNlc3NvIVwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH07XHJcblxyXG4gICAgcHJlZW5jaGFNb2RhbEVkaWNhbyhjb2RpZ29BbHVubykge1xyXG5cclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L2FkbWluaXN0cmFjYW8vJHtjb2RpZ29BbHVub31gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgaWYgKHJlc3Auc3RhdHVzICE9PSAyMDApIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiQWx1bm8gbsOjbyBlbmNvbnRyYWRvXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGFsdW5vID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIG5vbWU6IGRhdGEubm9tZSxcclxuICAgICAgICAgICAgICAgICAgICBjcGY6IGRhdGEuY3BmLFxyXG4gICAgICAgICAgICAgICAgICAgIHRlbGVmb25lOiBkYXRhLnRlbGVmb25lLFxyXG4gICAgICAgICAgICAgICAgICAgIGVtYWlsOiBkYXRhLmVtYWlsLFxyXG4gICAgICAgICAgICAgICAgICAgIGVuZGVyZWNvOiBkYXRhLmVuZGVyZWNvLFxyXG4gICAgICAgICAgICAgICAgICAgIG1hdHJpY3VsYTogZGF0YS5tYXRyaWN1bGFcclxuICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY3BmXVwiKS52YWx1ZSA9IGFsdW5vLmNwZjtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW25vbWVdXCIpLnZhbHVlID0gYWx1bm8ubm9tZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW3RlbGVmb25lXVwiKS52YWx1ZSA9IGFsdW5vLnRlbGVmb25lO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbZW1haWxdXCIpLnZhbHVlID0gYWx1bm8uZW1haWw7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjaWRhZGVdXCIpLnZhbHVlID0gYWx1bm8uZW5kZXJlY28uc2xpY2UoOCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltiYWlycm9dXCIpLnZhbHVlID0gYWx1bm8uZW5kZXJlY28uc2xpY2UoOCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltudW1lcm9dXCIpLnZhbHVlID0gYWx1bm8uZW5kZXJlY28uc2xpY2UoOCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjb21wbGVtZW50b11cIikudmFsdWUgPSBhbHVuby5lbmRlcmVjby5zbGljZSg4KTtcclxuXHJcbiAgICAgICAgICAgICAgICAkKCcjbW9kYWxDYWRhc3Ryb0FsdW5vJykubW9kYWwoJ3Nob3cnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoZS50YXJnZXQpLCAgICAgICAgXHJcbiAgICB9XHJcblxyXG4gICAgZWRpdGVBbHVubyhhbHVubywgaWQpIHtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIlBVVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvLyR7aWR9YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICAgICAgYm9keToge1xyXG4gICAgICAgICAgICAgICAgaWQ6IGFsdW5vLmlkLFxyXG4gICAgICAgICAgICAgICAgbm9tZTogYWx1bm8ubm9tZSxcclxuICAgICAgICAgICAgICAgIGNwZjogYWx1bm8uY3BmLFxyXG4gICAgICAgICAgICAgICAgdGVsZWZvbmU6IGFsdW5vLnRlbGVmb25lLFxyXG4gICAgICAgICAgICAgICAgZW1haWw6IGFsdW5vLmVtYWlsLFxyXG4gICAgICAgICAgICAgICAgZW5kZXJlY286IGFsdW5vLmVuZGVyZWNvLFxyXG4gICAgICAgICAgICAgICAgbWF0cmljdWxhOiBhbHVuby5tYXRyaWN1bGFcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAxKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChlcnIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiYWx1bm9OYW9JbnNlcmlkb1wiLCBlcnIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoXCJBbHVubyBlZGl0YWRvIGNvbSBzdWNlc3NvIVwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmRpc3Bvc2VNb2RhbCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGV4Y2x1YUFsdW5vKGlkQWx1bm8pIHtcclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L2FkbWluaXN0cmFjYW8vJHtpZEFsdW5vfWAsXHJcbiAgICAgICAgICAgIGNyb3NzRG9tYWluOiB0cnVlLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgcmVzcC5zZXRIZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbicsICcqJyk7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAxKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChlcnIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiYWx1bm9OYW9JbnNlcmlkb1wiLCBlcnIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoXCJBbHVubyBleGNsdcOtZG8gY29tIHN1Y2Vzc28hXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgfVxyXG5cclxuICAgIGRpc3Bvc2VNb2RhbCgpIHtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjcGZdXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltub21lXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbdGVsZWZvbmVdXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltlbWFpbF1cIikudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2NpZGFkZV1cIikudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JhaXJyb11cIikudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW251bWVyb11cIikudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2NvbXBsZW1lbnRvXVwiKS52YWx1ZSA9IFwiXCI7XHJcblxyXG4gICAgICAgICQoJyNtb2RhbENhZGFzdHJvQWx1bm8nKS5tb2RhbCgnaGlkZScpO1xyXG4gICAgfVxyXG5cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDYWRhc3Ryb0FsdW5vOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2xvZ2luLmpzXCIpO1xyXG5cclxuY2xhc3MgTG9naW4gZXh0ZW5kcyBBZ2VuZGEge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW3VzdWFyaW9dXCIpLmZvY3VzKCk7XHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmVudmllRm9ybXVsYXJpbygpO1xyXG4gICAgICAgIHRoaXMuZXNxdWVjZXVTZW5oYSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGVudmllRm9ybXVsYXJpbygpIHtcclxuICAgICAgICBjb25zdCBmb3JtID0gdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJmb3JtXCIpO1xyXG5cclxuICAgICAgICBmb3JtLmFkZEV2ZW50TGlzdGVuZXIoXCJzdWJtaXRcIiwgKGUpID0+IHtcclxuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBjb25zdCB1c3VhcmlvID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIlt1c3VhcmlvXVwiKTtcclxuICAgICAgICAgICAgY29uc3Qgc2VuaGEgPSBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW3NlbmhhXVwiKTtcclxuICAgICAgICAgICAgdGhpcy5hdXRlbnRpcXVlVXN1YXJpbyh1c3VhcmlvLCBzZW5oYSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgYXV0ZW50aXF1ZVVzdWFyaW8odXN1YXJpbywgc2VuaGEpIHtcclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9Mb2dpbmAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgIGJvZHk6IHtcclxuICAgICAgICAgICAgICAgIGxvZ2luOiB1c3VhcmlvLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgc2VuaGE6IHNlbmhhLnZhbHVlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG5cclxuICAgICAgICAgICAgdGhpcy5sb2dhVXN1YXJpbyhyZXNwLCBlcnIsIGRhdGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGxvZ2FVc3VhcmlvKHJlc3AsIGVyciwgZGF0YSkge1xyXG5cclxuICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMCkge1xyXG4gICAgICAgICAgICB0aGlzLmVtaXQoXCJlcnJvclwiLCBlcnIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHsgICAgICAgICAgICBcclxuXHJcbiAgICAgICAgICAgIGlmIChkYXRhLmFkbWluKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJsb2dpbkFkbWluXCIsIGRhdGEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwibG9naW5BbHVub1wiLCBkYXRhKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBlc3F1ZWNldVNlbmhhKCkge1xyXG4gICAgICAgIC8vY29kaWdvIHByYSBjaGFtYXIgZW0gVVJMXHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTG9naW47IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvbWVudS5qc1wiKTtcclxuY29uc3QgTXVsdGlmdW5jaW9uYWwgPSByZXF1aXJlKFwiLi9tdWx0aWZ1bmNpb25hbC5qc1wiKTtcclxuY29uc3QgTXVzY3VsYWNhbyA9IHJlcXVpcmUoXCIuL211c2N1bGFjYW8uanNcIik7XHJcblxyXG5jbGFzcyBNZW51IGV4dGVuZHMgQWdlbmRhIHtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgICAgIHRoaXMubXVzY3VsYWNhbyA9IG5ldyBNdXNjdWxhY2FvKGJvZHkpO1xyXG4gICAgICAgIHRoaXMubXVsdGlmdW5jaW9uYWwgPSBuZXcgTXVsdGlmdW5jaW9uYWwoYm9keSk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIHJlbmRlcihsb2dpbikge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIobG9naW4pO1xyXG4gICAgICAgIHRoaXMub2J0ZW5oYUNvZGlnb0FsdW5vKGxvZ2luKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmJvdGFvTXVzY3VsYWNhbygpO1xyXG4gICAgICAgIHRoaXMuYm90YW9NdWx0aWZ1bmNpb25hbCgpO1xyXG4gICAgICAgIHRoaXMubG9nb3V0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgbG9nb3V0KCkge1xyXG5cclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb3NodXRkb3duXVwiKS5vbmNsaWNrID0gKCkgPT4gZG9jdW1lbnQubG9jYXRpb24ucmVsb2FkKHRydWUpO1xyXG4gICAgICAgIGRlYnVnZ2VyO1xyXG4gICAgfVxyXG5cclxuICAgIG9idGVuaGFDb2RpZ29BbHVubyhsb2dpbikge1xyXG5cclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L21lbnUvJHtsb2dpbn1gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgaWYgKHJlc3Auc3RhdHVzICE9PSAyMDApIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiQWx1bm8gbsOjbyBlbmNvbnRyYWRvXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2RpZ29BbHVubyA9IGRhdGEuaWQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBib3Rhb011c2N1bGFjYW8oKSB7XHJcbiAgICAgICAgY29uc3QgZGF0YSA9IHtcclxuICAgICAgICAgICAgaWRBbHVubzogdGhpcy5jb2RpZ29BbHVubyxcclxuICAgICAgICAgICAgc2FsYTogXCJtdXNjdWxhY2FvXCJcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb011c2N1bGFjYW9dXCIpLm9uY2xpY2sgPSAoKSA9PiB0aGlzLm11c2N1bGFjYW8ucmVuZGVyKGRhdGEpO1xyXG4gICAgfVxyXG5cclxuICAgIGJvdGFvTXVsdGlmdW5jaW9uYWwoKSB7XHJcbiAgICAgICAgY29uc3QgZGF0YSA9IHtcclxuICAgICAgICAgICAgaWRBbHVubzogdGhpcy5jb2RpZ29BbHVubyxcclxuICAgICAgICAgICAgc2FsYTogXCJtdWx0aWZ1bmNpb25hbFwiXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9NdWx0aWZ1bmNpb25hbF1cIikub25jbGljayA9ICgpID0+IHRoaXMubXVsdGlmdW5jaW9uYWwucmVuZGVyKGRhdGEpO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE1lbnU7IiwiY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL211bHRpZnVuY2lvbmFsLmpzXCIpO1xyXG5jb25zdCBTYWxhID0gcmVxdWlyZShcIi4vc2FsYS5qc1wiKTtcclxuXHJcbmNsYXNzIE11bHRpZnVuY2lvbmFsIGV4dGVuZHMgU2FsYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihkYXRhKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMub2J0ZW5oYUhvcmFyaW9zQWx1bm9zKGRhdGEpO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IE11bHRpZnVuY2lvbmFsOyIsImNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9tdXNjdWxhY2FvLmpzXCIpO1xyXG5jb25zdCBTYWxhID0gcmVxdWlyZShcIi4vc2FsYS5qc1wiKTtcclxuXHJcbmNsYXNzIE11c2N1bGFjYW8gZXh0ZW5kcyBTYWxhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKGRhdGEpIHtcclxuICAgICAgICB0aGlzLm9idGVuaGFIb3Jhcmlvc0FsdW5vcyhkYXRhKTtcclxuICAgICAgICB0aGlzLmJvZHkuaW5uZXJIVE1MID0gVGVtcGxhdGUucmVuZGVyKCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIG9idGVuaGFIb3Jhcmlvc0FsdW5vcyhkYXRhKSB7XHJcblxyXG4gICAgICAgIGRlYnVnZ2VyO1xyXG5cclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L3NhbGEvJHtkYXRhLmlkQWx1bm99LyR7ZGF0YS5zYWxhfWAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWVcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJlcnJvclwiLCBcIm7Do28gZm9pIHBvc3PDrXZlbCBjYXJyZWdhciBvcyBhbHVub3NcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkuaW5uZXJIVE1MID0gVGVtcGxhdGUucmVuZGVyKGRhdGEuaG9yYXJpb3MpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTXVzY3VsYWNhbzsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IE1lbnUgPSByZXF1aXJlKFwiLi9tZW51LmpzXCIpO1xyXG5cclxuY2xhc3MgU2FsYSBleHRlbmRzIEFnZW5kYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgfSAgICBcclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMuY29uZmlybWFySG9yYXJpbygpO1xyXG4gICAgfVxyXG5cclxuICAgIG9idGVuaGFIb3Jhcmlvc0FsdW5vcyhkYXRhKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9zYWxhLyR7ZGF0YS5pZEFsdW5vfS8ke2RhdGEuc2FsYX1gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHsgICAgICAgICAgICBcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChkYXRhLmhvcmFyaW9zKSB7ICAgICAgICAgICAgICAgIFxyXG5cclxuICAgICAgICAgICAgICAgIHZhciBkcm9wRG93bkhvcmFyaW9zID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3JBbGwoXCJbc2VsZWNhb0hvcmFyaW9dXCIpKTtcclxuXHJcbiAgICAgICAgICAgICAgICBmb3IobGV0IGluZGV4OyBpbmRleCA8IGRyb3BEb3duSG9yYXJpb3MubGVuZ3RoOyBpbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZHJvcERvd25Ib3Jhcmlvc1tpbmRleF0udmFsdWUgPSBkYXRhLmhvcmFyaW9zW2luZGV4XS5mYWl4YUhvcmFyaW87XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25maXJtYXJIb3JhcmlvKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFsnYm90YW9DYW5jZWxhciddKS5vbmNsaWNrID0gaW5zaXJlT3VBdHVhbGl6ZUhvcmFyaW8oKTsgICAgICAgIFxyXG4gICAgfVxyXG5cclxuICAgIGluc2lyZU91QXR1YWxpemVIb3JhcmlvKCkge1xyXG5cclxuICAgIH1cclxuXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU2FsYTsiLCJjb25zdCBNb2RhbENhZGFzdHJvQWx1bm8gPSByZXF1aXJlKFwiLi9jYWRhc3Ryb0FsdW5vLmpzXCIpO1xyXG5cclxuY29uc3QgcmVuZGVyR3JpZEFsdW5vcyA9IGFsdW5vcyA9PiB7XHJcbiAgICByZXR1cm4gYWx1bm9zLm1hcChhbHVubyA9PiB7XHJcblxyXG4gICAgICAgIGxldCBjb3JMaW5oYSA9IGFsdW5vLmlkICUgMiA9PT0gMCA/IFwiYmFjay1ncmlkcm93MVwiIDogXCJiYWNrLWdyaWRyb3cyXCI7XHJcblxyXG4gICAgICAgIHJldHVybiBgXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvdyAke2NvckxpbmhhfSB0ZXh0LWRhcmtcIj4gICAgICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgZm9ybS1jaGVja1wiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjbGFzcz1cImZvcm0tY2hlY2staW5wdXQgbXQtNFwiIGFsdW5vU2VsZWNpb25hZG8gY29kaWdvQWx1bm89JHthbHVuby5pZH0+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cInRleHQtY2VudGVyIG1iLTJcIj4ke2FsdW5vLm5vbWV9PC9sYWJlbD5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gXCI+XHJcbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0ZXh0LWNlbnRlciBtdC0zXCI+JHthbHVuby5jcGZ9PC9sYWJlbD5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gXCI+XHJcbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0ZXh0LWNlbnRlciBtdC0zXCI+JHthbHVuby5tYXRyaWN1bGF9PC9sYWJlbD5cclxuICAgICAgICAgICAgPC9kaXY+ICAgICAgICBcclxuICAgICAgICA8L2Rpdj5gXHJcbiAgICB9KS5qb2luKFwiXCIpO1xyXG59XHJcblxyXG5leHBvcnRzLnJlbmRlciA9IGFsdW5vcyA9PiB7XHJcbiAgICBcclxuICAgIHJldHVybiBgXHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImltZy1mbHVpZCB0ZXh0LXJpZ2h0IG1yLTUgbXQtNSB0ZXh0LXdoaXRlIGJvdGFvU2h1dGRvd25cIiBib3Rhb1NodXRkb3duPlxyXG4gICAgICAgIDxhIGhyZWY9XCIjXCI+PGltZyBzcmM9XCIuL2ltYWdlcy9zaHV0ZG93bi5wbmdcIiBhbHQ9XCJcIj48L2E+XHJcbiAgICAgICAgPHN0cm9uZyBjbGFzcz1cIm1yLTFcIj5TYWlyPC9zdHJvbmc+XHJcbiAgICA8L2Rpdj5cclxuICAgIFxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lclwiPlxyXG4gICAgICAgIDxkaXY+XHJcbiAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibG9naW4xMDAtZm9ybS10aXRsZSBwLWItNDMgcC0yIG10LTJcIj5cclxuICAgICAgICAgICAgICAgIMOBcmVhIEFkbWluaXN0cmF0aXZhXHJcbiAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXJcIj5cclxuICAgIFxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3cgIGJvcmRlciBib3JkZXItd2hpdGUgYmFjay1ncmlkIHRleHQtd2hpdGVcIj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbSB0ZXh0LWNlbnRlclwiPlxyXG4gICAgICAgICAgICAgICAgTm9tZVxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC1jZW50ZXJcIj5cclxuICAgICAgICAgICAgICAgIENQRlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC1jZW50ZXJcIj5cclxuICAgICAgICAgICAgICAgIE1hdHLDrWN1bGFcclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICR7cmVuZGVyR3JpZEFsdW5vcyhhbHVub3MpfVxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIGNvbC1zbSBtdC0zXCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjZW50ZXJlZFwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5IGJ0bi1kYXJrXCIgZGF0YS10b2dnbGU9XCJtb2RhbFwiIGRhdGEtdGFyZ2V0PVwiI21vZGFsQ2FkYXN0cm9BbHVub1wiIGJvdGFvQWRpY2lvbmFyPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBBZGljaW9uYXJcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLWRhcmtcIiBib3Rhb0VkaXRhcj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgRWRpdGFyXHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrXCIgYm90YW9FeGNsdWlyPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBFeGNsdWlyXHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICR7TW9kYWxDYWRhc3Ryb0FsdW5vLnJlbmRlcigpfVxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+ICAgIFxyXG4gICAgYDsgXHJcbn0iLCJcclxuY29uc3QgaW5wdXRFbmRlcmVjbyA9IGBcclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJjaWRhZGVcIj5DaWRhZGU8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdHlwZT1cInRleHRcIiByZXF1aXJlZCBjaWRhZGUvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJiYWlycm9cIj5CYWlycm88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdHlwZT1cInRleHRcIiByZXF1aXJlZCBiYWlycm8vPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJudW1lcm9cIj5Ow7ptZXJvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQgbnVtZXJvLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY29tcGxlbWVudG9cIj5Db21wbGVtZW50bzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiB0eXBlPVwidGV4dFwiIGNvbXBsZW1lbnRvLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG5gO1xyXG5cclxuY29uc3QgbW9kYWxDYWRhc3Ryb0FsdW5vID0gYFxyXG48ZGl2IGNsYXNzPVwibW9kYWwgZmFkZVwiIGlkPVwibW9kYWxDYWRhc3Ryb0FsdW5vXCIgdGFiaW5kZXg9XCItMVwiIHJvbGU9XCJkaWFsb2dcIiBhcmlhLWxhYmVsbGVkYnk9XCJ0aXR1bG9Nb2RhbFwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiIG1vZGFsPlxyXG4gICAgPGRpdiBjbGFzcz1cIm1vZGFsLWRpYWxvZyBtb2RhbC1kaWFsb2ctY2VudGVyZWRcIiByb2xlPVwiZG9jdW1lbnRcIiA+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWNvbnRlbnRcIj5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1oZWFkZXJcIj5cclxuICAgICAgICAgICAgICAgIDxoNSBjbGFzcz1cIm1vZGFsLXRpdGxlXCIgaWQ9XCJ0aXR1bG9Nb2RhbFwiPkFkaWNpb25hciBOb3ZvIEFsdW5vPC9oNT5cclxuICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiY2xvc2VcIiBkYXRhLWRpc21pc3M9XCJtb2RhbFwiIGFyaWEtbGFiZWw9XCJGZWNoYXJcIj5cclxuICAgICAgICAgICAgICAgICAgICA8c3BhbiBhcmlhLWhpZGRlbj1cInRydWVcIj4mdGltZXM7PC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgPGZvcm0+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtYm9keVwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsPk5vbWUgQ29tcGxldG88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrIGNvbC1zbVwiIG5vbWU+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIiBpZD1cImluY2x1ZGVfZGF0ZVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsPkRhdGEgZGUgTmFzY2ltZW50bzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmsgY29sLXNtXCIgZGF0YU5hc2NpbWVudG8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY3BmXCI+Q1BGPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBpZD1cImNwZlwiIHR5cGU9XCJ0ZXh0XCIgYXV0b2NvbXBsZXRlPVwib2ZmXCIgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiBjcGY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJ0ZWxcIj5UZWxlZm9uZTwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgaWQ9XCJ0ZWxcIiB0eXBlPVwidGV4dFwiIGF1dG9jb21wbGV0ZT1cIm9mZlwiIGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdGVsZWZvbmU+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiZW1haWxcIj5FLW1haWw8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGlkPVwiZW1haWxcIiB0eXBlPVwidGV4dFwiIGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgZW1haWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PiAgICAgICAgICAgICAgICAgICAgXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICR7aW5wdXRFbmRlcmVjb31cclxuXHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1mb290ZXJcIj5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tc2Vjb25kYXJ5XCIgZGF0YS1kaXNtaXNzPVwibW9kYWxcIj5GZWNoYXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiIGJvdGFvU2FsdmFyPlNhbHZhcjwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvZm9ybT5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuYDtcclxuXHJcblxyXG5leHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBtb2RhbENhZGFzdHJvQWx1bm87XHJcbn1cclxuIiwiY29uc3QgZHJvcERvd25Ib3JhcmlvID0gYFxyXG48ZGl2IGNsYXNzPVwiZm9ybS1ncm91cCBjb2wtc20gXCI+XHJcbiAgICA8bGFiZWwgZm9yPVwic2VsZWN0LWhvdXJcIj5TZWxlY2lvbmUgbyBob3LDoXJpbzwvbGFiZWw+XHJcbiAgICA8c2VsZWN0IGNsYXNzPVwiZm9ybS1jb250cm9sIFwiIHNlbGVjYW9Ib3JhcmlvPlxyXG4gICAgICAgIDxvcHRpb24+MDc6MDAgLSAwNzozMDwvb3B0aW9uPiAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICA8b3B0aW9uPjA3OjQwIC0gMDg6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjA4OjIwIC0gMDg6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjA5OjAwIC0gMDk6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjA5OjQwIC0gMTA6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjEwOjIwIC0gMTA6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjExOjAwIC0gMTE6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjExOjQwIC0gMTI6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjEyOjIwIC0gMTI6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjEzOjAwIC0gMTM6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjEzOjQwIC0gMTQ6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE0OjIwIC0gMTQ6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE1OjAwIC0gMTU6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE1OjQwIC0gMTY6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE2OjIwIC0gMTY6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE3OjAwIC0gMTc6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE3OjQwIC0gMTg6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE4OjIwIC0gMTg6NTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE5OjAwIC0gMTk6MzA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjE5OjQwIC0gMjA6MTA8L29wdGlvbj5cclxuICAgICAgICA8b3B0aW9uPjIwOjIwIC0gMjA6NTA8L29wdGlvbj5cclxuICAgIDwvc2VsZWN0PlxyXG48L2Rpdj5cclxuYDtcclxuXHJcblxyXG5leHBvcnRzLnJlbmRlciA9IGhvcmFyaW9zID0+IHtcclxuICAgIHJldHVybiBgXHJcbiAgICA8IS0tY2FiZcOnYWxoby0tPiBcclxuPGRpdiBjbGFzcz1cImNvbnRhaW5lciAgYm9yZGVyIGJvcmRlci1kYXJrICBtdC01IGNvbC02XCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwicm93IFwiPlxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIHRleHQteGwtY2VudGVyIGJhY2stZ3JpZCB0ZXh0LXdoaXRlXCI+XHJcbiAgICAgICAgICAgIFNlbGVjaW9uZSB1bSBob3LDoXJpbyBwYXJhIGNhZGEgZGlhIGRhIHNlbWFuYTpcclxuICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcbjwhLS1zZWd1bmRhLS0+XHJcbjxkaXYgY2xhc3M9XCJtYi0zXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cxIHRleHQtZGFyayBjb2wtNlwiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3cgXCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIG10LTRcIj5cclxuICAgICAgICAgICAgICAgIFNlZ3VuZGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPCEtLXRlcsOnYS0tPlxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lciBjb2wtNiBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MiB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICBUZXLDp2EtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPCEtLXF1YXJ0YS0tPlxyXG4gICAgPGRpdiBjbGFzcz1cImNvbC02IGNvbnRhaW5lciBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MSB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICBRdWFydGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAke2Ryb3BEb3duSG9yYXJpb31cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuXHJcbiAgICA8IS0tUXVpbnRhLS0+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY29sLTYgY29udGFpbmVyIGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cyIHRleHQtZGFya1wiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgIFF1aW50YS1mZWlyYTpcclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAke2Ryb3BEb3duSG9yYXJpb31cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuXHJcbiAgICA8IS0tU2V4dGEtLT5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2wtNiBjb250YWluZXIgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzEgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgU2V4dGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPCEtLVPDoWJhZG8tLT5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2wtNiBjb250YWluZXIgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzIgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC02XCI+XHJcbiAgICAgICAgICAgICAgICBTw6FiYWRvOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuXHJcblxyXG48ZGl2IGNsYXNzPVwiIGNvbnRhaW5lciBjb2wtc21cIj5cclxuICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiY2VudGVyZWRcIj5cclxuXHJcbiAgICAgICAgICAgIDxidXR0b24gdHlwZT1cInN1Ym1pdFwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrXCIgYm90YW9Db25maXJtYXI+XHJcbiAgICAgICAgICAgICAgICBDb25maXJtYXJcclxuICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLWRhcmsgbWwtNVwiIGJvdGFvQ2FuY2VsYXI+XHJcbiAgICAgICAgICAgICAgICBDYW5jZWxhclxyXG4gICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5cclxuPHAgY2xhc3M9XCJ0ZXh0LWNlbnRlciB0ZXh0LXdoaXRlIGZvbnQtaXRhbGljIHAtM1wiPioqQ2FzbyBhbGd1bSBob3LDoXJpbyBhdGluamEgYSBsb3Rhw6fDo28gbcOheGltYSBkZSBhbHVub3MsIG8gPGJyPiBob3LDoXJpbyBmaWNhcsOhIGVtIHZlcm1lbGhvIGUgbsOjbyBwb2RlcsOhIHNlciBzZWxlY2lvbmFkby48L3A+XHJcblxyXG4gICAgYFxyXG59IiwiZXhwb3J0cy5yZW5kZXIgPSAoKSA9PiB7XHJcbiAgICByZXR1cm4gYCA8Ym9keT5cclxuICAgIDxsYWJlbCBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtdC04MFwiPkFjZXNzbyBkYSBDb250YTwvbGFiZWw+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY2FyZFwiIGlkPVwidGVsYUxvZ2luXCI+ICAgICAgIFxyXG4gICAgICAgIDxtYWluPiAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjYXJkLWJvZHlcIj5cclxuICAgICAgICAgICAgICAgIDxmb3JtPlxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwIHJzMSB2YWxpZGF0ZS1pbnB1dFwiIGRhdGEtdmFsaWRhdGU9XCJDYW1wbyBvYnJpZ2F0w7NyaW9cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJmb3JtLWNvbnRyb2xcIiBpZD1cIlwiIHBsYWNlaG9sZGVyPVwiVXN1w6FyaW9cIiB1c3VhcmlvPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgcnMyIHZhbGlkYXRlLWlucHV0XCIgZGF0YS12YWxpZGF0ZT1cIkNhbXBvIG9icmlnYXTDs3Jpb1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInBhc3N3b3JkXCIgY2xhc3M9XCJmb3JtLWNvbnRyb2xcIiBpZD1cIlwiIHBsYWNlaG9sZGVyPVwiU2VuaGFcIiBzZW5oYT5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwic3VibWl0XCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnkgYnRuIGJ0bi1vdXRsaW5lLWRhcmsgYnRuLWxnIGJ0bi1ibG9ja1wiIGJvdGFvTG9naW4+RW50cmFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRleHQtY2VudGVyIHctZnVsbCBwLXQtMjNcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGEgaHJlZj1cIiNcIiBjbGFzcz1cInRleHQtc2Vjb25kYXJ5XCI+XHJcblx0XHQgICAgXHRcdFx0XHRcdEVzcXVlY2V1IGEgU2VuaGE/IEVudHJlIGVtIENvbnRhdG8gQ29ub3NjbyBDbGljYW5kbyBBcXVpLlxyXG5cdFx0ICAgIFx0XHRcdFx0PC9hPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPC9mb3JtPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L21haW4+XHJcbiAgICAgICAgPGZvb3Rlcj48L2Zvb3Rlcj5cclxuICAgIDwvZGl2PlxyXG48L2JvZHk+XHJcbjxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9jb2RlLmpxdWVyeS5jb20vanF1ZXJ5LTMuMy4xLnNsaW0ubWluLmpzXCIgaW50ZWdyaXR5PVwic2hhMzg0LXE4aS9YKzk2NUR6TzByVDdhYks0MUpTdFFJQXFWZ1JWenBiem81c21YS3A0WWZSdkgrOGFidFRFMVBpNmppem9cIiBjcm9zc29yaWdpbj1cImFub255bW91c1wiPjwvc2NyaXB0PlxyXG48c2NyaXB0IHNyYz1cImh0dHBzOi8vY2RuanMuY2xvdWRmbGFyZS5jb20vYWpheC9saWJzL3BvcHBlci5qcy8xLjE0LjcvdW1kL3BvcHBlci5taW4uanNcIiBpbnRlZ3JpdHk9XCJzaGEzODQtVU8yZVQwQ3BIcWRTSlE2aEp0eTVLVnBodFBoeldqOVdPMWNsSFRNR2EzSkRad3JuUXE0c0Y4NmRJSE5EejBXMVwiIGNyb3Nzb3JpZ2luPVwiYW5vbnltb3VzXCI+PC9zY3JpcHQ+XHJcbjxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9zdGFja3BhdGguYm9vdHN0cmFwY2RuLmNvbS9ib290c3RyYXAvNC4zLjEvanMvYm9vdHN0cmFwLm1pbi5qc1wiIGludGVncml0eT1cInNoYTM4NC1KalNtVmd5ZDBwM3BYQjFyUmliWlVBWW9JSXk2T3JRNlZyaklFYUZmL25KR3pJeEZEc2Y0eDB4SU0rQjA3alJNXCIgY3Jvc3NvcmlnaW49XCJhbm9ueW1vdXNcIj48L3NjcmlwdD5gO1xyXG59IiwiZXhwb3J0cy5yZW5kZXIgPSBsb2dpbiA9PiB7XHJcbiAgICByZXR1cm4gYFxyXG5cclxuICAgIDxkaXYgY3BmQWx1bm89JHtsb2dpbn0+PC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwibGltaXRlclwiPlxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiaW1nLWZsdWlkIHRleHQtcmlnaHQgbXItNSBtdC01IHRleHQtd2hpdGUgYm90YW9TaHV0ZG93blwiIGJvdGFvU2h1dGRvd24+XHJcbiAgICAgICAgICAgIDxhIGhyZWY9XCIjXCI+PGltZyBzcmM9XCIuL2ltYWdlcy9zaHV0ZG93bi5wbmdcIiBhbHQ9XCJcIj48L2E+XHJcbiAgICAgICAgICAgIDxzdHJvbmcgY2xhc3M9XCJtci0xXCI+U2Fpcjwvc3Ryb25nPlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1sb2dpbjEwMFwiPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwid3JhcC1sb2dpbjEwMCBwLWItMTYwIHAtdC01MFwiPlxyXG5cclxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibG9naW4xMDAtZm9ybS10aXRsZSBwLWItNDNcIj5cclxuICAgICAgICAgICAgICAgICAgICBTZWxlY2lvbmUgdW1hIHNhbGEgcGFyYSBmYXplciBhIG1hcmNhw6fDo28gZGFzIGF1bGFzXHJcbiAgICAgICAgICAgICAgICA8L3NwYW4+XHJcblxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gY2xhc3M9XCJtZW51MTAwLWZvcm0tYnRuMlwiIGJvdGFvTXVzY3VsYWNhbz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIE11c2N1bGHDp8OjbyAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cIm1lbnUxMDAtZm9ybS1idG4xXCIgYm90YW9NdWx0aWZ1bmNpb25hbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgTXVsdGlmdW5jaW9uYWxcclxuICAgICAgICAgICAgICAgICAgICA8L2E+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuYDtcclxufSIsImNvbnN0IEdyaWRNYXJjYWNhbyA9IHJlcXVpcmUoJy4vZ3JpZE1hcmNhY2FvLmpzJyk7XHJcblxyXG5leHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBgXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIFwiPlxyXG4gICAgPGRpdj5cclxuICAgICAgICA8c3BhbiBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtMlwiPlxyXG4gICAgICAgICAgICBTYWxhIE11bHRpZnVuY2lvbmFsICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICA8L3NwYW4+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcblxyXG4ke0dyaWRNYXJjYWNhby5yZW5kZXIoKX1cclxuXHJcbmA7XHJcbn0iLCJjb25zdCBHcmlkTWFyY2FjYW8gPSByZXF1aXJlKCcuL2dyaWRNYXJjYWNhby5qcycpO1xyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSBob3JhcmlvcyA9PiB7XHJcbiAgICByZXR1cm4gYFxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lciBcIj5cclxuICAgIDxkaXY+XHJcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLTJcIj5cclxuICAgICAgICAgICAgU2FsYSBNdXNjdWxhY2FvICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICA8L3NwYW4+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcblxyXG4ke0dyaWRNYXJjYWNhby5yZW5kZXIoaG9yYXJpb3MpfVxyXG5cclxuYDtcclxufSIsImNvbnN0IEFwcCA9IHJlcXVpcmUoXCIuL2FwcC5qc1wiKTtcclxuXHJcbndpbmRvdy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICBjb25zdCBtYWluID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIm1haW5cIik7XHJcbiAgICBuZXcgQXBwKG1haW4pLmluaXQoKTtcclxufSJdfQ==


>>>>>>> f54b17c7ae4f11eae9f8cbda808a53da1b4d985b
