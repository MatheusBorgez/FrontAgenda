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

class App {
    constructor(body) {
        this.login = new Login(body);
        this.administracao = new Administracao(body);
        this.menu = new Menu(body);
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
        this.login.on("loginAluno", () => this.menu.render());
    }

    administracaoEvents() {
        //this.administracao.on("preenchaGrid", );
    }
}

module.exports = App;

},{"./components/administracao.js":4,"./components/login.js":7,"./components/menu.js":8}],4:[function(require,module,exports){
const Agenda = require("./agenda.js");
const Template = require("../templates/administracao.js");
const TemplateModal = require("../templates/cadastroAluno.js");
const Login = require("./login.js");
const CadastroAluno = require("./cadastroAluno.js");

class Administracao extends Agenda {

    constructor(body) {
        super();
        this.body = body;
        this.login = new Login(body);
        this.cadastroAluno = new CadastroAluno(body);
    }

    render() {
        this.renderGridAlunos();
        this.ehEdicao = false;
    }

    addEventListener() {
        this.logout();
        this.clickBotaoAdicionar();
        this.clickBotaoEditar();
        // this.clickBotaoExcluir();
    }

    logout() {
        this.body.querySelector("[botaoShutdown]").onclick = () => this.login.render();
    }

    clickBotaoAdicionar() {

        this.ehEdicao = false;
    }

    clickBotaoEditar() {

        this.ehEdicao = true;
    }

    salveAluno() {
        if (this.ehEdicao) {

            this.cadastroAluno.editeAluno();
        } else {
            this.cadastroAluno.insiraAluno();
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
}

module.exports = Administracao;

},{"../templates/administracao.js":9,"../templates/cadastroAluno.js":10,"./agenda.js":5,"./cadastroAluno.js":6,"./login.js":7}],5:[function(require,module,exports){
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
        this.login = new Login(body);
    }

    insiraAluno() {}

    editeAluno() {}

    excluaAluno() {}

}

module.exports = CadastroAluno;

},{"../templates/cadastroAluno.js":10,"./agenda.js":5,"./login.js":7}],7:[function(require,module,exports){
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
                this.emit("loginAluno", data);
            }
        }
    }

    esqueceuSenha() {
        //codigo pra chamar em URL
    }
}

module.exports = Login;

},{"../templates/login.js":11,"./agenda.js":5}],8:[function(require,module,exports){
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
        //this.addEventListener("Load", )
    }
}

module.exports = Menu;

},{"../templates/menu.js":12,"./agenda.js":5}],9:[function(require,module,exports){
const ModalCadastroAluno = require("./cadastroAluno.js");

const renderGridAlunos = alunos => {
    return alunos.map(aluno => {

        let corLinha = aluno.id % 2 === 0 ? "back-gridrow1" : "back-gridrow2";

        return `
        <div class="row ${corLinha} text-dark">
            <div codigoAluno=${aluno.id}></div>
            <div class="col-sm">
                <div class="form-group form-check">
                    <input type="checkbox" class="form-check-input mt-4" id="exampleCheck1">
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

},{"./cadastroAluno.js":10}],10:[function(require,module,exports){
const inputEndereco = `
<div class="row">
                        <div class="col-sm">
                            <label for="cep">CEP</label>
                            <input class="border border-dark" id="cep" type="text" required/>
                        </div>
                        <div class="col-sm">
                            <label for="logradouro">Logradouro</label>
                            <input class="border border-dark" id="logradouro" type="text" required/>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-sm">
                            <label for="numero">Número</label>
                            <input class="border border-dark" id="numero" type="text" />
                        </div>
                        <div class="col-sm">
                            <label for="complemento">Complemento</label>
                            <input class="border border-dark" id="complemento" type="text" />
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-sm">
                            <label for="bairro">Bairro</label>
                            <input class="border border-dark" id="bairro" type="text" required/>
                        </div>

                        <div class="col-sm">
                            <label for="cidade">Cidade</label>
                            <input class="border border-dark" id="cidade" type="text" required/>
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
            
            <div class="modal-body">
                <form>
                    <div class="row">
                        <div class="col-sm">
                            <label>Nome Completo</label>
                            <input class="border border-dark col-sm">
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-sm" id="include_date">
                            <label>Data de Nascimento</label>
                            <input class="border border-dark col-sm">
                        </div>
                        <div class="col-sm">
                            <label for="cpf">CPF</label>
                            <input id="cpf" type="text" autocomplete="off" onkeyup="MaskCpf('___.___.___-__', this)" class="border border-dark">
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-sm">
                            <label for="tel">Telefone</label>
                            <input id="tel" type="text" autocomplete="off" onkeyup="MaskTel('(__)_____-____', this)" class="border border-dark">
                        </div>
                        <div class="col-sm">
                            <label for="email">E-mail</label>
                            <input id="email" type="text" class="border border-dark">
                        </div>
                    </div>                    

                    ${inputEndereco}

                </form>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">Fechar</button>
                <button type="submit" class="btn btn-primary">Salvar</button>
            </div>
        </div>
    </div>
</div>
`;

exports.render = () => {
    return modalCadastroAluno;
};

},{}],11:[function(require,module,exports){
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

                    <button type="submit" class="btn btn-primary btn btn-outline-dark btn-lg btn-block" href="menu.html" botaoLogin>Entrar</button>
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

},{}],12:[function(require,module,exports){
exports.render = () => {
    return `<head>
    <div class="limiter">
    <div class="container-login100">
        <div class="wrap-login100 p-b-160 p-t-50">

            <span class="login100-form-title p-b-43">
                    Selecione uma sala para fazer a marcação das aulas
                </span>

            <div class="container-menu100-btn">
                <button onclick="tela_musc()" class="menu100-form-btn2">
                            Musculação                            
                </button>
            </div>

            <div class="container-menu100-btn">
                <button onclick="tela_mult()" class="menu100-form-btn1">
                        Multifuncional
                    </a>
                    </button>
            </div>

        </div>
    </div>
</div>
`;
};

},{}],13:[function(require,module,exports){
const App = require("./app.js");

window.onload = () => {
    const main = document.querySelector("main");
    new App(main).init();
};

},{"./app.js":3}]},{},[13])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXF1ZXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RpbnktZW1pdHRlci9pbmRleC5qcyIsInNyYy9hcHAuanMiLCJzcmMvY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzIiwic3JjL2NvbXBvbmVudHMvYWdlbmRhLmpzIiwic3JjL2NvbXBvbmVudHMvY2FkYXN0cm9BbHVuby5qcyIsInNyYy9jb21wb25lbnRzL2xvZ2luLmpzIiwic3JjL2NvbXBvbmVudHMvbWVudS5qcyIsInNyYy90ZW1wbGF0ZXMvYWRtaW5pc3RyYWNhby5qcyIsInNyYy90ZW1wbGF0ZXMvY2FkYXN0cm9BbHVuby5qcyIsInNyYy90ZW1wbGF0ZXMvbG9naW4uanMiLCJzcmMvdGVtcGxhdGVzL21lbnUuanMiLCJpbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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LE1BQU07QUFDbEIsVUFBTSxPQUFPLFNBQVMsYUFBVCxDQUF1QixNQUF2QixDQUFiO0FBQ0EsUUFBSSxHQUFKLENBQVEsSUFBUixFQUFjLElBQWQ7QUFDSCxDQUhEIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiLy8gQnJvd3NlciBSZXF1ZXN0XHJcbi8vXHJcbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XHJcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cclxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XHJcbi8vXHJcbi8vICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcclxuLy9cclxuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxyXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXHJcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxyXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXHJcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxyXG5cclxuLy8gVU1EIEhFQURFUiBTVEFSVCBcclxuKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XHJcbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgICAgLy8gQU1ELiBSZWdpc3RlciBhcyBhbiBhbm9ueW1vdXMgbW9kdWxlLlxyXG4gICAgICAgIGRlZmluZShbXSwgZmFjdG9yeSk7XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIC8vIE5vZGUuIERvZXMgbm90IHdvcmsgd2l0aCBzdHJpY3QgQ29tbW9uSlMsIGJ1dFxyXG4gICAgICAgIC8vIG9ubHkgQ29tbW9uSlMtbGlrZSBlbnZpcm9tZW50cyB0aGF0IHN1cHBvcnQgbW9kdWxlLmV4cG9ydHMsXHJcbiAgICAgICAgLy8gbGlrZSBOb2RlLlxyXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBCcm93c2VyIGdsb2JhbHMgKHJvb3QgaXMgd2luZG93KVxyXG4gICAgICAgIHJvb3QucmV0dXJuRXhwb3J0cyA9IGZhY3RvcnkoKTtcclxuICB9XHJcbn0odGhpcywgZnVuY3Rpb24gKCkge1xyXG4vLyBVTUQgSEVBREVSIEVORFxyXG5cclxudmFyIFhIUiA9IFhNTEh0dHBSZXF1ZXN0XHJcbmlmICghWEhSKSB0aHJvdyBuZXcgRXJyb3IoJ21pc3NpbmcgWE1MSHR0cFJlcXVlc3QnKVxyXG5yZXF1ZXN0LmxvZyA9IHtcclxuICAndHJhY2UnOiBub29wLCAnZGVidWcnOiBub29wLCAnaW5mbyc6IG5vb3AsICd3YXJuJzogbm9vcCwgJ2Vycm9yJzogbm9vcFxyXG59XHJcblxyXG52YXIgREVGQVVMVF9USU1FT1VUID0gMyAqIDYwICogMTAwMCAvLyAzIG1pbnV0ZXNcclxuXHJcbi8vXHJcbi8vIHJlcXVlc3RcclxuLy9cclxuXHJcbmZ1bmN0aW9uIHJlcXVlc3Qob3B0aW9ucywgY2FsbGJhY2spIHtcclxuICAvLyBUaGUgZW50cnktcG9pbnQgdG8gdGhlIEFQSTogcHJlcCB0aGUgb3B0aW9ucyBvYmplY3QgYW5kIHBhc3MgdGhlIHJlYWwgd29yayB0byBydW5feGhyLlxyXG4gIGlmKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJylcclxuICAgIHRocm93IG5ldyBFcnJvcignQmFkIGNhbGxiYWNrIGdpdmVuOiAnICsgY2FsbGJhY2spXHJcblxyXG4gIGlmKCFvcHRpb25zKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBvcHRpb25zIGdpdmVuJylcclxuXHJcbiAgdmFyIG9wdGlvbnNfb25SZXNwb25zZSA9IG9wdGlvbnMub25SZXNwb25zZTsgLy8gU2F2ZSB0aGlzIGZvciBsYXRlci5cclxuXHJcbiAgaWYodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnKVxyXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfTtcclxuICBlbHNlXHJcbiAgICBvcHRpb25zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRpb25zKSk7IC8vIFVzZSBhIGR1cGxpY2F0ZSBmb3IgbXV0YXRpbmcuXHJcblxyXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnNfb25SZXNwb25zZSAvLyBBbmQgcHV0IGl0IGJhY2suXHJcblxyXG4gIGlmIChvcHRpb25zLnZlcmJvc2UpIHJlcXVlc3QubG9nID0gZ2V0TG9nZ2VyKCk7XHJcblxyXG4gIGlmKG9wdGlvbnMudXJsKSB7XHJcbiAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJsO1xyXG4gICAgZGVsZXRlIG9wdGlvbnMudXJsO1xyXG4gIH1cclxuXHJcbiAgaWYoIW9wdGlvbnMudXJpICYmIG9wdGlvbnMudXJpICE9PSBcIlwiKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy51cmkgaXMgYSByZXF1aXJlZCBhcmd1bWVudFwiKTtcclxuXHJcbiAgaWYodHlwZW9mIG9wdGlvbnMudXJpICE9IFwic3RyaW5nXCIpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLnVyaSBtdXN0IGJlIGEgc3RyaW5nXCIpO1xyXG5cclxuICB2YXIgdW5zdXBwb3J0ZWRfb3B0aW9ucyA9IFsncHJveHknLCAnX3JlZGlyZWN0c0ZvbGxvd2VkJywgJ21heFJlZGlyZWN0cycsICdmb2xsb3dSZWRpcmVjdCddXHJcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bnN1cHBvcnRlZF9vcHRpb25zLmxlbmd0aDsgaSsrKVxyXG4gICAgaWYob3B0aW9uc1sgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSBdKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLlwiICsgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSArIFwiIGlzIG5vdCBzdXBwb3J0ZWRcIilcclxuXHJcbiAgb3B0aW9ucy5jYWxsYmFjayA9IGNhbGxiYWNrXHJcbiAgb3B0aW9ucy5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCAnR0VUJztcclxuICBvcHRpb25zLmhlYWRlcnMgPSBvcHRpb25zLmhlYWRlcnMgfHwge307XHJcbiAgb3B0aW9ucy5ib2R5ICAgID0gb3B0aW9ucy5ib2R5IHx8IG51bGxcclxuICBvcHRpb25zLnRpbWVvdXQgPSBvcHRpb25zLnRpbWVvdXQgfHwgcmVxdWVzdC5ERUZBVUxUX1RJTUVPVVRcclxuXHJcbiAgaWYob3B0aW9ucy5oZWFkZXJzLmhvc3QpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJPcHRpb25zLmhlYWRlcnMuaG9zdCBpcyBub3Qgc3VwcG9ydGVkXCIpO1xyXG5cclxuICBpZihvcHRpb25zLmpzb24pIHtcclxuICAgIG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgPSBvcHRpb25zLmhlYWRlcnMuYWNjZXB0IHx8ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG4gICAgaWYob3B0aW9ucy5tZXRob2QgIT09ICdHRVQnKVxyXG4gICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gJ2FwcGxpY2F0aW9uL2pzb24nXHJcblxyXG4gICAgaWYodHlwZW9mIG9wdGlvbnMuanNvbiAhPT0gJ2Jvb2xlYW4nKVxyXG4gICAgICBvcHRpb25zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXHJcbiAgICBlbHNlIGlmKHR5cGVvZiBvcHRpb25zLmJvZHkgIT09ICdzdHJpbmcnKVxyXG4gICAgICBvcHRpb25zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmJvZHkpXHJcbiAgfVxyXG4gIFxyXG4gIC8vQkVHSU4gUVMgSGFja1xyXG4gIHZhciBzZXJpYWxpemUgPSBmdW5jdGlvbihvYmopIHtcclxuICAgIHZhciBzdHIgPSBbXTtcclxuICAgIGZvcih2YXIgcCBpbiBvYmopXHJcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcclxuICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcclxuICAgICAgfVxyXG4gICAgcmV0dXJuIHN0ci5qb2luKFwiJlwiKTtcclxuICB9XHJcbiAgXHJcbiAgaWYob3B0aW9ucy5xcyl7XHJcbiAgICB2YXIgcXMgPSAodHlwZW9mIG9wdGlvbnMucXMgPT0gJ3N0cmluZycpPyBvcHRpb25zLnFzIDogc2VyaWFsaXplKG9wdGlvbnMucXMpO1xyXG4gICAgaWYob3B0aW9ucy51cmkuaW5kZXhPZignPycpICE9PSAtMSl7IC8vbm8gZ2V0IHBhcmFtc1xyXG4gICAgICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmkrJyYnK3FzO1xyXG4gICAgfWVsc2V7IC8vZXhpc3RpbmcgZ2V0IHBhcmFtc1xyXG4gICAgICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmkrJz8nK3FzO1xyXG4gICAgfVxyXG4gIH1cclxuICAvL0VORCBRUyBIYWNrXHJcbiAgXHJcbiAgLy9CRUdJTiBGT1JNIEhhY2tcclxuICB2YXIgbXVsdGlwYXJ0ID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICAvL3RvZG86IHN1cHBvcnQgZmlsZSB0eXBlICh1c2VmdWw/KVxyXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xyXG4gICAgcmVzdWx0LmJvdW5kcnkgPSAnLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLScrTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpKjEwMDAwMDAwMDApO1xyXG4gICAgdmFyIGxpbmVzID0gW107XHJcbiAgICBmb3IodmFyIHAgaW4gb2JqKXtcclxuICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XHJcbiAgICAgICAgICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgICAgICAgICAnLS0nK3Jlc3VsdC5ib3VuZHJ5K1wiXFxuXCIrXHJcbiAgICAgICAgICAgICAgICAnQ29udGVudC1EaXNwb3NpdGlvbjogZm9ybS1kYXRhOyBuYW1lPVwiJytwKydcIicrXCJcXG5cIitcclxuICAgICAgICAgICAgICAgIFwiXFxuXCIrXHJcbiAgICAgICAgICAgICAgICBvYmpbcF0rXCJcXG5cIlxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGxpbmVzLnB1c2goICctLScrcmVzdWx0LmJvdW5kcnkrJy0tJyApO1xyXG4gICAgcmVzdWx0LmJvZHkgPSBsaW5lcy5qb2luKCcnKTtcclxuICAgIHJlc3VsdC5sZW5ndGggPSByZXN1bHQuYm9keS5sZW5ndGg7XHJcbiAgICByZXN1bHQudHlwZSA9ICdtdWx0aXBhcnQvZm9ybS1kYXRhOyBib3VuZGFyeT0nK3Jlc3VsdC5ib3VuZHJ5O1xyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxuICB9XHJcbiAgXHJcbiAgaWYob3B0aW9ucy5mb3JtKXtcclxuICAgIGlmKHR5cGVvZiBvcHRpb25zLmZvcm0gPT0gJ3N0cmluZycpIHRocm93KCdmb3JtIG5hbWUgdW5zdXBwb3J0ZWQnKTtcclxuICAgIGlmKG9wdGlvbnMubWV0aG9kID09PSAnUE9TVCcpe1xyXG4gICAgICAgIHZhciBlbmNvZGluZyA9IChvcHRpb25zLmVuY29kaW5nIHx8ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBlbmNvZGluZztcclxuICAgICAgICBzd2l0Y2goZW5jb2Rpbmcpe1xyXG4gICAgICAgICAgICBjYXNlICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOlxyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5ib2R5ID0gc2VyaWFsaXplKG9wdGlvbnMuZm9ybSkucmVwbGFjZSgvJTIwL2csIFwiK1wiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdtdWx0aXBhcnQvZm9ybS1kYXRhJzpcclxuICAgICAgICAgICAgICAgIHZhciBtdWx0aSA9IG11bHRpcGFydChvcHRpb25zLmZvcm0pO1xyXG4gICAgICAgICAgICAgICAgLy9vcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBtdWx0aS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmJvZHkgPSBtdWx0aS5ib2R5O1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IG11bHRpLnR5cGU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdCA6IHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgZW5jb2Rpbmc6JytlbmNvZGluZyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICAvL0VORCBGT1JNIEhhY2tcclxuXHJcbiAgLy8gSWYgb25SZXNwb25zZSBpcyBib29sZWFuIHRydWUsIGNhbGwgYmFjayBpbW1lZGlhdGVseSB3aGVuIHRoZSByZXNwb25zZSBpcyBrbm93bixcclxuICAvLyBub3Qgd2hlbiB0aGUgZnVsbCByZXF1ZXN0IGlzIGNvbXBsZXRlLlxyXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnMub25SZXNwb25zZSB8fCBub29wXHJcbiAgaWYob3B0aW9ucy5vblJlc3BvbnNlID09PSB0cnVlKSB7XHJcbiAgICBvcHRpb25zLm9uUmVzcG9uc2UgPSBjYWxsYmFja1xyXG4gICAgb3B0aW9ucy5jYWxsYmFjayA9IG5vb3BcclxuICB9XHJcblxyXG4gIC8vIFhYWCBCcm93c2VycyBkbyBub3QgbGlrZSB0aGlzLlxyXG4gIC8vaWYob3B0aW9ucy5ib2R5KVxyXG4gIC8vICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBvcHRpb25zLmJvZHkubGVuZ3RoO1xyXG5cclxuICAvLyBIVFRQIGJhc2ljIGF1dGhlbnRpY2F0aW9uXHJcbiAgaWYoIW9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uICYmIG9wdGlvbnMuYXV0aClcclxuICAgIG9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uID0gJ0Jhc2ljICcgKyBiNjRfZW5jKG9wdGlvbnMuYXV0aC51c2VybmFtZSArICc6JyArIG9wdGlvbnMuYXV0aC5wYXNzd29yZCk7XHJcblxyXG4gIHJldHVybiBydW5feGhyKG9wdGlvbnMpXHJcbn1cclxuXHJcbnZhciByZXFfc2VxID0gMFxyXG5mdW5jdGlvbiBydW5feGhyKG9wdGlvbnMpIHtcclxuICB2YXIgeGhyID0gbmV3IFhIUlxyXG4gICAgLCB0aW1lZF9vdXQgPSBmYWxzZVxyXG4gICAgLCBpc19jb3JzID0gaXNfY3Jvc3NEb21haW4ob3B0aW9ucy51cmkpXHJcbiAgICAsIHN1cHBvcnRzX2NvcnMgPSAoJ3dpdGhDcmVkZW50aWFscycgaW4geGhyKVxyXG5cclxuICByZXFfc2VxICs9IDFcclxuICB4aHIuc2VxX2lkID0gcmVxX3NlcVxyXG4gIHhoci5pZCA9IHJlcV9zZXEgKyAnOiAnICsgb3B0aW9ucy5tZXRob2QgKyAnICcgKyBvcHRpb25zLnVyaVxyXG4gIHhoci5faWQgPSB4aHIuaWQgLy8gSSBrbm93IEkgd2lsbCB0eXBlIFwiX2lkXCIgZnJvbSBoYWJpdCBhbGwgdGhlIHRpbWUuXHJcblxyXG4gIGlmKGlzX2NvcnMgJiYgIXN1cHBvcnRzX2NvcnMpIHtcclxuICAgIHZhciBjb3JzX2VyciA9IG5ldyBFcnJvcignQnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IGNyb3NzLW9yaWdpbiByZXF1ZXN0OiAnICsgb3B0aW9ucy51cmkpXHJcbiAgICBjb3JzX2Vyci5jb3JzID0gJ3Vuc3VwcG9ydGVkJ1xyXG4gICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcclxuICB9XHJcblxyXG4gIHhoci50aW1lb3V0VGltZXIgPSBzZXRUaW1lb3V0KHRvb19sYXRlLCBvcHRpb25zLnRpbWVvdXQpXHJcbiAgZnVuY3Rpb24gdG9vX2xhdGUoKSB7XHJcbiAgICB0aW1lZF9vdXQgPSB0cnVlXHJcbiAgICB2YXIgZXIgPSBuZXcgRXJyb3IoJ0VUSU1FRE9VVCcpXHJcbiAgICBlci5jb2RlID0gJ0VUSU1FRE9VVCdcclxuICAgIGVyLmR1cmF0aW9uID0gb3B0aW9ucy50aW1lb3V0XHJcblxyXG4gICAgcmVxdWVzdC5sb2cuZXJyb3IoJ1RpbWVvdXQnLCB7ICdpZCc6eGhyLl9pZCwgJ21pbGxpc2Vjb25kcyc6b3B0aW9ucy50aW1lb3V0IH0pXHJcbiAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKVxyXG4gIH1cclxuXHJcbiAgLy8gU29tZSBzdGF0ZXMgY2FuIGJlIHNraXBwZWQgb3Zlciwgc28gcmVtZW1iZXIgd2hhdCBpcyBzdGlsbCBpbmNvbXBsZXRlLlxyXG4gIHZhciBkaWQgPSB7J3Jlc3BvbnNlJzpmYWxzZSwgJ2xvYWRpbmcnOmZhbHNlLCAnZW5kJzpmYWxzZX1cclxuXHJcbiAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IG9uX3N0YXRlX2NoYW5nZVxyXG4gIHhoci5vcGVuKG9wdGlvbnMubWV0aG9kLCBvcHRpb25zLnVyaSwgdHJ1ZSkgLy8gYXN5bmNocm9ub3VzXHJcbiAgaWYoaXNfY29ycylcclxuICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSAhISBvcHRpb25zLndpdGhDcmVkZW50aWFsc1xyXG4gIHhoci5zZW5kKG9wdGlvbnMuYm9keSlcclxuICByZXR1cm4geGhyXHJcblxyXG4gIGZ1bmN0aW9uIG9uX3N0YXRlX2NoYW5nZShldmVudCkge1xyXG4gICAgaWYodGltZWRfb3V0KVxyXG4gICAgICByZXR1cm4gcmVxdWVzdC5sb2cuZGVidWcoJ0lnbm9yaW5nIHRpbWVkIG91dCBzdGF0ZSBjaGFuZ2UnLCB7J3N0YXRlJzp4aHIucmVhZHlTdGF0ZSwgJ2lkJzp4aHIuaWR9KVxyXG5cclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdTdGF0ZSBjaGFuZ2UnLCB7J3N0YXRlJzp4aHIucmVhZHlTdGF0ZSwgJ2lkJzp4aHIuaWQsICd0aW1lZF9vdXQnOnRpbWVkX291dH0pXHJcblxyXG4gICAgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5PUEVORUQpIHtcclxuICAgICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3Qgc3RhcnRlZCcsIHsnaWQnOnhoci5pZH0pXHJcbiAgICAgIGZvciAodmFyIGtleSBpbiBvcHRpb25zLmhlYWRlcnMpXHJcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBvcHRpb25zLmhlYWRlcnNba2V5XSlcclxuICAgIH1cclxuXHJcbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuSEVBREVSU19SRUNFSVZFRClcclxuICAgICAgb25fcmVzcG9uc2UoKVxyXG5cclxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5MT0FESU5HKSB7XHJcbiAgICAgIG9uX3Jlc3BvbnNlKClcclxuICAgICAgb25fbG9hZGluZygpXHJcbiAgICB9XHJcblxyXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkRPTkUpIHtcclxuICAgICAgb25fcmVzcG9uc2UoKVxyXG4gICAgICBvbl9sb2FkaW5nKClcclxuICAgICAgb25fZW5kKClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG9uX3Jlc3BvbnNlKCkge1xyXG4gICAgaWYoZGlkLnJlc3BvbnNlKVxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBkaWQucmVzcG9uc2UgPSB0cnVlXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnR290IHJlc3BvbnNlJywgeydpZCc6eGhyLmlkLCAnc3RhdHVzJzp4aHIuc3RhdHVzfSlcclxuICAgIGNsZWFyVGltZW91dCh4aHIudGltZW91dFRpbWVyKVxyXG4gICAgeGhyLnN0YXR1c0NvZGUgPSB4aHIuc3RhdHVzIC8vIE5vZGUgcmVxdWVzdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgLy8gRGV0ZWN0IGZhaWxlZCBDT1JTIHJlcXVlc3RzLlxyXG4gICAgaWYoaXNfY29ycyAmJiB4aHIuc3RhdHVzQ29kZSA9PSAwKSB7XHJcbiAgICAgIHZhciBjb3JzX2VyciA9IG5ldyBFcnJvcignQ09SUyByZXF1ZXN0IHJlamVjdGVkOiAnICsgb3B0aW9ucy51cmkpXHJcbiAgICAgIGNvcnNfZXJyLmNvcnMgPSAncmVqZWN0ZWQnXHJcblxyXG4gICAgICAvLyBEbyBub3QgcHJvY2VzcyB0aGlzIHJlcXVlc3QgZnVydGhlci5cclxuICAgICAgZGlkLmxvYWRpbmcgPSB0cnVlXHJcbiAgICAgIGRpZC5lbmQgPSB0cnVlXHJcblxyXG4gICAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxyXG4gICAgfVxyXG5cclxuICAgIG9wdGlvbnMub25SZXNwb25zZShudWxsLCB4aHIpXHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBvbl9sb2FkaW5nKCkge1xyXG4gICAgaWYoZGlkLmxvYWRpbmcpXHJcbiAgICAgIHJldHVyblxyXG5cclxuICAgIGRpZC5sb2FkaW5nID0gdHJ1ZVxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1Jlc3BvbnNlIGJvZHkgbG9hZGluZycsIHsnaWQnOnhoci5pZH0pXHJcbiAgICAvLyBUT0RPOiBNYXliZSBzaW11bGF0ZSBcImRhdGFcIiBldmVudHMgYnkgd2F0Y2hpbmcgeGhyLnJlc3BvbnNlVGV4dFxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gb25fZW5kKCkge1xyXG4gICAgaWYoZGlkLmVuZClcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAgZGlkLmVuZCA9IHRydWVcclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IGRvbmUnLCB7J2lkJzp4aHIuaWR9KVxyXG5cclxuICAgIHhoci5ib2R5ID0geGhyLnJlc3BvbnNlVGV4dFxyXG4gICAgaWYob3B0aW9ucy5qc29uKSB7XHJcbiAgICAgIHRyeSAgICAgICAgeyB4aHIuYm9keSA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCkgfVxyXG4gICAgICBjYXRjaCAoZXIpIHsgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soZXIsIHhocikgICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBvcHRpb25zLmNhbGxiYWNrKG51bGwsIHhociwgeGhyLmJvZHkpXHJcbiAgfVxyXG5cclxufSAvLyByZXF1ZXN0XHJcblxyXG5yZXF1ZXN0LndpdGhDcmVkZW50aWFscyA9IGZhbHNlO1xyXG5yZXF1ZXN0LkRFRkFVTFRfVElNRU9VVCA9IERFRkFVTFRfVElNRU9VVDtcclxuXHJcbi8vXHJcbi8vIGRlZmF1bHRzXHJcbi8vXHJcblxyXG5yZXF1ZXN0LmRlZmF1bHRzID0gZnVuY3Rpb24ob3B0aW9ucywgcmVxdWVzdGVyKSB7XHJcbiAgdmFyIGRlZiA9IGZ1bmN0aW9uIChtZXRob2QpIHtcclxuICAgIHZhciBkID0gZnVuY3Rpb24gKHBhcmFtcywgY2FsbGJhY2spIHtcclxuICAgICAgaWYodHlwZW9mIHBhcmFtcyA9PT0gJ3N0cmluZycpXHJcbiAgICAgICAgcGFyYW1zID0geyd1cmknOiBwYXJhbXN9O1xyXG4gICAgICBlbHNlIHtcclxuICAgICAgICBwYXJhbXMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KHBhcmFtcykpO1xyXG4gICAgICB9XHJcbiAgICAgIGZvciAodmFyIGkgaW4gb3B0aW9ucykge1xyXG4gICAgICAgIGlmIChwYXJhbXNbaV0gPT09IHVuZGVmaW5lZCkgcGFyYW1zW2ldID0gb3B0aW9uc1tpXVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBtZXRob2QocGFyYW1zLCBjYWxsYmFjaylcclxuICAgIH1cclxuICAgIHJldHVybiBkXHJcbiAgfVxyXG4gIHZhciBkZSA9IGRlZihyZXF1ZXN0KVxyXG4gIGRlLmdldCA9IGRlZihyZXF1ZXN0LmdldClcclxuICBkZS5wb3N0ID0gZGVmKHJlcXVlc3QucG9zdClcclxuICBkZS5wdXQgPSBkZWYocmVxdWVzdC5wdXQpXHJcbiAgZGUuaGVhZCA9IGRlZihyZXF1ZXN0LmhlYWQpXHJcbiAgcmV0dXJuIGRlXHJcbn1cclxuXHJcbi8vXHJcbi8vIEhUVFAgbWV0aG9kIHNob3J0Y3V0c1xyXG4vL1xyXG5cclxudmFyIHNob3J0Y3V0cyA9IFsgJ2dldCcsICdwdXQnLCAncG9zdCcsICdoZWFkJyBdO1xyXG5zaG9ydGN1dHMuZm9yRWFjaChmdW5jdGlvbihzaG9ydGN1dCkge1xyXG4gIHZhciBtZXRob2QgPSBzaG9ydGN1dC50b1VwcGVyQ2FzZSgpO1xyXG4gIHZhciBmdW5jICAgPSBzaG9ydGN1dC50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICByZXF1ZXN0W2Z1bmNdID0gZnVuY3Rpb24ob3B0cykge1xyXG4gICAgaWYodHlwZW9mIG9wdHMgPT09ICdzdHJpbmcnKVxyXG4gICAgICBvcHRzID0geydtZXRob2QnOm1ldGhvZCwgJ3VyaSc6b3B0c307XHJcbiAgICBlbHNlIHtcclxuICAgICAgb3B0cyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0cykpO1xyXG4gICAgICBvcHRzLm1ldGhvZCA9IG1ldGhvZDtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYXJncyA9IFtvcHRzXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmFwcGx5KGFyZ3VtZW50cywgWzFdKSk7XHJcbiAgICByZXR1cm4gcmVxdWVzdC5hcHBseSh0aGlzLCBhcmdzKTtcclxuICB9XHJcbn0pXHJcblxyXG4vL1xyXG4vLyBDb3VjaERCIHNob3J0Y3V0XHJcbi8vXHJcblxyXG5yZXF1ZXN0LmNvdWNoID0gZnVuY3Rpb24ob3B0aW9ucywgY2FsbGJhY2spIHtcclxuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXHJcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9XHJcblxyXG4gIC8vIEp1c3QgdXNlIHRoZSByZXF1ZXN0IEFQSSB0byBkbyBKU09OLlxyXG4gIG9wdGlvbnMuanNvbiA9IHRydWVcclxuICBpZihvcHRpb25zLmJvZHkpXHJcbiAgICBvcHRpb25zLmpzb24gPSBvcHRpb25zLmJvZHlcclxuICBkZWxldGUgb3B0aW9ucy5ib2R5XHJcblxyXG4gIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgbm9vcFxyXG5cclxuICB2YXIgeGhyID0gcmVxdWVzdChvcHRpb25zLCBjb3VjaF9oYW5kbGVyKVxyXG4gIHJldHVybiB4aHJcclxuXHJcbiAgZnVuY3Rpb24gY291Y2hfaGFuZGxlcihlciwgcmVzcCwgYm9keSkge1xyXG4gICAgaWYoZXIpXHJcbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSlcclxuXHJcbiAgICBpZigocmVzcC5zdGF0dXNDb2RlIDwgMjAwIHx8IHJlc3Auc3RhdHVzQ29kZSA+IDI5OSkgJiYgYm9keS5lcnJvcikge1xyXG4gICAgICAvLyBUaGUgYm9keSBpcyBhIENvdWNoIEpTT04gb2JqZWN0IGluZGljYXRpbmcgdGhlIGVycm9yLlxyXG4gICAgICBlciA9IG5ldyBFcnJvcignQ291Y2hEQiBlcnJvcjogJyArIChib2R5LmVycm9yLnJlYXNvbiB8fCBib2R5LmVycm9yLmVycm9yKSlcclxuICAgICAgZm9yICh2YXIga2V5IGluIGJvZHkpXHJcbiAgICAgICAgZXJba2V5XSA9IGJvZHlba2V5XVxyXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XHJcbiAgfVxyXG59XHJcblxyXG4vL1xyXG4vLyBVdGlsaXR5XHJcbi8vXHJcblxyXG5mdW5jdGlvbiBub29wKCkge31cclxuXHJcbmZ1bmN0aW9uIGdldExvZ2dlcigpIHtcclxuICB2YXIgbG9nZ2VyID0ge31cclxuICAgICwgbGV2ZWxzID0gWyd0cmFjZScsICdkZWJ1ZycsICdpbmZvJywgJ3dhcm4nLCAnZXJyb3InXVxyXG4gICAgLCBsZXZlbCwgaVxyXG5cclxuICBmb3IoaSA9IDA7IGkgPCBsZXZlbHMubGVuZ3RoOyBpKyspIHtcclxuICAgIGxldmVsID0gbGV2ZWxzW2ldXHJcblxyXG4gICAgbG9nZ2VyW2xldmVsXSA9IG5vb3BcclxuICAgIGlmKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlICYmIGNvbnNvbGVbbGV2ZWxdKVxyXG4gICAgICBsb2dnZXJbbGV2ZWxdID0gZm9ybWF0dGVkKGNvbnNvbGUsIGxldmVsKVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGxvZ2dlclxyXG59XHJcblxyXG5mdW5jdGlvbiBmb3JtYXR0ZWQob2JqLCBtZXRob2QpIHtcclxuICByZXR1cm4gZm9ybWF0dGVkX2xvZ2dlclxyXG5cclxuICBmdW5jdGlvbiBmb3JtYXR0ZWRfbG9nZ2VyKHN0ciwgY29udGV4dCkge1xyXG4gICAgaWYodHlwZW9mIGNvbnRleHQgPT09ICdvYmplY3QnKVxyXG4gICAgICBzdHIgKz0gJyAnICsgSlNPTi5zdHJpbmdpZnkoY29udGV4dClcclxuXHJcbiAgICByZXR1cm4gb2JqW21ldGhvZF0uY2FsbChvYmosIHN0cilcclxuICB9XHJcbn1cclxuXHJcbi8vIFJldHVybiB3aGV0aGVyIGEgVVJMIGlzIGEgY3Jvc3MtZG9tYWluIHJlcXVlc3QuXHJcbmZ1bmN0aW9uIGlzX2Nyb3NzRG9tYWluKHVybCkge1xyXG4gIHZhciBydXJsID0gL14oW1xcd1xcK1xcLlxcLV0rOikoPzpcXC9cXC8oW15cXC8/IzpdKikoPzo6KFxcZCspKT8pPy9cclxuXHJcbiAgLy8galF1ZXJ5ICM4MTM4LCBJRSBtYXkgdGhyb3cgYW4gZXhjZXB0aW9uIHdoZW4gYWNjZXNzaW5nXHJcbiAgLy8gYSBmaWVsZCBmcm9tIHdpbmRvdy5sb2NhdGlvbiBpZiBkb2N1bWVudC5kb21haW4gaGFzIGJlZW4gc2V0XHJcbiAgdmFyIGFqYXhMb2NhdGlvblxyXG4gIHRyeSB7IGFqYXhMb2NhdGlvbiA9IGxvY2F0aW9uLmhyZWYgfVxyXG4gIGNhdGNoIChlKSB7XHJcbiAgICAvLyBVc2UgdGhlIGhyZWYgYXR0cmlidXRlIG9mIGFuIEEgZWxlbWVudCBzaW5jZSBJRSB3aWxsIG1vZGlmeSBpdCBnaXZlbiBkb2N1bWVudC5sb2NhdGlvblxyXG4gICAgYWpheExvY2F0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggXCJhXCIgKTtcclxuICAgIGFqYXhMb2NhdGlvbi5ocmVmID0gXCJcIjtcclxuICAgIGFqYXhMb2NhdGlvbiA9IGFqYXhMb2NhdGlvbi5ocmVmO1xyXG4gIH1cclxuXHJcbiAgdmFyIGFqYXhMb2NQYXJ0cyA9IHJ1cmwuZXhlYyhhamF4TG9jYXRpb24udG9Mb3dlckNhc2UoKSkgfHwgW11cclxuICAgICwgcGFydHMgPSBydXJsLmV4ZWModXJsLnRvTG93ZXJDYXNlKCkgKVxyXG5cclxuICB2YXIgcmVzdWx0ID0gISEoXHJcbiAgICBwYXJ0cyAmJlxyXG4gICAgKCAgcGFydHNbMV0gIT0gYWpheExvY1BhcnRzWzFdXHJcbiAgICB8fCBwYXJ0c1syXSAhPSBhamF4TG9jUGFydHNbMl1cclxuICAgIHx8IChwYXJ0c1szXSB8fCAocGFydHNbMV0gPT09IFwiaHR0cDpcIiA/IDgwIDogNDQzKSkgIT0gKGFqYXhMb2NQYXJ0c1szXSB8fCAoYWpheExvY1BhcnRzWzFdID09PSBcImh0dHA6XCIgPyA4MCA6IDQ0MykpXHJcbiAgICApXHJcbiAgKVxyXG5cclxuICAvL2NvbnNvbGUuZGVidWcoJ2lzX2Nyb3NzRG9tYWluKCcrdXJsKycpIC0+ICcgKyByZXN1bHQpXHJcbiAgcmV0dXJuIHJlc3VsdFxyXG59XHJcblxyXG4vLyBNSVQgTGljZW5zZSBmcm9tIGh0dHA6Ly9waHBqcy5vcmcvZnVuY3Rpb25zL2Jhc2U2NF9lbmNvZGU6MzU4XHJcbmZ1bmN0aW9uIGI2NF9lbmMgKGRhdGEpIHtcclxuICAgIC8vIEVuY29kZXMgc3RyaW5nIHVzaW5nIE1JTUUgYmFzZTY0IGFsZ29yaXRobVxyXG4gICAgdmFyIGI2NCA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIjtcclxuICAgIHZhciBvMSwgbzIsIG8zLCBoMSwgaDIsIGgzLCBoNCwgYml0cywgaSA9IDAsIGFjID0gMCwgZW5jPVwiXCIsIHRtcF9hcnIgPSBbXTtcclxuXHJcbiAgICBpZiAoIWRhdGEpIHtcclxuICAgICAgICByZXR1cm4gZGF0YTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBhc3N1bWUgdXRmOCBkYXRhXHJcbiAgICAvLyBkYXRhID0gdGhpcy51dGY4X2VuY29kZShkYXRhKycnKTtcclxuXHJcbiAgICBkbyB7IC8vIHBhY2sgdGhyZWUgb2N0ZXRzIGludG8gZm91ciBoZXhldHNcclxuICAgICAgICBvMSA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xyXG4gICAgICAgIG8yID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XHJcbiAgICAgICAgbzMgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcclxuXHJcbiAgICAgICAgYml0cyA9IG8xPDwxNiB8IG8yPDw4IHwgbzM7XHJcblxyXG4gICAgICAgIGgxID0gYml0cz4+MTggJiAweDNmO1xyXG4gICAgICAgIGgyID0gYml0cz4+MTIgJiAweDNmO1xyXG4gICAgICAgIGgzID0gYml0cz4+NiAmIDB4M2Y7XHJcbiAgICAgICAgaDQgPSBiaXRzICYgMHgzZjtcclxuXHJcbiAgICAgICAgLy8gdXNlIGhleGV0cyB0byBpbmRleCBpbnRvIGI2NCwgYW5kIGFwcGVuZCByZXN1bHQgdG8gZW5jb2RlZCBzdHJpbmdcclxuICAgICAgICB0bXBfYXJyW2FjKytdID0gYjY0LmNoYXJBdChoMSkgKyBiNjQuY2hhckF0KGgyKSArIGI2NC5jaGFyQXQoaDMpICsgYjY0LmNoYXJBdChoNCk7XHJcbiAgICB9IHdoaWxlIChpIDwgZGF0YS5sZW5ndGgpO1xyXG5cclxuICAgIGVuYyA9IHRtcF9hcnIuam9pbignJyk7XHJcblxyXG4gICAgc3dpdGNoIChkYXRhLmxlbmd0aCAlIDMpIHtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMikgKyAnPT0nO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0xKSArICc9JztcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZW5jO1xyXG59XHJcbiAgICByZXR1cm4gcmVxdWVzdDtcclxuLy9VTUQgRk9PVEVSIFNUQVJUXHJcbn0pKTtcclxuLy9VTUQgRk9PVEVSIEVORFxyXG4iLCJmdW5jdGlvbiBFICgpIHtcclxuICAvLyBLZWVwIHRoaXMgZW1wdHkgc28gaXQncyBlYXNpZXIgdG8gaW5oZXJpdCBmcm9tXHJcbiAgLy8gKHZpYSBodHRwczovL2dpdGh1Yi5jb20vbGlwc21hY2sgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vc2NvdHRjb3JnYW4vdGlueS1lbWl0dGVyL2lzc3Vlcy8zKVxyXG59XHJcblxyXG5FLnByb3RvdHlwZSA9IHtcclxuICBvbjogZnVuY3Rpb24gKG5hbWUsIGNhbGxiYWNrLCBjdHgpIHtcclxuICAgIHZhciBlID0gdGhpcy5lIHx8ICh0aGlzLmUgPSB7fSk7XHJcblxyXG4gICAgKGVbbmFtZV0gfHwgKGVbbmFtZV0gPSBbXSkpLnB1c2goe1xyXG4gICAgICBmbjogY2FsbGJhY2ssXHJcbiAgICAgIGN0eDogY3R4XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9LFxyXG5cclxuICBvbmNlOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2ssIGN0eCkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgZnVuY3Rpb24gbGlzdGVuZXIgKCkge1xyXG4gICAgICBzZWxmLm9mZihuYW1lLCBsaXN0ZW5lcik7XHJcbiAgICAgIGNhbGxiYWNrLmFwcGx5KGN0eCwgYXJndW1lbnRzKTtcclxuICAgIH07XHJcblxyXG4gICAgbGlzdGVuZXIuXyA9IGNhbGxiYWNrXHJcbiAgICByZXR1cm4gdGhpcy5vbihuYW1lLCBsaXN0ZW5lciwgY3R4KTtcclxuICB9LFxyXG5cclxuICBlbWl0OiBmdW5jdGlvbiAobmFtZSkge1xyXG4gICAgdmFyIGRhdGEgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XHJcbiAgICB2YXIgZXZ0QXJyID0gKCh0aGlzLmUgfHwgKHRoaXMuZSA9IHt9KSlbbmFtZV0gfHwgW10pLnNsaWNlKCk7XHJcbiAgICB2YXIgaSA9IDA7XHJcbiAgICB2YXIgbGVuID0gZXZ0QXJyLmxlbmd0aDtcclxuXHJcbiAgICBmb3IgKGk7IGkgPCBsZW47IGkrKykge1xyXG4gICAgICBldnRBcnJbaV0uZm4uYXBwbHkoZXZ0QXJyW2ldLmN0eCwgZGF0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfSxcclxuXHJcbiAgb2ZmOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2spIHtcclxuICAgIHZhciBlID0gdGhpcy5lIHx8ICh0aGlzLmUgPSB7fSk7XHJcbiAgICB2YXIgZXZ0cyA9IGVbbmFtZV07XHJcbiAgICB2YXIgbGl2ZUV2ZW50cyA9IFtdO1xyXG5cclxuICAgIGlmIChldnRzICYmIGNhbGxiYWNrKSB7XHJcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBldnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGV2dHNbaV0uZm4gIT09IGNhbGxiYWNrICYmIGV2dHNbaV0uZm4uXyAhPT0gY2FsbGJhY2spXHJcbiAgICAgICAgICBsaXZlRXZlbnRzLnB1c2goZXZ0c1tpXSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBSZW1vdmUgZXZlbnQgZnJvbSBxdWV1ZSB0byBwcmV2ZW50IG1lbW9yeSBsZWFrXHJcbiAgICAvLyBTdWdnZXN0ZWQgYnkgaHR0cHM6Ly9naXRodWIuY29tL2xhemRcclxuICAgIC8vIFJlZjogaHR0cHM6Ly9naXRodWIuY29tL3Njb3R0Y29yZ2FuL3RpbnktZW1pdHRlci9jb21taXQvYzZlYmZhYTliYzk3M2IzM2QxMTBhODRhMzA3NzQyYjdjZjk0Yzk1MyNjb21taXRjb21tZW50LTUwMjQ5MTBcclxuXHJcbiAgICAobGl2ZUV2ZW50cy5sZW5ndGgpXHJcbiAgICAgID8gZVtuYW1lXSA9IGxpdmVFdmVudHNcclxuICAgICAgOiBkZWxldGUgZVtuYW1lXTtcclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEU7XHJcbm1vZHVsZS5leHBvcnRzLlRpbnlFbWl0dGVyID0gRTtcclxuIiwiY29uc3QgTG9naW4gPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL2xvZ2luLmpzXCIpO1xyXG5jb25zdCBBZG1pbmlzdHJhY2FvID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzXCIpO1xyXG5jb25zdCBNZW51ID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9tZW51LmpzXCIpO1xyXG5cclxuY2xhc3MgQXBwIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICB0aGlzLmxvZ2luID0gbmV3IExvZ2luKGJvZHkpO1xyXG4gICAgICAgIHRoaXMuYWRtaW5pc3RyYWNhbyA9IG5ldyBBZG1pbmlzdHJhY2FvKGJvZHkpO1xyXG4gICAgICAgIHRoaXMubWVudSA9IG5ldyBNZW51KGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIGluaXQoKSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMubG9naW5FdmVudHMoKTtcclxuICAgICAgICB0aGlzLmFkbWluaXN0cmFjYW9FdmVudHMoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dpbkV2ZW50cygpIHtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwiZXJyb3JcIiwgKCkgPT4gYWxlcnQoXCJVc3VhcmlvIG91IHNlbmhhIGluY29ycmV0b3NcIikpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJsb2dpbkFkbWluXCIsICgpID0+IHRoaXMuYWRtaW5pc3RyYWNhby5yZW5kZXIoKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImxvZ2luQWx1bm9cIiwgKCkgPT4gdGhpcy5tZW51LnJlbmRlcigpKTtcclxuICAgIH1cclxuXHJcbiAgICBhZG1pbmlzdHJhY2FvRXZlbnRzKCkge1xyXG4gICAgICAgIC8vdGhpcy5hZG1pbmlzdHJhY2FvLm9uKFwicHJlZW5jaGFHcmlkXCIsICk7XHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gQXBwOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2FkbWluaXN0cmFjYW8uanNcIik7XHJcbmNvbnN0IFRlbXBsYXRlTW9kYWwgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanNcIik7XHJcbmNvbnN0IExvZ2luID0gcmVxdWlyZShcIi4vbG9naW4uanNcIik7XHJcbmNvbnN0IENhZGFzdHJvQWx1bm8gPSByZXF1aXJlKFwiLi9jYWRhc3Ryb0FsdW5vLmpzXCIpO1xyXG5cclxuY2xhc3MgQWRtaW5pc3RyYWNhbyBleHRlbmRzIEFnZW5kYSB7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgICAgICB0aGlzLmxvZ2luID0gbmV3IExvZ2luKGJvZHkpO1xyXG4gICAgICAgIHRoaXMuY2FkYXN0cm9BbHVubyA9IG5ldyBDYWRhc3Ryb0FsdW5vKGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLnJlbmRlckdyaWRBbHVub3MoKTtcclxuICAgICAgICB0aGlzLmVoRWRpY2FvID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmxvZ291dCgpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tCb3Rhb0FkaWNpb25hcigpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tCb3Rhb0VkaXRhcigpO1xyXG4gICAgICAgIC8vIHRoaXMuY2xpY2tCb3Rhb0V4Y2x1aXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dvdXQoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9TaHV0ZG93bl1cIikub25jbGljayA9ICgpID0+IHRoaXMubG9naW4ucmVuZGVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgY2xpY2tCb3Rhb0FkaWNpb25hcigpIHtcclxuXHJcbiAgICAgICAgdGhpcy5laEVkaWNhbyA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNsaWNrQm90YW9FZGl0YXIoKSB7XHJcblxyXG4gICAgICAgIHRoaXMuZWhFZGljYW8gPSB0cnVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBzYWx2ZUFsdW5vKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmVoRWRpY2FvKSB7XHJcblxyXG4gICAgICAgICAgICBcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2FkYXN0cm9BbHVuby5lZGl0ZUFsdW5vKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8uaW5zaXJhQWx1bm8oKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyR3JpZEFsdW5vcygpIHtcclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L2FkbWluaXN0cmFjYW9gLFxyXG4gICAgICAgICAgICBqc29uOiB0cnVlXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgaWYgKGVycikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwiZXJyb3JcIiwgXCJuw6NvIGZvaSBwb3Nzw612ZWwgY2FycmVnYXIgb3MgYWx1bm9zXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcihkYXRhLmFsdW5vcyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFkbWluaXN0cmFjYW87IiwiY29uc3QgVGlueUVtaXR0ZXIgPSByZXF1aXJlKFwidGlueS1lbWl0dGVyXCIpO1xyXG5jb25zdCBSZXF1ZXN0ID0gcmVxdWlyZShcImJyb3dzZXItcmVxdWVzdFwiKTtcclxuXHJcbmNsYXNzIEFnZW5kYSBleHRlbmRzIFRpbnlFbWl0dGVyIHtcclxuICAgIGNvbnN0cnVjdG9yKCl7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLnJlcXVlc3QgPSBSZXF1ZXN0O1xyXG4gICAgICAgIHRoaXMuVVJMID0gXCJodHRwOi8vbG9jYWxob3N0OjMzMzNcIjtcclxuICAgIH1cclxufVxyXG5tb2R1bGUuZXhwb3J0cyA9IEFnZW5kYTsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9jYWRhc3Ryb0FsdW5vLmpzXCIpO1xyXG5jb25zdCBMb2dpbiA9IHJlcXVpcmUoXCIuL2xvZ2luLmpzXCIpO1xyXG5cclxuY2xhc3MgQ2FkYXN0cm9BbHVubyBleHRlbmRzIEFnZW5kYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTsgICAgICAgIFxyXG4gICAgICAgIHRoaXMubG9naW4gPSBuZXcgTG9naW4oYm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5zaXJhQWx1bm8oKSB7XHJcblxyXG4gICAgfVxyXG5cclxuICAgIGVkaXRlQWx1bm8oKSB7XHJcblxyXG4gICAgfVxyXG5cclxuICAgIGV4Y2x1YUFsdW5vKCkge1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG5cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDYWRhc3Ryb0FsdW5vOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2xvZ2luLmpzXCIpO1xyXG5cclxuY2xhc3MgTG9naW4gZXh0ZW5kcyBBZ2VuZGEge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW3VzdWFyaW9dXCIpLmZvY3VzKCk7XHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmVudmllRm9ybXVsYXJpbygpO1xyXG4gICAgICAgIHRoaXMuZXNxdWVjZXVTZW5oYSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGVudmllRm9ybXVsYXJpbygpIHtcclxuICAgICAgICBjb25zdCBmb3JtID0gdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJmb3JtXCIpO1xyXG4gICAgICAgIGZvcm0uYWRkRXZlbnRMaXN0ZW5lcihcInN1Ym1pdFwiLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHVzdWFyaW8gPSBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW3VzdWFyaW9dXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBzZW5oYSA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbc2VuaGFdXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmF1dGVudGlxdWVVc3VhcmlvKHVzdWFyaW8sIHNlbmhhKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBhdXRlbnRpcXVlVXN1YXJpbyh1c3VhcmlvLCBzZW5oYSkge1xyXG5cclxuICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9Mb2dpbmAsXHJcbiAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgIGJvZHk6IHtcclxuICAgICAgICAgICAgICAgIGxvZ2luOiB1c3VhcmlvLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgc2VuaGE6IHNlbmhhLnZhbHVlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLnJlcXVlc3Qob3B0cywgKGVyciwgcmVzcCwgZGF0YSkgPT4ge1xyXG5cclxuICAgICAgICAgICAgdGhpcy5sb2dhVXN1YXJpbyhyZXNwLCBlcnIsIGRhdGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGxvZ2FVc3VhcmlvKHJlc3AsIGVyciwgZGF0YSkge1xyXG5cclxuICAgICAgICBpZiAocmVzcC5zdGF0dXMgIT09IDIwMCkge1xyXG4gICAgICAgICAgICB0aGlzLmVtaXQoXCJlcnJvclwiLCBlcnIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHsgICAgICAgICAgICBcclxuXHJcbiAgICAgICAgICAgIGlmIChkYXRhLmFkbWluKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJsb2dpbkFkbWluXCIsIGRhdGEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KFwibG9naW5BbHVub1wiLCBkYXRhKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBlc3F1ZWNldVNlbmhhKCkge1xyXG4gICAgICAgIC8vY29kaWdvIHByYSBjaGFtYXIgZW0gVVJMXHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTG9naW47IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvbWVudS5qc1wiKTtcclxuXHJcbmNsYXNzIE1lbnUgZXh0ZW5kcyBBZ2VuZGEge1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIC8vdGhpcy5hZGRFdmVudExpc3RlbmVyKFwiTG9hZFwiLCApXHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTWVudTsiLCJjb25zdCBNb2RhbENhZGFzdHJvQWx1bm8gPSByZXF1aXJlKFwiLi9jYWRhc3Ryb0FsdW5vLmpzXCIpO1xyXG5cclxuY29uc3QgcmVuZGVyR3JpZEFsdW5vcyA9IGFsdW5vcyA9PiB7XHJcbiAgICByZXR1cm4gYWx1bm9zLm1hcChhbHVubyA9PiB7XHJcblxyXG4gICAgICAgIGxldCBjb3JMaW5oYSA9IGFsdW5vLmlkICUgMiA9PT0gMCA/IFwiYmFjay1ncmlkcm93MVwiIDogXCJiYWNrLWdyaWRyb3cyXCI7XHJcblxyXG4gICAgICAgIHJldHVybiBgXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvdyAke2NvckxpbmhhfSB0ZXh0LWRhcmtcIj5cclxuICAgICAgICAgICAgPGRpdiBjb2RpZ29BbHVubz0ke2FsdW5vLmlkfT48L2Rpdj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgZm9ybS1jaGVja1wiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwiY2hlY2tib3hcIiBjbGFzcz1cImZvcm0tY2hlY2staW5wdXQgbXQtNFwiIGlkPVwiZXhhbXBsZUNoZWNrMVwiPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3M9XCJ0ZXh0LWNlbnRlciBtYi0yXCI+JHthbHVuby5ub21lfTwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIFwiPlxyXG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwidGV4dC1jZW50ZXIgbXQtM1wiPiR7YWx1bm8uY3BmfTwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIFwiPlxyXG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwidGV4dC1jZW50ZXIgbXQtM1wiPiR7YWx1bm8ubWF0cmljdWxhfTwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvZGl2PiAgICAgICAgXHJcbiAgICAgICAgPC9kaXY+YFxyXG4gICAgfSkuam9pbihcIlwiKTtcclxufVxyXG5cclxuZXhwb3J0cy5yZW5kZXIgPSBhbHVub3MgPT4ge1xyXG4gICAgXHJcbiAgICByZXR1cm4gYFxyXG5cclxuICAgIDxkaXYgY2xhc3M9XCJpbWctZmx1aWQgdGV4dC1yaWdodCBtci01IG10LTUgdGV4dC13aGl0ZSBib3Rhb1NodXRkb3duXCIgYm90YW9TaHV0ZG93bj5cclxuICAgICAgICA8YSBocmVmPVwiI1wiPjxpbWcgc3JjPVwiLi9pbWFnZXMvc2h1dGRvd24ucG5nXCIgYWx0PVwiXCI+PC9hPlxyXG4gICAgICAgIDxzdHJvbmcgY2xhc3M9XCJtci0xXCI+U2Fpcjwvc3Ryb25nPlxyXG4gICAgPC9kaXY+XHJcbiAgICBcclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXJcIj5cclxuICAgICAgICA8ZGl2PlxyXG4gICAgICAgICAgICA8c3BhbiBjbGFzcz1cImxvZ2luMTAwLWZvcm0tdGl0bGUgcC1iLTQzIHAtMiBtdC0yXCI+XHJcbiAgICAgICAgICAgICAgICDDgXJlYSBBZG1pbmlzdHJhdGl2YVxyXG4gICAgICAgICAgICA8L3NwYW4+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XHJcbiAgICBcclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93ICBib3JkZXIgYm9yZGVyLXdoaXRlIGJhY2stZ3JpZCB0ZXh0LXdoaXRlXCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc20gdGV4dC1jZW50ZXJcIj5cclxuICAgICAgICAgICAgICAgIE5vbWVcclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIHRleHQtY2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICBDUEZcclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIHRleHQtY2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICBNYXRyw61jdWxhXHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAke3JlbmRlckdyaWRBbHVub3MoYWx1bm9zKX1cclxuXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lciBjb2wtc20gbXQtM1wiPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2VudGVyZWRcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeSBidG4tZGFya1wiIGRhdGEtdG9nZ2xlPVwibW9kYWxcIiBkYXRhLXRhcmdldD1cIiNtb2RhbENhZGFzdHJvQWx1bm9cIiBib3Rhb0FkaWNpb25hcj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgQWRpY2lvbmFyXHJcbiAgICAgICAgICAgICAgICAgICAgPC9idXR0b24+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrXCIgYm90YW9FZGl0YXI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVkaXRhclxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tZGFya1wiIGJvdGFvRXhjbHVpcj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgRXhjbHVpclxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgICAgICAgICAke01vZGFsQ2FkYXN0cm9BbHVuby5yZW5kZXIoKX1cclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PiAgICBcclxuICAgIGA7IFxyXG59IiwiY29uc3QgaW5wdXRFbmRlcmVjbyA9IGBcclxuPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY2VwXCI+Q0VQPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIGlkPVwiY2VwXCIgdHlwZT1cInRleHRcIiByZXF1aXJlZC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwibG9ncmFkb3Vyb1wiPkxvZ3JhZG91cm88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgaWQ9XCJsb2dyYWRvdXJvXCIgdHlwZT1cInRleHRcIiByZXF1aXJlZC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJudW1lcm9cIj5Ow7ptZXJvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIGlkPVwibnVtZXJvXCIgdHlwZT1cInRleHRcIiAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImNvbXBsZW1lbnRvXCI+Q29tcGxlbWVudG88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgaWQ9XCJjb21wbGVtZW50b1wiIHR5cGU9XCJ0ZXh0XCIgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImJhaXJyb1wiPkJhaXJybzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiBpZD1cImJhaXJyb1wiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJjaWRhZGVcIj5DaWRhZGU8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgaWQ9XCJjaWRhZGVcIiB0eXBlPVwidGV4dFwiIHJlcXVpcmVkLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbmA7XHJcblxyXG5jb25zdCBtb2RhbENhZGFzdHJvQWx1bm8gPSBgXHJcbjxkaXYgY2xhc3M9XCJtb2RhbCBmYWRlXCIgaWQ9XCJtb2RhbENhZGFzdHJvQWx1bm9cIiB0YWJpbmRleD1cIi0xXCIgcm9sZT1cImRpYWxvZ1wiIGFyaWEtbGFiZWxsZWRieT1cInRpdHVsb01vZGFsXCIgYXJpYS1oaWRkZW49XCJ0cnVlXCIgbW9kYWw+XHJcbiAgICA8ZGl2IGNsYXNzPVwibW9kYWwtZGlhbG9nIG1vZGFsLWRpYWxvZy1jZW50ZXJlZFwiIHJvbGU9XCJkb2N1bWVudFwiID5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtY29udGVudFwiPlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWhlYWRlclwiPlxyXG4gICAgICAgICAgICAgICAgPGg1IGNsYXNzPVwibW9kYWwtdGl0bGVcIiBpZD1cInRpdHVsb01vZGFsXCI+QWRpY2lvbmFyIE5vdm8gQWx1bm88L2g1PlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJjbG9zZVwiIGRhdGEtZGlzbWlzcz1cIm1vZGFsXCIgYXJpYS1sYWJlbD1cIkZlY2hhclwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPiZ0aW1lczs8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtYm9keVwiPlxyXG4gICAgICAgICAgICAgICAgPGZvcm0+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWw+Tm9tZSBDb21wbGV0bzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmsgY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIiBpZD1cImluY2x1ZGVfZGF0ZVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsPkRhdGEgZGUgTmFzY2ltZW50bzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmsgY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY3BmXCI+Q1BGPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBpZD1cImNwZlwiIHR5cGU9XCJ0ZXh0XCIgYXV0b2NvbXBsZXRlPVwib2ZmXCIgb25rZXl1cD1cIk1hc2tDcGYoJ19fXy5fX18uX19fLV9fJywgdGhpcylcIiBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwidGVsXCI+VGVsZWZvbmU8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGlkPVwidGVsXCIgdHlwZT1cInRleHRcIiBhdXRvY29tcGxldGU9XCJvZmZcIiBvbmtleXVwPVwiTWFza1RlbCgnKF9fKV9fX19fLV9fX18nLCB0aGlzKVwiIGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiZW1haWxcIj5FLW1haWw8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGlkPVwiZW1haWxcIiB0eXBlPVwidGV4dFwiIGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PiAgICAgICAgICAgICAgICAgICAgXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICR7aW5wdXRFbmRlcmVjb31cclxuXHJcbiAgICAgICAgICAgICAgICA8L2Zvcm0+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWZvb3RlclwiPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIGRhdGEtZGlzbWlzcz1cIm1vZGFsXCI+RmVjaGFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiPlNhbHZhcjwvYnV0dG9uPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5cclxuYDtcclxuXHJcblxyXG5leHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBtb2RhbENhZGFzdHJvQWx1bm87XHJcbn0iLCJleHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBgIDxib2R5PlxyXG4gICAgPGxhYmVsIGNsYXNzPVwibG9naW4xMDAtZm9ybS10aXRsZSBwLWItNDMgcC10LTgwXCI+QWNlc3NvIGRhIENvbnRhPC9sYWJlbD5cclxuICAgIDxkaXYgY2xhc3M9XCJjYXJkXCIgaWQ9XCJ0ZWxhTG9naW5cIj4gICAgICAgXHJcbiAgICAgICAgPG1haW4+ICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNhcmQtYm9keVwiPlxyXG4gICAgICAgICAgICAgICAgPGZvcm0+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXAgcnMxIHZhbGlkYXRlLWlucHV0XCIgZGF0YS12YWxpZGF0ZT1cIkNhbXBvIG9icmlnYXTDs3Jpb1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBjbGFzcz1cImZvcm0tY29udHJvbFwiIGlkPVwiXCIgcGxhY2Vob2xkZXI9XCJVc3XDoXJpb1wiIHVzdWFyaW8+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cCByczIgdmFsaWRhdGUtaW5wdXRcIiBkYXRhLXZhbGlkYXRlPVwiQ2FtcG8gb2JyaWdhdMOzcmlvXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwicGFzc3dvcmRcIiBjbGFzcz1cImZvcm0tY29udHJvbFwiIGlkPVwiXCIgcGxhY2Vob2xkZXI9XCJTZW5oYVwiIHNlbmhhPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeSBidG4gYnRuLW91dGxpbmUtZGFyayBidG4tbGcgYnRuLWJsb2NrXCIgaHJlZj1cIm1lbnUuaHRtbFwiIGJvdGFvTG9naW4+RW50cmFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRleHQtY2VudGVyIHctZnVsbCBwLXQtMjNcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGEgaHJlZj1cIiNcIiBjbGFzcz1cInRleHQtc2Vjb25kYXJ5XCI+XHJcblx0XHQgICAgXHRcdFx0XHRcdEVzcXVlY2V1IGEgU2VuaGE/IEVudHJlIGVtIENvbnRhdG8gQ29ub3NjbyBDbGljYW5kbyBBcXVpLlxyXG5cdFx0ICAgIFx0XHRcdFx0PC9hPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPC9mb3JtPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L21haW4+XHJcbiAgICAgICAgPGZvb3Rlcj48L2Zvb3Rlcj5cclxuICAgIDwvZGl2PlxyXG48L2JvZHk+XHJcbjxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9jb2RlLmpxdWVyeS5jb20vanF1ZXJ5LTMuMy4xLnNsaW0ubWluLmpzXCIgaW50ZWdyaXR5PVwic2hhMzg0LXE4aS9YKzk2NUR6TzByVDdhYks0MUpTdFFJQXFWZ1JWenBiem81c21YS3A0WWZSdkgrOGFidFRFMVBpNmppem9cIiBjcm9zc29yaWdpbj1cImFub255bW91c1wiPjwvc2NyaXB0PlxyXG48c2NyaXB0IHNyYz1cImh0dHBzOi8vY2RuanMuY2xvdWRmbGFyZS5jb20vYWpheC9saWJzL3BvcHBlci5qcy8xLjE0LjcvdW1kL3BvcHBlci5taW4uanNcIiBpbnRlZ3JpdHk9XCJzaGEzODQtVU8yZVQwQ3BIcWRTSlE2aEp0eTVLVnBodFBoeldqOVdPMWNsSFRNR2EzSkRad3JuUXE0c0Y4NmRJSE5EejBXMVwiIGNyb3Nzb3JpZ2luPVwiYW5vbnltb3VzXCI+PC9zY3JpcHQ+XHJcbjxzY3JpcHQgc3JjPVwiaHR0cHM6Ly9zdGFja3BhdGguYm9vdHN0cmFwY2RuLmNvbS9ib290c3RyYXAvNC4zLjEvanMvYm9vdHN0cmFwLm1pbi5qc1wiIGludGVncml0eT1cInNoYTM4NC1KalNtVmd5ZDBwM3BYQjFyUmliWlVBWW9JSXk2T3JRNlZyaklFYUZmL25KR3pJeEZEc2Y0eDB4SU0rQjA3alJNXCIgY3Jvc3NvcmlnaW49XCJhbm9ueW1vdXNcIj48L3NjcmlwdD5gO1xyXG59IiwiZXhwb3J0cy5yZW5kZXIgPSAoKSA9PiB7XHJcbiAgICByZXR1cm4gYDxoZWFkPlxyXG4gICAgPGRpdiBjbGFzcz1cImxpbWl0ZXJcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXItbG9naW4xMDBcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwid3JhcC1sb2dpbjEwMCBwLWItMTYwIHAtdC01MFwiPlxyXG5cclxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00M1wiPlxyXG4gICAgICAgICAgICAgICAgICAgIFNlbGVjaW9uZSB1bWEgc2FsYSBwYXJhIGZhemVyIGEgbWFyY2HDp8OjbyBkYXMgYXVsYXNcclxuICAgICAgICAgICAgICAgIDwvc3Bhbj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXItbWVudTEwMC1idG5cIj5cclxuICAgICAgICAgICAgICAgIDxidXR0b24gb25jbGljaz1cInRlbGFfbXVzYygpXCIgY2xhc3M9XCJtZW51MTAwLWZvcm0tYnRuMlwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgTXVzY3VsYcOnw6NvICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBvbmNsaWNrPVwidGVsYV9tdWx0KClcIiBjbGFzcz1cIm1lbnUxMDAtZm9ybS1idG4xXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIE11bHRpZnVuY2lvbmFsXHJcbiAgICAgICAgICAgICAgICAgICAgPC9hPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcbmA7XHJcbn0iLCJjb25zdCBBcHAgPSByZXF1aXJlKFwiLi9hcHAuanNcIik7XHJcblxyXG53aW5kb3cub25sb2FkID0gKCkgPT4ge1xyXG4gICAgY29uc3QgbWFpbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJtYWluXCIpO1xyXG4gICAgbmV3IEFwcChtYWluKS5pbml0KCk7XHJcbn0iXX0=
