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
    }

    addEventListener() {
        this.logout();
        this.clickBotaoAdicionar();
        // this.clickBotaoEditar();
        // this.clickBotaoExcluir();
    }

    logout() {
        this.body.querySelector("[botaoShutdown]").onclick = () => this.login.render();
    }

    clickBotaoAdicionar() {
        this.body.querySelector("[botaoAdicionar]").onclick = () => document.getElementById('modalCadastroAluno').modal({ show: true });
    }

    chameModal() {
        this.cadastroAluno.render();
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
        this.body = body;
        this.login = new Login(body);
    }

    render() {
        this.body.innerHTML += Template.render();
        //this.addEventListener();
        //this.monteGrid();
    }
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

},{"../templates/login.js":12,"./agenda.js":5}],8:[function(require,module,exports){
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

},{"../templates/menu.js":13,"./agenda.js":5}],9:[function(require,module,exports){
const Header = require("./header.js");
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

    ${Header.render()}

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

},{"./cadastroAluno.js":10,"./header.js":11}],10:[function(require,module,exports){
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
                <button type="button" class="btn btn-primary">Salvar</button>
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
    return `
    <!-- <header>
        <script src="vendor/jquery/jquery-3.2.1.min.js "></script>
        <script src="vendor/animsition/js/animsition.min.js "></script>
        <script src="vendor/bootstrap/js/popper.js "></script>
        <script src="vendor/bootstrap/js/bootstrap.min.js "></script>
        <script src="vendor/select2/select2.min.js "></script>
        <script src="vendor/daterangepicker/moment.min.js "></script>
        <script src="vendor/daterangepicker/daterangepicker.js "></script>
        <script src="vendor/countdowntime/countdowntime.js "></script>
        <script src="./js/app.js"></script>
        <script src="./js/jsFront/telaAdm.js"></script>
    </header> -->
    `;
};

},{}],12:[function(require,module,exports){
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
</body>`;
};

},{}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
const App = require("./app.js");

window.onload = () => {
    const main = document.querySelector("main");
    new App(main).init();
};

},{"./app.js":3}]},{},[14])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXF1ZXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RpbnktZW1pdHRlci9pbmRleC5qcyIsInNyYy9hcHAuanMiLCJzcmMvY29tcG9uZW50cy9hZG1pbmlzdHJhY2FvLmpzIiwic3JjL2NvbXBvbmVudHMvYWdlbmRhLmpzIiwic3JjL2NvbXBvbmVudHMvY2FkYXN0cm9BbHVuby5qcyIsInNyYy9jb21wb25lbnRzL2xvZ2luLmpzIiwic3JjL2NvbXBvbmVudHMvbWVudS5qcyIsInNyYy90ZW1wbGF0ZXMvYWRtaW5pc3RyYWNhby5qcyIsInNyYy90ZW1wbGF0ZXMvY2FkYXN0cm9BbHVuby5qcyIsInNyYy90ZW1wbGF0ZXMvaGVhZGVyLmpzIiwic3JjL3RlbXBsYXRlcy9sb2dpbi5qcyIsInNyYy90ZW1wbGF0ZXMvbWVudS5qcyIsImluZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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QUFRLE1BQVIsR0FBaUIsTUFBTTtBQUNuQixXQUFROzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBQVI7QUEwQkgsQ0EzQkQ7OztBQ0FBLE1BQU0sTUFBTSxRQUFRLFVBQVIsQ0FBWjs7QUFFQSxPQUFPLE1BQVAsR0FBZ0IsTUFBTTtBQUNsQixVQUFNLE9BQU8sU0FBUyxhQUFULENBQXVCLE1BQXZCLENBQWI7QUFDQSxRQUFJLEdBQUosQ0FBUSxJQUFSLEVBQWMsSUFBZDtBQUNILENBSEQiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvLyBCcm93c2VyIFJlcXVlc3RcclxuLy9cclxuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcclxuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxyXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcclxuLy9cclxuLy8gICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxyXG4vL1xyXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXHJcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcclxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXHJcbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcclxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXHJcblxyXG4vLyBVTUQgSEVBREVSIFNUQVJUIFxyXG4oZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcclxuICAgIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcclxuICAgICAgICAvLyBBTUQuIFJlZ2lzdGVyIGFzIGFuIGFub255bW91cyBtb2R1bGUuXHJcbiAgICAgICAgZGVmaW5lKFtdLCBmYWN0b3J5KTtcclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgLy8gTm9kZS4gRG9lcyBub3Qgd29yayB3aXRoIHN0cmljdCBDb21tb25KUywgYnV0XHJcbiAgICAgICAgLy8gb25seSBDb21tb25KUy1saWtlIGVudmlyb21lbnRzIHRoYXQgc3VwcG9ydCBtb2R1bGUuZXhwb3J0cyxcclxuICAgICAgICAvLyBsaWtlIE5vZGUuXHJcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIEJyb3dzZXIgZ2xvYmFscyAocm9vdCBpcyB3aW5kb3cpXHJcbiAgICAgICAgcm9vdC5yZXR1cm5FeHBvcnRzID0gZmFjdG9yeSgpO1xyXG4gIH1cclxufSh0aGlzLCBmdW5jdGlvbiAoKSB7XHJcbi8vIFVNRCBIRUFERVIgRU5EXHJcblxyXG52YXIgWEhSID0gWE1MSHR0cFJlcXVlc3RcclxuaWYgKCFYSFIpIHRocm93IG5ldyBFcnJvcignbWlzc2luZyBYTUxIdHRwUmVxdWVzdCcpXHJcbnJlcXVlc3QubG9nID0ge1xyXG4gICd0cmFjZSc6IG5vb3AsICdkZWJ1Zyc6IG5vb3AsICdpbmZvJzogbm9vcCwgJ3dhcm4nOiBub29wLCAnZXJyb3InOiBub29wXHJcbn1cclxuXHJcbnZhciBERUZBVUxUX1RJTUVPVVQgPSAzICogNjAgKiAxMDAwIC8vIDMgbWludXRlc1xyXG5cclxuLy9cclxuLy8gcmVxdWVzdFxyXG4vL1xyXG5cclxuZnVuY3Rpb24gcmVxdWVzdChvcHRpb25zLCBjYWxsYmFjaykge1xyXG4gIC8vIFRoZSBlbnRyeS1wb2ludCB0byB0aGUgQVBJOiBwcmVwIHRoZSBvcHRpb25zIG9iamVjdCBhbmQgcGFzcyB0aGUgcmVhbCB3b3JrIHRvIHJ1bl94aHIuXHJcbiAgaWYodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdCYWQgY2FsbGJhY2sgZ2l2ZW46ICcgKyBjYWxsYmFjaylcclxuXHJcbiAgaWYoIW9wdGlvbnMpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIG9wdGlvbnMgZ2l2ZW4nKVxyXG5cclxuICB2YXIgb3B0aW9uc19vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlOyAvLyBTYXZlIHRoaXMgZm9yIGxhdGVyLlxyXG5cclxuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXHJcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9O1xyXG4gIGVsc2VcclxuICAgIG9wdGlvbnMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdGlvbnMpKTsgLy8gVXNlIGEgZHVwbGljYXRlIGZvciBtdXRhdGluZy5cclxuXHJcbiAgb3B0aW9ucy5vblJlc3BvbnNlID0gb3B0aW9uc19vblJlc3BvbnNlIC8vIEFuZCBwdXQgaXQgYmFjay5cclxuXHJcbiAgaWYgKG9wdGlvbnMudmVyYm9zZSkgcmVxdWVzdC5sb2cgPSBnZXRMb2dnZXIoKTtcclxuXHJcbiAgaWYob3B0aW9ucy51cmwpIHtcclxuICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmw7XHJcbiAgICBkZWxldGUgb3B0aW9ucy51cmw7XHJcbiAgfVxyXG5cclxuICBpZighb3B0aW9ucy51cmkgJiYgb3B0aW9ucy51cmkgIT09IFwiXCIpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLnVyaSBpcyBhIHJlcXVpcmVkIGFyZ3VtZW50XCIpO1xyXG5cclxuICBpZih0eXBlb2Ygb3B0aW9ucy51cmkgIT0gXCJzdHJpbmdcIilcclxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIG11c3QgYmUgYSBzdHJpbmdcIik7XHJcblxyXG4gIHZhciB1bnN1cHBvcnRlZF9vcHRpb25zID0gWydwcm94eScsICdfcmVkaXJlY3RzRm9sbG93ZWQnLCAnbWF4UmVkaXJlY3RzJywgJ2ZvbGxvd1JlZGlyZWN0J11cclxuICBmb3IgKHZhciBpID0gMDsgaSA8IHVuc3VwcG9ydGVkX29wdGlvbnMubGVuZ3RoOyBpKyspXHJcbiAgICBpZihvcHRpb25zWyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldIF0pXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMuXCIgKyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldICsgXCIgaXMgbm90IHN1cHBvcnRlZFwiKVxyXG5cclxuICBvcHRpb25zLmNhbGxiYWNrID0gY2FsbGJhY2tcclxuICBvcHRpb25zLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kIHx8ICdHRVQnO1xyXG4gIG9wdGlvbnMuaGVhZGVycyA9IG9wdGlvbnMuaGVhZGVycyB8fCB7fTtcclxuICBvcHRpb25zLmJvZHkgICAgPSBvcHRpb25zLmJvZHkgfHwgbnVsbFxyXG4gIG9wdGlvbnMudGltZW91dCA9IG9wdGlvbnMudGltZW91dCB8fCByZXF1ZXN0LkRFRkFVTFRfVElNRU9VVFxyXG5cclxuICBpZihvcHRpb25zLmhlYWRlcnMuaG9zdClcclxuICAgIHRocm93IG5ldyBFcnJvcihcIk9wdGlvbnMuaGVhZGVycy5ob3N0IGlzIG5vdCBzdXBwb3J0ZWRcIik7XHJcblxyXG4gIGlmKG9wdGlvbnMuanNvbikge1xyXG4gICAgb3B0aW9ucy5oZWFkZXJzLmFjY2VwdCA9IG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgfHwgJ2FwcGxpY2F0aW9uL2pzb24nXHJcbiAgICBpZihvcHRpb25zLm1ldGhvZCAhPT0gJ0dFVCcpXHJcbiAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSAnYXBwbGljYXRpb24vanNvbidcclxuXHJcbiAgICBpZih0eXBlb2Ygb3B0aW9ucy5qc29uICE9PSAnYm9vbGVhbicpXHJcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuanNvbilcclxuICAgIGVsc2UgaWYodHlwZW9mIG9wdGlvbnMuYm9keSAhPT0gJ3N0cmluZycpXHJcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuYm9keSlcclxuICB9XHJcbiAgXHJcbiAgLy9CRUdJTiBRUyBIYWNrXHJcbiAgdmFyIHNlcmlhbGl6ZSA9IGZ1bmN0aW9uKG9iaikge1xyXG4gICAgdmFyIHN0ciA9IFtdO1xyXG4gICAgZm9yKHZhciBwIGluIG9iailcclxuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xyXG4gICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xyXG4gICAgICB9XHJcbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xyXG4gIH1cclxuICBcclxuICBpZihvcHRpb25zLnFzKXtcclxuICAgIHZhciBxcyA9ICh0eXBlb2Ygb3B0aW9ucy5xcyA9PSAnc3RyaW5nJyk/IG9wdGlvbnMucXMgOiBzZXJpYWxpemUob3B0aW9ucy5xcyk7XHJcbiAgICBpZihvcHRpb25zLnVyaS5pbmRleE9mKCc/JykgIT09IC0xKXsgLy9ubyBnZXQgcGFyYW1zXHJcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnJicrcXM7XHJcbiAgICB9ZWxzZXsgLy9leGlzdGluZyBnZXQgcGFyYW1zXHJcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnPycrcXM7XHJcbiAgICB9XHJcbiAgfVxyXG4gIC8vRU5EIFFTIEhhY2tcclxuICBcclxuICAvL0JFR0lOIEZPUk0gSGFja1xyXG4gIHZhciBtdWx0aXBhcnQgPSBmdW5jdGlvbihvYmopIHtcclxuICAgIC8vdG9kbzogc3VwcG9ydCBmaWxlIHR5cGUgKHVzZWZ1bD8pXHJcbiAgICB2YXIgcmVzdWx0ID0ge307XHJcbiAgICByZXN1bHQuYm91bmRyeSA9ICctLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tJytNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqMTAwMDAwMDAwMCk7XHJcbiAgICB2YXIgbGluZXMgPSBbXTtcclxuICAgIGZvcih2YXIgcCBpbiBvYmope1xyXG4gICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcclxuICAgICAgICAgICAgbGluZXMucHVzaChcclxuICAgICAgICAgICAgICAgICctLScrcmVzdWx0LmJvdW5kcnkrXCJcXG5cIitcclxuICAgICAgICAgICAgICAgICdDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCInK3ArJ1wiJytcIlxcblwiK1xyXG4gICAgICAgICAgICAgICAgXCJcXG5cIitcclxuICAgICAgICAgICAgICAgIG9ialtwXStcIlxcblwiXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgbGluZXMucHVzaCggJy0tJytyZXN1bHQuYm91bmRyeSsnLS0nICk7XHJcbiAgICByZXN1bHQuYm9keSA9IGxpbmVzLmpvaW4oJycpO1xyXG4gICAgcmVzdWx0Lmxlbmd0aCA9IHJlc3VsdC5ib2R5Lmxlbmd0aDtcclxuICAgIHJlc3VsdC50eXBlID0gJ211bHRpcGFydC9mb3JtLWRhdGE7IGJvdW5kYXJ5PScrcmVzdWx0LmJvdW5kcnk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG4gIH1cclxuICBcclxuICBpZihvcHRpb25zLmZvcm0pe1xyXG4gICAgaWYodHlwZW9mIG9wdGlvbnMuZm9ybSA9PSAnc3RyaW5nJykgdGhyb3coJ2Zvcm0gbmFtZSB1bnN1cHBvcnRlZCcpO1xyXG4gICAgaWYob3B0aW9ucy5tZXRob2QgPT09ICdQT1NUJyl7XHJcbiAgICAgICAgdmFyIGVuY29kaW5nID0gKG9wdGlvbnMuZW5jb2RpbmcgfHwgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IGVuY29kaW5nO1xyXG4gICAgICAgIHN3aXRjaChlbmNvZGluZyl7XHJcbiAgICAgICAgICAgIGNhc2UgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmJvZHkgPSBzZXJpYWxpemUob3B0aW9ucy5mb3JtKS5yZXBsYWNlKC8lMjAvZywgXCIrXCIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ211bHRpcGFydC9mb3JtLWRhdGEnOlxyXG4gICAgICAgICAgICAgICAgdmFyIG11bHRpID0gbXVsdGlwYXJ0KG9wdGlvbnMuZm9ybSk7XHJcbiAgICAgICAgICAgICAgICAvL29wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IG11bHRpLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IG11bHRpLmJvZHk7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gbXVsdGkudHlwZTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0IDogdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBlbmNvZGluZzonK2VuY29kaW5nKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG4gIC8vRU5EIEZPUk0gSGFja1xyXG5cclxuICAvLyBJZiBvblJlc3BvbnNlIGlzIGJvb2xlYW4gdHJ1ZSwgY2FsbCBiYWNrIGltbWVkaWF0ZWx5IHdoZW4gdGhlIHJlc3BvbnNlIGlzIGtub3duLFxyXG4gIC8vIG5vdCB3aGVuIHRoZSBmdWxsIHJlcXVlc3QgaXMgY29tcGxldGUuXHJcbiAgb3B0aW9ucy5vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlIHx8IG5vb3BcclxuICBpZihvcHRpb25zLm9uUmVzcG9uc2UgPT09IHRydWUpIHtcclxuICAgIG9wdGlvbnMub25SZXNwb25zZSA9IGNhbGxiYWNrXHJcbiAgICBvcHRpb25zLmNhbGxiYWNrID0gbm9vcFxyXG4gIH1cclxuXHJcbiAgLy8gWFhYIEJyb3dzZXJzIGRvIG5vdCBsaWtlIHRoaXMuXHJcbiAgLy9pZihvcHRpb25zLmJvZHkpXHJcbiAgLy8gIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IG9wdGlvbnMuYm9keS5sZW5ndGg7XHJcblxyXG4gIC8vIEhUVFAgYmFzaWMgYXV0aGVudGljYXRpb25cclxuICBpZighb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24gJiYgb3B0aW9ucy5hdXRoKVxyXG4gICAgb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24gPSAnQmFzaWMgJyArIGI2NF9lbmMob3B0aW9ucy5hdXRoLnVzZXJuYW1lICsgJzonICsgb3B0aW9ucy5hdXRoLnBhc3N3b3JkKTtcclxuXHJcbiAgcmV0dXJuIHJ1bl94aHIob3B0aW9ucylcclxufVxyXG5cclxudmFyIHJlcV9zZXEgPSAwXHJcbmZ1bmN0aW9uIHJ1bl94aHIob3B0aW9ucykge1xyXG4gIHZhciB4aHIgPSBuZXcgWEhSXHJcbiAgICAsIHRpbWVkX291dCA9IGZhbHNlXHJcbiAgICAsIGlzX2NvcnMgPSBpc19jcm9zc0RvbWFpbihvcHRpb25zLnVyaSlcclxuICAgICwgc3VwcG9ydHNfY29ycyA9ICgnd2l0aENyZWRlbnRpYWxzJyBpbiB4aHIpXHJcblxyXG4gIHJlcV9zZXEgKz0gMVxyXG4gIHhoci5zZXFfaWQgPSByZXFfc2VxXHJcbiAgeGhyLmlkID0gcmVxX3NlcSArICc6ICcgKyBvcHRpb25zLm1ldGhvZCArICcgJyArIG9wdGlvbnMudXJpXHJcbiAgeGhyLl9pZCA9IHhoci5pZCAvLyBJIGtub3cgSSB3aWxsIHR5cGUgXCJfaWRcIiBmcm9tIGhhYml0IGFsbCB0aGUgdGltZS5cclxuXHJcbiAgaWYoaXNfY29ycyAmJiAhc3VwcG9ydHNfY29ycykge1xyXG4gICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdCcm93c2VyIGRvZXMgbm90IHN1cHBvcnQgY3Jvc3Mtb3JpZ2luIHJlcXVlc3Q6ICcgKyBvcHRpb25zLnVyaSlcclxuICAgIGNvcnNfZXJyLmNvcnMgPSAndW5zdXBwb3J0ZWQnXHJcbiAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxyXG4gIH1cclxuXHJcbiAgeGhyLnRpbWVvdXRUaW1lciA9IHNldFRpbWVvdXQodG9vX2xhdGUsIG9wdGlvbnMudGltZW91dClcclxuICBmdW5jdGlvbiB0b29fbGF0ZSgpIHtcclxuICAgIHRpbWVkX291dCA9IHRydWVcclxuICAgIHZhciBlciA9IG5ldyBFcnJvcignRVRJTUVET1VUJylcclxuICAgIGVyLmNvZGUgPSAnRVRJTUVET1VUJ1xyXG4gICAgZXIuZHVyYXRpb24gPSBvcHRpb25zLnRpbWVvdXRcclxuXHJcbiAgICByZXF1ZXN0LmxvZy5lcnJvcignVGltZW91dCcsIHsgJ2lkJzp4aHIuX2lkLCAnbWlsbGlzZWNvbmRzJzpvcHRpb25zLnRpbWVvdXQgfSlcclxuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpXHJcbiAgfVxyXG5cclxuICAvLyBTb21lIHN0YXRlcyBjYW4gYmUgc2tpcHBlZCBvdmVyLCBzbyByZW1lbWJlciB3aGF0IGlzIHN0aWxsIGluY29tcGxldGUuXHJcbiAgdmFyIGRpZCA9IHsncmVzcG9uc2UnOmZhbHNlLCAnbG9hZGluZyc6ZmFsc2UsICdlbmQnOmZhbHNlfVxyXG5cclxuICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gb25fc3RhdGVfY2hhbmdlXHJcbiAgeGhyLm9wZW4ob3B0aW9ucy5tZXRob2QsIG9wdGlvbnMudXJpLCB0cnVlKSAvLyBhc3luY2hyb25vdXNcclxuICBpZihpc19jb3JzKVxyXG4gICAgeGhyLndpdGhDcmVkZW50aWFscyA9ICEhIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzXHJcbiAgeGhyLnNlbmQob3B0aW9ucy5ib2R5KVxyXG4gIHJldHVybiB4aHJcclxuXHJcbiAgZnVuY3Rpb24gb25fc3RhdGVfY2hhbmdlKGV2ZW50KSB7XHJcbiAgICBpZih0aW1lZF9vdXQpXHJcbiAgICAgIHJldHVybiByZXF1ZXN0LmxvZy5kZWJ1ZygnSWdub3JpbmcgdGltZWQgb3V0IHN0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZH0pXHJcblxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1N0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZCwgJ3RpbWVkX291dCc6dGltZWRfb3V0fSlcclxuXHJcbiAgICBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLk9QRU5FRCkge1xyXG4gICAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVxdWVzdCBzdGFydGVkJywgeydpZCc6eGhyLmlkfSlcclxuICAgICAgZm9yICh2YXIga2V5IGluIG9wdGlvbnMuaGVhZGVycylcclxuICAgICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcihrZXksIG9wdGlvbnMuaGVhZGVyc1trZXldKVxyXG4gICAgfVxyXG5cclxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5IRUFERVJTX1JFQ0VJVkVEKVxyXG4gICAgICBvbl9yZXNwb25zZSgpXHJcblxyXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkxPQURJTkcpIHtcclxuICAgICAgb25fcmVzcG9uc2UoKVxyXG4gICAgICBvbl9sb2FkaW5nKClcclxuICAgIH1cclxuXHJcbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuRE9ORSkge1xyXG4gICAgICBvbl9yZXNwb25zZSgpXHJcbiAgICAgIG9uX2xvYWRpbmcoKVxyXG4gICAgICBvbl9lbmQoKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gb25fcmVzcG9uc2UoKSB7XHJcbiAgICBpZihkaWQucmVzcG9uc2UpXHJcbiAgICAgIHJldHVyblxyXG5cclxuICAgIGRpZC5yZXNwb25zZSA9IHRydWVcclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdHb3QgcmVzcG9uc2UnLCB7J2lkJzp4aHIuaWQsICdzdGF0dXMnOnhoci5zdGF0dXN9KVxyXG4gICAgY2xlYXJUaW1lb3V0KHhoci50aW1lb3V0VGltZXIpXHJcbiAgICB4aHIuc3RhdHVzQ29kZSA9IHhoci5zdGF0dXMgLy8gTm9kZSByZXF1ZXN0IGNvbXBhdGliaWxpdHlcclxuXHJcbiAgICAvLyBEZXRlY3QgZmFpbGVkIENPUlMgcmVxdWVzdHMuXHJcbiAgICBpZihpc19jb3JzICYmIHhoci5zdGF0dXNDb2RlID09IDApIHtcclxuICAgICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdDT1JTIHJlcXVlc3QgcmVqZWN0ZWQ6ICcgKyBvcHRpb25zLnVyaSlcclxuICAgICAgY29yc19lcnIuY29ycyA9ICdyZWplY3RlZCdcclxuXHJcbiAgICAgIC8vIERvIG5vdCBwcm9jZXNzIHRoaXMgcmVxdWVzdCBmdXJ0aGVyLlxyXG4gICAgICBkaWQubG9hZGluZyA9IHRydWVcclxuICAgICAgZGlkLmVuZCA9IHRydWVcclxuXHJcbiAgICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGNvcnNfZXJyLCB4aHIpXHJcbiAgICB9XHJcblxyXG4gICAgb3B0aW9ucy5vblJlc3BvbnNlKG51bGwsIHhocilcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG9uX2xvYWRpbmcoKSB7XHJcbiAgICBpZihkaWQubG9hZGluZylcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAgZGlkLmxvYWRpbmcgPSB0cnVlXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVzcG9uc2UgYm9keSBsb2FkaW5nJywgeydpZCc6eGhyLmlkfSlcclxuICAgIC8vIFRPRE86IE1heWJlIHNpbXVsYXRlIFwiZGF0YVwiIGV2ZW50cyBieSB3YXRjaGluZyB4aHIucmVzcG9uc2VUZXh0XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBvbl9lbmQoKSB7XHJcbiAgICBpZihkaWQuZW5kKVxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBkaWQuZW5kID0gdHJ1ZVxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3QgZG9uZScsIHsnaWQnOnhoci5pZH0pXHJcblxyXG4gICAgeGhyLmJvZHkgPSB4aHIucmVzcG9uc2VUZXh0XHJcbiAgICBpZihvcHRpb25zLmpzb24pIHtcclxuICAgICAgdHJ5ICAgICAgICB7IHhoci5ib2R5ID0gSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0KSB9XHJcbiAgICAgIGNhdGNoIChlcikgeyByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKSAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG9wdGlvbnMuY2FsbGJhY2sobnVsbCwgeGhyLCB4aHIuYm9keSlcclxuICB9XHJcblxyXG59IC8vIHJlcXVlc3RcclxuXHJcbnJlcXVlc3Qud2l0aENyZWRlbnRpYWxzID0gZmFsc2U7XHJcbnJlcXVlc3QuREVGQVVMVF9USU1FT1VUID0gREVGQVVMVF9USU1FT1VUO1xyXG5cclxuLy9cclxuLy8gZGVmYXVsdHNcclxuLy9cclxuXHJcbnJlcXVlc3QuZGVmYXVsdHMgPSBmdW5jdGlvbihvcHRpb25zLCByZXF1ZXN0ZXIpIHtcclxuICB2YXIgZGVmID0gZnVuY3Rpb24gKG1ldGhvZCkge1xyXG4gICAgdmFyIGQgPSBmdW5jdGlvbiAocGFyYW1zLCBjYWxsYmFjaykge1xyXG4gICAgICBpZih0eXBlb2YgcGFyYW1zID09PSAnc3RyaW5nJylcclxuICAgICAgICBwYXJhbXMgPSB7J3VyaSc6IHBhcmFtc307XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHBhcmFtcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocGFyYW1zKSk7XHJcbiAgICAgIH1cclxuICAgICAgZm9yICh2YXIgaSBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgaWYgKHBhcmFtc1tpXSA9PT0gdW5kZWZpbmVkKSBwYXJhbXNbaV0gPSBvcHRpb25zW2ldXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIG1ldGhvZChwYXJhbXMsIGNhbGxiYWNrKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGRcclxuICB9XHJcbiAgdmFyIGRlID0gZGVmKHJlcXVlc3QpXHJcbiAgZGUuZ2V0ID0gZGVmKHJlcXVlc3QuZ2V0KVxyXG4gIGRlLnBvc3QgPSBkZWYocmVxdWVzdC5wb3N0KVxyXG4gIGRlLnB1dCA9IGRlZihyZXF1ZXN0LnB1dClcclxuICBkZS5oZWFkID0gZGVmKHJlcXVlc3QuaGVhZClcclxuICByZXR1cm4gZGVcclxufVxyXG5cclxuLy9cclxuLy8gSFRUUCBtZXRob2Qgc2hvcnRjdXRzXHJcbi8vXHJcblxyXG52YXIgc2hvcnRjdXRzID0gWyAnZ2V0JywgJ3B1dCcsICdwb3N0JywgJ2hlYWQnIF07XHJcbnNob3J0Y3V0cy5mb3JFYWNoKGZ1bmN0aW9uKHNob3J0Y3V0KSB7XHJcbiAgdmFyIG1ldGhvZCA9IHNob3J0Y3V0LnRvVXBwZXJDYXNlKCk7XHJcbiAgdmFyIGZ1bmMgICA9IHNob3J0Y3V0LnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gIHJlcXVlc3RbZnVuY10gPSBmdW5jdGlvbihvcHRzKSB7XHJcbiAgICBpZih0eXBlb2Ygb3B0cyA9PT0gJ3N0cmluZycpXHJcbiAgICAgIG9wdHMgPSB7J21ldGhvZCc6bWV0aG9kLCAndXJpJzpvcHRzfTtcclxuICAgIGVsc2Uge1xyXG4gICAgICBvcHRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRzKSk7XHJcbiAgICAgIG9wdHMubWV0aG9kID0gbWV0aG9kO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBhcmdzID0gW29wdHNdLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuYXBwbHkoYXJndW1lbnRzLCBbMV0pKTtcclxuICAgIHJldHVybiByZXF1ZXN0LmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gIH1cclxufSlcclxuXHJcbi8vXHJcbi8vIENvdWNoREIgc2hvcnRjdXRcclxuLy9cclxuXHJcbnJlcXVlc3QuY291Y2ggPSBmdW5jdGlvbihvcHRpb25zLCBjYWxsYmFjaykge1xyXG4gIGlmKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJylcclxuICAgIG9wdGlvbnMgPSB7J3VyaSc6b3B0aW9uc31cclxuXHJcbiAgLy8gSnVzdCB1c2UgdGhlIHJlcXVlc3QgQVBJIHRvIGRvIEpTT04uXHJcbiAgb3B0aW9ucy5qc29uID0gdHJ1ZVxyXG4gIGlmKG9wdGlvbnMuYm9keSlcclxuICAgIG9wdGlvbnMuanNvbiA9IG9wdGlvbnMuYm9keVxyXG4gIGRlbGV0ZSBvcHRpb25zLmJvZHlcclxuXHJcbiAgY2FsbGJhY2sgPSBjYWxsYmFjayB8fCBub29wXHJcblxyXG4gIHZhciB4aHIgPSByZXF1ZXN0KG9wdGlvbnMsIGNvdWNoX2hhbmRsZXIpXHJcbiAgcmV0dXJuIHhoclxyXG5cclxuICBmdW5jdGlvbiBjb3VjaF9oYW5kbGVyKGVyLCByZXNwLCBib2R5KSB7XHJcbiAgICBpZihlcilcclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KVxyXG5cclxuICAgIGlmKChyZXNwLnN0YXR1c0NvZGUgPCAyMDAgfHwgcmVzcC5zdGF0dXNDb2RlID4gMjk5KSAmJiBib2R5LmVycm9yKSB7XHJcbiAgICAgIC8vIFRoZSBib2R5IGlzIGEgQ291Y2ggSlNPTiBvYmplY3QgaW5kaWNhdGluZyB0aGUgZXJyb3IuXHJcbiAgICAgIGVyID0gbmV3IEVycm9yKCdDb3VjaERCIGVycm9yOiAnICsgKGJvZHkuZXJyb3IucmVhc29uIHx8IGJvZHkuZXJyb3IuZXJyb3IpKVxyXG4gICAgICBmb3IgKHZhciBrZXkgaW4gYm9keSlcclxuICAgICAgICBlcltrZXldID0gYm9keVtrZXldXHJcbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KTtcclxuICB9XHJcbn1cclxuXHJcbi8vXHJcbi8vIFV0aWxpdHlcclxuLy9cclxuXHJcbmZ1bmN0aW9uIG5vb3AoKSB7fVxyXG5cclxuZnVuY3Rpb24gZ2V0TG9nZ2VyKCkge1xyXG4gIHZhciBsb2dnZXIgPSB7fVxyXG4gICAgLCBsZXZlbHMgPSBbJ3RyYWNlJywgJ2RlYnVnJywgJ2luZm8nLCAnd2FybicsICdlcnJvciddXHJcbiAgICAsIGxldmVsLCBpXHJcblxyXG4gIGZvcihpID0gMDsgaSA8IGxldmVscy5sZW5ndGg7IGkrKykge1xyXG4gICAgbGV2ZWwgPSBsZXZlbHNbaV1cclxuXHJcbiAgICBsb2dnZXJbbGV2ZWxdID0gbm9vcFxyXG4gICAgaWYodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIGNvbnNvbGUgJiYgY29uc29sZVtsZXZlbF0pXHJcbiAgICAgIGxvZ2dlcltsZXZlbF0gPSBmb3JtYXR0ZWQoY29uc29sZSwgbGV2ZWwpXHJcbiAgfVxyXG5cclxuICByZXR1cm4gbG9nZ2VyXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZvcm1hdHRlZChvYmosIG1ldGhvZCkge1xyXG4gIHJldHVybiBmb3JtYXR0ZWRfbG9nZ2VyXHJcblxyXG4gIGZ1bmN0aW9uIGZvcm1hdHRlZF9sb2dnZXIoc3RyLCBjb250ZXh0KSB7XHJcbiAgICBpZih0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpXHJcbiAgICAgIHN0ciArPSAnICcgKyBKU09OLnN0cmluZ2lmeShjb250ZXh0KVxyXG5cclxuICAgIHJldHVybiBvYmpbbWV0aG9kXS5jYWxsKG9iaiwgc3RyKVxyXG4gIH1cclxufVxyXG5cclxuLy8gUmV0dXJuIHdoZXRoZXIgYSBVUkwgaXMgYSBjcm9zcy1kb21haW4gcmVxdWVzdC5cclxuZnVuY3Rpb24gaXNfY3Jvc3NEb21haW4odXJsKSB7XHJcbiAgdmFyIHJ1cmwgPSAvXihbXFx3XFwrXFwuXFwtXSs6KSg/OlxcL1xcLyhbXlxcLz8jOl0qKSg/OjooXFxkKykpPyk/L1xyXG5cclxuICAvLyBqUXVlcnkgIzgxMzgsIElFIG1heSB0aHJvdyBhbiBleGNlcHRpb24gd2hlbiBhY2Nlc3NpbmdcclxuICAvLyBhIGZpZWxkIGZyb20gd2luZG93LmxvY2F0aW9uIGlmIGRvY3VtZW50LmRvbWFpbiBoYXMgYmVlbiBzZXRcclxuICB2YXIgYWpheExvY2F0aW9uXHJcbiAgdHJ5IHsgYWpheExvY2F0aW9uID0gbG9jYXRpb24uaHJlZiB9XHJcbiAgY2F0Y2ggKGUpIHtcclxuICAgIC8vIFVzZSB0aGUgaHJlZiBhdHRyaWJ1dGUgb2YgYW4gQSBlbGVtZW50IHNpbmNlIElFIHdpbGwgbW9kaWZ5IGl0IGdpdmVuIGRvY3VtZW50LmxvY2F0aW9uXHJcbiAgICBhamF4TG9jYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCBcImFcIiApO1xyXG4gICAgYWpheExvY2F0aW9uLmhyZWYgPSBcIlwiO1xyXG4gICAgYWpheExvY2F0aW9uID0gYWpheExvY2F0aW9uLmhyZWY7XHJcbiAgfVxyXG5cclxuICB2YXIgYWpheExvY1BhcnRzID0gcnVybC5leGVjKGFqYXhMb2NhdGlvbi50b0xvd2VyQ2FzZSgpKSB8fCBbXVxyXG4gICAgLCBwYXJ0cyA9IHJ1cmwuZXhlYyh1cmwudG9Mb3dlckNhc2UoKSApXHJcblxyXG4gIHZhciByZXN1bHQgPSAhIShcclxuICAgIHBhcnRzICYmXHJcbiAgICAoICBwYXJ0c1sxXSAhPSBhamF4TG9jUGFydHNbMV1cclxuICAgIHx8IHBhcnRzWzJdICE9IGFqYXhMb2NQYXJ0c1syXVxyXG4gICAgfHwgKHBhcnRzWzNdIHx8IChwYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKSAhPSAoYWpheExvY1BhcnRzWzNdIHx8IChhamF4TG9jUGFydHNbMV0gPT09IFwiaHR0cDpcIiA/IDgwIDogNDQzKSlcclxuICAgIClcclxuICApXHJcblxyXG4gIC8vY29uc29sZS5kZWJ1ZygnaXNfY3Jvc3NEb21haW4oJyt1cmwrJykgLT4gJyArIHJlc3VsdClcclxuICByZXR1cm4gcmVzdWx0XHJcbn1cclxuXHJcbi8vIE1JVCBMaWNlbnNlIGZyb20gaHR0cDovL3BocGpzLm9yZy9mdW5jdGlvbnMvYmFzZTY0X2VuY29kZTozNThcclxuZnVuY3Rpb24gYjY0X2VuYyAoZGF0YSkge1xyXG4gICAgLy8gRW5jb2RlcyBzdHJpbmcgdXNpbmcgTUlNRSBiYXNlNjQgYWxnb3JpdGhtXHJcbiAgICB2YXIgYjY0ID0gXCJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvPVwiO1xyXG4gICAgdmFyIG8xLCBvMiwgbzMsIGgxLCBoMiwgaDMsIGg0LCBiaXRzLCBpID0gMCwgYWMgPSAwLCBlbmM9XCJcIiwgdG1wX2FyciA9IFtdO1xyXG5cclxuICAgIGlmICghZGF0YSkge1xyXG4gICAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGFzc3VtZSB1dGY4IGRhdGFcclxuICAgIC8vIGRhdGEgPSB0aGlzLnV0ZjhfZW5jb2RlKGRhdGErJycpO1xyXG5cclxuICAgIGRvIHsgLy8gcGFjayB0aHJlZSBvY3RldHMgaW50byBmb3VyIGhleGV0c1xyXG4gICAgICAgIG8xID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XHJcbiAgICAgICAgbzIgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcclxuICAgICAgICBvMyA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xyXG5cclxuICAgICAgICBiaXRzID0gbzE8PDE2IHwgbzI8PDggfCBvMztcclxuXHJcbiAgICAgICAgaDEgPSBiaXRzPj4xOCAmIDB4M2Y7XHJcbiAgICAgICAgaDIgPSBiaXRzPj4xMiAmIDB4M2Y7XHJcbiAgICAgICAgaDMgPSBiaXRzPj42ICYgMHgzZjtcclxuICAgICAgICBoNCA9IGJpdHMgJiAweDNmO1xyXG5cclxuICAgICAgICAvLyB1c2UgaGV4ZXRzIHRvIGluZGV4IGludG8gYjY0LCBhbmQgYXBwZW5kIHJlc3VsdCB0byBlbmNvZGVkIHN0cmluZ1xyXG4gICAgICAgIHRtcF9hcnJbYWMrK10gPSBiNjQuY2hhckF0KGgxKSArIGI2NC5jaGFyQXQoaDIpICsgYjY0LmNoYXJBdChoMykgKyBiNjQuY2hhckF0KGg0KTtcclxuICAgIH0gd2hpbGUgKGkgPCBkYXRhLmxlbmd0aCk7XHJcblxyXG4gICAgZW5jID0gdG1wX2Fyci5qb2luKCcnKTtcclxuXHJcbiAgICBzd2l0Y2ggKGRhdGEubGVuZ3RoICUgMykge1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0yKSArICc9PSc7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgICAgICBlbmMgPSBlbmMuc2xpY2UoMCwgLTEpICsgJz0nO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBlbmM7XHJcbn1cclxuICAgIHJldHVybiByZXF1ZXN0O1xyXG4vL1VNRCBGT09URVIgU1RBUlRcclxufSkpO1xyXG4vL1VNRCBGT09URVIgRU5EXHJcbiIsImZ1bmN0aW9uIEUgKCkge1xyXG4gIC8vIEtlZXAgdGhpcyBlbXB0eSBzbyBpdCdzIGVhc2llciB0byBpbmhlcml0IGZyb21cclxuICAvLyAodmlhIGh0dHBzOi8vZ2l0aHViLmNvbS9saXBzbWFjayBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9zY290dGNvcmdhbi90aW55LWVtaXR0ZXIvaXNzdWVzLzMpXHJcbn1cclxuXHJcbkUucHJvdG90eXBlID0ge1xyXG4gIG9uOiBmdW5jdGlvbiAobmFtZSwgY2FsbGJhY2ssIGN0eCkge1xyXG4gICAgdmFyIGUgPSB0aGlzLmUgfHwgKHRoaXMuZSA9IHt9KTtcclxuXHJcbiAgICAoZVtuYW1lXSB8fCAoZVtuYW1lXSA9IFtdKSkucHVzaCh7XHJcbiAgICAgIGZuOiBjYWxsYmFjayxcclxuICAgICAgY3R4OiBjdHhcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH0sXHJcblxyXG4gIG9uY2U6IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaywgY3R4KSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBmdW5jdGlvbiBsaXN0ZW5lciAoKSB7XHJcbiAgICAgIHNlbGYub2ZmKG5hbWUsIGxpc3RlbmVyKTtcclxuICAgICAgY2FsbGJhY2suYXBwbHkoY3R4LCBhcmd1bWVudHMpO1xyXG4gICAgfTtcclxuXHJcbiAgICBsaXN0ZW5lci5fID0gY2FsbGJhY2tcclxuICAgIHJldHVybiB0aGlzLm9uKG5hbWUsIGxpc3RlbmVyLCBjdHgpO1xyXG4gIH0sXHJcblxyXG4gIGVtaXQ6IGZ1bmN0aW9uIChuYW1lKSB7XHJcbiAgICB2YXIgZGF0YSA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcclxuICAgIHZhciBldnRBcnIgPSAoKHRoaXMuZSB8fCAodGhpcy5lID0ge30pKVtuYW1lXSB8fCBbXSkuc2xpY2UoKTtcclxuICAgIHZhciBpID0gMDtcclxuICAgIHZhciBsZW4gPSBldnRBcnIubGVuZ3RoO1xyXG5cclxuICAgIGZvciAoaTsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgIGV2dEFycltpXS5mbi5hcHBseShldnRBcnJbaV0uY3R4LCBkYXRhKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxuICB9LFxyXG5cclxuICBvZmY6IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaykge1xyXG4gICAgdmFyIGUgPSB0aGlzLmUgfHwgKHRoaXMuZSA9IHt9KTtcclxuICAgIHZhciBldnRzID0gZVtuYW1lXTtcclxuICAgIHZhciBsaXZlRXZlbnRzID0gW107XHJcblxyXG4gICAgaWYgKGV2dHMgJiYgY2FsbGJhY2spIHtcclxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGV2dHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcclxuICAgICAgICBpZiAoZXZ0c1tpXS5mbiAhPT0gY2FsbGJhY2sgJiYgZXZ0c1tpXS5mbi5fICE9PSBjYWxsYmFjaylcclxuICAgICAgICAgIGxpdmVFdmVudHMucHVzaChldnRzW2ldKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlbW92ZSBldmVudCBmcm9tIHF1ZXVlIHRvIHByZXZlbnQgbWVtb3J5IGxlYWtcclxuICAgIC8vIFN1Z2dlc3RlZCBieSBodHRwczovL2dpdGh1Yi5jb20vbGF6ZFxyXG4gICAgLy8gUmVmOiBodHRwczovL2dpdGh1Yi5jb20vc2NvdHRjb3JnYW4vdGlueS1lbWl0dGVyL2NvbW1pdC9jNmViZmFhOWJjOTczYjMzZDExMGE4NGEzMDc3NDJiN2NmOTRjOTUzI2NvbW1pdGNvbW1lbnQtNTAyNDkxMFxyXG5cclxuICAgIChsaXZlRXZlbnRzLmxlbmd0aClcclxuICAgICAgPyBlW25hbWVdID0gbGl2ZUV2ZW50c1xyXG4gICAgICA6IGRlbGV0ZSBlW25hbWVdO1xyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gRTtcclxubW9kdWxlLmV4cG9ydHMuVGlueUVtaXR0ZXIgPSBFO1xyXG4iLCJjb25zdCBMb2dpbiA9IHJlcXVpcmUoXCIuL2NvbXBvbmVudHMvbG9naW4uanNcIik7XHJcbmNvbnN0IEFkbWluaXN0cmFjYW8gPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL2FkbWluaXN0cmFjYW8uanNcIik7XHJcbmNvbnN0IE1lbnUgPSByZXF1aXJlKFwiLi9jb21wb25lbnRzL21lbnUuanNcIik7XHJcblxyXG5jbGFzcyBBcHAge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHRoaXMubG9naW4gPSBuZXcgTG9naW4oYm9keSk7XHJcbiAgICAgICAgdGhpcy5hZG1pbmlzdHJhY2FvID0gbmV3IEFkbWluaXN0cmFjYW8oYm9keSk7XHJcbiAgICAgICAgdGhpcy5tZW51ID0gbmV3IE1lbnUoYm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5pdCgpIHtcclxuICAgICAgICB0aGlzLmxvZ2luLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZEV2ZW50TGlzdGVuZXIoKSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbkV2ZW50cygpO1xyXG4gICAgICAgIHRoaXMuYWRtaW5pc3RyYWNhb0V2ZW50cygpO1xyXG4gICAgfVxyXG5cclxuICAgIGxvZ2luRXZlbnRzKCkge1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJlcnJvclwiLCAoKSA9PiBhbGVydChcIlVzdWFyaW8gb3Ugc2VuaGEgaW5jb3JyZXRvc1wiKSk7XHJcbiAgICAgICAgdGhpcy5sb2dpbi5vbihcImxvZ2luQWRtaW5cIiwgKCkgPT4gdGhpcy5hZG1pbmlzdHJhY2FvLnJlbmRlcigpKTtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwibG9naW5BbHVub1wiLCAoKSA9PiB0aGlzLm1lbnUucmVuZGVyKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkbWluaXN0cmFjYW9FdmVudHMoKSB7XHJcbiAgICAgICAgLy90aGlzLmFkbWluaXN0cmFjYW8ub24oXCJwcmVlbmNoYUdyaWRcIiwgKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBcHA7IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvYWRtaW5pc3RyYWNhby5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGVNb2RhbCA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvY2FkYXN0cm9BbHVuby5qc1wiKTtcclxuY29uc3QgTG9naW4gPSByZXF1aXJlKFwiLi9sb2dpbi5qc1wiKTtcclxuY29uc3QgQ2FkYXN0cm9BbHVubyA9IHJlcXVpcmUoXCIuL2NhZGFzdHJvQWx1bm8uanNcIik7XHJcblxyXG5jbGFzcyBBZG1pbmlzdHJhY2FvIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IG5ldyBMb2dpbihib2R5KTtcclxuICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8gPSBuZXcgQ2FkYXN0cm9BbHVubyhib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJHcmlkQWx1bm9zKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmxvZ291dCgpO1xyXG4gICAgICAgIHRoaXMuY2xpY2tCb3Rhb0FkaWNpb25hcigpO1xyXG4gICAgICAgIC8vIHRoaXMuY2xpY2tCb3Rhb0VkaXRhcigpO1xyXG4gICAgICAgIC8vIHRoaXMuY2xpY2tCb3Rhb0V4Y2x1aXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dvdXQoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbYm90YW9TaHV0ZG93bl1cIikub25jbGljayA9ICgpID0+IHRoaXMubG9naW4ucmVuZGVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgY2xpY2tCb3Rhb0FkaWNpb25hcigpIHtcclxuICAgICAgICB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcIltib3Rhb0FkaWNpb25hcl1cIikub25jbGljayA9ICgpID0+IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbENhZGFzdHJvQWx1bm8nKS5tb2RhbCh7c2hvdzogdHJ1ZX0pO1xyXG4gICAgfVxyXG5cclxuICAgIGNoYW1lTW9kYWwoKSB7XHJcbiAgICAgICAgdGhpcy5jYWRhc3Ryb0FsdW5vLnJlbmRlcigpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckdyaWRBbHVub3MoKSB7XHJcbiAgICAgICAgY29uc3Qgb3B0cyA9IHtcclxuICAgICAgICAgICAgbWV0aG9kOiBcIkdFVFwiLFxyXG4gICAgICAgICAgICB1cmw6IGAke3RoaXMuVVJMfS9hZG1pbmlzdHJhY2FvYCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImVycm9yXCIsIFwibsOjbyBmb2kgcG9zc8OtdmVsIGNhcnJlZ2FyIG9zIGFsdW5vc1wiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoZGF0YS5hbHVub3MpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBBZG1pbmlzdHJhY2FvOyIsImNvbnN0IFRpbnlFbWl0dGVyID0gcmVxdWlyZShcInRpbnktZW1pdHRlclwiKTtcclxuY29uc3QgUmVxdWVzdCA9IHJlcXVpcmUoXCJicm93c2VyLXJlcXVlc3RcIik7XHJcblxyXG5jbGFzcyBBZ2VuZGEgZXh0ZW5kcyBUaW55RW1pdHRlciB7XHJcbiAgICBjb25zdHJ1Y3Rvcigpe1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0ID0gUmVxdWVzdDtcclxuICAgICAgICB0aGlzLlVSTCA9IFwiaHR0cDovL2xvY2FsaG9zdDozMzMzXCI7XHJcbiAgICB9XHJcbn1cclxubW9kdWxlLmV4cG9ydHMgPSBBZ2VuZGE7IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvY2FkYXN0cm9BbHVuby5qc1wiKTtcclxuY29uc3QgTG9naW4gPSByZXF1aXJlKFwiLi9sb2dpbi5qc1wiKTtcclxuXHJcbmNsYXNzIENhZGFzdHJvQWx1bm8gZXh0ZW5kcyBBZ2VuZGEge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgICAgICB0aGlzLmxvZ2luID0gbmV3IExvZ2luKGJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLmJvZHkuaW5uZXJIVE1MICs9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIC8vdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICAgICAgLy90aGlzLm1vbnRlR3JpZCgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IENhZGFzdHJvQWx1bm87IiwiY29uc3QgQWdlbmRhID0gcmVxdWlyZShcIi4vYWdlbmRhLmpzXCIpO1xyXG5jb25zdCBUZW1wbGF0ZSA9IHJlcXVpcmUoXCIuLi90ZW1wbGF0ZXMvbG9naW4uanNcIik7XHJcblxyXG5jbGFzcyBMb2dpbiBleHRlbmRzIEFnZW5kYSB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgc3VwZXIoKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBib2R5O1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLmJvZHkuaW5uZXJIVE1MID0gVGVtcGxhdGUucmVuZGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJbdXN1YXJpb11cIikuZm9jdXMoKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVyKCkge1xyXG4gICAgICAgIHRoaXMuZW52aWVGb3JtdWxhcmlvKCk7XHJcbiAgICAgICAgdGhpcy5lc3F1ZWNldVNlbmhhKCk7XHJcbiAgICB9XHJcblxyXG4gICAgZW52aWVGb3JtdWxhcmlvKCkge1xyXG4gICAgICAgIGNvbnN0IGZvcm0gPSB0aGlzLmJvZHkucXVlcnlTZWxlY3RvcihcImZvcm1cIik7XHJcbiAgICAgICAgZm9ybS5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgY29uc3QgdXN1YXJpbyA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbdXN1YXJpb11cIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlbmhhID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcihcIltzZW5oYV1cIik7XHJcbiAgICAgICAgICAgIHRoaXMuYXV0ZW50aXF1ZVVzdWFyaW8odXN1YXJpbywgc2VuaGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGF1dGVudGlxdWVVc3VhcmlvKHVzdWFyaW8sIHNlbmhhKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IG9wdHMgPSB7XHJcbiAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9L0xvZ2luYCxcclxuICAgICAgICAgICAganNvbjogdHJ1ZSxcclxuICAgICAgICAgICAgYm9keToge1xyXG4gICAgICAgICAgICAgICAgbG9naW46IHVzdWFyaW8udmFsdWUsXHJcbiAgICAgICAgICAgICAgICBzZW5oYTogc2VuaGEudmFsdWVcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMucmVxdWVzdChvcHRzLCAoZXJyLCByZXNwLCBkYXRhKSA9PiB7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmxvZ2FVc3VhcmlvKHJlc3AsIGVyciwgZGF0YSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgbG9nYVVzdWFyaW8ocmVzcCwgZXJyLCBkYXRhKSB7XHJcblxyXG4gICAgICAgIGlmIChyZXNwLnN0YXR1cyAhPT0gMjAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZW1pdChcImVycm9yXCIsIGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgeyAgICAgICAgICAgIFxyXG5cclxuICAgICAgICAgICAgaWYgKGRhdGEuYWRtaW4pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImxvZ2luQWRtaW5cIiwgZGF0YSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJsb2dpbkFsdW5vXCIsIGRhdGEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGVzcXVlY2V1U2VuaGEoKSB7XHJcbiAgICAgICAgLy9jb2RpZ28gcHJhIGNoYW1hciBlbSBVUkxcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBMb2dpbjsiLCJjb25zdCBBZ2VuZGEgPSByZXF1aXJlKFwiLi9hZ2VuZGEuanNcIik7XHJcbmNvbnN0IFRlbXBsYXRlID0gcmVxdWlyZShcIi4uL3RlbXBsYXRlcy9tZW51LmpzXCIpO1xyXG5cclxuY2xhc3MgTWVudSBleHRlbmRzIEFnZW5kYSB7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigpO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZEV2ZW50TGlzdGVuZXIoKSB7XHJcbiAgICAgICAgLy90aGlzLmFkZEV2ZW50TGlzdGVuZXIoXCJMb2FkXCIsIClcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBNZW51OyIsImNvbnN0IEhlYWRlciA9IHJlcXVpcmUoXCIuL2hlYWRlci5qc1wiKTtcclxuY29uc3QgTW9kYWxDYWRhc3Ryb0FsdW5vID0gcmVxdWlyZShcIi4vY2FkYXN0cm9BbHVuby5qc1wiKTtcclxuXHJcbmNvbnN0IHJlbmRlckdyaWRBbHVub3MgPSBhbHVub3MgPT4ge1xyXG4gICAgcmV0dXJuIGFsdW5vcy5tYXAoYWx1bm8gPT4ge1xyXG5cclxuICAgICAgICBsZXQgY29yTGluaGEgPSBhbHVuby5pZCAlIDIgPT09IDAgPyBcImJhY2stZ3JpZHJvdzFcIiA6IFwiYmFjay1ncmlkcm93MlwiO1xyXG5cclxuICAgICAgICByZXR1cm4gYFxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJyb3cgJHtjb3JMaW5oYX0gdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgICAgIDxkaXYgY29kaWdvQWx1bm89JHthbHVuby5pZH0+PC9kaXY+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwIGZvcm0tY2hlY2tcIj5cclxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cImNoZWNrYm94XCIgY2xhc3M9XCJmb3JtLWNoZWNrLWlucHV0IG10LTRcIiBpZD1cImV4YW1wbGVDaGVjazFcIj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPGxhYmVsIGNsYXNzPVwidGV4dC1jZW50ZXIgbWItMlwiPiR7YWx1bm8ubm9tZX08L2xhYmVsPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbSBcIj5cclxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cInRleHQtY2VudGVyIG10LTNcIj4ke2FsdW5vLmNwZn08L2xhYmVsPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICBcclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbSBcIj5cclxuICAgICAgICAgICAgICAgIDxsYWJlbCBjbGFzcz1cInRleHQtY2VudGVyIG10LTNcIj4ke2FsdW5vLm1hdHJpY3VsYX08L2xhYmVsPlxyXG4gICAgICAgICAgICA8L2Rpdj4gICAgICAgIFxyXG4gICAgICAgIDwvZGl2PmBcclxuICAgIH0pLmpvaW4oXCJcIik7XHJcbn1cclxuXHJcbmV4cG9ydHMucmVuZGVyID0gYWx1bm9zID0+IHtcclxuICAgIFxyXG4gICAgcmV0dXJuIGBcclxuXHJcbiAgICAke0hlYWRlci5yZW5kZXIoKX1cclxuXHJcbiAgICA8ZGl2IGNsYXNzPVwiaW1nLWZsdWlkIHRleHQtcmlnaHQgbXItNSBtdC01IHRleHQtd2hpdGUgYm90YW9TaHV0ZG93blwiIGJvdGFvU2h1dGRvd24+XHJcbiAgICAgICAgPGEgaHJlZj1cIiNcIj48aW1nIHNyYz1cIi4vaW1hZ2VzL3NodXRkb3duLnBuZ1wiIGFsdD1cIlwiPjwvYT5cclxuICAgICAgICA8c3Ryb25nIGNsYXNzPVwibXItMVwiPlNhaXI8L3N0cm9uZz5cclxuICAgIDwvZGl2PlxyXG4gICAgXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XHJcbiAgICAgICAgPGRpdj5cclxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLTIgbXQtMlwiPlxyXG4gICAgICAgICAgICAgICAgw4FyZWEgQWRtaW5pc3RyYXRpdmFcclxuICAgICAgICAgICAgPC9zcGFuPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lclwiPlxyXG4gICAgXHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvdyAgYm9yZGVyIGJvcmRlci13aGl0ZSBiYWNrLWdyaWQgdGV4dC13aGl0ZVwiPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIHRleHQtY2VudGVyXCI+XHJcbiAgICAgICAgICAgICAgICBOb21lXHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbSB0ZXh0LWNlbnRlclwiPlxyXG4gICAgICAgICAgICAgICAgQ1BGXHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbSB0ZXh0LWNlbnRlclwiPlxyXG4gICAgICAgICAgICAgICAgTWF0csOtY3VsYVxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgJHtyZW5kZXJHcmlkQWx1bm9zKGFsdW5vcyl9XHJcblxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXIgY29sLXNtIG10LTNcIj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNlbnRlcmVkXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnkgYnRuLWRhcmtcIiBkYXRhLXRvZ2dsZT1cIm1vZGFsXCIgZGF0YS10YXJnZXQ9XCIjbW9kYWxDYWRhc3Ryb0FsdW5vXCIgYm90YW9BZGljaW9uYXI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEFkaWNpb25hclxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tZGFya1wiIGJvdGFvRWRpdGFyPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBFZGl0YXJcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLWRhcmtcIiBib3Rhb0V4Y2x1aXI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEV4Y2x1aXJcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgJHtNb2RhbENhZGFzdHJvQWx1bm8ucmVuZGVyKCl9XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj4gICAgXHJcblxyXG4gICAgYDsgXHJcbn0iLCJjb25zdCBpbnB1dEVuZGVyZWNvID0gYFxyXG48ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJjZXBcIj5DRVA8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgaWQ9XCJjZXBcIiB0eXBlPVwidGV4dFwiIHJlcXVpcmVkLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJsb2dyYWRvdXJvXCI+TG9ncmFkb3VybzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiBpZD1cImxvZ3JhZG91cm9cIiB0eXBlPVwidGV4dFwiIHJlcXVpcmVkLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cIm51bWVyb1wiPk7Dum1lcm88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgaWQ9XCJudW1lcm9cIiB0eXBlPVwidGV4dFwiIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY29tcGxlbWVudG9cIj5Db21wbGVtZW50bzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiBpZD1cImNvbXBsZW1lbnRvXCIgdHlwZT1cInRleHRcIiAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiYmFpcnJvXCI+QmFpcnJvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIGlkPVwiYmFpcnJvXCIgdHlwZT1cInRleHRcIiByZXF1aXJlZC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImNpZGFkZVwiPkNpZGFkZTwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiBpZD1cImNpZGFkZVwiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuYDtcclxuXHJcbmNvbnN0IG1vZGFsQ2FkYXN0cm9BbHVubyA9IGBcclxuPGRpdiBjbGFzcz1cIm1vZGFsIGZhZGVcIiBpZD1cIm1vZGFsQ2FkYXN0cm9BbHVub1wiIHRhYmluZGV4PVwiLTFcIiByb2xlPVwiZGlhbG9nXCIgYXJpYS1sYWJlbGxlZGJ5PVwidGl0dWxvTW9kYWxcIiBhcmlhLWhpZGRlbj1cInRydWVcIiBtb2RhbD5cclxuICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1kaWFsb2cgbW9kYWwtZGlhbG9nLWNlbnRlcmVkXCIgcm9sZT1cImRvY3VtZW50XCIgPlxyXG4gICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtaGVhZGVyXCI+XHJcbiAgICAgICAgICAgICAgICA8aDUgY2xhc3M9XCJtb2RhbC10aXRsZVwiIGlkPVwidGl0dWxvTW9kYWxcIj5BZGljaW9uYXIgTm92byBBbHVubzwvaDU+XHJcbiAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImNsb3NlXCIgZGF0YS1kaXNtaXNzPVwibW9kYWxcIiBhcmlhLWxhYmVsPVwiRmVjaGFyXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gYXJpYS1oaWRkZW49XCJ0cnVlXCI+JnRpbWVzOzwvc3Bhbj5cclxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1ib2R5XCI+XHJcbiAgICAgICAgICAgICAgICA8Zm9ybT5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbD5Ob21lIENvbXBsZXRvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFyayBjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiIGlkPVwiaW5jbHVkZV9kYXRlXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWw+RGF0YSBkZSBOYXNjaW1lbnRvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFyayBjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJjcGZcIj5DUEY8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGlkPVwiY3BmXCIgdHlwZT1cInRleHRcIiBhdXRvY29tcGxldGU9XCJvZmZcIiBvbmtleXVwPVwiTWFza0NwZignX19fLl9fXy5fX18tX18nLCB0aGlzKVwiIGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJ0ZWxcIj5UZWxlZm9uZTwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgaWQ9XCJ0ZWxcIiB0eXBlPVwidGV4dFwiIGF1dG9jb21wbGV0ZT1cIm9mZlwiIG9ua2V5dXA9XCJNYXNrVGVsKCcoX18pX19fX18tX19fXycsIHRoaXMpXCIgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBmb3I9XCJlbWFpbFwiPkUtbWFpbDwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgaWQ9XCJlbWFpbFwiIHR5cGU9XCJ0ZXh0XCIgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+ICAgICAgICAgICAgICAgICAgICBcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgJHtpbnB1dEVuZGVyZWNvfVxyXG5cclxuICAgICAgICAgICAgICAgIDwvZm9ybT5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtZm9vdGVyXCI+XHJcbiAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tc2Vjb25kYXJ5XCIgZGF0YS1kaXNtaXNzPVwibW9kYWxcIj5GZWNoYXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCI+U2FsdmFyPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PlxyXG5gO1xyXG5cclxuXHJcbmV4cG9ydHMucmVuZGVyID0gKCkgPT4ge1xyXG4gICAgcmV0dXJuIG1vZGFsQ2FkYXN0cm9BbHVubztcclxufSIsImV4cG9ydHMucmVuZGVyID0gKCkgPT4ge1xyXG4gICAgcmV0dXJuIGBcclxuICAgIDwhLS0gPGhlYWRlcj5cclxuICAgICAgICA8c2NyaXB0IHNyYz1cInZlbmRvci9qcXVlcnkvanF1ZXJ5LTMuMi4xLm1pbi5qcyBcIj48L3NjcmlwdD5cclxuICAgICAgICA8c2NyaXB0IHNyYz1cInZlbmRvci9hbmltc2l0aW9uL2pzL2FuaW1zaXRpb24ubWluLmpzIFwiPjwvc2NyaXB0PlxyXG4gICAgICAgIDxzY3JpcHQgc3JjPVwidmVuZG9yL2Jvb3RzdHJhcC9qcy9wb3BwZXIuanMgXCI+PC9zY3JpcHQ+XHJcbiAgICAgICAgPHNjcmlwdCBzcmM9XCJ2ZW5kb3IvYm9vdHN0cmFwL2pzL2Jvb3RzdHJhcC5taW4uanMgXCI+PC9zY3JpcHQ+XHJcbiAgICAgICAgPHNjcmlwdCBzcmM9XCJ2ZW5kb3Ivc2VsZWN0Mi9zZWxlY3QyLm1pbi5qcyBcIj48L3NjcmlwdD5cclxuICAgICAgICA8c2NyaXB0IHNyYz1cInZlbmRvci9kYXRlcmFuZ2VwaWNrZXIvbW9tZW50Lm1pbi5qcyBcIj48L3NjcmlwdD5cclxuICAgICAgICA8c2NyaXB0IHNyYz1cInZlbmRvci9kYXRlcmFuZ2VwaWNrZXIvZGF0ZXJhbmdlcGlja2VyLmpzIFwiPjwvc2NyaXB0PlxyXG4gICAgICAgIDxzY3JpcHQgc3JjPVwidmVuZG9yL2NvdW50ZG93bnRpbWUvY291bnRkb3dudGltZS5qcyBcIj48L3NjcmlwdD5cclxuICAgICAgICA8c2NyaXB0IHNyYz1cIi4vanMvYXBwLmpzXCI+PC9zY3JpcHQ+XHJcbiAgICAgICAgPHNjcmlwdCBzcmM9XCIuL2pzL2pzRnJvbnQvdGVsYUFkbS5qc1wiPjwvc2NyaXB0PlxyXG4gICAgPC9oZWFkZXI+IC0tPlxyXG4gICAgYDtcclxufSIsImV4cG9ydHMucmVuZGVyID0gKCkgPT4ge1xyXG4gICAgcmV0dXJuIGAgPGJvZHk+XHJcbiAgICA8bGFiZWwgY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLXQtODBcIj5BY2Vzc28gZGEgQ29udGE8L2xhYmVsPlxyXG4gICAgPGRpdiBjbGFzcz1cImNhcmRcIiBpZD1cInRlbGFMb2dpblwiPiAgICAgICBcclxuICAgICAgICA8bWFpbj4gICAgICAgIFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY2FyZC1ib2R5XCI+XHJcbiAgICAgICAgICAgICAgICA8Zm9ybT5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cCByczEgdmFsaWRhdGUtaW5wdXRcIiBkYXRhLXZhbGlkYXRlPVwiQ2FtcG8gb2JyaWdhdMOzcmlvXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGNsYXNzPVwiZm9ybS1jb250cm9sXCIgaWQ9XCJcIiBwbGFjZWhvbGRlcj1cIlVzdcOhcmlvXCIgdXN1YXJpbz5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwIHJzMiB2YWxpZGF0ZS1pbnB1dFwiIGRhdGEtdmFsaWRhdGU9XCJDYW1wbyBvYnJpZ2F0w7NyaW9cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9XCJwYXNzd29yZFwiIGNsYXNzPVwiZm9ybS1jb250cm9sXCIgaWQ9XCJcIiBwbGFjZWhvbGRlcj1cIlNlbmhhXCIgc2VuaGE+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cInN1Ym1pdFwiIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5IGJ0biBidG4tb3V0bGluZS1kYXJrIGJ0bi1sZyBidG4tYmxvY2tcIiBocmVmPVwibWVudS5odG1sXCIgYm90YW9Mb2dpbj5FbnRyYXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwidGV4dC1jZW50ZXIgdy1mdWxsIHAtdC0yM1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8YSBocmVmPVwiI1wiIGNsYXNzPVwidGV4dC1zZWNvbmRhcnlcIj5cclxuXHRcdCAgICBcdFx0XHRcdFx0RXNxdWVjZXUgYSBTZW5oYT8gRW50cmUgZW0gQ29udGF0byBDb25vc2NvIENsaWNhbmRvIEFxdWkuXHJcblx0XHQgICAgXHRcdFx0XHQ8L2E+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8L2Zvcm0+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwvbWFpbj5cclxuICAgICAgICA8Zm9vdGVyPjwvZm9vdGVyPlxyXG4gICAgPC9kaXY+XHJcbjwvYm9keT5gO1xyXG59IiwiZXhwb3J0cy5yZW5kZXIgPSAoKSA9PiB7XHJcbiAgICByZXR1cm4gYDxoZWFkPlxyXG4gICAgPGRpdiBjbGFzcz1cImxpbWl0ZXJcIj5cclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXItbG9naW4xMDBcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwid3JhcC1sb2dpbjEwMCBwLWItMTYwIHAtdC01MFwiPlxyXG5cclxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00M1wiPlxyXG4gICAgICAgICAgICAgICAgICAgIFNlbGVjaW9uZSB1bWEgc2FsYSBwYXJhIGZhemVyIGEgbWFyY2HDp8OjbyBkYXMgYXVsYXNcclxuICAgICAgICAgICAgICAgIDwvc3Bhbj5cclxuXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXItbWVudTEwMC1idG5cIj5cclxuICAgICAgICAgICAgICAgIDxidXR0b24gb25jbGljaz1cInRlbGFfbXVzYygpXCIgY2xhc3M9XCJtZW51MTAwLWZvcm0tYnRuMlwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgTXVzY3VsYcOnw6NvICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lci1tZW51MTAwLWJ0blwiPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBvbmNsaWNrPVwidGVsYV9tdWx0KClcIiBjbGFzcz1cIm1lbnUxMDAtZm9ybS1idG4xXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIE11bHRpZnVuY2lvbmFsXHJcbiAgICAgICAgICAgICAgICAgICAgPC9hPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuPC9kaXY+XHJcbmA7XHJcbn0iLCJjb25zdCBBcHAgPSByZXF1aXJlKFwiLi9hcHAuanNcIik7XHJcblxyXG53aW5kb3cub25sb2FkID0gKCkgPT4ge1xyXG4gICAgY29uc3QgbWFpbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJtYWluXCIpO1xyXG4gICAgbmV3IEFwcChtYWluKS5pbml0KCk7XHJcbn0iXX0=
