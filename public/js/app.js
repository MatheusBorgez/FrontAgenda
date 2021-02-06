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

},{"../templates/multifuncional.js":17,"./sala.js":11}],10:[function(require,module,exports){
const Template = require("../templates/musculacao.js");
const Sala = require("./sala.js");

class Musculacao extends Sala {
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

