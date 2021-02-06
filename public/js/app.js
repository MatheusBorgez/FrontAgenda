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

        const opts = {
            method: "POST",
            url: `${this.URL}/sala`,
            json: true,
            body: {
                horarios: [{
                    faixaHorario: dropDownHorarios[0].value,
                    idAluno: login.idAluno,
                    diaSemana: "segunda",
                    sala: login.sala
                }, {
                    faixaHorario: dropDownHorarios[1].value,
                    idAluno: login.idAluno,
                    diaSemana: "terca",
                    sala: login.sala
                }, {
                    faixaHorario: dropDownHorarios[2].value,
                    idAluno: login.idAluno,
                    diaSemana: "quarta",
                    sala: login.sala
                }, {
                    faixaHorario: dropDownHorarios[3].value,
                    idAluno: login.idAluno,
                    diaSemana: "quinta",
                    sala: login.sala
                }, {
                    faixaHorario: dropDownHorarios[4].value,
                    idAluno: login.idAluno,
                    diaSemana: "sexta",
                    sala: login.sala
                }, {
                    faixaHorario: dropDownHorarios[5].value,
                    idAluno: login.idAluno,
                    diaSemana: "sabado",
                    sala: login.sala
                }]
            }
        };

        debugger;

        this.request(opts, (err, resp, data) => {
            if (resp.status !== 201) {
                this.emit("alunoNaoInserido", err);
            } else {
                this.alert("Horario inserido com sucesso!");
            }
        });
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

            <div class="col-sm mt-4">
                Segunda-feira:
            </div>
            
            ${dropDownHorario}
            
        </div>
    </div>
    
    <div class="container col-6 border border-dark back-gridrow2 text-dark">
        <div class="row">

            <div class="col-sm">
                Terça-feira:
            </div>

            ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow1 text-dark">
        <div class="row">

            <div class="col-sm">
                Quarta-feira:
            </div>

           ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow2 text-dark">
        <div class="row">

            <div class="col-sm">
                Quinta-feira:
            </div>

            ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow1 text-dark">
        <div class="row">

            <div class="col-sm">
                Sexta-feira:
            </div>
            
            ${dropDownHorario}

        </div>
    </div>

    <div class="col-6 container border border-dark back-gridrow2 text-dark">
        <div class="row">

            <div class="col-6">
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXF1ZXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RpbnktZW1pdHRlci9pbmRleC5qcyIsInNyYy9hcHAuanMiLCJzcmMvY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzIiwic3JjL2NvbXBvbmVudHMvYWdlbmRhLmpzIiwic3JjL2NvbXBvbmVudHMvY2FkYXN0cm9BbHVuby5qcyIsInNyYy9jb21wb25lbnRzL2xvZ2luLmpzIiwic3JjL2NvbXBvbmVudHMvbWVudS5qcyIsInNyYy9jb21wb25lbnRzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL2NvbXBvbmVudHMvbXVzY3VsYWNhby5qcyIsInNyYy9jb21wb25lbnRzL3NhbGEuanMiLCJzcmMvdGVtcGxhdGVzL2FkbWluaXN0cmFjYW8uanMiLCJzcmMvdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanMiLCJzcmMvdGVtcGxhdGVzL2dyaWRNYXJjYWNhby5qcyIsInNyYy90ZW1wbGF0ZXMvbG9naW4uanMiLCJzcmMvdGVtcGxhdGVzL21lbnUuanMiLCJzcmMvdGVtcGxhdGVzL211bHRpZnVuY2lvbmFsLmpzIiwic3JjL3RlbXBsYXRlcy9tdXNjdWxhY2FvLmpzIiwiaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkVBLE1BQU0sUUFBUSxRQUFRLHVCQUFSLENBQWQ7QUFDQSxNQUFNLGdCQUFnQixRQUFRLCtCQUFSLENBQXRCO0FBQ0EsTUFBTSxPQUFPLFFBQVEsc0JBQVIsQ0FBYjtBQUNBLE1BQU0sYUFBYSxRQUFRLDRCQUFSLENBQW5CO0FBQ0EsTUFBTSxp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Ozs7Ozs7Ozs7Ozs7O0NBRHRCO0FBMkJILENBNUJEOzs7QUNBQSxNQUFNLGVBQWUsUUFBUSxtQkFBUixDQUFyQjs7QUFFQSxRQUFRLE1BQVIsR0FBaUIsTUFBTTtBQUNuQixXQUFROzs7Ozs7Ozs7RUFTVixhQUFhLE1BQWIsRUFBc0I7O0NBVHBCO0FBWUgsQ0FiRDs7O0FDRkEsTUFBTSxlQUFlLFFBQVEsbUJBQVIsQ0FBckI7O0FBRUEsUUFBUSxNQUFSLEdBQWlCLFlBQVk7QUFDekIsV0FBUTs7Ozs7Ozs7O0VBU1YsYUFBYSxNQUFiLENBQW9CLFFBQXBCLENBQThCOztDQVQ1QjtBQVlILENBYkQ7OztBQ0ZBLE1BQU0sTUFBTSxRQUFRLFVBQVIsQ0FBWjs7QUFFQSxPQUFPLE1BQVAsR0FBZ0IsTUFBTTtBQUNsQixVQUFNLE9BQU8sU0FBUyxhQUFULENBQXVCLE1BQXZCLENBQWI7QUFDQSxRQUFJLEdBQUosQ0FBUSxJQUFSLEVBQWMsSUFBZDtBQUNILENBSEQiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvLyBCcm93c2VyIFJlcXVlc3RcclxuLy9cclxuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcclxuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxyXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcclxuLy9cclxuLy8gICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxyXG4vL1xyXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXHJcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcclxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXHJcbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcclxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXHJcblxyXG4vLyBVTUQgSEVBREVSIFNUQVJUIFxyXG4oZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcclxuICAgIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcclxuICAgICAgICAvLyBBTUQuIFJlZ2lzdGVyIGFzIGFuIGFub255bW91cyBtb2R1bGUuXHJcbiAgICAgICAgZGVmaW5lKFtdLCBmYWN0b3J5KTtcclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgLy8gTm9kZS4gRG9lcyBub3Qgd29yayB3aXRoIHN0cmljdCBDb21tb25KUywgYnV0XHJcbiAgICAgICAgLy8gb25seSBDb21tb25KUy1saWtlIGVudmlyb21lbnRzIHRoYXQgc3VwcG9ydCBtb2R1bGUuZXhwb3J0cyxcclxuICAgICAgICAvLyBsaWtlIE5vZGUuXHJcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIEJyb3dzZXIgZ2xvYmFscyAocm9vdCBpcyB3aW5kb3cpXHJcbiAgICAgICAgcm9vdC5yZXR1cm5FeHBvcnRzID0gZmFjdG9yeSgpO1xyXG4gIH1cclxufSh0aGlzLCBmdW5jdGlvbiAoKSB7XHJcbi8vIFVNRCBIRUFERVIgRU5EXHJcblxyXG52YXIgWEhSID0gWE1MSHR0cFJlcXVlc3RcclxuaWYgKCFYSFIpIHRocm93IG5ldyBFcnJvcignbWlzc2luZyBYTUxIdHRwUmVxdWVzdCcpXHJcbnJlcXVlc3QubG9nID0ge1xyXG4gICd0cmFjZSc6IG5vb3AsICdkZWJ1Zyc6IG5vb3AsICdpbmZvJzogbm9vcCwgJ3dhcm4nOiBub29wLCAnZXJyb3InOiBub29wXHJcbn1cclxuXHJcbnZhciBERUZBVUxUX1RJTUVPVVQgPSAzICogNjAgKiAxMDAwIC8vIDMgbWludXRlc1xyXG5cclxuLy9cclxuLy8gcmVxdWVzdFxyXG4vL1xyXG5cclxuZnVuY3Rpb24gcmVxdWVzdChvcHRpb25zLCBjYWxsYmFjaykge1xyXG4gIC8vIFRoZSBlbnRyeS1wb2ludCB0byB0aGUgQVBJOiBwcmVwIHRoZSBvcHRpb25zIG9iamVjdCBhbmQgcGFzcyB0aGUgcmVhbCB3b3JrIHRvIHJ1bl94aHIuXHJcbiAgaWYodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdCYWQgY2FsbGJhY2sgZ2l2ZW46ICcgKyBjYWxsYmFjaylcclxuXHJcbiAgaWYoIW9wdGlvbnMpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIG9wdGlvbnMgZ2l2ZW4nKVxyXG5cclxuICB2YXIgb3B0aW9uc19vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlOyAvLyBTYXZlIHRoaXMgZm9yIGxhdGVyLlxyXG5cclxuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXHJcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9O1xyXG4gIGVsc2VcclxuICAgIG9wdGlvbnMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdGlvbnMpKTsgLy8gVXNlIGEgZHVwbGljYXRlIGZvciBtdXRhdGluZy5cclxuXHJcbiAgb3B0aW9ucy5vblJlc3BvbnNlID0gb3B0aW9uc19vblJlc3BvbnNlIC8vIEFuZCBwdXQgaXQgYmFjay5cclxuXHJcbiAgaWYgKG9wdGlvbnMudmVyYm9zZSkgcmVxdWVzdC5sb2cgPSBnZXRMb2dnZXIoKTtcclxuXHJcbiAgaWYob3B0aW9ucy51cmwpIHtcclxuICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmw7XHJcbiAgICBkZWxldGUgb3B0aW9ucy51cmw7XHJcbiAgfVxyXG5cclxuICBpZighb3B0aW9ucy51cmkgJiYgb3B0aW9ucy51cmkgIT09IFwiXCIpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLnVyaSBpcyBhIHJlcXVpcmVkIGFyZ3VtZW50XCIpO1xyXG5cclxuICBpZih0eXBlb2Ygb3B0aW9ucy51cmkgIT0gXCJzdHJpbmdcIilcclxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIG11c3QgYmUgYSBzdHJpbmdcIik7XHJcblxyXG4gIHZhciB1bnN1cHBvcnRlZF9vcHRpb25zID0gWydwcm94eScsICdfcmVkaXJlY3RzRm9sbG93ZWQnLCAnbWF4UmVkaXJlY3RzJywgJ2ZvbGxvd1JlZGlyZWN0J11cclxuICBmb3IgKHZhciBpID0gMDsgaSA8IHVuc3VwcG9ydGVkX29wdGlvbnMubGVuZ3RoOyBpKyspXHJcbiAgICBpZihvcHRpb25zWyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldIF0pXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMuXCIgKyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldICsgXCIgaXMgbm90IHN1cHBvcnRlZFwiKVxyXG5cclxuICBvcHRpb25zLmNhbGxiYWNrID0gY2FsbGJhY2tcclxuICBvcHRpb25zLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kIHx8ICdHRVQnO1xyXG4gIG9wdGlvbnMuaGVhZGVycyA9IG9wdGlvbnMuaGVhZGVycyB8fCB7fTtcclxuICBvcHRpb25zLmJvZHkgICAgPSBvcHRpb25zLmJvZHkgfHwgbnVsbFxyXG4gIG9wdGlvbnMudGltZW91dCA9IG9wdGlvbnMudGltZW91dCB8fCByZXF1ZXN0LkRFRkFVTFRfVElNRU9VVFxyXG5cclxuICBpZihvcHRpb25zLmhlYWRlcnMuaG9zdClcclxuICAgIHRocm93IG5ldyBFcnJvcihcIk9wdGlvbnMuaGVhZGVycy5ob3N0IGlzIG5vdCBzdXBwb3J0ZWRcIik7XHJcblxyXG4gIGlmKG9wdGlvbnMuanNvbikge1xyXG4gICAgb3B0aW9ucy5oZWFkZXJzLmFjY2VwdCA9IG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgfHwgJ2FwcGxpY2F0aW9uL2pzb24nXHJcbiAgICBpZihvcHRpb25zLm1ldGhvZCAhPT0gJ0dFVCcpXHJcbiAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSAnYXBwbGljYXRpb24vanNvbidcclxuXHJcbiAgICBpZih0eXBlb2Ygb3B0aW9ucy5qc29uICE9PSAnYm9vbGVhbicpXHJcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuanNvbilcclxuICAgIGVsc2UgaWYodHlwZW9mIG9wdGlvbnMuYm9keSAhPT0gJ3N0cmluZycpXHJcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuYm9keSlcclxuICB9XHJcbiAgXHJcbiAgLy9CRUdJTiBRUyBIYWNrXHJcbiAgdmFyIHNlcmlhbGl6ZSA9IGZ1bmN0aW9uKG9iaikge1xyXG4gICAgdmFyIHN0ciA9IFtdO1xyXG4gICAgZm9yKHZhciBwIGluIG9iailcclxuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xyXG4gICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xyXG4gICAgICB9XHJcbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xyXG4gIH1cclxuICBcclxuICBpZihvcHRpb25zLnFzKXtcclxuICAgIHZhciBxcyA9ICh0eXBlb2Ygb3B0aW9ucy5xcyA9PSAnc3RyaW5nJyk/IG9wdGlvbnMucXMgOiBzZXJpYWxpemUob3B0aW9ucy5xcyk7XHJcbiAgICBpZihvcHRpb25zLnVyaS5pbmRleE9mKCc/JykgIT09IC0xKXsgLy9ubyBnZXQgcGFyYW1zXHJcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnJicrcXM7XHJcbiAgICB9ZWxzZXsgLy9leGlzdGluZyBnZXQgcGFyYW1zXHJcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnPycrcXM7XHJcbiAgICB9XHJcbiAgfVxyXG4gIC8vRU5EIFFTIEhhY2tcclxuICBcclxuICAvL0JFR0lOIEZPUk0gSGFja1xyXG4gIHZhciBtdWx0aXBhcnQgPSBmdW5jdGlvbihvYmopIHtcclxuICAgIC8vdG9kbzogc3VwcG9ydCBmaWxlIHR5cGUgKHVzZWZ1bD8pXHJcbiAgICB2YXIgcmVzdWx0ID0ge307XHJcbiAgICByZXN1bHQuYm91bmRyeSA9ICctLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tJytNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqMTAwMDAwMDAwMCk7XHJcbiAgICB2YXIgbGluZXMgPSBbXTtcclxuICAgIGZvcih2YXIgcCBpbiBvYmope1xyXG4gICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcclxuICAgICAgICAgICAgbGluZXMucHVzaChcclxuICAgICAgICAgICAgICAgICctLScrcmVzdWx0LmJvdW5kcnkrXCJcXG5cIitcclxuICAgICAgICAgICAgICAgICdDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCInK3ArJ1wiJytcIlxcblwiK1xyXG4gICAgICAgICAgICAgICAgXCJcXG5cIitcclxuICAgICAgICAgICAgICAgIG9ialtwXStcIlxcblwiXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgbGluZXMucHVzaCggJy0tJytyZXN1bHQuYm91bmRyeSsnLS0nICk7XHJcbiAgICByZXN1bHQuYm9keSA9IGxpbmVzLmpvaW4oJycpO1xyXG4gICAgcmVzdWx0Lmxlbmd0aCA9IHJlc3VsdC5ib2R5Lmxlbmd0aDtcclxuICAgIHJlc3VsdC50eXBlID0gJ211bHRpcGFydC9mb3JtLWRhdGE7IGJvdW5kYXJ5PScrcmVzdWx0LmJvdW5kcnk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG4gIH1cclxuICBcclxuICBpZihvcHRpb25zLmZvcm0pe1xyXG4gICAgaWYodHlwZW9mIG9wdGlvbnMuZm9ybSA9PSAnc3RyaW5nJykgdGhyb3coJ2Zvcm0gbmFtZSB1bnN1cHBvcnRlZCcpO1xyXG4gICAgaWYob3B0aW9ucy5tZXRob2QgPT09ICdQT1NUJyl7XHJcbiAgICAgICAgdmFyIGVuY29kaW5nID0gKG9wdGlvbnMuZW5jb2RpbmcgfHwgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IGVuY29kaW5nO1xyXG4gICAgICAgIHN3aXRjaChlbmNvZGluZyl7XHJcbiAgICAgICAgICAgIGNhc2UgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmJvZHkgPSBzZXJpYWxpemUob3B0aW9ucy5mb3JtKS5yZXBsYWNlKC8lMjAvZywgXCIrXCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ211bHRpcGFydC9mb3JtLWRhdGEnOlxyXG4gICAgICAgICAgICAgICAgdmFyIG11bHRpID0gbXVsdGlwYXJ0KG9wdGlvbnMuZm9ybSk7XHJcbiAgICAgICAgICAgICAgICAvL29wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IG11bHRpLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IG11bHRpLmJvZHk7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gbXVsdGkudHlwZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0IDogdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBlbmNvZGluZzonK2VuY29kaW5nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG4gIC8vRU5EIEZPUk0gSGFja1xyXG5cclxuICAvLyBJZiBvblJlc3BvbnNlIGlzIGJvb2xlYW4gdHJ1ZSwgY2FsbCBiYWNrIGltbWVkaWF0ZWx5IHdoZW4gdGhlIHJlc3BvbnNlIGlzIGtub3duLFxyXG4gIC8vIG5vdCB3aGVuIHRoZSBmdWxsIHJlcXVlc3QgaXMgY29tcGxldGUuXHJcbiAgb3B0aW9ucy5vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlIHx8IG5vb3BcclxuICBpZihvcHRpb25zLm9uUmVzcG9uc2UgPT09IHRydWUpIHtcclxuICAgIG9wdGlvbnMub25SZXNwb25zZSA9IGNhbGxiYWNrXHJcbiAgICBvcHRpb25zLmNhbGxiYWNrID0gbm9vcFxyXG4gIH1cclxuXHJcbiAgLy8gWFhYIEJyb3dzZXJzIGRvIG5vdCBsaWtlIHRoaXMuXHJcbiAgLy9pZihvcHRpb25zLmJvZHkpXHJcbiAgLy8gIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IG9wdGlvbnMuYm9keS5sZW5ndGg7XHJcblxyXG4gIC8vIEhUVFAgYmFzaWMgYXV0aGVudGljYXRpb25cclxuICBpZighb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24gJiYgb3B0aW9ucy5hdXRoKVxyXG4gICAgb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24gPSAnQmFzaWMgJyArIGI2NF9lbmMob3B0aW9ucy5hdXRoLnVzZXJuYW1lICsgJzonICsgb3B0aW9ucy5hdXRoLnBhc3N3b3JkKTtcclxuXHJcbiAgcmV0dXJuIHJ1bl94aHIob3B0aW9ucylcclxufVxyXG5cclxudmFyIHJlcV9zZXEgPSAwXHJcbmZ1bmN0aW9uIHJ1bl94aHIob3B0aW9ucykge1xyXG4gIHZhciB4aHIgPSBuZXcgWEhSXHJcbiAgICAsIHRpbWVkX291dCA9IGZhbHNlXHJcbiAgICAsIGlzX2NvcnMgPSBpc19jcm9zc0RvbWFpbihvcHRpb25zLnVyaSlcclxuICAgICwgc3VwcG9ydHNfY29ycyA9ICgnd2l0aENyZWRlbnRpYWxzJyBpbiB4aHIpXHJcblxyXG4gIHJlcV9zZXEgKz0gMVxyXG4gIHhoci5zZXFfaWQgPSByZXFfc2VxXHJcbiAgeGhyLmlkID0gcmVxX3NlcSArICc6ICcgKyBvcHRpb25zLm1ldGhvZCArICcgJyArIG9wdGlvbnMudXJpXHJcbiAgeGhyLl9pZCA9IHhoci5pZCAvLyBJIGtub3cgSSB3aWxsIHR5cGUgXCJfaWRcIiBmcm9tIGhhYml0IGFsbCB0aGUgdGltZS5cclxuXHJcbiAgaWYoaXNfY29ycyAmJiAhc3VwcG9ydHNfY29ycykge1xyXG4gICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdCcm93c2VyIGRvZXMgbm90IHN1cHBvcnQgY3Jvc3Mtb3JpZ2luIHJlcXVlc3Q6ICcgKyBvcHRpb25zLnVyaSlcclxuICAgIGNvcnNfZXJyLmNvcnMgPSAndW5zdXBwb3J0ZWQnXHJcbiAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxyXG4gIH1cclxuXHJcbiAgeGhyLnRpbWVvdXRUaW1lciA9IHNldFRpbWVvdXQodG9vX2xhdGUsIG9wdGlvbnMudGltZW91dClcclxuICBmdW5jdGlvbiB0b29fbGF0ZSgpIHtcclxuICAgIHRpbWVkX291dCA9IHRydWVcclxuICAgIHZhciBlciA9IG5ldyBFcnJvcignRVRJTUVET1VUJylcclxuICAgIGVyLmNvZGUgPSAnRVRJTUVET1VUJ1xyXG4gICAgZXIuZHVyYXRpb24gPSBvcHRpb25zLnRpbWVvdXRcclxuXHJcbiAgICByZXF1ZXN0LmxvZy5lcnJvcignVGltZW91dCcsIHsgJ2lkJzp4aHIuX2lkLCAnbWlsbGlzZWNvbmRzJzpvcHRpb25zLnRpbWVvdXQgfSlcclxuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpXHJcbiAgfVxyXG5cclxuICAvLyBTb21lIHN0YXRlcyBjYW4gYmUgc2tpcHBlZCBvdmVyLCBzbyByZW1lbWJlciB3aGF0IGlzIHN0aWxsIGluY29tcGxldGUuXHJcbiAgdmFyIGRpZCA9IHsncmVzcG9uc2UnOmZhbHNlLCAnbG9hZGluZyc6ZmFsc2UsICdlbmQnOmZhbHNlfVxyXG5cclxuICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gb25fc3RhdGVfY2hhbmdlXHJcbiAgeGhyLm9wZW4ob3B0aW9ucy5tZXRob2QsIG9wdGlvbnMudXJpLCB0cnVlKSAvLyBhc3luY2hyb25vdXNcclxuICBpZihpc19jb3JzKVxyXG4gICAgeGhyLndpdGhDcmVkZW50aWFscyA9ICEhIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzXHJcbiAgeGhyLnNlbmQob3B0aW9ucy5ib2R5KVxyXG4gIHJldHVybiB4aHJcclxuXHJcbiAgZnVuY3Rpb24gb25fc3RhdGVfY2hhbmdlKGV2ZW50KSB7XHJcbiAgICBpZih0aW1lZF9vdXQpXHJcbiAgICAgIHJldHVybiByZXF1ZXN0LmxvZy5kZWJ1ZygnSWdub3JpbmcgdGltZWQgb3V0IHN0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZH0pXHJcblxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1N0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZCwgJ3RpbWVkX291dCc6dGltZWRfb3V0fSlcclxuXHJcbiAgICBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLk9QRU5FRCkge1xyXG4gICAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVxdWVzdCBzdGFydGVkJywgeydpZCc6eGhyLmlkfSlcclxuICAgICAgZm9yICh2YXIga2V5IGluIG9wdGlvbnMuaGVhZGVycylcclxuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIG9wdGlvbnMuaGVhZGVyc1trZXldKVxyXG4gICAgfVxyXG5cclxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5IRUFERVJTX1JFQ0VJVkVEKVxyXG4gICAgICBvbl9yZXNwb25zZSgpXHJcblxyXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkxPQURJTkcpIHtcclxuICAgICAgb25fcmVzcG9uc2UoKVxyXG4gICAgICBvbl9sb2FkaW5nKClcclxuICAgIH1cclxuXHJcbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuRE9ORSkge1xyXG4gICAgICBvbl9yZXNwb25zZSgpXHJcbiAgICAgIG9uX2xvYWRpbmcoKVxyXG4gICAgICBvbl9lbmQoKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gb25fcmVzcG9uc2UoKSB7XHJcbiAgICBpZihkaWQucmVzcG9uc2UpXHJcbiAgICAgIHJldHVyblxyXG5cclxuICAgIGRpZC5yZXNwb25zZSA9IHRydWVcclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdHb3QgcmVzcG9uc2UnLCB7J2lkJzp4aHIuaWQsICdzdGF0dXMnOnhoci5zdGF0dXN9KVxyXG4gICAgY2xlYXJUaW1lb3V0KHhoci50aW1lb3V0VGltZXIpXHJcbiAgICB4aHIuc3RhdHVzQ29kZSA9IHhoci5zdGF0dXMgLy8gTm9kZSByZXF1ZXN0IGNvbXBhdGliaWxpdHlcclxuXHJcbiAgICAvLyBEZXRlY3QgZmFpbGVkIENPUlMgcmVxdWVzdHMuXHJcbiAgICBpZihpc19jb3JzICYmIHhoci5zdGF0dXNDb2RlID09IDApIHtcclxuICAgICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdDT1JTIHJlcXVlc3QgcmVqZWN0ZWQ6ICcgKyBvcHRpb25zLnVyaSlcclxuICAgICAgY29yc19lcnIuY29ycyA9ICdyZWplY3RlZCdcclxuXHJcbiAgICAgIC8vIERvIG5vdCBwcm9jZXNzIHRoaXMgcmVxdWVzdCBmdXJ0aGVyLlxyXG4gICAgICBkaWQubG9hZGluZyA9IHRydWVcclxuICAgICAgZGlkLmVuZCA9IHRydWVcclxuXHJcbiAgICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGNvcnNfZXJyLCB4aHIpXHJcbiAgICB9XHJcblxyXG4gICAgb3B0aW9ucy5vblJlc3BvbnNlKG51bGwsIHhocilcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG9uX2xvYWRpbmcoKSB7XHJcbiAgICBpZihkaWQubG9hZGluZylcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAgZGlkLmxvYWRpbmcgPSB0cnVlXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVzcG9uc2UgYm9keSBsb2FkaW5nJywgeydpZCc6eGhyLmlkfSlcclxuICAgIC8vIFRPRE86IE1heWJlIHNpbXVsYXRlIFwiZGF0YVwiIGV2ZW50cyBieSB3YXRjaGluZyB4aHIucmVzcG9uc2VUZXh0XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBvbl9lbmQoKSB7XHJcbiAgICBpZihkaWQuZW5kKVxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBkaWQuZW5kID0gdHJ1ZVxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3QgZG9uZScsIHsnaWQnOnhoci5pZH0pXHJcblxyXG4gICAgeGhyLmJvZHkgPSB4aHIucmVzcG9uc2VUZXh0XHJcbiAgICBpZihvcHRpb25zLmpzb24pIHtcclxuICAgICAgdHJ5ICAgICAgICB7IHhoci5ib2R5ID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KSB9XHJcbiAgICAgIGNhdGNoIChlcikgeyByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKSAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG9wdGlvbnMuY2FsbGJhY2sobnVsbCwgeGhyLCB4aHIuYm9keSlcclxuICB9XHJcblxyXG59IC8vIHJlcXVlc3RcclxuXHJcbnJlcXVlc3Qud2l0aENyZWRlbnRpYWxzID0gZmFsc2U7XHJcbnJlcXVlc3QuREVGQVVMVF9USU1FT1VUID0gREVGQVVMVF9USU1FT1VUO1xyXG5cclxuLy9cclxuLy8gZGVmYXVsdHNcclxuLy9cclxuXHJcbnJlcXVlc3QuZGVmYXVsdHMgPSBmdW5jdGlvbihvcHRpb25zLCByZXF1ZXN0ZXIpIHtcclxuICB2YXIgZGVmID0gZnVuY3Rpb24gKG1ldGhvZCkge1xyXG4gICAgdmFyIGQgPSBmdW5jdGlvbiAocGFyYW1zLCBjYWxsYmFjaykge1xyXG4gICAgICBpZih0eXBlb2YgcGFyYW1zID09PSAnc3RyaW5nJylcclxuICAgICAgICBwYXJhbXMgPSB7J3VyaSc6IHBhcmFtc307XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHBhcmFtcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocGFyYW1zKSk7XHJcbiAgICAgIH1cclxuICAgICAgZm9yICh2YXIgaSBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgaWYgKHBhcmFtc1tpXSA9PT0gdW5kZWZpbmVkKSBwYXJhbXNbaV0gPSBvcHRpb25zW2ldXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG1ldGhvZChwYXJhbXMsIGNhbGxiYWNrKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGRcclxuICB9XHJcbiAgdmFyIGRlID0gZGVmKHJlcXVlc3QpXHJcbiAgZGUuZ2V0ID0gZGVmKHJlcXVlc3QuZ2V0KVxyXG4gIGRlLnBvc3QgPSBkZWYocmVxdWVzdC5wb3N0KVxyXG4gIGRlLnB1dCA9IGRlZihyZXF1ZXN0LnB1dClcclxuICBkZS5oZWFkID0gZGVmKHJlcXVlc3QuaGVhZClcclxuICByZXR1cm4gZGVcclxufVxyXG5cclxuLy9cclxuLy8gSFRUUCBtZXRob2Qgc2hvcnRjdXRzXHJcbi8vXHJcblxyXG52YXIgc2hvcnRjdXRzID0gWyAnZ2V0JywgJ3B1dCcsICdwb3N0JywgJ2hlYWQnIF07XHJcbnNob3J0Y3V0cy5mb3JFYWNoKGZ1bmN0aW9uKHNob3J0Y3V0KSB7XHJcbiAgdmFyIG1ldGhvZCA9IHNob3J0Y3V0LnRvVXBwZXJDYXNlKCk7XHJcbiAgdmFyIGZ1bmMgICA9IHNob3J0Y3V0LnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gIHJlcXVlc3RbZnVuY10gPSBmdW5jdGlvbihvcHRzKSB7XHJcbiAgICBpZih0eXBlb2Ygb3B0cyA9PT0gJ3N0cmluZycpXHJcbiAgICAgIG9wdHMgPSB7J21ldGhvZCc6bWV0aG9kLCAndXJpJzpvcHRzfTtcclxuICAgIGVsc2Uge1xyXG4gICAgICBvcHRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRzKSk7XHJcbiAgICAgIG9wdHMubWV0aG9kID0gbWV0aG9kO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBhcmdzID0gW29wdHNdLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuYXBwbHkoYXJndW1lbnRzLCBbMV0pKTtcclxuICAgIHJldHVybiByZXF1ZXN0LmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gIH1cclxufSlcclxuXHJcbi8vXHJcbi8vIENvdWNoREIgc2hvcnRjdXRcclxuLy9cclxuXHJcbnJlcXVlc3QuY291Y2ggPSBmdW5jdGlvbihvcHRpb25zLCBjYWxsYmFjaykge1xyXG4gIGlmKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJylcclxuICAgIG9wdGlvbnMgPSB7J3VyaSc6b3B0aW9uc31cclxuXHJcbiAgLy8gSnVzdCB1c2UgdGhlIHJlcXVlc3QgQVBJIHRvIGRvIEpTT04uXHJcbiAgb3B0aW9ucy5qc29uID0gdHJ1ZVxyXG4gIGlmKG9wdGlvbnMuYm9keSlcclxuICAgIG9wdGlvbnMuanNvbiA9IG9wdGlvbnMuYm9keVxyXG4gIGRlbGV0ZSBvcHRpb25zLmJvZHlcclxuXHJcbiAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBub29wXHJcblxyXG4gIHZhciB4aHIgPSByZXF1ZXN0KG9wdGlvbnMsIGNvdWNoX2hhbmRsZXIpXHJcbiAgcmV0dXJuIHhoclxyXG5cclxuICBmdW5jdGlvbiBjb3VjaF9oYW5kbGVyKGVyLCByZXNwLCBib2R5KSB7XHJcbiAgICBpZihlcilcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KVxyXG5cclxuICAgIGlmKChyZXNwLnN0YXR1c0NvZGUgPCAyMDAgfHwgcmVzcC5zdGF0dXNDb2RlID4gMjk5KSAmJiBib2R5LmVycm9yKSB7XHJcbiAgICAgIC8vIFRoZSBib2R5IGlzIGEgQ291Y2ggSlNPTiBvYmplY3QgaW5kaWNhdGluZyB0aGUgZXJyb3IuXHJcbiAgICAgIGVyID0gbmV3IEVycm9yKCdDb3VjaERCIGVycm9yOiAnICsgKGJvZHkuZXJyb3IucmVhc29uIHx8IGJvZHkuZXJyb3IuZXJyb3IpKVxyXG4gICAgICBmb3IgKHZhciBrZXkgaW4gYm9keSlcclxuICAgICAgICBlcltrZXldID0gYm9keVtrZXldXHJcbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KTtcclxuICB9XHJcbn1cclxuXHJcbi8vXHJcbi8vIFV0aWxpdHlcclxuLy9cclxuXHJcbmZ1bmN0aW9uIG5vb3AoKSB7fVxyXG5cclxuZnVuY3Rpb24gZ2V0TG9nZ2VyKCkge1xyXG4gIHZhciBsb2dnZXIgPSB7fVxyXG4gICAgLCBsZXZlbHMgPSBbJ3RyYWNlJywgJ2RlYnVnJywgJ2luZm8nLCAnd2FybicsICdlcnJvciddXHJcbiAgICAsIGxldmVsLCBpXHJcblxyXG4gIGZvcihpID0gMDsgaSA8IGxldmVscy5sZW5ndGg7IGkrKykge1xyXG4gICAgbGV2ZWwgPSBsZXZlbHNbaV1cclxuXHJcbiAgICBsb2dnZXJbbGV2ZWxdID0gbm9vcFxyXG4gICAgaWYodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIGNvbnNvbGUgJiYgY29uc29sZVtsZXZlbF0pXHJcbiAgICAgIGxvZ2dlcltsZXZlbF0gPSBmb3JtYXR0ZWQoY29uc29sZSwgbGV2ZWwpXHJcbiAgfVxyXG5cclxuICByZXR1cm4gbG9nZ2VyXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZvcm1hdHRlZChvYmosIG1ldGhvZCkge1xyXG4gIHJldHVybiBmb3JtYXR0ZWRfbG9nZ2VyXHJcblxyXG4gIGZ1bmN0aW9uIGZvcm1hdHRlZF9sb2dnZXIoc3RyLCBjb250ZXh0KSB7XHJcbiAgICBpZih0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpXHJcbiAgICAgIHN0ciArPSAnICcgKyBKU09OLnN0cmluZ2lmeShjb250ZXh0KVxyXG5cclxuICAgIHJldHVybiBvYmpbbWV0aG9kXS5jYWxsKG9iaiwgc3RyKVxyXG4gIH1cclxufVxyXG5cclxuLy8gUmV0dXJuIHdoZXRoZXIgYSBVUkwgaXMgYSBjcm9zcy1kb21haW4gcmVxdWVzdC5cclxuZnVuY3Rpb24gaXNfY3Jvc3NEb21haW4odXJsKSB7XHJcbiAgdmFyIHJ1cmwgPSAvXihbXFx3XFwrXFwuXFwtXSs6KSg/OlxcL1xcLyhbXlxcLz8jOl0qKSg/OjooXFxkKykpPyk/L1xyXG5cclxuICAvLyBqUXVlcnkgIzgxMzgsIElFIG1heSB0aHJvdyBhbiBleGNlcHRpb24gd2hlbiBhY2Nlc3NpbmdcclxuICAvLyBhIGZpZWxkIGZyb20gd2luZG93LmxvY2F0aW9uIGlmIGRvY3VtZW50LmRvbWFpbiBoYXMgYmVlbiBzZXRcclxuICB2YXIgYWpheExvY2F0aW9uXHJcbiAgdHJ5IHsgYWpheExvY2F0aW9uID0gbG9jYXRpb24uaHJlZiB9XHJcbiAgY2F0Y2ggKGUpIHtcclxuICAgIC8vIFVzZSB0aGUgaHJlZiBhdHRyaWJ1dGUgb2YgYW4gQSBlbGVtZW50IHNpbmNlIElFIHdpbGwgbW9kaWZ5IGl0IGdpdmVuIGRvY3VtZW50LmxvY2F0aW9uXHJcbiAgICBhamF4TG9jYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCBcImFcIiApO1xyXG4gICAgYWpheExvY2F0aW9uLmhyZWYgPSBcIlwiO1xyXG4gICAgYWpheExvY2F0aW9uID0gYWpheExvY2F0aW9uLmhyZWY7XHJcbiAgfVxyXG5cclxuICB2YXIgYWpheExvY1BhcnRzID0gcnVybC5leGVjKGFqYXhMb2NhdGlvbi50b0xvd2VyQ2FzZSgpKSB8fCBbXVxyXG4gICAgLCBwYXJ0cyA9IHJ1cmwuZXhlYyh1cmwudG9Mb3dlckNhc2UoKSApXHJcblxyXG4gIHZhciByZXN1bHQgPSAhIShcclxuICAgIHBhcnRzICYmXHJcbiAgICAoICBwYXJ0c1sxXSAhPSBhamF4TG9jUGFydHNbMV1cclxuICAgIHx8IHBhcnRzWzJdICE9IGFqYXhMb2NQYXJ0c1syXVxyXG4gICAgfHwgKHBhcnRzWzNdIHx8IChwYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKSAhPSAoYWpheExvY1BhcnRzWzNdIHx8IChhamF4TG9jUGFydHNbMV0gPT09IFwiaHR0cDpcIiA/IDgwIDogNDQzKSlcclxuICAgIClcclxuICApXHJcblxyXG4gIC8vY29uc29sZS5kZWJ1ZygnaXNfY3Jvc3NEb21haW4oJyt1cmwrJykgLT4gJyArIHJlc3VsdClcclxuICByZXR1cm4gcmVzdWx0XHJcbn1cclxuXHJcbi8vIE1JVCBMaWNlbnNlIGZyb20gaHR0cDovL3BocGpzLm9yZy9mdW5jdGlvbnMvYmFzZTY0X2VuY29kZTozNThcclxuZnVuY3Rpb24gYjY0X2VuYyAoZGF0YSkge1xyXG4gICAgLy8gRW5jb2RlcyBzdHJpbmcgdXNpbmcgTUlNRSBiYXNlNjQgYWxnb3JpdGhtXHJcbiAgICB2YXIgYjY0ID0gXCJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvPVwiO1xyXG4gICAgdmFyIG8xLCBvMiwgbzMsIGgxLCBoMiwgaDMsIGg0LCBiaXRzLCBpID0gMCwgYWMgPSAwLCBlbmM9XCJcIiwgdG1wX2FyciA9IFtdO1xyXG5cclxuICAgIGlmICghZGF0YSkge1xyXG4gICAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGFzc3VtZSB1dGY4IGRhdGFcclxuICAgIC8vIGRhdGEgPSB0aGlzLnV0ZjhfZW5jb2RlKGRhdGErJycpO1xyXG5cclxuICAgIGRvIHsgLy8gcGFjayB0aHJlZSBvY3RldHMgaW50byBmb3VyIGhleGV0c1xyXG4gICAgICAgIG8xID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XHJcbiAgICAgICAgbzIgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcclxuICAgICAgICBvMyA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xyXG5cclxuICAgICAgICBiaXRzID0gbzE8PDE2IHwgbzI8PDggfCBvMztcclxuXHJcbiAgICAgICAgaDEgPSBiaXRzPj4xOCAmIDB4M2Y7XHJcbiAgICAgICAgaDIgPSBiaXRzPj4xMiAmIDB4M2Y7XHJcbiAgICAgICAgaDMgPSBiaXRzPj42ICYgMHgzZjtcclxuICAgICAgICBoNCA9IGJpdHMgJiAweDNmO1xyXG5cclxuICAgICAgICAvLyB1c2UgaGV4ZXRzIHRvIGluZGV4IGludG8gYjY0LCBhbmQgYXBwZW5kIHJlc3VsdCB0byBlbmNvZGVkIHN0cmluZ1xyXG4gICAgICAgIHRtcF9hcnJbYWMrK10gPSBiNjQuY2hhckF0KGgxKSArIGI2NC5jaGFyQXQoaDIpICsgYjY0LmNoYXJBdChoMykgKyBiNjQuY2hhckF0KGg0KTtcclxuICAgIH0gd2hpbGUgKGkgPCBkYXRhLmxlbmd0aCk7XHJcblxyXG4gICAgZW5jID0gdG1wX2Fyci5qb2luKCcnKTtcclxuXHJcbiAgICBzd2l0Y2ggKGRhdGEubGVuZ3RoICUgMykge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0yKSArICc9PSc7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgICBlbmMgPSBlbmMuc2xpY2UoMCwgLTEpICsgJz0nO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBlbmM7XHJcbn1cclxuICAgIHJldHVybiByZXF1ZXN0O1xyXG4vL1VNRCBGT09URVIgU1RBUlRcclxufSkpO1xyXG4vL1VNRCBGT09URVIgRU5EXHJcbiIsImZ1bmN0aW9uIEUgKCkge1xyXG4gIC8vIEtlZXAgdGhpcyBlbXB0eSBzbyBpdCdzIGVhc2llciB0byBpbmhlcml0IGZyb21cclxuICAvLyAodmlhIGh0dHBzOi8vZ2l0aHViLmNvbS9saXBzbWFjayBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9zY290dGNvcmdhbi90aW55LWVtaXR0ZXIvaXNzdWVzLzMpXHJcbn1cclxuXHJcbkUucHJvdG90eXBlID0ge1xyXG4gIG9uOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2ssIGN0eCkge1xyXG4gICAgdmFyIGUgPSB0aGlzLmUgfHwgKHRoaXMuZSA9IHt9KTtcclxuXHJcbiAgICAoZVtuYW1lXSB8fCAoZVtuYW1lXSA9IFtdKSkucHVzaCh7XHJcbiAgICAgIGZuOiBjYWxsYmFjayxcclxuICAgICAgY3R4OiBjdHhcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH0sXHJcblxyXG4gIG9uY2U6IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaywgY3R4KSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBmdW5jdGlvbiBsaXN0ZW5lciAoKSB7XHJcbiAgICAgIHNlbGYub2ZmKG5hbWUsIGxpc3RlbmVyKTtcclxuICAgICAgY2FsbGJhY2suYXBwbHkoY3R4LCBhcmd1bWVudHMpO1xyXG4gICAgfTtcclxuXHJcbiAgICBsaXN0ZW5lci5fID0gY2FsbGJhY2tcclxuICAgIHJldHVybiB0aGlzLm9uKG5hbWUsIGxpc3RlbmVyLCBjdHgpO1xyXG4gIH0sXHJcblxyXG4gIGVtaXQ6IGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICB2YXIgZGF0YSA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcclxuICAgIHZhciBldnRBcnIgPSAoKHRoaXMuZSB8fCAodGhpcy5lID0ge30pKVtuYW1lXSB8fCBbXSkuc2xpY2UoKTtcclxuICAgIHZhciBpID0gMDtcclxuICAgIHZhciBsZW4gPSBldnRBcnIubGVuZ3RoO1xyXG5cclxuICAgIGZvciAoaTsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIGV2dEFycltpXS5mbi5hcHBseShldnRBcnJbaV0uY3R4LCBkYXRhKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9LFxyXG5cclxuICBvZmY6IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaykge1xyXG4gICAgdmFyIGUgPSB0aGlzLmUgfHwgKHRoaXMuZSA9IHt9KTtcclxuICAgIHZhciBldnRzID0gZVtuYW1lXTtcclxuICAgIHZhciBsaXZlRXZlbnRzID0gW107XHJcblxyXG4gICAgaWYgKGV2dHMgJiYgY2FsbGJhY2spIHtcclxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGV2dHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuICAgICAgICBpZiAoZXZ0c1tpXS5mbiAhPT0gY2FsbGJhY2sgJiYgZXZ0c1tpXS5mbi5fICE9PSBjYWxsYmFjaylcclxuICAgICAgICAgIGxpdmVFdmVudHMucHVzaChldnRzW2ldKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlbW92ZSBldmVudCBmcm9tIHF1ZXVlIHRvIHByZXZlbnQgbWVtb3J5IGxlYWtcclxuICAgIC8vIFN1Z2dlc3RlZCBieSBodHRwczovL2dpdGh1Yi5jb20vbGF6ZFxyXG4gICAgLy8gUmVmOiBodHRwczovL2dpdGh1Yi5jb20vc2NvdHRjb3JnYW4vdGlueS1lbWl0dGVyL2NvbW1pdC9jNmViZmFhOWJjOTczYjMzZDExMGE4NGEzMDc3NDJiN2NmOTRjOTUzI2NvbW1pdGNvbW1lbnQtNTAyNDkxMFxyXG5cclxuICAgIChsaXZlRXZlbnRzLmxlbmd0aClcclxuICAgICAgPyBlW25hbWVdID0gbGl2ZUV2ZW50c1xyXG4gICAgICA6IGRlbGV0ZSBlW25hbWVdO1xyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRTtcclxubW9kdWxlLmV4cG9ydHMuVGlueUVtaXR0ZXIgPSBFO1xyXG4iLCJjb25zdCBMb2dpbiA9IHJlcXVpcmUoXCIuL2NvbXBvbmVudHMvbG9naW4uanNcIik7XHJcbmNvbnN0IEFkbWluaXN0cmFjYW8gPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL2FkbWluaXN0cmFjYW8uanNcIik7XHJcbmNvbnN0IE1lbnUgPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL21lbnUuanNcIik7XHJcbmNvbnN0IE11c2N1bGFjYW8gPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL211c2N1bGFjYW8uanNcIik7XHJcbmNvbnN0IE11bHRpZnVuY2lvbmFsID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9tdWx0aWZ1bmNpb25hbC5qc1wiKTtcclxuXHJcbmNsYXNzIEFwcCB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IG5ldyBMb2dpbihib2R5KTtcclxuICAgICAgICB0aGlzLmFkbWluaXN0cmFjYW8gPSBuZXcgQWRtaW5pc3RyYWNhbyhib2R5KTtcclxuICAgICAgICB0aGlzLm1lbnUgPSBuZXcgTWVudShib2R5KTtcclxuICAgICAgICB0aGlzLm11c2N1bGFjYW8gPSBuZXcgTXVzY3VsYWNhbyhib2R5KTtcclxuICAgICAgICB0aGlzLm11bHRpZnVuY2lvbmFsID0gbmV3IE11bHRpZnVuY2lvbmFsKGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIGluaXQoKSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMubG9naW5FdmVudHMoKTtcclxuICAgICAgICB0aGlzLmFkbWluaXN0cmFjYW9FdmVudHMoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dpbkV2ZW50cygpIHtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwiZXJyb3JcIiwgKCkgPT4gYWxlcnQoXCJVc3VhcmlvIG91IHNlbmhhIGluY29ycmV0b3NcIikpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJsb2dpbkFkbWluXCIsICgpID0+IHRoaXMuYWRtaW5pc3RyYWNhby5yZW5kZXIoKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImxvZ2luQWx1bm9cIiwgbG9naW4gPT4gdGhpcy5tZW51LnJlbmRlcihsb2dpbikpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJtdWx0aWZ1bmNpb25hbFwiLCBkYXRhID0+IHRoaXMubXVsdGlmdW5jaW9uYWwucmVuZGVyKGRhdGEpKTtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwibXVzY3VsYWNhb1wiLCBkYXRhID0+IHRoaXMubXVzY3VsYWNhby5yZW5kZXIoZGF0YSkpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJhbHVub05hb0luc2VyaWRvXCIsICgpID0+IGFsZXJ0KFwiT3BzLCBvIGFsdW5vIG7Do28gcG9kZSBzZXIgaW5zZXJpZG9cIikpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJhbHVub0luc2VyaWRvU3VjZXNzb1wiLCAoKSA9PiBhbGVydChcIkFsdW5vIGluc2VyaWRvIGNvbSBzdWNlc3NvXCIpKTtcclxuICAgIH1cclxuXHJcbiAgICBhZG1pbmlzdHJhY2FvRXZlbnRzKCkge1xyXG4gICAgICAgIC8vdGhpcy5hZG1pbmlzdHJhY2FvLm9uKFwicHJlZW5jaGFHcmlkXCIsICk7XHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQXBwOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2FkbWluaXN0cmFjYW8uanNcIik7XHJcbmNvbnN0IExvZ2luID0gcmVxdWlyZShcIi4vbG9naW4uanNcIik7XHJcbmNvbnN0IENhZGFzdHJvQWx1bm8gPSByZXF1aXJlKFwiLi9jYWRhc3Ryb0FsdW5vLmpzXCIpO1xyXG5cclxuY2xhc3MgQWRtaW5pc3RyYWNhbyBleHRlbmRzIEFnZW5kYSB7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgICAgICB0aGlzLmxvZ2luID0gbmV3IExvZ2luKGJvZHkpO1xyXG4gICAgICAgIHRoaXMuY2FkYXN0cm9BbHVubyA9IG5ldyBDYWRhc3Ryb0FsdW5vKGJvZHkpO1xyXG4gICAgICAgIHRoaXMuZWhFZGljYW8gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJHcmlkQWx1bm9zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmxvZ291dCgpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tCb3Rhb1NhbHZhcigpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tCb3Rhb0FkaWNpb25hcigpO1xyXG4gICAgICAgIHRoaXMuYm90YW9FZGl0YXIoKTtcclxuICAgICAgICB0aGlzLmNsaWNrQm90YW9FeGNsdWlyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgbG9nb3V0KCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JvdGFvU2h1dGRvd25dXCIpLm9uY2xpY2sgPSAoKSA9PiBkb2N1bWVudC5sb2NhdGlvbi5yZWxvYWQodHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgY2xpY2tCb3Rhb0V4Y2x1aXIoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9FeGNsdWlyXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5leGNsdWFBbHVubygpO1xyXG4gICAgfSAgICBcclxuXHJcbiAgICBjbGlja0JvdGFvU2FsdmFyKCkge1xyXG5cclxuICAgICAgICBjb25zdCBmb3JtID0gdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJmb3JtXCIpO1xyXG5cclxuICAgICAgICBmb3JtLmFkZEV2ZW50TGlzdGVuZXIoXCJzdWJtaXRcIiwgKGUpID0+IHtcclxuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICBjb25zdCBhbHVubyA9IHRoaXMub2J0ZW5oYURhZG9zTW9kYWwoZSk7XHJcbiAgICAgICAgICAgIHRoaXMuaW5zaXJhT3VFZGl0ZUFsdW5vKGFsdW5vKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjbGlja0JvdGFvQWRpY2lvbmFyKCkge1xyXG5cclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0FkaWNpb25hcl1cIikub25jbGljayA9ICgpID0+IHRoaXMuZWhFZGljYW8gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBib3Rhb0VkaXRhcigpIHtcclxuXHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9FZGl0YXJdXCIpLm9uY2xpY2sgPSAoKSA9PiB0aGlzLmNsaWNrQm90YW9FZGl0YXIoKVxyXG4gICAgfVxyXG5cclxuICAgIGNsaWNrQm90YW9FZGl0YXIoKSB7XHJcblxyXG4gICAgICAgIHRoaXMuZWhFZGljYW8gPSB0cnVlO1xyXG5cclxuICAgICAgICBsZXQgYWx1bm9zU2VsZWNpb25hZG9zID0gdGhpcy5vYnRlbmhhQWx1bm9zU2VsZWNpb25hZG9zKCk7XHJcblxyXG4gICAgICAgIGlmIChhbHVub3NTZWxlY2lvbmFkb3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChhbHVub3NTZWxlY2lvbmFkb3MubGVuZ3RoID09PSAxKSB7ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMuYWx1bm9TZWxlY2lvbmFkbyA9IGFsdW5vc1NlbGVjaW9uYWRvc1swXS5nZXRBdHRyaWJ1dGUoXCJjb2RpZ29hbHVub1wiKTtcclxuICAgICAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vLnByZWVuY2hhTW9kYWxFZGljYW8odGhpcy5hbHVub1NlbGVjaW9uYWRvKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiU2VsZWNpb25lIGFwZW5hcyB1bSBhbHVubyBwYXJhIGVkacOnw6NvIHBvciBmYXZvciFcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG9idGVuaGFEYWRvc01vZGFsKGUpIHtcclxuXHJcbiAgICAgICAgY29uc3QgY3BmID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltjcGZdXCIpLnZhbHVlO1xyXG5cclxuICAgICAgICBjb25zdCBhbHVubyA9IHtcclxuICAgICAgICAgICAgbm9tZTogZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltub21lXVwiKS52YWx1ZSxcclxuICAgICAgICAgICAgY3BmOiBjcGYsXHJcbiAgICAgICAgICAgIHRlbGVmb25lOiBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW3RlbGVmb25lXVwiKS52YWx1ZSxcclxuICAgICAgICAgICAgZW1haWw6IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbZW1haWxdXCIpLnZhbHVlLFxyXG4gICAgICAgICAgICBlbmRlcmVjbzogdGhpcy5tb250ZUVuZGVyZWNvKGUudGFyZ2V0KSxcclxuICAgICAgICAgICAgbWF0cmljdWxhOiB0aGlzLmdlcmVNYXRyaWN1bGEoY3BmKVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHJldHVybiBhbHVubztcclxuICAgIH1cclxuXHJcbiAgICBpbnNpcmFPdUVkaXRlQWx1bm8oYWx1bm8pIHtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZWhFZGljYW8pIHtcclxuICAgICAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vLmVkaXRlQWx1bm8oYWx1bm8sIHRoaXMuYWx1bm9TZWxlY2lvbmFkbyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8uaW5zaXJhQWx1bm8oYWx1bm8pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgJCgnI21vZGFsQ2FkYXN0cm9BbHVubycpLm1vZGFsKCdoaWRlJyk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJHcmlkQWx1bm9zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZXhjbHVhQWx1bm8oKSB7XHJcblxyXG4gICAgICAgIGxldCBhbHVub3NTZWxlY2lvbmFkb3MgPSB0aGlzLm9idGVuaGFBbHVub3NTZWxlY2lvbmFkb3MoKTtcclxuXHJcbiAgICAgICAgaWYgKGFsdW5vc1NlbGVjaW9uYWRvcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGFsdW5vc1NlbGVjaW9uYWRvcy5sZW5ndGggPT09IDEpIHsgICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhpcy5hbHVub1NlbGVjaW9uYWRvID0gYWx1bm9zU2VsZWNpb25hZG9zWzBdLmdldEF0dHJpYnV0ZShcImNvZGlnb2FsdW5vXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8uZXhjbHVhQWx1bm8odGhpcy5hbHVub1NlbGVjaW9uYWRvKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGFsZXJ0KFwiU2VsZWNpb25lIGFwZW5hcyB1bSBhbHVubyBwYXJhIGVkacOnw6NvIHBvciBmYXZvciFcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckdyaWRBbHVub3MoKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvYCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImVycm9yXCIsIFwibsOjbyBmb2kgcG9zc8OtdmVsIGNhcnJlZ2FyIG9zIGFsdW5vc1wiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoZGF0YS5hbHVub3MpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBvYnRlbmhhQWx1bm9zU2VsZWNpb25hZG9zKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZ1bmN0aW9uIGVzdGFTZWxlY2lvbmFkbyhhbHVubykge1xyXG4gICAgICAgICAgICByZXR1cm4gYWx1bm8uY2hlY2tlZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBhbHVub3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLmJvZHkucXVlcnlTZWxlY3RvckFsbChcIlthbHVub1NlbGVjaW9uYWRvXVwiKSk7XHJcbiAgICAgICAgcmV0dXJuIGFsdW5vcy5maWx0ZXIoZXN0YVNlbGVjaW9uYWRvKTtcclxuICAgIH1cclxuXHJcbiAgICBtb250ZUVuZGVyZWNvKHRhcmdldCkge1xyXG4gICAgICAgIHJldHVybiB0YXJnZXQucXVlcnlTZWxlY3RvcihcIltjaWRhZGVdXCIpLnZhbHVlICsgXCJcXG5cIiArXHJcbiAgICAgICAgICAgIHRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW2JhaXJyb11cIikudmFsdWUgKyBcIlxcblwiICtcclxuICAgICAgICAgICAgdGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbbnVtZXJvXVwiKS52YWx1ZSArIFwiXFxuXCIgK1xyXG4gICAgICAgICAgICB0YXJnZXQucXVlcnlTZWxlY3RvcihcIltjb21wbGVtZW50b11cIikudmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgZ2VyZU1hdHJpY3VsYShjcGYpIHtcclxuICAgICAgICBjb25zdCBkYXRhID0gbmV3IERhdGUoKTtcclxuICAgICAgICBjb25zdCBhbm8gPSBkYXRhLmdldEZ1bGxZZWFyKCk7XHJcbiAgICAgICAgY29uc3Qgc2VndW5kb3MgPSBkYXRhLmdldFNlY29uZHMoKTtcclxuICAgICAgICByZXR1cm4gYW5vICsgY3BmLnNsaWNlKDgpICsgc2VndW5kb3M7XHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQWRtaW5pc3RyYWNhbzsiLCJjb25zdCBUaW55RW1pdHRlciA9IHJlcXVpcmUoXCJ0aW55LWVtaXR0ZXJcIik7XHJcbmNvbnN0IFJlcXVlc3QgPSByZXF1aXJlKFwiYnJvd3Nlci1yZXF1ZXN0XCIpO1xyXG5cclxuY2xhc3MgQWdlbmRhIGV4dGVuZHMgVGlueUVtaXR0ZXIge1xyXG4gICAgY29uc3RydWN0b3IoKXtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMucmVxdWVzdCA9IFJlcXVlc3Q7XHJcbiAgICAgICAgdGhpcy5VUkwgPSBcImh0dHA6Ly9sb2NhbGhvc3Q6MzMzM1wiO1xyXG4gICAgfVxyXG59XHJcbm1vZHVsZS5leHBvcnRzID0gQWdlbmRhOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanNcIik7XHJcbmNvbnN0IExvZ2luID0gcmVxdWlyZShcIi4vbG9naW4uanNcIik7XHJcblxyXG5jbGFzcyBDYWRhc3Ryb0FsdW5vIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IG5ldyBMb2dpbihib2R5KTtcclxuICAgIH07XHJcblxyXG4gICAgaW5zaXJhQWx1bm8oYWx1bm8pIHtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vYWRtaW5pc3RyYWNhb2AsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgIGJvZHk6IHtcclxuICAgICAgICAgICAgICAgIG5vbWU6IGFsdW5vLm5vbWUsXHJcbiAgICAgICAgICAgICAgICBjcGY6IGFsdW5vLmNwZixcclxuICAgICAgICAgICAgICAgIHRlbGVmb25lOiBhbHVuby50ZWxlZm9uZSxcclxuICAgICAgICAgICAgICAgIGVtYWlsOiBhbHVuby5lbWFpbCxcclxuICAgICAgICAgICAgICAgIGVuZGVyZWNvOiBhbHVuby5lbmRlcmVjbyxcclxuICAgICAgICAgICAgICAgIG1hdHJpY3VsYTogYWx1bm8ubWF0cmljdWxhXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoZXJyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImFsdW5vTmFvSW5zZXJpZG9cIiwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWxlcnQoXCJBbHVubyBpbnNlcmlkbyBjb20gc3VjZXNzbyFcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICB9O1xyXG5cclxuICAgIHByZWVuY2hhTW9kYWxFZGljYW8oY29kaWdvQWx1bm8pIHtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvLyR7Y29kaWdvQWx1bm99YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAwKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChcIkFsdW5vIG7Do28gZW5jb250cmFkb1wiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBhbHVubyA9IHtcclxuICAgICAgICAgICAgICAgICAgICBub21lOiBkYXRhLm5vbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgY3BmOiBkYXRhLmNwZixcclxuICAgICAgICAgICAgICAgICAgICB0ZWxlZm9uZTogZGF0YS50ZWxlZm9uZSxcclxuICAgICAgICAgICAgICAgICAgICBlbWFpbDogZGF0YS5lbWFpbCxcclxuICAgICAgICAgICAgICAgICAgICBlbmRlcmVjbzogZGF0YS5lbmRlcmVjbyxcclxuICAgICAgICAgICAgICAgICAgICBtYXRyaWN1bGE6IGRhdGEubWF0cmljdWxhXHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2NwZl1cIikudmFsdWUgPSBhbHVuby5jcGY7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltub21lXVwiKS52YWx1ZSA9IGFsdW5vLm5vbWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIlt0ZWxlZm9uZV1cIikudmFsdWUgPSBhbHVuby50ZWxlZm9uZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2VtYWlsXVwiKS52YWx1ZSA9IGFsdW5vLmVtYWlsO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY2lkYWRlXVwiKS52YWx1ZSA9IGFsdW5vLmVuZGVyZWNvLnNsaWNlKDgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYmFpcnJvXVwiKS52YWx1ZSA9IGFsdW5vLmVuZGVyZWNvLnNsaWNlKDgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbbnVtZXJvXVwiKS52YWx1ZSA9IGFsdW5vLmVuZGVyZWNvLnNsaWNlKDgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY29tcGxlbWVudG9dXCIpLnZhbHVlID0gYWx1bm8uZW5kZXJlY28uc2xpY2UoOCk7XHJcblxyXG4gICAgICAgICAgICAgICAgJCgnI21vZGFsQ2FkYXN0cm9BbHVubycpLm1vZGFsKCdzaG93Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICAvL3RoaXMuYm9keS5xdWVyeVNlbGVjdG9yKGUudGFyZ2V0KSwgICAgICAgIFxyXG4gICAgfVxyXG5cclxuICAgIGVkaXRlQWx1bm8oYWx1bm8sIGlkKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJQVVRcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vYWRtaW5pc3RyYWNhby8ke2lkfWAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgIGJvZHk6IHtcclxuICAgICAgICAgICAgICAgIGlkOiBhbHVuby5pZCxcclxuICAgICAgICAgICAgICAgIG5vbWU6IGFsdW5vLm5vbWUsXHJcbiAgICAgICAgICAgICAgICBjcGY6IGFsdW5vLmNwZixcclxuICAgICAgICAgICAgICAgIHRlbGVmb25lOiBhbHVuby50ZWxlZm9uZSxcclxuICAgICAgICAgICAgICAgIGVtYWlsOiBhbHVuby5lbWFpbCxcclxuICAgICAgICAgICAgICAgIGVuZGVyZWNvOiBhbHVuby5lbmRlcmVjbyxcclxuICAgICAgICAgICAgICAgIG1hdHJpY3VsYTogYWx1bm8ubWF0cmljdWxhXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoZXJyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImFsdW5vTmFvSW5zZXJpZG9cIiwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiQWx1bm8gZWRpdGFkbyBjb20gc3VjZXNzbyFcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5kaXNwb3NlTW9kYWwoKTtcclxuICAgIH1cclxuXHJcbiAgICBleGNsdWFBbHVubyhpZEFsdW5vKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkRFTEVURVwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvLyR7aWRBbHVub31gLFxyXG4gICAgICAgICAgICBjcm9zc0RvbWFpbjogdHJ1ZSxcclxuICAgICAgICAgICAganNvbjogdHJ1ZVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIHJlc3Auc2V0SGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nLCAnKicpO1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoZXJyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImFsdW5vTmFvSW5zZXJpZG9cIiwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiQWx1bm8gZXhjbHXDrWRvIGNvbSBzdWNlc3NvIVwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH1cclxuXHJcbiAgICBkaXNwb3NlTW9kYWwoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbY3BmXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbbm9tZV1cIikudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW3RlbGVmb25lXVwiKS52YWx1ZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbZW1haWxdXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjaWRhZGVdXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltiYWlycm9dXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltudW1lcm9dXCIpLnZhbHVlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltjb21wbGVtZW50b11cIikudmFsdWUgPSBcIlwiO1xyXG5cclxuICAgICAgICAkKCcjbW9kYWxDYWRhc3Ryb0FsdW5vJykubW9kYWwoJ2hpZGUnKTtcclxuICAgIH1cclxuXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQ2FkYXN0cm9BbHVubzsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9sb2dpbi5qc1wiKTtcclxuXHJcbmNsYXNzIExvZ2luIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIlt1c3VhcmlvXVwiKS5mb2N1cygpO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZEV2ZW50TGlzdGVuZXIoKSB7XHJcbiAgICAgICAgdGhpcy5lbnZpZUZvcm11bGFyaW8oKTtcclxuICAgICAgICB0aGlzLmVzcXVlY2V1U2VuaGEoKTtcclxuICAgIH1cclxuXHJcbiAgICBlbnZpZUZvcm11bGFyaW8oKSB7XHJcbiAgICAgICAgY29uc3QgZm9ybSA9IHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiZm9ybVwiKTtcclxuXHJcbiAgICAgICAgZm9ybS5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgY29uc3QgdXN1YXJpbyA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbdXN1YXJpb11cIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlbmhhID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltzZW5oYV1cIik7XHJcbiAgICAgICAgICAgIHRoaXMuYXV0ZW50aXF1ZVVzdWFyaW8odXN1YXJpbywgc2VuaGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGF1dGVudGlxdWVVc3VhcmlvKHVzdWFyaW8sIHNlbmhhKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgICAgICAgdXJsOiBgJHt0aGlzLlVSTH0vTG9naW5gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxyXG4gICAgICAgICAgICBib2R5OiB7XHJcbiAgICAgICAgICAgICAgICBsb2dpbjogdXN1YXJpby52YWx1ZSxcclxuICAgICAgICAgICAgICAgIHNlbmhhOiBzZW5oYS52YWx1ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuXHJcbiAgICAgICAgICAgIHRoaXMubG9nYVVzdWFyaW8ocmVzcCwgZXJyLCBkYXRhKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dhVXN1YXJpbyhyZXNwLCBlcnIsIGRhdGEpIHtcclxuXHJcbiAgICAgICAgaWYgKHJlc3Auc3RhdHVzICE9PSAyMDApIHtcclxuICAgICAgICAgICAgdGhpcy5lbWl0KFwiZXJyb3JcIiwgZXJyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7ICAgICAgICAgICAgXHJcblxyXG4gICAgICAgICAgICBpZiAoZGF0YS5hZG1pbikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwibG9naW5BZG1pblwiLCBkYXRhKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImxvZ2luQWx1bm9cIiwgZGF0YS5sb2dpbik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZXNxdWVjZXVTZW5oYSgpIHtcclxuICAgICAgICAvL2NvZGlnbyBwcmEgY2hhbWFyIGVtIFVSTFxyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IExvZ2luOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL21lbnUuanNcIik7XHJcbmNvbnN0IE11bHRpZnVuY2lvbmFsID0gcmVxdWlyZShcIi4vbXVsdGlmdW5jaW9uYWwuanNcIik7XHJcbmNvbnN0IE11c2N1bGFjYW8gPSByZXF1aXJlKFwiLi9tdXNjdWxhY2FvLmpzXCIpO1xyXG5cclxuY2xhc3MgTWVudSBleHRlbmRzIEFnZW5kYSB7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgICAgICB0aGlzLm11c2N1bGFjYW8gPSBuZXcgTXVzY3VsYWNhbyhib2R5KTtcclxuICAgICAgICB0aGlzLm11bHRpZnVuY2lvbmFsID0gbmV3IE11bHRpZnVuY2lvbmFsKGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihsb2dpbikge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIobG9naW4pO1xyXG4gICAgICAgIHRoaXMub2J0ZW5oYUNvZGlnb0FsdW5vKGxvZ2luKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMuYm90YW9NdXNjdWxhY2FvKCk7XHJcbiAgICAgICAgdGhpcy5ib3Rhb011bHRpZnVuY2lvbmFsKCk7XHJcbiAgICB9XHJcblxyXG4gICAgb2J0ZW5oYUNvZGlnb0FsdW5vKGxvZ2luKSB7XHJcblxyXG4gICAgICAgIHRoaXMubG9naW4gPSBsb2dpbjtcclxuXHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9tZW51LyR7bG9naW59YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAwKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChcIkFsdW5vIG7Do28gZW5jb250cmFkb1wiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29kaWdvQWx1bm8gPSBkYXRhLmlkO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgYm90YW9NdXNjdWxhY2FvKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW2JvdGFvTXVzY3VsYWNhb11cIikub25jbGljayA9ICgpID0+IHRoaXMucmVuZGVyTXVzY3VsYWNhbygpOyBcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJNdXNjdWxhY2FvKCkge1xyXG4gICAgICAgIGRlYnVnZ2VyO1xyXG5cclxuICAgICAgICBjb25zdCBkYXRhID0ge1xyXG4gICAgICAgICAgICBpZEFsdW5vOiB0aGlzLmNvZGlnb0FsdW5vLFxyXG4gICAgICAgICAgICBzYWxhOiBcIm11c2N1bGFjYW9cIixcclxuICAgICAgICAgICAgbG9naW46IHRoaXMubG9naW5cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLm11c2N1bGFjYW8ucmVuZGVyKGRhdGEpO1xyXG4gICAgfVxyXG5cclxuICAgIGJvdGFvTXVsdGlmdW5jaW9uYWwoKSB7ICAgICAgICBcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb011bHRpZnVuY2lvbmFsXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5yZW5kZXJNdWx0aWZ1bmNpb25hbCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlck11bHRpZnVuY2lvbmFsKCkge1xyXG5cclxuICAgICAgICBjb25zdCBkYXRhID0ge1xyXG4gICAgICAgICAgICBpZEFsdW5vOiB0aGlzLmNvZGlnb0FsdW5vLFxyXG4gICAgICAgICAgICBzYWxhOiBcIm11bHRpZnVuY2lvbmFsXCJcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLm11bHRpZnVuY2lvbmFsLnJlbmRlcihkYXRhKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNZW51OyIsImNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9tdWx0aWZ1bmNpb25hbC5qc1wiKTtcclxuY29uc3QgU2FsYSA9IHJlcXVpcmUoXCIuL3NhbGEuanNcIik7XHJcblxyXG5jbGFzcyBNdWx0aWZ1bmNpb25hbCBleHRlbmRzIFNhbGEge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoZGF0YSkge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLm9idGVuaGFIb3Jhcmlvc0FsdW5vcyhkYXRhKTtcclxuICAgICAgICB0aGlzLmxvZ2luID0gZGF0YTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNdWx0aWZ1bmNpb25hbDsiLCJjb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvbXVzY3VsYWNhby5qc1wiKTtcclxuY29uc3QgU2FsYSA9IHJlcXVpcmUoXCIuL3NhbGEuanNcIik7XHJcblxyXG5jbGFzcyBNdXNjdWxhY2FvIGV4dGVuZHMgU2FsYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihkYXRhKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMub2J0ZW5oYUhvcmFyaW9zQWx1bm9zKGRhdGEpO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBkYXRhO1xyXG4gICAgfVxyXG4gICAgXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTXVzY3VsYWNhbzsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcblxyXG5jbGFzcyBTYWxhIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmJvdGFvQ29uZmlybWFyKCk7XHJcbiAgICAgICAgdGhpcy5ib3Rhb0NhbmNlbGFyKClcclxuICAgIH1cclxuXHJcbiAgICBvYnRlbmhhSG9yYXJpb3NBbHVub3MobG9naW4pIHtcclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L3NhbGEvJHtsb2dpbi5pZEFsdW5vfS8ke2xvZ2luLnNhbGF9YCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuYXR1YWxpemVEcm9wRG93bnMoZGF0YS5ob3Jhcmlvcyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgYXR1YWxpemVEcm9wRG93bnMoaG9yYXJpb3MpIHtcclxuXHJcbiAgICAgICAgaWYgKGhvcmFyaW9zKSB7XHJcblxyXG4gICAgICAgICAgICBsZXQgZHJvcERvd25Ib3JhcmlvcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiW3NlbGVjYW9Ib3JhcmlvXVwiKSk7XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZHJvcERvd25Ib3Jhcmlvcy5sZW5ndGg7IGluZGV4KyspIHtcclxuXHJcbiAgICAgICAgICAgICAgICBkcm9wRG93bkhvcmFyaW9zW2luZGV4XS52YWx1ZSA9IGhvcmFyaW9zW2luZGV4XS5mYWl4YUhvcmFyaW87XHJcblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGJvdGFvQ29uZmlybWFyKGRhdGEpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0NvbmZpcm1hcl1cIikub25jbGljayA9ICgpID0+IHRoaXMuaW5zaXJlT3VBdHVhbGl6ZUhvcmFyaW8odGhpcy5sb2dpbik7XHJcbiAgICB9XHJcblxyXG4gICAgYm90YW9DYW5jZWxhcigpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0NhbmNlbGFyXVwiKS5vbmNsaWNrID0gKCkgPT4gdGhpcy5lbWl0KFwibG9naW5BbHVub1wiLCB0aGlzLmxvZ2luLmxvZ2luKTtcclxuICAgIH1cclxuXHJcbiAgICBpbnNpcmVPdUF0dWFsaXplSG9yYXJpbyhsb2dpbikge1xyXG5cclxuICAgICAgICBsZXQgZHJvcERvd25Ib3JhcmlvcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yQWxsKFwiW3NlbGVjYW9Ib3JhcmlvXVwiKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L3NhbGFgLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxyXG4gICAgICAgICAgICBib2R5OiB7XHJcbiAgICAgICAgICAgICAgICBob3JhcmlvczogW1xyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmFpeGFIb3JhcmlvOiBkcm9wRG93bkhvcmFyaW9zWzBdLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZEFsdW5vOiBsb2dpbi5pZEFsdW5vLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkaWFTZW1hbmE6IFwic2VndW5kYVwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzYWxhOiBsb2dpbi5zYWxhXHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZhaXhhSG9yYXJpbzogZHJvcERvd25Ib3Jhcmlvc1sxXS52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWRBbHVubzogbG9naW4uaWRBbHVubyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGlhU2VtYW5hOiBcInRlcmNhXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhbGE6IGxvZ2luLnNhbGFcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmFpeGFIb3JhcmlvOiBkcm9wRG93bkhvcmFyaW9zWzJdLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZEFsdW5vOiBsb2dpbi5pZEFsdW5vLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkaWFTZW1hbmE6IFwicXVhcnRhXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhbGE6IGxvZ2luLnNhbGFcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmFpeGFIb3JhcmlvOiBkcm9wRG93bkhvcmFyaW9zWzNdLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZEFsdW5vOiBsb2dpbi5pZEFsdW5vLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkaWFTZW1hbmE6IFwicXVpbnRhXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhbGE6IGxvZ2luLnNhbGFcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmFpeGFIb3JhcmlvOiBkcm9wRG93bkhvcmFyaW9zWzRdLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZEFsdW5vOiBsb2dpbi5pZEFsdW5vLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBkaWFTZW1hbmE6IFwic2V4dGFcIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2FsYTogbG9naW4uc2FsYVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmYWl4YUhvcmFyaW86IGRyb3BEb3duSG9yYXJpb3NbNV0udmFsdWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkQWx1bm86IGxvZ2luLmlkQWx1bm8sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpYVNlbWFuYTogXCJzYWJhZG9cIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2FsYTogbG9naW4uc2FsYVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIF1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGRlYnVnZ2VyO1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiYWx1bm9OYW9JbnNlcmlkb1wiLCBlcnIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hbGVydChcIkhvcmFyaW8gaW5zZXJpZG8gY29tIHN1Y2Vzc28hXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFNhbGE7IiwiY29uc3QgTW9kYWxDYWRhc3Ryb0FsdW5vID0gcmVxdWlyZShcIi4vY2FkYXN0cm9BbHVuby5qc1wiKTtcclxuXHJcbmNvbnN0IHJlbmRlckdyaWRBbHVub3MgPSBhbHVub3MgPT4ge1xyXG4gICAgcmV0dXJuIGFsdW5vcy5tYXAoYWx1bm8gPT4ge1xyXG5cclxuICAgICAgICBsZXQgY29yTGluaGEgPSBhbHVuby5pZCAlIDIgPT09IDAgPyBcImJhY2stZ3JpZHJvdzFcIiA6IFwiYmFjay1ncmlkcm93MlwiO1xyXG5cclxuICAgICAgICByZXR1cm4gYFxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3cgJHtjb3JMaW5oYX0gdGV4dC1kYXJrXCI+ICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwIGZvcm0tY2hlY2tcIj5cclxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3M9XCJmb3JtLWNoZWNrLWlucHV0IG10LTRcIiBhbHVub1NlbGVjaW9uYWRvIGNvZGlnb0FsdW5vPSR7YWx1bm8uaWR9PlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0ZXh0LWNlbnRlciBtYi0yXCI+JHthbHVuby5ub21lfTwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIFwiPlxyXG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwidGV4dC1jZW50ZXIgbXQtM1wiPiR7YWx1bm8uY3BmfTwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIFwiPlxyXG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwidGV4dC1jZW50ZXIgbXQtM1wiPiR7YWx1bm8ubWF0cmljdWxhfTwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvZGl2PiAgICAgICAgXHJcbiAgICAgICAgPC9kaXY+YFxyXG4gICAgfSkuam9pbihcIlwiKTtcclxufVxyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSBhbHVub3MgPT4ge1xyXG4gICAgXHJcbiAgICByZXR1cm4gYFxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJpbWctZmx1aWQgdGV4dC1yaWdodCBtci01IG10LTUgdGV4dC13aGl0ZSBib3Rhb1NodXRkb3duXCIgYm90YW9TaHV0ZG93bj5cclxuICAgICAgICA8YSBocmVmPVwiI1wiPjxpbWcgc3JjPVwiLi9pbWFnZXMvc2h1dGRvd24ucG5nXCIgYWx0PVwiXCI+PC9hPlxyXG4gICAgICAgIDxzdHJvbmcgY2xhc3M9XCJtci0xXCI+U2Fpcjwvc3Ryb25nPlxyXG4gICAgPC9kaXY+XHJcbiAgICBcclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXJcIj5cclxuICAgICAgICA8ZGl2PlxyXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtMiBtdC0yXCI+XHJcbiAgICAgICAgICAgICAgICDDgXJlYSBBZG1pbmlzdHJhdGl2YVxyXG4gICAgICAgICAgICA8L3NwYW4+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XHJcbiAgICBcclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93ICBib3JkZXIgYm9yZGVyLXdoaXRlIGJhY2stZ3JpZCB0ZXh0LXdoaXRlXCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC1jZW50ZXJcIj5cclxuICAgICAgICAgICAgICAgIE5vbWVcclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIHRleHQtY2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICBDUEZcclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIHRleHQtY2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICBNYXRyw61jdWxhXHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAke3JlbmRlckdyaWRBbHVub3MoYWx1bm9zKX1cclxuXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lciBjb2wtc20gbXQtM1wiPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2VudGVyZWRcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeSBidG4tZGFya1wiIGRhdGEtdG9nZ2xlPVwibW9kYWxcIiBkYXRhLXRhcmdldD1cIiNtb2RhbENhZGFzdHJvQWx1bm9cIiBib3Rhb0FkaWNpb25hcj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgQWRpY2lvbmFyXHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrXCIgYm90YW9FZGl0YXI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRhclxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tZGFya1wiIGJvdGFvRXhjbHVpcj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgRXhjbHVpclxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgICAgICAgICAke01vZGFsQ2FkYXN0cm9BbHVuby5yZW5kZXIoKX1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PiAgICBcclxuICAgIGA7IFxyXG59IiwiXHJcbmNvbnN0IGlucHV0RW5kZXJlY28gPSBgXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY2lkYWRlXCI+Q2lkYWRlPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQgY2lkYWRlLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiYmFpcnJvXCI+QmFpcnJvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQgYmFpcnJvLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwibnVtZXJvXCI+TsO6bWVybzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiB0eXBlPVwidGV4dFwiIHJlcXVpcmVkIG51bWVyby8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImNvbXBsZW1lbnRvXCI+Q29tcGxlbWVudG88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgdHlwZT1cInRleHRcIiBjb21wbGVtZW50by8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuYDtcclxuXHJcbmNvbnN0IG1vZGFsQ2FkYXN0cm9BbHVubyA9IGBcclxuPGRpdiBjbGFzcz1cIm1vZGFsIGZhZGVcIiBpZD1cIm1vZGFsQ2FkYXN0cm9BbHVub1wiIHRhYmluZGV4PVwiLTFcIiByb2xlPVwiZGlhbG9nXCIgYXJpYS1sYWJlbGxlZGJ5PVwidGl0dWxvTW9kYWxcIiBhcmlhLWhpZGRlbj1cInRydWVcIiBtb2RhbD5cclxuICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1kaWFsb2cgbW9kYWwtZGlhbG9nLWNlbnRlcmVkXCIgcm9sZT1cImRvY3VtZW50XCIgPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtaGVhZGVyXCI+XHJcbiAgICAgICAgICAgICAgICA8aDUgY2xhc3M9XCJtb2RhbC10aXRsZVwiIGlkPVwidGl0dWxvTW9kYWxcIj5BZGljaW9uYXIgTm92byBBbHVubzwvaDU+XHJcbiAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImNsb3NlXCIgZGF0YS1kaXNtaXNzPVwibW9kYWxcIiBhcmlhLWxhYmVsPVwiRmVjaGFyXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gYXJpYS1oaWRkZW49XCJ0cnVlXCI+JnRpbWVzOzwvc3Bhbj5cclxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIDxmb3JtPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWJvZHlcIj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbD5Ob21lIENvbXBsZXRvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFyayBjb2wtc21cIiBub21lPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCIgaWQ9XCJpbmNsdWRlX2RhdGVcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbD5EYXRhIGRlIE5hc2NpbWVudG88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrIGNvbC1zbVwiIGRhdGFOYXNjaW1lbnRvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImNwZlwiPkNQRjwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgaWQ9XCJjcGZcIiB0eXBlPVwidGV4dFwiIGF1dG9jb21wbGV0ZT1cIm9mZlwiIGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgY3BmPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwidGVsXCI+VGVsZWZvbmU8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGlkPVwidGVsXCIgdHlwZT1cInRleHRcIiBhdXRvY29tcGxldGU9XCJvZmZcIiBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIHRlbGVmb25lPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImVtYWlsXCI+RS1tYWlsPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBpZD1cImVtYWlsXCIgdHlwZT1cInRleHRcIiBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIGVtYWlsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj4gICAgICAgICAgICAgICAgICAgIFxyXG5cclxuICAgICAgICAgICAgICAgICAgICAke2lucHV0RW5kZXJlY299XHJcblxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtZm9vdGVyXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIGRhdGEtZGlzbWlzcz1cIm1vZGFsXCI+RmVjaGFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwic3VibWl0XCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIiBib3Rhb1NhbHZhcj5TYWx2YXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8L2Zvcm0+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcbmA7XHJcblxyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSAoKSA9PiB7XHJcbiAgICByZXR1cm4gbW9kYWxDYWRhc3Ryb0FsdW5vO1xyXG59XHJcbiIsImNvbnN0IGRyb3BEb3duSG9yYXJpbyA9IGBcclxuPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgY29sLXNtIFwiPlxyXG4gICAgPGxhYmVsIGZvcj1cInNlbGVjdC1ob3VyXCI+U2VsZWNpb25lIG8gaG9yw6FyaW88L2xhYmVsPlxyXG4gICAgPHNlbGVjdCBjbGFzcz1cImZvcm0tY29udHJvbCBcIiBzZWxlY2FvSG9yYXJpbz5cclxuICAgICAgICA8b3B0aW9uPjA3OjAwIC0gMDc6MzA8L29wdGlvbj4gICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgPG9wdGlvbj4wNzo0MCAtIDA4OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4wODoyMCAtIDA4OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4wOTowMCAtIDA5OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4wOTo0MCAtIDEwOjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMDoyMCAtIDEwOjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMTowMCAtIDExOjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMTo0MCAtIDEyOjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMjoyMCAtIDEyOjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMzowMCAtIDEzOjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xMzo0MCAtIDE0OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNDoyMCAtIDE0OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNTowMCAtIDE1OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNTo0MCAtIDE2OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNjoyMCAtIDE2OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNzowMCAtIDE3OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xNzo0MCAtIDE4OjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xODoyMCAtIDE4OjUwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xOTowMCAtIDE5OjMwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4xOTo0MCAtIDIwOjEwPC9vcHRpb24+XHJcbiAgICAgICAgPG9wdGlvbj4yMDoyMCAtIDIwOjUwPC9vcHRpb24+XHJcbiAgICA8L3NlbGVjdD5cclxuPC9kaXY+XHJcbmA7XHJcblxyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSBob3JhcmlvcyA9PiB7XHJcbiAgICByZXR1cm4gYFxyXG48ZGl2IGNsYXNzPVwiY29udGFpbmVyICBib3JkZXIgYm9yZGVyLWRhcmsgIG10LTUgY29sLTZcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJyb3cgXCI+XHJcblxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC14bC1jZW50ZXIgYmFjay1ncmlkIHRleHQtd2hpdGVcIj5cclxuICAgICAgICAgICAgU2VsZWNpb25lIHVtIGhvcsOhcmlvIHBhcmEgY2FkYSBkaWEgZGEgc2VtYW5hOlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuXHJcbjxkaXYgY2xhc3M9XCJtYi0zXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cxIHRleHQtZGFyayBjb2wtNlwiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3cgXCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIG10LTRcIj5cclxuICAgICAgICAgICAgICAgIFNlZ3VuZGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgICBcclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXIgY29sLTYgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzIgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgVGVyw6dhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICR7ZHJvcERvd25Ib3JhcmlvfVxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJjb2wtNiBjb250YWluZXIgYm9yZGVyIGJvcmRlci1kYXJrIGJhY2stZ3JpZHJvdzEgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgUXVhcnRhLWZlaXJhOlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbC02IGNvbnRhaW5lciBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MiB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICBRdWludGEtZmVpcmE6XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgJHtkcm9wRG93bkhvcmFyaW99XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbC02IGNvbnRhaW5lciBib3JkZXIgYm9yZGVyLWRhcmsgYmFjay1ncmlkcm93MSB0ZXh0LWRhcmtcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICBTZXh0YS1mZWlyYTpcclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAke2Ryb3BEb3duSG9yYXJpb31cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29sLTYgY29udGFpbmVyIGJvcmRlciBib3JkZXItZGFyayBiYWNrLWdyaWRyb3cyIHRleHQtZGFya1wiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtNlwiPlxyXG4gICAgICAgICAgICAgICAgU8OhYmFkbzpcclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAke2Ryb3BEb3duSG9yYXJpb31cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcblxyXG5cclxuPGRpdiBjbGFzcz1cIiBjb250YWluZXIgY29sLXNtXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNlbnRlcmVkXCI+XHJcblxyXG4gICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIiBjbGFzcz1cImJ0biBidG4tZGFya1wiIGJvdGFvQ29uZmlybWFyPlxyXG4gICAgICAgICAgICAgICAgQ29uZmlybWFyXHJcbiAgICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrIG1sLTVcIiBib3Rhb0NhbmNlbGFyPlxyXG4gICAgICAgICAgICAgICAgQ2FuY2VsYXJcclxuICAgICAgICAgICAgPC9idXR0b24+XHJcblxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuXHJcbjxwIGNsYXNzPVwidGV4dC1jZW50ZXIgdGV4dC13aGl0ZSBmb250LWl0YWxpYyBwLTNcIj4qKkNhc28gYWxndW0gaG9yw6FyaW8gYXRpbmphIGEgbG90YcOnw6NvIG3DoXhpbWEgZGUgYWx1bm9zLCBvIDxicj4gaG9yw6FyaW8gZmljYXLDoSBlbSB2ZXJtZWxobyBlIG7Do28gcG9kZXLDoSBzZXIgc2VsZWNpb25hZG8uPC9wPlxyXG5cclxuICAgIGBcclxufSIsImV4cG9ydHMucmVuZGVyID0gKCkgPT4ge1xyXG4gICAgcmV0dXJuIGAgPGJvZHk+XHJcbiAgICA8bGFiZWwgY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLXQtODBcIj5BY2Vzc28gZGEgQ29udGE8L2xhYmVsPlxyXG4gICAgPGRpdiBjbGFzcz1cImNhcmRcIiBpZD1cInRlbGFMb2dpblwiPiAgICAgICBcclxuICAgICAgICA8bWFpbj4gICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XHJcbiAgICAgICAgICAgICAgICA8Zm9ybT5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cCByczEgdmFsaWRhdGUtaW5wdXRcIiBkYXRhLXZhbGlkYXRlPVwiQ2FtcG8gb2JyaWdhdMOzcmlvXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwiZm9ybS1jb250cm9sXCIgaWQ9XCJcIiBwbGFjZWhvbGRlcj1cIlVzdcOhcmlvXCIgdXN1YXJpbz5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwIHJzMiB2YWxpZGF0ZS1pbnB1dFwiIGRhdGEtdmFsaWRhdGU9XCJDYW1wbyBvYnJpZ2F0w7NyaW9cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJwYXNzd29yZFwiIGNsYXNzPVwiZm9ybS1jb250cm9sXCIgaWQ9XCJcIiBwbGFjZWhvbGRlcj1cIlNlbmhhXCIgc2VuaGE+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cInN1Ym1pdFwiIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5IGJ0biBidG4tb3V0bGluZS1kYXJrIGJ0bi1sZyBidG4tYmxvY2tcIiBib3Rhb0xvZ2luPkVudHJhcjwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJ0ZXh0LWNlbnRlciB3LWZ1bGwgcC10LTIzXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxhIGhyZWY9XCIjXCIgY2xhc3M9XCJ0ZXh0LXNlY29uZGFyeVwiPlxyXG5cdFx0ICAgIFx0XHRcdFx0XHRFc3F1ZWNldSBhIFNlbmhhPyBFbnRyZSBlbSBDb250YXRvIENvbm9zY28gQ2xpY2FuZG8gQXF1aS5cclxuXHRcdCAgICBcdFx0XHRcdDwvYT5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgIDwvZm9ybT5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9tYWluPlxyXG4gICAgICAgIDxmb290ZXI+PC9mb290ZXI+XHJcbiAgICA8L2Rpdj5cclxuPC9ib2R5PlxyXG48c2NyaXB0IHNyYz1cImh0dHBzOi8vY29kZS5qcXVlcnkuY29tL2pxdWVyeS0zLjMuMS5zbGltLm1pbi5qc1wiIGludGVncml0eT1cInNoYTM4NC1xOGkvWCs5NjVEek8wclQ3YWJLNDFKU3RRSUFxVmdSVnpwYnpvNXNtWEtwNFlmUnZIKzhhYnRURTFQaTZqaXpvXCIgY3Jvc3NvcmlnaW49XCJhbm9ueW1vdXNcIj48L3NjcmlwdD5cclxuPHNjcmlwdCBzcmM9XCJodHRwczovL2NkbmpzLmNsb3VkZmxhcmUuY29tL2FqYXgvbGlicy9wb3BwZXIuanMvMS4xNC43L3VtZC9wb3BwZXIubWluLmpzXCIgaW50ZWdyaXR5PVwic2hhMzg0LVVPMmVUMENwSHFkU0pRNmhKdHk1S1ZwaHRQaHpXajlXTzFjbEhUTUdhM0pEWndyblFxNHNGODZkSUhORHowVzFcIiBjcm9zc29yaWdpbj1cImFub255bW91c1wiPjwvc2NyaXB0PlxyXG48c2NyaXB0IHNyYz1cImh0dHBzOi8vc3RhY2twYXRoLmJvb3RzdHJhcGNkbi5jb20vYm9vdHN0cmFwLzQuMy4xL2pzL2Jvb3RzdHJhcC5taW4uanNcIiBpbnRlZ3JpdHk9XCJzaGEzODQtSmpTbVZneWQwcDNwWEIxclJpYlpVQVlvSUl5Nk9yUTZWcmpJRWFGZi9uSkd6SXhGRHNmNHgweElNK0IwN2pSTVwiIGNyb3Nzb3JpZ2luPVwiYW5vbnltb3VzXCI+PC9zY3JpcHQ+YDtcclxufSIsImV4cG9ydHMucmVuZGVyID0gbG9naW4gPT4ge1xyXG4gICAgcmV0dXJuIGBcclxuICAgIDxkaXYgY3BmQWx1bm89JHtsb2dpbn0+PC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwibGltaXRlclwiPlxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1sb2dpbjEwMFwiPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJ3cmFwLWxvZ2luMTAwIHAtYi0xNjAgcC10LTUwXCI+XHJcblxyXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgU2VsZWNpb25lIHVtYSBzYWxhIHBhcmEgZmF6ZXIgYSBtYXJjYcOnw6NvIGRhcyBhdWxhc1xyXG4gICAgICAgICAgICAgICAgPC9zcGFuPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cIm1lbnUxMDAtZm9ybS1idG4yXCIgYm90YW9NdXNjdWxhY2FvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgTXVzY3VsYcOnw6NvICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cIm1lbnUxMDAtZm9ybS1idG4xXCIgYm90YW9NdWx0aWZ1bmNpb25hbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgTXVsdGlmdW5jaW9uYWxcclxuICAgICAgICAgICAgICAgICAgICA8L2E+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuYDtcclxufSIsImNvbnN0IEdyaWRNYXJjYWNhbyA9IHJlcXVpcmUoJy4vZ3JpZE1hcmNhY2FvLmpzJyk7XHJcblxyXG5leHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBgXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIFwiPlxyXG4gICAgPGRpdj5cclxuICAgICAgICA8c3BhbiBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtMlwiPlxyXG4gICAgICAgICAgICBTYWxhIE11bHRpZnVuY2lvbmFsICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICA8L3NwYW4+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcblxyXG4ke0dyaWRNYXJjYWNhby5yZW5kZXIoKX1cclxuXHJcbmA7XHJcbn0iLCJjb25zdCBHcmlkTWFyY2FjYW8gPSByZXF1aXJlKCcuL2dyaWRNYXJjYWNhby5qcycpO1xyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSBob3JhcmlvcyA9PiB7XHJcbiAgICByZXR1cm4gYFxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lciBcIj5cclxuICAgIDxkaXY+XHJcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLTJcIj5cclxuICAgICAgICAgICAgU2FsYSBNdXNjdWxhY2FvICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICA8L3NwYW4+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcblxyXG4ke0dyaWRNYXJjYWNhby5yZW5kZXIoaG9yYXJpb3MpfVxyXG5cclxuYDtcclxufSIsImNvbnN0IEFwcCA9IHJlcXVpcmUoXCIuL2FwcC5qc1wiKTtcclxuXHJcbndpbmRvdy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICBjb25zdCBtYWluID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIm1haW5cIik7XHJcbiAgICBuZXcgQXBwKG1haW4pLmluaXQoKTtcclxufSJdfQ==
