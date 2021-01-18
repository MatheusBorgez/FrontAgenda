(function() {
    function r(e, n, t) {
        function o(i, f) {
            if (!n[i]) {
                if (!e[i]) { var c = "function" == typeof require && require; if (!f && c) return c(i, !0); if (u) return u(i, !0); var a = new Error("Cannot find module '" + i + "'"); throw a.code = "MODULE_NOT_FOUND", a }
                var p = n[i] = { exports: {} };
                e[i][0].call(p.exports, function(r) { var n = e[i][1][r]; return o(n || r) }, p, p.exports, r, e, n, t)
            }
            return n[i].exports
        }
        for (var u = "function" == typeof require && require, i = 0; i < t.length; i++) o(t[i]);
        return o
    }
    return r
})()({
    1: [function(require, module, exports) {
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
        (function(root, factory) {
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
        }(this, function() {
            // UMD HEADER END

            var XHR = XMLHttpRequest
            if (!XHR) throw new Error('missing XMLHttpRequest')
            request.log = {
                'trace': noop,
                'debug': noop,
                'info': noop,
                'warn': noop,
                'error': noop
            }

            var DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

            //
            // request
            //

            function request(options, callback) {
                // The entry-point to the API: prep the options object and pass the real work to run_xhr.
                if (typeof callback !== 'function')
                    throw new Error('Bad callback given: ' + callback)

                if (!options)
                    throw new Error('No options given')

                var options_onResponse = options.onResponse; // Save this for later.

                if (typeof options === 'string')
                    options = { 'uri': options };
                else
                    options = JSON.parse(JSON.stringify(options)); // Use a duplicate for mutating.

                options.onResponse = options_onResponse // And put it back.

                if (options.verbose) request.log = getLogger();

                if (options.url) {
                    options.uri = options.url;
                    delete options.url;
                }

                if (!options.uri && options.uri !== "")
                    throw new Error("options.uri is a required argument");

                if (typeof options.uri != "string")
                    throw new Error("options.uri must be a string");

                var unsupported_options = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
                for (var i = 0; i < unsupported_options.length; i++)
                    if (options[unsupported_options[i]])
                        throw new Error("options." + unsupported_options[i] + " is not supported")

                options.callback = callback
                options.method = options.method || 'GET';
                options.headers = options.headers || {};
                options.body = options.body || null
                options.timeout = options.timeout || request.DEFAULT_TIMEOUT

                if (options.headers.host)
                    throw new Error("Options.headers.host is not supported");

                if (options.json) {
                    options.headers.accept = options.headers.accept || 'application/json'
                    if (options.method !== 'GET')
                        options.headers['content-type'] = 'application/json'

                    if (typeof options.json !== 'boolean')
                        options.body = JSON.stringify(options.json)
                    else if (typeof options.body !== 'string')
                        options.body = JSON.stringify(options.body)
                }

                //BEGIN QS Hack
                var serialize = function(obj) {
                    var str = [];
                    for (var p in obj)
                        if (obj.hasOwnProperty(p)) {
                            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
                        }
                    return str.join("&");
                }

                if (options.qs) {
                    var qs = (typeof options.qs == 'string') ? options.qs : serialize(options.qs);
                    if (options.uri.indexOf('?') !== -1) { //no get params
                        options.uri = options.uri + '&' + qs;
                    } else { //existing get params
                        options.uri = options.uri + '?' + qs;
                    }
                }
                //END QS Hack

                //BEGIN FORM Hack
                var multipart = function(obj) {
                    //todo: support file type (useful?)
                    var result = {};
                    result.boundry = '-------------------------------' + Math.floor(Math.random() * 1000000000);
                    var lines = [];
                    for (var p in obj) {
                        if (obj.hasOwnProperty(p)) {
                            lines.push(
                                '--' + result.boundry + "\n" +
                                'Content-Disposition: form-data; name="' + p + '"' + "\n" +
                                "\n" +
                                obj[p] + "\n"
                            );
                        }
                    }
                    lines.push('--' + result.boundry + '--');
                    result.body = lines.join('');
                    result.length = result.body.length;
                    result.type = 'multipart/form-data; boundary=' + result.boundry;
                    return result;
                }

                if (options.form) {
                    if (typeof options.form == 'string') throw ('form name unsupported');
                    if (options.method === 'POST') {
                        var encoding = (options.encoding || 'application/x-www-form-urlencoded').toLowerCase();
                        options.headers['content-type'] = encoding;
                        switch (encoding) {
                            case 'application/x-www-form-urlencoded':
                                options.body = serialize(options.form).replace(/%20/g, "+");
                                break;
                            case 'multipart/form-data':
                                var multi = multipart(options.form);
                                //options.headers['content-length'] = multi.length;
                                options.body = multi.body;
                                options.headers['content-type'] = multi.type;
                                break;
                            default:
                                throw new Error('unsupported encoding:' + encoding);
                        }
                    }
                }
                //END FORM Hack

                // If onResponse is boolean true, call back immediately when the response is known,
                // not when the full request is complete.
                options.onResponse = options.onResponse || noop
                if (options.onResponse === true) {
                    options.onResponse = callback
                    options.callback = noop
                }

                // XXX Browsers do not like this.
                //if(options.body)
                //  options.headers['content-length'] = options.body.length;

                // HTTP basic authentication
                if (!options.headers.authorization && options.auth)
                    options.headers.authorization = 'Basic ' + b64_enc(options.auth.username + ':' + options.auth.password);

                return run_xhr(options)
            }

            var req_seq = 0

            function run_xhr(options) {
                var xhr = new XHR,
                    timed_out = false,
                    is_cors = is_crossDomain(options.uri),
                    supports_cors = ('withCredentials' in xhr)

                req_seq += 1
                xhr.seq_id = req_seq
                xhr.id = req_seq + ': ' + options.method + ' ' + options.uri
                xhr._id = xhr.id // I know I will type "_id" from habit all the time.

                if (is_cors && !supports_cors) {
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

                    request.log.error('Timeout', { 'id': xhr._id, 'milliseconds': options.timeout })
                    return options.callback(er, xhr)
                }

                // Some states can be skipped over, so remember what is still incomplete.
                var did = { 'response': false, 'loading': false, 'end': false }

                xhr.onreadystatechange = on_state_change
                xhr.open(options.method, options.uri, true) // asynchronous
                if (is_cors)
                    xhr.withCredentials = !!options.withCredentials
                xhr.send(options.body)
                return xhr

                function on_state_change(event) {
                    if (timed_out)
                        return request.log.debug('Ignoring timed out state change', { 'state': xhr.readyState, 'id': xhr.id })

                    request.log.debug('State change', { 'state': xhr.readyState, 'id': xhr.id, 'timed_out': timed_out })

                    if (xhr.readyState === XHR.OPENED) {
                        request.log.debug('Request started', { 'id': xhr.id })
                        for (var key in options.headers)
                            xhr.setRequestHeader(key, options.headers[key])
                    } else if (xhr.readyState === XHR.HEADERS_RECEIVED)
                        on_response()

                    else if (xhr.readyState === XHR.LOADING) {
                        on_response()
                        on_loading()
                    } else if (xhr.readyState === XHR.DONE) {
                        on_response()
                        on_loading()
                        on_end()
                    }
                }

                function on_response() {
                    if (did.response)
                        return

                    did.response = true
                    request.log.debug('Got response', { 'id': xhr.id, 'status': xhr.status })
                    clearTimeout(xhr.timeoutTimer)
                    xhr.statusCode = xhr.status // Node request compatibility

                    // Detect failed CORS requests.
                    if (is_cors && xhr.statusCode == 0) {
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
                    if (did.loading)
                        return

                    did.loading = true
                    request.log.debug('Response body loading', { 'id': xhr.id })
                        // TODO: Maybe simulate "data" events by watching xhr.responseText
                }

                function on_end() {
                    if (did.end)
                        return

                    did.end = true
                    request.log.debug('Request done', { 'id': xhr.id })

                    xhr.body = xhr.responseText
                    if (options.json) {
                        try { xhr.body = JSON.parse(xhr.responseText) } catch (er) { return options.callback(er, xhr) }
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
                var def = function(method) {
                    var d = function(params, callback) {
                        if (typeof params === 'string')
                            params = { 'uri': params };
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

            var shortcuts = ['get', 'put', 'post', 'head'];
            shortcuts.forEach(function(shortcut) {
                var method = shortcut.toUpperCase();
                var func = shortcut.toLowerCase();

                request[func] = function(opts) {
                    if (typeof opts === 'string')
                        opts = { 'method': method, 'uri': opts };
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
                if (typeof options === 'string')
                    options = { 'uri': options }

                // Just use the request API to do JSON.
                options.json = true
                if (options.body)
                    options.json = options.body
                delete options.body

                callback = callback || noop

                var xhr = request(options, couch_handler)
                return xhr

                function couch_handler(er, resp, body) {
                    if (er)
                        return callback(er, resp, body)

                    if ((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
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
                var logger = {},
                    levels = ['trace', 'debug', 'info', 'warn', 'error'],
                    level, i

                for (i = 0; i < levels.length; i++) {
                    level = levels[i]

                    logger[level] = noop
                    if (typeof console !== 'undefined' && console && console[level])
                        logger[level] = formatted(console, level)
                }

                return logger
            }

            function formatted(obj, method) {
                return formatted_logger

                function formatted_logger(str, context) {
                    if (typeof context === 'object')
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
                try { ajaxLocation = location.href } catch (e) {
                    // Use the href attribute of an A element since IE will modify it given document.location
                    ajaxLocation = document.createElement("a");
                    ajaxLocation.href = "";
                    ajaxLocation = ajaxLocation.href;
                }

                var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || [],
                    parts = rurl.exec(url.toLowerCase())

                var result = !!(
                    parts &&
                    (parts[1] != ajaxLocParts[1] ||
                        parts[2] != ajaxLocParts[2] ||
                        (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? 80 : 443))
                    )
                )

                //console.debug('is_crossDomain('+url+') -> ' + result)
                return result
            }

            // MIT License from http://phpjs.org/functions/base64_encode:358
            function b64_enc(data) {
                // Encodes string using MIME base64 algorithm
                var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
                var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
                    ac = 0,
                    enc = "",
                    tmp_arr = [];

                if (!data) {
                    return data;
                }

                // assume utf8 data
                // data = this.utf8_encode(data+'');

                do { // pack three octets into four hexets
                    o1 = data.charCodeAt(i++);
                    o2 = data.charCodeAt(i++);
                    o3 = data.charCodeAt(i++);

                    bits = o1 << 16 | o2 << 8 | o3;

                    h1 = bits >> 18 & 0x3f;
                    h2 = bits >> 12 & 0x3f;
                    h3 = bits >> 6 & 0x3f;
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

    }, {}],
    2: [function(require, module, exports) {
        function E() {
            // Keep this empty so it's easier to inherit from
            // (via https://github.com/lipsmack from https://github.com/scottcorgan/tiny-emitter/issues/3)
        }

        E.prototype = {
            on: function(name, callback, ctx) {
                var e = this.e || (this.e = {});

                (e[name] || (e[name] = [])).push({
                    fn: callback,
                    ctx: ctx
                });

                return this;
            },

            once: function(name, callback, ctx) {
                var self = this;

                function listener() {
                    self.off(name, listener);
                    callback.apply(ctx, arguments);
                };

                listener._ = callback
                return this.on(name, listener, ctx);
            },

            emit: function(name) {
                var data = [].slice.call(arguments, 1);
                var evtArr = ((this.e || (this.e = {}))[name] || []).slice();
                var i = 0;
                var len = evtArr.length;

                for (i; i < len; i++) {
                    evtArr[i].fn.apply(evtArr[i].ctx, data);
                }

                return this;
            },

            off: function(name, callback) {
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

                (liveEvents.length) ?
                e[name] = liveEvents: delete e[name];

                return this;
            }
        };

        module.exports = E;
        module.exports.TinyEmitter = E;

    }, {}],
    3: [function(require, module, exports) {
        const Login = require("./components/login.js");
        const CadastroAluno = require("./components/cadastroAluno.js");

        class App {
            constructor(body) {
                this.login = new Login(body);
                this.cadastroAluno = new CadastroAluno(body);
            }

            init() {
                this.login.render();
                this.addEventListener();
            }

            addEventListener() {
                this.loginEvents();
                //this.cadastroAlunoEvents();
            }

            loginEvents() {
                this.login.on("error", () => alert("Usuario ou senha incorretos"));
                this.login.on("login", () => this.cadastroAluno.render());
            }
        }

        module.exports = App;

    }, { "./components/cadastroAluno.js": 5, "./components/login.js": 6 }],
    4: [function(require, module, exports) {
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

    }, { "browser-request": 1, "tiny-emitter": 2 }],
    5: [function(require, module, exports) {
        const Agenda = require("./agenda");
        const Template = require("../templates/cadastroAluno");

        class CadastroAluno extends Agenda {
            constructor(body) {
                super();
                this.body = body;
            }

            render() {
                this.body.innerHTML = Template.render();
            }
        }

        module.exports = CadastroAluno;

    }, { "../templates/cadastroAluno": 7, "./agenda": 4 }],
    6: [function(require, module, exports) {
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
                    const opts = {
                        method: "POST",
                        url: `${this.URL}`,
                        json: true,
                        body: {
                            usuario: usuario.value,
                            password: senha.value
                        }
                    };
                    this.request(opts, (err, resp, data) => {
                        if (err || resp.status === 401) {
                            this.emit("error", err);
                        } else {
                            this.emit("cadastroAluno", data);
                        }
                    });
                });
            }

            esqueceuSenha() {
                //codigo pra chamar em URL
            }
        }

        module.exports = Login;

    }, { "../templates/login.js": 8, "./agenda.js": 4 }],
    7: [function(require, module, exports) {
        module.render = () => {
            return `<div>
    <div class="container ">
        <div>
            <span class="login100-form-title p-b-43 p-2 mt-2">
                Área Administrativa
            </span>
        </div>
    </div>

    <div class="container mt-5 border border-white back-grid text-white">
        <div class="row">
            <div class="col-sm">
                Nome
            </div>
            <div class="col-sm">
                CPF
            </div>
            <div class="col-sm">
                Matrícula
            </div>
        </div>
        <div class="row back-gridrow1 text-dark">
            <div class="col-sm">
                José da Costa
            </div>
            <div class="col-sm">
                03597468321
            </div>
            <div class="col-sm">
                12365879463521
            </div>
        </div>
    </div>

    <div class="container col-sm mt-3">
        <div class="row">

            <div class="centered">
                <!-- Botão para chamar modal_include -->
                <button type="button" class="btn btn-primary btn-dark" data-toggle="modal"
                    data-target="#ExemploModalCentralizado">
                    Adicionar
                </button>
                <!-- modal_include -->
                <div class="modal fade" id="ExemploModalCentralizado" tabindex="-1" role="dialog"
                    aria-labelledby="TituloModalCentralizado" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="TituloModalCentralizado">Adicionar Novo Aluno</h5>
                                <button type="button" class="close" data-dismiss="modal" aria-label="Fechar">
                                    <span aria-hidden="true">&times;</span>
                                </button>
                            </div>
                            <div class="modal-body">

                                <div class="row">
                                    <div class="col-sm" id="include_name">
                                        <label>Nome Completo</label>
                                        <input class="border border-dark col-sm">
                                    </div>
                                </div>

                                <div class="row">
                                    <div class="col-sm" id="include_date">
                                        <label>Data de Nascimento</label>
                                        <input class="border border-dark col-sm">
                                    </div>
                                    <div class="col-sm" id="include_cpf">
                                        <form method="post"></form>
                                        <label>CPF</label>
                                        <input type="text" id="cpf">
                                        </form>
                                    </div>
                                </div>

                                <div class="row">
                                    <div class="col-sm " id="include_address">
                                        <form>
                                            <label for="cep">CEP</label>
                                            <input class="border border-dark" id="cep" type="text" required />
                                            <label for="logradouro">Logradouro</label>
                                            <input class="border border-dark" id="logradouro" type="text"
                                                required />
                                            <label for="numero">Número</label>
                                            <input class="border border-dark" id="numero" type="text" />
                                            <label for="complemento">Complemento</label>
                                            <input class="border border-dark" id="complemento" type="text" />
                                            <label for="bairro">Bairro</label>
                                            <input class="border border-dark" id="bairro" type="text" required />
                                            <label for="cidade">Cidade</label>
                                            <input class="border border-dark" id="cidade" type="text" required />
                                            <label for="uf">Estado</label>
                                            <select id="uf">
                                                <option value="AC">Acre</option>
                                                <option value="AL">Alagoas</option>
                                                <option value="AP">Amapá</option>
                                                <option value="AM">Amazonas</option>
                                                <option value="BA">Bahia</option>
                                                <option value="CE">Ceará</option>
                                                <option value="DF">Distrito Federal</option>
                                                <option value="ES">Espírito Santo</option>
                                                <option value="GO">Goiás</option>
                                                <option value="MA">Maranhão</option>
                                                <option value="MT">Mato Grosso</option>
                                                <option value="MS">Mato Grosso do Sul</option>
                                                <option value="MG">Minas Gerais</option>
                                                <option value="PA">Pará</option>
                                                <option value="PB">Paraíba</option>
                                                <option value="PR">Paraná</option>
                                                <option value="PE">Pernambuco</option>
                                                <option value="PI">Piauí</option>
                                                <option value="RJ">Rio de Janeiro</option>
                                                <option value="RN">Rio Grande do Norte</option>
                                                <option value="RS">Rio Grande do Sul</option>
                                                <option value="RO">Rondônia</option>
                                                <option value="RR">Roraima</option>
                                                <option value="SC">Santa Catarina</option>
                                                <option value="SP">São Paulo</option>
                                                <option value="SE">Sergipe</option>
                                                <option value="TO">Tocantins</option>
                                            </select>
                                        </form>
                                    </div>
                                </div>



                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Fechar</button>
                                <button type="button" class="btn btn-primary">Salvar</button>
                            </div>
                        </div>
                    </div>
                </div>

                <button type="button" class="btn btn-dark">Editar</button>
                <button type="button" class="btn btn-dark">Excluir</button>
            </div>



        </div>

    </div>
</div>`;
        };

    }, {}],
    8: [function(require, module, exports) {
        exports.render = () => {
            return ` <div class="limiter">
    <div class="container-login100">
        <div class="wrap-login100 p-b-160 p-t-50">
            <main></main>
            <footer></footer>
            <form class="login100-form">
                <span class="login100-form-title p-b-43">
                    Acesso da Conta
                </span>

                <div class="wrap-input100 rs1 validate-input" data-validate="Campo obrigatório">
                    <input class="input100" type="text" usuario>
                    <span class="label-input100">Usuário</span>
                </div>


                <div class="wrap-input100 rs2 validate-input" data-validate="Campo obrigatório">
                    <input class="input100" type="password" senha>
                    <span class="label-input100">Senha</span>
                </div>

                <div class="container-login100-form-btn">
                    <button class="mt-3" botaoLogin>
                        Entrar
                    </button>
                </div>

                <div class="text-center w-full p-t-23">
                    <a href="#" class="txt1">
                        Esqueceu a Senha? Entre em Contato Conosco.
                    </a>
                </div>
            </form>
        </div>
    </div>
</div>`;
        };

    }, {}],
    9: [function(require, module, exports) {
        const App = require("./app.js");

        window.onload = () => {
            const main = document.querySelector("main");
            new App(main).init();
        };





    }, { "./app.js": 3 }]
}, {}, [9])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3Nlci1yZXF1ZXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RpbnktZW1pdHRlci9pbmRleC5qcyIsInNyYy9hcHAuanMiLCJzcmMvY29tcG9uZW50cy9hZ2VuZGEuanMiLCJzcmMvY29tcG9uZW50cy9jYWRhc3Ryb0FsdW5vLmpzIiwic3JjL2NvbXBvbmVudHMvbG9naW4uanMiLCJzcmMvdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm8uanMiLCJzcmMvdGVtcGxhdGVzL2xvZ2luLmpzIiwiaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtB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LFVBQVMsUUFBVCxFQUFtQjtBQUN4QjtBQUNBO0FBQ0EsY0FBRSxhQUFGLEVBQWlCLEdBQWpCLENBQXFCLFNBQVMsVUFBOUI7QUFDQSxjQUFFLGNBQUYsRUFBa0IsR0FBbEIsQ0FBc0IsU0FBUyxXQUEvQjtBQUNBLGNBQUUsU0FBRixFQUFhLEdBQWIsQ0FBaUIsU0FBUyxNQUExQjtBQUNBLGNBQUUsU0FBRixFQUFhLEdBQWIsQ0FBaUIsU0FBUyxVQUExQjtBQUNBLGNBQUUsS0FBRixFQUFTLEdBQVQsQ0FBYSxTQUFTLEVBQXRCO0FBQ0E7QUFDQTtBQUNBLGNBQUUsU0FBRixFQUFhLEtBQWI7QUFDSDtBQXRCRSxLQUFQO0FBd0JILENBMUJEOztBQTRCQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8vIEJyb3dzZXIgUmVxdWVzdFxyXG4vL1xyXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xyXG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXHJcbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxyXG4vL1xyXG4vLyAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXHJcbi8vXHJcbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcclxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxyXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cclxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxyXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cclxuXHJcbi8vIFVNRCBIRUFERVIgU1RBUlQgXHJcbihmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSkge1xyXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xyXG4gICAgICAgIC8vIEFNRC4gUmVnaXN0ZXIgYXMgYW4gYW5vbnltb3VzIG1vZHVsZS5cclxuICAgICAgICBkZWZpbmUoW10sIGZhY3RvcnkpO1xyXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICAvLyBOb2RlLiBEb2VzIG5vdCB3b3JrIHdpdGggc3RyaWN0IENvbW1vbkpTLCBidXRcclxuICAgICAgICAvLyBvbmx5IENvbW1vbkpTLWxpa2UgZW52aXJvbWVudHMgdGhhdCBzdXBwb3J0IG1vZHVsZS5leHBvcnRzLFxyXG4gICAgICAgIC8vIGxpa2UgTm9kZS5cclxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gQnJvd3NlciBnbG9iYWxzIChyb290IGlzIHdpbmRvdylcclxuICAgICAgICByb290LnJldHVybkV4cG9ydHMgPSBmYWN0b3J5KCk7XHJcbiAgfVxyXG59KHRoaXMsIGZ1bmN0aW9uICgpIHtcclxuLy8gVU1EIEhFQURFUiBFTkRcclxuXHJcbnZhciBYSFIgPSBYTUxIdHRwUmVxdWVzdFxyXG5pZiAoIVhIUikgdGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIFhNTEh0dHBSZXF1ZXN0JylcclxucmVxdWVzdC5sb2cgPSB7XHJcbiAgJ3RyYWNlJzogbm9vcCwgJ2RlYnVnJzogbm9vcCwgJ2luZm8nOiBub29wLCAnd2Fybic6IG5vb3AsICdlcnJvcic6IG5vb3BcclxufVxyXG5cclxudmFyIERFRkFVTFRfVElNRU9VVCA9IDMgKiA2MCAqIDEwMDAgLy8gMyBtaW51dGVzXHJcblxyXG4vL1xyXG4vLyByZXF1ZXN0XHJcbi8vXHJcblxyXG5mdW5jdGlvbiByZXF1ZXN0KG9wdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgLy8gVGhlIGVudHJ5LXBvaW50IHRvIHRoZSBBUEk6IHByZXAgdGhlIG9wdGlvbnMgb2JqZWN0IGFuZCBwYXNzIHRoZSByZWFsIHdvcmsgdG8gcnVuX3hoci5cclxuICBpZih0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhZCBjYWxsYmFjayBnaXZlbjogJyArIGNhbGxiYWNrKVxyXG5cclxuICBpZighb3B0aW9ucylcclxuICAgIHRocm93IG5ldyBFcnJvcignTm8gb3B0aW9ucyBnaXZlbicpXHJcblxyXG4gIHZhciBvcHRpb25zX29uUmVzcG9uc2UgPSBvcHRpb25zLm9uUmVzcG9uc2U7IC8vIFNhdmUgdGhpcyBmb3IgbGF0ZXIuXHJcblxyXG4gIGlmKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJylcclxuICAgIG9wdGlvbnMgPSB7J3VyaSc6b3B0aW9uc307XHJcbiAgZWxzZVxyXG4gICAgb3B0aW9ucyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0aW9ucykpOyAvLyBVc2UgYSBkdXBsaWNhdGUgZm9yIG11dGF0aW5nLlxyXG5cclxuICBvcHRpb25zLm9uUmVzcG9uc2UgPSBvcHRpb25zX29uUmVzcG9uc2UgLy8gQW5kIHB1dCBpdCBiYWNrLlxyXG5cclxuICBpZiAob3B0aW9ucy52ZXJib3NlKSByZXF1ZXN0LmxvZyA9IGdldExvZ2dlcigpO1xyXG5cclxuICBpZihvcHRpb25zLnVybCkge1xyXG4gICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVybDtcclxuICAgIGRlbGV0ZSBvcHRpb25zLnVybDtcclxuICB9XHJcblxyXG4gIGlmKCFvcHRpb25zLnVyaSAmJiBvcHRpb25zLnVyaSAhPT0gXCJcIilcclxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIGlzIGEgcmVxdWlyZWQgYXJndW1lbnRcIik7XHJcblxyXG4gIGlmKHR5cGVvZiBvcHRpb25zLnVyaSAhPSBcInN0cmluZ1wiKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy51cmkgbXVzdCBiZSBhIHN0cmluZ1wiKTtcclxuXHJcbiAgdmFyIHVuc3VwcG9ydGVkX29wdGlvbnMgPSBbJ3Byb3h5JywgJ19yZWRpcmVjdHNGb2xsb3dlZCcsICdtYXhSZWRpcmVjdHMnLCAnZm9sbG93UmVkaXJlY3QnXVxyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdW5zdXBwb3J0ZWRfb3B0aW9ucy5sZW5ndGg7IGkrKylcclxuICAgIGlmKG9wdGlvbnNbIHVuc3VwcG9ydGVkX29wdGlvbnNbaV0gXSlcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy5cIiArIHVuc3VwcG9ydGVkX29wdGlvbnNbaV0gKyBcIiBpcyBub3Qgc3VwcG9ydGVkXCIpXHJcblxyXG4gIG9wdGlvbnMuY2FsbGJhY2sgPSBjYWxsYmFja1xyXG4gIG9wdGlvbnMubWV0aG9kID0gb3B0aW9ucy5tZXRob2QgfHwgJ0dFVCc7XHJcbiAgb3B0aW9ucy5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xyXG4gIG9wdGlvbnMuYm9keSAgICA9IG9wdGlvbnMuYm9keSB8fCBudWxsXHJcbiAgb3B0aW9ucy50aW1lb3V0ID0gb3B0aW9ucy50aW1lb3V0IHx8IHJlcXVlc3QuREVGQVVMVF9USU1FT1VUXHJcblxyXG4gIGlmKG9wdGlvbnMuaGVhZGVycy5ob3N0KVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiT3B0aW9ucy5oZWFkZXJzLmhvc3QgaXMgbm90IHN1cHBvcnRlZFwiKTtcclxuXHJcbiAgaWYob3B0aW9ucy5qc29uKSB7XHJcbiAgICBvcHRpb25zLmhlYWRlcnMuYWNjZXB0ID0gb3B0aW9ucy5oZWFkZXJzLmFjY2VwdCB8fCAnYXBwbGljYXRpb24vanNvbidcclxuICAgIGlmKG9wdGlvbnMubWV0aG9kICE9PSAnR0VUJylcclxuICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9ICdhcHBsaWNhdGlvbi9qc29uJ1xyXG5cclxuICAgIGlmKHR5cGVvZiBvcHRpb25zLmpzb24gIT09ICdib29sZWFuJylcclxuICAgICAgb3B0aW9ucy5ib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5qc29uKVxyXG4gICAgZWxzZSBpZih0eXBlb2Ygb3B0aW9ucy5ib2R5ICE9PSAnc3RyaW5nJylcclxuICAgICAgb3B0aW9ucy5ib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5ib2R5KVxyXG4gIH1cclxuICBcclxuICAvL0JFR0lOIFFTIEhhY2tcclxuICB2YXIgc2VyaWFsaXplID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICB2YXIgc3RyID0gW107XHJcbiAgICBmb3IodmFyIHAgaW4gb2JqKVxyXG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XHJcbiAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdKSk7XHJcbiAgICAgIH1cclxuICAgIHJldHVybiBzdHIuam9pbihcIiZcIik7XHJcbiAgfVxyXG4gIFxyXG4gIGlmKG9wdGlvbnMucXMpe1xyXG4gICAgdmFyIHFzID0gKHR5cGVvZiBvcHRpb25zLnFzID09ICdzdHJpbmcnKT8gb3B0aW9ucy5xcyA6IHNlcmlhbGl6ZShvcHRpb25zLnFzKTtcclxuICAgIGlmKG9wdGlvbnMudXJpLmluZGV4T2YoJz8nKSAhPT0gLTEpeyAvL25vIGdldCBwYXJhbXNcclxuICAgICAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJpKycmJytxcztcclxuICAgIH1lbHNleyAvL2V4aXN0aW5nIGdldCBwYXJhbXNcclxuICAgICAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJpKyc/JytxcztcclxuICAgIH1cclxuICB9XHJcbiAgLy9FTkQgUVMgSGFja1xyXG4gIFxyXG4gIC8vQkVHSU4gRk9STSBIYWNrXHJcbiAgdmFyIG11bHRpcGFydCA9IGZ1bmN0aW9uKG9iaikge1xyXG4gICAgLy90b2RvOiBzdXBwb3J0IGZpbGUgdHlwZSAodXNlZnVsPylcclxuICAgIHZhciByZXN1bHQgPSB7fTtcclxuICAgIHJlc3VsdC5ib3VuZHJ5ID0gJy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0nK01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSoxMDAwMDAwMDAwKTtcclxuICAgIHZhciBsaW5lcyA9IFtdO1xyXG4gICAgZm9yKHZhciBwIGluIG9iail7XHJcbiAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xyXG4gICAgICAgICAgICBsaW5lcy5wdXNoKFxyXG4gICAgICAgICAgICAgICAgJy0tJytyZXN1bHQuYm91bmRyeStcIlxcblwiK1xyXG4gICAgICAgICAgICAgICAgJ0NvbnRlbnQtRGlzcG9zaXRpb246IGZvcm0tZGF0YTsgbmFtZT1cIicrcCsnXCInK1wiXFxuXCIrXHJcbiAgICAgICAgICAgICAgICBcIlxcblwiK1xyXG4gICAgICAgICAgICAgICAgb2JqW3BdK1wiXFxuXCJcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBsaW5lcy5wdXNoKCAnLS0nK3Jlc3VsdC5ib3VuZHJ5KyctLScgKTtcclxuICAgIHJlc3VsdC5ib2R5ID0gbGluZXMuam9pbignJyk7XHJcbiAgICByZXN1bHQubGVuZ3RoID0gcmVzdWx0LmJvZHkubGVuZ3RoO1xyXG4gICAgcmVzdWx0LnR5cGUgPSAnbXVsdGlwYXJ0L2Zvcm0tZGF0YTsgYm91bmRhcnk9JytyZXN1bHQuYm91bmRyeTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfVxyXG4gIFxyXG4gIGlmKG9wdGlvbnMuZm9ybSl7XHJcbiAgICBpZih0eXBlb2Ygb3B0aW9ucy5mb3JtID09ICdzdHJpbmcnKSB0aHJvdygnZm9ybSBuYW1lIHVuc3VwcG9ydGVkJyk7XHJcbiAgICBpZihvcHRpb25zLm1ldGhvZCA9PT0gJ1BPU1QnKXtcclxuICAgICAgICB2YXIgZW5jb2RpbmcgPSAob3B0aW9ucy5lbmNvZGluZyB8fCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJykudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gZW5jb2Rpbmc7XHJcbiAgICAgICAgc3dpdGNoKGVuY29kaW5nKXtcclxuICAgICAgICAgICAgY2FzZSAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJzpcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IHNlcmlhbGl6ZShvcHRpb25zLmZvcm0pLnJlcGxhY2UoLyUyMC9nLCBcIitcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnbXVsdGlwYXJ0L2Zvcm0tZGF0YSc6XHJcbiAgICAgICAgICAgICAgICB2YXIgbXVsdGkgPSBtdWx0aXBhcnQob3B0aW9ucy5mb3JtKTtcclxuICAgICAgICAgICAgICAgIC8vb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddID0gbXVsdGkubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5ib2R5ID0gbXVsdGkuYm9keTtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBtdWx0aS50eXBlO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQgOiB0aHJvdyBuZXcgRXJyb3IoJ3Vuc3VwcG9ydGVkIGVuY29kaW5nOicrZW5jb2RpbmcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbiAgLy9FTkQgRk9STSBIYWNrXHJcblxyXG4gIC8vIElmIG9uUmVzcG9uc2UgaXMgYm9vbGVhbiB0cnVlLCBjYWxsIGJhY2sgaW1tZWRpYXRlbHkgd2hlbiB0aGUgcmVzcG9uc2UgaXMga25vd24sXHJcbiAgLy8gbm90IHdoZW4gdGhlIGZ1bGwgcmVxdWVzdCBpcyBjb21wbGV0ZS5cclxuICBvcHRpb25zLm9uUmVzcG9uc2UgPSBvcHRpb25zLm9uUmVzcG9uc2UgfHwgbm9vcFxyXG4gIGlmKG9wdGlvbnMub25SZXNwb25zZSA9PT0gdHJ1ZSkge1xyXG4gICAgb3B0aW9ucy5vblJlc3BvbnNlID0gY2FsbGJhY2tcclxuICAgIG9wdGlvbnMuY2FsbGJhY2sgPSBub29wXHJcbiAgfVxyXG5cclxuICAvLyBYWFggQnJvd3NlcnMgZG8gbm90IGxpa2UgdGhpcy5cclxuICAvL2lmKG9wdGlvbnMuYm9keSlcclxuICAvLyAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddID0gb3B0aW9ucy5ib2R5Lmxlbmd0aDtcclxuXHJcbiAgLy8gSFRUUCBiYXNpYyBhdXRoZW50aWNhdGlvblxyXG4gIGlmKCFvcHRpb25zLmhlYWRlcnMuYXV0aG9yaXphdGlvbiAmJiBvcHRpb25zLmF1dGgpXHJcbiAgICBvcHRpb25zLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA9ICdCYXNpYyAnICsgYjY0X2VuYyhvcHRpb25zLmF1dGgudXNlcm5hbWUgKyAnOicgKyBvcHRpb25zLmF1dGgucGFzc3dvcmQpO1xyXG5cclxuICByZXR1cm4gcnVuX3hocihvcHRpb25zKVxyXG59XHJcblxyXG52YXIgcmVxX3NlcSA9IDBcclxuZnVuY3Rpb24gcnVuX3hocihvcHRpb25zKSB7XHJcbiAgdmFyIHhociA9IG5ldyBYSFJcclxuICAgICwgdGltZWRfb3V0ID0gZmFsc2VcclxuICAgICwgaXNfY29ycyA9IGlzX2Nyb3NzRG9tYWluKG9wdGlvbnMudXJpKVxyXG4gICAgLCBzdXBwb3J0c19jb3JzID0gKCd3aXRoQ3JlZGVudGlhbHMnIGluIHhocilcclxuXHJcbiAgcmVxX3NlcSArPSAxXHJcbiAgeGhyLnNlcV9pZCA9IHJlcV9zZXFcclxuICB4aHIuaWQgPSByZXFfc2VxICsgJzogJyArIG9wdGlvbnMubWV0aG9kICsgJyAnICsgb3B0aW9ucy51cmlcclxuICB4aHIuX2lkID0geGhyLmlkIC8vIEkga25vdyBJIHdpbGwgdHlwZSBcIl9pZFwiIGZyb20gaGFiaXQgYWxsIHRoZSB0aW1lLlxyXG5cclxuICBpZihpc19jb3JzICYmICFzdXBwb3J0c19jb3JzKSB7XHJcbiAgICB2YXIgY29yc19lcnIgPSBuZXcgRXJyb3IoJ0Jyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBjcm9zcy1vcmlnaW4gcmVxdWVzdDogJyArIG9wdGlvbnMudXJpKVxyXG4gICAgY29yc19lcnIuY29ycyA9ICd1bnN1cHBvcnRlZCdcclxuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGNvcnNfZXJyLCB4aHIpXHJcbiAgfVxyXG5cclxuICB4aHIudGltZW91dFRpbWVyID0gc2V0VGltZW91dCh0b29fbGF0ZSwgb3B0aW9ucy50aW1lb3V0KVxyXG4gIGZ1bmN0aW9uIHRvb19sYXRlKCkge1xyXG4gICAgdGltZWRfb3V0ID0gdHJ1ZVxyXG4gICAgdmFyIGVyID0gbmV3IEVycm9yKCdFVElNRURPVVQnKVxyXG4gICAgZXIuY29kZSA9ICdFVElNRURPVVQnXHJcbiAgICBlci5kdXJhdGlvbiA9IG9wdGlvbnMudGltZW91dFxyXG5cclxuICAgIHJlcXVlc3QubG9nLmVycm9yKCdUaW1lb3V0JywgeyAnaWQnOnhoci5faWQsICdtaWxsaXNlY29uZHMnOm9wdGlvbnMudGltZW91dCB9KVxyXG4gICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soZXIsIHhocilcclxuICB9XHJcblxyXG4gIC8vIFNvbWUgc3RhdGVzIGNhbiBiZSBza2lwcGVkIG92ZXIsIHNvIHJlbWVtYmVyIHdoYXQgaXMgc3RpbGwgaW5jb21wbGV0ZS5cclxuICB2YXIgZGlkID0geydyZXNwb25zZSc6ZmFsc2UsICdsb2FkaW5nJzpmYWxzZSwgJ2VuZCc6ZmFsc2V9XHJcblxyXG4gIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBvbl9zdGF0ZV9jaGFuZ2VcclxuICB4aHIub3BlbihvcHRpb25zLm1ldGhvZCwgb3B0aW9ucy51cmksIHRydWUpIC8vIGFzeW5jaHJvbm91c1xyXG4gIGlmKGlzX2NvcnMpXHJcbiAgICB4aHIud2l0aENyZWRlbnRpYWxzID0gISEgb3B0aW9ucy53aXRoQ3JlZGVudGlhbHNcclxuICB4aHIuc2VuZChvcHRpb25zLmJvZHkpXHJcbiAgcmV0dXJuIHhoclxyXG5cclxuICBmdW5jdGlvbiBvbl9zdGF0ZV9jaGFuZ2UoZXZlbnQpIHtcclxuICAgIGlmKHRpbWVkX291dClcclxuICAgICAgcmV0dXJuIHJlcXVlc3QubG9nLmRlYnVnKCdJZ25vcmluZyB0aW1lZCBvdXQgc3RhdGUgY2hhbmdlJywgeydzdGF0ZSc6eGhyLnJlYWR5U3RhdGUsICdpZCc6eGhyLmlkfSlcclxuXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnU3RhdGUgY2hhbmdlJywgeydzdGF0ZSc6eGhyLnJlYWR5U3RhdGUsICdpZCc6eGhyLmlkLCAndGltZWRfb3V0Jzp0aW1lZF9vdXR9KVxyXG5cclxuICAgIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuT1BFTkVEKSB7XHJcbiAgICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IHN0YXJ0ZWQnLCB7J2lkJzp4aHIuaWR9KVxyXG4gICAgICBmb3IgKHZhciBrZXkgaW4gb3B0aW9ucy5oZWFkZXJzKVxyXG4gICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGtleSwgb3B0aW9ucy5oZWFkZXJzW2tleV0pXHJcbiAgICB9XHJcblxyXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkhFQURFUlNfUkVDRUlWRUQpXHJcbiAgICAgIG9uX3Jlc3BvbnNlKClcclxuXHJcbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuTE9BRElORykge1xyXG4gICAgICBvbl9yZXNwb25zZSgpXHJcbiAgICAgIG9uX2xvYWRpbmcoKVxyXG4gICAgfVxyXG5cclxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5ET05FKSB7XHJcbiAgICAgIG9uX3Jlc3BvbnNlKClcclxuICAgICAgb25fbG9hZGluZygpXHJcbiAgICAgIG9uX2VuZCgpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBvbl9yZXNwb25zZSgpIHtcclxuICAgIGlmKGRpZC5yZXNwb25zZSlcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAgZGlkLnJlc3BvbnNlID0gdHJ1ZVxyXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ0dvdCByZXNwb25zZScsIHsnaWQnOnhoci5pZCwgJ3N0YXR1cyc6eGhyLnN0YXR1c30pXHJcbiAgICBjbGVhclRpbWVvdXQoeGhyLnRpbWVvdXRUaW1lcilcclxuICAgIHhoci5zdGF0dXNDb2RlID0geGhyLnN0YXR1cyAvLyBOb2RlIHJlcXVlc3QgY29tcGF0aWJpbGl0eVxyXG5cclxuICAgIC8vIERldGVjdCBmYWlsZWQgQ09SUyByZXF1ZXN0cy5cclxuICAgIGlmKGlzX2NvcnMgJiYgeGhyLnN0YXR1c0NvZGUgPT0gMCkge1xyXG4gICAgICB2YXIgY29yc19lcnIgPSBuZXcgRXJyb3IoJ0NPUlMgcmVxdWVzdCByZWplY3RlZDogJyArIG9wdGlvbnMudXJpKVxyXG4gICAgICBjb3JzX2Vyci5jb3JzID0gJ3JlamVjdGVkJ1xyXG5cclxuICAgICAgLy8gRG8gbm90IHByb2Nlc3MgdGhpcyByZXF1ZXN0IGZ1cnRoZXIuXHJcbiAgICAgIGRpZC5sb2FkaW5nID0gdHJ1ZVxyXG4gICAgICBkaWQuZW5kID0gdHJ1ZVxyXG5cclxuICAgICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcclxuICAgIH1cclxuXHJcbiAgICBvcHRpb25zLm9uUmVzcG9uc2UobnVsbCwgeGhyKVxyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gb25fbG9hZGluZygpIHtcclxuICAgIGlmKGRpZC5sb2FkaW5nKVxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBkaWQubG9hZGluZyA9IHRydWVcclxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXNwb25zZSBib2R5IGxvYWRpbmcnLCB7J2lkJzp4aHIuaWR9KVxyXG4gICAgLy8gVE9ETzogTWF5YmUgc2ltdWxhdGUgXCJkYXRhXCIgZXZlbnRzIGJ5IHdhdGNoaW5nIHhoci5yZXNwb25zZVRleHRcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIG9uX2VuZCgpIHtcclxuICAgIGlmKGRpZC5lbmQpXHJcbiAgICAgIHJldHVyblxyXG5cclxuICAgIGRpZC5lbmQgPSB0cnVlXHJcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVxdWVzdCBkb25lJywgeydpZCc6eGhyLmlkfSlcclxuXHJcbiAgICB4aHIuYm9keSA9IHhoci5yZXNwb25zZVRleHRcclxuICAgIGlmKG9wdGlvbnMuanNvbikge1xyXG4gICAgICB0cnkgICAgICAgIHsgeGhyLmJvZHkgPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpIH1cclxuICAgICAgY2F0Y2ggKGVyKSB7IHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgb3B0aW9ucy5jYWxsYmFjayhudWxsLCB4aHIsIHhoci5ib2R5KVxyXG4gIH1cclxuXHJcbn0gLy8gcmVxdWVzdFxyXG5cclxucmVxdWVzdC53aXRoQ3JlZGVudGlhbHMgPSBmYWxzZTtcclxucmVxdWVzdC5ERUZBVUxUX1RJTUVPVVQgPSBERUZBVUxUX1RJTUVPVVQ7XHJcblxyXG4vL1xyXG4vLyBkZWZhdWx0c1xyXG4vL1xyXG5cclxucmVxdWVzdC5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9wdGlvbnMsIHJlcXVlc3Rlcikge1xyXG4gIHZhciBkZWYgPSBmdW5jdGlvbiAobWV0aG9kKSB7XHJcbiAgICB2YXIgZCA9IGZ1bmN0aW9uIChwYXJhbXMsIGNhbGxiYWNrKSB7XHJcbiAgICAgIGlmKHR5cGVvZiBwYXJhbXMgPT09ICdzdHJpbmcnKVxyXG4gICAgICAgIHBhcmFtcyA9IHsndXJpJzogcGFyYW1zfTtcclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgcGFyYW1zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShwYXJhbXMpKTtcclxuICAgICAgfVxyXG4gICAgICBmb3IgKHZhciBpIGluIG9wdGlvbnMpIHtcclxuICAgICAgICBpZiAocGFyYW1zW2ldID09PSB1bmRlZmluZWQpIHBhcmFtc1tpXSA9IG9wdGlvbnNbaV1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gbWV0aG9kKHBhcmFtcywgY2FsbGJhY2spXHJcbiAgICB9XHJcbiAgICByZXR1cm4gZFxyXG4gIH1cclxuICB2YXIgZGUgPSBkZWYocmVxdWVzdClcclxuICBkZS5nZXQgPSBkZWYocmVxdWVzdC5nZXQpXHJcbiAgZGUucG9zdCA9IGRlZihyZXF1ZXN0LnBvc3QpXHJcbiAgZGUucHV0ID0gZGVmKHJlcXVlc3QucHV0KVxyXG4gIGRlLmhlYWQgPSBkZWYocmVxdWVzdC5oZWFkKVxyXG4gIHJldHVybiBkZVxyXG59XHJcblxyXG4vL1xyXG4vLyBIVFRQIG1ldGhvZCBzaG9ydGN1dHNcclxuLy9cclxuXHJcbnZhciBzaG9ydGN1dHMgPSBbICdnZXQnLCAncHV0JywgJ3Bvc3QnLCAnaGVhZCcgXTtcclxuc2hvcnRjdXRzLmZvckVhY2goZnVuY3Rpb24oc2hvcnRjdXQpIHtcclxuICB2YXIgbWV0aG9kID0gc2hvcnRjdXQudG9VcHBlckNhc2UoKTtcclxuICB2YXIgZnVuYyAgID0gc2hvcnRjdXQudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgcmVxdWVzdFtmdW5jXSA9IGZ1bmN0aW9uKG9wdHMpIHtcclxuICAgIGlmKHR5cGVvZiBvcHRzID09PSAnc3RyaW5nJylcclxuICAgICAgb3B0cyA9IHsnbWV0aG9kJzptZXRob2QsICd1cmknOm9wdHN9O1xyXG4gICAgZWxzZSB7XHJcbiAgICAgIG9wdHMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdHMpKTtcclxuICAgICAgb3B0cy5tZXRob2QgPSBtZXRob2Q7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIGFyZ3MgPSBbb3B0c10uY29uY2F0KEFycmF5LnByb3RvdHlwZS5zbGljZS5hcHBseShhcmd1bWVudHMsIFsxXSkpO1xyXG4gICAgcmV0dXJuIHJlcXVlc3QuYXBwbHkodGhpcywgYXJncyk7XHJcbiAgfVxyXG59KVxyXG5cclxuLy9cclxuLy8gQ291Y2hEQiBzaG9ydGN1dFxyXG4vL1xyXG5cclxucmVxdWVzdC5jb3VjaCA9IGZ1bmN0aW9uKG9wdGlvbnMsIGNhbGxiYWNrKSB7XHJcbiAgaWYodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnKVxyXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfVxyXG5cclxuICAvLyBKdXN0IHVzZSB0aGUgcmVxdWVzdCBBUEkgdG8gZG8gSlNPTi5cclxuICBvcHRpb25zLmpzb24gPSB0cnVlXHJcbiAgaWYob3B0aW9ucy5ib2R5KVxyXG4gICAgb3B0aW9ucy5qc29uID0gb3B0aW9ucy5ib2R5XHJcbiAgZGVsZXRlIG9wdGlvbnMuYm9keVxyXG5cclxuICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IG5vb3BcclxuXHJcbiAgdmFyIHhociA9IHJlcXVlc3Qob3B0aW9ucywgY291Y2hfaGFuZGxlcilcclxuICByZXR1cm4geGhyXHJcblxyXG4gIGZ1bmN0aW9uIGNvdWNoX2hhbmRsZXIoZXIsIHJlc3AsIGJvZHkpIHtcclxuICAgIGlmKGVyKVxyXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpXHJcblxyXG4gICAgaWYoKHJlc3Auc3RhdHVzQ29kZSA8IDIwMCB8fCByZXNwLnN0YXR1c0NvZGUgPiAyOTkpICYmIGJvZHkuZXJyb3IpIHtcclxuICAgICAgLy8gVGhlIGJvZHkgaXMgYSBDb3VjaCBKU09OIG9iamVjdCBpbmRpY2F0aW5nIHRoZSBlcnJvci5cclxuICAgICAgZXIgPSBuZXcgRXJyb3IoJ0NvdWNoREIgZXJyb3I6ICcgKyAoYm9keS5lcnJvci5yZWFzb24gfHwgYm9keS5lcnJvci5lcnJvcikpXHJcbiAgICAgIGZvciAodmFyIGtleSBpbiBib2R5KVxyXG4gICAgICAgIGVyW2tleV0gPSBib2R5W2tleV1cclxuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpO1xyXG4gIH1cclxufVxyXG5cclxuLy9cclxuLy8gVXRpbGl0eVxyXG4vL1xyXG5cclxuZnVuY3Rpb24gbm9vcCgpIHt9XHJcblxyXG5mdW5jdGlvbiBnZXRMb2dnZXIoKSB7XHJcbiAgdmFyIGxvZ2dlciA9IHt9XHJcbiAgICAsIGxldmVscyA9IFsndHJhY2UnLCAnZGVidWcnLCAnaW5mbycsICd3YXJuJywgJ2Vycm9yJ11cclxuICAgICwgbGV2ZWwsIGlcclxuXHJcbiAgZm9yKGkgPSAwOyBpIDwgbGV2ZWxzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBsZXZlbCA9IGxldmVsc1tpXVxyXG5cclxuICAgIGxvZ2dlcltsZXZlbF0gPSBub29wXHJcbiAgICBpZih0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZSAmJiBjb25zb2xlW2xldmVsXSlcclxuICAgICAgbG9nZ2VyW2xldmVsXSA9IGZvcm1hdHRlZChjb25zb2xlLCBsZXZlbClcclxuICB9XHJcblxyXG4gIHJldHVybiBsb2dnZXJcclxufVxyXG5cclxuZnVuY3Rpb24gZm9ybWF0dGVkKG9iaiwgbWV0aG9kKSB7XHJcbiAgcmV0dXJuIGZvcm1hdHRlZF9sb2dnZXJcclxuXHJcbiAgZnVuY3Rpb24gZm9ybWF0dGVkX2xvZ2dlcihzdHIsIGNvbnRleHQpIHtcclxuICAgIGlmKHR5cGVvZiBjb250ZXh0ID09PSAnb2JqZWN0JylcclxuICAgICAgc3RyICs9ICcgJyArIEpTT04uc3RyaW5naWZ5KGNvbnRleHQpXHJcblxyXG4gICAgcmV0dXJuIG9ialttZXRob2RdLmNhbGwob2JqLCBzdHIpXHJcbiAgfVxyXG59XHJcblxyXG4vLyBSZXR1cm4gd2hldGhlciBhIFVSTCBpcyBhIGNyb3NzLWRvbWFpbiByZXF1ZXN0LlxyXG5mdW5jdGlvbiBpc19jcm9zc0RvbWFpbih1cmwpIHtcclxuICB2YXIgcnVybCA9IC9eKFtcXHdcXCtcXC5cXC1dKzopKD86XFwvXFwvKFteXFwvPyM6XSopKD86OihcXGQrKSk/KT8vXHJcblxyXG4gIC8vIGpRdWVyeSAjODEzOCwgSUUgbWF5IHRocm93IGFuIGV4Y2VwdGlvbiB3aGVuIGFjY2Vzc2luZ1xyXG4gIC8vIGEgZmllbGQgZnJvbSB3aW5kb3cubG9jYXRpb24gaWYgZG9jdW1lbnQuZG9tYWluIGhhcyBiZWVuIHNldFxyXG4gIHZhciBhamF4TG9jYXRpb25cclxuICB0cnkgeyBhamF4TG9jYXRpb24gPSBsb2NhdGlvbi5ocmVmIH1cclxuICBjYXRjaCAoZSkge1xyXG4gICAgLy8gVXNlIHRoZSBocmVmIGF0dHJpYnV0ZSBvZiBhbiBBIGVsZW1lbnQgc2luY2UgSUUgd2lsbCBtb2RpZnkgaXQgZ2l2ZW4gZG9jdW1lbnQubG9jYXRpb25cclxuICAgIGFqYXhMb2NhdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoIFwiYVwiICk7XHJcbiAgICBhamF4TG9jYXRpb24uaHJlZiA9IFwiXCI7XHJcbiAgICBhamF4TG9jYXRpb24gPSBhamF4TG9jYXRpb24uaHJlZjtcclxuICB9XHJcblxyXG4gIHZhciBhamF4TG9jUGFydHMgPSBydXJsLmV4ZWMoYWpheExvY2F0aW9uLnRvTG93ZXJDYXNlKCkpIHx8IFtdXHJcbiAgICAsIHBhcnRzID0gcnVybC5leGVjKHVybC50b0xvd2VyQ2FzZSgpIClcclxuXHJcbiAgdmFyIHJlc3VsdCA9ICEhKFxyXG4gICAgcGFydHMgJiZcclxuICAgICggIHBhcnRzWzFdICE9IGFqYXhMb2NQYXJ0c1sxXVxyXG4gICAgfHwgcGFydHNbMl0gIT0gYWpheExvY1BhcnRzWzJdXHJcbiAgICB8fCAocGFydHNbM10gfHwgKHBhcnRzWzFdID09PSBcImh0dHA6XCIgPyA4MCA6IDQ0MykpICE9IChhamF4TG9jUGFydHNbM10gfHwgKGFqYXhMb2NQYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKVxyXG4gICAgKVxyXG4gIClcclxuXHJcbiAgLy9jb25zb2xlLmRlYnVnKCdpc19jcm9zc0RvbWFpbignK3VybCsnKSAtPiAnICsgcmVzdWx0KVxyXG4gIHJldHVybiByZXN1bHRcclxufVxyXG5cclxuLy8gTUlUIExpY2Vuc2UgZnJvbSBodHRwOi8vcGhwanMub3JnL2Z1bmN0aW9ucy9iYXNlNjRfZW5jb2RlOjM1OFxyXG5mdW5jdGlvbiBiNjRfZW5jIChkYXRhKSB7XHJcbiAgICAvLyBFbmNvZGVzIHN0cmluZyB1c2luZyBNSU1FIGJhc2U2NCBhbGdvcml0aG1cclxuICAgIHZhciBiNjQgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCI7XHJcbiAgICB2YXIgbzEsIG8yLCBvMywgaDEsIGgyLCBoMywgaDQsIGJpdHMsIGkgPSAwLCBhYyA9IDAsIGVuYz1cIlwiLCB0bXBfYXJyID0gW107XHJcblxyXG4gICAgaWYgKCFkYXRhKSB7XHJcbiAgICAgICAgcmV0dXJuIGRhdGE7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gYXNzdW1lIHV0ZjggZGF0YVxyXG4gICAgLy8gZGF0YSA9IHRoaXMudXRmOF9lbmNvZGUoZGF0YSsnJyk7XHJcblxyXG4gICAgZG8geyAvLyBwYWNrIHRocmVlIG9jdGV0cyBpbnRvIGZvdXIgaGV4ZXRzXHJcbiAgICAgICAgbzEgPSBkYXRhLmNoYXJDb2RlQXQoaSsrKTtcclxuICAgICAgICBvMiA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xyXG4gICAgICAgIG8zID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XHJcblxyXG4gICAgICAgIGJpdHMgPSBvMTw8MTYgfCBvMjw8OCB8IG8zO1xyXG5cclxuICAgICAgICBoMSA9IGJpdHM+PjE4ICYgMHgzZjtcclxuICAgICAgICBoMiA9IGJpdHM+PjEyICYgMHgzZjtcclxuICAgICAgICBoMyA9IGJpdHM+PjYgJiAweDNmO1xyXG4gICAgICAgIGg0ID0gYml0cyAmIDB4M2Y7XHJcblxyXG4gICAgICAgIC8vIHVzZSBoZXhldHMgdG8gaW5kZXggaW50byBiNjQsIGFuZCBhcHBlbmQgcmVzdWx0IHRvIGVuY29kZWQgc3RyaW5nXHJcbiAgICAgICAgdG1wX2FyclthYysrXSA9IGI2NC5jaGFyQXQoaDEpICsgYjY0LmNoYXJBdChoMikgKyBiNjQuY2hhckF0KGgzKSArIGI2NC5jaGFyQXQoaDQpO1xyXG4gICAgfSB3aGlsZSAoaSA8IGRhdGEubGVuZ3RoKTtcclxuXHJcbiAgICBlbmMgPSB0bXBfYXJyLmpvaW4oJycpO1xyXG5cclxuICAgIHN3aXRjaCAoZGF0YS5sZW5ndGggJSAzKSB7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgICAgICBlbmMgPSBlbmMuc2xpY2UoMCwgLTIpICsgJz09JztcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMSkgKyAnPSc7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGVuYztcclxufVxyXG4gICAgcmV0dXJuIHJlcXVlc3Q7XHJcbi8vVU1EIEZPT1RFUiBTVEFSVFxyXG59KSk7XHJcbi8vVU1EIEZPT1RFUiBFTkRcclxuIiwiZnVuY3Rpb24gRSAoKSB7XHJcbiAgLy8gS2VlcCB0aGlzIGVtcHR5IHNvIGl0J3MgZWFzaWVyIHRvIGluaGVyaXQgZnJvbVxyXG4gIC8vICh2aWEgaHR0cHM6Ly9naXRodWIuY29tL2xpcHNtYWNrIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL3Njb3R0Y29yZ2FuL3RpbnktZW1pdHRlci9pc3N1ZXMvMylcclxufVxyXG5cclxuRS5wcm90b3R5cGUgPSB7XHJcbiAgb246IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaywgY3R4KSB7XHJcbiAgICB2YXIgZSA9IHRoaXMuZSB8fCAodGhpcy5lID0ge30pO1xyXG5cclxuICAgIChlW25hbWVdIHx8IChlW25hbWVdID0gW10pKS5wdXNoKHtcclxuICAgICAgZm46IGNhbGxiYWNrLFxyXG4gICAgICBjdHg6IGN0eFxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfSxcclxuXHJcbiAgb25jZTogZnVuY3Rpb24gKG5hbWUsIGNhbGxiYWNrLCBjdHgpIHtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIGZ1bmN0aW9uIGxpc3RlbmVyICgpIHtcclxuICAgICAgc2VsZi5vZmYobmFtZSwgbGlzdGVuZXIpO1xyXG4gICAgICBjYWxsYmFjay5hcHBseShjdHgsIGFyZ3VtZW50cyk7XHJcbiAgICB9O1xyXG5cclxuICAgIGxpc3RlbmVyLl8gPSBjYWxsYmFja1xyXG4gICAgcmV0dXJuIHRoaXMub24obmFtZSwgbGlzdGVuZXIsIGN0eCk7XHJcbiAgfSxcclxuXHJcbiAgZW1pdDogZnVuY3Rpb24gKG5hbWUpIHtcclxuICAgIHZhciBkYXRhID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xyXG4gICAgdmFyIGV2dEFyciA9ICgodGhpcy5lIHx8ICh0aGlzLmUgPSB7fSkpW25hbWVdIHx8IFtdKS5zbGljZSgpO1xyXG4gICAgdmFyIGkgPSAwO1xyXG4gICAgdmFyIGxlbiA9IGV2dEFyci5sZW5ndGg7XHJcblxyXG4gICAgZm9yIChpOyBpIDwgbGVuOyBpKyspIHtcclxuICAgICAgZXZ0QXJyW2ldLmZuLmFwcGx5KGV2dEFycltpXS5jdHgsIGRhdGEpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0aGlzO1xyXG4gIH0sXHJcblxyXG4gIG9mZjogZnVuY3Rpb24gKG5hbWUsIGNhbGxiYWNrKSB7XHJcbiAgICB2YXIgZSA9IHRoaXMuZSB8fCAodGhpcy5lID0ge30pO1xyXG4gICAgdmFyIGV2dHMgPSBlW25hbWVdO1xyXG4gICAgdmFyIGxpdmVFdmVudHMgPSBbXTtcclxuXHJcbiAgICBpZiAoZXZ0cyAmJiBjYWxsYmFjaykge1xyXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gZXZ0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG4gICAgICAgIGlmIChldnRzW2ldLmZuICE9PSBjYWxsYmFjayAmJiBldnRzW2ldLmZuLl8gIT09IGNhbGxiYWNrKVxyXG4gICAgICAgICAgbGl2ZUV2ZW50cy5wdXNoKGV2dHNbaV0pO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVtb3ZlIGV2ZW50IGZyb20gcXVldWUgdG8gcHJldmVudCBtZW1vcnkgbGVha1xyXG4gICAgLy8gU3VnZ2VzdGVkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS9sYXpkXHJcbiAgICAvLyBSZWY6IGh0dHBzOi8vZ2l0aHViLmNvbS9zY290dGNvcmdhbi90aW55LWVtaXR0ZXIvY29tbWl0L2M2ZWJmYWE5YmM5NzNiMzNkMTEwYTg0YTMwNzc0MmI3Y2Y5NGM5NTMjY29tbWl0Y29tbWVudC01MDI0OTEwXHJcblxyXG4gICAgKGxpdmVFdmVudHMubGVuZ3RoKVxyXG4gICAgICA/IGVbbmFtZV0gPSBsaXZlRXZlbnRzXHJcbiAgICAgIDogZGVsZXRlIGVbbmFtZV07XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbiAgfVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBFO1xyXG5tb2R1bGUuZXhwb3J0cy5UaW55RW1pdHRlciA9IEU7XHJcbiIsImNvbnN0IExvZ2luID0gcmVxdWlyZShcIi4vY29tcG9uZW50cy9sb2dpbi5qc1wiKTtcclxuY29uc3QgQ2FkYXN0cm9BbHVubyA9IHJlcXVpcmUoXCIuL2NvbXBvbmVudHMvY2FkYXN0cm9BbHVuby5qc1wiKTtcclxuXHJcbmNsYXNzIEFwcCB7XHJcbiAgICBjb25zdHJ1Y3Rvcihib2R5KSB7XHJcbiAgICAgICAgdGhpcy5sb2dpbiA9IG5ldyBMb2dpbihib2R5KTtcclxuICAgICAgICB0aGlzLmNhZGFzdHJvQWx1bm8gPSBuZXcgQ2FkYXN0cm9BbHVubyhib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICBpbml0KCkge1xyXG4gICAgICAgIHRoaXMubG9naW4ucmVuZGVyKCk7XHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmxvZ2luRXZlbnRzKCk7XHJcbiAgICAgICAgLy90aGlzLmNhZGFzdHJvQWx1bm9FdmVudHMoKTtcclxuICAgIH1cclxuXHJcbiAgICBsb2dpbkV2ZW50cygpIHtcclxuICAgICAgICB0aGlzLmxvZ2luLm9uKFwiZXJyb3JcIiwgKCkgPT4gYWxlcnQoXCJVc3VhcmlvIG91IHNlbmhhIGluY29ycmV0b3NcIikpO1xyXG4gICAgICAgIHRoaXMubG9naW4ub24oXCJsb2dpblwiLCAoKSA9PiB0aGlzLmNhZGFzdHJvQWx1bm8ucmVuZGVyKCkpO1xyXG4gICAgfVxyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEFwcDsiLCJjb25zdCBUaW55RW1pdHRlciA9IHJlcXVpcmUoXCJ0aW55LWVtaXR0ZXJcIik7XHJcbmNvbnN0IFJlcXVlc3QgPSByZXF1aXJlKFwiYnJvd3Nlci1yZXF1ZXN0XCIpO1xyXG5cclxuY2xhc3MgQWdlbmRhIGV4dGVuZHMgVGlueUVtaXR0ZXIge1xyXG4gICAgY29uc3RydWN0b3IoKXtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMucmVxdWVzdCA9IFJlcXVlc3Q7XHJcbiAgICAgICAgdGhpcy5VUkwgPSBcImh0dHA6Ly9sb2NhbGhvc3Q6MzMzM1wiO1xyXG4gICAgfVxyXG59XHJcbm1vZHVsZS5leHBvcnRzID0gQWdlbmRhOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYVwiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2NhZGFzdHJvQWx1bm9cIik7XHJcblxyXG5jbGFzcyBDYWRhc3Ryb0FsdW5vIGV4dGVuZHMgQWdlbmRhIHtcclxuICAgIGNvbnN0cnVjdG9yKGJvZHkpIHtcclxuICAgICAgICBzdXBlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMuYm9keS5pbm5lckhUTUwgPSBUZW1wbGF0ZS5yZW5kZXIoKTtcclxuICAgIH1cclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBDYWRhc3Ryb0FsdW5vOyIsImNvbnN0IEFnZW5kYSA9IHJlcXVpcmUoXCIuL2FnZW5kYS5qc1wiKTtcclxuY29uc3QgVGVtcGxhdGUgPSByZXF1aXJlKFwiLi4vdGVtcGxhdGVzL2xvZ2luLmpzXCIpO1xyXG5cclxuY2xhc3MgTG9naW4gZXh0ZW5kcyBBZ2VuZGEge1xyXG4gICAgY29uc3RydWN0b3IoYm9keSkge1xyXG4gICAgICAgIHN1cGVyKCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gYm9keTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5ib2R5LmlubmVySFRNTCA9IFRlbXBsYXRlLnJlbmRlcigpO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWVyeVNlbGVjdG9yKFwiW3VzdWFyaW9dXCIpLmZvY3VzKCk7XHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcigpIHtcclxuICAgICAgICB0aGlzLmVudmllRm9ybXVsYXJpbygpO1xyXG4gICAgICAgIHRoaXMuZXNxdWVjZXVTZW5oYSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGVudmllRm9ybXVsYXJpbygpIHtcclxuICAgICAgICBjb25zdCBmb3JtID0gdGhpcy5ib2R5LnF1ZXJ5U2VsZWN0b3IoXCJmb3JtXCIpO1xyXG4gICAgICAgIGZvcm0uYWRkRXZlbnRMaXN0ZW5lcihcInN1Ym1pdFwiLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHVzdWFyaW8gPSBlLnRhcmdldC5xdWVyeVNlbGVjdG9yKFwiW3VzdWFyaW9dXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBzZW5oYSA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoXCJbc2VuaGFdXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBvcHRzID0ge1xyXG4gICAgICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgICAgICAgICAgIHVybDogYCR7dGhpcy5VUkx9YCxcclxuICAgICAgICAgICAgICAgIGpzb246IHRydWUsXHJcbiAgICAgICAgICAgICAgICBib2R5OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdXN1YXJpbzogdXN1YXJpby52YWx1ZSxcclxuICAgICAgICAgICAgICAgICAgICBwYXNzd29yZDogc2VuaGEudmFsdWVcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgdGhpcy5yZXF1ZXN0KG9wdHMsIChlcnIsIHJlc3AsIGRhdGEpID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChlcnIgfHwgcmVzcC5zdGF0dXMgPT09IDQwMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdChcImVycm9yXCIsIGVycik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXQoXCJjYWRhc3Ryb0FsdW5vXCIsIGRhdGEpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBlc3F1ZWNldVNlbmhhKCkge1xyXG4gICAgICAgIC8vY29kaWdvIHByYSBjaGFtYXIgZW0gVVJMXHJcbiAgICB9XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gTG9naW47IiwibW9kdWxlLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBgPGRpdj5cclxuICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXIgXCI+XHJcbiAgICAgICAgPGRpdj5cclxuICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJsb2dpbjEwMC1mb3JtLXRpdGxlIHAtYi00MyBwLTIgbXQtMlwiPlxyXG4gICAgICAgICAgICAgICAgw4FyZWEgQWRtaW5pc3RyYXRpdmFcclxuICAgICAgICAgICAgPC9zcGFuPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcblxyXG4gICAgPGRpdiBjbGFzcz1cImNvbnRhaW5lciBtdC01IGJvcmRlciBib3JkZXItd2hpdGUgYmFjay1ncmlkIHRleHQtd2hpdGVcIj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93XCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgIE5vbWVcclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgIENQRlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgTWF0csOtY3VsYVxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwicm93IGJhY2stZ3JpZHJvdzEgdGV4dC1kYXJrXCI+XHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgIEpvc8OpIGRhIENvc3RhXHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCI+XHJcbiAgICAgICAgICAgICAgICAwMzU5NzQ2ODMyMVxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiPlxyXG4gICAgICAgICAgICAgICAgMTIzNjU4Nzk0NjM1MjFcclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICA8L2Rpdj5cclxuXHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyIGNvbC1zbSBtdC0zXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG5cclxuICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNlbnRlcmVkXCI+XHJcbiAgICAgICAgICAgICAgICA8IS0tIEJvdMOjbyBwYXJhIGNoYW1hciBtb2RhbF9pbmNsdWRlIC0tPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnkgYnRuLWRhcmtcIiBkYXRhLXRvZ2dsZT1cIm1vZGFsXCJcclxuICAgICAgICAgICAgICAgICAgICBkYXRhLXRhcmdldD1cIiNFeGVtcGxvTW9kYWxDZW50cmFsaXphZG9cIj5cclxuICAgICAgICAgICAgICAgICAgICBBZGljaW9uYXJcclxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgPCEtLSBtb2RhbF9pbmNsdWRlIC0tPlxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsIGZhZGVcIiBpZD1cIkV4ZW1wbG9Nb2RhbENlbnRyYWxpemFkb1wiIHRhYmluZGV4PVwiLTFcIiByb2xlPVwiZGlhbG9nXCJcclxuICAgICAgICAgICAgICAgICAgICBhcmlhLWxhYmVsbGVkYnk9XCJUaXR1bG9Nb2RhbENlbnRyYWxpemFkb1wiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1kaWFsb2cgbW9kYWwtZGlhbG9nLWNlbnRlcmVkXCIgcm9sZT1cImRvY3VtZW50XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJtb2RhbC1jb250ZW50XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtaGVhZGVyXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGg1IGNsYXNzPVwibW9kYWwtdGl0bGVcIiBpZD1cIlRpdHVsb01vZGFsQ2VudHJhbGl6YWRvXCI+QWRpY2lvbmFyIE5vdm8gQWx1bm88L2g1PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiY2xvc2VcIiBkYXRhLWRpc21pc3M9XCJtb2RhbFwiIGFyaWEtbGFiZWw9XCJGZWNoYXJcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPHNwYW4gYXJpYS1oaWRkZW49XCJ0cnVlXCI+JnRpbWVzOzwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cIm1vZGFsLWJvZHlcIj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtXCIgaWQ9XCJpbmNsdWRlX25hbWVcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbD5Ob21lIENvbXBsZXRvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFyayBjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJyb3dcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cImNvbC1zbVwiIGlkPVwiaW5jbHVkZV9kYXRlXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWw+RGF0YSBkZSBOYXNjaW1lbnRvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFyayBjb2wtc21cIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb2wtc21cIiBpZD1cImluY2x1ZGVfY3BmXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Zm9ybSBtZXRob2Q9XCJwb3N0XCI+PC9mb3JtPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsPkNQRjwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBpZD1cImNwZlwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9mb3JtPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInJvd1wiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29sLXNtIFwiIGlkPVwiaW5jbHVkZV9hZGRyZXNzXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8Zm9ybT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwiY2VwXCI+Q0VQPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJib3JkZXIgYm9yZGVyLWRhcmtcIiBpZD1cImNlcFwiIHR5cGU9XCJ0ZXh0XCIgcmVxdWlyZWQgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwibG9ncmFkb3Vyb1wiPkxvZ3JhZG91cm88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIGlkPVwibG9ncmFkb3Vyb1wiIHR5cGU9XCJ0ZXh0XCJcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVxdWlyZWQgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwibnVtZXJvXCI+TsO6bWVybzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgaWQ9XCJudW1lcm9cIiB0eXBlPVwidGV4dFwiIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImNvbXBsZW1lbnRvXCI+Q29tcGxlbWVudG88L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dCBjbGFzcz1cImJvcmRlciBib3JkZXItZGFya1wiIGlkPVwiY29tcGxlbWVudG9cIiB0eXBlPVwidGV4dFwiIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImJhaXJyb1wiPkJhaXJybzwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgaWQ9XCJiYWlycm9cIiB0eXBlPVwidGV4dFwiIHJlcXVpcmVkIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cImNpZGFkZVwiPkNpZGFkZTwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiYm9yZGVyIGJvcmRlci1kYXJrXCIgaWQ9XCJjaWRhZGVcIiB0eXBlPVwidGV4dFwiIHJlcXVpcmVkIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cInVmXCI+RXN0YWRvPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c2VsZWN0IGlkPVwidWZcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIkFDXCI+QWNyZTwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiQUxcIj5BbGFnb2FzPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJBUFwiPkFtYXDDoTwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiQU1cIj5BbWF6b25hczwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiQkFcIj5CYWhpYTwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiQ0VcIj5DZWFyw6E8L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIkRGXCI+RGlzdHJpdG8gRmVkZXJhbDwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiRVNcIj5Fc3DDrXJpdG8gU2FudG88L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIkdPXCI+R29pw6FzPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJNQVwiPk1hcmFuaMOjbzwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiTVRcIj5NYXRvIEdyb3Nzbzwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiTVNcIj5NYXRvIEdyb3NzbyBkbyBTdWw8L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIk1HXCI+TWluYXMgR2VyYWlzPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJQQVwiPlBhcsOhPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJQQlwiPlBhcmHDrWJhPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJQUlwiPlBhcmFuw6E8L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIlBFXCI+UGVybmFtYnVjbzwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiUElcIj5QaWF1w608L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIlJKXCI+UmlvIGRlIEphbmVpcm88L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIlJOXCI+UmlvIEdyYW5kZSBkbyBOb3J0ZTwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiUlNcIj5SaW8gR3JhbmRlIGRvIFN1bDwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiUk9cIj5Sb25kw7RuaWE8L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIlJSXCI+Um9yYWltYTwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiU0NcIj5TYW50YSBDYXRhcmluYTwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiU1BcIj5Tw6NvIFBhdWxvPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJTRVwiPlNlcmdpcGU8L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIlRPXCI+VG9jYW50aW5zPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L2Zvcm0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwibW9kYWwtZm9vdGVyXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIGRhdGEtZGlzbWlzcz1cIm1vZGFsXCI+RmVjaGFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIj5TYWx2YXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cImJ1dHRvblwiIGNsYXNzPVwiYnRuIGJ0bi1kYXJrXCI+RWRpdGFyPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XCJidXR0b25cIiBjbGFzcz1cImJ0biBidG4tZGFya1wiPkV4Y2x1aXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG5cclxuXHJcbiAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgPC9kaXY+XHJcbjwvZGl2PmA7XHJcbn0iLCJleHBvcnRzLnJlbmRlciA9ICgpID0+IHtcclxuICAgIHJldHVybiBgIDxkaXYgY2xhc3M9XCJsaW1pdGVyXCI+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyLWxvZ2luMTAwXCI+XHJcbiAgICAgICAgPGRpdiBjbGFzcz1cIndyYXAtbG9naW4xMDAgcC1iLTE2MCBwLXQtNTBcIj5cclxuICAgICAgICAgICAgPG1haW4+PC9tYWluPlxyXG4gICAgICAgICAgICA8Zm9vdGVyPjwvZm9vdGVyPlxyXG4gICAgICAgICAgICA8Zm9ybSBjbGFzcz1cImxvZ2luMTAwLWZvcm1cIj5cclxuICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibG9naW4xMDAtZm9ybS10aXRsZSBwLWItNDNcIj5cclxuICAgICAgICAgICAgICAgICAgICBBY2Vzc28gZGEgQ29udGFcclxuICAgICAgICAgICAgICAgIDwvc3Bhbj5cclxuXHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwid3JhcC1pbnB1dDEwMCByczEgdmFsaWRhdGUtaW5wdXRcIiBkYXRhLXZhbGlkYXRlPVwiQ2FtcG8gb2JyaWdhdMOzcmlvXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPGlucHV0IGNsYXNzPVwiaW5wdXQxMDBcIiB0eXBlPVwidGV4dFwiIHVzdWFyaW8+XHJcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XCJsYWJlbC1pbnB1dDEwMFwiPlVzdcOhcmlvPC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJ3cmFwLWlucHV0MTAwIHJzMiB2YWxpZGF0ZS1pbnB1dFwiIGRhdGEtdmFsaWRhdGU9XCJDYW1wbyBvYnJpZ2F0w7NyaW9cIj5cclxuICAgICAgICAgICAgICAgICAgICA8aW5wdXQgY2xhc3M9XCJpbnB1dDEwMFwiIHR5cGU9XCJwYXNzd29yZFwiIHNlbmhhPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVwibGFiZWwtaW5wdXQxMDBcIj5TZW5oYTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJjb250YWluZXItbG9naW4xMDAtZm9ybS1idG5cIj5cclxuICAgICAgICAgICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwibXQtM1wiIGJvdGFvTG9naW4+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEVudHJhclxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzcz1cInRleHQtY2VudGVyIHctZnVsbCBwLXQtMjNcIj5cclxuICAgICAgICAgICAgICAgICAgICA8YSBocmVmPVwiI1wiIGNsYXNzPVwidHh0MVwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBFc3F1ZWNldSBhIFNlbmhhPyBFbnRyZSBlbSBDb250YXRvIENvbm9zY28uXHJcbiAgICAgICAgICAgICAgICAgICAgPC9hPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvZm9ybT5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIDwvZGl2PlxyXG48L2Rpdj5gXHJcbn0iLCJjb25zdCBBcHAgPSByZXF1aXJlKFwiLi9hcHAuanNcIik7XHJcblxyXG53aW5kb3cub25sb2FkID0gKCkgPT4ge1xyXG4gICAgY29uc3QgbWFpbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCJtYWluXCIpO1xyXG4gICAgbmV3IEFwcChtYWluKS5pbml0KCk7XHJcbn1cclxuXHJcbi8vZnVuw6fDo28gcGFyYSBjb25maXJtYcOnw6NvIGRlIGFnZW5kYW1lbnRvLlxyXG5mdW5jdGlvbiBhY3Rpb25fY29uZmlybSgpIHtcclxuICAgIGxldCBtc2c7XHJcbiAgICBsZXQgbXNnX3RlbGEgPSBjb25maXJtKFwiRGVzZWphIGNvbmZpcm1hciBhIHNlbGXDp8Ojbz9cIik7XHJcbiAgICBpZiAobXNnX3RlbGEgPT0gdHJ1ZSkge1xyXG4gICAgICAgIG1zZyA9IFwiT2JyaWdhZG8gcG9yIHNlbGVjaW9uYXIgb3MgaG9yw6FyaW9zIG5hIHNhbGEgZGUgbXVzY3VsYcOnw6NvIVwiXHJcbiAgICAgICAgYWxlcnQobXNnKTtcclxuICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVwbGFjZShcImZpbGU6Ly8vRDovQmlibGlvdGVjYS9Eb2N1bWVudG9zL0dpdEh1Yi9Qcm9qZXRvLWFnZW5kYS1OT0RFL21lbnUuaHRtbFwiKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xyXG4gICAgfVxyXG5cclxufVxyXG4vLyBmdW7Dp8OjbyBwYXJhIGNhbmNlbGFtZW50b1xyXG5mdW5jdGlvbiBhY3Rpb25fY2FuY2VsKCkge1xyXG5cclxuICAgIGxldCBtc2dfdGVsYSA9IGNvbmZpcm0oXCJEZXNlamEgdm9sdGFyIGEgdGVsYSBkZSBzZWxlw6fDo28gZGUgc2FsYXM/XCIpO1xyXG4gICAgaWYgKG1zZ190ZWxhID09IHRydWUpIHtcclxuICAgICAgICB3aW5kb3cubG9jYXRpb24ucmVwbGFjZShcImZpbGU6Ly8vRDovQmlibGlvdGVjYS9Eb2N1bWVudG9zL0dpdEh1Yi9Qcm9qZXRvLWFnZW5kYS1OT0RFL21lbnUuaHRtbFwiKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpO1xyXG4gICAgfVxyXG5cclxufVxyXG5cclxuLy9mdW7Dp8OjbyBwYXJhIGNoYW1hciB0ZWxhIHNhbGEgZGUgbXVzY3VsYcOnw6NvXHJcblxyXG5mdW5jdGlvbiB0ZWxhX211c2MoKSB7XHJcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IFwiZmlsZTovLy9EOi9CaWJsaW90ZWNhL0RvY3VtZW50b3MvR2l0SHViL1Byb2pldG8tYWdlbmRhLU5PREUvYWdlbmRhX211c2MuaHRtbFwiO1xyXG5cclxufVxyXG5cclxuLy9mdW7Dp8OjbyBwYXJhIGNoYW1hciB0ZWxhIHNhbGEgZGUgbXVsdGlmdW5jaW9uYWxcclxuZnVuY3Rpb24gdGVsYV9tdWx0KCkge1xyXG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhdGlvbi5ocmVmID0gXCJmaWxlOi8vL0Q6L0JpYmxpb3RlY2EvRG9jdW1lbnRvcy9HaXRIdWIvUHJvamV0by1hZ2VuZGEtTk9ERS9hZ2VuZGFfbXVsdC5odG1sXCI7XHJcbn1cclxuXHJcbi8vIFByZWVuY2hpbWVudG8gYXV0b21hdGljbyBlbmRlcmXDp28gcGVsbyBjZXBcclxuXHJcbiQoXCIjY2VwXCIpLmZvY3Vzb3V0KGZ1bmN0aW9uKCkge1xyXG4gICAgLy9BcXVpIHZhaSBvIGPDs2RpZ29cdFxyXG4gICAgJC5hamF4KHtcclxuICAgICAgICAvL08gY2FtcG8gVVJMIGRpeiBvIGNhbWluaG8gZGUgb25kZSB2aXLDoSBvcyBkYWRvc1xyXG4gICAgICAgIC8vw4kgaW1wb3J0YW50ZSBjb25jYXRlbmFyIG8gdmFsb3IgZGlnaXRhZG8gbm8gQ0VQXHJcbiAgICAgICAgdXJsOiAnaHR0cHM6Ly92aWFjZXAuY29tLmJyL3dzLycgKyAkKHRoaXMpLnZhbCgpICsgJy9qc29uL3VuaWNvZGUvJyxcclxuICAgICAgICAvL0FxdWkgdm9jw6ogZGV2ZSBwcmVlbmNoZXIgbyB0aXBvIGRlIGRhZG9zIHF1ZSBzZXLDoSBsaWRvLFxyXG4gICAgICAgIC8vbm8gY2FzbywgZXN0YW1vcyBsZW5kbyBKU09OLlxyXG4gICAgICAgIGRhdGFUeXBlOiAnanNvbicsXHJcbiAgICAgICAgLy9TVUNFU1Mgw6kgcmVmZXJlbnRlIGEgZnVuw6fDo28gcXVlIHNlcsOhIGV4ZWN1dGFkYSBjYXNvXHJcbiAgICAgICAgLy9lbGUgY29uc2lnYSBsZXIgYSBmb250ZSBkZSBkYWRvcyBjb20gc3VjZXNzby5cclxuICAgICAgICAvL08gcGFyw6JtZXRybyBkZW50cm8gZGEgZnVuw6fDo28gc2UgcmVmZXJlIGFvIG5vbWUgZGEgdmFyacOhdmVsXHJcbiAgICAgICAgLy9xdWUgdm9jw6ogdmFpIGRhciBwYXJhIGxlciBlc3NlIG9iamV0by5cclxuICAgICAgICBzdWNjZXNzOiBmdW5jdGlvbihyZXNwb3N0YSkge1xyXG4gICAgICAgICAgICAvL0Fnb3JhIGJhc3RhIGRlZmluaXIgb3MgdmFsb3JlcyBxdWUgdm9jw6ogZGVzZWphIHByZWVuY2hlclxyXG4gICAgICAgICAgICAvL2F1dG9tYXRpY2FtZW50ZSBub3MgY2FtcG9zIGFjaW1hLlxyXG4gICAgICAgICAgICAkKFwiI2xvZ3JhZG91cm9cIikudmFsKHJlc3Bvc3RhLmxvZ3JhZG91cm8pO1xyXG4gICAgICAgICAgICAkKFwiI2NvbXBsZW1lbnRvXCIpLnZhbChyZXNwb3N0YS5jb21wbGVtZW50byk7XHJcbiAgICAgICAgICAgICQoXCIjYmFpcnJvXCIpLnZhbChyZXNwb3N0YS5iYWlycm8pO1xyXG4gICAgICAgICAgICAkKFwiI2NpZGFkZVwiKS52YWwocmVzcG9zdGEubG9jYWxpZGFkZSk7XHJcbiAgICAgICAgICAgICQoXCIjdWZcIikudmFsKHJlc3Bvc3RhLnVmKTtcclxuICAgICAgICAgICAgLy9WYW1vcyBpbmNsdWlyIHBhcmEgcXVlIG8gTsO6bWVybyBzZWphIGZvY2FkbyBhdXRvbWF0aWNhbWVudGVcclxuICAgICAgICAgICAgLy9tZWxob3JhbmRvIGEgZXhwZXJpw6puY2lhIGRvIHVzdcOhcmlvXHJcbiAgICAgICAgICAgICQoXCIjbnVtZXJvXCIpLmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbn0pO1xyXG5cclxuLy8gVmFsaWRhw6fDo28gQ1BGIl19